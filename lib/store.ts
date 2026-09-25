import fs from "node:fs";
import path from "node:path";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import type { NormalizedBusiness } from "@/lib/providers/types";
import { completenessScore, domainOf, isPlausiblePhone, normalizeEmail, normalizeName, normalizePhone, normalizeUrl } from "@/lib/normalization/normalize";
import { duplicateKey } from "@/lib/deduplication/dedup";

export interface PersistedBusiness extends NormalizedBusiness {
  id: string;
  completenessScore: number;
  enrichmentStatus: string;
  providers: string[];
  searchJobId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SearchJobRecord {
  id: string;
  keyword: string;
  locationText: string;
  category?: string;
  latitude?: number;
  longitude?: number;
  radiusMeters?: number;
  country?: string;
  status: string;
  discoveryProvider: string;
  primaryProvider: string;
  fallbackProvider?: string;
  requestedLimit: number;
  enrichWebsite?: boolean;
  discoverSocial?: boolean;
  discoverContacts?: boolean;
  totalDiscovered: number;
  totalSaved: number;
  totalDuplicates: number;
  totalFailed: number;
  fallbackUsed: boolean;
  fallbackReason?: string;
  providerAttempts: unknown[];
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

const DATA_DIR = path.join(process.cwd(), ".data");
const BIZ_FILE = path.join(DATA_DIR, "businesses.json");
const JOBS_FILE = path.join(DATA_DIR, "search_jobs.json");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJson<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, data: unknown) {
  ensureDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function toRow(b: NormalizedBusiness, searchJobId?: string) {
  const now = new Date().toISOString();
  const cleanPhones = (b.phones ?? []).filter(isPlausiblePhone);
  return {
    name: b.name,
    official_name: b.officialName ?? null,
    display_name: b.name,
    description: b.description ?? null,
    primary_category: b.primaryCategory ?? null,
    secondary_categories: b.secondaryCategories ?? [],
    business_types: b.businessTypes ?? [],
    business_status: b.businessStatus ?? null,
    normalized_name: normalizeName(b.name),
    website: normalizeUrl(b.website) ?? null,
    canonical_website: normalizeUrl(b.website) ?? null,
    website_domain: domainOf(b.website),
    primary_phone: cleanPhones[0] ?? null,
    primary_email: b.emails?.[0] ?? null,
    formatted_address: b.formattedAddress ?? null,
    city: b.city ?? null,
    district: b.district ?? null,
    state: b.state ?? null,
    country: b.country ?? null,
    country_code: b.countryCode ?? null,
    postal_code: b.postalCode ?? null,
    plus_code: b.plusCode ?? null,
    latitude: b.latitude ?? null,
    longitude: b.longitude ?? null,
    maps_url: b.mapsUrl ?? null,
    google_maps_uri: b.googleMapsUri ?? null,
    place_id: b.placeId ?? null,
    opening_hours: b.openingHours ?? [],
    open_now: b.openNow ?? null,
    source_provider: b.sourceProvider,
    source_record_id: b.sourceRecordId ?? null,
    source_url: b.sourceUrl ?? null,
    providers: [(b as unknown as { providers?: string[] }).providers ?? [b.sourceProvider]].flat(),
    enrichment_status: "discovered",
    website_enriched: false,
    completeness_score: completenessScore({
      name: b.name,
      primaryCategory: b.primaryCategory,
      phones: b.phones,
      emails: b.emails,
      website: b.website,
      formattedAddress: b.formattedAddress,
      latitude: b.latitude,
      longitude: b.longitude,
      description: b.description,
      socialLinks: b.socialLinks,
    }),
    data_collected_at: now,
    updated_at: now,
    _searchJobId: searchJobId,
    _phones: cleanPhones,
    _emails: b.emails ?? [],
    _socials: b.socialLinks ?? [],
  };
}

// Local fallback store (used when Supabase is not configured yet).
async function saveLocal(
  items: NormalizedBusiness[],
  job: { id: string }
): Promise<{ saved: PersistedBusiness[]; duplicates: number }> {
  const all = readJson<PersistedBusiness[]>(BIZ_FILE, []);
  const byKey = new Map(all.map((b) => [duplicateKey(b), b]));
  const saved: PersistedBusiness[] = [];
  let duplicates = 0;
  for (const item of items) {
    const key = duplicateKey(item);
    const now = new Date().toISOString();
    if (byKey.has(key)) {
      duplicates++;
      const prev = byKey.get(key)!;
      // merge providers without overwriting
      const providers = Array.from(new Set([...(prev.providers ?? []), item.sourceProvider]));
      prev.providers = providers;
      prev.updatedAt = now;
      saved.push(prev);
      continue;
    }
    const rec: PersistedBusiness = {
      ...item,
      id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      completenessScore: completenessScore({
        name: item.name,
        primaryCategory: item.primaryCategory,
        phones: item.phones,
        emails: item.emails,
        website: item.website,
        formattedAddress: item.formattedAddress,
        latitude: item.latitude,
        longitude: item.longitude,
        description: item.description,
        socialLinks: item.socialLinks,
      }),
      enrichmentStatus: "discovered",
      providers: [item.sourceProvider],
      searchJobId: job.id,
      createdAt: now,
      updatedAt: now,
    };
    byKey.set(key, rec);
    saved.push(rec);
  }
  writeJson(BIZ_FILE, Array.from(byKey.values()));
  return { saved, duplicates };
}

export interface EnrichmentInput {
  emails: { value: string; category: string; pageUrl: string }[];
  phones: { value: string; pageUrl: string }[];
  socials: { platform: string; url: string; pageUrl: string }[];
  title?: string | null;
  metaDescription?: string | null;
  summary?: string | null;
  aboutUrl?: string | null;
  contactUrl?: string | null;
  pagesCrawled: number;
}

export interface EnrichmentOutcome {
  emailsAdded: number;
  phonesAdded: number;
  socialsAdded: number;
  pagesCrawled: number;
}

// Persist website-enrichment output onto a business (local file store + Supabase).
// Respects the discoverSocial / discoverContacts flags.
export async function applyEnrichment(
  businessId: string,
  e: EnrichmentInput,
  opts?: { discoverSocial?: boolean; discoverContacts?: boolean }
): Promise<EnrichmentOutcome | null> {
  const wantSocial = opts?.discoverSocial ?? true;
  const wantContacts = opts?.discoverContacts ?? true;
  const emails = wantContacts ? e.emails : [];
  const phones = wantContacts ? e.phones : [];
  const socials = wantSocial ? e.socials : [];

  if (!isSupabaseConfigured()) {
    const all = readJson<PersistedBusiness[]>(BIZ_FILE, []);
    const b = all.find((x) => x.id === businessId);
    if (!b) return null;
    const emailSet = new Set((b.emails ?? []).map((x) => x.toLowerCase()));
    const phoneSet = new Set(b.phones ?? []);
    const socialSet = new Set((b.socialLinks ?? []).map((s) => `${s.platform}|${s.url}`));
    let emailsAdded = 0;
    let phonesAdded = 0;
    let socialsAdded = 0;
    for (const em of emails) {
      if (!emailSet.has(em.value.toLowerCase())) {
        emailSet.add(em.value.toLowerCase());
        emailsAdded++;
      }
    }
    for (const ph of phones) {
      if (!phoneSet.has(ph.value)) {
        phoneSet.add(ph.value);
        phonesAdded++;
      }
    }
    const merged = [...(b.socialLinks ?? [])];
    for (const s of socials) {
      if (!socialSet.has(`${s.platform}|${s.url}`)) {
        socialSet.add(`${s.platform}|${s.url}`);
        merged.push({ platform: s.platform, url: s.url });
        socialsAdded++;
      }
    }
    b.emails = Array.from(emailSet);
    b.phones = Array.from(phoneSet).filter(isPlausiblePhone);
    b.socialLinks = merged;
    if (!b.description && (e.summary || e.metaDescription)) b.description = (e.summary || e.metaDescription)!;
    b.enrichmentStatus = "enriched";
    b.updatedAt = new Date().toISOString();
    b.completenessScore = completenessScore({
      name: b.name,
      primaryCategory: b.primaryCategory,
      phones: b.phones,
      emails: b.emails,
      website: b.website,
      formattedAddress: b.formattedAddress,
      latitude: b.latitude,
      longitude: b.longitude,
      description: b.description,
      socialLinks: b.socialLinks,
    });
    writeJson(BIZ_FILE, all);
    return { emailsAdded, phonesAdded, socialsAdded, pagesCrawled: e.pagesCrawled };
  }

  const sb = getSupabaseAdmin()!;
  const { data: row } = await sb.from("businesses").select("*").eq("id", businessId).maybeSingle();
  if (!row) return null;

  const contactRows = [
    ...phones.map((p, i) => ({
      business_id: businessId,
      contact_type: "phone",
      value: p.value,
      normalized_value: p.value,
      is_primary: !row.primary_phone && i === 0,
      source: "company_website",
      source_url: p.pageUrl,
    })),
    ...emails.map((em, i) => ({
      business_id: businessId,
      contact_type: "email",
      value: em.value,
      normalized_value: em.value.toLowerCase(),
      is_primary: !row.primary_email && i === 0,
      source: "company_website",
      source_url: em.pageUrl,
    })),
  ];
  if (contactRows.length) await sb.from("business_contacts").insert(contactRows);
  if (emails.length) {
    await sb.from("business_emails").insert(
      emails.map((em) => ({
        business_id: businessId,
        email: em.value,
        category: em.category,
        source: "company_website",
        source_url: em.pageUrl,
      }))
    );
  }
  if (socials.length) {
    await sb.from("business_social_links").upsert(
      socials.map((s) => ({
        business_id: businessId,
        platform: s.platform,
        profile_url: s.url,
        source: "company_website",
        source_url: s.pageUrl,
        is_official: true,
        confidence: "high",
      })),
      { onConflict: "business_id,platform,profile_url", ignoreDuplicates: true }
    );
  }
  await sb.from("business_websites").upsert(
    {
      business_id: businessId,
      official_url: row.website,
      canonical_url: row.canonical_website ?? row.website,
      domain: row.website_domain,
      homepage_title: e.title,
      meta_description: e.metaDescription,
      company_description: e.summary,
      about_url: e.aboutUrl,
      contact_url: e.contactUrl,
      last_crawled_at: new Date().toISOString(),
    },
    { onConflict: "business_id", ignoreDuplicates: false }
  );
  const patch: Record<string, unknown> = {
    website_enriched: true,
    enrichment_status: "enriched",
    last_crawled_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (!row.primary_email && emails[0]) patch.primary_email = emails[0].value;
  if (!row.primary_phone && phones[0]) patch.primary_phone = phones[0].value;
  if (!row.description && (e.summary || e.metaDescription)) patch.description = e.summary || e.metaDescription;
  await sb.from("businesses").update(patch).eq("id", businessId);
  return {
    emailsAdded: emails.length,
    phonesAdded: phones.length,
    socialsAdded: socials.length,
    pagesCrawled: e.pagesCrawled,
  };
}

export async function listAuditLogs(limit = 200): Promise<unknown[]> {
  if (!isSupabaseConfigured()) {
    const logs = readJson<unknown[]>(path.join(DATA_DIR, "audit.json"), []);
    return (logs as unknown[]).slice(0, limit);
  }
  const sb = getSupabaseAdmin()!;
  const { data } = await sb.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(limit);
  return (data ?? []) as unknown[];
}

export type ResetTarget = "businesses" | "packs" | "saved" | "logs";
export const RESET_TARGETS: ResetTarget[] = ["businesses", "packs", "saved", "logs"];

export const RESET_DESCRIPTIONS: Record<ResetTarget, string> = {
  businesses: "All leads + contacts, emails, socials, locations, websites (entire Search pool)",
  packs: "All scraped packs + their result links (leads shared nowhere else are removed too)",
  saved: "All saved scrapings",
  logs: "All audit log events",
};

// How many rows each area holds right now (shown before confirming a reset).
export async function resetCounts(): Promise<Record<ResetTarget, number>> {
  if (!isSupabaseConfigured()) {
    return {
      businesses: readJson<unknown[]>(BIZ_FILE, []).length,
      packs: readJson<unknown[]>(JOBS_FILE, []).length,
      saved: readJson<unknown[]>(SAVED_FILE, []).length,
      logs: readJson<unknown[]>(path.join(DATA_DIR, "audit.json"), []).length,
    };
  }
  const sb = getSupabaseAdmin()!;
  const out: Record<ResetTarget, number> = { businesses: 0, packs: 0, saved: 0, logs: 0 };
  const tables: [ResetTarget, string][] = [
    ["businesses", "businesses"],
    ["packs", "search_jobs"],
    ["saved", "saved_searches"],
    ["logs", "audit_logs"],
  ];
  for (const [key, table] of tables) {
    const { count } = await sb.from(table).select("*", { count: "exact", head: true });
    out[key] = count ?? 0;
  }
  return out;
}

async function deleteAllRows(table: string): Promise<number> {
  const sb = getSupabaseAdmin()!;
  // Service-role delete-all via a match-everything filter, chunked by id pages.
  let deleted = 0;
  for (;;) {
    const { data } = await sb.from(table).select("id").limit(500);
    const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
    if (!ids.length) break;
    const res = await sb.from(table).delete().in("id", ids).select("id");
    deleted += ((res.data ?? []) as unknown[]).length;
    if (ids.length < 500) break;
  }
  return deleted;
}

// Full reset of the chosen areas. Businesses cascade to all child tables;
// packs cascade to result links, scrape jobs and provider runs.
export async function resetData(targets: ResetTarget[]): Promise<Record<ResetTarget, number>> {
  const wanted = Array.from(new Set(targets.filter((t): t is ResetTarget => (RESET_TARGETS as string[]).includes(t))));
  if (!wanted.length) throw new Error("Select at least one area to reset");
  const done: Record<ResetTarget, number> = { businesses: 0, packs: 0, saved: 0, logs: 0 };
  if (!isSupabaseConfigured()) {
    if (wanted.includes("businesses")) {
      const n = readJson<unknown[]>(BIZ_FILE, []).length;
      writeJson(BIZ_FILE, []);
      done.businesses = n;
    }
    if (wanted.includes("packs")) {
      const n = readJson<unknown[]>(JOBS_FILE, []).length;
      writeJson(JOBS_FILE, []);
      done.packs = n;
    }
    if (wanted.includes("saved")) {
      const n = readJson<unknown[]>(SAVED_FILE, []).length;
      writeJson(SAVED_FILE, []);
      done.saved = n;
    }
    if (wanted.includes("logs")) {
      done.logs = await clearAuditLogs();
    }
    await audit("DATA_RESET", { result: `local reset: ${JSON.stringify(done)}` });
    return done;
  }
  // Order matters: packs first (their exclusive leads go too), then any
  // remaining orphan businesses.
  if (wanted.includes("packs")) {
    const sb = getSupabaseAdmin()!;
    const { data: jobs } = await sb.from("search_jobs").select("id");
    for (const j of (jobs ?? []) as { id: string }[]) {
      const r = await deleteJob(j.id);
      done.packs += r.deleted ? 1 : 0;
      done.businesses += r.leadsDeleted;
    }
  }
  if (wanted.includes("businesses")) {
    done.businesses += await deleteAllRows("businesses");
  }
  if (wanted.includes("saved")) {
    done.saved = await deleteAllRows("saved_searches");
  }
  if (wanted.includes("logs")) {
    done.logs = await clearAuditLogs();
  }
  await audit("DATA_RESET", { result: `reset: ${JSON.stringify(done)}` });
  return done;
}

export async function clearAuditLogs(): Promise<number> {
  if (!isSupabaseConfigured()) {
    const logs = readJson<unknown[]>(path.join(DATA_DIR, "audit.json"), []);
    writeJson(path.join(DATA_DIR, "audit.json"), []);
    return logs.length;
  }
  const sb = getSupabaseAdmin()!;
  const { data } = await sb.from("audit_logs").select("id");
  const ids = (data ?? []).map((r: { id: string }) => r.id);
  if (ids.length) {
    // chunk to stay under URL limits
    for (let i = 0; i < ids.length; i += 200) {
      await sb.from("audit_logs").delete().in("id", ids.slice(i, i + 200));
    }
  }
  await audit("LOGS_CLEARED", { result: `${ids.length} events cleared` });
  return ids.length;
}

export interface JobPackage {
  job: SearchJobRecord | null;
  businesses: PersistedBusiness[];
}

// One search = one package: the job plus ONLY its own result set.
export async function getJobPackage(jobId: string): Promise<JobPackage> {
  if (!isSupabaseConfigured()) {
    const jobs = readJson<SearchJobRecord[]>(JOBS_FILE, []);
    const job = jobs.find((j) => j.id === jobId) ?? null;
    const all = readJson<PersistedBusiness[]>(BIZ_FILE, []);
    return { job, businesses: all.filter((b) => b.searchJobId === jobId) };
  }
  const sb = getSupabaseAdmin()!;
  const { data: jobRow } = await sb.from("search_jobs").select("*").eq("id", jobId).maybeSingle();
  if (!jobRow) return { job: null, businesses: [] };
  const r = jobRow as Record<string, unknown>;
  const job: SearchJobRecord = {
    id: r.id as string,
    keyword: r.keyword as string,
    locationText: r.location_text as string,
    category: (r.category as string) ?? "",
    latitude: (r.latitude as number) ?? undefined,
    longitude: (r.longitude as number) ?? undefined,
    radiusMeters: (r.radius_meters as number) ?? undefined,
    country: (r.country as string) ?? undefined,
    status: r.status as string,
    discoveryProvider: r.discovery_provider as string,
    primaryProvider: r.primary_provider as string,
    fallbackProvider: r.fallback_provider as string,
    requestedLimit: r.requested_limit as number,
    enrichWebsite: (r.enrich_website as boolean) ?? undefined,
    discoverSocial: (r.discover_social as boolean) ?? undefined,
    discoverContacts: (r.discover_contacts as boolean) ?? undefined,
    totalDiscovered: r.total_discovered as number,
    totalSaved: r.total_saved as number,
    totalDuplicates: r.total_duplicates as number,
    totalFailed: r.total_failed as number,
    fallbackUsed: r.fallback_used as boolean,
    fallbackReason: (r.fallback_reason as string) ?? undefined,
    providerAttempts: (r.provider_attempts as unknown[]) ?? [],
    errorMessage: (r.error_message as string) ?? undefined,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
  const { data: links } = await sb
    .from("search_job_results")
    .select("business_id")
    .eq("search_job_id", jobId);
  const bizIds = ((links ?? []) as { business_id: string }[]).map((l) => l.business_id);
  if (!bizIds.length) return { job, businesses: [] };
  const businesses: PersistedBusiness[] = [];
  for (let i = 0; i < bizIds.length; i += 200) {
    const { data: rows } = await sb.from("businesses").select("*").in("id", bizIds.slice(i, i + 200));
    for (const row of (rows ?? []) as Record<string, never>[]) {
      businesses.push(mapRow(row as never));
    }
  }
  // preserve discovery order
  const order = new Map(bizIds.map((id, i) => [id, i]));
  businesses.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  await attachRelations(businesses);
  return { job, businesses };
}

export async function getJob(jobId: string): Promise<SearchJobRecord | null> {
  return (await getJobPackage(jobId)).job;
}

// Delete businesses (child rows cascade in Supabase). Leads in other packages
// are untouched — only the given ids are removed.
export async function deleteBusinesses(ids: string[]): Promise<number> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (!unique.length) return 0;
  if (!isSupabaseConfigured()) {
    const all = readJson<PersistedBusiness[]>(BIZ_FILE, []);
    const set = new Set(unique);
    const kept = all.filter((b) => !set.has(b.id));
    writeJson(BIZ_FILE, kept);
    await audit("BUSINESSES_DELETED", { result: `${all.length - kept.length} businesses deleted` });
    return all.length - kept.length;
  }
  const sb = getSupabaseAdmin()!;
  let deleted = 0;
  for (let i = 0; i < unique.length; i += 200) {
    const { data } = await sb.from("businesses").delete().in("id", unique.slice(i, i + 200)).select("id");
    deleted += (data ?? []).length;
  }
  await audit("BUSINESSES_DELETED", { result: `${deleted} businesses deleted` });
  return deleted;
}

// Delete a scraped pack: the job, its result links, AND the leads that belong
// exclusively to this pack (removed from Search too). Leads that also appear
// in other packs are kept.
export async function deleteJob(jobId: string): Promise<{ deleted: boolean; leadsDeleted: number }> {
  if (!isSupabaseConfigured()) {
    const jobs = readJson<SearchJobRecord[]>(JOBS_FILE, []);
    const kept = jobs.filter((j) => j.id !== jobId);
    const existed = kept.length !== jobs.length;
    writeJson(JOBS_FILE, kept);
    let leadsDeleted = 0;
    if (existed) {
      const all = readJson<PersistedBusiness[]>(BIZ_FILE, []);
      const remaining = all.filter((b) => b.searchJobId !== jobId);
      leadsDeleted = all.length - remaining.length;
      writeJson(BIZ_FILE, remaining);
      await audit("SEARCH_DELETED", { entity: "search_job", entityId: jobId, result: `${leadsDeleted} exclusive leads deleted` });
    }
    return { deleted: existed, leadsDeleted };
  }
  const sb = getSupabaseAdmin()!;
  const { data: links } = await sb.from("search_job_results").select("business_id").eq("search_job_id", jobId);
  const bizIds = Array.from(new Set(((links ?? []) as { business_id: string }[]).map((l) => l.business_id)));
  let exclusive: string[] = bizIds;
  if (bizIds.length > 0) {
    const shared = new Set<string>();
    for (let i = 0; i < bizIds.length; i += 200) {
      const { data: others } = await sb
        .from("search_job_results")
        .select("business_id")
        .in("business_id", bizIds.slice(i, i + 200))
        .neq("search_job_id", jobId);
      for (const o of (others ?? []) as { business_id: string }[]) shared.add(o.business_id);
    }
    exclusive = bizIds.filter((id) => !shared.has(id));
  }
  const leadsDeleted = await deleteBusinesses(exclusive);
  const { data } = await sb.from("search_jobs").delete().eq("id", jobId).select("id");
  const ok = (data ?? []).length > 0;
  if (ok) {
    await audit("SEARCH_DELETED", {
      entity: "search_job",
      entityId: jobId,
      result: `pack deleted with ${leadsDeleted} exclusive leads`,
    });
  }
  return { deleted: ok, leadsDeleted };
}

const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const EXPORT_COLUMNS_KEY = "export_columns";

function readLocalSettings(): Record<string, unknown> {
  return readJson<Record<string, unknown>>(SETTINGS_FILE, {});
}

// Export column customization, persisted in the database (system_settings)
// so every device/browser uses the same columns. Null = never customized.
export async function getExportColumnsSetting(): Promise<string[] | null> {
  const clean = (v: unknown): string[] | null => {
    if (!Array.isArray(v)) return null;
    const cols = v.filter((c): c is string => typeof c === "string" && c.length > 0 && c.length <= 64);
    return cols.length > 0 ? cols.slice(0, 50) : null;
  };
  if (!isSupabaseConfigured()) {
    return clean(readLocalSettings()[EXPORT_COLUMNS_KEY]);
  }
  const sb = getSupabaseAdmin()!;
  const { data } = await sb.from("system_settings").select("value").eq("key", EXPORT_COLUMNS_KEY).maybeSingle();
  return clean((data as { value: unknown } | null)?.value);
}

export async function saveExportColumnsSetting(cols: string[]): Promise<string[]> {
  const clean = Array.from(new Set(cols.filter((c) => typeof c === "string" && c.length > 0 && c.length <= 64))).slice(0, 50);
  if (!clean.length) throw new Error("Select at least one column");
  if (!isSupabaseConfigured()) {
    writeJson(SETTINGS_FILE, { ...readLocalSettings(), [EXPORT_COLUMNS_KEY]: clean });
    return clean;
  }
  const sb = getSupabaseAdmin()!;
  const { error } = await sb.from("system_settings").upsert({ key: EXPORT_COLUMNS_KEY, value: clean });
  if (error) throw new Error(error.message);
  await audit("EXPORT_SETTINGS_SAVED", { result: `${clean.length} columns` });
  return clean;
}

export interface SavedScrapingRecord {
  id: string;
  name: string;
  keyword: string;
  locationText: string;
  category?: string;
  radiusMeters?: number;
  requestedLimit?: number;
  discoveryProvider?: string;
  primaryProvider?: string;
  fallbackProvider?: string;
  enrichWebsite?: boolean;
  discoverSocial?: boolean;
  discoverContacts?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SavedScrapingInput {
  name: string;
  keyword: string;
  locationText: string;
  category?: string;
  radiusMeters?: number;
  requestedLimit?: number;
  discoveryProvider?: string;
  primaryProvider?: string;
  fallbackProvider?: string;
  enrichWebsite?: boolean;
  discoverSocial?: boolean;
  discoverContacts?: boolean;
}

const SAVED_FILE = path.join(DATA_DIR, "saved_scrapings.json");

function mapSavedRow(r: Record<string, unknown>): SavedScrapingRecord {
  return {
    id: r.id as string,
    name: (r.name as string) ?? "Untitled",
    keyword: (r.keyword as string) ?? "",
    locationText: (r.location_text as string) ?? "",
    category: (r.category as string) ?? undefined,
    radiusMeters: (r.radius_meters as number) ?? undefined,
    requestedLimit: (r.requested_limit as number) ?? undefined,
    discoveryProvider: (r.discovery_provider as string) ?? undefined,
    primaryProvider: (r.primary_provider as string) ?? undefined,
    fallbackProvider: (r.fallback_provider as string) ?? undefined,
    enrichWebsite: (r.enrich_website as boolean) ?? undefined,
    discoverSocial: (r.discover_social as boolean) ?? undefined,
    discoverContacts: (r.discover_contacts as boolean) ?? undefined,
    createdAt: (r.created_at as string) ?? new Date().toISOString(),
    updatedAt: (r.updated_at as string) ?? new Date().toISOString(),
  };
}

export async function listSavedScrapings(): Promise<SavedScrapingRecord[]> {
  if (!isSupabaseConfigured()) {
    return readJson<SavedScrapingRecord[]>(SAVED_FILE, []);
  }
  const sb = getSupabaseAdmin()!;
  const { data } = await sb.from("saved_searches").select("*").order("created_at", { ascending: false }).limit(200);
  return ((data ?? []) as Record<string, unknown>[]).map(mapSavedRow);
}

export async function createSavedScraping(input: SavedScrapingInput): Promise<SavedScrapingRecord> {
  const name = input.name.trim().slice(0, 120);
  const keyword = input.keyword.trim().slice(0, 200);
  const locationText = (input.locationText ?? "").trim().slice(0, 300);
  if (!name || !keyword) throw new Error("Name and keyword are required");
  if (!isSupabaseConfigured()) {
    const all = readJson<SavedScrapingRecord[]>(SAVED_FILE, []);
    const rec: SavedScrapingRecord = {
      id: `local_${Date.now()}`,
      name,
      keyword,
      locationText,
      category: input.category,
      radiusMeters: input.radiusMeters,
      requestedLimit: input.requestedLimit,
      discoveryProvider: input.discoveryProvider,
      primaryProvider: input.primaryProvider,
      fallbackProvider: input.fallbackProvider,
      enrichWebsite: input.enrichWebsite,
      discoverSocial: input.discoverSocial,
      discoverContacts: input.discoverContacts,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    all.unshift(rec);
    writeJson(SAVED_FILE, all.slice(0, 200));
    return rec;
  }
  const sb = getSupabaseAdmin()!;
  const { data, error } = await sb
    .from("saved_searches")
    .insert({
      name,
      keyword,
      location_text: locationText,
      category: input.category ?? null,
      radius_meters: input.radiusMeters ?? null,
      requested_limit: input.requestedLimit ?? 20,
      discovery_provider: input.discoveryProvider ?? "automatic",
      primary_provider: input.primaryProvider ?? "browser_discovery",
      fallback_provider: input.fallbackProvider ?? "google_places",
      enrich_website: input.enrichWebsite ?? true,
      discover_social: input.discoverSocial ?? true,
      discover_contacts: input.discoverContacts ?? true,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await audit("SAVED_SCRAPING_CREATED", { result: name });
  return mapSavedRow(data as Record<string, unknown>);
}

export async function deleteSavedScraping(id: string): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    const all = readJson<SavedScrapingRecord[]>(SAVED_FILE, []);
    const kept = all.filter((s) => s.id !== id);
    writeJson(SAVED_FILE, kept);
    return kept.length !== all.length;
  }
  const sb = getSupabaseAdmin()!;
  const { data } = await sb.from("saved_searches").delete().eq("id", id).select("id");
  return (data ?? []).length > 0;
}
export async function persistBusinesses(
  items: NormalizedBusiness[],
  job: { id: string }
): Promise<{ saved: PersistedBusiness[]; duplicates: number; failed: number; backend: "supabase" | "local" }> {
  if (!isSupabaseConfigured()) {
    const r = await saveLocal(items, job);
    return { ...r, failed: 0, backend: "local" };
  }
  const sb = getSupabaseAdmin()!;
  let duplicates = 0;
  let failed = 0;
  const saved: PersistedBusiness[] = [];
  const mode = process.env.RAW_PAYLOAD_MODE ?? "normalized-only";

  for (const item of items) {
    try {
      const row = toRow(item, job.id);
      const { _searchJobId, _phones, _emails, _socials, ...bizRow } = row;
      // Upsert on place_id when present, else insert.
      let bizId: string | null = null;
      if (bizRow.place_id) {
        const { data: existing } = await sb
          .from("businesses")
          .select("id, providers")
          .eq("place_id", bizRow.place_id)
          .limit(1)
          .maybeSingle();
        if (existing) {
          duplicates++;
          const providers = Array.from(new Set([...((existing.providers as string[]) ?? []), item.sourceProvider]));
          await sb.from("businesses").update({ providers, updated_at: new Date().toISOString() }).eq("id", existing.id);
          bizId = existing.id;
        }
      }
      if (!bizId) {
        const { data, error } = await sb.from("businesses").insert(bizRow).select("id").single();
        if (error) {
          // Unique/domain collisions count as duplicates
          if (/duplicate|unique/i.test(error.message)) duplicates++;
          else failed++;
          continue;
        }
        bizId = data.id;
      }
      // Contacts / emails / socials (best effort)
      const contactRows = [
        ...(_phones as string[]).map((p, i) => ({
          business_id: bizId,
          contact_type: "phone",
          value: p,
          normalized_value: p,
          is_primary: i === 0,
          source: item.sourceProvider,
          source_url: item.sourceUrl,
        })),
        ...(_emails as string[]).map((e, i) => ({
          business_id: bizId,
          contact_type: "email",
          value: e,
          normalized_value: e.toLowerCase(),
          is_primary: i === 0,
          source: item.sourceProvider,
          source_url: item.sourceUrl,
        })),
      ];
      if (contactRows.length) await sb.from("business_contacts").insert(contactRows);
      const emailRows = (_emails as string[]).map((e) => ({
        business_id: bizId,
        email: e,
        source: item.sourceProvider,
        source_url: item.sourceUrl,
      }));
      if (emailRows.length) await sb.from("business_emails").insert(emailRows);
      const socialRows = (_socials as { platform: string; url: string }[]).map((s) => ({
        business_id: bizId,
        platform: s.platform,
        profile_url: s.url,
        source: item.sourceProvider,
        source_url: item.sourceUrl,
        is_official: false,
      }));
      if (socialRows.length) await sb.from("business_social_links").upsert(socialRows, { onConflict: "business_id,platform,profile_url", ignoreDuplicates: true });
      // Aggregate card rating (no review content ever). Stored as attributes
      // so no schema change is needed.
      const attrRows = [
        item.rating != null ? { business_id: bizId, attribute_key: "rating", attribute_value: String(item.rating), source: item.sourceProvider } : null,
        item.reviewsCount != null ? { business_id: bizId, attribute_key: "reviews_count", attribute_value: String(item.reviewsCount), source: item.sourceProvider } : null,
      ].filter((x): x is { business_id: string; attribute_key: string; attribute_value: string; source: string } => x !== null);
      if (attrRows.length) {
        await sb.from("business_attributes").delete().eq("business_id", bizId).in("attribute_key", ["rating", "reviews_count"]);
        await sb.from("business_attributes").insert(attrRows);
      }
      await sb.from("search_job_results").upsert(
        { search_job_id: _searchJobId, business_id: bizId, provider: item.sourceProvider },
        { onConflict: "search_job_id,business_id", ignoreDuplicates: true }
      );
      if (mode === "full") {
        await sb.from("business_source_records").insert({
          business_id: bizId,
          provider: item.sourceProvider,
          source_identifier: item.sourceRecordId,
          source_url: item.sourceUrl,
          raw_payload: (item.raw as object) ?? { normalized: true },
        });
      }
      saved.push({
        ...item,
        id: bizId as string,
        completenessScore: bizRow.completeness_score,
        enrichmentStatus: "discovered",
        providers: bizRow.providers,
        searchJobId: _searchJobId as string,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch {
      failed++;
    }
  }
  return { saved, duplicates, failed, backend: "supabase" };
}

export async function listBusinesses(filters: Record<string, string> = {}): Promise<PersistedBusiness[]> {
  if (!isSupabaseConfigured()) {
    let all = readJson<PersistedBusiness[]>(BIZ_FILE, []);
    if (filters.q) {
      const q = filters.q.toLowerCase();
      all = all.filter((b) => b.name.toLowerCase().includes(q) || (b.city ?? "").toLowerCase().includes(q));
    }
    if (filters.provider) all = all.filter((b) => b.providers?.includes(filters.provider) || b.sourceProvider === filters.provider);
    if (filters.hasWebsite === "yes") all = all.filter((b) => b.website);
    if (filters.hasEmail === "yes") all = all.filter((b) => b.emails?.length);
    if (filters.hasPhone === "yes") all = all.filter((b) => b.phones?.length);
    if (filters.city) all = all.filter((b) => (b.city ?? "").toLowerCase().includes(filters.city.toLowerCase()));
    if (filters.country) all = all.filter((b) => (b.country ?? "").toLowerCase().includes(filters.country.toLowerCase()));
    return all.slice(0, 500);
  }
  const sb = getSupabaseAdmin()!;
  let q = sb.from("businesses").select("*").order("created_at", { ascending: false }).limit(500);
  if (filters.q) q = q.ilike("name", `%${filters.q}%`);
  if (filters.provider) q = q.eq("source_provider", filters.provider);
  if (filters.city) q = q.ilike("city", `%${filters.city}%`);
  if (filters.country) q = q.ilike("country", `%${filters.country}%`);
  const { data } = await q;
  const items = ((data ?? []) as Record<string, never>[]).map((r) => mapRow(r as never));
  await attachRelations(items);
  return items;
}

// Batch-load social links + all contacts for the given businesses and attach
// them, so enriched data saved in child tables is visible in UI and exports.
async function attachRelations(items: PersistedBusiness[]): Promise<void> {
  if (items.length === 0 || !isSupabaseConfigured()) return;
  const sb = getSupabaseAdmin()!;
  const ids = items.map((b) => b.id);
  const [socialRes, contactRes, attrRes] = await Promise.all([
    sb.from("business_social_links").select("business_id,platform,profile_url").in("business_id", ids),
    sb.from("business_contacts").select("business_id,contact_type,value,is_primary").in("business_id", ids).order("is_primary", { ascending: false }),
    sb.from("business_attributes").select("business_id,attribute_key,attribute_value").in("business_id", ids).in("attribute_key", ["rating", "reviews_count"]),
  ]);
  const socialById = new Map<string, { platform: string; url: string }[]>();
  for (const s of (socialRes.data ?? []) as { business_id: string; platform: string; profile_url: string }[]) {
    const arr = socialById.get(s.business_id) ?? [];
    if (!arr.some((x) => x.platform === s.platform && x.url === s.profile_url)) {
      arr.push({ platform: s.platform, url: s.profile_url });
    }
    socialById.set(s.business_id, arr);
  }
  const phonesById = new Map<string, string[]>();
  const emailsById = new Map<string, string[]>();
  const attrById = attrMaps(
    ((attrRes.data ?? []) as { business_id: string; attribute_key: string; attribute_value: string }[])
  );
  for (const c of (contactRes.data ?? []) as { business_id: string; contact_type: string; value: string }[]) {
    const map = c.contact_type === "email" ? emailsById : phonesById;
    const arr = map.get(c.business_id) ?? [];
    if (c.value && !arr.includes(c.value)) arr.push(c.value);
    map.set(c.business_id, arr);
  }
  for (const b of items) {
    const socials = socialById.get(b.id) ?? [];
    if (socials.length) b.socialLinks = socials;
    const phones = phonesById.get(b.id) ?? [];
    const emails = emailsById.get(b.id) ?? [];
    if (phones.length) b.phones = Array.from(new Set([...phones, ...(b.phones ?? [])]));
    if (emails.length) b.emails = Array.from(new Set([...emails, ...(b.emails ?? [])]));
    const attrs = attrById.get(b.id);
    if (attrs?.rating != null) b.rating = attrs.rating;
    if (attrs?.reviewsCount != null) b.reviewsCount = attrs.reviewsCount;
  }
}

function attrMaps(rows: { business_id: string; attribute_key: string; attribute_value: string }[]) {
  const map = new Map<string, { rating?: number; reviewsCount?: number }>();
  for (const r of rows) {
    const cur = map.get(r.business_id) ?? {};
    const n = Number(r.attribute_value);
    if (!Number.isFinite(n)) continue;
    if (r.attribute_key === "rating") cur.rating = n;
    if (r.attribute_key === "reviews_count") cur.reviewsCount = Math.round(n);
    map.set(r.business_id, cur);
  }
  return map;
}

function mapRow(r: Record<string, unknown>): PersistedBusiness {
  const g = (k: string) => r[k] as never;
  return {
    id: g("id") as string,
    name: (g("name") as string) ?? "Unknown",
    description: (g("description") as string) ?? null,
    primaryCategory: (g("primary_category") as string) ?? null,
    secondaryCategories: (g("secondary_categories") as string[]) ?? [],
    website: (g("website") as string) ?? null,
    phones: g("primary_phone") ? [g("primary_phone") as string] : [],
    emails: g("primary_email") ? [g("primary_email") as string] : [],
    formattedAddress: (g("formatted_address") as string) ?? null,
    city: (g("city") as string) ?? null,
    district: (g("district") as string) ?? null,
    state: (g("state") as string) ?? null,
    country: (g("country") as string) ?? null,
    postalCode: (g("postal_code") as string) ?? null,
    latitude: (g("latitude") as number) ?? null,
    longitude: (g("longitude") as number) ?? null,
    mapsUrl: (g("maps_url") as string) ?? null,
    googleMapsUri: (g("google_maps_uri") as string) ?? null,
    placeId: (g("place_id") as string) ?? null,
    openingHours: (g("opening_hours") as string[]) ?? [],
    openNow: (g("open_now") as boolean) ?? null,
    sourceProvider: (g("source_provider") as string) ?? "unknown",
    sourceRecordId: (g("source_record_id") as string) ?? null,
    sourceUrl: (g("source_url") as string) ?? null,
    socialLinks: [],
    completenessScore: (g("completeness_score") as number) ?? 0,
    enrichmentStatus: (g("enrichment_status") as string) ?? "pending",
    providers: ((g("providers") as string[]) ?? [g("source_provider") as string]).filter(Boolean),
    createdAt: (g("created_at") as string) ?? new Date().toISOString(),
    updatedAt: (g("updated_at") as string) ?? new Date().toISOString(),
  } as PersistedBusiness;
}

export async function getBusiness(id: string): Promise<PersistedBusiness | null> {
  if (!isSupabaseConfigured()) {
    const all = await listBusinesses();
    return all.find((b) => b.id === id) ?? null;
  }
  const sb = getSupabaseAdmin()!;
  const { data } = await sb.from("businesses").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const item = mapRow(data as Record<string, never>);
  await attachRelations([item]);
  return item;
}

// ---------- Manual business editing (production data stewardship) ----------

export interface BusinessContactRecord {
  id: string;
  businessId: string;
  type: "phone" | "email";
  value: string;
  normalized?: string | null;
  category?: string | null;
  isPrimary: boolean;
  source?: string | null;
}

function toContactType(t: string): "phone" | "email" {
  return t.toLowerCase().includes("mail") ? "email" : "phone";
}

export async function listContacts(businessId: string): Promise<BusinessContactRecord[]> {
  if (!isSupabaseConfigured()) {
    const b = await getBusiness(businessId);
    if (!b) return [];
    const out: BusinessContactRecord[] = [];
    (b.phones ?? []).forEach((v, i) =>
      out.push({ id: `local-phone-${i}`, businessId, type: "phone", value: v, isPrimary: i === 0, source: "local" })
    );
    (b.emails ?? []).forEach((v, i) =>
      out.push({ id: `local-email-${i}`, businessId, type: "email", value: v, isPrimary: i === 0, source: "local" })
    );
    return out;
  }
  const sb = getSupabaseAdmin()!;
  const { data, error } = await sb
    .from("business_contacts")
    .select("id,business_id,contact_type,value,normalized_value,category,is_primary,source")
    .eq("business_id", businessId)
    .order("is_primary", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    businessId: r.business_id as string,
    type: toContactType(String(r.contact_type ?? "")),
    value: String(r.value ?? ""),
    normalized: (r.normalized_value as string) ?? null,
    category: (r.category as string) ?? null,
    isPrimary: Boolean(r.is_primary),
    source: (r.source as string) ?? null,
  }));
}

async function refreshCompleteness(businessId: string): Promise<void> {
  try {
    const b = await getBusiness(businessId);
    if (!b) return;
    const score = completenessScore({
      name: b.name,
      primaryCategory: b.primaryCategory,
      phones: b.phones,
      emails: b.emails,
      website: b.website,
      formattedAddress: b.formattedAddress,
      latitude: b.latitude,
      longitude: b.longitude,
      description: b.description,
      socialLinks: b.socialLinks,
    });
    if (!isSupabaseConfigured()) return;
    const sb = getSupabaseAdmin()!;
    await sb.from("businesses").update({ completeness_score: score, updated_at: new Date().toISOString() }).eq("id", businessId);
  } catch {
    /* completeness is best-effort */
  }
}

export async function addContact(
  businessId: string,
  input: { type: "phone" | "email"; value: string; category?: string }
): Promise<BusinessContactRecord> {
  const raw = input.value.trim();
  if (!raw) throw new Error("Value is required");
  let value = raw;
  let normalized: string | null = null;
  if (input.type === "email") {
    const { isRealEmail } = await import("@/lib/contacts/extractor");
    if (!isRealEmail(raw)) throw new Error("Not a valid email address");
    value = normalizeEmail(raw);
    normalized = value;
  } else {
    if (!isPlausiblePhone(raw)) throw new Error("Not a valid phone number");
    normalized = normalizePhone(raw);
    if (!normalized) throw new Error("Not a valid phone number");
  }
  const category = (input.category ?? "general").slice(0, 40);

  if (!isSupabaseConfigured()) {
    const all = readJson<PersistedBusiness[]>(BIZ_FILE, []);
    const b = all.find((x) => x.id === businessId);
    if (!b) throw new Error("Business not found");
    const arr = input.type === "email" ? (b.emails ?? []) : (b.phones ?? []);
    if (!arr.some((v) => v.toLowerCase() === value.toLowerCase())) arr.push(value);
    if (input.type === "email") b.emails = arr;
    else b.phones = arr;
    b.updatedAt = new Date().toISOString();
    writeJson(BIZ_FILE, all);
    await audit("CONTACT_ADDED", { entity: "business", entityId: businessId, result: `${input.type}: ${value}` });
    return { id: `local-${input.type}-${Date.now()}`, businessId, type: input.type, value, normalized, category, isPrimary: arr[0]?.toLowerCase() === value.toLowerCase(), source: "manual" };
  }

  const sb = getSupabaseAdmin()!;
  const { data: biz } = await sb.from("businesses").select("id,primary_phone,primary_email").eq("id", businessId).maybeSingle();
  if (!biz) throw new Error("Business not found");
  const makePrimary = input.type === "email" ? !(biz as { primary_email: string }).primary_email : !(biz as { primary_phone: string }).primary_phone;
  const { data, error } = await sb
    .from("business_contacts")
    .insert({
      business_id: businessId,
      contact_type: input.type,
      value,
      normalized_value: normalized,
      category,
      source: "manual",
      is_primary: makePrimary,
      confidence: "high",
      is_verified: true,
    })
    .select("id,business_id,contact_type,value,normalized_value,category,is_primary,source")
    .single();
  if (error) throw new Error(error.message);
  if (input.type === "email") {
    await sb.from("business_emails").upsert(
      { business_id: businessId, email: value, category, source: "manual", confidence: "high" },
      { onConflict: "business_id,email", ignoreDuplicates: true }
    );
    if (makePrimary) {
      await sb.from("businesses").update({ primary_email: value, updated_at: new Date().toISOString() }).eq("id", businessId);
    }
  } else if (makePrimary) {
    await sb.from("businesses").update({ primary_phone: value, updated_at: new Date().toISOString() }).eq("id", businessId);
  }
  await audit("CONTACT_ADDED", { entity: "business", entityId: businessId, result: `${input.type}: ${value}` });
  await refreshCompleteness(businessId);
  const r = data as Record<string, unknown>;
  return {
    id: r.id as string,
    businessId: r.business_id as string,
    type: input.type,
    value: String(r.value ?? value),
    normalized: (r.normalized_value as string) ?? normalized,
    category: (r.category as string) ?? category,
    isPrimary: Boolean(r.is_primary),
    source: (r.source as string) ?? "manual",
  };
}

export async function deleteContact(businessId: string, ref: { contactId?: string; type?: "phone" | "email"; value?: string }): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    const all = readJson<PersistedBusiness[]>(BIZ_FILE, []);
    const b = all.find((x) => x.id === businessId);
    if (!b) return false;
    const dropFrom = (arr: string[] | undefined, t: "phone" | "email"): string[] | undefined => {
      if (!arr) return arr;
      if (ref.type && ref.type !== t) return arr;
      if (ref.contactId?.startsWith(`local-${t}-`)) {
        const idx = Number(ref.contactId.slice(`local-${t}-`.length));
        if (Number.isInteger(idx)) return arr.filter((_, i) => i !== idx);
        return arr;
      }
      if (ref.value) return arr.filter((v) => v.toLowerCase() !== ref.value!.toLowerCase());
      return arr;
    };
    const before = (b.phones?.length ?? 0) + (b.emails?.length ?? 0);
    b.phones = dropFrom(b.phones, "phone") ?? [];
    b.emails = dropFrom(b.emails, "email") ?? [];
    b.updatedAt = new Date().toISOString();
    writeJson(BIZ_FILE, all);
    const removed = before - ((b.phones?.length ?? 0) + (b.emails?.length ?? 0)) > 0;
    if (removed) await audit("CONTACT_DELETED", { entity: "business", entityId: businessId });
    return removed;
  }
  const sb = getSupabaseAdmin()!;
  let row: Record<string, unknown> | null = null;
  if (ref.contactId && !ref.contactId.startsWith("local-")) {
    const { data } = await sb.from("business_contacts").select("*").eq("id", ref.contactId).eq("business_id", businessId).maybeSingle();
    row = (data as Record<string, unknown> | null) ?? null;
  } else if (ref.type && ref.value) {
    const { data } = await sb
      .from("business_contacts")
      .select("*")
      .eq("business_id", businessId)
      .eq("contact_type", ref.type)
      .ilike("value", ref.value)
      .limit(1)
      .maybeSingle();
    row = (data as Record<string, unknown> | null) ?? null;
  }
  if (!row) return false;
  await sb.from("business_contacts").delete().eq("id", row.id as string);
  if (toContactType(String(row.contact_type ?? "")) === "email") {
    await sb.from("business_emails").delete().eq("business_id", businessId).ilike("email", String(row.value ?? ""));
  }
  if (row.is_primary) {
    // Promote the next remaining contact of the same group to primary.
    const type = toContactType(String(row.contact_type ?? ""));
    const { data: rest } = await sb
      .from("business_contacts")
      .select("id,value")
      .eq("business_id", businessId)
      .eq("contact_type", type === "email" ? "email" : "phone")
      .limit(1);
    const next = ((rest ?? []) as { id: string; value: string }[])[0];
    if (next) {
      await sb.from("business_contacts").update({ is_primary: true }).eq("id", next.id);
      await sb
        .from("businesses")
        .update({ ...(type === "email" ? { primary_email: next.value } : { primary_phone: next.value }), updated_at: new Date().toISOString() })
        .eq("id", businessId);
    } else {
      await sb
        .from("businesses")
        .update({ ...(type === "email" ? { primary_email: null } : { primary_phone: null }), updated_at: new Date().toISOString() })
        .eq("id", businessId);
    }
  }
  await audit("CONTACT_DELETED", { entity: "business", entityId: businessId, result: String(row.value ?? "") });
  await refreshCompleteness(businessId);
  return true;
}

export async function setPrimaryContact(businessId: string, ref: { contactId?: string; type?: "phone" | "email"; value?: string }): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    const all = readJson<PersistedBusiness[]>(BIZ_FILE, []);
    const b = all.find((x) => x.id === businessId);
    if (!b) return false;
    const moveFirst = (arr: string[] | undefined, matchIdx: (a: string[]) => number) => {
      if (!arr || arr.length < 2) return false;
      const i = matchIdx(arr);
      if (i <= 0) return i === 0;
      const [v] = arr.splice(i, 1);
      arr.unshift(v);
      return true;
    };
    let ok = false;
    if (ref.contactId?.startsWith("local-phone-")) {
      ok = moveFirst(b.phones, (a) => a.findIndex((_, i) => `local-phone-${i}` === ref.contactId));
    } else if (ref.contactId?.startsWith("local-email-")) {
      ok = moveFirst(b.emails, (a) => a.findIndex((_, i) => `local-email-${i}` === ref.contactId));
    } else if (ref.type === "phone" && ref.value) {
      ok = moveFirst(b.phones, (a) => a.findIndex((v) => v.toLowerCase() === ref.value!.toLowerCase()));
    } else if (ref.type === "email" && ref.value) {
      ok = moveFirst(b.emails, (a) => a.findIndex((v) => v.toLowerCase() === ref.value!.toLowerCase()));
    }
    if (ok) {
      b.updatedAt = new Date().toISOString();
      writeJson(BIZ_FILE, all);
    }
    return ok;
  }
  const sb = getSupabaseAdmin()!;
  let targetId: string | null = null;
  let targetType: "phone" | "email" | null = null;
  if (ref.contactId && !ref.contactId.startsWith("local-")) {
    const { data } = await sb.from("business_contacts").select("id,contact_type").eq("id", ref.contactId).eq("business_id", businessId).maybeSingle();
    const row = data as { id: string; contact_type: string } | null;
    if (!row) return false;
    targetId = row.id;
    targetType = toContactType(row.contact_type);
  } else if (ref.type && ref.value) {
    const { data } = await sb
      .from("business_contacts")
      .select("id,contact_type")
      .eq("business_id", businessId)
      .eq("contact_type", ref.type)
      .ilike("value", ref.value)
      .limit(1)
      .maybeSingle();
    const row = data as { id: string; contact_type: string } | null;
    if (!row) return false;
    targetId = row.id;
    targetType = ref.type;
  }
  if (!targetId || !targetType) return false;
  // Clear primary within the same group (phone group covers phone/mobile/landline/whatsapp variants).
  const groupTypes = targetType === "email" ? ["email"] : ["phone", "mobile", "landline", "whatsapp"];
  await sb.from("business_contacts").update({ is_primary: false }).eq("business_id", businessId).in("contact_type", groupTypes);
  const { data: updated } = await sb.from("business_contacts").update({ is_primary: true }).eq("id", targetId).select("value").single();
  const val = (updated as { value: string } | null)?.value;
  if (val) {
    await sb
      .from("businesses")
      .update({ ...(targetType === "email" ? { primary_email: val } : { primary_phone: val }), updated_at: new Date().toISOString() })
      .eq("id", businessId);
  }
  await audit("CONTACT_PRIMARY", { entity: "business", entityId: businessId, result: val ?? targetId });
  return true;
}

export interface SocialInput {
  platform: string;
  url: string;
}

export async function addSocial(
  businessId: string,
  input: SocialInput
): Promise<{ id: string; platform: string; url: string }> {
  const { KNOWN_PLATFORMS, detectSocialPlatform } = await import("@/lib/social/detector");
  const platform = input.platform.trim().toLowerCase();
  if (!(KNOWN_PLATFORMS as readonly string[]).includes(platform)) {
    throw new Error(`Unknown platform. Choose one of: ${(KNOWN_PLATFORMS as readonly string[]).join(", ")}`);
  }
  const raw = input.url.trim();
  if (!raw) throw new Error("URL is required");
  const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let profileUrl: string;
  try {
    const u = new URL(withProto);
    if (!/^https?:$/.test(u.protocol)) throw new Error("bad protocol");
    u.hash = "";
    profileUrl = u.toString();
  } catch {
    throw new Error("Not a valid URL");
  }
  // Canonicalize when the URL recognizably belongs to the platform.
  const detected = detectSocialPlatform(profileUrl);
  if (detected) profileUrl = detected.profileUrl;

  if (!isSupabaseConfigured()) {
    const all = readJson<PersistedBusiness[]>(BIZ_FILE, []);
    const b = all.find((x) => x.id === businessId);
    if (!b) throw new Error("Business not found");
    b.socialLinks = b.socialLinks ?? [];
    if (!b.socialLinks.some((s) => s.platform === platform && s.url === profileUrl)) {
      b.socialLinks.push({ platform, url: profileUrl });
    }
    b.updatedAt = new Date().toISOString();
    writeJson(BIZ_FILE, all);
    await audit("SOCIAL_ADDED", { entity: "business", entityId: businessId, result: `${platform}: ${profileUrl}` });
    await refreshCompleteness(businessId);
    return { id: `local-${platform}-${Date.now()}`, platform, url: profileUrl };
  }
  const sb = getSupabaseAdmin()!;
  const { data: biz } = await sb.from("businesses").select("id").eq("id", businessId).maybeSingle();
  if (!biz) throw new Error("Business not found");
  const { data, error } = await sb
    .from("business_social_links")
    .upsert(
      {
        business_id: businessId,
        platform,
        profile_url: profileUrl,
        source: "manual",
        is_official: true,
        confidence: "high",
        verification_status: "verified",
      },
      { onConflict: "business_id,platform,profile_url", ignoreDuplicates: false }
    )
    .select("id,platform,profile_url")
    .single();
  if (error) throw new Error(error.message);
  await audit("SOCIAL_ADDED", { entity: "business", entityId: businessId, result: `${platform}: ${profileUrl}` });
  await refreshCompleteness(businessId);
  const r = data as { id: string; platform: string; profile_url: string };
  return { id: r.id, platform: r.platform, url: r.profile_url };
}

export async function deleteSocial(businessId: string, ref: { socialId?: string; platform?: string; url?: string }): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    const all = readJson<PersistedBusiness[]>(BIZ_FILE, []);
    const b = all.find((x) => x.id === businessId);
    if (!b?.socialLinks) return false;
    const before = b.socialLinks.length;
    // Local rows carry no stable ids — match by platform (+url when given).
    b.socialLinks = b.socialLinks.filter((s) => {
      if (ref.platform && ref.url) return !(s.platform === ref.platform && s.url === ref.url);
      if (ref.platform) return s.platform !== ref.platform;
      return true;
    });
    b.updatedAt = new Date().toISOString();
    writeJson(BIZ_FILE, all);
    const removed = before - b.socialLinks.length > 0;
    if (removed) {
      await audit("SOCIAL_DELETED", { entity: "business", entityId: businessId });
      await refreshCompleteness(businessId);
    }
    return removed;
  }
  const sb = getSupabaseAdmin()!;
  if (ref.socialId && !ref.socialId.startsWith("local-")) {
    const { data } = await sb.from("business_social_links").delete().eq("id", ref.socialId).eq("business_id", businessId).select("id");
    const ok = ((data ?? []) as unknown[]).length > 0;
    if (ok) {
      await audit("SOCIAL_DELETED", { entity: "business", entityId: businessId });
      await refreshCompleteness(businessId);
    }
    return ok;
  }
  if (ref.platform) {
    let q = sb.from("business_social_links").delete().eq("business_id", businessId).eq("platform", ref.platform);
    if (ref.url) q = q.eq("profile_url", ref.url);
    const { data } = await q.select("id");
    const ok = ((data ?? []) as unknown[]).length > 0;
    if (ok) {
      await audit("SOCIAL_DELETED", { entity: "business", entityId: businessId, result: ref.platform });
      await refreshCompleteness(businessId);
    }
    return ok;
  }
  return false;
}

