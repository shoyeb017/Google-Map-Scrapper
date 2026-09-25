import * as cheerio from "cheerio";
import { assertUrlSafe } from "@/lib/security/ssrf";
import {
  extractContactsFromHtml,
  extractFromMarkdown,
  extractJsonLdSocials,
  extractSocials,
  absoluteHrefs,
  relMeHrefs,
} from "@/lib/contacts/extractor";
import { detectSocialPlatform } from "@/lib/social/detector";
import {
  fetchResilient,
  fetchRendered,
  fetchViaReader,
  robotsAllows,
  type CookieJar,
} from "@/lib/enrichment/fetch";

const PRIORITY_PATHS = ["about", "contact", "services", "products", "team", "careers", "support", "pricing", "blog", "faq"];
const COMMON_PATHS: { path: string; type: string }[] = [
  { path: "/contact", type: "contact" },
  { path: "/contact-us", type: "contact" },
  { path: "/about", type: "about" },
  { path: "/about-us", type: "about" },
  { path: "/support", type: "support" },
];

export interface PageStat {
  url: string;
  status: "ok" | "failed" | "skipped" | "rendered" | "reader";
  ms: number;
  note?: string;
}

export interface EnrichmentResult {
  title: string | null;
  metaDescription: string | null;
  summary: string | null;
  emails: { value: string; category: string; pageUrl: string }[];
  phones: { value: string; pageUrl: string }[];
  socials: { platform: string; url: string; pageUrl: string }[];
  pagesCrawled: number;
  aboutUrl?: string | null;
  contactUrl?: string | null;
  rendered: boolean;
  errors: string[];
  pageStats: PageStat[];
}

function concurrency(): number {
  const n = Number(process.env.ENRICHMENT_CONCURRENCY ?? 3);
  return Math.min(Math.max(Number.isFinite(n) ? n : 3, 1), 6);
}

function politenessMs(): number {
  const n = Number(process.env.ENRICHMENT_POLITENESS_MS ?? 400);
  return Math.min(Math.max(Number.isFinite(n) ? n : 400, 0), 5000);
}

const lastHit = new Map<string, number>();
async function politeDelay(host: string): Promise<void> {
  const wait = politenessMs();
  if (wait <= 0) return;
  const last = lastHit.get(host) ?? 0;
  const dt = Date.now() - last;
  if (dt < wait) await new Promise((r) => setTimeout(r, wait - dt));
  lastHit.set(host, Date.now());
}

function candidateUrls(raw: string): string[] {
  const out: string[] = [];
  const push = (u: string) => {
    if (!out.includes(u)) out.push(u);
  };
  let s = raw.trim();
  if (!s) return out;
  if (!/^https?:\/\//i.test(s)) {
    push(`https://${s}`);
    push(`http://${s}`);
    return out;
  }
  push(s);
  try {
    const u = new URL(s);
    const alt = new URL(s);
    alt.protocol = u.protocol === "https:" ? "http:" : "https:";
    push(alt.toString());
    if (!u.hostname.startsWith("www.")) {
      const www = new URL(s);
      www.hostname = `www.${u.hostname}`;
      push(www.toString());
    }
  } catch {
    /* ignore */
  }
  return out.slice(0, 3);
}

interface FetchedPage {
  html?: string;
  markdown?: string;
  finalUrl: string;
  rendered: boolean;
  viaReader: boolean;
}

