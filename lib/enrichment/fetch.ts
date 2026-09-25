import type { Browser } from "playwright";
import { assertUrlSafe } from "@/lib/security/ssrf";

// Production-grade fetch layer for website enrichment:
// rotating browser identities, cookie jar, retry with backoff, redirect
// chains with per-hop SSRF checks, robots.txt politeness, shared rendered
// browser pool, and an optional remote-reader fallback for hard blocks.

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
];

export function pickUA(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return USER_AGENTS[h % USER_AGENTS.length];
}

export interface FetchSuccess {
  html: string;
  finalUrl: string;
  status: number;
  attempts: number;
  redirectChain: string[];
}

export type CookieJar = Map<string, string>;

function jarKey(host: string): string {
  const parts = host.toLowerCase().split(".");
  return parts.length > 2 ? parts.slice(-2).join(".") : host.toLowerCase();
}

function storeCookies(jar: CookieJar | undefined, host: string, headers: Headers) {
  if (!jar) return;
  const sets: string[] = [];
  // undici Headers: getSetCookie() exists on Node 19+
  const getSet = (headers as unknown as { getSetCookie?: () => string[] }).getSetCookie;
  if (typeof getSet === "function") {
    sets.push(...getSet.call(headers));
  } else {
    const single = headers.get("set-cookie");
    if (single) sets.push(single);
  }
  if (!sets.length) return;
  const key = jarKey(host);
  const prev = jar.get(key) ?? "";
  const pairs = new Map<string, string>();
  for (const c of prev.split(";").map((s) => s.trim()).filter(Boolean)) {
    const i = c.indexOf("=");
    if (i > 0) pairs.set(c.slice(0, i), c.slice(i + 1));
  }
  for (const s of sets) {
    const first = s.split(";")[0].trim();
    const i = first.indexOf("=");
    if (i > 0) pairs.set(first.slice(0, i), first.slice(i + 1));
  }
  jar.set(key, Array.from(pairs.entries()).map(([k, v]) => `${k}=${v}`).join("; "));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function backoff(attempt: number): number {
  return Math.min(1000 * 2 ** attempt + Math.random() * 500, 8000);
}

function retryAfterMs(res: Response): number | null {
  const v = res.headers.get("retry-after");
  if (!v) return null;
  const secs = Number(v);
  if (Number.isFinite(secs)) return Math.min(secs * 1000, 15000);
  const date = Date.parse(v);
  if (!Number.isNaN(date)) return Math.min(Math.max(date - Date.now(), 0), 15000);
  return null;
}

export function maxAttempts(): number {
  const n = Number(process.env.ENRICHMENT_MAX_RETRIES ?? 2);
  return Math.min(Math.max((Number.isFinite(n) ? n : 2) + 1, 1), 5);
}

export function respectRobots(): boolean {
  return (process.env.ENRICHMENT_RESPECT_ROBOTS ?? "true").toLowerCase() !== "false";
}

// --- robots.txt (cached per host, 10 min) ---
const robotsCache = new Map<string, { at: number; disallows: RegExp[] }>();

function robotsPattern(pat: string): RegExp {
  const esc = pat.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  const anchored = pat.endsWith("$") ? esc.slice(0, -2) + "$" : esc + ".*";
  return new RegExp(`^${anchored}`);
}

async function getDisallows(host: string): Promise<RegExp[]> {
  const now = Date.now();
  const cached = robotsCache.get(host);
  if (cached && now - cached.at < 10 * 60 * 1000) return cached.disallows;
  const disallows: RegExp[] = [];
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    try {
      const res = await fetch(`https://${host}/robots.txt`, {
        signal: ctrl.signal,
        redirect: "follow",
        headers: { "User-Agent": pickUA(host) },
      });
      if (res.ok) {
        const text = (await res.text()).slice(0, 100000);
        let inStar = false;
        let sawAgent = false;
        for (const raw of text.split("\n")) {
          const line = raw.split("#")[0].trim();
          const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
          if (!m) continue;
          const field = m[1].toLowerCase();
          const value = m[2].trim();
          if (field === "user-agent") {
            sawAgent = true;
            inStar = value === "*";
          } else if (field === "disallow" && (inStar || !sawAgent)) {
            if (value) disallows.push(robotsPattern(value));
          }
        }
      }
    } finally {
      clearTimeout(t);
    }
  } catch {
    /* robots unreachable = allow */
  }
  robotsCache.set(host, { at: now, disallows });
  return disallows;
}

