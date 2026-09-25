"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  ExternalLink,
  Globe,
  Link2,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Share2,
} from "lucide-react";
import Link from "next/link";
import {
  Badge,
  Button,
  Completeness,
  ConfirmButton,
  CopyButton,
  EmptyState,
  NotFound,
  ProviderBadge,
  Section,
  SkeletonList,
  statusTone,
} from "@/components/ui";
import { readSSEStream, type StreamLine, type StreamTone } from "@/lib/stream-client";
import { StreamTerminal, nextLine } from "@/components/stream-terminal";

interface EnrichData {
  status: string;
  reason?: string;
  title?: string;
  summary?: string;
  emails?: { value: string; category?: string }[];
  phones?: { value: string }[];
  socials?: { platform: string; url: string }[];
  emailList?: { value: string; category: string }[];
  phoneList?: { value: string }[];
  socialList?: { platform: string; url: string }[];
  pagesCrawled?: number;
  errors?: string[];
}

export default function BusinessDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [b, setB] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [enrich, setEnrich] = useState<EnrichData | null>(null);
  const [enrichLines, setEnrichLines] = useState<StreamLine[]>([]);
  const [enrichStartedAt, setEnrichStartedAt] = useState<number | null>(null);

  function load() {
    setLoading(true);
    fetch(`/api/businesses/${id}`)
      .then((r) => r.json())
      .then((d) => setB(d.business))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }

  useEffect(load, [id]);

  async function runEnrich() {
    setEnriching(true);
    setEnrich(null);
    setEnrichLines([]);
    setEnrichStartedAt(Date.now());
    const push = (text: string, tone: StreamTone = "info") =>
      setEnrichLines((prev) => [...prev.slice(-100), nextLine(text, tone)]);
    try {
      const res = await fetch("/api/enrich/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessIds: [id], force: true }),
      });
      await readSSEStream(
        res,
        (e) => {
          if (String(e.t) === "done") {
            const first = ((e.results as EnrichData[] | undefined) ?? [])[0];
            if (first) {
              setEnrich({
                ...first,
                emails: first.emailList ?? first.emails,
                phones: first.phoneList ?? first.phones,
                socials: first.socialList ?? first.socials,
              });
            }
          }
        },
        ({ text, tone }) => push(text, tone)
      );
      load();
    } catch (err: unknown) {
      push(`✕ ${err instanceof Error ? err.message : "enrich failed"}`, "error");
    } finally {
      setEnriching(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="skeleton h-36 w-full" />
        <SkeletonList rows={4} />
      </div>
    );
  }

  if (!b) {
    return (
      <EmptyState icon={Building2} title="Business not found" hint="It may have been deleted." action={<Link href="/businesses" className="text-sm text-teal-600 dark:text-teal-400">Back to Businesses</Link>} />
    );
  }

  const str = (k: string) => (b[k] as string) ?? "";
  const phones = (b.phones as string[] | undefined) ?? [];
  const emails = (b.emails as string[] | undefined) ?? [];
  const socials = (b.socialLinks as { platform: string; url: string }[] | undefined) ?? [];
  const providers = (b.providers as string[] | undefined) ?? [str("sourceProvider")];
  const lat = b.latitude as number | null;
  const lng = b.longitude as number | null;
  const siteUrl = str("website") ? (str("website").startsWith("http") ? str("website") : `https://${str("website")}`) : "";

  return (
    <div className="flex flex-col gap-4">
      <Link href="/businesses" className="inline-flex w-fit items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Search
      </Link>

      {/* Header card */}
      <div className="animate-fade-up overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="h-20 bg-gradient-to-r from-teal-600 via-cyan-600 to-cyan-500 sm:h-24" />
        <div className="px-4 pb-4 sm:px-5">
          <div className="-mt-8 flex flex-wrap items-end gap-3">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white dark:bg-slate-900 text-2xl font-bold text-teal-700 dark:text-teal-300 shadow-md ring-1 ring-slate-200 dark:ring-slate-700">
              {str("name").charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1 pb-1">
              <h1 className="truncate text-lg font-bold sm:text-2xl">{str("name")}</h1>
              <p className="truncate text-sm text-slate-500 dark:text-slate-400">{str("primaryCategory") || "Business"} {[str("city"), str("country")].filter(Boolean).join(", ") ? `· ${[str("city"), str("country")].filter(Boolean).join(", ")}` : ""}</p>
            </div>
            <div className="flex flex-wrap gap-2 pb-1">
              <Button onClick={runEnrich} loading={enriching} className="px-3 py-2 text-xs sm:px-4 sm:text-sm">
                <RefreshCw className="h-4 w-4" /> {enriching ? "Crawling site…" : "Re-enrich website"}
              </Button>
              <ConfirmButton
                title="Delete"
                confirmTitle="Delete this lead?"
                onConfirm={async () => {
                  await fetch(`/api/businesses/${id}`, { method: "DELETE" });
                  router.push("/businesses");
                }}
              />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {providers.map((p) => <ProviderBadge key={p} provider={p} />)}
            <Badge tone="gray">{str("enrichmentStatus") || "discovered"}</Badge>
            <span className="ml-auto hidden sm:block"><Completeness value={Number(b.completenessScore ?? 0)} /></span>
          </div>
          <div className="mt-2 sm:hidden"><Completeness value={Number(b.completenessScore ?? 0)} /></div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Contact */}
        <Section title="Contact" subtitle="Phones & emails from all sources">
          <div className="flex flex-col gap-2 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Phones</p>
            {phones.map((p) => (
              <div key={p} className="flex items-center gap-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 px-3 py-2">
                <Phone className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
                <a href={`tel:${p}`} className="min-w-0 flex-1 truncate font-medium">{p}</a>
                <CopyButton value={p} />
              </div>
            ))}
            {!phones.length ? <div><NotFound what="Phone" /></div> : null}
            <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Emails</p>
            {emails.map((e) => (
              <div key={e} className="flex items-center gap-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 px-3 py-2">
                <Mail className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
                <a href={`mailto:${e}`} className="min-w-0 flex-1 truncate font-medium">{e}</a>
                <CopyButton value={e} />
              </div>
            ))}
            {!emails.length ? <div><NotFound what="Email" /></div> : null}
            {!phones.length && !emails.length ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">Run <span className="font-medium">Re-enrich website</span> to crawl the official site for contacts.</p>
            ) : null}
          </div>
        </Section>

        {/* Website */}
        <Section title="Website" subtitle="Official online presence">
          {siteUrl ? (
            <div className="flex flex-col gap-2 text-sm">
              <a href={siteUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl bg-teal-50 dark:bg-teal-500/10 px-3 py-2.5 font-medium text-teal-700 dark:text-teal-300 hover:bg-teal-100">
                <Globe className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{str("website")}</span>
                <ExternalLink className="h-4 w-4 shrink-0" />
              </a>
              {str("description") ? <p className="text-slate-600 dark:text-slate-300">{str("description")}</p> : null}
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400"><NotFound what="Website" /> No website discovered for this business yet.</p>
          )}
        </Section>

        {/* Location */}
        <Section title="Location" subtitle="Map & coordinates">
          {lat && lng ? (
            <div className="flex flex-col gap-2">
              <iframe
                title="map"
                loading="lazy"
                className="h-56 w-full rounded-xl border border-slate-200 dark:border-slate-800 sm:h-64"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.05}%2C${lat - 0.05}%2C${lng + 0.05}%2C${lat + 0.05}&layer=mapnik&marker=${lat}%2C${lng}`}
              />
              <p className="flex items-start gap-1.5 text-sm text-slate-600 dark:text-slate-300">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
                {str("formattedAddress") || "—"}
              </p>
              <div className="flex flex-wrap gap-2">
                <a className="inline-flex items-center gap-1 rounded-xl bg-slate-900 dark:bg-slate-100 px-3 py-1.5 text-xs font-medium text-white dark:text-slate-900" target="_blank" rel="noreferrer" href={str("mapsUrl") || `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`}>
                  <ExternalLink className="h-3.5 w-3.5" /> Open in Maps
                </a>
                <CopyButton value={`${lat},${lng}`} label="Copy coords" />
                <CopyButton value={str("formattedAddress") || ""} label="Copy address" />
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">No coordinates for this business.</p>
          )}
        </Section>

        {/* Social */}
        <Section title="Social media" subtitle={`${socials.length} linked profile${socials.length === 1 ? "" : "s"}`}>
          {socials.length ? (
            <ul className="flex flex-col gap-2 text-sm">
              {socials.map((s) => (
                <li key={`${s.platform}|${s.url}`}>
                  <a href={s.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 px-3 py-2 font-medium hover:bg-slate-100 dark:hover:bg-slate-700">
                    <Share2 className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
                    <span className="min-w-0 flex-1 truncate">{s.url.replace(/^https?:\/\//, "")}</span>
                    <Badge tone="violet">{s.platform}</Badge>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400"><NotFound what="Social profiles" /> None linked yet — enrich the website to discover them.</p>
          )}
        </Section>
      </div>

      {/* Enrichment result */}
      <Section
        title="Website enrichment"
        subtitle={enrich ? `${enrich.pagesCrawled ?? 0} pages crawled · saved to this business` : "Crawl the official site for extra emails, phones & socials"}
      >
        {(enriching || enrichLines.length > 0) ? (
          <div className="mb-3">
            <StreamTerminal
              title={`ENRICHING — ${str("name")}`}
              lines={enrichLines}
              running={enriching}
              startedAt={enrichStartedAt}
            />
          </div>
        ) : null}
        {!enrich && !enriching && enrichLines.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Click “Re-enrich website” above. The crawler is robots-aware, same-domain, size-limited and SSRF-protected.</p>
        ) : null}
        {enrich ? (
          enrich.status === "completed" || (enrich.pagesCrawled ?? 0) > 0 ? (
            <div className="grid gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">
                <p className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400"><Mail className="h-3.5 w-3.5" /> Emails ({enrich.emails?.length ?? 0})</p>
                {(enrich.emails ?? []).map((e) => (
                  <p key={e.value} className="truncate py-0.5 font-medium">{e.value} <span className="text-xs font-normal text-slate-400 dark:text-slate-500">· {e.category}</span></p>
                ))}
                {!enrich.emails?.length ? <p className="text-xs text-slate-400 dark:text-slate-500">None found</p> : null}
              </div>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">
                <p className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400"><Phone className="h-3.5 w-3.5" /> Phones ({enrich.phones?.length ?? 0})</p>
                {(enrich.phones ?? []).map((p) => (
                  <p key={p.value} className="truncate py-0.5 font-medium">{p.value}</p>
                ))}
                {!enrich.phones?.length ? <p className="text-xs text-slate-400 dark:text-slate-500">None found</p> : null}
              </div>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">
                <p className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400"><Share2 className="h-3.5 w-3.5" /> Socials ({enrich.socials?.length ?? 0})</p>
                {(enrich.socials ?? []).map((s) => (
                  <p key={s.url} className="truncate py-0.5 font-medium">{s.platform} <span className="text-xs font-normal text-slate-400 dark:text-slate-500">· {s.url.replace(/^https?:\/\//, "").slice(0, 30)}</span></p>
                ))}
                {!enrich.socials?.length ? <p className="text-xs text-slate-400 dark:text-slate-500">None found</p> : null}
              </div>
            </div>
          ) : (
            <p className="rounded-xl bg-rose-50 dark:bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
              Crawl failed: {enrich.reason || enrich.errors?.[0] || "site unreachable"}. The site may block bots or be offline — contact data from map sources above is unaffected.
            </p>
          )
        ) : null}
      </Section>

      {/* Sources */}
      <Section title="Sources & provenance" subtitle="Where each piece of data came from">
        <div className="flex flex-col gap-1.5 text-xs">
          {[
            ["Discovery provider", str("sourceProvider")],
            ["Source URL", str("sourceUrl")],
            ["Place ID", str("placeId")],
            ["Last updated", str("updatedAt")],
          ].map(([k, v]) => (
            <div key={k} className="flex items-start gap-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2">
              <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
              <span className="w-32 shrink-0 font-medium text-slate-500 dark:text-slate-400">{k}</span>
              <span className="min-w-0 flex-1 break-all text-slate-700 dark:text-slate-200">{v || "—"}</span>
            </div>
          ))}
          <div className="flex items-center gap-2 px-1 pt-1">
            <span className="text-slate-500 dark:text-slate-400">Merged from:</span>
            {providers.map((p) => <ProviderBadge key={p} provider={p} />)}
            <Badge tone={statusTone("completed")}>reviews never collected</Badge>
          </div>
        </div>
      </Section>
    </div>
  );
}


