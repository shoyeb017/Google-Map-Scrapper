import { NextResponse } from "next/server";
import { searchRequestSchema } from "@/lib/schemas";
import { runDiscovery } from "@/lib/search-pipeline";

export const maxDuration = 300;

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = searchRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;
  try {
    const out = await runDiscovery(
      {
        keyword: input.keyword,
        category: input.category || undefined,
        locationText: input.locationText,
        latitude: input.latitude,
        longitude: input.longitude,
        radiusMeters: input.radiusMeters,
        country: input.country || undefined,
        limit: input.limit,
        discoveryProvider: input.discoveryProvider,
        primaryProvider: input.primaryProvider,
        fallbackProvider: input.fallbackProvider,
        enrichWebsite: input.enrichWebsite,
        discoverSocial: input.discoverSocial,
        discoverContacts: input.discoverContacts,
      }
    );
    return NextResponse.json(out);
  } catch (e: unknown) {
    const err = e as { message?: string; code?: string; attempts?: unknown[]; jobId?: string };
    return NextResponse.json(
      { jobId: err.jobId, error: err.message ?? "search failed", code: err.code, providerAttempts: err.attempts ?? [] },
      { status: 502 }
    );
  }
}
