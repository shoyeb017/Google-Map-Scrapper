import { randomUUID } from "node:crypto";
import { orchestrateSearch } from "@/lib/providers/orchestrator";
import { persistBusinesses, saveJob, audit, applyEnrichment, getJobPackage, type SearchJobRecord } from "@/lib/store";
import { enrichWebsite, quickScanWebsite } from "@/lib/enrichment/crawler";

export type PipelineEmit = (e: Record<string, unknown>) => void;
const noop: PipelineEmit = () => undefined;

export interface DiscoveryInput {
  keyword: string;
  category?: string;
  locationText: string;
  latitude?: number;
  longitude?: number;
  radiusMeters?: number;
  country?: string;
  limit?: number;
  discoveryProvider?: "google_places" | "browser_discovery" | "automatic";
  primaryProvider?: string;
  fallbackProvider?: string;
  enrichWebsite?: boolean;
  discoverSocial?: boolean;
  discoverContacts?: boolean;
}

export interface EnrichSummary {
  id: string;
  name: string;
  emails: number;
  phones: number;
  socials: number;
  pagesCrawled: number;
  error?: string;
}

export interface DiscoveryOutput {
  jobId: string;
  backend: "supabase" | "local";
  provider: string;
  primaryProvider: string;
  fallbackUsed: boolean;
  fallbackReason?: string;
  providerAttempts: unknown[];
  totalDiscovered: number;
  totalSaved: number;
  totalDuplicates: number;
  totalFailed: number;
  enrichedCount: number;
  enrichment: EnrichSummary[];
  businesses: Awaited<ReturnType<typeof persistBusinesses>>["saved"];
}

const QUICK_SCAN_CAP = 25;
const QUICK_CONCURRENCY = 6;
const DEEP_CAP = 3;

type SavedBusiness = Awaited<ReturnType<typeof persistBusinesses>>["saved"][number];

export interface EnrichOptions {
  enrichWebsite?: boolean;
  discoverSocial?: boolean;
  discoverContacts?: boolean;
  quickCap?: number;
  deepCap?: number;
}

// Shared enrichment: fast homepage pass (socials/contacts for everything)
// then deep crawl on the top sites. Returns running totals.
export async function enrichDiscovered(
  saved: SavedBusiness[],
  opts: EnrichOptions,
  emit: PipelineEmit = noop
): Promise<{ enrichedCount: number; enrichment: EnrichSummary[] }> {
  let enrichedCount = 0;
  const enrichment: EnrichSummary[] = [];
  if (opts.enrichWebsite === false) return { enrichedCount, enrichment };
  const withSite = saved.filter((b) => b.website);
  if (withSite.length === 0) {
    emit({ t: "log", tone: "dim", message: "No websites discovered — skipping enrichment" });
    return { enrichedCount, enrichment };
  }
  emit({ t: "stage", stage: "enrich", message: `Fast scan: checking homepages of ${Math.min(withSite.length, QUICK_SCAN_CAP)} sites for socials & contacts…` });
  const quickTargets = withSite.slice(0, opts.quickCap ?? QUICK_SCAN_CAP);
  const queue = [...quickTargets];
  const foundSoFar = new Map<string, EnrichSummary>();
  const workers = Array.from({ length: QUICK_CONCURRENCY }, async () => {
    while (queue.length > 0) {
      const b = queue.shift()!;
      try {
        const q = await quickScanWebsite(b.website!, 9000);
        const outcome = await applyEnrichment(
          b.id,
          { emails: q.emails, phones: q.phones, socials: q.socials, title: q.title, metaDescription: null, summary: null, aboutUrl: null, contactUrl: null, pagesCrawled: 1 },
          { discoverSocial: opts.discoverSocial, discoverContacts: opts.discoverContacts }
        );
        const found = (outcome?.emailsAdded ?? 0) + (outcome?.phonesAdded ?? 0) + (outcome?.socialsAdded ?? 0);
        if (found > 0) enrichedCount++;
        if (q.socials.length > 0 || q.emails.length > 0) {
          emit({ t: "log", tone: "ok", message: `${b.name}: ${q.socials.length} socials, ${q.emails.length} emails (homepage)` });
        }
        foundSoFar.set(b.id, {
          id: b.id, name: b.name,
          emails: outcome?.emailsAdded ?? 0, phones: outcome?.phonesAdded ?? 0,
          socials: outcome?.socialsAdded ?? 0, pagesCrawled: 1,
        });
      } catch {
        foundSoFar.set(b.id, { id: b.id, name: b.name, emails: 0, phones: 0, socials: 0, pagesCrawled: 0, error: "homepage unreachable" });
      }
    }
  });
  await Promise.all(workers);
  for (const s of foundSoFar.values()) enrichment.push(s);

  const deepTargets = withSite.slice(0, opts.deepCap ?? DEEP_CAP);
  if (deepTargets.length > 0) {
    emit({ t: "stage", stage: "deep", message: `Deep crawl: contact/about pages of top ${deepTargets.length} sites…` });
    const dq = [...deepTargets];
    const dworkers = Array.from({ length: 2 }, async () => {
      while (dq.length > 0) {
        const b = dq.shift()!;
        try {
          const e = await enrichWebsite(b.website!, { maxPages: 4, timeoutMs: 12000 });
          const outcome = await applyEnrichment(
            b.id,
            { emails: e.emails, phones: e.phones, socials: e.socials, title: e.title, metaDescription: e.metaDescription, summary: e.summary, aboutUrl: e.aboutUrl, contactUrl: e.contactUrl, pagesCrawled: e.pagesCrawled },
            { discoverSocial: opts.discoverSocial, discoverContacts: opts.discoverContacts }
          );
          const prev = enrichment.find((x) => x.id === b.id);
          const extra = (outcome?.emailsAdded ?? 0) + (outcome?.phonesAdded ?? 0) + (outcome?.socialsAdded ?? 0);
          if (extra > 0) enrichedCount++;
          emit({ t: "log", tone: extra > 0 ? "ok" : "dim", message: `${b.name}: deep crawl ${e.pagesCrawled} pages, +${extra} new contacts/socials` });
          if (prev) {
            prev.emails += outcome?.emailsAdded ?? 0;
            prev.phones += outcome?.phonesAdded ?? 0;
            prev.socials += outcome?.socialsAdded ?? 0;
            prev.pagesCrawled = Math.max(prev.pagesCrawled, e.pagesCrawled);
            if (e.pagesCrawled === 0 && !prev.error) prev.error = e.errors[0];
          }
        } catch {
          emit({ t: "log", tone: "warn", message: `${b.name}: deep crawl failed` });
        }
      }
    });
    await Promise.all(dworkers);
  }
  return { enrichedCount, enrichment };
}

