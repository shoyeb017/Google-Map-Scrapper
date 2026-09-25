import { NextResponse } from "next/server";
import { z } from "zod";
import { listSavedScrapings, createSavedScraping } from "@/lib/store";

export async function GET() {
  const items = await listSavedScrapings();
  return NextResponse.json({ total: items.length, items });
}

const schema = z.object({
  name: z.string().min(1).max(120),
  keyword: z.string().min(1).max(200),
  locationText: z.string().max(300).optional().default(""),
  category: z.string().max(200).optional(),
  radiusMeters: z.number().int().min(100).max(100000).optional(),
  requestedLimit: z.number().int().min(1).max(500).optional(),
  discoveryProvider: z.string().max(40).optional(),
  primaryProvider: z.string().max(40).optional(),
  fallbackProvider: z.string().max(40).optional(),
  enrichWebsite: z.boolean().optional(),
  discoverSocial: z.boolean().optional(),
  discoverContacts: z.boolean().optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const rec = await createSavedScraping(parsed.data);
    return NextResponse.json({ item: rec }, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Save failed" }, { status: 400 });
  }
}