const EDITABLE_FIELDS = [
  "name",
  "description",
  "primaryCategory",
  "website",
  "formattedAddress",
  "city",
  "district",
  "state",
  "country",
  "postalCode",
] as const;

export type EditableField = (typeof EDITABLE_FIELDS)[number];

const FIELD_TO_COLUMN: Record<EditableField, string> = {
  name: "name",
  description: "description",
  primaryCategory: "primary_category",
  website: "website",
  formattedAddress: "formatted_address",
  city: "city",
  district: "district",
  state: "state",
  country: "country",
  postalCode: "postal_code",
};

export async function updateBusiness(
  id: string,
  patch: Partial<Record<EditableField, string | null>>
): Promise<PersistedBusiness> {
  const keys = (Object.keys(patch) as EditableField[]).filter((k) => EDITABLE_FIELDS.includes(k));
  if (!keys.length) throw new Error("Nothing to update");
  const clean: Record<string, string | null> = {};
  for (const k of keys) {
    const v = patch[k];
    clean[k] = v == null ? null : String(v).trim().slice(0, 1000) || null;
  }
  if ("name" in clean && !clean.name) throw new Error("Business name cannot be empty");
  if (clean.website) {
    const norm = normalizeUrl(clean.website);
    if (!norm) throw new Error("Not a valid website URL");
    clean.website = norm;
  }

  if (!isSupabaseConfigured()) {
    const all = readJson<PersistedBusiness[]>(BIZ_FILE, []);
    const b = all.find((x) => x.id === id);
    if (!b) throw new Error("Business not found");
    for (const k of keys) {
      (b as unknown as Record<string, unknown>)[k] = clean[k];
    }
    if (keys.includes("website")) {
      b.website = clean.website;
    }
    b.updatedAt = new Date().toISOString();
    writeJson(BIZ_FILE, all);
    await audit("BUSINESS_UPDATED", { entity: "business", entityId: id, result: `fields: ${keys.join(", ")}` });
    const updated = await getBusiness(id);
    if (!updated) throw new Error("Business not found");
    return updated;
  }

  const sb = getSupabaseAdmin()!;
  const { data: exists } = await sb.from("businesses").select("id").eq("id", id).maybeSingle();
  if (!exists) throw new Error("Business not found");
  const row: Record<string, string | string[] | null> = { updated_at: new Date().toISOString() };
  for (const k of keys) {
    row[FIELD_TO_COLUMN[k]] = clean[k];
  }
  if (clean.website) {
    row.canonical_website = clean.website;
    row.website_domain = domainOf(clean.website);
  }
  if (clean.name) {
    row.normalized_name = normalizeName(clean.name);
    row.display_name = clean.name;
  }
  const { error } = await sb.from("businesses").update(row).eq("id", id);
  if (error) throw new Error(error.message);
  await audit("BUSINESS_UPDATED", { entity: "business", entityId: id, result: `fields: ${keys.join(", ")}` });
  await refreshCompleteness(id);
  const updated = await getBusiness(id);
  if (!updated) throw new Error("Business not found");
  return updated;
}