// One URL, full fallback chain: resilient static → rendered browser →
// remote reader. Throws with a classified message when all fail.
async function fetchPageOnce(
  url: string,
  timeoutMs: number,
  jar: CookieJar,
  opts?: { referer?: string; allowReader?: boolean }
): Promise<FetchedPage> {
  let lastError = "";
  try {
    const host = new URL(url).hostname;
    await politeDelay(host);
    const r = await fetchResilient(url, { timeoutMs, referer: opts?.referer, jar });
    return { html: r.html, finalUrl: r.finalUrl, rendered: false, viaReader: false };
  } catch (e: unknown) {
    lastError = e instanceof Error ? e.message : "fetch failed";
    // Don't burn fallbacks on definitive answers
    if (/robots\.txt|not found|auth required|Blocked URL|non-HTML|too large/i.test(lastError)) {
      throw new Error(lastError);
    }
  }
  try {
    const r = await fetchRendered(url, Math.min(timeoutMs + 10000, 30000));
    if (r) return { html: r.html, finalUrl: r.finalUrl, rendered: true, viaReader: false };
    lastError = `${lastError}; rendered empty`;
  } catch (e: unknown) {
    lastError = `${lastError}; rendered failed`;
  }
  if (opts?.allowReader !== false) {
    const r = await fetchViaReader(url, timeoutMs);
    if (r) return { markdown: r.markdown, finalUrl: r.finalUrl, rendered: false, viaReader: true };
    lastError = `${lastError}; reader empty`;
  }
  throw new Error(lastError || "all fetch strategies failed");
}

async function fetchHomepage(
  website: string,
  timeoutMs: number,
  jar: CookieJar,
  errors: string[]
): Promise<FetchedPage | null> {
  const candidates = candidateUrls(website);
  let lastError = "";
  for (const c of candidates) {
    try {
      return await fetchPageOnce(c, timeoutMs, jar);
    } catch (e: unknown) {
      lastError = e instanceof Error ? e.message : "fetch failed";
    }
  }
  errors.push(`Homepage unreachable: ${lastError || "all variants failed"}`);
  return null;
}

function extractSummary($: cheerio.CheerioAPI): string | null {
  const og = $('meta[property="og:description"]').attr("content")?.trim();
  if (og && og.length > 40) return og.slice(0, 600);
  const h1 = $("h1").first().text().replace(/\s+/g, " ").trim();
  const p = $("main p, article p, .content p, p")
    .toArray()
    .map((el) => $(el).text().replace(/\s+/g, " ").trim())
    .find((t) => t.length > 60);
  const combined = [h1, p].filter(Boolean).join(" — ").slice(0, 600);
  return combined || null;
}

async function runPool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const queue = [...items];
  const out: R[] = [];
  const workers = Array.from({ length: Math.max(1, Math.min(size, items.length)) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift()!;
      out.push(await fn(item));
    }
  });
  await Promise.all(workers);
  return out;
}

// Sitemap.xml discovery for contact/about-style pages (same host only).
async function discoverSitemapUrls(base: URL, jar: CookieJar, cap: number): Promise<{ url: string; type: string }[]> {
  const found: { url: string; type: string }[] = [];
  const seen = new Set<string>();
  const push = (u: string) => {
    try {
      const norm = new URL(u);
      norm.hash = "";
      if (norm.hostname !== base.hostname) return;
      const key = norm.toString();
      if (seen.has(key)) return;
      seen.add(key);
      const p = norm.pathname.toLowerCase();
      for (const want of PRIORITY_PATHS) {
        if (p.includes(want)) {
          found.push({ url: key, type: want });
          break;
        }
      }
    } catch {
      /* ignore */
    }
  };
  try {
    if (!(await robotsAllows(`https://${base.hostname}/sitemap.xml`))) return found;
    const r = await fetchResilient(`https://${base.hostname}/sitemap.xml`, { timeoutMs: 10000, jar, checkRobots: false });
    const $ = cheerio.load(r.html, { xmlMode: true });
    const locs = $("loc")
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(Boolean)
      .slice(0, 60);
    // nested sitemap indexes (one level)
    const nested = locs.filter((l) => l.toLowerCase().endsWith(".xml")).slice(0, 2);
    for (const n of nested) {
      try {
        const nr = await fetchResilient(n, { timeoutMs: 10000, jar, checkRobots: false });
        const $$ = cheerio.load(nr.html, { xmlMode: true });
        $$("loc")
          .map((_, el) => $$(el).text().trim())
          .get()
          .filter(Boolean)
          .slice(0, 60)
          .forEach((l) => locs.push(l));
      } catch {
        /* ignore nested failures */
      }
    }
    for (const l of locs) {
      if (l.toLowerCase().endsWith(".xml")) continue;
      push(l);
      if (found.length >= cap) break;
    }
  } catch {
    /* no sitemap — navigation links + common paths still apply */
  }
  return found;
}

