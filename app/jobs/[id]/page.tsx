"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  Download,
  MapPin,
  Package,
  Plus,
  Trash2,
  Zap,
} from "lucide-react";
import {
  Badge,
  Button,
  Completeness,
  ConfirmButton,
  EmptyState,
  Input,
  NotFound,
  PackBadge,
  ProviderBadge,
  Section,
  SkeletonList,
  SocialIcons,
  packKind,
  statusTone,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { loadExportColumnsAsync } from "@/lib/export-settings";
import { readSSEStream, type StreamLine, type StreamTone } from "@/lib/stream-client";
import { StreamTerminal, nextLine } from "@/components/stream-terminal";

interface Biz {
  id: string;
  name: string;
  primaryCategory?: string;
  phones?: string[];
  emails?: string[];
  website?: string;
  city?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  mapsUrl?: string;
  sourceProvider: string;
  providers?: string[];
  socialLinks?: { platform: string; url: string }[];
  completenessScore?: number;
}

interface Job {
  id: string;
  keyword: string;
  locationText: string;
  category?: string;
  status: string;
  discoveryProvider: string;
  primaryProvider: string;
  fallbackProvider?: string;
  totalDiscovered: number;
  totalSaved: number;
  totalDuplicates: number;
  totalFailed: number;
  fallbackUsed: boolean;
  fallbackReason?: string;
  providerAttempts?: { provider?: string; status?: string }[];
  createdAt: string;
}

const PAGE_SIZE = 20;

export default function PackageDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [items, setItems] = useState<Biz[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [enrichLines, setEnrichLines] = useState<StreamLine[]>([]);
  const [enrichStartedAt, setEnrichStartedAt] = useState<number | null>(null);
  const [enrichProgress, setEnrichProgress] = useState<{ done: number; total: number } | null>(null);
  const [exportCols, setExportCols] = useState<string[]>([]);
  const [moreCount, setMoreCount] = useState(10);
  const [findingMore, setFindingMore] = useState(false);
  const [moreLines, setMoreLines] = useState<StreamLine[]>([]);
  const [moreStartedAt, setMoreStartedAt] = useState<number | null>(null);

  const isSessionPack =
    (job?.providerAttempts ?? []).some((a) => a.provider === "browser_discovery" && a.status === "session-list");

  async function reloadPack() {
    const pkg = await fetch(`/api/jobs/${id}`).then((r) => (r.ok ? r.json() : null));
    if (pkg?.job) {
      setJob(pkg.job);
      setItems(pkg.businesses ?? []);
    }
  }

  async function findMore() {
    if (findingMore || isSessionPack) return;
    const n = Math.min(Math.max(Math.round(moreCount) || 10, 1), 200);
    setFindingMore(true);
    setMoreLines([]);
    setMoreStartedAt(Date.now());
    setNotice(null);
    const push = (text: string, tone: StreamTone = "info") =>
      setMoreLines((prev) => [...prev.slice(-200), nextLine(text, tone)]);
    try {
      const res = await fetch(`/api/jobs/${id}/more`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ additional: n }),
      });
      let added = 0;
      let total = 0;
      await readSSEStream(
        res,
        (e) => {
          if (String(e.t) === "done") {
            added = Number(e.added ?? 0);
            total = Number(e.totalSaved ?? 0);
          }
        },
        ({ text, tone }) => push(text, tone)
      );
      await reloadPack();
      setNotice(`Found more: +${added} new leads (pack now holds ${total}). Already-collected ones were excluded automatically.`);
    } catch (err: unknown) {
      push(`✕ ${err instanceof Error ? err.message : "find more failed"}`, "error");
    } finally {
      setFindingMore(false);
    }
  }

  useEffect(() => {
    fetch(`/api/jobs/${id}`)
      .then((r) => {
        if (!r.ok) {
          setMissing(true);
          return null;
        }
        return r.json();
      })
      .then((d) => {
        if (d) {
          setJob(d.job);
          setItems(d.businesses ?? []);
        }
      })
      .catch(() => setMissing(true))
      .finally(() => setLoading(false));
    fetch("/api/settings/export-columns")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.columns?.length) setExportCols(d.columns);
      })
      .catch(() => undefined);
  }, [id]);

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pageItems = useMemo(() => items.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE), [items, page]);

  const analysis = useMemo(() => {
    const n = items.length;
    const pct = (c: number) => (n ? Math.round((c / n) * 100) : 0);
    const withPhone = items.filter((b) => b.phones?.length).length;
    const withEmail = items.filter((b) => b.emails?.length).length;
    const withSite = items.filter((b) => b.website).length;
    const withSocials = items.filter((b) => (b.socialLinks ?? []).length).length;
    const withCoords = items.filter((b) => b.latitude && b.longitude).length;
    const avgComplete = n ? Math.round(items.reduce((s, b) => s + (b.completenessScore ?? 0), 0) / n) : 0;
    const catCount = new Map<string, number>();
    const provCount = new Map<string, number>();
    for (const b of items) {
      if (b.primaryCategory) catCount.set(b.primaryCategory, (catCount.get(b.primaryCategory) ?? 0) + 1);
      const p = (b.providers ?? [b.sourceProvider])[0] ?? b.sourceProvider;
      provCount.set(p, (provCount.get(p) ?? 0) + 1);
    }
    const top = (m: Map<string, number>) =>
      Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);
    return { n, withPhone, withEmail, withSite, withSocials, withCoords, avgComplete, pct, topCats: top(catCount), topProvs: top(provCount) };
  }, [items]);

  function toggle(bid: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(bid)) n.delete(bid);
      else n.add(bid);
      return n;
    });
  }

  async function enrich(ids: string[]) {
    if (!ids.length || enriching) return;
    setBusy("enrich");
    setEnriching(true);
    setNotice(null);
    setEnrichLines([]);
    setEnrichStartedAt(Date.now());
    setEnrichProgress({ done: 0, total: ids.length });
    const push = (text: string, tone: StreamTone = "info") =>
      setEnrichLines((prev) => [...prev.slice(-200), nextLine(text, tone)]);
    try {
      const res = await fetch("/api/enrich/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessIds: ids }),
      });
      await readSSEStream(
        res,
        (e) => {
          if (String(e.t) === "done") {
            const s = e.summary as { total: number; done: number; skipped: number; emails: number; phones: number; socials: number };
            setNotice(`Enriched ${s.done}/${s.total} websites — +${s.emails} emails · +${s.phones} phones · +${s.socials} socials saved.${s.skipped ? ` ${s.skipped} skipped (already enriched or no website).` : ""}`);
          }
          if (String(e.t) === "item") {
            setEnrichProgress({ done: Number(e.done ?? 0), total: Number(e.total ?? ids.length) });
          }
        },
        ({ text, tone }) => push(text, tone)
      );
      const pkg = await fetch(`/api/jobs/${id}`).then((r) => r.json());
      setItems(pkg.businesses ?? []);
      setSelected(new Set());
    } catch (err: unknown) {
      push(`✕ ${err instanceof Error ? err.message : "enrich failed"}`, "error");
    } finally {
      setBusy(null);
      setEnriching(false);
    }
  }

  async function download(format: "csv" | "xlsx", onlySelected: boolean) {
    setBusy(format);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format,
          searchJobId: id,
          selectedIds: onlySelected ? Array.from(selected) : [],
          columns: await loadExportColumnsAsync(),
        }),
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pack-${job?.keyword?.replace(/\s+/g, "-") ?? "export"}-${Date.now()}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(null);
    }
  }

  async function deleteSelected() {
    setBusy("delete");
    try {
      await fetch("/api/businesses/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      setItems((prev) => prev.filter((b) => !selected.has(b.id)));
      setSelected(new Set());
    } finally {
      setBusy(null);
    }
  }

  async function deletePackage() {
    setBusy("package");
    await fetch(`/api/jobs/${id}`, { method: "DELETE" });
    router.push("/jobs");
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="skeleton h-32 w-full" />
        <SkeletonList rows={6} />
      </div>
    );
  }

  if (missing || !job) {
    return (
      <EmptyState
        icon={Package}
        title="Pack not found"
        hint="It may have been deleted."
        action={<Link href="/jobs" className="mt-2 text-sm text-teal-600 dark:text-teal-400">Back to packs</Link>}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-24 lg:pb-0">
      <Link href="/jobs" className="inline-flex w-fit items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Scraped Packs
      </Link>

      {/* Package header */}
      <div className="animate-fade-up overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="bg-gradient-to-r from-teal-600 via-cyan-600 to-cyan-500 px-4 py-4 text-white sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-teal-200">
                <Package className="h-3.5 w-3.5" /> {packKind(job) === "map-session" ? "Map Session pack" : "Normal pack"}
              </p>
              <h1 className="mt-0.5 truncate text-lg font-bold sm:text-2xl">{job.keyword}</h1>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-teal-100">
                <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{job.locationText}{job.category ? ` · ${job.category}` : ""}</span>
                <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{new Date(job.createdAt).toLocaleString()}</span>
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <Badge tone={statusTone(job.status)} className="bg-white/15 text-white">{job.status}</Badge>
              <PackBadge job={job} className="bg-white/15 text-white ring-1 ring-inset ring-white/25" />
            </div>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2 text-center">
            {[
              ["Found", job.totalDiscovered],
              ["Saved", job.totalSaved],
              ["Dupes", job.totalDuplicates],
              ["Errors", job.totalFailed],
            ].map(([k, v]) => (
              <div key={k as string} className="rounded-xl bg-white/15 py-1.5 backdrop-blur">
                <div className="text-base font-bold tabular-nums sm:text-lg">{v as number}</div>
                <div className="text-[10px] uppercase tracking-wide text-teal-100">{k}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 px-4 py-3 sm:px-5">
          <ProviderBadge provider={job.discoveryProvider === "automatic" ? job.primaryProvider : job.discoveryProvider} />
          {job.discoveryProvider === "automatic" ? (
            <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">fallback <ProviderBadge provider={job.fallbackProvider ?? ""} /></span>
          ) : null}
          {job.fallbackUsed ? <Badge tone="amber">fallback used</Badge> : null}
          <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">{items.length} leads in this pack{selected.size > 0 ? ` · ${selected.size} selected` : ""}</span>
        </div>
      </div>

      {/* Package actions */}
      <div className="animate-fade-up-1 hidden flex-wrap gap-2 lg:flex">
        <Button variant="dark" onClick={() => enrich(items.map((b) => b.id))} loading={busy === "enrich"} disabled={!items.length}>
          <Zap className="h-4 w-4" /> Enrich all ({items.length})
        </Button>
        <Button variant="dark" onClick={() => enrich(Array.from(selected))} disabled={!selected.size}>
          <Zap className="h-4 w-4" /> Enrich selected
        </Button>
        <Button variant="success" onClick={() => download("csv", false)} loading={busy === "csv"}>
          <Download className="h-4 w-4" /> Pack CSV
        </Button>
        <Button variant="secondary" onClick={() => download("xlsx", false)} loading={busy === "xlsx"}>
          <Download className="h-4 w-4" /> Pack Excel
        </Button>
        {selected.size > 0 ? (
          <>
            <Button variant="secondary" onClick={() => download("csv", true)}>CSV selected</Button>
            <Button variant="danger" onClick={deleteSelected} loading={busy === "delete"}>
              <Trash2 className="h-4 w-4" /> Delete selected
            </Button>
          </>
        ) : null}
        <span className="ml-auto">
          <ConfirmButton title="Delete pack" confirmTitle="Delete this pack?" busy={busy === "package"} onConfirm={deletePackage} />
        </span>
      </div>

      {notice ? (
        <p className="rounded-xl bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">{notice}</p>
      ) : null}

      {/* Find more leads */}
      {isSessionPack ? (
        <Section title="Grow this pack" subtitle="Map-session packs have no resumable location — append fresh results from the live list">
          <div className="flex flex-wrap items-center gap-2">
            <p className="w-full text-sm text-slate-600 dark:text-slate-300">
              This pack was scraped from a live map session. To add more, open Map Scraper, read the current website list, and append the new items here.
            </p>
            <Link
              href={`/map-search?append=${id}`}
              className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
            >
              <Plus className="h-4 w-4" /> Append from live session
            </Link>
          </div>
        </Section>
      ) : (
        <Section title="Find more leads" subtitle="Re-runs this pack's own search deeper — already-collected leads are excluded automatically">
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-36">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">How many more</label>
              <Input
                type="number" min={1} max={200} value={moreCount}
                onChange={(e) => setMoreCount(Math.min(200, Math.max(1, Number(e.target.value) || 1)))}
              />
            </div>
            <Button onClick={findMore} loading={findingMore} className="px-5">
              <Plus className="h-4 w-4" /> {findingMore ? "Finding…" : "Find more"}
            </Button>
            <span className="pb-2 text-xs text-slate-500 dark:text-slate-400">Adds only new leads to this same pack.</span>
          </div>
          {(findingMore || moreLines.length > 0) ? (
            <div className="mt-3">
              <StreamTerminal
                title={`FINDING MORE — ${job.keyword}`}
                lines={moreLines}
                running={findingMore}
                startedAt={moreStartedAt}
              />
            </div>
          ) : null}
        </Section>
      )}

      {(enriching || enrichLines.length > 0) ? (
        <StreamTerminal
          title={`ENRICHING PACK — ${job.keyword}`}
          lines={enrichLines}
          running={enriching}
          startedAt={enrichStartedAt}
          progress={enrichProgress}
        />
      ) : null}

      {/* Pack analysis */}
      {items.length > 0 ? (
        <Section title="Pack analysis" subtitle="What this pack mostly contains + your export columns" className="animate-fade-up-2">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {[
              ["Phone", analysis.withPhone],
              ["Email", analysis.withEmail],
              ["Website", analysis.withSite],
              ["Socials", analysis.withSocials],
              ["Coords", analysis.withCoords],
              ["Avg complete", null],
            ].map(([k, v]) => (
              <div key={k as string} className="rounded-xl bg-slate-50 dark:bg-slate-800/50 px-2 py-2 text-center">
                <div className="text-base font-bold tabular-nums sm:text-lg">
                  {v === null ? `${analysis.avgComplete}%` : `${analysis.pct(v as number)}%`}
                </div>
                <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{k}</div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
            {analysis.topCats.length > 0 ? (
              <span>Top categories: {analysis.topCats.map(([c, n]) => `${c} (${n})`).join(" · ")}</span>
            ) : null}
            {analysis.topProvs.length > 0 ? (
              <span>Sources: {analysis.topProvs.map(([p, n]) => `${p.replace(/_/g, " ")} (${n})`).join(" · ")}</span>
            ) : null}
          </div>
          <div className="mt-2 border-t border-slate-100 dark:border-slate-800/70 pt-2">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Export columns for this pack ({exportCols.length || "all"})
            </p>
            {exportCols.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {exportCols.slice(0, 12).map((c) => (
                  <span key={c} className="rounded-full bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-200">
                    {c}
                  </span>
                ))}
                {exportCols.length > 12 ? (
                  <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] text-slate-500 dark:text-slate-400">+{exportCols.length - 12} more</span>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">All columns will download.</p>
            )}
            <Link href="/exports" className="mt-1.5 inline-block text-xs font-medium text-teal-600 dark:text-teal-400 hover:underline">
              Customize in Export Settings →
            </Link>
          </div>
        </Section>
      ) : null}

      {/* Results */}
      {items.length === 0 ? (
        <EmptyState icon={Building2} title="No leads in this pack" hint="The search found nothing, or its leads were deleted." />
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm lg:block">
            <div className="slim-scroll overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800/70 bg-slate-50/70 dark:bg-slate-800/50 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <th className="w-10 px-3 py-3">
                      <input
                        type="checkbox"
                        checked={pageItems.length > 0 && pageItems.every((b) => selected.has(b.id))}
                        onChange={() => {
                          setSelected((s) => {
                            const n = new Set(s);
                            if (pageItems.every((b) => n.has(b.id))) pageItems.forEach((b) => n.delete(b.id));
                            else pageItems.forEach((b) => n.add(b.id));
                            return n;
                          });
                        }}
                        className="h-4 w-4 accent-teal-600"
                      />
                    </th>
                    <th className="px-3 py-3">Business</th>
                    <th className="px-3 py-3">Phone</th>
                    <th className="px-3 py-3">Email</th>
                    <th className="px-3 py-3">Website</th>
                    <th className="px-3 py-3">Socials</th>
                    <th className="px-3 py-3">Map</th>
                    <th className="px-3 py-3">Complete</th>
                    <th className="w-12 px-3 py-3"><span className="sr-only">Delete</span></th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((b) => (
                    <tr key={b.id} className={cn("border-b border-slate-100 dark:border-slate-800/70 last:border-0 hover:bg-teal-50/40", selected.has(b.id) ? "bg-teal-50/60 dark:bg-teal-500/10" : "")}>
                      <td className="px-3 py-3">
                        <input type="checkbox" checked={selected.has(b.id)} onChange={() => toggle(b.id)} className="h-4 w-4 accent-teal-600" />
                      </td>
                      <td className="max-w-60 px-3 py-3">
                        <Link href={`/businesses/${b.id}`} className="block truncate font-semibold hover:text-teal-700 dark:hover:text-teal-300 hover:underline">
                          {b.name}
                        </Link>
                        <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{[b.primaryCategory, b.city].filter(Boolean).join(" · ") || "—"}</span>
                      </td>
                      <td className="max-w-44 truncate px-3 py-3 text-xs">{b.phones?.[0] ?? <NotFound what="Phone" />}</td>
                      <td className="max-w-44 truncate px-3 py-3 text-xs">{b.emails?.[0] ?? <NotFound what="Email" />}</td>
                      <td className="max-w-44 truncate px-3 py-3 text-xs">{b.website ?? <NotFound what="Website" />}</td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <SocialIcons links={b.socialLinks} />
                      </td>
                      <td className="px-3 py-3">
                        {b.mapsUrl ? (
                          <a
                            href={b.mapsUrl}
                            target="_blank"
                            rel="noreferrer"
                            title="Open map location in new tab"
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-teal-600 transition hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-500/10"
                          >
                            <MapPin className="h-4 w-4" />
                          </a>
                        ) : <span className="text-xs text-slate-300 dark:text-slate-600">—</span>}
                      </td>
                      <td className="px-3 py-3"><Completeness value={b.completenessScore ?? 0} /></td>
                      <td className="px-3 py-3">
                        <button
                          aria-label={`Delete ${b.name}`}
                          onClick={() => {
                            fetch(`/api/businesses/${b.id}`, { method: "DELETE" });
                            setItems((prev) => prev.filter((x) => x.id !== b.id));
                          }}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <ul className="flex flex-col gap-2 lg:hidden">
            {pageItems.map((b) => (
              <li key={b.id} className={cn("rounded-2xl border bg-white dark:bg-slate-900 p-3.5 shadow-sm", selected.has(b.id) ? "border-teal-400 ring-2 ring-teal-100 dark:ring-teal-500/30" : "border-slate-200/80 dark:border-slate-800")}>
                <div className="flex items-start gap-2.5">
                  <input type="checkbox" checked={selected.has(b.id)} onChange={() => toggle(b.id)} className="mt-1 h-5 w-5 shrink-0 accent-teal-600" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/businesses/${b.id}`} className="truncate font-semibold">{b.name}</Link>
                      <button
                        aria-label={`Delete ${b.name}`}
                        onClick={() => {
                          fetch(`/api/businesses/${b.id}`, { method: "DELETE" });
                          setItems((prev) => prev.filter((x) => x.id !== b.id));
                        }}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{[b.primaryCategory, b.city].filter(Boolean).join(" · ") || "—"}</p>
                    <div className="mt-1.5 flex flex-col gap-1 text-xs">
                      <span>{b.phones?.[0] ?? <NotFound what="Phone" />}</span>
                      <span className="truncate">{b.emails?.[0] ?? <NotFound what="Email" />}</span>
                      <span className="truncate">{b.website ?? <NotFound what="Website" />}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <SocialIcons links={b.socialLinks} iconClass="h-[18px] w-[18px]" />
                        {b.mapsUrl ? (
                          <a
                            href={b.mapsUrl}
                            target="_blank"
                            rel="noreferrer"
                            title="Open map location in new tab"
                            className="inline-flex items-center gap-1 rounded-lg bg-teal-50 px-2 py-1 text-[11px] font-medium text-teal-700 transition hover:bg-teal-100 dark:bg-teal-500/10 dark:text-teal-300"
                          >
                            <MapPin className="h-3.5 w-3.5" /> Maps
                          </a>
                        ) : null}
                      </span>
                      <Completeness value={b.completenessScore ?? 0} />
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between text-sm">
            <Button variant="secondary" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Previous</Button>
            <span className="text-slate-500 dark:text-slate-400">Page {page + 1} of {totalPages}</span>
            <Button variant="secondary" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </>
      )}

      <Section title="More from this pack" subtitle="Jump to the full profile or keep exploring">
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href="/businesses" className="inline-flex items-center gap-1 rounded-xl bg-slate-100 dark:bg-slate-800 px-3 py-2 font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700">
            Global search (all leads) <ArrowRight className="h-4 w-4" />
          </Link>
          <a href={`/api/export?format=csv&jobId=${id}`} className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 font-medium text-white">
            <Download className="h-4 w-4" /> Quick pack CSV
          </a>
        </div>
      </Section>

      {/* Sticky mobile actions */}
      {selected.size > 0 ? (
        <div className="fixed inset-x-3 bottom-3 z-40 flex items-center gap-2 rounded-2xl bg-slate-900/95 p-3 text-white shadow-2xl backdrop-blur lg:hidden">
          <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs font-bold">{selected.size}</span>
          <button onClick={() => enrich(Array.from(selected))} className="flex-1 rounded-xl bg-teal-600 px-3 py-2.5 text-sm font-medium">
            {busy === "enrich" ? "Enriching…" : "Enrich"}
          </button>
          <button onClick={() => download("csv", true)} className="flex-1 rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-medium">CSV</button>
          <button onClick={deleteSelected} className="flex-1 rounded-xl bg-rose-600 px-3 py-2.5 text-sm font-medium">
            {busy === "delete" ? "…" : "Delete"}
          </button>
        </div>
      ) : items.length > 0 ? (
        <div className="fixed inset-x-3 bottom-3 z-40 flex items-center gap-2 rounded-2xl bg-slate-900/95 p-3 text-white shadow-2xl backdrop-blur lg:hidden">
          <button onClick={() => enrich(items.map((b) => b.id))} className="flex-1 rounded-xl bg-teal-600 px-3 py-2.5 text-sm font-medium">
            {busy === "enrich" ? "Enriching…" : `Enrich all (${items.length})`}
          </button>
          <button onClick={() => download("csv", false)} className="flex-1 rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-medium">CSV</button>
          <button onClick={() => download("xlsx", false)} className="flex-1 rounded-xl bg-white/15 px-3 py-2.5 text-sm font-medium">Excel</button>
        </div>
      ) : null}
    </div>
  );
}


