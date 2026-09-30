"use client";
import { useEffect, useMemo, useState } from "react";
import { Download, X } from "lucide-react";
import { Button, Section, Select } from "@/components/ui";
import { businessToRow, mergeExportRows, EXPORT_COLUMNS, type ExportRow } from "@/lib/exports/exporter";
import { cn } from "@/lib/cn";

interface PackBiz {
  packId: string;
  packName: string;
  biz: Record<string, unknown>;
}

export function ExportPacksOverlay({ jobIds, onClose }: { jobIds: string[]; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [all, setAll] = useState<PackBiz[]>([]);
  const [packNames, setPackNames] = useState<string[]>([]);
  // Columns always come from Export Settings (+ mandatory Pack Names) — no picking here.
  const [columns, setColumns] = useState<string[]>([...EXPORT_COLUMNS]);
  const [mergeKey, setMergeKey] = useState("none");
  const [format, setFormat] = useState<"csv" | "xlsx">("xlsx");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      const rows: PackBiz[] = [];
      const names: string[] = [];
      try {
        const c = await fetch("/api/settings/export-columns").then((r) => (r.ok ? r.json() : null));
        if (!cancelled && c?.columns?.length) {
          setColumns(Array.from(new Set([...(c.columns as string[]), "Pack Names"])));
        }
      } catch {
        /* keep defaults */
      }
      for (const id of jobIds) {
        try {
          const d = await fetch(`/api/jobs/${id}`).then((r) => (r.ok ? r.json() : null));
          if (!d?.job) continue;
          names.push(String(d.job.keyword ?? id));
          for (const b of (d.businesses ?? []) as Record<string, unknown>[]) {
            rows.push({ packId: id, packName: String(d.job.keyword ?? id), biz: b });
          }
        } catch {
          /* skip failed pack */
        }
      }
      if (!cancelled) {
        setAll(rows);
        setPackNames(names);
        setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [jobIds]);

  const built = useMemo(() => {
    const rows: ExportRow[] = all.map(({ biz, packName }) =>
      businessToRow(
        {
          ...biz,
          phones: (biz.phones as string[]) ?? [],
          emails: (biz.emails as string[]) ?? [],
        } as never,
        packName
      )
    );
    return mergeKey === "none" ? rows : mergeExportRows(rows, mergeKey);
  }, [all, mergeKey]);

  const cols = useMemo(() => {
    // Pack Names is mandatory — always present, always first after Business Name.
    const rest = columns.filter((c) => c !== "Pack Names");
    const ordered = ["Business Name", "Pack Names", ...rest.filter((c) => c !== "Business Name")];
    return ordered.filter((c) => (EXPORT_COLUMNS as readonly string[]).includes(c) || c === "Pack Names");
  }, [columns]);

  const preview = built.slice(0, 50);

  async function download() {
    setBusy(true);
    try {
      const res = await fetch("/api/export/packs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobIds, columns: cols, mergeKey, format }),
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `packs-${Date.now()}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[1003] flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl dark:bg-slate-900 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Export selected packs"
      >
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">Export {jobIds.length} pack{jobIds.length === 1 ? "" : "s"} together</p>
            <p className="truncate text-xs text-slate-500">
              {loading ? "Loading pack rows…" : `${all.length} rows → ${built.length} after ${mergeKey === "none" ? "no merge" : `merge on ${mergeKey}`} · Packs: ${packNames.join(", ").slice(0, 120)}`}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close export" className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="slim-scroll flex-1 overflow-y-auto px-4 py-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Section title="Merge / unique" subtitle="Pick a field to merge duplicate rows">
              <Select value={mergeKey} onChange={(e) => setMergeKey(e.target.value)}>
                <option value="none">No merge — keep every row</option>
                {["Business Name", "Website", "Phone", "Email", "Address", "Maps URL", "Place ID"].map((c) => (
                  <option key={c} value={c}>Merge on {c} (unique)</option>
                ))}
              </Select>
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                Merged cells join with comma — every phone, email, social and Pack Name is kept.
              </p>
            </Section>
            <Section title="Format" subtitle="High-quality Excel or CSV">
              <div className="flex gap-2">
                {(["csv", "xlsx"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFormat(f)}
                    className={cn("flex-1 rounded-xl border-2 px-3 py-2 text-sm font-medium", format === f ? "border-emerald-500 bg-emerald-50/60" : "border-slate-200 dark:border-slate-800")}
                  >
                    {f === "csv" ? "CSV" : "Excel"}
                  </button>
                ))}
              </div>
              <Button variant="success" onClick={download} loading={busy} disabled={loading || !built.length} className="mt-2 w-full">
                <Download className="h-4 w-4" /> Download {built.length} rows
              </Button>
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                Columns come from Export Settings ({cols.length} columns + required Pack Names).{" "}
                <a href="/exports" className="font-medium text-teal-600 hover:underline">Change in Export Settings →</a>
              </p>
            </Section>
          </div>

          <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800">
            <div className="slim-scroll max-h-72 overflow-auto">
              <table className="dtable min-w-full">
                <thead className="sticky top-0">
                  <tr>
                    {cols.map((c) => (
                      <th key={c} className="whitespace-nowrap px-3 py-2">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r, i) => (
                    <tr key={i}>
                      {cols.map((c) => (
                        <td key={c} className="max-w-56 truncate px-3 py-2 text-xs">{String(r[c] ?? "")}</td>
                      ))}
                    </tr>
                  ))}
                  {!preview.length && !loading ? (
                    <tr><td className="px-3 py-6 text-center text-sm text-slate-500" colSpan={cols.length}>No rows in these packs.</td></tr>
                  ) : null}
                  {loading ? (
                    <tr><td className="px-3 py-6 text-center text-sm text-slate-500" colSpan={cols.length}>Loading…</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            {built.length > preview.length ? (
              <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500 dark:border-slate-800">Showing first {preview.length} of {built.length} rows — the download has all.</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
