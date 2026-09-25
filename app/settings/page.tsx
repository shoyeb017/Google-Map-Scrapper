"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, Database, Download, Globe, MonitorSmartphone, Moon, MousePointerClick, Sun, Trash2, Zap } from "lucide-react";
import { Badge, Section, SkeletonList } from "@/components/ui";
import { cn } from "@/lib/cn";
import { applyThemeChoice, currentChoice, type ThemeChoice } from "@/components/theme";

const GROUPS = [
  {
    icon: Zap,
    title: "Google Places",
    vars: [
      ["GOOGLE_MAPS_API_KEY", "Server-only API key for Places API (New). Leave empty to use Browser Discovery."],
    ],
  },
  {
    icon: MousePointerClick,
    title: "Browser Discovery",
    vars: [
      ["BROWSER_DISCOVERY_ENABLED", "true — set false to disable live scraping."],
      ["BROWSER_TIMEOUT_MS", "45000 — navigation timeout per page."],
      ["PLAYWRIGHT_BROWSER", "chromium — install with: npx playwright install chromium"],
    ],
  },
  {
    icon: Globe,
    title: "Website Enrichment",
    vars: [
      ["WEBSITE_ENRICHMENT_ENABLED", "true — crawl official sites for emails/phones/socials."],
      ["ENRICHMENT_MAX_PAGES", "8 — cap per domain (cost control)."],
      ["ENRICHMENT_TIMEOUT_MS", "15000 — per-page fetch timeout."],
    ],
  },
  {
    icon: Database,
    title: "Supabase",
    vars: [
      ["NEXT_PUBLIC_SUPABASE_URL", "Your Supabase project URL."],
      ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "Public anon key (safe for browser)."],
      ["SUPABASE_SERVICE_ROLE_KEY", "Service key — server-only, never expose."],
    ],
  },
  {
    icon: Download,
    title: "Export & storage",
    vars: [
      ["RAW_PAYLOAD_MODE", "normalized-only — or full / none (respects provider ToS)."],
      ["DEFAULT_RESULT_LIMIT / MAX_RESULT_LIMIT", "100 / 500 — cost + load control."],
    ],
  },
];

