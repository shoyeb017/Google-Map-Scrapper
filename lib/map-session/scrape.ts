import { randomUUID } from "node:crypto";
import { persistBusinesses, saveJob, audit, applyEnrichment, getJob, getJobPackage, type SearchJobRecord } from "@/lib/store";
import { enrichWebsite } from "@/lib/enrichment/crawler";
import { isPlausiblePhone } from "@/lib/normalization/normalize";
import type { NormalizedBusiness } from "@/lib/providers/types";
import { withWorker, type SnapshotItem } from "@/lib/map-session/manager";

export type ScrapeEmit = (e: Record<string, unknown>) => void;
const noop: ScrapeEmit = () => undefined;

export interface SessionScrapeOptions {
  items: SnapshotItem[];
  query: string;
  limit?: number;
  enrichWebsite?: boolean;
  discoverSocial?: boolean;
  discoverContacts?: boolean;
  // Append into an existing pack instead of creating a new search job.
  appendToJobId?: string;
}

export interface SessionScrapeSummary {
  found: number;
  target: number;
  completed: number;
  failed: number;
  skipped: number;
  emails: number;
  phones: number;
  socials: number;
}

// Detail extraction on a place page (same public fields as the discovery
// provider: phone / address / website / hours / coords — never reviews).
async function extractDetails(mapsUrl: string): Promise<{
  phone: string;
  address: string;
  website: string;
  hours: string[];
  lat: number | null;
  lng: number | null;
}> {
  return withWorker(async (worker) => {
    await worker.goto(mapsUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
    await worker.waitForTimeout(1500);
    const d = (await worker
      .evaluate(() => {
        const pick = (sel: string) =>
          (document.querySelector(sel)?.textContent || "").replace(/\s+/g, " ").trim();
        const phoneRaw =
          pick('button[data-item-id*="phone"]') ||
          (document.querySelector('button[aria-label*="Phone"]')?.getAttribute("aria-label") ?? "");
        const address = pick('button[data-item-id="address"]');
        const webA = document.querySelector('a[data-item-id="authority"]') as HTMLAnchorElement | null;
        const hours = Array.from(document.querySelectorAll(".t39EBf span"))
          .map((e) => (e.textContent || "").trim())
          .filter(Boolean)
          .slice(0, 14);
        return { phoneRaw, address, website: webA?.href ?? "", hours };
      })
      .catch(() => null)) as { phoneRaw: string; address: string; website: string; hours: string[] } | null;

    const finalUrl = worker.url();
    let lat: number | null = null;
    let lng: number | null = null;
    const m = finalUrl.match(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/) ?? finalUrl.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      if (Number.isFinite(a) && Number.isFinite(b)) {
        lat = a;
        lng = b;
      }
    }
    const pm = (d?.phoneRaw ?? "").match(/\+?[\d][\d \t()./-]{5,}\d/);
    const hit = pm?.[0]?.trim() ?? "";
    return {
      phone: isPlausiblePhone(hit) ? hit : "",
      address: d?.address ?? "",
      website: d?.website ?? "",
      hours: d?.hours ?? [],
      lat,
      lng,
    };
  });
}

