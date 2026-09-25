import { NextResponse } from "next/server";
import { z } from "zod";
import { resetCounts, resetData, RESET_TARGETS, RESET_DESCRIPTIONS, type ResetTarget } from "@/lib/store";

// Full data reset. GET shows row counts per area; DELETE wipes chosen areas.
// Export column settings are configuration, not data — they are never reset.
export async function GET() {
  const counts = await resetCounts();
  return NextResponse.json({
    areas: (RESET_TARGETS as ResetTarget[]).map((t) => ({
      id: t,
      label: t === "packs" ? "Scraped packs" : t.charAt(0).toUpperCase() + t.slice(1),
      description: RESET_DESCRIPTIONS[t],
      rows: counts[t],
    })),
  });
}

const schema = z.object({
  targets: z.array(z.enum(["businesses", "packs", "saved", "logs"])).min(1).max(4),
});

export async function DELETE(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Provide targets: any of businesses, packs, saved, logs" }, { status: 400 });
  }
  try {
    const deleted = await resetData(parsed.data.targets);
    return NextResponse.json({ deleted });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Reset failed" }, { status: 500 });
  }
}
