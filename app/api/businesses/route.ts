import { NextResponse } from "next/server";
import { listBusinesses } from "@/lib/store";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const filters: Record<string, string> = {};
  for (const k of ["q", "provider", "city", "country", "hasWebsite", "hasEmail", "hasPhone"]) {
    const v = searchParams.get(k);
    if (v) filters[k] = v;
  }
  const items = await listBusinesses(filters);
  return NextResponse.json({ total: items.length, businesses: items });
}
