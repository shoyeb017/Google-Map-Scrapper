"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Globe,
  Layers,
  Mail,
  Package,
  Phone,
  Search,
} from "lucide-react";
import { Badge, Card, EmptyState, HealthDot, PackBadge, Section, SkeletonList, StatCard, statusTone } from "@/components/ui";

interface Pack {
  id: string;
  keyword: string;
  locationText: string;
  status: string;
  totalSaved: number;
  totalDiscovered: number;
  createdAt: string;
  providerAttempts?: { provider?: string; status?: string }[];
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, withWebsite: 0, withEmail: 0, withPhone: 0, packs: 0 });
  const [health, setHealth] = useState<Record<string, { status: string; message?: string }>>({});
  const [packs, setPacks] = useState<Pack[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/businesses").then((r) => r.json()).catch(() => null),
      fetch("/api/health").then((r) => r.json()).catch(() => null),
      fetch("/api/jobs").then((r) => r.json()).catch(() => null),
    ]).then(([biz, h, jobs]) => {
      const list = biz?.businesses ?? [];
      setStats({
        total: list.length,
        withWebsite: list.filter((b: { website: string }) => b.website).length,
        withEmail: list.filter((b: { emails: string[] }) => b.emails?.length).length,
        withPhone: list.filter((b: { phones: string[] }) => b.phones?.length).length,
        packs: jobs?.total ?? 0,
      });
      setPacks(((jobs?.jobs ?? []) as Pack[]).slice(0, 7));
      if (h) setHealth(h);
      setLoading(false);
    });
  }, []);

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      {/* Hero */}
      <div className="animate-fade-up overflow-hidden rounded-2xl bg-gradient-to-r from-teal-600 via-teal-600 to-cyan-600 p-5 text-white shadow-lg shadow-teal-600/25 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold sm:text-2xl">Scrape companies. Enrich leads. Export.</h1>
            <p className="mt-1 max-w-xl text-sm text-teal-100">
              Start a new scraping by keyword + location, enrich websites, open each scraped pack
              for its own results, and export to Excel/CSV.
            </p>
          </div>
          <Link
            href="/search"
            className="inline-flex items-center gap-1.5 rounded-xl bg-white dark:bg-slate-900 px-4 py-2.5 text-sm font-semibold text-teal-700 dark:text-teal-300 shadow transition hover:bg-teal-50"
          >
            <Search className="h-4 w-4" /> Start new scraping
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="animate-fade-up-1 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <StatCard icon={Building2} label="Total leads" value={stats.total} tone="indigo" />
        <StatCard icon={Globe} label="With website" value={stats.withWebsite} tone="sky" />
        <StatCard icon={Mail} label="With email" value={stats.withEmail} tone="emerald" />
        <StatCard icon={Phone} label="With phone" value={stats.withPhone} tone="amber" />
        <StatCard icon={Layers} label="Scraped packs" value={stats.packs} tone="violet" />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Recent scraped packs */}
        <Section
          title="Recent scraped packs"
          subtitle="Latest scrapings — open a pack for its own results"
          className="animate-fade-up-2 lg:col-span-3"
          action={
            <Link href="/jobs" className="inline-flex items-center gap-1 text-sm font-medium text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300">
              All packs <ArrowRight className="h-4 w-4" />
            </Link>
          }
        >
          {loading ? (
            <SkeletonList rows={5} />
          ) : packs.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No scraped packs yet"
              hint="Start your first scraping — try “Restaurants” in “Dhaka, Bangladesh” with Browser Discovery."
              action={
                <Link href="/search" className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
                  <Search className="h-4 w-4" /> Start new scraping
                </Link>
              }
            />
          ) : (
            <ul className="slim-scroll stagger flex max-h-96 flex-col gap-2 overflow-y-auto">
              {packs.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/jobs/${p.id}`}
                    className="flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 transition hover:border-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-cyan-500 text-white">
                      <Package className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-900 dark:text-white">{p.keyword}</span>
                      <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                        {p.locationText} · {p.totalSaved} leads
                      </span>
                    </span>
                    <PackBadge job={p} />
                    <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <div className="flex flex-col gap-4 lg:col-span-2">
          {/* Health */}
          <Section title="Provider health" subtitle="Live integration status" className="animate-fade-up-2">
            {loading || Object.keys(health).length === 0 ? (
              <SkeletonList rows={4} />
            ) : (
              <ul className="flex flex-col gap-2">
                {Object.entries(health).map(([k, v]) => (
                  <li key={k} className="flex items-center gap-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 px-3 py-2.5 text-sm">
                    <HealthDot status={v.status} />
                    <span className="font-medium capitalize">{k.replace(/_/g, " ")}</span>
                    <Badge tone={statusTone(v.status)} className="ml-auto">
                      {v.status.replace(/_/g, " ")}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/providers" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300">
              Setup guide <ArrowRight className="h-4 w-4" />
            </Link>
          </Section>

          {/* Global search shortcut */}
          <Section title="Global search" subtitle="All leads together" className="animate-fade-up-3"
            action={
              <Link href="/businesses" className="inline-flex items-center gap-1 text-sm font-medium text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300">
                Open search <ArrowRight className="h-4 w-4" />
              </Link>
            }
          >
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {stats.total} leads in one searchable pool — filter by name, city, provider or missing data.
              Prefer one scraping at a time? Open a scraped pack instead.
            </p>
            <Link href="/jobs" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300">
              Open scraped packs <ArrowRight className="h-4 w-4" />
            </Link>
          </Section>

          {/* Quick card */}
          <Card className="animate-fade-up-3 bg-gradient-to-br from-slate-900 to-teal-950 text-white">
            <p className="text-sm font-semibold">No API key? No problem.</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">
              Browser Discovery scrapes live map listings and OpenStreetMap — no Google key needed.
            </p>
            <Link href="/search" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-teal-300 hover:text-white">
              Try it now <ArrowRight className="h-4 w-4" />
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}




