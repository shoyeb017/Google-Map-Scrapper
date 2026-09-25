import { NextResponse } from "next/server";
import { enrichRequestSchema } from "@/lib/schemas";
import { runEnrichBatch } from "@/lib/enrichment/batch";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Live enrichment progress as Server-Sent Events (POST with { businessIds, force }).
// Events: start | item | done
export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = enrichRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.flatten() }, { status: 400 });
  }
  const ids = Array.from(new Set(parsed.data.businessIds));
  const force = parsed.data.force ?? false;
  const body = (json ?? {}) as { concurrency?: number };
  const concurrency = Math.min(6, Math.max(1, Number(body.concurrency) || 4));
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
      send({ t: "stage", message: `Enriching ${ids.length} website${ids.length === 1 ? "" : "s"}…` });
      const results = await runEnrichBatch(ids, { force, maxPages: 5, timeoutMs: 12000, concurrency }, send);
      const done = results.filter((r) => r.status === "completed").length;
      const skipped = results.filter((r) => r.status === "skipped").length;
      const emails = results.reduce((n, r) => n + r.emails, 0);
      const phones = results.reduce((n, r) => n + r.phones, 0);
      const socials = results.reduce((n, r) => n + r.socials, 0);
      send({ t: "done", results, summary: { total: ids.length, done, skipped, emails, phones, socials } });
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
