import { searchRequestSchema } from "@/lib/schemas";
import { runDiscovery } from "@/lib/search-pipeline";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Live scraping progress as Server-Sent Events:
//   GET /api/search/stream?keyword=..&location=..&limit=..&mode=..&...
// Events: stage | log | found | error | done
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const num = (k: string) => {
    const v = searchParams.get(k);
    if (v === null || v === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const bool = (k: string, fallback: boolean) => {
    const v = searchParams.get(k);
    if (v === null) return fallback;
    return v === "1" || v.toLowerCase() === "true";
  };
  const str = (k: string) => searchParams.get(k) ?? undefined;
  const mode = str("mode") ?? str("discoveryProvider") ?? "automatic";

  const parsed = searchRequestSchema.safeParse({
    keyword: str("keyword") ?? "",
    category: str("category") ?? "",
    locationText: str("location") ?? str("locationText") ?? "",
    latitude: num("latitude"),
    longitude: num("longitude"),
    radiusMeters: num("radius") ?? num("radiusMeters"),
    country: str("country") ?? "",
    limit: num("limit"),
    discoveryProvider: mode,
    primaryProvider: str("primary") ?? str("primaryProvider"),
    fallbackProvider: str("fallback") ?? str("fallbackProvider"),
    enrichWebsite: bool("enrich", true),
    discoverSocial: bool("social", true),
    discoverContacts: bool("contacts", true),
  });

  const encoder = new TextEncoder();
  if (!parsed.success) {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ t: "error", message: "Invalid search parameters" })}\n\n`));
        controller.close();
      },
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
  }
  const input = parsed.data;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          /* client gone */
        }
      };
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
          },
          send
        );
        send({
          t: "done",
          jobId: out.jobId,
          backend: out.backend,
          provider: out.provider,
          primaryProvider: out.primaryProvider,
          fallbackUsed: out.fallbackUsed,
          fallbackReason: out.fallbackReason,
          providerAttempts: out.providerAttempts,
          totalDiscovered: out.totalDiscovered,
          totalSaved: out.totalSaved,
          totalDuplicates: out.totalDuplicates,
          enrichedCount: out.enrichedCount,
          enrichment: out.enrichment,
          businesses: out.businesses,
        });
      } catch (e: unknown) {
        const err = e as { message?: string; code?: string; attempts?: unknown[]; jobId?: string };
        send({ t: "error", message: err.message ?? "search failed", code: err.code, jobId: err.jobId, attempts: err.attempts ?? [] });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
