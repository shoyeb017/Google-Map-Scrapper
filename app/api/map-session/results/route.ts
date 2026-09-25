import { NextResponse } from "next/server";
import { readSessionResults, getSnapshot } from "@/lib/map-session/manager";

export const maxDuration = 180;
export const dynamic = "force-dynamic";

// Read the ACTUAL website's current result list (scrolls + dedupes).
// GET /api/map-session/results?limit=100&scrolls=12
// Without params returns the last stored snapshot instantly.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const fresh = searchParams.get("fresh");
  if (fresh !== "1") {
    const snapshot = getSnapshot();
    return NextResponse.json({ items: snapshot, cached: true });
  }
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 100), 1), 200);
  const scrolls = Math.min(Math.max(Number(searchParams.get("scrolls") ?? 12), 1), 25);
  try {
    const { query, items } = await readSessionResults({ limit, maxScrolls: scrolls });
    return NextResponse.json({ query, items, total: items.length, cached: false });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "read failed" }, { status: 502 });
  }
}
