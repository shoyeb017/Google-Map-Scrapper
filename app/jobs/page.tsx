"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, ChevronDown, ChevronUp, MapPin, Package, PackageOpen, Plus, RefreshCw, X, Zap } from "lucide-react";
import { Badge, Button, ConfirmButton, EmptyState, Input, PackBadge, ProgressBar, ProviderBadge, Section, Select, SkeletonList, Toggle, packKind, statusTone } from "@/components/ui";
import { StreamTerminal, nextLine } from "@/components/stream-terminal";
import { readSSEStream, type StreamLine, type StreamTone } from "@/lib/stream-client";
import { ExportPacksOverlay } from "@/components/export-packs-overlay";
import { cn } from "@/lib/cn";
import { rangeSelectTitle, useRangeSelect } from "@/lib/range-select";

interface Job {
  id: string;
  keyword: string;
  locationText: string;
  category?: string;
  status: string;
  discoveryProvider: string;
  primaryProvider: string;
  fallbackProvider?: string;
  requestedLimit: number;
  totalDiscovered: number;
  totalSaved: number;
  totalDuplicates: number;
  totalFailed: number;
  fallbackUsed: boolean;
  fallbackReason?: string;
  providerAttempts?: { provider: string; role: string; status: string; resultsCount?: number; errorMessage?: string }[];
  errorMessage?: string;
  createdAt: string;
}

