import { normalizeUrl } from "@/lib/normalization/normalize";

const PATTERNS: { platform: string; match: RegExp; username?: RegExp }[] = [
  { platform: "facebook", match: /(^|\.)facebook\.com$/i, username: /facebook\.com\/([A-Za-z0-9._-]+)/i },
  { platform: "linkedin", match: /(^|\.)linkedin\.com$/i, username: /linkedin\.com\/(?:company|in|school)\/([A-Za-z0-9._-]+)/i },
  { platform: "instagram", match: /(^|\.)instagram\.com$/i, username: /instagram\.com\/([A-Za-z0-9._-]+)/i },
  { platform: "youtube", match: /(^|\.)(youtube\.com|youtu\.be)$/i, username: /(?:youtube\.com\/@|youtube\.com\/(?:c|channel|user)\/)([A-Za-z0-9._-]+)/i },
  { platform: "x", match: /(^|\.)(x\.com|twitter\.com)$/i, username: /(?:x\.com|twitter\.com)\/([A-Za-z0-9_]+)/i },
  { platform: "tiktok", match: /(^|\.)tiktok\.com$/i, username: /tiktok\.com\/@?([A-Za-z0-9._-]+)/i },
  { platform: "pinterest", match: /(^|\.)pinterest\.com$/i, username: /pinterest\.com\/([A-Za-z0-9._-]+)/i },
  { platform: "whatsapp", match: /(^|\.)(wa\.me|api\.whatsapp\.com|whatsapp\.com)$/i },
  { platform: "telegram", match: /(^|\.)t\.me$/i, username: /t\.me\/([A-Za-z0-9_]+)/i },
  { platform: "threads", match: /(^|\.)threads\.(com|net)$/i, username: /threads\.(?:com|net)\/@?([A-Za-z0-9._-]+)/i },
];

// Share/intent/plugin URLs are NOT company profiles — reject them so we only
// store genuine profile links (this was producing dozens of junk rows).
const SHARE_PATTERNS = [
  /facebook\.com\/(sharer|share\.php|dialog\/|plugins\/)/i,
  /linkedin\.com\/shareArticle/i,
  /(twitter\.com\/intent|x\.com\/intent)\//i,
  /pinterest\.com\/pin\/create\//i,
  /api\.whatsapp\.com\/send\?/i,
  /t\.me\/share\//i,
  /youtube\.com\/embed\//i,
];

export interface DetectedSocial {
  platform: string;
  profileUrl: string;
  username: string | null;
}

export function detectSocialPlatform(rawUrl: string): DetectedSocial | null {
  const normalized = normalizeUrl(rawUrl);
  if (!normalized) return null;
  if (SHARE_PATTERNS.some((re) => re.test(normalized))) return null;
  let clean = normalized;
  let host = "";
  try {
    const u = new URL(normalized);
    host = u.hostname.toLowerCase();
    // Profile identity never lives in the query string (?viewAsMember, ?fref…);
    // stripping it prevents duplicate rows for the same profile.
    u.search = "";
    clean = u.toString();
  } catch {
    return null;
  }
  for (const p of PATTERNS) {
    if (p.match.test(host)) {
      const m = p.username ? clean.match(p.username) : null;
      return { platform: p.platform, profileUrl: clean, username: m?.[1] ?? null };
    }
  }
  return null;
}

export function extractSocialLinks(hrefs: string[]): DetectedSocial[] {
  const seen = new Set<string>();
  const out: DetectedSocial[] = [];
  for (const h of hrefs) {
    const d = detectSocialPlatform(h);
    if (!d) continue;
    const key = `${d.platform}|${d.profileUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out;
}