export default function SettingsPage() {
  const [areas, setAreas] = useState<{ id: string; label: string; description: string; rows: number }[]>([]);
  const [areasLoading, setAreasLoading] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [resetBusy, setResetBusy] = useState(false);
  const [resetArmed, setResetArmed] = useState(false);
  const [resetDone, setResetDone] = useState<string | null>(null);
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>("system");

  useEffect(() => {
    setThemeChoice(currentChoice());
  }, []);

  function loadAreas() {
    setAreasLoading(true);
    fetch("/api/admin/reset")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.areas) setAreas(d.areas);
      })
      .catch(() => undefined)
      .finally(() => setAreasLoading(false));
  }

  useEffect(loadAreas, []);

  function togglePick(id: string) {
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    setResetArmed(false);
    setResetDone(null);
  }

  async function doReset() {
    setResetBusy(true);
    try {
      const res = await fetch("/api/admin/reset", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targets: Array.from(picked) }),
      });
      const data = await res.json();
      if (res.ok) {
        const parts = Object.entries(data.deleted as Record<string, number>)
          .filter(([, n]) => n > 0)
          .map(([k, n]) => `${n} ${k}`);
        setResetDone(`Deleted: ${parts.join(" · ") || "nothing to delete"}.`);
        setPicked(new Set());
        setResetArmed(false);
        loadAreas();
      }
    } finally {
      setResetBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="animate-fade-up">
        <h1 className="text-xl font-bold sm:text-2xl">Settings</h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          All configuration lives in <code className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 font-mono text-xs">.env.local</code> (copy from <code className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 font-mono text-xs">.env.example</code>). Secrets stay server-side.
        </p>
      </div>
      <Section title="Appearance" subtitle="Light, dark, or follow your device — saved on this browser" className="animate-fade-up-1">
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ["light", "Light", Sun],
              ["dark", "Dark", Moon],
              ["system", "System", MonitorSmartphone],
            ] as const
          ).map(([v, label, Icon]) => (
            <button
              key={v}
              onClick={() => {
                applyThemeChoice(v);
                setThemeChoice(v);
              }}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-2xl border-2 px-3 py-3.5 text-sm font-medium transition-all duration-200 active:scale-95",
                themeChoice === v
                  ? "border-teal-500 bg-teal-50/60 text-teal-800 shadow-md shadow-teal-600/15 dark:border-teal-500 dark:bg-teal-500/10 dark:text-teal-200"
                  : "border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:border-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              )}
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
          ))}
        </div>
      </Section>
      <div className="grid gap-3 md:grid-cols-2">
        {GROUPS.map((g, i) => {
          const Icon = g.icon;
          return (
            <Section key={g.title} title={g.title} className={`animate-fade-up-${Math.min(i, 3)}`}>
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400">
                  <Icon className="h-4 w-4" />
                </span>
              </div>
              <dl className="flex flex-col gap-2">
                {g.vars.map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-slate-50 dark:bg-slate-800/50 px-3 py-2">
                    <dt className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-100">{k}</dt>
                    <dd className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{v}</dd>
                  </div>
                ))}
              </dl>
            </Section>
          );
        })}
      </div>
      <Section title="Supabase migrations" subtitle="Run once per project, in order">
        <ol className="list-decimal space-y-1 pl-5 font-mono text-xs text-slate-600 dark:text-slate-300">
          <li>supabase/migrations/001_initial_schema.sql — businesses, contacts, socials, websites</li>
          <li>supabase/migrations/002_jobs_exports_settings.sql — jobs, exports, settings</li>
          <li>supabase/migrations/003_indexes_rls.sql — indexes + row-level security</li>
        </ol>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          No migration update is needed for pack deletes, export-column settings, saved scrapings or data reset — all required tables already exist.
        </p>
      </Section>

      <Section
        title="Danger zone — reset data"
        subtitle="Permanently delete rows from the tables. Export-column settings are configuration and are never reset."
        className="border-rose-200"
      >
        {areasLoading ? (
          <SkeletonList rows={4} />
        ) : (
          <ul className="flex flex-col gap-2">
            {areas.map((a) => {
              const on = picked.has(a.id);
              return (
                <li key={a.id}>
                  <button
                    onClick={() => togglePick(a.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-2xl border-2 p-3 text-left transition",
                      on ? "border-rose-400 bg-rose-50/60" : "border-slate-200 dark:border-slate-800 hover:border-slate-300"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 text-xs font-bold",
                        on ? "border-rose-500 bg-rose-500 text-white" : "border-slate-300 dark:border-slate-700 text-transparent"
                      )}
                    >
                      ✓
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">
                        {a.label} <span className="font-normal text-slate-400 dark:text-slate-500">· {a.rows} rows</span>
                      </span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400">{a.description}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {resetDone ? <p className="mt-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">{resetDone}</p> : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            disabled={picked.size === 0 || resetBusy}
            onClick={() => {
              if (resetArmed) void doReset();
              else {
                setResetArmed(true);
                setTimeout(() => setResetArmed(false), 5000);
              }
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-medium transition disabled:opacity-40",
              resetArmed ? "bg-rose-600 text-white hover:bg-rose-700" : "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-200 hover:bg-rose-100"
            )}
          >
            {resetBusy ? (
              "Deleting…"
            ) : resetArmed ? (
              <>
                <AlertTriangle className="h-4 w-4" /> Click again to permanently delete {picked.size} area{picked.size === 1 ? "" : "s"}
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" /> Delete selected areas
              </>
            )}
          </button>
          <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
            <Badge tone="gray"> irreversible </Badge> Tick first, then confirm. Nothing happens until the second click.
          </span>
        </div>
      </Section>
    </div>
  );
}


