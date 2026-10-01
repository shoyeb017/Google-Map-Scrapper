"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Bookmark, Plus, Trash2 } from "lucide-react";
import { Badge, Button, EmptyState, Field, Input, Section, Select, SkeletonList, Toggle } from "@/components/ui";
import { rangeSelectTitle, useRangeSelect } from "@/lib/range-select";

interface Saved {
  id: string;
  name: string;
  keyword: string;
  locationText: string;
  category?: string;
  radiusMeters?: number;
  requestedLimit?: number;
  discoveryProvider?: string;
  primaryProvider?: string;
  fallbackProvider?: string;
  enrichWebsite?: boolean;
  discoverSocial?: boolean;
  discoverContacts?: boolean;
  local?: boolean;
}

const LEGACY_KEY = "leadscraper.savedSearches";

function runHref(s: Saved): string {
  const p = new URLSearchParams();
  p.set("keyword", s.keyword);
  if (s.locationText) p.set("location", s.locationText);
  if (s.category) p.set("category", s.category);
  if (s.radiusMeters) p.set("radius", String(s.radiusMeters));
  if (s.requestedLimit) p.set("limit", String(s.requestedLimit));
  if (s.discoveryProvider) p.set("mode", s.discoveryProvider);
  if (s.primaryProvider) p.set("primary", s.primaryProvider);
  if (s.fallbackProvider) p.set("fallback", s.fallbackProvider);
  if (s.enrichWebsite === false) p.set("enrich", "0");
  if (s.discoverSocial === false) p.set("social", "0");
  if (s.discoverContacts === false) p.set("contacts", "0");
  return `/search?${p.toString()}`;
}

