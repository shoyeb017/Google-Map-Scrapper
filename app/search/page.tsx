"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Download,
  Globe,
  MousePointerClick,
  Wand2,
  Zap,
} from "lucide-react";
import {
  Badge,
  Button,
  Completeness,
  Field,
  Input,
  ProgressBar,
  ProviderBadge,
  Section,
  Select,
  SocialIcons,
  Toggle,
  statusTone,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { loadExportColumnsAsync } from "@/lib/export-settings";
import { readSSEStream, type StreamLine, type StreamTone } from "@/lib/stream-client";
import { StreamTerminal, nextLine } from "@/components/stream-terminal";

type Mode = "automatic" | "google_places" | "browser_discovery";

const MODES: { id: Mode; title: string; desc: string; icon: typeof Zap }[] = [
  { id: "automatic", title: "Automatic / Fallback", desc: "Primary + fallback with auto retry", icon: Wand2 },
  { id: "google_places", title: "Google Places API", desc: "Official API, needs key", icon: Zap },
  { id: "browser_discovery", title: "Browser Discovery", desc: "Live scrape, no key needed", icon: MousePointerClick },
];

interface Attempt {
  provider: string;
  role: string;
  status: string;
  errorCode?: string;
  errorMessage?: string;
  resultsCount?: number;
  durationMs?: number;
}

interface EnrichSummary {
  id: string;
  name: string;
  emails: number;
  phones: number;
  socials: number;
  pagesCrawled: number;
  error?: string;
}

function SearchForm() {
  const sp = useSearchParams();
  const [form, setForm] = useState({
    keyword: "Restaurants",
    category: "",
    locationText: "Dhaka, Bangladesh",
    radiusMeters: 10000,
    limit: 20,
    discoveryProvider: "browser_discovery" as Mode,
    primaryProvider: "browser_discovery",
    fallbackProvider: "google_places",
    enrichWebsite: true,
    discoverSocial: true,
    discoverContacts: true,
  });
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<StreamLine[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [streamed, setStreamed] = useState(false);

  useEffect(() => {
    const get = (k: string) => sp.get(k);
    setForm((f) => ({
      ...f,
      keyword: get("keyword") ?? f.keyword,
      locationText: get("location") ?? f.locationText,
      category: get("category") ?? f.category,
      radiusMeters: get("radius") ? Number(get("radius")) || f.radiusMeters : f.radiusMeters,
      limit: get("limit") ? Math.min(500, Math.max(1, Number(get("limit")) || f.limit)) : f.limit,
      discoveryProvider: (["automatic", "google_places", "browser_discovery"].includes(get("mode") ?? "")
        ? (get("mode") as Mode)
        : f.discoveryProvider),
      primaryProvider: get("primary") ?? f.primaryProvider,
      fallbackProvider: get("fallback") ?? f.fallbackProvider,
      enrichWebsite: get("enrich") === "0" ? false : get("enrich") === "1" ? true : f.enrichWebsite,
      discoverSocial: get("social") === "0" ? false : get("social") === "1" ? true : f.discoverSocial,
      discoverContacts: get("contacts") === "0" ? false : get("contacts") === "1" ? true : f.discoverContacts,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loading) return;
    const t0 = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 500);
    return () => clearInterval(t);
  }, [loading]);

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  async function run() {
    setLoading(true);
    setElapsed(0);
    setError(null);
    setResult(null);
    setLines([]);
    setStartedAt(Date.now());
    setStreamed(true);
    const push = (text: string, tone: StreamTone = "info") =>
      setLines((prev) => [...prev.slice(-200), nextLine(text, tone)]);
    const q = new URLSearchParams({
      keyword: form.keyword,
      category: form.category,
      location: form.locationText,
      radius: String(Number(form.radiusMeters)),
      limit: String(Number(form.limit)),
      mode: form.discoveryProvider,
      primary: form.primaryProvider,
      fallback: form.fallbackProvider,
      enrich: form.enrichWebsite ? "1" : "0",
      social: form.discoverSocial ? "1" : "0",
      contacts: form.discoverContacts ? "1" : "0",
    });
    try {
      const res = await fetch(`/api/search/stream?${q.toString()}`);
      await readSSEStream(
        res,
        (e) => {
          const t = String(e.t ?? "");
          if (t === "done") {
            setResult(e);
          } else if (t === "error") {
            setError(String(e.message ?? "Search failed"));
            setResult({ providerAttempts: e.attempts ?? [] });
          }
        },
        ({ text, tone }) => push(text, tone)
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Search failed";
      setError(msg);
      push(`✕ ${msg}`, "error");
    } finally {
      setLoading(false);
    }
  }

  async function downloadPackCsv() {
    if (!result?.jobId) return;
    const res = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format: "csv", searchJobId: String(result.jobId), columns: await loadExportColumnsAsync() }),
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pack-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const attempts = (result?.providerAttempts as Attempt[] | undefined) ?? [];
  const businesses = (result?.businesses as Record<string, unknown>[] | undefined) ?? [];
  const enrichment = (result?.enrichment as EnrichSummary[] | undefined) ?? [];
  const stage = useMemo(() => {
    if (!loading) return -1;
    if (elapsed < 8) return 0;
    if (elapsed < 25) return 1;
    return 2;
  }, [loading, elapsed]);
  const stages = ["Discovering businesses", "Saving & deduplicating", "Enriching websites"];

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <div className="animate-fade-up">
        <h1 className="text-xl font-bold sm:text-2xl">New scraping</h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Scrape businesses by keyword and location, then enrich and export.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="flex flex-col gap-4 lg:col-span-3">
          <Section title="What are you looking for?" className="animate-fade-up-1">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Keyword">
                <Input value={form.keyword} onChange={(e) => set("keyword", e.target.value)} placeholder="Restaurants, clinics, software…" />
              </Field>
              <Field label="Category" hint="Optional refinement">
                <Input value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="e.g. Software Company" />
              </Field>
              <Field label="Location" className="sm:col-span-2">
                <Input value={form.locationText} onChange={(e) => set("locationText", e.target.value)} placeholder="Dhaka, Bangladesh" />
              </Field>
              <Field label="Radius (meters)" hint="Used by Google Places">
                <Input type="number" min={100} max={100000} value={form.radiusMeters} onChange={(e) => set("radiusMeters", e.target.value)} />
              </Field>
              <Field label="Max results" hint="1 – 100 for browser, up to 500 for API">
                <Input type="number" min={1} max={500} value={form.limit} onChange={(e) => set("limit", e.target.value)} />
              </Field>
            </div>
          </Section>

          <Section title="Discovery method" subtitle="Browser Discovery works without any API key" className="animate-fade-up-2">
            <div className="grid gap-2 sm:grid-cols-2">
              {MODES.map((m) => {
                const Icon = m.icon;
                const active = form.discoveryProvider === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => set("discoveryProvider", m.id)}
                    className={cn(
                      "flex items-start gap-3 rounded-2xl border-2 p-3 text-left transition",
                      active ? "border-teal-500 bg-teal-50/60 dark:bg-teal-500/10" : "border-slate-200 dark:border-slate-800 hover:border-slate-300"
                    )}
                  >
                    <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", active ? "bg-teal-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400")}>
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">{m.title}</span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400">{m.desc}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            {form.discoveryProvider === "automatic" ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Primary provider">
                  <Select value={form.primaryProvider} onChange={(e) => set("primaryProvider", e.target.value)}>
                    <option value="browser_discovery">Browser Discovery</option>
                    <option value="google_places">Google Places API</option>
                  </Select>
                </Field>
                <Field label="Fallback provider">
                  <Select value={form.fallbackProvider} onChange={(e) => set("fallbackProvider", e.target.value)}>
                    <option value="google_places">Google Places API</option>
                    <option value="browser_discovery">Browser Discovery</option>
                  </Select>
                </Field>
              </div>
            ) : null}
          </Section>

          <Section title="Enrichment" subtitle="Applied to discovered websites" className="animate-fade-up-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:gap-6">
              <Toggle checked={form.enrichWebsite} onChange={(v) => set("enrichWebsite", v)} label="Website crawl (emails, phones, socials)" />
              <Toggle checked={form.discoverSocial} onChange={(v) => set("discoverSocial", v)} label="Social discovery" />
              <Toggle checked={form.discoverContacts} onChange={(v) => set("discoverContacts", v)} label="Contact extraction" />
            </div>
            <Button onClick={run} loading={loading} className="mt-4 w-full py-3 text-base sm:w-auto sm:px-10">
              {loading ? `Working… ${elapsed}s` : "Start scraping"}
            </Button>
          </Section>
        </div>

        {/* Live status column */}
        <div className="flex flex-col gap-4 lg:col-span-2">
          {streamed ? (
            <StreamTerminal
              title={loading ? `SCRAPING — ${form.keyword}` : "SCRAPING LOG"}
              lines={lines}
              running={loading}
              startedAt={startedAt}
            />
          ) : null}
          <Section title="Live status" subtitle={loading ? "Scraping in progress — watch the log above" : "Results appear here"}>
            {loading && !streamed ? (
              <div className="flex flex-col gap-3">
                <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className="progress-slide h-full w-2/5 rounded-full bg-gradient-to-r from-teal-500 to-cyan-500" />
                </div>
                {stages.map((s, i) => (
                  <div key={s} className={cn("flex items-center gap-2 text-sm", i <= stage ? "text-slate-800 dark:text-slate-100" : "text-slate-400 dark:text-slate-500")}>
                    <span className={cn("flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold", i < stage ? "bg-emerald-500 text-white" : i === stage ? "bg-teal-600 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400")}>
                      {i < stage ? "✓" : i + 1}
                    </span>
                    {s}{i === stage ? "…" : ""}
                  </div>
                ))}
                <p className="text-xs text-slate-500 dark:text-slate-400">Browser scraping visits live map pages — it can take 30–90s for 20 results.</p>
              </div>
            ) : null}
            {!loading && result && !error ? (
              <div className="flex flex-col gap-2 text-sm">
                <div className="flex items-center gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2 text-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" /> Scraping completed
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[["Provider", <ProviderBadge key="p" provider={String(result.provider)} />],
                    ["Discovered", String(result.totalDiscovered)],
                    ["Saved", String(result.totalSaved)],
                    ["Duplicates", String(result.totalDuplicates)],
                    ["Enriched", String(result.enrichedCount ?? 0)],
                    ["Backend", String(result.backend)],
                  ].map(([k, v]) => (
                    <div key={k as string} className="rounded-xl bg-slate-50 dark:bg-slate-800/50 px-3 py-2">
                      <div className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{k}</div>
                      <div className="font-semibold">{v}</div>
                    </div>
                  ))}
                </div>
                {result.fallbackUsed ? (
                  <p className="rounded-xl bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">Fallback used: {String(result.fallbackReason)}</p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {result.jobId ? (
                    <Link href={`/jobs/${String(result.jobId)}`} className="inline-flex items-center gap-1 rounded-xl bg-teal-600 px-3 py-2 text-xs font-medium text-white hover:bg-teal-700">
                      Open pack <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  ) : null}
                  <Link href="/businesses" className="inline-flex items-center gap-1 rounded-xl bg-slate-900 dark:bg-slate-100 px-3 py-2 text-xs font-medium text-white dark:text-slate-900">
                    Global search
                  </Link>
                  {result.jobId ? (
                    <button onClick={downloadPackCsv} className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-medium text-white">
                      <Download className="h-3.5 w-3.5" /> Pack CSV
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
            {!loading && !result && !streamed ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Configure on the left, then run. Browser Discovery needs no API key.</p>
            ) : null}

            {attempts.length > 0 ? (
              <div className="mt-3 border-t border-slate-100 dark:border-slate-800/70 pt-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Provider attempts</p>
                <div className="flex flex-col gap-1.5">
                  {attempts.map((a, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium">{a.provider} <span className="text-slate-400 dark:text-slate-500">· {a.role}</span></span>
                      <Badge tone={statusTone(a.status)}>{a.status}{a.resultsCount != null ? ` · ${a.resultsCount}` : ""}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </Section>

          {error ? (
            <Section title="What went wrong">
              <div className="flex items-start gap-2 rounded-xl bg-rose-50 dark:bg-rose-500/10 px-3 py-2.5 text-sm text-rose-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
              {attempts.map((a, i) => (
                <p key={i} className="mt-1.5 text-xs text-slate-600 dark:text-slate-300">
                  <span className="font-medium">{a.provider}:</span> {a.errorMessage || a.errorCode}
                </p>
              ))}
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                No Google key? Use <span className="font-medium">Browser Discovery</span>. Browser failing?
                Check <Link href="/providers" className="text-teal-600 dark:text-teal-400">Providers</Link> health first.
              </p>
            </Section>
          ) : null}
        </div>
      </div>

      {/* Results preview */}
      {businesses.length > 0 ? (
        <Section title={`Discovered (${businesses.length})`} subtitle="Preview — full data in the scraped pack">
          <ul className="grid gap-2 md:grid-cols-2">
            {businesses.slice(0, 12).map((b) => (
              <li key={String(b.id)} className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/businesses/${String(b.id)}`} className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-teal-700 dark:text-teal-300 hover:underline">{String(b.name)}</p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{String(b.formattedAddress || b.city || "")}</p>
                  </Link>
                  <ProviderBadge provider={String((b.providers as string[] ?? [b.sourceProvider])[0] ?? b.sourceProvider)} />
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="truncate">{(b.phones as string[] ?? [])[0] ?? (b.emails as string[] ?? [])[0] ?? "No contact yet"}</span>
                  <SocialIcons links={(b.socialLinks as { platform: string; url: string }[] | undefined) ?? []} iconClass="h-[15px] w-[15px]" />
                </div>
                <div className="mt-1.5 flex justify-end">
                  <Completeness value={Number(b.completenessScore ?? 0)} />
                </div>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {enrichment.length > 0 ? (
        <Section title="Website enrichment" subtitle="Crawled during this search and saved to each business">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-400 dark:text-slate-500">
                  <th className="py-1.5 pr-3">Business</th>
                  <th className="py-1.5 pr-3">Pages</th>
                  <th className="py-1.5 pr-3">Emails</th>
                  <th className="py-1.5 pr-3">Phones</th>
                  <th className="py-1.5">Socials</th>
                </tr>
              </thead>
              <tbody>
                {enrichment.map((e) => (
                  <tr key={e.id} className="border-t border-slate-100 dark:border-slate-800/70">
                    <td className="max-w-52 truncate py-1.5 pr-3 font-medium">{e.name}{e.error ? <span className="block truncate text-xs font-normal text-rose-500">{e.error}</span> : null}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{e.pagesCrawled}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{e.emails}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{e.phones}</td>
                    <td className="py-1.5 tabular-nums">{e.socials}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}

      <p className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
        <Globe className="h-3.5 w-3.5" /> Only publicly visible data is collected. Respect source terms and robots.txt.
      </p>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<ProgressBar value={30} />}>
      <SearchForm />
    </Suspense>
  );
}


