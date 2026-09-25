import { NextResponse } from "next/server";
import { z } from "zod";
import { getSnapshot, getSessionQuery, isSessionLive } from "@/lib/map-session/manager";
import { runSessionScrape } from "@/lib/map-session/scrape";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const schema = z.object({
  positions: z.array(z.number().int().min(1)).max(200).optional(),
  limit: z.number().int().min(1).max(200).optional().default(100),
  enrichWebsite: z.boolean().optional().default(true),
  discoverSocial: z.boolean().optional().default(true),
  discoverContacts: z.boolean().optional().default(true),
  appendToJobId: z.string().uuid().optional(),
});

// Scrape the session's CURRENT result list, one by one, as SSE progress.
export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  if (!isSessionLive()) {
    return NextResponse.json({ error: "No live map session. Launch a session first." }, { status: 409 });
  }
  const snapshot = getSnapshot();
  if (!snapshot.length) {
    return NextResponse.json({ error: "Result list is empty. Read the results first." }, { status: 409 });
  }
  const picked = parsed.data.positions?.length
    ? snapshot.filter((s) => parsed.data.positions!.includes(s.position))
    : snapshot;
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
        await runSessionScrape(
          {
            items: picked,
            query: getSessionQuery(),
            limit: parsed.data.limit,
            enrichWebsite: parsed.data.enrichWebsite,
            discoverSocial: parsed.data.discoverSocial,
            discoverContacts: parsed.data.discoverContacts,
            appendToJobId: parsed.data.appendToJobId,
          },
          send
        );
      } catch (e: unknown) {
        send({ t: "error", message: e instanceof Error ? e.message : "scrape failed" });
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
