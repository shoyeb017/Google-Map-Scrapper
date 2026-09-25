"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, TerminalSquare } from "lucide-react";
import type { StreamLine, StreamTone } from "@/lib/stream-client";
import { cn } from "@/lib/cn";

let lineId = 0;
export function nextLine(text: string, tone: StreamTone = "info"): StreamLine {
  lineId += 1;
  return { id: lineId, text, tone, at: Date.now() };
}

const toneClass: Record<StreamTone, string> = {
  ok: "text-emerald-300",
  warn: "text-amber-300",
  error: "text-rose-300",
  dim: "text-slate-500",
  info: "text-slate-200",
  stage: "text-teal-300",
};

function fmtClock(startedAt: number | null): string {
  if (!startedAt) return "00:00";
  const s = Math.floor((Date.now() - startedAt) / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function StreamTerminal({
  title,
  lines,
  running,
  startedAt,
  progress,
  collapsedDefault = false,
}: {
  title: string;
  lines: StreamLine[];
  running: boolean;
  startedAt: number | null;
  progress?: { done: number; total: number } | null;
  collapsedDefault?: boolean;
}) {
  const [expanded, setExpanded] = useState(!collapsedDefault);
  const [clock, setClock] = useState("00:00");
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setClock(fmtClock(startedAt)), 500);
    return () => clearInterval(t);
  }, [running, startedAt]);

  useEffect(() => {
    const el = bodyRef.current;
    if (el && expanded) el.scrollTop = el.scrollHeight;
  }, [lines.length, expanded]);

  const visible = expanded ? lines : lines.slice(-3);
  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : null;

  return (
    <div className="overflow-hidden rounded-2xl bg-[#031716] text-slate-200 shadow-lg shadow-teal-950/40 ring-1 ring-[#0a7075]/50">
      {/* header */}
      <div className="flex items-center gap-2 border-b border-[#0a7075]/30 px-3.5 py-2.5 sm:px-4">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          {running ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-60" /> : null}
          <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", running ? "bg-teal-400" : "bg-emerald-400")} />
        </span>
        <TerminalSquare className="h-4 w-4 shrink-0 text-slate-400" />
        <span className="min-w-0 flex-1 truncate font-mono text-xs font-semibold tracking-wide">{title}</span>
        {pct !== null ? <span className="font-mono text-xs tabular-nums text-slate-400">{pct}%</span> : null}
        <span className="font-mono text-xs tabular-nums text-slate-500">{running ? clock : "done"}</span>
        {lines.length > 3 ? (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-0.5 rounded-lg px-1.5 py-1 font-mono text-[11px] text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            {expanded ? "less" : `all ${lines.length}`} <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded ? "rotate-180" : "")} />
          </button>
        ) : null}
      </div>
      {/* progress */}
      {running || pct !== null ? (
        <div className="h-1 w-full bg-slate-800/70">
          {pct !== null ? (
            <div className="h-full bg-gradient-to-r from-teal-500 via-cyan-500 to-emerald-400 transition-all duration-500" style={{ width: `${pct}%` }} />
          ) : (
            <div className="progress-slide h-full w-1/3 bg-gradient-to-r from-teal-500 to-cyan-400" />
          )}
        </div>
      ) : null}
      {/* body */}
      <div ref={bodyRef} className="slim-scroll max-h-72 overflow-y-auto px-3.5 py-2.5 font-mono text-[11px] leading-relaxed sm:px-4 sm:text-xs">
        {visible.length === 0 ? (
          <p className="text-slate-600">Waiting to start…</p>
        ) : (
          visible.map((l) => (
            <p key={l.id} className={cn("break-words", toneClass[l.tone])}>
              <span className="mr-1.5 select-none text-slate-600">›</span>
              {l.text}
            </p>
          ))
        )}
        {running ? <p className="text-teal-400"><span className="mr-1.5 select-none text-slate-600">›</span><span className="animate-pulse">▍</span></p> : null}
      </div>
    </div>
  );
}

