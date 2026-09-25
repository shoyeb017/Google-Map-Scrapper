import { NextResponse } from "next/server";
import { exportRequestSchema } from "@/lib/schemas";
import { listBusinesses, getJobPackage, audit } from "@/lib/store";
import { businessToRow, toCsv, toXlsx, EXPORT_COLUMNS } from "@/lib/exports/exporter";

export const maxDuration = 120;

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = exportRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.flatten() }, { status: 400 });
  }
  const { format, columns, selectedIds, filters, searchJobId } = parsed.data;
  let items = searchJobId
    ? (await getJobPackage(searchJobId)).businesses
    : await listBusinesses(filters ?? {});
  if (selectedIds?.length) {
    const set = new Set(selectedIds);
    items = items.filter((b) => set.has(b.id));
  }
  const cols = columns?.length ? columns : [...EXPORT_COLUMNS];
  const rows = items.map(businessToRow);
  await audit("EXPORT_CREATED", {
    entity: "export",
    entityId: searchJobId,
    result: `${rows.length} rows as ${format}${searchJobId ? " (package)" : ""}`,
  });

  if (format === "xlsx") {
    const buf = await toXlsx(rows, cols);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="businesses-${Date.now()}.xlsx"`,
      },
    });
  }
  const csv = toCsv(rows, cols);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="businesses-${Date.now()}.csv"`,
    },
  });
}

export async function GET(req: Request) {
  // Convenience: GET /api/export?format=csv&q=... or ?jobId=<package>
  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const jobId = searchParams.get("jobId");
  const filters: Record<string, string> = {};
  for (const [k, v] of searchParams.entries()) {
    if (["q", "provider", "city", "country", "hasWebsite", "hasEmail", "hasPhone"].includes(k)) filters[k] = v;
  }
  const items = jobId ? (await getJobPackage(jobId)).businesses : await listBusinesses(filters);
  const rows = items.map(businessToRow);
  if (format === "xlsx") {
    const buf = await toXlsx(rows, [...EXPORT_COLUMNS]);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="businesses-${Date.now()}.xlsx"`,
      },
    });
  }
  return new NextResponse(toCsv(rows, [...EXPORT_COLUMNS]), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="businesses-${Date.now()}.csv"`,
    },
  });
}
