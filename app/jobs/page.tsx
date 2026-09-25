"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, MapPin, Package, PackageOpen, Plus, RefreshCw } from "lucide-react";
import { Badge, ConfirmButton, EmptyState, PackBadge, ProviderBadge, Section, SkeletonList, packKind, statusTone } from "@/components/ui";
import { cn } from "@/lib/cn";

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

  const shownJobs = kindFilter === "all" ? jobs : jobs.filter((j) => packKind(j) === kindFilter);

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
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="animate-fade-up flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Scraped Packs</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Every scraping creates a pack — open one to see only its own results, enrich and download them.
          </p>
          <div className="mt-2 flex gap-1.5 text-xs">
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
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="inline-flex items-center gap-1.5 rounded-xl bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 ring-1 ring-inset ring-slate-200 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <Link href="/search" className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700">
            <Plus className="h-4 w-4" /> New scraping
          </Link>
        </div>
      </div>

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
          <ul className="stagger grid gap-3 md:grid-cols-2">
          {shownJobs.map((j) => (
            <li key={j.id} className="flex flex-col rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
              <div className="flex items-start gap-3">
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
        </>
      )}
    </div>
  );
}


