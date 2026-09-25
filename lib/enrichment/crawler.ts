import * as cheerio from "cheerio";
import { assertUrlSafe } from "@/lib/security/ssrf";
import { extractContactsFromHtml } from "@/lib/contacts/extractor";
import { detectSocialPlatform } from "@/lib/social/detector";

const PRIORITY_PATHS = ["about", "contact", "services", "products", "team", "careers", "support", "pricing", "blog", "faq"];

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

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
    // protocol fallback
    const alt = new URL(s);
    alt.protocol = u.protocol === "https:" ? "http:" : "https:";
    push(alt.toString());
    // www fallback
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

async function fetchStatic(url: string, timeoutMs: number): Promise<{ html: string; finalUrl: string }> {
  const u = await assertUrlSafe(url);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(u.toString(), {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${u.hostname}`);
    const ct = res.headers.get("content-type") ?? "";
    if (ct && !/html|text/i.test(ct)) throw new Error(`Skipped non-HTML content (${ct})`);
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > 8_000_000) throw new Error("Page too large, skipped");
    const html = (await res.text()).slice(0, 2_000_000);
    if (html.length < 500) throw new Error("Empty response body");
    return { html, finalUrl: res.url };
  } finally {
    clearTimeout(t);
  }
}

// Rendered fallback for JS-heavy sites (needs Playwright browsers installed).
async function fetchRendered(url: string, timeoutMs: number): Promise<{ html: string; finalUrl: string } | null> {
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    try {
      const ctx = await browser.newContext({ userAgent: BROWSER_UA, locale: "en-US" });
      const page = await ctx.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      await page.waitForTimeout(2500);
      const html = await page.content();
      const finalUrl = page.url();
      await ctx.close();
      return html.length > 500 ? { html, finalUrl } : null;
    } finally {
      await browser.close().catch(() => undefined);
    }
  } catch {
    return null;
  }
}

async function fetchPage(
  website: string,
  timeoutMs: number,
  errors: string[]
): Promise<{ html: string; finalUrl: string; rendered: boolean } | null> {
  const candidates = candidateUrls(website);
  let lastError = "";
  for (const c of candidates) {
    try {
      const r = await fetchStatic(c, timeoutMs);
      return { ...r, rendered: false };
    } catch (e: unknown) {
      lastError = e instanceof Error ? e.message : "fetch failed";
    }
  }
  // Try rendered fetch on the primary URL before giving up
  if (candidates.length > 0) {
    const rendered = await fetchRendered(candidates[0], Math.min(timeoutMs + 10000, 30000));
    if (rendered) return { ...rendered, rendered: true };
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

export interface QuickScan {
  title: string | null;
  emails: { value: string; category: string; pageUrl: string }[];
  phones: { value: string; pageUrl: string }[];
  socials: { platform: string; url: string; pageUrl: string }[];
}

// Fast homepage-only pass: grabs the social links, emails and phones most
// sites expose in their header/footer without crawling subpages. Used during
// discovery so socials appear immediately; deep crawls can follow later.
export async function quickScanWebsite(website: string, timeoutMs = 9000): Promise<QuickScan> {
  const empty: QuickScan = { title: null, emails: [], phones: [], socials: [] };
  for (const c of candidateUrls(website)) {
    try {
      const r = await fetchStatic(c, timeoutMs);
      const $ = cheerio.load(r.html);
      const title = $("title").first().text().trim().slice(0, 300) || null;
      const contacts = extractContactsFromHtml(r.html, r.finalUrl);
      const emails = new Map<string, { value: string; category: string; pageUrl: string }>();
      const phones = new Map<string, { value: string; pageUrl: string }>();
      for (const k of contacts) {
        if (k.type === "email" && k.normalized && !emails.has(k.normalized)) {
          emails.set(k.normalized, { value: k.value, category: k.category, pageUrl: r.finalUrl });
        }
        if (k.type === "phone" && k.normalized && !phones.has(k.normalized)) {
          phones.set(k.normalized, { value: k.value, pageUrl: r.finalUrl });
        }
      }
      const socials = new Map<string, { platform: string; url: string; pageUrl: string }>();
      const hrefs = $("a[href]")
        .map((_, el) => {
          try {
            return new URL($(el).attr("href") ?? "", r.finalUrl).toString();
          } catch {
            return "";
          }
        })
        .get()
        .filter(Boolean);
      for (const h of hrefs) {
        const d = detectSocialPlatform(h);
        if (d && !socials.has(`${d.platform}|${d.profileUrl}`)) {
          socials.set(`${d.platform}|${d.profileUrl}`, { platform: d.platform, url: d.profileUrl, pageUrl: r.finalUrl });
        }
      }
      return {
        title,
        emails: Array.from(emails.values()).slice(0, 10),
        phones: Array.from(phones.values()).slice(0, 10),
        socials: Array.from(socials.values()).slice(0, 20),
      };
    } catch {
      continue;
    }
  }
  return empty;
}

export async function enrichWebsite(website: string, opts?: { maxPages?: number; timeoutMs?: number }): Promise<EnrichmentResult> {
  const maxPages = Math.min(opts?.maxPages ?? Number(process.env.ENRICHMENT_MAX_PAGES ?? 8), 20);
  const timeoutMs = opts?.timeoutMs ?? Number(process.env.ENRICHMENT_TIMEOUT_MS ?? 15000);
  const errors: string[] = [];

  const home = await fetchPage(website, timeoutMs, errors);
  if (!home) {
    return {
      title: null, metaDescription: null, summary: null,
      emails: [], phones: [], socials: [], pagesCrawled: 0, rendered: false, errors,
    };
  }

  const $ = cheerio.load(home.html);
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
    return {
      title, metaDescription, summary, emails: [], phones: [], socials: [],
      pagesCrawled: 0, rendered: home.rendered, errors,
    };
  }

  const candidates: { url: string; type: string }[] = [];
  const seenCand = new Set<string>();
  for (const h of hrefs) {
    let abs = "";
    try {
      abs = new URL(h, base).toString();
    } catch {
      continue;
    }
    try {
      const u = new URL(abs);
      if (u.hostname !== base.hostname) continue;
      u.hash = "";
      const norm = u.toString();
      if (seenCand.has(norm)) continue;
      const p = u.pathname.toLowerCase();
      for (const want of PRIORITY_PATHS) {
        if (p.includes(want)) {
          seenCand.add(norm);
          candidates.push({ url: norm, type: want });
          break;
        }
      }
      if (candidates.length >= maxPages * 2) break;
    } catch {
      continue;
    }
  }
  const rank = (t: string) => (t === "contact" ? 0 : t === "about" ? 1 : 2);
  candidates.sort((a, b) => rank(a.type) - rank(b.type));
  const toCrawl = [{ url: home.finalUrl, type: "home" }, ...candidates.slice(0, maxPages - 1)];

  const emails = new Map<string, { value: string; category: string; pageUrl: string }>();
  const phones = new Map<string, { value: string; pageUrl: string }>();
  const socials = new Map<string, { platform: string; url: string; pageUrl: string }>();
  let aboutUrl: string | null = null;
  let contactUrl: string | null = null;

  const seen = new Set<string>();
  let pagesCrawled = 0;
  for (const c of toCrawl) {
    if (seen.has(c.url)) continue;
    seen.add(c.url);
    let fetched: { html: string; finalUrl: string } | null = null;
    if (c.type === "home") {
      fetched = home;
    } else {
      try {
        fetched = await fetchStatic(c.url, timeoutMs);
      } catch (e: unknown) {
        errors.push(`${c.type} page failed: ${e instanceof Error ? e.message : "fetch failed"}`);
        continue;
      }
    }
    if (!fetched) continue;
    pagesCrawled++;
    if (c.type === "about") aboutUrl = fetched.finalUrl;
    if (c.type === "contact") contactUrl = fetched.finalUrl;

    const contacts = extractContactsFromHtml(fetched.html, fetched.finalUrl);
    for (const k of contacts) {
      if (k.type === "email" && k.normalized && !emails.has(k.normalized)) {
        emails.set(k.normalized, { value: k.value, category: k.category, pageUrl: fetched.finalUrl });
      }
      if (k.type === "phone" && k.normalized && !phones.has(k.normalized)) {
        phones.set(k.normalized, { value: k.value, pageUrl: fetched.finalUrl });
      }
    }
    const $$ = cheerio.load(fetched.html);
    const pageHrefs = $$("a[href]")
      .map((_, el) => {
        try {
          return new URL($$(el).attr("href") ?? "", fetched!.finalUrl).toString();
        } catch {
          return "";
        }
      })
      .get()
      .filter(Boolean);
    for (const h of pageHrefs) {
      const d = detectSocialPlatform(h);
      if (d && !socials.has(`${d.platform}|${d.profileUrl}`)) {
        socials.set(`${d.platform}|${d.profileUrl}`, { platform: d.platform, url: d.profileUrl, pageUrl: fetched.finalUrl });
      }
    }
  }

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
  };
}
