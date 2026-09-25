import { NextResponse } from "next/server";
import { enrichRequestSchema } from "@/lib/schemas";
import { runEnrichBatch } from "@/lib/enrichment/batch";

export const maxDuration = 300;

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = enrichRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.flatten() }, { status: 400 });
  }
  const results = await runEnrichBatch(parsed.data.businessIds, { force: true });
  return NextResponse.json({ results });
}
