"use client";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Camera,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  ListChecks,
  MonitorPlay,
  MousePointerClick,
  Pause,
  Play,
  Power,
  RefreshCw,
  Star,
  Zap,
} from "lucide-react";
import { Button, Field, Input, NotFound, ProgressBar, Section, Toggle } from "@/components/ui";
import { StreamTerminal, nextLine } from "@/components/stream-terminal";
import { readSSEStream, type StreamLine, type StreamTone } from "@/lib/stream-client";
import { cn } from "@/lib/cn";

const VW = 1280;
const VH = 800;

interface SessionState {
  alive: boolean;
  url: string | null;
  title: string | null;
  query: string;
  resultCount: number;
  snapshotCount: number;
}

interface QueueItem {
  position: number;
  name: string;
  mapsUrl: string;
  category: string | null;
  phone: string | null;
  openNow: boolean | null;
  rating: number | null;
  reviewsCount: number | null;
}

interface Dash {
  found: number;
  target: number;
  completed: number;
  failed: number;
  pending: number;
  current: string;
  phase: string;
}

function MapScraperInner() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [launching, setLaunching] = useState(false);
  const [frame, setFrame] = useState<string | null>(null);
  const [frameLoading, setFrameLoading] = useState(false);
  const [autoView, setAutoView] = useState(true);
  const [frameKey, setFrameKey] = useState(0);
  const frameBusy = useRef(false);

  const [typeText, setTypeText] = useState("");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [queueQuery, setQueueQuery] = useState("");
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [reading, setReading] = useState(false);

  const [maxResults, setMaxResults] = useState(30);
  const [enrichWebsite, setEnrichWebsite] = useState(true);
  const [discoverSocial, setDiscoverSocial] = useState(true);
  const [discoverContacts, setDiscoverContacts] = useState(true);

  const [scraping, setScraping] = useState(false);
  const [dash, setDash] = useState<Dash | null>(null);
  const [lines, setLines] = useState<StreamLine[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [appendPack, setAppendPack] = useState<{ id: string; keyword: string } | null>(null);

  useEffect(() => {
    try {
      const id = new URLSearchParams(window.location.search).get("append");
      if (!id) return;
      fetch(`/api/jobs/${id}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.job) setAppendPack({ id: d.job.id, keyword: d.job.keyword });
        })
        .catch(() => undefined);
    } catch {
      /* ignore */
    }
  }, []);

  const push = (text: string, tone: StreamTone = "info") =>
    setLines((prev) => [...prev.slice(-250), nextLine(text, tone)]);

  const refreshState = useCallback(async () => {
    try {
      const r = await fetch("/api/map-session");
      if (r.ok) setSession(await r.json());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refreshState();
    const t = setInterval(refreshState, 4000);
    return () => clearInterval(t);
  }, [refreshState]);

  // Auto-launch once so the map just works — no buttons needed.
  const autoLaunched = useRef(false);
  useEffect(() => {
    if (autoLaunched.current || session === null) return;
    if (!session.alive) {
      autoLaunched.current = true;
      void launch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const pullFrame = useCallback(async () => {
    if (frameBusy.current) return;
    frameBusy.current = true;
    setFrameLoading(true);
    try {
      const r = await fetch(`/api/map-session/frame?t=${Date.now()}`);
      if (r.ok) {
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        setFrame((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      } else {
        refreshState();
      }
    } catch {
      /* ignore */
    } finally {
      setFrameLoading(false);
      frameBusy.current = false;
    }
  }, [refreshState]);

  useEffect(() => {
    if (!session?.alive || !autoView) return;
    pullFrame();
    const t = setInterval(pullFrame, 1400);
    return () => clearInterval(t);
  }, [session?.alive, autoView, frameKey, pullFrame]);

  async function launch() {
    setLaunching(true);
    try {
      const r = await fetch("/api/map-session", { method: "POST" });
      const d = await r.json();
      if (!r.ok) {
        push(`✕ ${d.error ?? "launch failed"}`, "error");
        return;
      }
      await refreshState();
      setFrameKey((k) => k + 1);
      push("Map session launched — the real map website is below. Search in ITS search bar.", "ok");
    } finally {
      setLaunching(false);
    }
  }

  async function close() {
    await fetch("/api/map-session", { method: "DELETE" });
    setFrame(null);
    setQueue([]);
    setChecked(new Set());
    refreshState();
  }

  async function interact(body: Record<string, unknown>) {
    try {
      const r = await fetch("/api/map-session/interact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        push(`✕ ${d?.error ?? "interaction failed"}`, "error");
      } else {
        setTimeout(pullFrame, 450);
      }
    } catch (e: unknown) {
      push(`✕ ${e instanceof Error ? e.message : "interaction failed"}`, "error");
    }
  }

  function viewCoords(e: { clientX: number; clientY: number; currentTarget: Element }) {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.round(((e.clientX - rect.left) / rect.width) * VW),
      y: Math.round(((e.clientY - rect.top) / rect.height) * VH),
    };
  }

  const gesture = useRef<{ x: number; y: number; dragging: boolean } | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingClick = useRef<{ x: number; y: number } | null>(null);
  const [grabbing, setGrabbing] = useState(false);
  const [hoverCursor, setHoverCursor] = useState<"text" | "pointer" | "grab">("grab");
  const lastHover = useRef(0);
  const [viewFocused, setViewFocused] = useState(false);
  const lastWheel = useRef(0);
  const viewImgRef = useRef<HTMLImageElement | null>(null);

  // Native wheel listener (non-passive): over the results rail it scrolls the
  // website's own list, over the map it zooms — exactly like normal Maps.
  useEffect(() => {
    const el = viewImgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const now = Date.now();
      if (now - lastWheel.current < 120) return;
      lastWheel.current = now;
      const rect = el.getBoundingClientRect();
      const x = Math.round(((e.clientX - rect.left) / rect.width) * VW);
      const y = Math.round(((e.clientY - rect.top) / rect.height) * VH);
      if (x < 410) {
        const d = Math.round(e.deltaY);
        void interact({
          kind: "scrollFeed",
          direction: d > 0 ? "down" : "up",
          px: Math.min(Math.max(Math.abs(d) * 3, 200), 1500),
        });
      } else {
        void interact({ kind: "wheel", x, y, deltaY: Math.round(e.deltaY) });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [frame]);

  // Real-keyboard forwarding: click the website's own search box, then type
  // on the physical keyboard — keystrokes (incl. Ctrl/Cmd shortcuts) go live.
  // If the user starts typing right after clicking, flush the pending click
  // first so keystrokes never beat the focus-click into the session.
  function flushClick() {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      const pending = pendingClick.current;
      clickTimer.current = null;
      pendingClick.current = null;
      if (pending) void interact({ kind: "click", x: pending.x, y: pending.y });
    }
  }

  function onViewKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Tab") return;
    flushClick();
    if (e.ctrlKey || e.metaKey) {
      const k = e.key.toLowerCase();
      if (["a", "c", "x", "v", "z"].includes(k)) {
        e.preventDefault();
        void interact({ kind: "press", key: `${e.ctrlKey ? "Control" : "Meta"}+${k}` });
      }
      return;
    }
    const named = ["Enter", "Escape", "Backspace", "Delete", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key);
    if (e.key.length !== 1 && !named) return;
    e.preventDefault();
    void interact({ kind: "press", key: e.key });
  }

  function onPointerDown(e: React.PointerEvent<HTMLImageElement>) {
    // Focus the view so physical-keyboard typing goes into the session
    (e.currentTarget.closest("div[tabindex]") as HTMLElement | null)?.focus({ preventScroll: true });
    const p = viewCoords(e);
    gesture.current = { x: p.x, y: p.y, dragging: false };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLImageElement>) {
    const g = gesture.current;
    if (!g) return;
    const p = viewCoords(e);
    if (!g.dragging && Math.hypot(p.x - g.x, p.y - g.y) > 18) {
      g.dragging = true;
      setGrabbing(true);
      if (clickTimer.current) {
        clearTimeout(clickTimer.current);
        clickTimer.current = null;
      }
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLImageElement>) {
    const g = gesture.current;
    gesture.current = null;
    setGrabbing(false);
    if (!g) return;
    const p = viewCoords(e);
    if (g.dragging) {
      // Pan the real map, like a browser drag
      void interact({ kind: "drag", x1: g.x, y1: g.y, x2: p.x, y2: p.y });
    } else {
      // Single click — short delay so a double-click wins instead.
      // Stored (not sent) so fast typing can flush it first.
      if (clickTimer.current) clearTimeout(clickTimer.current);
      pendingClick.current = { x: p.x, y: p.y };
      clickTimer.current = setTimeout(() => {
        clickTimer.current = null;
        const pending = pendingClick.current;
        pendingClick.current = null;
        if (pending) void interact({ kind: "click", x: pending.x, y: pending.y });
      }, 200);
    }
  }

  function onHoverMove(e: React.PointerEvent<HTMLImageElement>) {
    onPointerMove(e);
    // Live cursor like a real browser: text over inputs, pointer over links.
    if (gesture.current?.dragging) return;
    const now = Date.now();
    if (now - lastHover.current < 400) return;
    lastHover.current = now;
    const p = viewCoords(e);
    fetch("/api/map-session/interact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "hover", x: p.x, y: p.y }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.cursor) setHoverCursor(d.cursor);
      })
      .catch(() => undefined);
  }

  function onViewDoubleClick(e: React.MouseEvent<HTMLImageElement>) {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    const p = viewCoords(e);
    void interact({ kind: "dblclick", x: p.x, y: p.y });
  }

  async function readResults() {
    if (reading) return;
    setReading(true);
    push(`Reading the website's current result list (up to ${maxResults})…`, "stage");
    try {
      const r = await fetch(`/api/map-session/results?fresh=1&limit=${maxResults}&scrolls=12`);
      const d = await r.json();
      if (!r.ok) {
        push(`✕ ${d.error ?? "read failed"}`, "error");
        return;
      }
      setQueue(d.items ?? []);
      setQueueQuery(d.query ?? "");
      setChecked(new Set((d.items ?? []).map((it: QueueItem) => it.position)));
      push(`Read ${d.items?.length ?? 0} results from the live list${d.query ? ` (“${d.query}”)` : ""}. Tick items, then Start Scraping.`, "ok");
    } catch (e: unknown) {
      push(`✕ ${e instanceof Error ? e.message : "read failed"}`, "error");
    } finally {
      setReading(false);
    }
  }

  function toggleCheck(pos: number) {
    setChecked((s) => {
      const n = new Set(s);
      if (n.has(pos)) n.delete(pos);
      else n.add(pos);
      return n;
    });
  }

  async function startScrape() {
    if (scraping || queue.length === 0) return;
    const positions = queue.filter((q) => checked.has(q.position)).map((q) => q.position);
    if (!positions.length) {
      push("Tick at least one result to scrape (or Select all).", "warn");
      return;
    }
    setScraping(true);
    setLines([]);
    setStartedAt(Date.now());
    setJobId(null);
    setDash({ found: queue.length, target: positions.length, completed: 0, failed: 0, pending: positions.length, current: "", phase: "starting…" });
    push(`Scraping ${positions.length} selected results from the live list, one by one…`, "stage");
    try {
      const res = await fetch("/api/map-session/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          positions,
          limit: positions.length,
          enrichWebsite,
          discoverSocial,
          discoverContacts,
          appendToJobId: appendPack?.id,
        }),
      });
      await readSSEStream(
        res,
        (e) => {
          const t = String(e.t);
          if (t === "progress") {
            setDash((d) => ({
              found: Number(e.found ?? d?.found ?? 0),
              target: Number(e.target ?? d?.target ?? 0),
              completed: Number(e.completed ?? 0),
              failed: Number(e.failed ?? 0),
              pending: Number(e.pending ?? 0),
              current: d?.current ?? "",
              phase: d?.phase ?? "",
            }));
          } else if (t === "current") {
            setDash((d) => (d ? { ...d, current: `#${e.position} ${String(e.name ?? "")}`, phase: "extracting business info…" } : d));
          } else if (t === "done") {
            setJobId((e.jobId as string) ?? appendPack?.id ?? null);
            const s = e.summary as { completed: number; target: number; failed: number } | undefined;
            setDash((d) => (d ? { ...d, current: "", phase: "finished", pending: 0 } : d));
            if (s) {
              push(
                appendPack
                  ? `Appended — ${s.completed}/${s.target} new businesses added to “${appendPack.keyword}”.`
                  : `Pack ready — ${s.completed}/${s.target} businesses saved to Supabase.`,
                "ok"
              );
            }
          } else if (t === "error") {
            push(`✕ ${String(e.message ?? "scrape failed")}`, "error");
          }
        },
        ({ text, tone }) => {
          push(text, tone);
          if (/enrichment|Email discovery|Social discovery/i.test(text)) {
            setDash((d) => (d ? { ...d, phase: text.replace(/^[✓–✕]\s*/, "").slice(0, 90) } : d));
          }
        }
      );
    } catch (e: unknown) {
      push(`✕ ${e instanceof Error ? e.message : "scrape failed"}`, "error");
    } finally {
      setScraping(false);
      refreshState();
    }
  }

  async function downloadPack(format: "csv" | "xlsx") {
    if (!jobId) return;
    const res = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format, searchJobId: jobId }),
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `map-session-pack-${Date.now()}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="animate-fade-up flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Map Scraper</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            A real controlled browser runs the actual map website below — search in <span className="font-medium">its</span> search bar, then scrape <span className="font-medium">its</span> result list.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {session?.alive ? (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-200">
                <span className="relative flex h-2 w-2"><span className="absolute h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" /><span className="relative h-2 w-2 rounded-full bg-emerald-500" /></span>
                Live session
              </span>
              <Button variant="secondary" onClick={close}>Close</Button>
            </>
          ) : (
            <Button onClick={launch} loading={launching}>
              <Power className="h-4 w-4" /> Launch map session
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* LEFT — live browser view (the actual website) */}
        <div className="flex min-w-0 flex-col gap-3">
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 dark:border-slate-800/70 px-3 py-2">
              <span className="flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              </span>
              <p className="min-w-0 flex-1 truncate rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-1 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                {session?.url ?? "no session — launch to open the real map website"}
              </p>
              <button onClick={() => setAutoView((v) => !v)} title="Auto-refresh live view" className={cn("flex h-8 w-8 items-center justify-center rounded-lg transition", autoView ? "bg-teal-100 dark:bg-teal-500/20 text-teal-700 dark:text-teal-300" : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700")}>
                {autoView ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
              <button onClick={pullFrame} title="Refresh view now" className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700">
                <RefreshCw className={cn("h-4 w-4", frameLoading ? "animate-spin" : "")} />
              </button>
            </div>

            <div className="relative rounded-b-2xl bg-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-500" tabIndex={0} onKeyDown={onViewKeyDown} onFocus={() => setViewFocused(true)} onBlur={() => setViewFocused(false)} aria-label="Live map session. Click the website search bar, then type.">
              {frame ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  ref={viewImgRef}
                  src={frame}
                  alt="Live browser session — the real map website. Drag to pan, scroll to zoom, double-click to zoom in, click to use."
                  onPointerDown={onPointerDown}
                  onPointerMove={onHoverMove}
                  onPointerUp={onPointerUp}
                  onDoubleClick={onViewDoubleClick}
                  className={cn(
                    "block w-full select-none",
                    grabbing ? "cursor-grabbing" : hoverCursor === "text" ? "cursor-text" : hoverCursor === "pointer" ? "cursor-pointer" : "cursor-grab"
                  )}
                  style={{ touchAction: "none" }}
                  draggable={false}
                />
              ) : (
                <div className="flex h-72 flex-col items-center justify-center gap-3 text-center sm:h-96">
                  <MonitorPlay className="h-10 w-10 text-slate-700 dark:text-slate-200" />
                  <p className="max-w-sm text-sm text-slate-400 dark:text-slate-500">
                    {session?.alive ? "Loading the live view…" : "Launch a session to see and drive the actual map website here."}
                  </p>
                  {!session?.alive ? (
                    <Button onClick={launch} loading={launching}>
                      <Power className="h-4 w-4" /> Launch map session
                    </Button>
                  ) : null}
                </div>
              )}
              {frameLoading ? (
                <span className="absolute right-3 top-3 rounded-full bg-slate-900/70 px-2 py-0.5 font-mono text-[11px] text-slate-300">updating…</span>
              ) : null}
              {viewFocused ? (
                <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/90 px-2.5 py-1 font-mono text-[11px] font-semibold text-white">
                  <span className="relative flex h-1.5 w-1.5"><span className="absolute h-full w-full animate-ping rounded-full bg-white dark:bg-slate-900 opacity-70" /><span className="relative h-1.5 w-1.5 rounded-full bg-white dark:bg-slate-900" /></span>
                  TYPING LIVE — copy/paste works (Ctrl+C / Ctrl+V)
                </span>
              ) : null}
            </div>

            {/* Remote interaction bar */}
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 dark:border-slate-800/70 px-3 py-2.5">
              <div className="flex min-w-44 flex-1 items-center gap-1.5">
                <Input
                  value={typeText}
                  onChange={(e) => setTypeText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && typeText) {
                      void interact({ kind: "type", text: typeText });
                      setTypeText("");
                    }
                  }}
                  placeholder="Type into the session (click its search bar first)…"
                  className="h-9 text-sm"
                />
                <Button variant="secondary" className="h-9 px-3" onClick={() => { if (typeText) { void interact({ kind: "type", text: typeText }); setTypeText(""); } }}>
                  Type
                </Button>
                <Button variant="secondary" className="h-9 px-3" onClick={() => interact({ kind: "press", key: "Enter" })}>
                  Enter
                </Button>
              </div>
              <div className="flex items-center gap-1.5">
                <Button variant="ghost" className="h-9 px-2.5 text-xs" onClick={() => interact({ kind: "scrollFeed", direction: "up" })}>
                  <ChevronUp className="h-4 w-4" /> Feed
                </Button>
                <Button variant="ghost" className="h-9 px-2.5 text-xs" onClick={() => interact({ kind: "scrollFeed", direction: "down" })}>
                  <ChevronDown className="h-4 w-4" /> Feed
                </Button>
                <Button variant="ghost" className="h-9 px-2.5 text-xs" onClick={() => interact({ kind: "press", key: "Escape" })}>
                  Esc
                </Button>
              </div>
            </div>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 dark:border-slate-800/70 px-3 py-2 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1"><MousePointerClick className="h-3.5 w-3.5" />Click the site&apos;s search bar, then type on your keyboard · drag to pan · scroll zooms map / scrolls list · double-click zooms in</span>
            </p>
          </div>

          {(scraping || lines.length > 0) ? (
            <StreamTerminal title="MAP SESSION SCRAPER" lines={lines} running={scraping} startedAt={startedAt} progress={dash ? { done: dash.completed + dash.failed, total: dash.target } : null} />
          ) : null}
        </div>

        {/* RIGHT — scraper control panel */}
        <div className="flex flex-col gap-3">
          <Section title="Scraper Settings" subtitle="Reads the live list above">
            <div className="flex flex-col gap-2.5">
              <Field label={`Maximum results (session shows ${session?.resultCount ?? 0})`}>
                <Input type="number" min={1} max={200} value={maxResults} onChange={(e) => setMaxResults(Math.min(200, Math.max(1, Number(e.target.value) || 1)))} />
              </Field>
              <div className="flex flex-col gap-1">
                <Toggle checked={enrichWebsite} onChange={setEnrichWebsite} label="Website enrichment" />
                <Toggle checked={discoverContacts} onChange={setDiscoverContacts} label="Email discovery" />
                <Toggle checked={discoverSocial} onChange={setDiscoverSocial} label="Social media" />
              </div>
              <p className="rounded-xl bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                Sequential · saves coordinates · deduplicates against Supabase automatically.
              </p>
              <Button variant="secondary" onClick={readResults} loading={reading} disabled={!session?.alive} className="w-full">
                <ListChecks className="h-4 w-4" /> {reading ? "Reading list…" : queue.length ? `Re-read list (${queue.length})` : "Read result list"}
              </Button>
            </div>
          </Section>

          {/* Queue from the REAL list */}
          <Section
            title={`Scrape queue${queueQuery ? ` — “${queueQuery}”` : ""}`}
            subtitle={queue.length ? `${checked.size}/${queue.length} selected` : "Read the list first"}
            action={
              queue.length > 0 ? (
                <div className="flex gap-1 text-[11px]">
                  <button onClick={() => setChecked(new Set(queue.map((q) => q.position)))} className="rounded-lg bg-slate-100 dark:bg-slate-800 px-2 py-1 font-medium hover:bg-slate-200 dark:hover:bg-slate-700">All</button>
                  <button onClick={() => setChecked(new Set())} className="rounded-lg bg-slate-100 dark:bg-slate-800 px-2 py-1 font-medium hover:bg-slate-200 dark:hover:bg-slate-700">None</button>
                </div>
              ) : undefined
            }
          >
            {appendPack ? (
              <p className="mb-2 flex items-center justify-between gap-2 rounded-xl bg-cyan-50 px-3 py-2 text-xs text-cyan-800 ring-1 ring-inset ring-cyan-200">
                <span className="truncate">Appending into pack “{appendPack.keyword}”</span>
                <Link href={`/jobs/${appendPack.id}`} className="shrink-0 font-medium underline">view pack</Link>
              </p>
            ) : null}
            {queue.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">No queue yet — read the website&apos;s result list to fill it.</p>
            ) : (
              <ul className="slim-scroll flex max-h-72 flex-col gap-1 overflow-y-auto">
                {queue.map((q) => (
                  <li key={q.position}>
                    <label className={cn("flex cursor-pointer items-start gap-2 rounded-xl px-2 py-1.5 text-sm transition hover:bg-slate-50 dark:hover:bg-slate-800/60", checked.has(q.position) ? "bg-teal-50/60 dark:bg-teal-500/10" : "")}>
                      <input type="checkbox" checked={checked.has(q.position)} onChange={() => toggleCheck(q.position)} className="mt-0.5 h-4 w-4 shrink-0 accent-teal-600" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          <span className="mr-1.5 tabular-nums text-slate-400 dark:text-slate-500">{q.position}.</span>{q.name}
                        </span>
                        <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                          {[q.category, q.phone].filter(Boolean).join(" · ") || "—"}
                          {q.rating != null ? <span className="ml-1 inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{q.rating.toFixed(1)}</span> : null}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <Button onClick={startScrape} loading={scraping} disabled={!queue.length || checked.size === 0} className="mt-3 w-full py-3 text-base">
              <Zap className="h-4 w-4" /> {scraping ? "Scraping…" : checked.size > 0 && checked.size < queue.length ? `Scrape selected (${checked.size})` : "Start Scraping"}
            </Button>
          </Section>

          {/* Live progress dashboard */}
          {dash ? (
            <Section title="Scraping status" subtitle="Live from the session queue">
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  ["Found", dash.found],
                  ["Target", dash.target],
                  ["Completed", dash.completed],
                  ["Processing", dash.target - dash.completed - dash.failed > 0 ? 1 : 0],
                  ["Pending", dash.pending],
                  ["Failed", dash.failed],
                ].map(([k, v]) => (
                  <div key={k as string} className="rounded-xl bg-slate-50 dark:bg-slate-800/50 py-1.5">
                    <div className="truncate px-1 text-base font-bold tabular-nums">{k === "Processing" ? (dash.current || "—") : (v as number)}</div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{k}</div>
                  </div>
                ))}
              </div>
              {dash.current ? <p className="mt-2 truncate text-xs text-slate-600 dark:text-slate-300">Current business: <span className="font-medium">{dash.current}</span></p> : null}
              {dash.phase ? <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{dash.phase}</p> : null}
              {dash.target > 0 ? <ProgressBar value={dash.completed + dash.failed} max={dash.target} className="mt-2" /> : null}
              {jobId ? (
                <div className="mt-3 flex gap-2">
                  <Link href={`/jobs/${jobId}`} className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-slate-900 dark:bg-slate-100 px-3 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800">
                    Open pack <ArrowRight className="h-4 w-4" />
                  </Link>
                  <button onClick={() => downloadPack("csv")} className="flex-1 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500">
                    <Download className="mr-1 inline h-3.5 w-3.5" />CSV
                  </button>
                  <button onClick={() => downloadPack("xlsx")} className="flex-1 rounded-xl bg-slate-100 dark:bg-slate-800 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700">
                    Excel
                  </button>
                </div>
              ) : null}
            </Section>
          ) : null}

          <Section title="How it works" subtitle="Real site, our scraper">
            <ol className="flex flex-col gap-1.5 text-xs text-slate-600 dark:text-slate-300">
              {["Launch, then search inside the website's own bar.", "Pan/zoom freely — Read list captures the current set.", "Tick results (or All), set max + enrichment, Start.", "Each result opens, extracts, enriches, saves to Supabase."].map((s, i) => (
                <li key={i} className="flex gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-100 dark:bg-teal-500/20 text-[11px] font-bold text-teal-700 dark:text-teal-300">{i + 1}</span>{s}</li>
              ))}
            </ol>
            <a href="https://www.google.com/maps" target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-teal-600 dark:text-teal-400 hover:underline">
              Open google.com/maps in a tab <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Section>

          <Section title="Not found states" subtitle="Missing data is explicit">
            <div className="flex flex-wrap gap-1.5">
              <NotFound what="Phone" />
              <NotFound what="Website" />
              <NotFound what="Email" />
            </div>
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">Queue rows without a phone, and skipped crawls without a website, say so instead of staying blank.</p>
          </Section>
        </div>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
        <Camera className="h-3.5 w-3.5" /> Live view refreshes automatically. Turn it off with the pause button to freeze a frame while reading.
      </p>
    </div>
  );
}

export default function MapScraperPage() {
  return (
    <Suspense fallback={<ProgressBar value={30} />}>
      <MapScraperInner />
    </Suspense>
  );
}