export async function runDiscovery(input: DiscoveryInput, emit: PipelineEmit = noop): Promise<DiscoveryOutput> {
  const jobId = randomUUID();
  const baseJob: SearchJobRecord = {
    id: jobId,
    keyword: input.keyword,
    locationText: input.locationText,
    category: input.category ?? "",
    latitude: input.latitude,
    longitude: input.longitude,
    radiusMeters: input.radiusMeters,
    country: input.country,
    status: "running",
    discoveryProvider: input.discoveryProvider ?? "automatic",
    primaryProvider: input.primaryProvider ?? "google_places",
    fallbackProvider: input.fallbackProvider ?? "browser_discovery",
    requestedLimit: input.limit ?? 100,
    enrichWebsite: input.enrichWebsite,
    discoverSocial: input.discoverSocial,
    discoverContacts: input.discoverContacts,
    totalDiscovered: 0,
    totalSaved: 0,
    totalDuplicates: 0,
    totalFailed: 0,
    fallbackUsed: false,
    fallbackReason: undefined,
    providerAttempts: [],
    errorMessage: undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await saveJob(baseJob);
  await audit("SEARCH_STARTED", { entity: "search_job", entityId: jobId, provider: baseJob.discoveryProvider });

  try {
    emit({ t: "stage", stage: "discover", message: `Discovering “${input.keyword}” in ${input.locationText} via ${baseJob.discoveryProvider}…` });
    const result = await orchestrateSearch(
      {
        keyword: input.keyword,
        category: input.category || undefined,
        locationText: input.locationText,
        latitude: input.latitude,
        longitude: input.longitude,
        radiusMeters: input.radiusMeters,
        country: input.country || undefined,
        limit: input.limit,
      },
      { mode: baseJob.discoveryProvider as "google_places" | "browser_discovery" | "automatic", primary: baseJob.primaryProvider, fallback: baseJob.fallbackProvider }
    );
    for (const a of result.providerAttempts) {
      const at = a as { provider: string; status: string; resultsCount?: number; errorMessage?: string };
      emit({
        t: "log",
        tone: at.status === "success" ? "ok" : "warn",
        message: at.status === "success"
          ? `${at.provider} returned ${at.resultsCount ?? 0} businesses`
          : `${at.provider} failed — ${at.errorMessage ?? "unknown error"}`,
      });
    }
    if (result.fallbackUsed) {
      emit({ t: "log", tone: "warn", message: `Fallback engaged: ${result.fallbackReason}` });
    }

    emit({ t: "stage", stage: "save", message: `Saving ${result.businesses.length} businesses (dedup + normalize)…` });
    const persisted = await persistBusinesses(result.businesses, { id: jobId });
    for (const b of persisted.saved.slice(0, 8)) {
      emit({ t: "found", name: b.name, hasWebsite: Boolean(b.website) });
    }
    if (persisted.saved.length > 8) {
      emit({ t: "log", tone: "dim", message: `…and ${persisted.saved.length - 8} more saved (${persisted.duplicates} duplicates merged)` });
    } else {
      emit({ t: "log", tone: "dim", message: `${persisted.duplicates} duplicates merged` });
    }

    // Enrichment — fast homepage pass for socials on everything, deep crawl on top sites.
    const { enrichedCount, enrichment } = await enrichDiscovered(
      persisted.saved,
      { enrichWebsite: input.enrichWebsite, discoverSocial: input.discoverSocial, discoverContacts: input.discoverContacts },
      emit
    );

    const doneJob: SearchJobRecord = {
      ...baseJob,
      status: "completed",
      totalDiscovered: result.totalDiscovered,
      totalSaved: persisted.saved.length,
      totalDuplicates: persisted.duplicates,
      totalFailed: persisted.failed,
      fallbackUsed: result.fallbackUsed,
      fallbackReason: result.fallbackReason,
      providerAttempts: result.providerAttempts,
      updatedAt: new Date().toISOString(),
    };
    await saveJob(doneJob);
    await audit("SEARCH_COMPLETED", { entity: "search_job", entityId: jobId, provider: result.provider, result: `${persisted.saved.length} saved` });
    if (result.fallbackUsed) {
      await audit("FALLBACK_TRIGGERED", { entity: "search_job", entityId: jobId, provider: result.provider, result: result.fallbackReason });
    }

    emit({ t: "stage", stage: "done", message: `Done — ${persisted.saved.length} leads saved, ${enrichedCount} enriched` });
    return {
      jobId,
      backend: persisted.backend,
      provider: result.provider,
      primaryProvider: result.primaryProvider,
      fallbackUsed: result.fallbackUsed,
      fallbackReason: result.fallbackReason,
      providerAttempts: result.providerAttempts,
      totalDiscovered: result.totalDiscovered,
      totalSaved: persisted.saved.length,
      totalDuplicates: persisted.duplicates,
      totalFailed: persisted.failed,
      enrichedCount,
      enrichment,
      businesses: persisted.saved.slice(0, 100),
    };
  } catch (e: unknown) {
    const err = e as { message?: string; code?: string; attempts?: unknown[] };
    const message = err.message ?? "search failed";
    await saveJob({ ...baseJob, status: "failed", errorMessage: message, providerAttempts: (err.attempts as unknown[]) ?? [], updatedAt: new Date().toISOString() });
    await audit("SEARCH_FAILED", { entity: "search_job", entityId: jobId, error: message });
    emit({ t: "error", message, code: err.code });
    throw Object.assign(new Error(message), { code: err.code, attempts: (err.attempts as unknown[]) ?? [], jobId });
  }
}

// Packs scraped from a live map session have no resumable discovery params —
// they grow by appending fresh session results instead (see map-session scrape).
export function isSessionPack(job: SearchJobRecord): boolean {
  return (job.providerAttempts ?? []).some(
    (a) => (a as { provider?: string; status?: string })?.provider === "browser_discovery" &&
      (a as { status?: string })?.status === "session-list"
  );
}

export interface ContinueOutput {
  jobId: string;
  added: number;
  totalSaved: number;
  totalDuplicates: number;
  enrichedCount: number;
  provider: string;
  fallbackUsed: boolean;
  fallbackReason?: string;
  providerAttempts: unknown[];
  enrichment: EnrichSummary[];
}

// "Find more": re-run the pack's own discovery deeper, keep only businesses
// not already in the pack (dedupe), enrich the new ones, update the pack.
export async function continueDiscovery(
  jobId: string,
  additional: number,
  opts?: { enrichWebsite?: boolean },
  emit: PipelineEmit = noop
): Promise<ContinueOutput> {
  const pkg = await getJobPackage(jobId);
  const job = pkg.job;
  if (!job) throw Object.assign(new Error("Pack not found"), { code: "NOT_FOUND", jobId });
  if (isSessionPack(job)) {
    throw Object.assign(
      new Error("This pack came from a live map session — grow it from Map Scraper with the session list."),
      { code: "SESSION_PACK", jobId }
    );
  }
  const n = Math.min(Math.max(Math.round(additional), 1), 200);
  const existingIds = new Set(pkg.businesses.map((b) => b.id));
  const newLimit = Math.min((job.totalSaved || pkg.businesses.length) + n, 500);

  await saveJob({ ...job, status: "running", updatedAt: new Date().toISOString() });
  await audit("SEARCH_EXTENDED", { entity: "search_job", entityId: jobId, result: `finding ${n} more (limit ${newLimit})` });

  try {
    emit({ t: "stage", stage: "discover", message: `Finding ${n} more “${job.keyword}” in ${job.locationText} (limit ${newLimit})…` });
    const mode = (["google_places", "browser_discovery", "automatic"] as const).includes(job.discoveryProvider as "automatic")
      ? (job.discoveryProvider as "google_places" | "browser_discovery" | "automatic")
      : "automatic";
    const result = await orchestrateSearch(
      {
        keyword: job.keyword,
        category: job.category || undefined,
        locationText: job.locationText,
        latitude: job.latitude,
        longitude: job.longitude,
        radiusMeters: job.radiusMeters ?? 10000,
        country: job.country || undefined,
        limit: newLimit,
      },
      { mode, primary: job.primaryProvider || "google_places", fallback: job.fallbackProvider || "browser_discovery" }
    );
    for (const a of result.providerAttempts) {
      const at = a as { provider: string; status: string; resultsCount?: number; errorMessage?: string };
      emit({
        t: "log",
        tone: at.status === "success" ? "ok" : "warn",
        message: at.status === "success"
          ? `${at.provider} returned ${at.resultsCount ?? 0} businesses`
          : `${at.provider} failed — ${at.errorMessage ?? "unknown error"}`,
      });
    }

    emit({ t: "stage", stage: "save", message: "Merging — keeping only leads not already in this pack…" });
    const persisted = await persistBusinesses(result.businesses, { id: jobId });
    const fresh = persisted.saved.filter((b) => !existingIds.has(b.id));
    for (const b of fresh.slice(0, 8)) {
      emit({ t: "found", name: b.name, hasWebsite: Boolean(b.website) });
    }
    emit({ t: "log", tone: fresh.length > 0 ? "ok" : "warn", message: `${fresh.length} new leads (${persisted.duplicates} already in pack)` });

    const { enrichedCount, enrichment } = await enrichDiscovered(
      fresh,
      {
        enrichWebsite: opts?.enrichWebsite ?? job.enrichWebsite,
        discoverSocial: job.discoverSocial,
        discoverContacts: job.discoverContacts,
      },
      emit
    );

    const recounted = (await getJobPackage(jobId)).businesses.length;
    await saveJob({
      ...job,
      status: "completed",
      requestedLimit: newLimit,
      totalDiscovered: job.totalDiscovered + result.totalDiscovered,
      totalSaved: recounted,
      totalDuplicates: job.totalDuplicates + persisted.duplicates,
      totalFailed: job.totalFailed + persisted.failed,
      fallbackUsed: job.fallbackUsed || result.fallbackUsed,
      fallbackReason: result.fallbackReason ?? job.fallbackReason,
      providerAttempts: [...(job.providerAttempts ?? []), ...result.providerAttempts],
      errorMessage: undefined,
      updatedAt: new Date().toISOString(),
    });
    await audit("SEARCH_EXTENDED", { entity: "search_job", entityId: jobId, result: `+${fresh.length} leads (now ${recounted})` });

    emit({ t: "stage", stage: "done", message: `Done — +${fresh.length} new leads, pack now holds ${recounted}` });
    return {
      jobId,
      added: fresh.length,
      totalSaved: recounted,
      totalDuplicates: persisted.duplicates,
      enrichedCount,
      provider: result.provider,
      fallbackUsed: result.fallbackUsed,
      fallbackReason: result.fallbackReason,
      providerAttempts: result.providerAttempts,
      enrichment,
    };
  } catch (e: unknown) {
    const err = e as { message?: string; code?: string; attempts?: unknown[] };
    const message = err.message ?? "find more failed";
    await saveJob({ ...job, status: "failed", errorMessage: message, updatedAt: new Date().toISOString() });
    await audit("SEARCH_FAILED", { entity: "search_job", entityId: jobId, error: message });
    emit({ t: "error", message, code: err.code });
    throw Object.assign(new Error(message), { code: err.code, attempts: (err.attempts as unknown[]) ?? [], jobId });
  }
}
