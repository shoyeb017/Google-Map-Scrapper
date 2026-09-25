import { NextResponse } from "next/server";
import { z } from "zod";
import { continueDiscovery } from "@/lib/search-pipeline";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const schema = z.object({
  additional: z.number().int().min(1).max(200).optional().default(20),
  enrichWebsite: z.boolean().optional(),
});

// "Find more": deepen the pack's own discovery and append only new leads.
// Streams stage/log/found/done events. Session packs (409) grow from Map Scraper.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const json = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Provide additional: 1..200" }, { status: 400 });
  }
  const encoder = new TextEncoder();
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
        const out = await continueDiscovery(id, parsed.data.additional, { enrichWebsite: parsed.data.enrichWebsite }, send);
        send({ t: "done", ...out });
      } catch (e: unknown) {
        const err = e as { message?: string; code?: string };
        send({ t: "error", message: err.message ?? "find more failed", code: err.code, sessionPack: err.code === "SESSION_PACK" });
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
