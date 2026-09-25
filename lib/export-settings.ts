// Export column customization ("Export Settings").
// Source of truth is the DATABASE (system_settings) so every device and
// browser shares the same columns. Browser localStorage is only an
// offline/first-paint cache.

import { EXPORT_COLUMNS } from "@/lib/exports/exporter";

const KEY = "leadscraper.exportColumns";

function valid(cols: unknown): string[] | null {
  if (!Array.isArray(cols)) return null;
  const v = cols.filter(
    (c): c is string => typeof c === "string" && (EXPORT_COLUMNS as readonly string[]).includes(c)
  );
  return v.length > 0 ? v : null;
}

export function loadExportColumns(): string[] {
  if (typeof window === "undefined") return [...EXPORT_COLUMNS];
  try {
    const cached = valid(JSON.parse(window.localStorage.getItem(KEY) ?? "null"));
    if (cached) return cached;
  } catch {
    /* ignore */
  }
  return [...EXPORT_COLUMNS];
}

// Database-first load; refreshes the local cache.
export async function loadExportColumnsAsync(): Promise<string[]> {
  try {
    const res = await fetch("/api/settings/export-columns");
    if (res.ok) {
      const data = await res.json();
      const cols = valid(data.columns);
      if (cols) {
        try {
          window.localStorage.setItem(KEY, JSON.stringify(cols));
        } catch {
          /* ignore */
        }
        return cols;
      }
    }
  } catch {
    /* offline — use cache */
  }
  return loadExportColumns();
}

export function saveExportColumns(cols: string[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cols));
  } catch {
    /* ignore */
  }
}

// Persist to the database (and local cache). Await this in settings UI.
export async function saveExportColumnsAsync(cols: string[]): Promise<string[]> {
  saveExportColumns(cols);
  const res = await fetch("/api/settings/export-columns", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ columns: cols }),
  });
  if (!res.ok) throw new Error("Could not save to database");
  const data = await res.json();
  const saved = valid(data.columns) ?? cols;
  saveExportColumns(saved);
  return saved;
}
