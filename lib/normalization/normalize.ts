import { parsePhoneNumberWithError } from "libphonenumber-js";

export function normalizeName(name: string): string {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeUrl(raw?: string | null): string | null {
  if (!raw) return null;
  let s = raw.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    u.hash = "";
    // strip common tracking params
    const strip = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"];
    for (const p of strip) u.searchParams.delete(p);
    let out = u.toString();
    if (out.endsWith("/") && u.pathname === "/") out = u.origin;
    return out;
  } catch {
    return null;
  }
}

export function domainOf(url?: string | null): string | null {
  const n = normalizeUrl(url);
  if (!n) return null;
  try {
    return new URL(n).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function canonicalDomain(url?: string | null): string | null {
  return domainOf(url);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizePhone(raw: string, defaultCountry = "BD"): string | null {
  if (!isPlausiblePhone(raw)) return null;
  try {
    const p = parsePhoneNumberWithError(raw, defaultCountry as never);
    if (p && p.isValid()) return p.format("E.164");
  } catch {
    /* fall through */
  }
  const digits = raw.replace(/[^\d+]/g, "");
  const digitCount = digits.replace(/\D/g, "").length;
  if (digitCount < 7 || digitCount > 15) return null;
  return digits;
}

// Rejects regex-glued junk: multi-line matches, URL-encoded fragments,
// unbalanced parens, wrong digit counts. Used at every ingestion point.
export function isPlausiblePhone(raw: string): boolean {
  if (!raw || raw.length > 25) return false;
  if (/[\r\n%<>=;]/.test(raw)) return false;
  const open = (raw.match(/\(/g) ?? []).length;
  const close = (raw.match(/\)/g) ?? []).length;
  if (open !== close) return false;
  if (!/^\+?[\d\s()./-]+$/.test(raw.trim())) return false;
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15;
}

export function normalizeAddress(parts: (string | null | undefined)[]): string | null {
  const s = parts
    .map((p) => (p ?? "").normalize("NFKC").trim())
    .filter(Boolean)
    .join(", ");
  return s || null;
}

export function completenessScore(b: {
  name?: string | null;
  primaryCategory?: string | null;
  phones?: string[];
  emails?: string[];
  website?: string | null;
  formattedAddress?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  description?: string | null;
  socialLinks?: { platform: string; url: string }[];
}): number {
  let score = 0;
  if (b.name) score += 15;
  if (b.primaryCategory) score += 10;
  if (b.phones?.length) score += 12;
  if (b.emails?.length) score += 12;
  if (b.website) score += 12;
  if (b.formattedAddress) score += 10;
  if (b.latitude && b.longitude) score += 10;
  if (b.description) score += 7;
  if (b.socialLinks?.length) score += 12;
  return Math.min(100, score);
}
