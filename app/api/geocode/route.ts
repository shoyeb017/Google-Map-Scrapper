import { NextResponse } from "next/server";
import { geocodeLocation } from "@/lib/geo";

// GET /api/geocode?q=Dhaka,Bangladesh → { lat, lng } (OpenStreetMap, no key)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim().slice(0, 300);
  if (!q) return NextResponse.json({ error: "Provide ?q=" }, { status: 400 });
  const c = await geocodeLocation(q);
  if (!c) return NextResponse.json({ error: "Location not found" }, { status: 404 });
  return NextResponse.json(c);
}
