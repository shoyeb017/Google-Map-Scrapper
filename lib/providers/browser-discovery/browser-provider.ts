import type {
  DiscoveryProvider,
  DiscoveryResult,
  NormalizedBusiness,
  ProviderHealth,
  SearchParams,
} from "@/lib/providers/types";
import { ProviderError } from "@/lib/providers/google-places/google-places-provider";
import { geocodeLocation, searchOsmPlaces } from "@/lib/geo";
import { isPlausiblePhone } from "@/lib/normalization/normalize";

// Browser-based discovery.
// Strategy:
//   1. Playwright + Google Maps: scroll the results feed, extract public cards,
//      then visit the top detail pages for phone / website / address / coords.
//   2. Fallback: OpenStreetMap Nominatim (no browser needed, no key needed).
// Only publicly visible business info is extracted. No CAPTCHA/anti-bot bypass,
// no auth bypass. Failures are reported so the orchestrator can fall back.

interface FeedEntry {
  name: string;
  text: string;
  lines: string[];
  all: string;
  mapsUrl: string;
}

// Google may serve Bengali locale on BD IPs despite en locale. This normalizer
// is written with ASCII-only source (code points, no literal non-ASCII chars):
// Bengali digits U+09E6–U+09EF → ASCII, stars U+2605/06 + PUA icons dropped.
function latinize(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x09e6 && code <= 0x09ef) out += String(code - 0x09e6);
    else if (code === 0x2605 || code === 0x2606) continue;
    else if (code >= 0xe000 && code <= 0xf8ff) continue;
    else out += ch;
  }
  return out.replace(/\s+/g, " ").trim();
}

// Bengali open/closed markers as code-point escapes (ASCII-only source):
// খোলা (open) = U+0996 U+09CB U+09B2 U+09BE, বন্ধ (closed) = U+09AC U+09A8 U+09CD U+09A7.
const BN_OPEN = "\u0996\u09cb\u09b2\u09be";
const BN_CLOSED = "\u09ac\u09a8\u09cd\u09a7";
const BN_OPEN_RE = new RegExp(BN_OPEN);
const BN_CLOSED_RE = new RegExp(BN_CLOSED);

interface FeedFacts {
  category: string | null;
  addressHint: string | null;
  openStatus: string | null;
  openNow: boolean | null;
  phone: string | null;
  rating: number | null;
  reviewsCount: number | null;
}