export interface QuickScan {
  title: string | null;
  emails: { value: string; category: string; pageUrl: string }[];
  phones: { value: string; pageUrl: string }[];
  socials: { platform: string; url: string; pageUrl: string }[];
}

// Fast homepage-only pass: grabs the social links, emails and phones most
// sites expose in their header/footer without crawling subpages.
export async function quickScanWebsite(website: string, timeoutMs = 9000): Promise<QuickScan> {
  const empty: QuickScan = { title: null, emails: [], phones: [], socials: [] };
  const jar: CookieJar = new Map();
  const home = await fetchHomepage(website, timeoutMs, jar, []);
  if (!home) return empty;
  if (home.markdown) {
    const { contacts, hrefs } = extractFromMarkdown(home.markdown, home.finalUrl);
    return {
      title: null,
      emails: contacts.filter((c) => c.type === "email").map((c) => ({ value: c.value, category: c.category, pageUrl: home.finalUrl })).slice(0, 10),
      phones: contacts.filter((c) => c.type === "phone").map((c) => ({ value: c.value, pageUrl: home.finalUrl })).slice(0, 10),
      socials: extractSocials(hrefs).map((s) => ({ ...s, pageUrl: home.finalUrl })).slice(0, 20),
    };
  }
  const html = home.html ?? "";
  const $ = cheerio.load(html);
  const title = $("title").first().text().trim().slice(0, 300) || null;
  const contacts = extractContactsFromHtml(html, home.finalUrl);
  const emails = new Map<string, { value: string; category: string; pageUrl: string }>();
  const phones = new Map<string, { value: string; pageUrl: string }>();
  for (const k of contacts) {
    if (k.type === "email" && k.normalized && !emails.has(k.normalized)) {
      emails.set(k.normalized, { value: k.value, category: k.category, pageUrl: home.finalUrl });
    }
    if (k.type === "phone" && k.normalized && !phones.has(k.normalized)) {
      phones.set(k.normalized, { value: k.value, pageUrl: home.finalUrl });
    }
  }
  const socials = new Map<string, { platform: string; url: string; pageUrl: string }>();
  const mergeSocialHref = (h: string) => {
    const d = detectSocialPlatform(h);
    if (d && !socials.has(`${d.platform}|${d.profileUrl}`)) {
      socials.set(`${d.platform}|${d.profileUrl}`, { platform: d.platform, url: d.profileUrl, pageUrl: home.finalUrl });
    }
  };
  for (const h of [...absoluteHrefs($, home.finalUrl), ...relMeHrefs($, home.finalUrl)]) mergeSocialHref(h);
  for (const h of extractJsonLdSocials(html)) mergeSocialHref(h);
  return {
    title,
    emails: Array.from(emails.values()).slice(0, 10),
    phones: Array.from(phones.values()).slice(0, 10),
    socials: Array.from(socials.values()).slice(0, 20),
  };
}