export async function saveJob(job: SearchJobRecord): Promise<void> {
  if (!isSupabaseConfigured()) {
    const jobs = readJson<SearchJobRecord[]>(JOBS_FILE, []);
    const i = jobs.findIndex((j) => j.id === job.id);
    if (i >= 0) jobs[i] = job;
    else jobs.unshift(job);
    writeJson(JOBS_FILE, jobs.slice(0, 200));
    return;
  }
  const sb = getSupabaseAdmin()!;
  await sb.from("search_jobs").upsert({
    id: job.id,
    keyword: job.keyword,
    location_text: job.locationText,
    category: job.category,
    latitude: job.latitude ?? null,
    longitude: job.longitude ?? null,
    radius_meters: job.radiusMeters ?? null,
    country: job.country ?? null,
    discovery_provider: job.discoveryProvider,
    primary_provider: job.primaryProvider,
    fallback_provider: job.fallbackProvider,
    requested_limit: job.requestedLimit,
    enrich_website: job.enrichWebsite ?? true,
    discover_social: job.discoverSocial ?? true,
    discover_contacts: job.discoverContacts ?? true,
    status: job.status,
    total_discovered: job.totalDiscovered,
    total_saved: job.totalSaved,
    total_duplicates: job.totalDuplicates,
    total_failed: job.totalFailed,
    fallback_used: job.fallbackUsed,
    fallback_reason: job.fallbackReason,
    provider_attempts: job.providerAttempts as object[],
    error_message: job.errorMessage,
  });
}