export default function PackagesPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<"all" | "normal" | "map-session">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [force, setForce] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [lines, setLines] = useState<StreamLine[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [packProgress, setPackProgress] = useState<{ donePacks: number; totalPacks: number; doneLeads: number; totalLeads: number; current: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("newest");
  const [view, setView] = useState<"full" | "list">("full");
  const [exportOpen, setExportOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);

  // Persist view + filters per user request ("it should save the state").
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("leadscraper.packsView");
      if (raw === "list" || raw === "full") setView(raw);
      const f = window.localStorage.getItem("leadscraper.packsFilters");
      if (f) {
        const s = JSON.parse(f) as { kind?: string; sort?: string; query?: string };
        if (s.kind === "all" || s.kind === "normal" || s.kind === "map-session") setKindFilter(s.kind);
        if (s.sort) setSort(s.sort);
        if (typeof s.query === "string") setQuery(s.query);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("leadscraper.packsView", view);
    } catch {
      /* ignore */
    }
  }, [view]);

  useEffect(() => {
    try {
      window.localStorage.setItem("leadscraper.packsFilters", JSON.stringify({ kind: kindFilter, sort, query }));
    } catch {
      /* ignore */
    }
  }, [kindFilter, sort, query]);

  const filteredJobs = kindFilter === "all" ? jobs : jobs.filter((j) => packKind(j) === kindFilter);
  const searchedJobs = query.trim()
    ? filteredJobs.filter((j) => `${j.keyword} ${j.locationText} ${j.category ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()))
    : filteredJobs;
  const shownJobs = [...searchedJobs].sort((a, b) => {
    if (sort === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (sort === "leads") return (b.totalSaved ?? 0) - (a.totalSaved ?? 0);
    if (sort === "name") return (a.keyword ?? "").localeCompare(b.keyword ?? "");
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  function load() {
    setLoading(true);
    fetch("/api/jobs")
      .then((r) => r.json())
      .then((d) => setJobs(d.jobs ?? []))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function removePackage(id: string) {
    await fetch(`/api/jobs/${id}`, { method: "DELETE" });
    setJobs((prev) => prev.filter((j) => j.id !== id));
    setSelected((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
  }

  const range = useRangeSelect();
  const shownIds = shownJobs.map((j) => j.id);

  function selectShown() {
    setSelected(new Set(shownJobs.map((j) => j.id)));
    range.reset();
  }

  async function enrichSelected() {
    const ids = Array.from(selected);
    if (!ids.length || enriching) return;
    setEnriching(true);
    setNotice(null);
    setLines([]);
    setStartedAt(Date.now());
    setMinimized(false);
    setPackProgress({ donePacks: 0, totalPacks: ids.length, doneLeads: 0, totalLeads: 0, current: "" });
    const push = (text: string, tone: StreamTone = "info") =>
      setLines((prev) => [...prev.slice(-250), nextLine(text, tone)]);
    try {
      const res = await fetch("/api/enrich/packs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobIds: ids, force }),
      });
      await readSSEStream(
        res,
        (e) => {
          const t = String(e.t ?? "");
          if (t === "pack_start") {
            const idx = Number(e.index ?? 0);
            const total = Number(e.totalPacks ?? ids.length);
            const kw = String(e.keyword ?? "");
            const leads = Number(e.totalLeads ?? 0);
            setPackProgress((p) => (p ? { ...p, totalPacks: total, current: `Pack ${idx}/${total}: ${kw}` } : p));
            push(`Pack ${idx}/${total}: “${kw}” — ${leads} leads`, "stage");
          } else if (t === "pack_done") {
            const idx = Number(e.index ?? 0);
            const total = Number(e.totalPacks ?? ids.length);
            const kw = String(e.keyword ?? "");
            const done = Number(e.done ?? 0);
            const tot = Number(e.total ?? 0);
            if (e.error) {
              push(`Pack ${idx}/${total} “${kw}”: ✕ ${String(e.error)}`, "error");
            } else {
              push(`Pack ${idx}/${total} “${kw}” done — ${done}/${tot} enriched (+${Number(e.emails ?? 0)} emails · +${Number(e.phones ?? 0)} phones · +${Number(e.socials ?? 0)} socials)`, "ok");
            }
            setPackProgress((p) => (p ? { ...p, donePacks: idx, totalPacks: total, current: "" } : p));
          } else if (t === "item") {
            setPackProgress((p) => (p ? { ...p, doneLeads: p.doneLeads + 1 } : p));
          } else if (t === "done") {
            const s = e.summary as { totalPacks: number; totalLeads: number; done: number; emails: number; phones: number; socials: number } | undefined;
            if (s) {
              setPackProgress((p) => (p ? { ...p, donePacks: s.totalPacks, doneLeads: s.totalLeads, totalLeads: Math.max(p.totalLeads, s.totalLeads), current: "" } : p));
              setNotice(`Enriched ${s.done}/${s.totalLeads} websites across ${s.totalPacks} packs — +${s.emails} emails · +${s.phones} phones · +${s.socials} socials.`);
            }
            setSelected(new Set());
          } else if (t === "error") {
            push(`✕ ${String(e.message ?? "enrich failed")}`, "error");
          }
        },
        ({ text, tone }) => push(text, tone)
      );
      load();
    } catch (err: unknown) {
      push(`✕ ${err instanceof Error ? err.message : "enrich failed"}`, "error");
    } finally {
      setEnriching(false);
    }
  }

  const panelVisible = selected.size > 0 || enriching || lines.length > 0;
  const panelPct =
    packProgress && packProgress.totalPacks > 0
      ? Math.round((packProgress.donePacks / Math.max(1, packProgress.totalPacks)) * 100)
      : null;

  function dismissPanel() {
    setLines([]);
    setPackProgress(null);
    setNotice(null);
    setMinimized(false);
    range.reset();
  }

  return (
    <div className={cn("flex flex-col gap-4", panelVisible && !minimized ? "pb-72 sm:pb-48" : panelVisible ? "pb-16" : "")}>
      <div className="animate-fade-up flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Scraped Packs</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Every scraping creates a pack — open one to see only its own results, enrich and download them.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
            {(
              [
                ["all", "All packs"],
                ["normal", "Normal"],
                ["map-session", "Map Session"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setKindFilter(v)}
                className={cn(
                  "rounded-full px-3 py-1.5 font-medium transition",
                  kindFilter === v ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                )}
              >
                {label}
                {v !== "all" ? ` (${jobs.filter((j) => packKind(j) === v).length})` : ` (${jobs.length})`}
              </button>
            ))}
            <span className="inline-flex overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <button onClick={() => setView("full")} className={cn("px-3 py-1.5 font-medium", view === "full" ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-500")}>Full view</button>
              <button onClick={() => setView("list")} className={cn("px-3 py-1.5 font-medium", view === "list" ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-500")}>List view</button>
            </span>
          </div>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search packs by keyword, location…" className="w-full sm:w-64" />
            <Select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort packs" className="w-full sm:w-auto">
              <option value="newest">Sort: Newest</option>
              <option value="oldest">Sort: Oldest</option>
              <option value="leads">Sort: Most leads</option>
              <option value="name">Sort: Name A–Z</option>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {selected.size > 0 ? (
            <Button variant="success" onClick={() => setExportOpen(true)}>
              Export {selected.size} pack{selected.size === 1 ? "" : "s"}
            </Button>
          ) : null}
          <button onClick={load} className="inline-flex items-center gap-1.5 rounded-xl bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 ring-1 ring-inset ring-slate-200 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <Link href="/search" className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700">
            <Plus className="h-4 w-4" /> New scraping
          </Link>
        </div>
      </div>

      {panelVisible ? (
        <div className="fixed inset-x-3 bottom-3 z-[1000] sm:left-auto sm:right-6 sm:bottom-6 sm:w-[440px]">
          {minimized ? (
            <div className="flex w-full items-center gap-1.5 rounded-2xl bg-slate-900/95 py-2 pl-4 pr-2 text-sm text-white shadow-2xl backdrop-blur">
              <button
                type="button"
                onClick={() => setMinimized(false)}
                className="flex min-w-0 flex-1 items-center gap-2.5 py-1 text-left"
                aria-label="Expand enrich panel"
              >
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  {enriching ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-60" /> : null}
                  <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", enriching ? "bg-teal-400" : "bg-emerald-400")} />
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">
                  {enriching ? "Enriching packs…" : lines.length > 0 ? "Enrich log" : `Enrich ${selected.size} pack${selected.size === 1 ? "" : "s"}`}
                </span>
                {panelPct !== null && enriching ? <span className="shrink-0 tabular-nums text-teal-300">{panelPct}%</span> : null}
                <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" />
              </button>
              {!enriching && selected.size === 0 ? (
                <button
                  type="button"
                  onClick={dismissPanel}
                  aria-label="Dismiss enrich panel"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          ) : (
          <div className="flex max-h-[calc(100dvh-120px)] flex-col gap-3 overflow-y-auto slim-scroll rounded-2xl">
          <Section title={`Enrich packs pack-by-pack${selected.size ? ` — ${selected.size} selected` : ""}`} subtitle="Runs one pack fully, then the next. Live log below." className="shadow-2xl ring-1 ring-slate-900/10 dark:ring-white/10"
            action={
              <button
                type="button"
                onClick={() => setMinimized(true)}
                aria-label="Minimize enrich panel"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            }>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={enrichSelected} loading={enriching} disabled={!selected.size}>
                <Zap className="h-4 w-4" /> {enriching ? "Enriching…" : `Enrich ${selected.size} pack${selected.size === 1 ? "" : "s"}`}
              </Button>
              <Button variant="success" onClick={() => setExportOpen(true)} disabled={!selected.size}>
                Export {selected.size} pack{selected.size === 1 ? "" : "s"}
              </Button>
              <Toggle checked={force} onChange={setForce} label="Force re-enrich all leads" />
              <span className="ml-auto flex gap-1.5 text-xs">
                <button onClick={selectShown} className="rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 font-medium hover:bg-slate-200 dark:hover:bg-slate-700">Select shown</button>
                <button onClick={() => { setSelected(new Set()); range.reset(); }} className="rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 font-medium hover:bg-slate-200 dark:hover:bg-slate-700">Clear</button>
              </span>
            </div>
            <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">Tip: tick one pack, then Shift+click another to select everything between.</p>
            {/* Fixed-height progress block so the list below never jumps */}
            <div className="mt-3 min-h-[44px]">
              {packProgress ? (
                <div>
                  <div className="mb-1 flex justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="truncate">{packProgress.donePacks}/{packProgress.totalPacks} packs{packProgress.current ? ` · ${packProgress.current}` : ""}</span>
                    <span className="shrink-0 tabular-nums">{Math.round((packProgress.donePacks / Math.max(1, packProgress.totalPacks)) * 100)}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-teal-500 via-cyan-500 to-teal-500 transition-[width] duration-300 will-change-transform"
                      style={{ width: `${Math.round((packProgress.donePacks / Math.max(1, packProgress.totalPacks)) * 100)}%` }}
                    />
                  </div>
                </div>
              ) : null}
            </div>
            {notice ? (
              <p className="mt-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">{notice}</p>
            ) : null}
          </Section>
          {(enriching || lines.length > 0) ? (
            <StreamTerminal
              title="ENRICHING PACKS — pack-by-pack"
              lines={lines}
              running={enriching}
              startedAt={startedAt}
              progress={packProgress ? { done: packProgress.donePacks, total: packProgress.totalPacks } : null}
            />
          ) : null}
          </div>
          )}
        </div>
      ) : null}

      {loading ? (
        <SkeletonList rows={5} />
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={PackageOpen}
          title="No scraped packs yet"
          hint="Start a scraping and it will appear here as its own pack with its own results, enrichment and downloads."
          action={<Link href="/search" className="mt-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white">Create your first scraped pack</Link>}
        />
      ) : (
        <>
          {shownJobs.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white/60 p-6 text-center text-sm text-slate-500 dark:text-slate-400">
              No {kindFilter === "map-session" ? "Map Session" : "Normal"} packs yet — try another filter.
            </p>
          ) : null}
          {view === "list" ? (
            <div className="overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
              <div className="slim-scroll overflow-x-auto">
                <table className="dtable min-w-full">
                  <thead>
                    <tr>
                      <th className="w-10 px-3 py-3"><input type="checkbox" checked={shownJobs.length > 0 && shownJobs.every((j) => selected.has(j.id))} onChange={() => (shownJobs.every((j) => selected.has(j.id)) ? (setSelected(new Set()), range.reset()) : selectShown())} className="h-4 w-4 accent-teal-600" aria-label="Select all packs" title={rangeSelectTitle} /></th>
                      <th className="px-3 py-3">Pack</th>
                      <th className="px-3 py-3">Location</th>
                      <th className="px-3 py-3">Saved</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3">Type</th>
                      <th className="px-3 py-3">Created</th>
                      <th className="px-3 py-3"><span className="sr-only">Open</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownJobs.map((j) => (
                      <tr key={j.id} className={cn(selected.has(j.id) ? "row-selected" : "")}>
                        <td className="px-3 py-2.5"><input type="checkbox" checked={selected.has(j.id)} className="h-4 w-4 accent-teal-600" aria-label={`Select pack ${j.keyword}`} {...range.box(j.id, shownIds, selected, setSelected)} /></td>
                        <td className="max-w-56 px-3 py-2.5"><Link href={`/jobs/${j.id}`} className="block truncate font-semibold hover:underline">{j.keyword}</Link></td>
                        <td className="max-w-48 truncate px-3 py-2.5 text-xs text-slate-500">{j.locationText}</td>
                        <td className="px-3 py-2.5 tabular-nums">{j.totalSaved}</td>
                        <td className="px-3 py-2.5"><Badge tone={statusTone(j.status)}>{j.status}</Badge></td>
                        <td className="px-3 py-2.5"><PackBadge job={j} /></td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500">{new Date(j.createdAt).toLocaleDateString()}</td>
                        <td className="px-3 py-2.5"><Link href={`/jobs/${j.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-teal-600 hover:underline">Open <ArrowRight className="h-3.5 w-3.5" /></Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
          {view === "full" ? (
          <ul className="grid gap-3 md:grid-cols-2">
          {shownJobs.map((j) => (
            <li key={j.id} className={cn("flex flex-col rounded-2xl border bg-white dark:bg-slate-900 p-4 shadow-sm", selected.has(j.id) ? "border-teal-400 ring-2 ring-teal-100 dark:ring-teal-500/30" : "border-slate-200/80 dark:border-slate-800")}>
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selected.has(j.id)}
                  aria-label={`Select pack ${j.keyword}`}
                  className="mt-1 h-5 w-5 shrink-0 accent-teal-600"
                  {...range.box(j.id, shownIds, selected, setSelected)}
                />
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-500 text-white">
                  <Package className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{j.keyword}</p>
                  <p className="flex items-center gap-1 truncate text-xs text-slate-500 dark:text-slate-400">
                    <MapPin className="h-3 w-3 shrink-0" />{j.locationText}{j.category ? ` · ${j.category}` : ""}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
                    <CalendarDays className="h-3 w-3" />{new Date(j.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <Badge tone={statusTone(j.status)}>{j.status}</Badge>
                  <PackBadge job={j} />
                </div>
              </div>

              <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                {[
                  ["Found", j.totalDiscovered],
                  ["Saved", j.totalSaved],
                  ["Dupes", j.totalDuplicates],
                  ["Errors", j.totalFailed],
                ].map(([k, v]) => (
                  <div key={k as string} className="rounded-xl bg-slate-50 dark:bg-slate-800/50 py-1.5">
                    <div className="text-base font-bold tabular-nums">{v as number}</div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{k}</div>
                  </div>
                ))}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <ProviderBadge provider={j.discoveryProvider === "automatic" ? j.primaryProvider : j.discoveryProvider} />
                {j.discoveryProvider === "automatic" ? <span>→ <ProviderBadge provider={j.fallbackProvider ?? ""} /></span> : null}
                {j.fallbackUsed ? <Badge tone="amber">fallback used</Badge> : null}
              </div>
              {j.errorMessage ? <p className="mt-1.5 truncate text-xs text-rose-600 dark:text-rose-400">{j.errorMessage}</p> : null}

              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 dark:border-slate-800/70 pt-3">
                <Link
                  href={`/jobs/${j.id}`}
                  className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-slate-900 dark:bg-slate-100 px-3 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800"
                >
                  Open pack <ArrowRight className="h-4 w-4" />
                </Link>
                <button onClick={() => setOpen(open === j.id ? null : j.id)} className="rounded-xl bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700">
                  {open === j.id ? "Hide attempts" : "Attempts"}
                </button>
                <ConfirmButton title="Delete" confirmTitle="Delete pack?" onConfirm={() => removePackage(j.id)} />
              </div>
              <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">Deleting removes the pack and its exclusive leads from Search. Leads shared with other packs are kept.</p>

              {open === j.id ? (
                <ul className="mt-2 flex flex-col gap-1 border-t border-slate-100 dark:border-slate-800/70 pt-2 text-xs">
                  {(j.providerAttempts ?? []).map((a, k) => (
                    <li key={k} className="flex items-center justify-between gap-2">
                      <span className="font-medium">{a.provider} <span className="font-normal text-slate-400 dark:text-slate-500">· {a.role}</span></span>
                      <Badge tone={statusTone(a.status)}>{a.status}{a.resultsCount != null ? ` · ${a.resultsCount}` : ""}</Badge>
                    </li>
                  ))}
                  {(j.providerAttempts ?? []).length === 0 ? <li className="text-slate-400 dark:text-slate-500">No attempt records.</li> : null}
                  {j.fallbackReason ? <li className="text-amber-700 dark:text-amber-300">Fallback: {j.fallbackReason}</li> : null}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
          ) : null}
        </>
      )}
      {exportOpen ? (
        <ExportPacksOverlay jobIds={Array.from(selected)} onClose={() => setExportOpen(false)} />
      ) : null}
    </div>
  );
}


