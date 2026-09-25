import { getBusiness, applyEnrichment, audit } from "@/lib/store";
import { enrichWebsite } from "@/lib/enrichment/crawler";

export type BatchEmit = (e: Record<string, unknown>) => void;
const noop: BatchEmit = () => undefined;

export interface EnrichBatchResult {
  id: string;
  name: string;
  status: "completed" | "failed" | "skipped";
  reason?: string;
  emails: number;
  phones: number;
  socials: number;
  pagesCrawled: number;
  title?: string | null;
  summary?: string | null;
  emailList?: { value: string; category: string }[];
  phoneList?: { value: string }[];
  socialList?: { platform: string; url: string }[];
  errors?: string[];
}

export interface BatchOptions {
  force?: boolean;
  maxPages?: number;
  timeoutMs?: number;
  concurrency?: number;
}

// Concurrent website enrichment with per-business progress events.
// Skips already-enriched businesses unless force=true (makes "enrich all" fast).
export async function runEnrichBatch(
  ids: string[],
  opts?: BatchOptions,
  emit: BatchEmit = noop
): Promise<EnrichBatchResult[]> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const results: EnrichBatchResult[] = [];
  const queue = [...unique];
  const total = unique.length;
  let done = 0;
  const concurrency = Math.min(Math.max(opts?.concurrency ?? 4, 1), 8);

  async function worker() {
    while (queue.length > 0) {
      const id = queue.shift()!;
      const b = await getBusiness(id);
      if (!b) {
        done++;
        const r: EnrichBatchResult = { id, name: "Unknown", status: "failed", reason: "not found", emails: 0, phones: 0, socials: 0, pagesCrawled: 0 };
        results.push(r);
        emit({ t: "item", ...r, done, total });
        continue;
      }
      if (!b.website) {
        done++;
        const r: EnrichBatchResult = { id, name: b.name, status: "skipped", reason: "Website not found", emails: 0, phones: 0, socials: 0, pagesCrawled: 0 };
        results.push(r);
        emit({ t: "item", ...r, done, total });
        continue;
      }
      if (!opts?.force && b.enrichmentStatus === "enriched") {
        done++;
        const r: EnrichBatchResult = { id, name: b.name, status: "skipped", reason: "Already enriched", emails: 0, phones: 0, socials: 0, pagesCrawled: 0 };
        results.push(r);
        emit({ t: "item", ...r, done, total });
        continue;
      }
      emit({ t: "start", id, name: b.name, done, total, message: `Crawling ${b.website}` });
      await audit("WEBSITE_CRAWL_STARTED", { entity: "business", entityId: id, provider: "company_website" });
      try {
        const e = await enrichWebsite(b.website, { maxPages: opts?.maxPages ?? 5, timeoutMs: opts?.timeoutMs ?? 12000 });
        const outcome = await applyEnrichment(
          id,
          {
            emails: e.emails,
            phones: e.phones,
            socials: e.socials,
            title: e.title,
            metaDescription: e.metaDescription,
            summary: e.summary,
            aboutUrl: e.aboutUrl,
            contactUrl: e.contactUrl,
            pagesCrawled: e.pagesCrawled,
          }
        );
        await audit("WEBSITE_CRAWL_COMPLETED", {
          entity: "business",
          entityId: id,
          result: `${e.pagesCrawled} pages, ${outcome?.emailsAdded ?? 0} emails, ${outcome?.phonesAdded ?? 0} phones, ${outcome?.socialsAdded ?? 0} socials`,
        });
        done++;
        const r: EnrichBatchResult = {
          id,
          name: b.name,
          status: e.pagesCrawled > 0 ? "completed" : "failed",
          reason: e.pagesCrawled === 0 ? e.errors[0] : undefined,
          emails: outcome?.emailsAdded ?? 0,
          phones: outcome?.phonesAdded ?? 0,
          socials: outcome?.socialsAdded ?? 0,
          pagesCrawled: e.pagesCrawled,
          title: e.title,
          summary: e.summary,
          emailList: e.emails.slice(0, 20).map((x) => ({ value: x.value, category: x.category })),
          phoneList: e.phones.slice(0, 20).map((x) => ({ value: x.value })),
          socialList: e.socials.slice(0, 30).map((x) => ({ platform: x.platform, url: x.url })),
          errors: e.errors,
        };
        results.push(r);
        emit({ t: "item", ...r, done, total });
      } catch (err: unknown) {
        done++;
        const r: EnrichBatchResult = {
          id,
          name: b.name,
          status: "failed",
          reason: err instanceof Error ? err.message : "enrich failed",
          emails: 0,
          phones: 0,
          socials: 0,
          pagesCrawled: 0,
        };
        results.push(r);
        emit({ t: "item", ...r, done, total });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(total, 1)) }, () => worker()));
  return results;
}
