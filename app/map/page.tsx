"use client";
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowRight, ExternalLink, Mail, Map as MapIcon, MapPin, Phone, Search } from "lucide-react";
import { Completeness, EmptyState, Input, NotFound, ProviderBadge, SkeletonList } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { MapPoint } from "@/components/map-view";

const MapView = dynamic(() => import("@/components/map-view"), {
  ssr: false,
  loading: () => <div className="skeleton h-full min-h-80 w-full" />,
});

interface Item {
  id: string;
  name: string;
  primaryCategory?: string;
  phones?: string[];
  emails?: string[];
  website?: string;
  formattedAddress?: string;
  latitude?: number;
  longitude?: number;
  city?: string;
  country?: string;
  mapsUrl?: string;
  sourceProvider: string;
  providers?: string[];
  enrichmentStatus?: string;
  completenessScore?: number;
}

export default function MapPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch("/api/businesses")
      .then((r) => r.json())
      .then((d) => setItems((d.businesses ?? []).filter((b: Item) => b.latitude && b.longitude)))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const shown = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return items;
    return items.filter((b) =>
      `${b.name} ${b.city ?? ""} ${b.country ?? ""} ${b.primaryCategory ?? ""}`.toLowerCase().includes(query)
    );
  }, [items, q]);

  const sel = items.find((i) => i.id === active) ?? shown[0] ?? items[0];
  const center = useMemo(() => {
    if (sel) return { lat: Number(sel.latitude), lng: Number(sel.longitude) };
    return { lat: 23.81, lng: 90.41 };
  }, [sel]);

  const points: MapPoint[] = useMemo(
    () =>
      shown.map((b) => ({
        id: b.id,
        name: b.name,
        lat: Number(b.latitude),
        lng: Number(b.longitude),
        address: b.formattedAddress,
        website: b.website,
      })),
    [shown]
  );
  const scrapedIds = useMemo(
    () => new Set(items.filter((b) => b.enrichmentStatus === "enriched").map((b) => b.id)),
    [items]
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="animate-fade-up">
        <h1 className="text-xl font-bold sm:text-2xl">Map</h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Every geocoded lead on one interactive map — search, tap a pin, see details.
        </p>
      </div>

      {loading ? (
        <SkeletonList rows={4} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={MapIcon}
          title="Nothing to map yet"
          hint="Geocoded leads appear here after a scraping with Browser Discovery or Google Places."
          action={<Link href="/search" className="mt-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white">Start scraping</Link>}
        />
      ) : (
        <>
          <div className="animate-fade-up-1 relative max-w-xl">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search leads on the map — name, city, category…"
              className="h-12 rounded-2xl pl-10 text-[15px] shadow-md shadow-slate-200/60"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="animate-fade-up-1 overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm lg:col-span-2">
              <div className="h-80 sm:h-[440px] lg:h-[520px]">
                <MapView points={points} center={center} activeId={sel?.id ?? null} scrapedIds={scrapedIds} onSelect={setActive} />
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 dark:border-slate-800/70 px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#ea4335]" /> lead</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> enriched</span>
                <span className="ml-auto tabular-nums">{points.length} pins{q ? ` · “${q}”` : ""}</span>
              </div>
            </div>

            <div className="flex min-h-0 flex-col gap-3">
              {sel ? (
                <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
                  <p className="flex items-start gap-2 font-semibold">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />
                    <span className="min-w-0">{sel.name}</span>
                  </p>
                  <p className="mt-0.5 truncate pl-6 text-xs text-slate-500 dark:text-slate-400">
                    {[sel.primaryCategory, sel.city, sel.country].filter(Boolean).join(" · ") || "—"}
                  </p>
                  {sel.formattedAddress ? <p className="mt-1 pl-6 text-xs text-slate-600 dark:text-slate-300">{sel.formattedAddress}</p> : null}
                  <div className="mt-2 flex flex-col gap-1.5 pl-6 text-xs">
                    <span className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                      {sel.phones?.[0] ?? <NotFound what="Phone" />}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                      {sel.emails?.[0] ? <span className="truncate">{sel.emails[0]}</span> : <NotFound what="Email" />}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <ProviderBadge provider={(sel.providers ?? [sel.sourceProvider])[0] ?? sel.sourceProvider} />
                      <span className="tabular-nums text-slate-400 dark:text-slate-500">{Number(sel.latitude).toFixed(4)}, {Number(sel.longitude).toFixed(4)}</span>
                    </span>
                  </div>
                  <div className="mt-2 pl-6"><Completeness value={sel.completenessScore ?? 0} /></div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href={`/businesses/${sel.id}`} className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-teal-600 px-3 py-2 text-xs font-medium text-white hover:bg-teal-700">
                      Full details <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                    <a
                      href={sel.mapsUrl || `https://www.google.com/maps/search/?api=1&query=${sel.latitude},${sel.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-xl bg-slate-900 dark:bg-slate-100 px-3 py-2 text-xs font-medium text-white dark:text-slate-900"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Maps
                    </a>
                  </div>
                </div>
              ) : null}

              <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-sm">
                <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Leads ({shown.length})</p>
                <ul className="slim-scroll flex max-h-72 flex-col gap-1 overflow-y-auto lg:max-h-80">
                  {shown.slice(0, 200).map((b) => (
                    <li key={b.id}>
                      <button
                        onClick={() => setActive(b.id)}
                        className={cn("flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition", b.id === (sel?.id ?? null) ? "bg-teal-50 dark:bg-teal-500/10 ring-1 ring-inset ring-teal-200" : "hover:bg-slate-50 dark:hover:bg-slate-800/60")}
                      >
                        <MapPin className={cn("h-4 w-4 shrink-0", b.id === (sel?.id ?? null) ? "text-teal-600 dark:text-teal-400" : "text-slate-300")} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{b.name}</span>
                          <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{[b.city, b.country].filter(Boolean).join(", ")}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}


