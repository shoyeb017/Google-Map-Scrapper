import { NextResponse } from "next/server";
import { z } from "zod";
import { getJobPackage, audit } from "@/lib/store";
import { runEnrichBatch } from "@/lib/enrichment/batch";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Enrich selected packs pack-by-pack (sequential, not mixed).
// Body: { jobIds: string[], force?: boolean, concurrency?: number }
// Streams: stage | pack_start | start | item | pack_done | done | error
const schema = z.object({
  jobIds: z.array(z.string().min(1).max(100)).min(1).max(20),
  force: z.boolean().optional().default(true),
  concurrency: z.number().int().min(1).max(6).optional().default(4),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Provide jobIds: 1..20 packs" }, { status: 400 });
  }
  const jobIds = Array.from(new Set(parsed.data.jobIds));
  const force = parsed.data.force ?? true;
  const concurrency = parsed.data.concurrency ?? 4;
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
        send({ t: "stage", message: `Enriching ${jobIds.length} pack${jobIds.length === 1 ? "" : "s"} pack-by-pack…` });
        const packs: { jobId: string; keyword: string; total: number; done: number; skipped: number; emails: number; phones: number; socials: number }[] = [];
        let grandTotal = 0;
        let grandDone = 0;
        let grandEmails = 0;
        let grandPhones = 0;
        let grandSocials = 0;

        for (let i = 0; i < jobIds.length; i++) {
          const jobId = jobIds[i];
          const pkg = await getJobPackage(jobId);
          if (!pkg.job) {
            send({ t: "pack_done", jobId, keyword: "", index: i + 1, totalPacks: jobIds.length, total: 0, done: 0, skipped: 0, emails: 0, phones: 0, socials: 0, error: "Pack not found" });
            packs.push({ jobId, keyword: "", total: 0, done: 0, skipped: 0, emails: 0, phones: 0, socials: 0 });
            continue;
          }
          const ids = pkg.businesses.map((b) => b.id);
          send({ t: "pack_start", jobId, keyword: pkg.job.keyword, index: i + 1, totalPacks: jobIds.length, totalLeads: ids.length, message: `Pack ${i + 1}/${jobIds.length}: “${pkg.job.keyword}” — ${ids.length} leads` });
          await audit("PACK_ENRICH_STARTED", { entity: "search_job", entityId: jobId, result: `${ids.length} leads` });
          if (ids.length === 0) {
            send({ t: "pack_done", jobId, keyword: pkg.job.keyword, index: i + 1, totalPacks: jobIds.length, total: 0, done: 0, skipped: 0, emails: 0, phones: 0, socials: 0 });
            packs.push({ jobId, keyword: pkg.job.keyword, total: 0, done: 0, skipped: 0, emails: 0, phones: 0, socials: 0 });
            continue;
          }
          const results = await runEnrichBatch(ids, { force, maxPages: 5, timeoutMs: 12000, concurrency }, (e) => {
            send({ ...e, jobId });
          });
          const done = results.filter((r) => r.status === "completed").length;
          const skipped = results.filter((r) => r.status === "skipped").length;
          const emails = results.reduce((n, r) => n + r.emails, 0);
          const phones = results.reduce((n, r) => n + r.phones, 0);
          const socials = results.reduce((n, r) => n + r.socials, 0);
          grandTotal += ids.length;
          grandDone += done;
          grandEmails += emails;
          grandPhones += phones;
          grandSocials += socials;
          await audit("PACK_ENRICH_COMPLETED", { entity: "search_job", entityId: jobId, result: `${done}/${ids.length} enriched` });
          send({ t: "pack_done", jobId, keyword: pkg.job.keyword, index: i + 1, totalPacks: jobIds.length, total: ids.length, done, skipped, emails, phones, socials });
          packs.push({ jobId, keyword: pkg.job.keyword, total: ids.length, done, skipped, emails, phones, socials });
        }

        send({ t: "done", packs, summary: { totalPacks: jobIds.length, totalLeads: grandTotal, done: grandDone, emails: grandEmails, phones: grandPhones, socials: grandSocials } });
      } catch (e: unknown) {
        send({ t: "error", message: e instanceof Error ? e.message : "pack enrich failed" });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
