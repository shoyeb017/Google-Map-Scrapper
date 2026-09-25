import type { Browser, BrowserContext, Page } from "playwright";
import { ProviderError } from "@/lib/providers/google-places/google-places-provider";
import { parseFeedCard } from "@/lib/providers/browser-discovery/browser-provider";
import { isPlausiblePhone } from "@/lib/normalization/normalize";

export const SESSION_VIEWPORT = { w: 1280, h: 800 };
const MAPS_HOME = "https://www.google.com/maps?hl=en";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

class Mutex {
  private tail: Promise<void> = Promise.resolve();
  async run<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((r) => (release = r));
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

export interface SnapshotItem {
  position: number;
  name: string;
  mapsUrl: string;
  category: string | null;
  phone: string | null;
  openNow: boolean | null;
  rating: number | null;
  reviewsCount: number | null;
}

interface MapSession {
  id: string;
  browser: Browser;
  ctx: BrowserContext;
  page: Page; // visible session page (what the user sees)
  worker: Page; // background worker page (detail visits keep the list intact)
  createdAt: number;
  query: string;
  snapshot: SnapshotItem[];
  uiLock: Mutex;
  workerLock: Mutex;
}

let current: MapSession | null = null;

function sessionId() {
  return `mapsess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function live(s: MapSession | null): s is MapSession {
  return Boolean(s && s.browser.isConnected());
}

async function useSession<T>(lock: "ui" | "worker", fn: (s: MapSession) => Promise<T>): Promise<T> {
  const s = current;
  if (!live(s)) {
    current = null;
    throw new ProviderError("NOT_CONFIGURED", "No live map session. Launch a session first.");
  }
  return (lock === "ui" ? s.uiLock : s.workerLock).run(() => fn(s));
}

export async function startSession(): Promise<{ sessionId: string; viewport: typeof SESSION_VIEWPORT }> {
  await closeSession();
  let chromium: typeof import("playwright").chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    throw new ProviderError("NOT_CONFIGURED", 'Playwright is not installed. Run "npx playwright install chromium".');
  }
  let browser: Browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-dev-shm-usage"],
    });
  } catch (e: unknown) {
    throw new ProviderError("NOT_CONFIGURED", `Browser launch failed: ${e instanceof Error ? e.message : e}. Run "npx playwright install chromium".`);
  }
  const ctx = await browser.newContext({
    userAgent: UA,
    locale: "en-US",
    viewport: { width: SESSION_VIEWPORT.w, height: SESSION_VIEWPORT.h },
    extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
  });
  const page = await ctx.newPage();
  try {
    await page.goto(MAPS_HOME, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(2500);
  } catch (e: unknown) {
    await browser.close().catch(() => undefined);
    throw new ProviderError("TIMEOUT", `Could not open the map website: ${e instanceof Error ? e.message : e}`);
  }
  const worker = await ctx.newPage();
  const s: MapSession = {
    id: sessionId(),
    browser,
    ctx,
    page,
    worker,
    createdAt: Date.now(),
    query: "",
    snapshot: [],
    uiLock: new Mutex(),
    workerLock: new Mutex(),
  };
  current = s;
  return { sessionId: s.id, viewport: SESSION_VIEWPORT };
}

export async function closeSession(): Promise<void> {
  const s = current;
  current = null;
  if (s) await s.browser.close().catch(() => undefined);
}

export function isSessionLive(): boolean {
  return live(current);
}

export async function getSessionState(): Promise<{
  alive: boolean;
  url: string | null;
  title: string | null;
  query: string;
  resultCount: number;
  snapshotCount: number;
}> {
  if (!live(current)) {
    current = null;
    return { alive: false, url: null, title: null, query: "", resultCount: 0, snapshotCount: 0 };
  }
  return current.uiLock.run(async () => {
    const s = current!;
    let url: string | null = null;
    let title: string | null = null;
    let resultCount = 0;
    try {
      url = s.page.url();
    } catch {
      /* ignore */
    }
    try {
      title = await s.page.title();
    } catch {
      /* ignore */
    }
    try {
      resultCount = await s.page.locator("a.hfpxzc").count();
    } catch {
      /* ignore */
    }
    return { alive: true, url, title, query: s.query, resultCount, snapshotCount: s.snapshot.length };
  });
}

export async function captureFrame(): Promise<{ data: Buffer; contentType: string }> {
  // Deliberately lock-free: screenshots must never queue behind (or block)
  // clicks, drags and keystrokes — CDP serializes safely on its own.
  const s = current;
  if (!live(s)) throw new ProviderError("NOT_CONFIGURED", "No live map session. Launch a session first.");
  // JPEG is 3-5x smaller than PNG — keeps the live view fast.
  const buf = await s.page.screenshot({ type: "jpeg", quality: 65 });
  return { data: Buffer.from(buf), contentType: "image/jpeg" };
}

// What is under a point? Powers the live cursor (text over inputs,
// pointer over links/buttons, grab elsewhere) — like a real browser.
export async function hoverAt(x: number, y: number): Promise<{ cursor: "text" | "pointer" | "grab" }> {
  const s = current;
  if (!live(s)) throw new ProviderError("NOT_CONFIGURED", "No live map session.");
  const kind = await s.page
    .evaluate(
      ({ px, py }: { px: number; py: number }) => {
        const el = document.elementFromPoint(px, py) as HTMLElement | null;
        if (!el) return "grab";
        if (el.closest("input, textarea, [contenteditable='true']")) return "text";
        if (el.closest("a, button, [role='button'], [role='link']")) return "pointer";
        return "grab";
      },
      { px: x, py: y }
    )
    .catch(() => "grab" as const);
  return { cursor: kind as "text" | "pointer" | "grab" };
}

export type InteractOp =
  | { kind: "click"; x: number; y: number }
  | { kind: "dblclick"; x: number; y: number }
  | { kind: "drag"; x1: number; y1: number; x2: number; y2: number }
  | { kind: "wheel"; x: number; y: number; deltaY: number }
  | { kind: "type"; text: string }
  | { kind: "press"; key: string }
  | { kind: "scrollFeed"; direction: "down" | "up"; px?: number }
  | { kind: "goto"; url: string };

const ALLOWED_KEYS = new Set([
  "Enter",
  "Escape",
  "Tab",
  "Backspace",
  "Delete",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

export async function interact(op: InteractOp): Promise<{ ok: true }> {
  return useSession("ui", async (s) => {
    const clamp = (v: number, max: number) => Math.min(Math.max(Math.round(v), 0), max - 1);
    if (op.kind === "click") {
      await s.page.mouse.click(clamp(op.x, SESSION_VIEWPORT.w), clamp(op.y, SESSION_VIEWPORT.h));
    } else if (op.kind === "dblclick") {
      await s.page.mouse.dblclick(clamp(op.x, SESSION_VIEWPORT.w), clamp(op.y, SESSION_VIEWPORT.h));
    } else if (op.kind === "drag") {
      const x1 = clamp(op.x1, SESSION_VIEWPORT.w);
      const y1 = clamp(op.y1, SESSION_VIEWPORT.h);
      const x2 = clamp(op.x2, SESSION_VIEWPORT.w);
      const y2 = clamp(op.y2, SESSION_VIEWPORT.h);
      await s.page.mouse.move(x1, y1);
      await s.page.mouse.down();
      await s.page.mouse.move(x2, y2, { steps: 14 });
      await s.page.mouse.up();
    } else if (op.kind === "wheel") {
      await s.page.mouse.move(clamp(op.x, SESSION_VIEWPORT.w), clamp(op.y, SESSION_VIEWPORT.h));
      const d = Math.min(Math.max(Math.round(op.deltaY), -600), 600);
      if (d !== 0) await s.page.mouse.wheel(0, d);
    } else if (op.kind === "type") {
      await s.page.keyboard.type(op.text.slice(0, 500));
    } else if (op.kind === "press") {
      if (/^(Control|Meta|Shift)\+[a-zA-Z0-9]$/.test(op.key)) {
        // Clipboard/shortcut combos (copy, paste, select-all, cut, undo…)
        await s.page.keyboard.press(op.key);
      } else if (op.key.length === 1) {
        // Single printable character from a real keyboard — type it directly
        // (handles letters, digits, space and symbols with shift as needed).
        if (!/^[\x20-\x7E]$/.test(op.key)) throw new Error("Key not allowed");
        await s.page.keyboard.type(op.key);
      } else {
        if (!ALLOWED_KEYS.has(op.key)) throw new Error(`Key not allowed: ${op.key}`);
        await s.page.keyboard.press(op.key);
      }
    } else if (op.kind === "scrollFeed") {
      const px = Math.min(Math.abs(op.px ?? 900), 4000) * (op.direction === "down" ? 1 : -1);
      const scrolled = await s.page.evaluate((dy: number) => {
        const feed = document.querySelector('div[role="feed"]');
        if (feed) {
          feed.scrollBy(0, dy);
          return true;
        }
        window.scrollBy(0, dy);
        return false;
      }, px).catch(() => false);
      void scrolled;
    } else if (op.kind === "goto") {
      let u: URL;
      try {
        u = new URL(op.url);
      } catch {
        throw new Error("Invalid URL");
      }
      if (u.protocol !== "https:" || !/(^|\.)google\.com$/.test(u.hostname) || !u.pathname.startsWith("/maps")) {
        throw new Error("Only google.com/maps pages are allowed in this session");
      }
      await s.page.goto(u.toString(), { waitUntil: "domcontentloaded", timeout: 45000 });
    }
    return { ok: true as const };
  });
}

// Read the ACTUAL website's current result list (with feed scrolling for
// pagination), parse each card, and store it as the session snapshot.
export async function readSessionResults(opts?: {
  maxScrolls?: number;
  limit?: number;
}): Promise<{ query: string; items: SnapshotItem[] }> {
  const maxScrolls = Math.min(Math.max(opts?.maxScrolls ?? 12, 1), 25);
  const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 200);
  return useSession("ui", async (s) => {
    // Capture the website's own search query text
    let query = "";
    try {
      const q = await s.page.evaluate(() => {
        const input =
          (document.querySelector('input[aria-label="Search Google Maps"]') as HTMLInputElement | null) ??
          (document.querySelector('input[name="q"]') as HTMLInputElement | null);
        return input?.value ?? "";
      });
      if (typeof q === "string" && q.trim()) query = q.trim().slice(0, 200);
    } catch {
      /* ignore */
    }

    const feed = s.page.locator('div[role="feed"]');
    const hasFeed = (await feed.count().catch(() => 0)) > 0;
    if (hasFeed) {
      let stable = 0;
      let last = 0;
      for (let i = 0; i < maxScrolls; i++) {
        const count = await s.page.locator("a.hfpxzc").count().catch(() => 0);
        if (count >= limit) break;
        if (count === last) {
          stable++;
          if (stable >= 3) break;
        } else {
          stable = 0;
          last = count;
        }
        try {
          await feed.first().evaluate((el: HTMLElement) => el.scrollTo(0, el.scrollHeight));
        } catch {
          break;
        }
        await s.page.waitForTimeout(1300);
      }
    }

    const raw = (await s.page
      .evaluate(() => {
        const links = Array.from(document.querySelectorAll("a.hfpxzc"));
        const seen = new Set<string>();
        const out: { name: string; text: string; lines: string[]; all: string; mapsUrl: string }[] = [];
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
          const scope = (article ?? anchor.parentElement) as HTMLElement | null;
          const inner = scope?.innerText ?? "";
          const full = scope?.textContent ?? "";
          const lines = inner
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)
            .slice(0, 14);
          out.push({ name, text: lines.join(" ").slice(0, 1200), lines, all: full.slice(0, 2000), mapsUrl: href });
        }
        return out;
      })
      .catch(() => [])) as { name: string; text: string; lines: string[]; all: string; mapsUrl: string }[];

    const items: SnapshotItem[] = [];
    const seenNames = new Set<string>();
    for (const r of raw.slice(0, limit)) {
      const facts = parseFeedCard(r.name, r.lines ?? [], r.all ?? "");
      const key = `${r.name.toLowerCase()}|${r.mapsUrl}`;
      if (seenNames.has(key)) continue;
      seenNames.add(key);
      items.push({
        position: items.length + 1,
        name: r.name,
        mapsUrl: r.mapsUrl,
        category: facts.category,
        phone: facts.phone,
        openNow: facts.openNow,
        rating: facts.rating,
        reviewsCount: facts.reviewsCount,
      });
    }
    s.query = query;
    s.snapshot = items;
    return { query, items };
  });
}

export function getSnapshot(): SnapshotItem[] {
  return live(current) ? [...current.snapshot] : [];
}

export function getSessionQuery(): string {
  return live(current) ? current.query : "";
}

export async function withWorker<T>(fn: (worker: Page) => Promise<T>): Promise<T> {
  return useSession("worker", async (s) => fn(s.worker));
}
