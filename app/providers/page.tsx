"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, Globe, MousePointerClick, RefreshCw, Terminal, Zap } from "lucide-react";
import { Badge, HealthDot, Section, SkeletonList, statusTone } from "@/components/ui";

const META: Record<string, { icon: typeof Zap; setup: string[]; needsKey?: boolean }> = {
  google_places: {
    icon: Zap,
    needsKey: true,
    setup: [
      "Enable “Places API (New)” in Google Cloud Console",
      "Create an API key and restrict it to Places API",
      "Set GOOGLE_MAPS_API_KEY in .env.local (server-only, never in the browser)",
      "Restart the dev server",
    ],
  },
  browser_discovery: {
    icon: MousePointerClick,
    setup: [
      "No API key needed — works out of the box",
      "Needs the Chromium browser: npx playwright install chromium",
      "Stage 1 scrapes live Google Maps result cards + detail pages",
      "Stage 2 falls back to OpenStreetMap automatically",
      "Set BROWSER_DISCOVERY_ENABLED=true (default)",
    ],
  },
  website_enrichment: {
    icon: Globe,
    setup: [
      "Crawls official company websites (homepage + contact/about/services…)",
      "Robots-aware, same-domain, size-limited, SSRF-protected",
      "JS-heavy sites render via headless Chromium when installed",
      "Tune with ENRICHMENT_MAX_PAGES / ENRICHMENT_TIMEOUT_MS",
    ],
  },
  supabase: {
    icon: Terminal,
    setup: [
      "Create a project at supabase.com",
      "Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY",
      "Apply supabase/migrations/*.sql in order",
      "Until then the app uses the local .data/ store with the same pipeline",
    ],
  },
};

export default function ProvidersPage() {
  const [health, setHealth] = useState<Record<string, { status: string; message?: string }>>({});
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="animate-fade-up flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Providers</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Every discovery path, its health and setup.</p>
        </div>
        <button onClick={load} className="inline-flex items-center gap-1.5 rounded-xl bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 ring-1 ring-inset ring-slate-200 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60">
          <RefreshCw className="h-4 w-4" /> Re-check
        </button>
      </div>

      {loading && Object.keys(health).length === 0 ? (
        <SkeletonList rows={4} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {Object.entries(META).map(([key, meta], i) => {
            const h = health[key];
            const Icon = meta.icon;
            return (
              <Section
                key={key}
                title={key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                className={`animate-fade-up-${Math.min(i, 3)}`}
                action={
                  h ? (
                    <span className="flex items-center gap-1.5">
                      <HealthDot status={h.status} />
                      <Badge tone={statusTone(h.status)}>{h.status.replace(/_/g, " ")}</Badge>
                    </span>
                  ) : null
                }
              >
                <div className="mb-2 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-xs">{h?.message ?? "Checking…"}</span>
                </div>
                <ol className="flex flex-col gap-1.5">
                  {meta.setup.map((s, k) => (
                    <li key={k} className="flex items-start gap-2 text-[13px] text-slate-600 dark:text-slate-300">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                      <span className="font-mono text-[12px] leading-relaxed">{s}</span>
                    </li>
                  ))}
                </ol>
              </Section>
            );
          })}
        </div>
      )}

      <Section title="How automatic fallback works" className="animate-fade-up-3">
        <ol className="grid gap-2 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-3">
          {[
            ["1. Primary runs", "Your chosen provider scrapes first."],
            ["2. Failure detected", "Auth, quota, rate-limit, timeout or empty results trigger fallback."],
            ["3. Fallback runs", "The second provider runs; every attempt is stored on the job."],
          ].map(([t, d]) => (
            <li key={t} className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">
              <p className="font-semibold text-slate-900 dark:text-white">{t}</p>
              <p className="mt-0.5 text-xs">{d}</p>
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}