// Parse a Google Maps result card (name, rating, category · address, hours, phone).
// Only the aggregate rating value + count are kept (never review text/reviewers).
export function parseFeedCard(name: string, lines: string[], all = ""): FeedFacts {
  const facts: FeedFacts = { category: null, addressHint: null, openStatus: null, openNow: null, phone: null, rating: null, reviewsCount: null };
  const normName = name.trim().toLowerCase();
  // textContent (includes aria-hidden spans) often holds "5.0...(18)" together
  // while innerText drops hidden nodes — try the combined shape first.
  const combo = latinize(all).match(/(\d\.\d)[^\d(]{0,12}\((\d[\d,]*)\)/);
  if (combo) {
    facts.rating = Number(combo[1]);
    facts.reviewsCount = Number(combo[2].replace(/,/g, ""));
  }
  // Latinize first: Bengali digits → ASCII, icon glyphs stripped. Bengali
  // words are preserved (category/address stay in original language).
  const lat = lines.map((l) => latinize(l)).filter((l) => l.length >= 2);
  for (const l of lat) {
    if (l.length > 40) continue;
    let m = l.match(/^(\d\.\d)\s*\((\d[\d,]*)\)$/);
    if (m) {
      facts.rating = Number(m[1]);
      facts.reviewsCount = Number(m[2].replace(/,/g, ""));
      continue;
    }
    m = l.match(/^(\d\.\d)$/);
    if (m && facts.rating === null) {
      facts.rating = Number(m[1]);
      continue;
    }
    m = l.match(/^\((\d[\d,]*)\)$/);
    if (m && facts.reviewsCount === null) {
      facts.reviewsCount = Number(m[1].replace(/,/g, ""));
      continue;
    }
  }
  const clean = lat
    .filter((l) => l.length <= 300)
    .filter((l) => {
      const low = l.toLowerCase();
      if (low === normName || low === "sponsored") return false;
      if (/★|☆/.test(l)) return false; // star glyphs — never collected
      if (/^no reviews$/i.test(l)) return false;
      if (/^\d+(\.\d+)?\s*\(\d+\)$/.test(l)) return false; // "5.0 (24)" row
      return true;
    });
  for (const l of clean) {
    if (!facts.openStatus && l.length < 120 && (/\b(open|closed|opens|closes|hours)\b/i.test(l) || /খোলা|বন্ধ/.test(l))) {
      // খোলা আছে = open (even "বন্ধ হবে" = closes later → still open now)
      facts.openNow = /খোলা/.test(l) ? true : /বন্ধ/.test(l) ? false : /closed/i.test(l) ? false : /open/i.test(l) ? true : null;
      facts.openStatus = l
        .replace(/\+?[\d][\d \t()./-]{5,}\d/, "")
        .replace(/\s*[·|]\s*[·|]/g, " · ")
        .replace(/\s+/g, " ")
        .trim();
      continue;
    }
    if (!facts.category && l.includes("·")) {
      const [left, ...rest] = l.split("·").map((s) => s.trim());
      if (left && !/^\+?[\d(]/.test(left) && left.length <= 80) {
        facts.category = left;
        const addr = rest.join(" · ").trim();
        if (addr && !facts.addressHint) facts.addressHint = addr.slice(0, 300);
      }
      continue;
    }
  }
  if (!facts.category) {
    const cand = clean.find((l) => !/\d/.test(l) && l.length <= 60 && !/\b(open|closed)\b/i.test(l));
    if (cand) facts.category = cand;
  }
  if (!facts.addressHint) {
    const cand = clean.find((l) => /\d/.test(l) && !/\b(open|closed)\b/i.test(l) && !l.includes("·"));
    if (cand) facts.addressHint = cand.slice(0, 300);
  }
  const joined = clean.join(" | ");
  const m = joined.match(/\+?[\d][\d \t()./-]{5,}\d/);
  if (m && isPlausiblePhone(m[0].trim())) facts.phone = m[0].trim();
  return facts;
}

interface DetailInfo {
  phone: string;
  address: string;
  website: string;
  hours: string[];
  lat: number | null;
  lng: number | null;
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export class BrowserDiscoveryProvider implements DiscoveryProvider {
  id = "browser_discovery";

  private enabled(): boolean {
    return (process.env.BROWSER_DISCOVERY_ENABLED ?? "true").toLowerCase() !== "false";
  }

  async searchBusinesses(params: SearchParams): Promise<DiscoveryResult> {
    const started = Date.now();
    if (!this.enabled()) {
      throw new ProviderError("NOT_CONFIGURED", "Browser discovery is disabled (BROWSER_DISCOVERY_ENABLED=false)");
    }
    const limit = Math.min(params.limit ?? 20, 100);
    const errors: string[] = [];

    // Attempt 1: live Google Maps via Playwright
    try {
      const listings = await this.scrapeGoogleMaps(params, limit);
      if (listings.length > 0) {
        return {
          provider: "browser_discovery",
          businesses: listings,
          totalDiscovered: listings.length,
          truncated: listings.length >= limit,
          durationMs: Date.now() - started,
        };
      }
      errors.push("Google Maps returned no public listings");
    } catch (e: unknown) {
      errors.push(e instanceof Error ? e.message : "Google Maps scrape failed");
    }

    // Attempt 2: OpenStreetMap (reliable, keyless)
    try {
      const osm = await this.searchOpenStreetMap(params, limit);
      if (osm.length > 0) {
        return {
          provider: "browser_discovery",
          businesses: osm,
          totalDiscovered: osm.length,
          truncated: osm.length >= limit,
          durationMs: Date.now() - started,
        };
      }
      errors.push("OpenStreetMap returned no places");
    } catch (e: unknown) {
      errors.push(e instanceof Error ? e.message : "OpenStreetMap search failed");
    }

    throw new ProviderError(
      "PARSING",
      `Browser discovery found nothing. ${errors.join(" | ")}. Tip: install browsers with "npx playwright install chromium" and check network access to google.com.`
    );
  }

  // ---------- Google Maps via Playwright ----------

  private async scrapeGoogleMaps(params: SearchParams, limit: number): Promise<NormalizedBusiness[]> {
    let chromium: typeof import("playwright").chromium;
    try {
      ({ chromium } = await import("playwright"));
    } catch {
      throw new ProviderError("NOT_CONFIGURED", 'Playwright is not installed. Run "npm i -D playwright" then "npx playwright install chromium"');
    }

    const timeoutMs = Number(process.env.BROWSER_TIMEOUT_MS ?? 45000);
    let browser: import("playwright").Browser | null = null;
    try {
      browser = await chromium.launch({
        headless: true,
        args: ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-dev-shm-usage"],
      });
    } catch (e: unknown) {
      throw new ProviderError(
        "NOT_CONFIGURED",
        `BrowserLaunchFailed: ${e instanceof Error ? e.message : e}. Run "npx playwright install chromium".`
      );
    }

    try {
      const ctx = await browser.newContext({
        userAgent: UA,
        locale: "en-US",
        viewport: { width: 1366, height: 900 },
        extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
      });
      const page = await ctx.newPage();
      const query = `${params.keyword}${params.category ? ` ${params.category}` : ""} ${params.locationText}`;
      const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=en`;

      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      } catch (e: unknown) {
        throw new ProviderError("TIMEOUT", `Maps navigation timed out: ${e instanceof Error ? e.message : e}`);
      }

      // Dismiss consent dialogs (Google shows these in some regions)
      for (const pattern of [/^Accept all$/i, /^Reject all$/i, /^Agree$/i, /I agree/i]) {
        try {
          const btn = page.getByRole("button", { name: pattern }).first();
          if (await btn.isVisible({ timeout: 2500 })) {
            await btn.click({ timeout: 3000 }).catch(() => undefined);
            break;
          }
        } catch {
          /* no consent dialog */
        }
      }

      // Wait for the results feed (or at least one result link)
      const feed = page.locator('div[role="feed"]');
      try {
        await feed.first().waitFor({ timeout: 15000 });
      } catch {
        // Single-place view or blocked page: check for any result link
        try {
          await page.locator("a.hfpxzc").first().waitFor({ timeout: 8000 });
        } catch {
          const title = await page.title().catch(() => "");
          if (/consent|sorry|unusual traffic|captcha/i.test(title)) {
            throw new ProviderError("ACCESS_DENIED", `Maps blocked automated access (page: "${title}"). OSM fallback will be tried.`);
          }
          throw new ProviderError("PARSING", `No public result feed found (page: "${title || "unknown"}"). OSM fallback will be tried.`);
        }
      }

      // Scroll the feed to load more results
      let stable = 0;
      let lastCount = 0;
      for (let i = 0; i < 14; i++) {
        const count = await page.locator("a.hfpxzc").count().catch(() => 0);
        if (count >= limit) break;
        if (count === lastCount) {
          stable++;
          if (stable >= 3) break;
        } else {
          stable = 0;
          lastCount = count;
        }
        try {
          await feed.first().evaluate((el: HTMLElement) => el.scrollTo(0, el.scrollHeight));
        } catch {
          await page.mouse.wheel(0, 2000).catch(() => undefined);
        }
        await page.waitForTimeout(1400);
      }

      const entries = (await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll("a.hfpxzc"));
        const seen = new Set<string>();
        const out: FeedEntry[] = [];
        for (const a of links) {
          const anchor = a as HTMLAnchorElement;
          const href = anchor.href;
          if (!href || seen.has(href)) continue;
          seen.add(href);
          const nameEl = anchor.querySelector(".qBF1Pd");
          const name = (
            anchor.getAttribute("aria-label") ||
            nameEl?.textContent ||
            anchor.textContent ||
            ""
          )
            .trim()
            .slice(0, 200);
          if (!name || name.length < 2) continue;
          const article = anchor.closest('div[role="article"]');
          const scope = article ?? anchor.parentElement;
          const rawText = (scope as HTMLElement | null)?.innerText ?? "";
          const fullText = (scope as HTMLElement | null)?.textContent ?? "";
          const lines = rawText
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)
            .slice(0, 14);
          const text = lines.join(" ").slice(0, 1200);
          out.push({ name, text, lines, all: fullText.slice(0, 2000), mapsUrl: href });
        }
        return out;
      }).catch(() => [] as FeedEntry[])) as FeedEntry[];

      if (entries.length === 0) {
        throw new ProviderError("PARSING", "Result feed was empty after scrolling. OSM fallback will be tried.");
      }

      // Visit top detail pages for phone / website / address / coords
      const detailBudget = Math.min(entries.length, 10, limit);
      const details = new Map<string, DetailInfo>();
      for (let i = 0; i < detailBudget; i++) {
        const entry = entries[i];
        try {
          await page.goto(entry.mapsUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
          await page.waitForTimeout(1500);
          const d = (await page.evaluate(() => {
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
          }).catch(() => null)) as { phoneRaw: string; address: string; website: string; hours: string[] } | null;

          const finalUrl = page.url();
          let lat: number | null = null;
          let lng: number | null = null;
          const m1 = finalUrl.match(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/);
          const m2 = finalUrl.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
          const m = m1 ?? m2;
          if (m) {
            lat = Number(m[1]);
            lng = Number(m[2]);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
              lat = null;
              lng = null;
            }
          }
          const phoneMatch = (d?.phoneRaw ?? "").match(/\+?[\d][\d \t()./-]{5,}\d/);
          const phoneHit = phoneMatch?.[0]?.trim() ?? "";
          details.set(entry.mapsUrl, {
            phone: isPlausiblePhone(phoneHit) ? phoneHit : "",
            address: d?.address ?? "",
            website: d?.website ?? "",
            hours: d?.hours ?? [],
            lat,
            lng,
          });
        } catch {
          /* detail visit failed — keep feed-level data */
        }
      }

      await ctx.close().catch(() => undefined);

      const city = params.locationText.split(",")[0]?.trim() || null;
      return entries.slice(0, limit).map((e) => {
        const d = details.get(e.mapsUrl);
        const facts = parseFeedCard(e.name, e.lines ?? [], e.all ?? "");
        const phones = d?.phone
          ? [d.phone]
          : facts.phone
            ? [facts.phone]
            : (() => {
                const m = e.text.match(/\+?[\d][\d \t()./-]{5,}\d/);
                const hit = m?.[0]?.trim() ?? "";
                return isPlausiblePhone(hit) ? [hit] : [];
              })();
        const hours = d && d.hours.length > 0 ? d.hours : facts.openStatus ? [facts.openStatus] : [];
        return {
          name: e.name,
          primaryCategory: facts.category || params.category || params.keyword,
          businessTypes: ["establishment"],
          businessStatus: null,
          website: d?.website || null,
          phones,
          emails: [],
          formattedAddress: d?.address || facts.addressHint || e.text.slice(0, 300) || params.locationText,
          city,
          district: null,
          state: null,
          country: params.country || null,
          countryCode: null,
          postalCode: null,
          latitude: d?.lat ?? params.latitude ?? null,
          longitude: d?.lng ?? params.longitude ?? null,
          mapsUrl: e.mapsUrl,
          googleMapsUri: e.mapsUrl,
          placeId: null,
          priceLevel: null,
          openingHours: hours,
          openNow: facts.openNow,
          rating: facts.rating,
          reviewsCount: facts.reviewsCount,
          sourceProvider: "browser_discovery",
          sourceRecordId: null,
          sourceUrl: e.mapsUrl,
          socialLinks: [],
        } as NormalizedBusiness;
      });
    } finally {
      await browser.close().catch(() => undefined);
    }
  }

  // ---------- OpenStreetMap fallback (no browser needed) ----------

  private async searchOpenStreetMap(params: SearchParams, limit: number): Promise<NormalizedBusiness[]> {
    const query = [params.keyword, params.category, params.locationText].filter(Boolean).join(", ");
    let viewbox: { minLng: number; minLat: number; maxLng: number; maxLat: number } | undefined;
    try {
      const center = await geocodeLocation(params.locationText);
      if (center) {
        const d = 1.2;
        viewbox = {
          minLng: center.lng - d,
          minLat: center.lat - d,
          maxLng: center.lng + d,
          maxLat: center.lat + d,
        };
      }
    } catch {
      /* proceed without viewbox */
    }

    const places = await searchOsmPlaces(query, Math.min(limit, 50), viewbox);
    const city = params.locationText.split(",")[0]?.trim() || null;
    const out: NormalizedBusiness[] = [];
    const seen = new Set<string>();

    for (const p of places) {
      const name = (p.name || p.display_name.split(",")[0] || "").trim();
      if (!name || name.length < 2) continue;
      const key = `${name.toLowerCase()}|${p.lat},${p.lon}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const addr = p.address ?? {};
      const tags = p.extratags ?? {};
      const phones = [tags.phone, tags["contact:phone"]]
        .filter(Boolean)
        .flatMap((v) => String(v).split(";").map((s) => s.trim()).filter(Boolean));
      const emails = [tags.email, tags["contact:email"]]
        .filter(Boolean)
        .flatMap((v) => String(v).split(";").map((s) => s.trim()).filter(Boolean));
      const website = tags.website || tags["contact:website"] || null;
      const mapsUrl = `https://www.openstreetmap.org/${p.osm_type}/${p.osm_id}`;

      out.push({
        name: name.slice(0, 200),
        description: `${p.type} near ${params.locationText} (via OpenStreetMap)`,
        primaryCategory: params.category || params.keyword,
        secondaryCategories: [],
        businessTypes: [`${p.class}:${p.type}`],
        businessStatus: null,
        website,
        phones,
        emails,
        formattedAddress: p.display_name,
        city: addr.city || addr.town || addr.village || addr.suburb || addr.municipality || city,
        district: addr.city_district || addr.suburb || addr.county || null,
        state: addr.state || null,
        country: addr.country || params.country || null,
        countryCode: (addr.country_code || "").toUpperCase() || null,
        postalCode: addr.postcode || null,
        latitude: Number(p.lat),
        longitude: Number(p.lon),
        mapsUrl,
        googleMapsUri: null,
        placeId: null,
        priceLevel: null,
        openingHours: tags.opening_hours ? [tags.opening_hours] : [],
        openNow: null,
        sourceProvider: "browser_discovery",
        sourceRecordId: `osm:${p.osm_type}/${p.osm_id}`,
        sourceUrl: mapsUrl,
        socialLinks: [],
      });
      if (out.length >= limit) break;
    }
    return out;
  }

  async healthCheck(): Promise<ProviderHealth> {
    if (!this.enabled())
      return { provider: "browser_discovery", status: "not_configured", message: "Disabled via BROWSER_DISCOVERY_ENABLED=false" };
    let browserOk = false;
    let browserMsg = "";
    try {
      const { chromium } = await import("playwright");
      const b = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
      await b.close();
      browserOk = true;
    } catch (e: unknown) {
      browserMsg = e instanceof Error ? e.message.split("\n")[0] : "launch failed";
    }
    if (browserOk) return { provider: "browser_discovery", status: "healthy", message: "Chromium ready · OSM fallback available" };
    return {
      provider: "browser_discovery",
      status: "degraded",
      message: `Chromium unavailable (${browserMsg || 'run "npx playwright install chromium"'}). OSM fallback still works.`,
    };
  }
}