export async function robotsAllows(url: string): Promise<boolean> {
  if (!respectRobots()) return true;
  try {
    const u = new URL(url);
    const rules = await getDisallows(u.hostname);
    return !rules.some((re) => re.test(u.pathname));
  } catch {
    return true;
  }
}

function classifyError(status: number, hostname: string): { retryable: boolean; message: string } {
  if (status === 404 || status === 410) return { retryable: false, message: `HTTP ${status} (page not found) for ${hostname}` };
  if (status === 403) return { retryable: true, message: `HTTP 403 (blocked?) for ${hostname}` };
  if (status === 401) return { retryable: false, message: `HTTP 401 (auth required) for ${hostname}` };
  if (status === 429) return { retryable: true, message: `HTTP 429 (rate limited) for ${hostname}` };
  if (status >= 500) return { retryable: true, message: `HTTP ${status} (server error) for ${hostname}` };
  return { retryable: false, message: `HTTP ${status} for ${hostname}` };
}

export interface ResilientOptions {
  timeoutMs: number;
  referer?: string;
  jar?: CookieJar;
  checkRobots?: boolean;
}

// Static fetch with UA rotation, cookies, retries, redirect-chain SSRF checks.
export async function fetchResilient(url: string, opts: ResilientOptions): Promise<FetchSuccess> {
  const attempts = maxAttempts();
  const chain: string[] = [];
  let lastError = "fetch failed";
  let uaSeed = url;

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await sleep(backoff(attempt - 1));
    const ua = pickUA(`${uaSeed}#${attempt}`);
    let current: URL;
    try {
      current = await assertUrlSafe(url);
    } catch (e: unknown) {
      throw new Error(e instanceof Error ? e.message : "blocked URL");
    }
    if (opts.checkRobots !== false && !(await robotsAllows(current.toString()))) {
      throw new Error(`Blocked by robots.txt: ${current.pathname || "/"}`);
    }

    try {
      const visited = new Set<string>();
      let res: Response | null = null;
      let hops = 0;
      // Manual redirect loop so cookies, referer and SSRF checks apply per hop.
      for (;;) {
        if (visited.has(current.toString())) throw new Error("Redirect loop detected");
        visited.add(current.toString());
        chain.push(current.toString());
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), opts.timeoutMs);
        try {
          res = await fetch(current.toString(), {
            signal: ctrl.signal,
            redirect: "manual",
            headers: {
              "User-Agent": ua,
              Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "en-US,en;q=0.9",
              "Upgrade-Insecure-Requests": "1",
              ...(opts.referer ? { Referer: opts.referer } : {}),
              ...(opts.jar?.get(jarKey(current.hostname)) ? { Cookie: opts.jar.get(jarKey(current.hostname))! } : {}),
            },
          });
        } finally {
          clearTimeout(t);
        }
        storeCookies(opts.jar, current.hostname, res.headers);
        if ([301, 302, 303, 307, 308].includes(res.status)) {
          const loc = res.headers.get("location");
          if (!loc) throw new Error(`Redirect without location (HTTP ${res.status})`);
          hops++;
          if (hops > 8) throw new Error("Too many redirects");
          try {
            current = await assertUrlSafe(new URL(loc, current).toString());
          } catch (e: unknown) {
            throw new Error(e instanceof Error ? e.message : "blocked redirect target");
          }
          if (opts.checkRobots !== false && !(await robotsAllows(current.toString()))) {
            throw new Error(`Redirect target blocked by robots.txt: ${current.pathname || "/"}`);
          }
          continue;
        }
        break;
      }

      const final = res!;
      if (!final.ok) {
        const { retryable, message } = classifyError(final.status, current.hostname);
        lastError = message;
        if (!retryable || attempt === attempts - 1) {
          const wait = retryAfterMs(final);
          if (retryable && wait) await sleep(wait);
          if (!retryable || attempt === attempts - 1) throw new Error(message);
          continue;
        }
        const wait = retryAfterMs(final);
        if (wait) await sleep(wait);
        continue;
      }
      const ct = final.headers.get("content-type") ?? "";
      if (ct && !/html|text/i.test(ct)) throw new Error(`Skipped non-HTML content (${ct})`);
      const len = Number(final.headers.get("content-length") ?? 0);
      if (len > 8_000_000) throw new Error("Page too large, skipped");
      const html = (await final.text()).slice(0, 2_000_000);
      if (html.length < 500) {
        lastError = "Empty response body";
        continue; // retry — often a bot-wall shell on first hit
      }
      return { html, finalUrl: final.url || current.toString(), status: final.status, attempts: attempt + 1, redirectChain: chain };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "fetch failed";
      if (/robots\.txt|not found|auth required|Blocked URL|blocked redirect|Redirect loop|Too many|non-HTML|too large/i.test(msg)) {
        throw e instanceof Error ? e : new Error(msg);
      }
      lastError = msg;
      uaSeed = `${url}#ua${attempt}`;
      continue;
    }
  }
  throw new Error(lastError);
}

