"use client";
import { useEffect, useState } from "react";
import { RefreshCw, ScrollText } from "lucide-react";
import { Badge, ConfirmButton, EmptyState, Section, SkeletonList, statusTone } from "@/components/ui";

interface Log {
  action?: string;
  entity?: string;
  entity_id?: string;
  provider?: string;
  result?: string;
  error?: string;
  at?: string;
  created_at?: string;
  metadata?: unknown;
}

export default function LogsPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  function load() {
    setLoading(true);
    fetch("/api/audit?limit=200")
      .then((r) => r.json())
      .then((d) => setLogs(d.logs ?? []))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const shown = filter ? logs.filter((l) => (l.action ?? "").toLowerCase().includes(filter.toLowerCase())) : logs;

  return (
    <div className="flex flex-col gap-4">
      <div className="animate-fade-up flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Logs</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{logs.length} audit events · searches, fallbacks, crawls, exports</p>
        </div>
        <div className="flex gap-2">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter actions…"
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm shadow-sm"
          />
          <button onClick={load} className="inline-flex items-center gap-1.5 rounded-xl bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 ring-1 ring-inset ring-slate-200 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          {logs.length > 0 ? (
            <ConfirmButton
              title="Clear all"
              confirmTitle="Clear all logs?"
              onConfirm={async () => {
                await fetch("/api/audit", { method: "DELETE" });
                load();
              }}
            />
          ) : null}
        </div>
      </div>

      <Section title="Audit trail">
        {loading ? (
          <SkeletonList rows={8} />
        ) : shown.length === 0 ? (
          <EmptyState icon={ScrollText} title="No events yet" hint="Run a scraping or export — every action is recorded here." />
        ) : (
          <>
            {/* Desktop table */}
            <div className="slim-scroll hidden overflow-x-auto md:block">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-slate-400 dark:text-slate-500">
                    <th className="py-1.5 pr-3">Time</th>
                    <th className="py-1.5 pr-3">Action</th>
                    <th className="py-1.5 pr-3">Entity</th>
                    <th className="py-1.5 pr-3">Provider</th>
                    <th className="py-1.5">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.slice(0, 100).map((l, i) => (
                    <tr key={i} className="border-t border-slate-100 dark:border-slate-800/70">
                      <td className="whitespace-nowrap py-1.5 pr-3 text-xs text-slate-500 dark:text-slate-400">
                        {l.at || l.created_at ? new Date((l.at ?? l.created_at) as string).toLocaleString() : "—"}
                      </td>
                      <td className="py-1.5 pr-3">
                        <Badge tone={l.action?.includes("FAIL") ? "red" : l.action?.includes("FALLBACK") ? "amber" : l.action?.includes("COMPLETED") || l.action?.includes("CREATED") ? "green" : "gray"}>
                          {l.action ?? "—"}
                        </Badge>
                      </td>
                      <td className="max-w-40 truncate py-1.5 pr-3 text-xs">{l.entity ?? "—"}</td>
                      <td className="py-1.5 pr-3 text-xs">{l.provider ?? "—"}</td>
                      <td className="max-w-72 truncate py-1.5 text-xs text-slate-600 dark:text-slate-300">{l.result ?? l.error ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile list */}
            <ul className="flex flex-col gap-2 md:hidden">
              {shown.slice(0, 100).map((l, i) => (
                <li key={i} className="rounded-xl bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone={statusTone(l.action ?? "")}>{l.action ?? "—"}</Badge>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">{l.at || l.created_at ? new Date((l.at ?? l.created_at) as string).toLocaleString() : ""}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-600 dark:text-slate-300">{l.result ?? l.error ?? l.entity ?? ""}</p>
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>
    </div>
  );
}

