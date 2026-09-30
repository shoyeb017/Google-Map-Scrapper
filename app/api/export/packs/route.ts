import { NextResponse } from "next/server";
import { packsExportSchema } from "@/lib/schemas";
import { getJobPackage, audit } from "@/lib/store";
import { businessToRow, mergeExportRows, toCsv, toXlsx, EXPORT_COLUMNS } from "@/lib/exports/exporter";

export const maxDuration = 120;

// Multi-pack export: all selected packs' businesses together in one table,
// Pack Names mandatory, optional merge on one field (unique), multi-values comma-joined.
export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = packsExportSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Provide jobIds: 1..20 packs" }, { status: 400 });
  }
  const { jobIds, mergeKey, format } = parsed.data;
  let columns = parsed.data.columns?.length ? parsed.data.columns : [...EXPORT_COLUMNS];
  // Pack Names is mandatory — always included.
  if (!columns.includes("Pack Names")) columns = ["Business Name", "Pack Names", ...columns.filter((c) => c !== "Business Name")];

  const rows: Record<string, string | number>[] = [];
  const seenPacks: string[] = [];
  for (const id of Array.from(new Set(jobIds))) {
    const pkg = await getJobPackage(id);
    if (!pkg.job) continue;
    seenPacks.push(pkg.job.keyword);
    for (const b of pkg.businesses) {
      rows.push(businessToRow(b, pkg.job.keyword));
    }
  }
  const merged = mergeKey && mergeKey !== "none" ? mergeExportRows(rows, mergeKey) : rows;
  await audit("EXPORT_CREATED", {
    entity: "export",
    result: `${merged.length} rows from ${seenPacks.length} packs as ${format} (merge: ${mergeKey})`,
  });

  if (format === "xlsx") {
    const buf = await toXlsx(merged, columns);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="packs-${Date.now()}.xlsx"`,
      },
    });
  }
  return new NextResponse(toCsv(merged, columns), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="packs-${Date.now()}.csv"`,
    },
  });
}