// Scrape the REAL session result list one by one:
// open each result → extract → enrich → save to Supabase, with progress.
export async function runSessionScrape(
  opts: SessionScrapeOptions,
  emit: ScrapeEmit = noop
): Promise<{ jobId: string; summary: SessionScrapeSummary; businesses: NormalizedBusiness[] & { id?: string }[] }> {
  const targets = opts.items.slice(0, Math.min(Math.max(opts.limit ?? opts.items.length, 1), 200));
  const label = opts.query || "Map session scrape";

  let baseJob: SearchJobRecord;
  if (opts.appendToJobId) {
    const existing = await getJob(opts.appendToJobId);
    if (!existing) throw new Error("Target pack not found — it may have been deleted.");
    baseJob = { ...existing, status: "running", requestedLimit: existing.requestedLimit + targets.length, errorMessage: undefined, updatedAt: new Date().toISOString() };
  } else {
    baseJob = {
      id: randomUUID(),
      keyword: label,
      locationText: label,
      category: "",
      status: "running",
      discoveryProvider: "browser_discovery",
      primaryProvider: "browser_discovery",
      fallbackProvider: "browser_discovery",
      requestedLimit: targets.length,
      totalDiscovered: opts.items.length,
      totalSaved: 0,
      totalDuplicates: 0,
      totalFailed: 0,
      fallbackUsed: false,
      fallbackReason: undefined,
      providerAttempts: [{ provider: "browser_discovery", role: "primary", status: "session-list" }],
      errorMessage: undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
  await saveJob(baseJob);
  await audit("SEARCH_STARTED", { entity: "search_job", entityId: baseJob.id, provider: "map_session" });

  const summary: SessionScrapeSummary = {
    found: opts.items.length,
    target: targets.length,
    completed: 0,
    failed: 0,
    skipped: 0,
    emails: 0,
    phones: 0,
    socials: 0,
  };
  const savedAll: NormalizedBusiness[] & { id?: string }[] = [];
  let dupes = 0;

  const progress = () => ({
    t: "progress",
    found: summary.found,
    target: summary.target,
    completed: summary.completed,
    failed: summary.failed,
    pending: summary.target - summary.completed - summary.failed,
  });

  emit({ t: "stage", message: `Scraping ${targets.length} results from the live session, one by one…` });
  emit(progress());

  for (let i = 0; i < targets.length; i++) {
    const item = targets[i];
    emit({ t: "current", position: item.position, name: item.name, index: i + 1, total: targets.length });
    emit({ t: "start", id: `${item.position}`, name: `#${item.position} ${item.name}`, done: i, total: targets.length });
    try {
      const d = await extractDetails(item.mapsUrl);
      const phones = d.phone ? [d.phone] : item.phone ? [item.phone] : [];
      const biz: NormalizedBusiness = {
        name: item.name,
        primaryCategory: item.category,
        businessTypes: ["establishment"],
        businessStatus: null,
        website: d.website || null,
        phones,
        emails: [],
        formattedAddress: d.address || null,
        city: null,
        district: null,
        state: null,
        country: null,
        countryCode: null,
        postalCode: null,
        latitude: d.lat,
        longitude: d.lng,
        mapsUrl: item.mapsUrl,
        googleMapsUri: item.mapsUrl,
        placeId: null,
        priceLevel: null,
        openingHours: d.hours,
        openNow: item.openNow,
        rating: item.rating,
        reviewsCount: item.reviewsCount,
        sourceProvider: "browser_discovery",
        sourceRecordId: null,
        sourceUrl: item.mapsUrl,
        socialLinks: [],
      };
      const persisted = await persistBusinesses([biz], { id: baseJob.id });
      dupes += persisted.duplicates;
      const saved = persisted.saved[0];
      if (saved) savedAll.push(saved as NormalizedBusiness & { id?: string });

      let emails = 0;
      let phoneCount = phones.length;
      let socials = 0;
      let pages = 0;
      let enrichNote = "enrichment off";
      if (opts.enrichWebsite !== false && saved?.website) {
        emit({ t: "log", tone: "info", message: `Website enrichment: running for ${item.name}…` });
        const e = await enrichWebsite(saved.website, { maxPages: 5, timeoutMs: 12000 });
        const outcome = await applyEnrichment(
          (saved as { id: string }).id,
          {
            emails: e.emails,
            phones: e.phones,
            socials: e.socials,
            title: e.title,
            metaDescription: e.metaDescription,
            summary: e.summary,
            aboutUrl: e.aboutUrl,
            contactUrl: e.contactUrl,
            pagesCrawled: e.pagesCrawled,
          },
          { discoverSocial: opts.discoverSocial, discoverContacts: opts.discoverContacts }
        );
        emails = outcome?.emailsAdded ?? 0;
        phoneCount += outcome?.phonesAdded ?? 0;
        socials = outcome?.socialsAdded ?? 0;
        pages = e.pagesCrawled;
        enrichNote = `enriched (${pages}p)`;
        emit({ t: "log", tone: "ok", message: `Website enrichment: completed · Email discovery: ${emails > 0 ? "completed" : "none found"} · Social discovery: ${socials > 0 ? `${socials} found` : "none found"}` });
      } else if (!saved?.website) {
        emit({ t: "log", tone: "dim", message: "Website not found — enrichment skipped" });
        enrichNote = "no website";
      }
      summary.completed++;
      summary.emails += emails;
      summary.phones += phoneCount > 0 ? 1 : 0;
      summary.socials += socials;
      emit({
        t: "item",
        id: `${item.position}`,
        name: `#${item.position} ${item.name}`,
        status: "completed",
        emails,
        phones: phoneCount,
        socials,
        pagesCrawled: pages,
        reason: enrichNote,
        done: summary.completed + summary.failed,
        total: targets.length,
      });
      emit(progress());
    } catch (err: unknown) {
      summary.failed++;
      const reason = err instanceof Error ? err.message : "scrape failed";
      emit({ t: "item", id: `${item.position}`, name: `#${item.position} ${item.name}`, status: "failed", reason, emails: 0, phones: 0, socials: 0, pagesCrawled: 0, done: summary.completed + summary.failed, total: targets.length });
      emit(progress());
    }
  }

  const status = summary.failed === 0 ? "completed" : summary.completed === 0 ? "failed" : "partial";
  const recounted = (await getJobPackage(baseJob.id)).businesses.length;
  await saveJob({
    ...baseJob,
    status,
    totalDiscovered: baseJob.totalDiscovered + targets.length,
    totalSaved: recounted,
    totalDuplicates: baseJob.totalDuplicates + dupes,
    totalFailed: baseJob.totalFailed + summary.failed,
    updatedAt: new Date().toISOString(),
  });
  await audit("SEARCH_COMPLETED", { entity: "search_job", entityId: baseJob.id, provider: "map_session", result: `${savedAll.length} saved this run (${recounted} in pack)` });
  emit({ t: "stage", message: `Done — ${summary.completed}/${targets.length} scraped, ${summary.failed} failed` });
  emit({ t: "done", jobId: baseJob.id, summary, results: [], businesses: savedAll.slice(0, 100) });
  return { jobId: baseJob.id, summary, businesses: savedAll.slice(0, 100) };
}
