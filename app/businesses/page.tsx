"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Building2, Download, Filter, Mail, MapPin, Phone, RefreshCw, Search, Globe, Trash2, Zap } from "lucide-react";
import {
  Badge,
  Button,
  Completeness,
  ConfirmButton,
  EmptyState,
  Input,
  NotFound,
  ProviderBadge,
  Select,
  SkeletonList,
  SocialIcons,
} from "@/components/ui";
import { cn } from "@/lib/cn";

interface Biz {
  id: string;
  name: string;
  primaryCategory?: string;
  phones?: string[];
  emails?: string[];
  website?: string;
  city?: string;
  country?: string;
  mapsUrl?: string;
  sourceProvider: string;
  providers?: string[];
  socialLinks?: { platform: string; url: string }[];
  completenessScore?: number;
}

const PAGE_SIZE = 20;

export default function BusinessesPage() {
  const [items, setItems] = useState<Biz[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [provider, setProvider] = useState("");
  const [only, setOnly] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState<"enrich" | "csv" | "xlsx" | "delete" | null>(null);

  async function load() {
    setLoading(true);
    setPage(0);
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (provider) p.set("provider", provider);
    if (only === "website") p.set("hasWebsite", "yes");
    if (only === "email") p.set("hasEmail", "yes");
    if (only === "phone") p.set("hasPhone", "yes");
    try {
      const res = await fetch(`/api/businesses?${p.toString()}`);
      const data = await res.json();
      setItems(data.businesses ?? []);
    } catch {
      setItems([]);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pageItems = useMemo(() => items.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE), [items, page]);

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function togglePage() {
    setSelected((s) => {
      const n = new Set(s);
      const allIn = pageItems.every((b) => n.has(b.id));
      if (allIn) pageItems.forEach((b) => n.delete(b.id));
      else pageItems.forEach((b) => n.add(b.id));
      return n;
    });
  }

  async function bulkEnrich() {
    setBusy("enrich");
    try {
      await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessIds: Array.from(selected) }),
      });
      await load();
      setSelected(new Set());
    } finally {
      setBusy(null);
    }
  }

  async function bulkDelete() {
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

  async function deleteOne(bid: string) {
    await fetch(`/api/businesses/${bid}`, { method: "DELETE" });
    setItems((prev) => prev.filter((b) => b.id !== bid));
    setSelected((s) => {
      const n = new Set(s);
      n.delete(bid);
      return n;
    });
  }

  async function bulkExport(format: "csv" | "xlsx") {
    setBusy(format);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, selectedIds: Array.from(selected) }),
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `businesses-${Date.now()}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-24 lg:pb-0">
      <div className="animate-fade-up flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Search</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            {items.length} leads in the global pool{selected.size > 0 ? ` · ${selected.size} selected` : ""} — filter anything, all together.
          </p>
        </div>
        <div className="hidden flex-wrap gap-2 lg:flex">
          <Button variant="dark" onClick={bulkEnrich} disabled={!selected.size} loading={busy === "enrich"}>
            <Zap className="h-4 w-4" /> Enrich selected
          </Button>
          <Button variant="success" onClick={() => bulkExport("csv")} loading={busy === "csv"}>
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button variant="secondary" onClick={() => bulkExport("xlsx")} loading={busy === "xlsx"}>
            <Download className="h-4 w-4" /> Excel
          </Button>
          {selected.size > 0 ? (
            <ConfirmButton title={`Delete (${selected.size})`} confirmTitle="Confirm delete?" busy={busy === "delete"} onConfirm={bulkDelete} />
          ) : null}
        </div>
      </div>

      {/* Filters */}
      <div className="animate-fade-up-1 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-sm sm:p-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_180px_180px_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
              placeholder="Search name, city…"
              className="pl-9"
            />
          </div>
          <Select value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="">All providers</option>
            <option value="google_places">Google Places</option>
            <option value="browser_discovery">Browser</option>
          </Select>
          <Select value={only} onChange={(e) => setOnly(e.target.value)}>
            <option value="">Any data</option>
            <option value="website">Has website</option>
            <option value="email">Has email</option>
            <option value="phone">Has phone</option>
          </Select>
          <Button onClick={load} loading={loading} className="sm:col-span-2 lg:col-span-1">
            <Filter className="h-4 w-4" /> Apply
          </Button>
        </div>
      </div>

      {loading ? (
        <SkeletonList rows={8} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No leads found"
          hint="Try a broader filter — or start a new scraping to collect fresh leads."
          action={
            <Link href="/search" className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white">
              <Search className="h-4 w-4" /> New scraping
            </Link>
          }
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="animate-fade-up-2 hidden overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm lg:block">
            <div className="slim-scroll overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800/70 bg-slate-50/70 dark:bg-slate-800/50 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <th className="w-10 px-3 py-3">
                      <input type="checkbox" checked={pageItems.length > 0 && pageItems.every((b) => selected.has(b.id))} onChange={togglePage} className="h-4 w-4 accent-teal-600" />
                    </th>
                    <th className="px-3 py-3">Business</th>
                    <th className="px-3 py-3">Contact</th>
                    <th className="px-3 py-3">Website</th>
                    <th className="px-3 py-3">Socials</th>
                    <th className="px-3 py-3">Map</th>
                    <th className="px-3 py-3">Location</th>
                    <th className="px-3 py-3">Provider</th>
                    <th className="px-3 py-3">Complete</th>
                    <th className="w-12 px-3 py-3"><span className="sr-only">Delete</span></th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((b) => (
                    <tr key={b.id} className={cn("border-b border-slate-100 dark:border-slate-800/70 last:border-0 transition hover:bg-teal-50/40", selected.has(b.id) ? "bg-teal-50/60 dark:bg-teal-500/10" : "")}>
                      <td className="px-3 py-3">
                        <input type="checkbox" checked={selected.has(b.id)} onChange={() => toggle(b.id)} className="h-4 w-4 accent-teal-600" />
                      </td>
                      <td className="max-w-64 px-3 py-3">
                        <Link href={`/businesses/${b.id}`} className="block truncate font-semibold text-slate-900 dark:text-white hover:text-teal-700 dark:hover:text-teal-300 hover:underline">
                          {b.name}
                        </Link>
                        <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{b.primaryCategory || "—"}</span>
                      </td>
                      <td className="max-w-52 px-3 py-3 text-xs">
                        <span className="flex items-center gap-1.5">
                          {b.phones?.[0] ? (<><Phone className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" /><span className="truncate">{b.phones[0]}</span></>) : <NotFound what="Phone" />}
                        </span>
                        <span className="mt-1 flex items-center gap-1.5">
                          {b.emails?.[0] ? (<><Mail className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" /><span className="truncate">{b.emails[0]}</span></>) : <NotFound what="Email" />}
                        </span>
                      </td>
                      <td className="max-w-48 px-3 py-3 text-xs">
                        {b.website ? (
                          <a href={b.website.startsWith("http") ? b.website : `https://${b.website}`} target="_blank" rel="noreferrer" className="flex max-w-44 items-center gap-1 truncate text-cyan-600 dark:text-cyan-400 hover:underline">
                            <Globe className="h-3 w-3 shrink-0" />{b.website.replace(/^https?:\/\//, "").slice(0, 30)}
                          </a>
                        ) : <NotFound what="Website" />}
                      </td>
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
                      <td className="max-w-40 truncate px-3 py-3 text-xs text-slate-600 dark:text-slate-300">
                        {[b.city, b.country].filter(Boolean).join(", ") || "—"}
                      </td>
                      <td className="px-3 py-3">
                        <ProviderBadge provider={(b.providers ?? [b.sourceProvider])[0] ?? b.sourceProvider} />
                      </td>
                      <td className="px-3 py-3">
                        <Completeness value={b.completenessScore ?? 0} />
                      </td>
                      <td className="px-3 py-3">
                        <button
                          aria-label={`Delete ${b.name}`}
                          onClick={() => deleteOne(b.id)}
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

          {/* Mobile cards */}
          <ul className="flex flex-col gap-2 lg:hidden">
            {pageItems.map((b) => (
              <li
                key={b.id}
                className={cn("rounded-2xl border bg-white dark:bg-slate-900 p-3.5 shadow-sm", selected.has(b.id) ? "border-teal-400 ring-2 ring-teal-100 dark:ring-teal-500/30" : "border-slate-200/80 dark:border-slate-800")}
              >
                <div className="flex items-start gap-2.5">
                  <input type="checkbox" checked={selected.has(b.id)} onChange={() => toggle(b.id)} className="mt-1 h-5 w-5 shrink-0 accent-teal-600" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/businesses/${b.id}`} className="truncate font-semibold text-slate-900 dark:text-white">
                        {b.name}
                      </Link>
                      <button
                        aria-label={`Delete ${b.name}`}
                        onClick={() => deleteOne(b.id)}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{[b.primaryCategory, b.city].filter(Boolean).join(" · ") || "—"}</p>
                    <div className="mt-1.5 flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-300">
                      <span>{b.phones?.[0] ? (<span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />{b.phones[0]}</span>) : <NotFound what="Phone" />}</span>
                      <span className="truncate">{b.emails?.[0] ? (<span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />{b.emails[0]}</span>) : <NotFound what="Email" />}</span>
                      <span className="truncate">{b.website ? (<span className="inline-flex items-center gap-1 text-cyan-600 dark:text-cyan-400"><Globe className="h-3.5 w-3.5" />{b.website.replace(/^https?:\/\//, "").slice(0, 28)}</span>) : <NotFound what="Website" />}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <ProviderBadge provider={(b.providers ?? [b.sourceProvider])[0] ?? b.sourceProvider} />
                      <span className="flex items-center gap-2">
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
                        <SocialIcons links={b.socialLinks} iconClass="h-[18px] w-[18px]" />
                      </span>
                    </div>
                    <div className="mt-1.5 flex justify-end">
                      <Completeness value={b.completenessScore ?? 0} />
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {/* Pagination */}
          <div className="flex items-center justify-between text-sm">
            <Button variant="secondary" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Previous</Button>
            <span className="text-slate-500 dark:text-slate-400">Page {page + 1} of {totalPages}</span>
            <Button variant="secondary" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </>
      )}

      {/* Refresh */}
      <div className="flex justify-center">
        <button onClick={load} className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800">
          <RefreshCw className="h-4 w-4" /> Refresh list
        </button>
      </div>

      {/* Sticky mobile bulk bar */}
      {selected.size > 0 ? (
        <div className="fixed inset-x-3 bottom-3 z-40 flex items-center gap-2 rounded-2xl bg-slate-900/95 p-3 text-white shadow-2xl backdrop-blur lg:hidden">
          <Badge tone="violet" className="bg-white/15 text-white">{selected.size}</Badge>
          <button onClick={bulkEnrich} className="flex-1 rounded-xl bg-teal-600 px-3 py-2.5 text-sm font-medium">
            {busy === "enrich" ? "Enriching…" : "Enrich"}
          </button>
          <button onClick={() => bulkExport("csv")} className="flex-1 rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-medium">
            CSV
          </button>
          <button onClick={bulkDelete} className="flex-1 rounded-xl bg-rose-600 px-3 py-2.5 text-sm font-medium">
            {busy === "delete" ? "…" : "Delete"}
          </button>
          <button onClick={() => bulkExport("xlsx")} className="flex-1 rounded-xl bg-white/15 px-3 py-2.5 text-sm font-medium">
            Excel
          </button>
        </div>
      ) : null}
    </div>
  );
}