// --- Shared rendered browser (one instance, fresh context per fetch) ---
let sharedBrowser: Browser | null = null;
let sharedLastUse = 0;
let sharedClosing: ReturnType<typeof setTimeout> | null = null;

async function getSharedBrowser(): Promise<Browser> {
  if (sharedBrowser?.isConnected()) {
    sharedLastUse = Date.now();
    return sharedBrowser;
  }
  const { chromium } = await import("playwright");
  sharedBrowser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  sharedLastUse = Date.now();
  return sharedBrowser;
}

function scheduleIdleClose() {
  if (sharedClosing) clearTimeout(sharedClosing);
  sharedClosing = setTimeout(() => {
    if (Date.now() - sharedLastUse > 90000) {
      sharedBrowser?.close().catch(() => undefined);
      sharedBrowser = null;
    } else {
      scheduleIdleClose();
    }
  }, 95000);
  (sharedClosing as unknown as { unref?: () => void }).unref?.();
}

export async function fetchRendered(url: string, timeoutMs: number): Promise<FetchSuccess | null> {
  try {
    const safe = await assertUrlSafe(url);
    const browser = await getSharedBrowser();
    const ctx = await browser.newContext({
      userAgent: pickUA(url),
      locale: "en-US",
      extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
    });
    try {
      const page = await ctx.newPage();
      await page.goto(safe.toString(), { waitUntil: "domcontentloaded", timeout: timeoutMs });
      await page.waitForTimeout(2000);
      let html = await page.content();
      if (html.length < 800) {
        await page.waitForTimeout(3000).catch(() => undefined);
        html = await page.content();
      }
      const finalUrl = page.url();
      if (html.length < 500) return null;
      return { html: html.slice(0, 2_000_000), finalUrl, status: 200, attempts: 1, redirectChain: [url, finalUrl] };
    } finally {
      await ctx.close().catch(() => undefined);
      scheduleIdleClose();
    }
  } catch {
    return null;
  }
}

// --- Optional remote-reader fallback (r.jina.ai) for hard blocks ---
export function remoteFallbackEnabled(): boolean {
  return (process.env.ENRICHMENT_REMOTE_FALLBACK ?? "true").toLowerCase() !== "false";
}

export async function fetchViaReader(
  url: string,
  timeoutMs: number
): Promise<{ markdown: string; finalUrl: string } | null> {
  if (!remoteFallbackEnabled()) return null;
  let safe: URL;
  try {
    safe = await assertUrlSafe(url);
  } catch {
    return null;
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), Math.min(timeoutMs + 10000, 40000));
    try {
      const headers: Record<string, string> = { "User-Agent": pickUA(url), Accept: "text/plain,text/markdown,*/*" };
      const key = process.env.JINA_API_KEY;
      if (key) headers.Authorization = `Bearer ${key}`;
      const res = await fetch(`https://r.jina.ai/${safe.toString()}`, { signal: ctrl.signal, headers });
      if (!res.ok) return null;
      const text = (await res.text()).slice(0, 500000);
      if (text.length < 300) return null;
      return { markdown: text, finalUrl: safe.toString() };
    } finally {
      clearTimeout(t);
    }
  } catch {
    return null;
  }
}