export async function enrichWebsite(website: string, opts?: { maxPages?: number; timeoutMs?: number }): Promise<EnrichmentResult> {
  const maxPages = Math.min(opts?.maxPages ?? Number(process.env.ENRICHMENT_MAX_PAGES ?? 8), 20);
  const timeoutMs = opts?.timeoutMs ?? Number(process.env.ENRICHMENT_TIMEOUT_MS ?? 15000);
  const errors: string[] = [];
  const pageStats: PageStat[] = [];
  const jar: CookieJar = new Map();
  const blank: EnrichmentResult = {
    title: null, metaDescription: null, summary: null,
    emails: [], phones: [], socials: [], pagesCrawled: 0,
    rendered: false, errors, pageStats,
  };

  const t0 = Date.now();
  const home = await fetchHomepage(website, timeoutMs, jar, errors);
  if (!home) return blank;
  pageStats.push({
    url: home.finalUrl,
    status: home.viaReader ? "reader" : home.rendered ? "rendered" : "ok",
    ms: Date.now() - t0,
  });

  // Remote-reader path: no DOM — extract from markdown only.
  if (home.markdown) {
    const { contacts, hrefs } = extractFromMarkdown(home.markdown, home.finalUrl);
    return {
      ...blank,
      emails: contacts.filter((c) => c.type === "email").map((c) => ({ value: c.value, category: c.category, pageUrl: home.finalUrl })),
      phones: contacts.filter((c) => c.type === "phone").map((c) => ({ value: c.value, pageUrl: home.finalUrl })),
      socials: extractSocials(hrefs).map((s) => ({ ...s, pageUrl: home.finalUrl })),
      pagesCrawled: 1,
    };
  }

  const html = home.html ?? "";
  const $ = cheerio.load(html);
  const title = $("title").first().text().trim().slice(0, 300) || null;
  const metaDescription =
    ($('meta[name="description"]').attr("content") || "").trim().slice(0, 500) || null;
  const summary = extractSummary($);

  const hrefs = $("a[href]")
    .map((_, el) => $(el).attr("href") ?? "")
    .get();
  let base: URL;
  try {
    base = new URL(home.finalUrl);
  } catch {
    errors.push("Invalid final URL after redirects");
    return { ...blank, title, metaDescription, summary, rendered: home.rendered };
  }

  // Candidate internal pages: nav links + sitemap + common paths.
  const candidates: { url: string; type: string }[] = [];
  const seenCand = new Set<string>();
  const consider = (abs: string) => {
    try {
      const u = new URL(abs);
      if (u.hostname !== base.hostname) return;
      u.hash = "";
      const norm = u.toString();
      if (seenCand.has(norm)) return;
      const p = u.pathname.toLowerCase();
      for (const want of PRIORITY_PATHS) {
        if (p.includes(want)) {
          seenCand.add(norm);
          candidates.push({ url: norm, type: want });
          break;
        }
      }
    } catch {
      /* ignore */
    }
  };
  for (const h of hrefs) {
    try {
      consider(new URL(h, base).toString());
    } catch {
      continue;
    }
    if (candidates.length >= maxPages * 2) break;
  }
  for (const s of await discoverSitemapUrls(base, jar, maxPages * 2)) {
    consider(s.url);
    if (candidates.length >= maxPages * 2) break;
  }
  const rank = (t: string) => (t === "contact" ? 0 : t === "about" ? 1 : 2);
  candidates.sort((a, b) => rank(a.type) - rank(b.type));
  const toCrawl = [{ url: home.finalUrl, type: "home" }, ...candidates.slice(0, maxPages - 1)];
  // Common-path probing when navigation yields no contact/about page.
  const hasContact = toCrawl.some((c) => c.type === "contact");
  const hasAbout = toCrawl.some((c) => c.type === "about");
  if (toCrawl.length < maxPages) {
    for (const cp of COMMON_PATHS) {
      if (toCrawl.length >= maxPages) break;
      if (cp.type === "contact" && hasContact) continue;
      if (cp.type === "about" && hasAbout) continue;
      const abs = new URL(cp.path, base).toString();
      if (!seenCand.has(abs)) {
        seenCand.add(abs);
        toCrawl.push({ url: abs, type: `${cp.type} (probe)` });
      }
    }
  }

  const emails = new Map<string, { value: string; category: string; pageUrl: string }>();
  const phones = new Map<string, { value: string; pageUrl: string }>();
  const socials = new Map<string, { platform: string; url: string; pageUrl: string }>();
  let aboutUrl: string | null = null;
  let contactUrl: string | null = null;

  const seen = new Set<string>();
  let pagesCrawled = 0;

  const absorb = (
    fetched: { html?: string; markdown?: string; finalUrl: string },
    type: string
  ) => {
    pagesCrawled++;
    if (type === "about") aboutUrl = fetched.finalUrl;
    if (type === "contact" || type === "contact (probe)") contactUrl = fetched.finalUrl;
    if (fetched.markdown) {
      const { contacts, hrefs: mdHrefs } = extractFromMarkdown(fetched.markdown, fetched.finalUrl);
      for (const k of contacts) {
        if (k.type === "email" && k.normalized && !emails.has(k.normalized)) {
          emails.set(k.normalized, { value: k.value, category: k.category, pageUrl: fetched.finalUrl });
        }
        if (k.type === "phone" && k.normalized && !phones.has(k.normalized)) {
          phones.set(k.normalized, { value: k.value, pageUrl: fetched.finalUrl });
        }
      }
      for (const s of extractSocials(mdHrefs)) {
        if (!socials.has(`${s.platform}|${s.url}`)) {
          socials.set(`${s.platform}|${s.url}`, { ...s, pageUrl: fetched.finalUrl });
        }
      }
      return;
    }
    const pageHtml = fetched.html ?? "";
    const contacts = extractContactsFromHtml(pageHtml, fetched.finalUrl);
    for (const k of contacts) {
      if (k.type === "email" && k.normalized && !emails.has(k.normalized)) {
        emails.set(k.normalized, { value: k.value, category: k.category, pageUrl: fetched.finalUrl });
      }
      if (k.type === "phone" && k.normalized && !phones.has(k.normalized)) {
        phones.set(k.normalized, { value: k.value, pageUrl: fetched.finalUrl });
      }
    }
    const $$ = cheerio.load(pageHtml);
    const mergeSocial = (h: string) => {
      const d = detectSocialPlatform(h);
      if (d && !socials.has(`${d.platform}|${d.profileUrl}`)) {
        socials.set(`${d.platform}|${d.profileUrl}`, { platform: d.platform, url: d.profileUrl, pageUrl: fetched.finalUrl });
      }
    };
    for (const h of [...absoluteHrefs($$, fetched.finalUrl), ...relMeHrefs($$, fetched.finalUrl)]) mergeSocial(h);
    for (const h of extractJsonLdSocials(pageHtml)) mergeSocial(h);
  };

  // Homepage content (already fetched)
  absorb(
    home.markdown ? { markdown: home.markdown, finalUrl: home.finalUrl } : { html, finalUrl: home.finalUrl },
    "home"
  );

  // Subpages with bounded concurrency + politeness
  const subs = toCrawl.filter((c) => c.type !== "home" && !seen.has(c.url));
  subs.forEach((c) => seen.add(c.url));
  await runPool(subs, concurrency(), async (c) => {
    const start = Date.now();
    try {
      const host = new URL(c.url).hostname;
      await politeDelay(host);
      const fetched = await fetchPageOnce(c.url, timeoutMs, jar, { referer: home.finalUrl });
      pageStats.push({ url: c.url, status: fetched.viaReader ? "reader" : fetched.rendered ? "rendered" : "ok", ms: Date.now() - start });
      absorb(fetched, c.type);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "fetch failed";
      pageStats.push({ url: c.url, status: /not found/i.test(msg) ? "skipped" : "failed", ms: Date.now() - start, note: msg.slice(0, 120) });
      if (!/not found/i.test(msg)) {
        errors.push(`${c.type} page failed: ${msg.slice(0, 160)}`);
      }
    }
  });

  return {
    title,
    metaDescription,
    summary,
    emails: Array.from(emails.values()),
    phones: Array.from(phones.values()),
    socials: Array.from(socials.values()),
    pagesCrawled,
    aboutUrl,
    contactUrl,
    rendered: home.rendered,
    errors,
    pageStats,
  };
}

