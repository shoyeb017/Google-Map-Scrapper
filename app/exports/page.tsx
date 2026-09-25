"use client";
import { useEffect, useState } from "react";
import { CheckSquare, Download, FileSpreadsheet, FileText, Settings2 } from "lucide-react";
import { Button, Section } from "@/components/ui";
import { EXPORT_COLUMNS } from "@/lib/exports/exporter";
import { loadExportColumns, saveExportColumnsAsync } from "@/lib/export-settings";
import { cn } from "@/lib/cn";

export default function ExportSettingsPage() {
  const [format, setFormat] = useState<"csv" | "xlsx">("csv");
  const [cols, setCols] = useState<string[]>([...EXPORT_COLUMNS]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dbState, setDbState] = useState<"loading" | "ready" | "offline">("loading");

  useEffect(() => {
    // Database is the source of truth; local cache paints instantly.
    setCols(loadExportColumns());
    fetch("/api/settings/export-columns")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.columns?.length) setCols(d.columns);
        setDbState(d ? "ready" : "offline");
      })
      .catch(() => setDbState("offline"));
  }, []);

  async function persist(next: string[]) {
    setCols(next);
    try {
      await saveExportColumnsAsync(next);
      setDbState("ready");
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      setDbState("offline");
    }
  }

  function toggle(c: string) {
    const next = cols.includes(c) ? cols.filter((x) => x !== c) : [...cols, c];
    if (next.length === 0) return; // keep at least one column
    void persist(next);
  }

  function selectAll(on: boolean) {
    if (!on) return;
    void persist([...EXPORT_COLUMNS]);
  }

  async function download() {
    setBusy(true);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, columns: cols }),
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `businesses-${Date.now()}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="animate-fade-up">
        <h1 className="text-xl font-bold sm:text-2xl">Export Settings</h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Customize your export columns once — the checked columns are used for newest-search downloads,
          scraped-pack downloads and quick downloads. Stored in the database, shared by all devices.{" "}
          {dbState === "ready" ? (
            <span className="font-medium text-emerald-600">{saved ? "Saved ✓" : "Synced with database ✓"}</span>
          ) : dbState === "offline" ? (
            <span className="font-medium text-amber-600 dark:text-amber-400">Database unreachable — saved on this device only</span>
          ) : null}
        </p>
      </div>

      <Section
        title={`Columns (${cols.length}/${EXPORT_COLUMNS.length})`}
        subtitle="Only checked columns will download anywhere in the app"
        className="animate-fade-up-1"
        action={
          <div className="flex gap-2 text-xs">
            <button onClick={() => selectAll(true)} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700">
              <CheckSquare className="h-3.5 w-3.5" /> All
            </button>
            <span className="inline-flex items-center px-1 text-slate-400 dark:text-slate-500">At least one column stays on</span>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {EXPORT_COLUMNS.map((c) => {
            const on = cols.includes(c);
            return (
              <button
                key={c}
                onClick={() => toggle(c)}
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition",
                  on ? "border-teal-300 dark:border-teal-500 bg-teal-50/60 dark:bg-teal-500/10 font-medium" : "border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400"
                )}
              >
                <span className={cn("flex h-4 w-4 items-center justify-center rounded border text-[10px]", on ? "border-teal-500 bg-teal-500 text-white" : "border-slate-300 dark:border-slate-700")}>
                  {on ? "✓" : ""}
                </span>
                {c}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="File format & full download" subtitle="Downloads the whole global pool with your columns" className="animate-fade-up-2">
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              { id: "csv", title: "CSV", desc: "Universal, opens everywhere", icon: FileText },
              { id: "xlsx", title: "Excel (.xlsx)", desc: "Formatted headers via ExcelJS", icon: FileSpreadsheet },
            ] as const
          ).map((f) => {
            const Icon = f.icon;
            const active = format === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFormat(f.id)}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border-2 p-3.5 text-left transition",
                  active ? "border-emerald-500 bg-emerald-50/60" : "border-slate-200 dark:border-slate-800 hover:border-slate-300"
                )}
              >
                <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl", active ? "bg-emerald-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400")}>
                  <Icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{f.title}</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">{f.desc}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button variant="success" onClick={download} loading={busy} className="px-6 py-2.5">
            <Download className="h-4 w-4" /> Download all ({cols.length} columns)
          </Button>
          <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
            <Settings2 className="h-3.5 w-3.5" /> Pack & newest-search downloads use these same columns
          </span>
        </div>
      </Section>
    </div>
  );
}


