import { canonicalDomain, normalizeName, normalizePhone } from "@/lib/normalization/normalize";
import type { NormalizedBusiness } from "@/lib/providers/types";

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return 1;
  const tokensA = new Set(na.split(" "));
  const tokensB = new Set(nb.split(" "));
  let inter = 0;
  for (const t of tokensA) if (tokensB.has(t)) inter++;
  const union = tokensA.size + tokensB.size - inter;
  return union === 0 ? 0 : inter / union;
}

// Deterministic duplicate key: placeId > domain > phone > name+address > name+coords
export function duplicateKey(b: NormalizedBusiness): string {
  if (b.placeId) return `place:${b.placeId.toLowerCase()}`;
  const d = canonicalDomain(b.website);
  if (d && b.name) return `domain:${d}|${normalizeName(b.name)}`;
  const phone = b.phones?.[0] ? normalizePhone(b.phones[0]) : null;
  if (phone && b.name) return `phone:${phone}|${normalizeName(b.name)}`;
  if (b.name && b.formattedAddress)
    return `addr:${normalizeName(b.name)}|${normalizeName(b.formattedAddress)}`;
  if (b.name && b.latitude && b.longitude)
    return `geo:${normalizeName(b.name)}|${b.latitude.toFixed(3)},${b.longitude.toFixed(3)}`;
  return `name:${normalizeName(b.name)}`;
}

export function isDuplicate(a: NormalizedBusiness, b: NormalizedBusiness): boolean {
  if (a.placeId && b.placeId && a.placeId.toLowerCase() === b.placeId.toLowerCase())
    return true;
  const da = canonicalDomain(a.website);
  const db = canonicalDomain(b.website);
  if (da && db && da === db) {
    if (nameSimilarity(a.name, b.name) > 0.4) return true;
  }
  const pa = a.phones?.[0] ? normalizePhone(a.phones[0]) : null;
  const pb = b.phones?.[0] ? normalizePhone(b.phones[0]) : null;
  if (pa && pb && pa === pb) return true;
  if (
    a.formattedAddress &&
    b.formattedAddress &&
    normalizeName(a.formattedAddress) === normalizeName(b.formattedAddress) &&
    nameSimilarity(a.name, b.name) > 0.5
  )
    return true;
  if (
    a.latitude && a.longitude && b.latitude && b.longitude &&
    nameSimilarity(a.name, b.name) > 0.6 &&
    haversineKm(a.latitude, a.longitude, b.latitude, b.longitude) < 1
  )
    return true;
  return false;
}

// Merge: never overwrite useful data with null. Track all providers.
export function mergeBusinesses(existing: NormalizedBusiness, incoming: NormalizedBusiness): NormalizedBusiness {
  const pick = <T>(oldV: T | null | undefined, newV: T | null | undefined): T | null | undefined =>
    newV ?? oldV;
  const union = (a: string[] = [], b: string[] = []) =>
    Array.from(new Set([...(a ?? []), ...(b ?? [])])).filter(Boolean);
  const providers = Array.from(
    new Set(
      [
        ...(existing as unknown as { providers?: string[] }).providers ?? [existing.sourceProvider],
        incoming.sourceProvider,
      ].filter(Boolean)
    )
  );
  const merged: NormalizedBusiness = {
    ...existing,
    officialName: pick(existing.officialName, incoming.officialName),
    description: existing.description ?? incoming.description ?? null,
    primaryCategory: existing.primaryCategory ?? incoming.primaryCategory ?? null,
    secondaryCategories: union(existing.secondaryCategories, incoming.secondaryCategories),
    businessTypes: union(existing.businessTypes, incoming.businessTypes),
    industry: pick(existing.industry, incoming.industry),
    businessStatus: pick(existing.businessStatus, incoming.businessStatus),
    website: existing.website ?? incoming.website ?? null,
    phones: union(existing.phones, incoming.phones),
    emails: union(existing.emails, incoming.emails),
    formattedAddress: existing.formattedAddress ?? incoming.formattedAddress ?? null,
    city: pick(existing.city, incoming.city),
    district: pick(existing.district, incoming.district),
    state: pick(existing.state, incoming.state),
    country: pick(existing.country, incoming.country),
    countryCode: pick(existing.countryCode, incoming.countryCode),
    postalCode: pick(existing.postalCode, incoming.postalCode),
    latitude: existing.latitude ?? incoming.latitude ?? null,
    longitude: existing.longitude ?? incoming.longitude ?? null,
    mapsUrl: existing.mapsUrl ?? incoming.mapsUrl ?? null,
    placeId: existing.placeId ?? incoming.placeId ?? null,
    openingHours: union(existing.openingHours, incoming.openingHours),
    socialLinks: union(
      (existing.socialLinks ?? []).map((s) => `${s.platform}|${s.url}`),
      (incoming.socialLinks ?? []).map((s) => `${s.platform}|${s.url}`)
    ).map((s) => {
      const [platform, ...rest] = s.split("|");
      return { platform, url: rest.join("|") };
    }),
  };
  (merged as unknown as { providers: string[] }).providers = providers;
  return merged;
}