export async function listJobs(): Promise<SearchJobRecord[]> {
  if (!isSupabaseConfigured()) return readJson<SearchJobRecord[]>(JOBS_FILE, []);
  const sb = getSupabaseAdmin()!;
  const { data } = await sb.from("search_jobs").select("*").order("created_at", { ascending: false }).limit(100);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    keyword: r.keyword as string,
    locationText: r.location_text as string,
    category: (r.category as string) ?? "",
    latitude: (r.latitude as number) ?? undefined,
    longitude: (r.longitude as number) ?? undefined,
    radiusMeters: (r.radius_meters as number) ?? undefined,
    country: (r.country as string) ?? undefined,
    status: r.status as string,
    discoveryProvider: r.discovery_provider as string,
    primaryProvider: r.primary_provider as string,
    fallbackProvider: r.fallback_provider as string,
    requestedLimit: r.requested_limit as number,
    enrichWebsite: (r.enrich_website as boolean) ?? undefined,
    discoverSocial: (r.discover_social as boolean) ?? undefined,
    discoverContacts: (r.discover_contacts as boolean) ?? undefined,
    totalDiscovered: r.total_discovered as number,
    totalSaved: r.total_saved as number,
    totalDuplicates: r.total_duplicates as number,
    totalFailed: r.total_failed as number,
    fallbackUsed: r.fallback_used as boolean,
    fallbackReason: (r.fallback_reason as string) ?? undefined,
    providerAttempts: (r.provider_attempts as unknown[]) ?? [],
    errorMessage: (r.error_message as string) ?? undefined,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }));
}

export async function audit(action: string, meta: Record<string, unknown> = {}) {
  try {
    if (!isSupabaseConfigured()) {
      ensureDir();
      const f = path.join(DATA_DIR, "audit.json");
      const logs = readJson<unknown[]>(f, []);
      logs.unshift({ action, ...meta, at: new Date().toISOString() });
      writeJson(f, logs.slice(0, 500));
      return;
    }
    const sb = getSupabaseAdmin()!;
    await sb.from("audit_logs").insert({
      action,
      entity: (meta.entity as string) ?? null,
      entity_id: (meta.entityId as string) ?? null,
      provider: (meta.provider as string) ?? null,
      result: (meta.result as string) ?? null,
      error: (meta.error as string) ?? null,
      metadata: meta,
    });
  } catch {
    /* audit must never break the request */
  }
}