export default function SavedScrapingsPage() {
  const [items, setItems] = useState<Saved[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [view, setView] = useState<"full" | "list">("full");
  const [query, setQuery] = useState("");
  const [areaFilter, setAreaFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [sort, setSort] = useState("name");

  // Persist view + filters ("it should save the state").
  useEffect(() => {
    try {
      const v = window.localStorage.getItem("leadscraper.savedView");
      if (v === "list" || v === "full") setView(v);
      const f = window.localStorage.getItem("leadscraper.savedFilters");
      if (f) {
        const s = JSON.parse(f) as { query?: string; area?: string; method?: string; sort?: string };
        if (typeof s.query === "string") setQuery(s.query);
        if (typeof s.area === "string") setAreaFilter(s.area);
        if (typeof s.method === "string") setMethodFilter(s.method);
        if (typeof s.sort === "string") setSort(s.sort);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("leadscraper.savedView", view);
    } catch {
      /* ignore */
    }
  }, [view]);

  useEffect(() => {
    try {
      window.localStorage.setItem("leadscraper.savedFilters", JSON.stringify({ query, area: areaFilter, method: methodFilter, sort }));
    } catch {
      /* ignore */
    }
  }, [query, areaFilter, methodFilter, sort]);

  const areas = Array.from(new Set(items.map((s) => (s.locationText ?? "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));

  const shownItems = items
    .filter((s) => {
      const q = query.trim().toLowerCase();
      if (q && !`${s.name} ${s.keyword} ${s.locationText ?? ""} ${s.category ?? ""}`.toLowerCase().includes(q)) return false;
      if (areaFilter !== "all" && (s.locationText ?? "").trim() !== areaFilter) return false;
      if (methodFilter !== "all" && (s.discoveryProvider ?? "automatic") !== methodFilter) return false;
      return true;
    })
    .sort((a, b) => {
      if (sort === "keyword") return (a.keyword ?? "").localeCompare(b.keyword ?? "");
      if (sort === "location") return (a.locationText ?? "").localeCompare(b.locationText ?? "");
      if (sort === "limit") return (b.requestedLimit ?? 0) - (a.requestedLimit ?? 0);
      return (a.name ?? "").localeCompare(b.name ?? "");
    });

  const range = useRangeSelect();
  const shownIds = shownItems.map((s) => s.id);

  // Send selected recipes to New Scraping with the bulk table prefilled.
  // Shared method comes from the first selected recipe.
  function bulkHref(): string {
    const picked = items.filter((s) => selected.has(s.id));
    const rows = picked.map((s) => ({
      keyword: s.keyword ?? "",
      category: s.category ?? "",
      locationText: s.locationText ?? "",
      radiusMeters: s.radiusMeters ?? 10000,
      limit: s.requestedLimit ?? 20,
    }));
    const p = new URLSearchParams();
    p.set("bulk", JSON.stringify(rows));
    const first = picked[0];
    if (first?.discoveryProvider) p.set("mode", first.discoveryProvider);
    if (first?.primaryProvider) p.set("primary", first.primaryProvider);
    if (first?.fallbackProvider) p.set("fallback", first.fallbackProvider);
    if (first?.enrichWebsite === false) p.set("enrich", "0");
    if (first?.discoverSocial === false) p.set("social", "0");
    if (first?.discoverContacts === false) p.set("contacts", "0");
    return `/search?${p.toString()}`;
  }
  const [form, setForm] = useState({
    name: "",
    keyword: "",
    location: "",
    category: "",
    radius: "10000",
    limit: "20",
    mode: "automatic",
    primary: "browser_discovery",
    fallback: "google_places",
    enrich: true,
    social: true,
    contacts: true,
  });

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    fetch("/api/saved-searches")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.items?.length) {
          setItems(d.items);
        } else {
          // migrate legacy browser-only entries once
          try {
            const raw = localStorage.getItem(LEGACY_KEY);
            if (raw) {
              const legacy = JSON.parse(raw) as { name: string; keyword: string; location?: string }[];
              setItems(
                legacy.map((l, i) => ({
                  id: `local-${i}`,
                  name: l.name,
                  keyword: l.keyword,
                  locationText: l.location ?? "",
                  local: true,
                }))
              );
            }
          } catch {
            /* ignore */
          }
        }
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    if (!form.name.trim() || !form.keyword.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/saved-searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          keyword: form.keyword.trim(),
          locationText: form.location.trim(),
          category: form.category.trim() || undefined,
          radiusMeters: Number(form.radius) || undefined,
          requestedLimit: Number(form.limit) || undefined,
          discoveryProvider: form.mode,
          primaryProvider: form.primary,
          fallbackProvider: form.fallback,
          enrichWebsite: form.enrich,
          discoverSocial: form.social,
          discoverContacts: form.contacts,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setItems((p) => [data.item, ...p]);
        setForm((f) => ({ ...f, name: "", keyword: "", location: "", category: "" }));
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove(s: Saved) {
    setSelected((prev) => {
      const n = new Set(prev);
      n.delete(s.id);
      return n;
    });
    if (s.local || s.id.startsWith("local-")) {
      setItems((p) => p.filter((x) => x.id !== s.id));
      return;
    }
    await fetch(`/api/saved-searches/${s.id}`, { method: "DELETE" });
    setItems((p) => p.filter((x) => x.id !== s.id));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="animate-fade-up flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Saved Scrapings</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Full scraping recipes — keyword, location, providers, limits and enrichment — stored in the database. One tap re-runs them with every setting prefilled.
            {selected.size > 0 ? ` · ${selected.size} selected` : ""}
          </p>
        </div>
        {selected.size > 0 ? (
          <Link
            href={bulkHref()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700"
          >
            Send {selected.size} to bulk <ArrowRight className="h-4 w-4" />
          </Link>
        ) : null}
      </div>

      <Section title="Save a scraping" subtitle="Every field is stored and prefilled on re-run" className="animate-fade-up-1">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Name"><Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Dhaka restaurants" /></Field>
          <Field label="Keyword"><Input value={form.keyword} onChange={(e) => set("keyword", e.target.value)} placeholder="Restaurants" /></Field>
          <Field label="Location"><Input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="Dhaka, Bangladesh" /></Field>
          <Field label="Category (optional)"><Input value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="e.g. Cafe" /></Field>
          <Field label="Radius (meters)"><Input type="number" value={form.radius} onChange={(e) => set("radius", e.target.value)} /></Field>
          <Field label="Max results"><Input type="number" min={1} max={500} value={form.limit} onChange={(e) => set("limit", e.target.value)} /></Field>
          <Field label="Discovery method">
            <Select value={form.mode} onChange={(e) => set("mode", e.target.value)}>
              <option value="automatic">Automatic / Fallback</option>
              <option value="google_places">Google Places API</option>
              <option value="browser_discovery">Browser Discovery</option>
            </Select>
          </Field>
          <Field label="Primary provider">
            <Select value={form.primary} onChange={(e) => set("primary", e.target.value)}>
              <option value="browser_discovery">Browser Discovery</option>
              <option value="google_places">Google Places API</option>
            </Select>
          </Field>
          <Field label="Fallback provider">
            <Select value={form.fallback} onChange={(e) => set("fallback", e.target.value)}>
              <option value="google_places">Google Places API</option>
              <option value="browser_discovery">Browser Discovery</option>
            </Select>
          </Field>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 sm:col-span-2 lg:col-span-3">
            <Toggle checked={form.enrich} onChange={(v) => set("enrich", v)} label="Website crawl" />
            <Toggle checked={form.social} onChange={(v) => set("social", v)} label="Social discovery" />
            <Toggle checked={form.contacts} onChange={(v) => set("contacts", v)} label="Contact extraction" />
          </div>
        </div>
        <Button onClick={save} loading={saving} className="mt-3 w-full sm:w-auto">
          <Plus className="h-4 w-4" /> Save scraping
        </Button>
      </Section>

      {/* Search / filter toolbar + Full / List view */}
      <Section title="Browse saved scrapings" subtitle={`${shownItems.length} of ${items.length} shown`} className="animate-fade-up-2">
        <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, keyword, area, category…" className="w-full lg:w-64" />
          <Select value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)} aria-label="Filter by area" className="w-full lg:w-52">
            <option value="all">Area: All ({items.length})</option>
            {areas.map((a) => (
              <option key={a} value={a}>{a} ({items.filter((s) => (s.locationText ?? "").trim() === a).length})</option>
            ))}
          </Select>
          <Select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)} aria-label="Filter by discovery method" className="w-full lg:w-52">
            <option value="all">Method: All</option>
            <option value="automatic">Automatic / Fallback</option>
            <option value="google_places">Google Places API</option>
            <option value="browser_discovery">Browser Discovery</option>
          </Select>
          <Select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort saved scrapings" className="w-full lg:w-auto">
            <option value="name">Sort: Name A–Z</option>
            <option value="keyword">Sort: Keyword A–Z</option>
            <option value="location">Sort: Area A–Z</option>
            <option value="limit">Sort: Most results</option>
          </Select>
          <span className="inline-flex w-fit overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800 text-xs">
            <button onClick={() => setView("full")} className={`px-3 py-1.5 font-medium ${view === "full" ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-500"}`}>Full view</button>
            <button onClick={() => setView("list")} className={`px-3 py-1.5 font-medium ${view === "list" ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-500"}`}>List view</button>
          </span>
          {(query || areaFilter !== "all" || methodFilter !== "all") ? (
            <button onClick={() => { setQuery(""); setAreaFilter("all"); setMethodFilter("all"); }} className="w-fit rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-200 dark:hover:bg-slate-700">Clear filters</button>
          ) : null}
        </div>
        <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">Tip: tick one checkbox, then Shift+click another to select everything between.</p>
      </Section>

      {loading ? (
        <SkeletonList rows={3} />
      ) : items.length === 0 ? (
        <EmptyState icon={Bookmark} title="No saved scrapings" hint="Save a full recipe above for one-tap re-runs with all settings prefilled." />
      ) : shownItems.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white/60 p-6 text-center text-sm text-slate-500 dark:text-slate-400">
          No saved scrapings match — try another search or filter.
        </p>
      ) : view === "list" ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="slim-scroll overflow-x-auto">
            <table className="dtable min-w-full">
              <thead>
                <tr>
                  <th className="w-10 px-3 py-3"><input type="checkbox" checked={shownItems.length > 0 && shownItems.every((s) => selected.has(s.id))} onChange={() => { setSelected(shownItems.every((s) => selected.has(s.id)) ? new Set() : new Set(shownItems.map((s) => s.id))); range.reset(); }} className="h-4 w-4 accent-teal-600" aria-label="Select all saved scrapings" title={rangeSelectTitle} /></th>
                  <th className="px-3 py-3">Name</th>
                  <th className="px-3 py-3">Keyword</th>
                  <th className="px-3 py-3">Area</th>
                  <th className="px-3 py-3">Max</th>
                  <th className="px-3 py-3">Method</th>
                  <th className="px-3 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {shownItems.map((s) => (
                  <tr key={s.id} className={selected.has(s.id) ? "row-selected" : ""}>
                    <td className="px-3 py-2.5"><input type="checkbox" checked={selected.has(s.id)} className="h-4 w-4 accent-teal-600" aria-label={`Select ${s.name} for bulk`} {...range.box(s.id, shownIds, selected, setSelected)} /></td>
                    <td className="max-w-52 px-3 py-2.5"><span className="block truncate font-semibold">{s.name}</span>{s.local ? <Badge tone="gray">this device</Badge> : null}</td>
                    <td className="max-w-44 truncate px-3 py-2.5 text-xs">{s.keyword}{s.category ? ` · ${s.category}` : ""}</td>
                    <td className="max-w-48 truncate px-3 py-2.5 text-xs text-slate-500">{s.locationText || "—"}</td>
                    <td className="px-3 py-2.5 tabular-nums">{s.requestedLimit ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500">{(s.discoveryProvider ?? "automatic").replace(/_/g, " ")}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <span className="flex items-center justify-end gap-1.5">
                        <Link href={runHref(s)} className="inline-flex items-center gap-1 rounded-lg bg-teal-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-teal-700">Run <ArrowRight className="h-3.5 w-3.5" /></Link>
                        <button onClick={() => remove(s)} aria-label="Delete saved scraping" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shownItems.map((s) => (
            <div key={s.id} className={`rounded-2xl border bg-white dark:bg-slate-900 p-4 shadow-sm ${selected.has(s.id) ? "border-teal-400 ring-2 ring-teal-100 dark:ring-teal-500/30" : "border-slate-200/80 dark:border-slate-800"}`}>
              <p className="flex items-center gap-2 font-semibold">
                <input
                  type="checkbox"
                  checked={selected.has(s.id)}
                  aria-label={`Select ${s.name} for bulk`}
                  className="h-5 w-5 shrink-0 accent-teal-600"
                  {...range.box(s.id, shownIds, selected, setSelected)}
                />
                <Bookmark className="h-4 w-4 shrink-0 text-teal-500" />
                <span className="truncate">{s.name}</span>
                {s.local ? <Badge tone="gray">this device</Badge> : null}
              </p>
              <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">{s.keyword}{s.locationText ? ` · ${s.locationText}` : ""}</p>
              <div className="mt-1.5 flex flex-wrap gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                {s.category ? <span className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5">{s.category}</span> : null}
                {s.requestedLimit ? <span className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5">≤ {s.requestedLimit}</span> : null}
                {s.discoveryProvider ? <span className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5">{s.discoveryProvider.replace(/_/g, " ")}</span> : null}
                {s.enrichWebsite === false ? <span className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5">no crawl</span> : null}
              </div>
              <div className="mt-3 flex gap-2">
                <Link
                  href={runHref(s)}
                  className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700"
                >
                  Run <ArrowRight className="h-4 w-4" />
                </Link>
                <button
                  onClick={() => remove(s)}
                  aria-label="Delete saved scraping"
                  className="flex w-10 items-center justify-center rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


