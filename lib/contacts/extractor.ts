import * as cheerio from "cheerio";
import { isPlausiblePhone, normalizeEmail, normalizePhone } from "@/lib/normalization/normalize";
import { detectSocialPlatform } from "@/lib/social/detector";

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,24}/gi;
// Single-line only: [ \t] instead of \s so matches can't glue across lines.
const PHONE_RE = /\+?\d[\d \t()./-]{5,}\d/g;
// Markdown links from remote-reader fallbacks: [text](https://url)
const MD_LINK_RE = /\[([^\]]{0,120})\]\((https?:\/\/[^)\s]+)\)/g;

const CATEGORY_HINTS: { category: string; hints: RegExp }[] = [
  { category: "sales", hints: /sales|business|commercial/i },
  { category: "support", hints: /support|help|service|care/i },
  { category: "hr", hints: /\bhr\b|human.?resources/i },
  { category: "careers", hints: /career|job|hiring|recruit/i },
  { category: "info", hints: /info|contact|hello|general/i },
  { category: "marketing", hints: /marketing|press|media|pr@/i },
];

function categorizeEmail(email: string, context: string): string {
  const local = email.split("@")[0].toLowerCase();
  const ctx = `${local} ${context}`.toLowerCase();
  for (const h of CATEGORY_HINTS) {
    if (h.hints.test(ctx) || h.hints.test(local)) return h.category;
  }
  return "general";
}

export interface ExtractedContact {
  type: "email" | "phone";
  value: string;
  normalized: string | null;
  category: string;
  origin?: "text" | "mailto" | "tel" | "jsonld" | "meta" | "obfuscated" | "cfemail";
}

export interface ExtractedSocial {
  platform: string;
  url: string;
}

const FAKE_LOCALS = new Set([
  "example", "test", "testing", "sample", "yourname", "your-name", "your_email",
  "name", "email", "mail", "user", "username", "firstname", "lastname",
  "noreply", "no-reply", "donotreply", "do-not-reply", "mailer-daemon",
  "sentry", "wordpress", "wix", "godaddy", "domain",
]);

const BAD_EXTENSIONS = /\.(png|jpe?g|gif|svg|webp|ico|css|js|woff2?|ttf|eot|mp4|pdf|zip)(\?|$)/i;

export function isRealEmail(raw: string): boolean {
  const e = raw.trim().toLowerCase();
  if (e.length > 254 || !e.includes("@")) return false;
  const [local, ...rest] = e.split("@");
  const domain = rest.join("@");
  if (!local || !domain || local.length > 64) return false;
  if (FAKE_LOCALS.has(local)) return false;
  if (local.includes("..") || domain.includes("..")) return false;
  if (BAD_EXTENSIONS.test(e)) return false;
  if (e.includes("example.")) return false;
  if (!/^[a-z0-9._%+-]+$/.test(local)) return false;
  const labels = domain.split(".");
  if (labels.length < 2) return false;
  const tld = labels[labels.length - 1];
  if (!/^[a-z]{2,24}$/.test(tld)) return false;
  if (labels.some((l) => !l || l.length > 63 || !/^[a-z0-9-]+$/.test(l))) return false;
  return true;
}

// Cloudflare email protection: <span data-cfemail="..."> / .__cf_email__
export function decodeCfEmails(html: string): string {
  return html.replace(/data-cfemail="([0-9a-fA-F]+)"/g, (_m, hex: string) => {
    try {
      const bytes: number[] = [];
      for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));
      if (bytes.length < 2) return _m;
      const key = bytes[0];
      const decoded = bytes.slice(1).map((b) => String.fromCharCode(b ^ key)).join("");
      return `data-cfemail-decoded="${decoded}" data-email="${decoded}"`;
    } catch {
      return _m;
    }
  });
}

// Common human obfuscation: info [at] company [dot] com, sales(at)co(dot)org…
// Bracket forms are unambiguous; bare "at"/"dot" only convert inside an
// email-shaped neighborhood so normal prose ("look at this") is untouched.
export function deobfuscateText(text: string): string {
  return text
    .replace(/\s*[\[({]\s*at\s*[\])}]\s*/gi, "@")
    .replace(/\s*[\[({]\s*dot\s*[\])}]\s*/gi, ".")
    .replace(/(\w[\w.+-]{0,40})\s+at\s+(?=[\w-]{1,40}\.[\w.-]*[a-z]{2,})/gi, "$1@")
    .replace(/(@[\w.-]{1,40})\s+dot\s+(?=[\w-]{1,40}(?:\.[\w.-]*[a-z]{2,})?)/gi, "$1.");
}

interface JsonLdFindings {
  emails: string[];
  phones: string[];
  socials: string[];
  websites: string[];
}

const ORG_TYPES = new Set([
  "organization", "localbusiness", "corporation", "company", "business",
  "store", "restaurant", "hotel", "professionalservice", "medicalclinic",
  "dentist", "realestateagent", "travelagency", "person",
]);

function walkJsonLd(node: unknown, out: JsonLdFindings, depth = 0): void {
  if (depth > 6 || node == null) return;
  if (Array.isArray(node)) {
    for (const v of node) walkJsonLd(v, out, depth + 1);
    return;
  }
  if (typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  const types = (Array.isArray(obj["@type"]) ? obj["@type"] : [obj["@type"]])
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.toLowerCase().replace(/^https?:\/\/schema\.org\//, ""));
  const isOrg = types.length === 0 || types.some((t) => ORG_TYPES.has(t) || t.endsWith("business"));
  const pushEmail = (v: unknown) => {
    if (typeof v === "string" && v.includes("@")) out.emails.push(v.trim());
  };
  const pushPhone = (v: unknown) => {
    if (typeof v === "string" && v.trim()) out.phones.push(v.trim());
  };
  if (isOrg) {
    pushEmail(obj.email);
    pushPhone(obj.telephone);
    if (typeof obj.url === "string" && obj.url.startsWith("http")) out.websites.push(obj.url);
    const sameAs = obj.sameAs;
    if (typeof sameAs === "string") out.socials.push(sameAs);
    else if (Array.isArray(sameAs)) for (const s of sameAs) if (typeof s === "string") out.socials.push(s);
    const cp = obj.contactPoint;
    const cps = Array.isArray(cp) ? cp : [cp];
    for (const c of cps) {
      if (c && typeof c === "object") {
        pushEmail((c as Record<string, unknown>).email);
        pushPhone((c as Record<string, unknown>).telephone);
      }
    }
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") walkJsonLd(v, out, depth + 1);
  }
}

export function extractJsonLd(html: string): JsonLdFindings {
  const out: JsonLdFindings = { emails: [], phones: [], socials: [], websites: [] };
  const $ = cheerio.load(html);
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw || raw.length > 200000) return;
    try {
      walkJsonLd(JSON.parse(raw), out);
    } catch {
      /* malformed JSON-LD — skip */
    }
  });
  return out;
}

export function extractJsonLdSocials(html: string): string[] {
  try {
    return Array.from(new Set(extractJsonLd(html).socials)).slice(0, 30);
  } catch {
    return [];
  }
}

// Cloudflare-protected addresses live in data-cfemail attributes and
// /cdn-cgi/l/email-protection#hex links — decode and collect them.
export function extractCfEmails($: cheerio.CheerioAPI, pageUrl: string): ExtractedContact[] {
  const out: ExtractedContact[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const v = raw.trim().toLowerCase().replace(/^mailto:/, "");
    if (!isRealEmail(v) || seen.has(v)) return;
    seen.add(v);
    out.push({ type: "email", value: v, normalized: normalizeEmail(v), category: categorizeEmail(v, pageUrl), origin: "cfemail" });
  };
  $("[data-email]").each((_, el) => push($(el).attr("data-email") ?? ""));
  $("[data-cfemail-decoded]").each((_, el) => push($(el).attr("data-cfemail-decoded") ?? ""));
  $("a[href]").each((_, el) => {
    const h = $(el).attr("href") ?? "";
    const m = h.match(/email-protection#([0-9a-fA-F]+)/);
    if (!m) return;
    try {
      const bytes: number[] = [];
      for (let i = 0; i < m[1].length; i += 2) bytes.push(parseInt(m[1].slice(i, i + 2), 16));
      if (bytes.length < 2) return;
      const key = bytes[0];
      push(bytes.slice(1).map((b) => String.fromCharCode(b ^ key)).join(""));
    } catch {
      /* ignore */
    }
  });
  return out;
}

export function extractContactsFromHtml(html: string, pageUrl: string): ExtractedContact[] {
  const decoded = decodeCfEmails(html);
  const $ = cheerio.load(decoded);
  // Remove scripts/styles to reduce noise (JSON-LD handled separately)
  $('script:not([type="application/ld+json"]), style, noscript').remove();
  const bodyText = $("body").text().slice(0, 200000);
  const text = deobfuscateText(bodyText);
  const hrefs = $("a[href]")
    .map((_, el) => $(el).attr("href") ?? "")
    .get();

  const out: ExtractedContact[] = [];
  const seen = new Set<string>();
  const push = (c: ExtractedContact) => {
    const key = `${c.type}|${(c.normalized ?? c.value).toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(c);
  };

  // 1) mailto: links (highest trust)
  for (const h of hrefs) {
    if (h.toLowerCase().startsWith("mailto:")) {
      const e = h.slice(7).split("?")[0].trim().toLowerCase();
      if (isRealEmail(e)) {
        push({ type: "email", value: e, normalized: normalizeEmail(e), category: categorizeEmail(e, pageUrl), origin: "mailto" });
      }
    }
  }

  // 2) Cloudflare-protected addresses (decoded attributes + protection links)
  for (const c of extractCfEmails($, pageUrl)) push(c);

  // 3) JSON-LD structured data
  try {
    const ld = extractJsonLd(decoded);
    for (const e of ld.emails) {
      const v = e.toLowerCase().trim();
      if (isRealEmail(v)) push({ type: "email", value: v, normalized: normalizeEmail(v), category: categorizeEmail(v, pageUrl), origin: "jsonld" });
    }
    for (const p of ld.phones) {
      if (isPlausiblePhone(p)) {
        const n = normalizePhone(p);
        if (n) push({ type: "phone", value: p, normalized: n, category: "general", origin: "jsonld" });
      }
    }
  } catch {
    /* ignore */
  }

  // 3) meta tags
  for (const sel of ['meta[name="email"]', 'meta[name="contact"]', 'meta[property="business:contact_data:email"]']) {
    const v = ($(sel).attr("content") ?? "").trim().toLowerCase();
    if (v && isRealEmail(v)) {
      push({ type: "email", value: v, normalized: normalizeEmail(v), category: categorizeEmail(v, pageUrl), origin: "meta" });
    }
  }
  for (const sel of ['meta[name="telephone"]', 'meta[property="business:contact_data:phone_number"]']) {
    const v = ($(sel).attr("content") ?? "").trim();
    if (v && isPlausiblePhone(v)) {
      const n = normalizePhone(v);
      if (n) push({ type: "phone", value: v, normalized: n, category: "general", origin: "meta" });
    }
  }

  // 4) visible + deobfuscated text
  const emailSet = new Set<string>();
  for (const m of text.matchAll(EMAIL_RE)) emailSet.add(m[0].toLowerCase());
  for (const e of emailSet) {
    if (!isRealEmail(e)) continue;
    push({ type: "email", value: e, normalized: normalizeEmail(e), category: categorizeEmail(e, pageUrl), origin: text !== bodyText ? "obfuscated" : "text" });
    if (out.length > 120) break;
  }

  // Match per text line — never across line breaks (prevents glued junk).
  const phones = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const clean = line.replace(/\s+/g, " ");
    if (clean.length > 300) continue;
    for (const m of clean.matchAll(PHONE_RE)) {
      const v = m[0].trim();
      if (isPlausiblePhone(v)) phones.add(v);
    }
    if (phones.size > 60) break;
  }
  for (const h of hrefs) {
    const low = h.toLowerCase();
    if (low.startsWith("tel:") || low.startsWith("callto:")) {
      const v = h.slice(h.indexOf(":") + 1).split("?")[0].trim();
      if (isPlausiblePhone(v)) phones.add(v);
    }
    if (h.includes("wa.me/")) {
      const digits = h.match(/wa\.me\/(\d+)/)?.[1];
      if (digits) {
        push({ type: "phone", value: `+${digits}`, normalized: `+${digits}`, category: "whatsapp", origin: "text" });
      }
    }
  }
  for (const p of phones) {
    const n = normalizePhone(p);
    if (!n) continue;
    push({ type: "phone", value: p, normalized: n, category: "general", origin: "text" });
    if (out.length > 160) break;
  }
  return out;
}

// Social links from any href list (footer icons, rel=me, JSON-LD sameAs).
export function extractSocials(hrefs: string[]): ExtractedSocial[] {
  const seen = new Set<string>();
  const out: ExtractedSocial[] = [];
  for (const h of hrefs) {
    const d = detectSocialPlatform(h);
    if (!d) continue;
    const key = `${d.platform}|${d.profileUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ platform: d.platform, url: d.profileUrl });
  }
  return out;
}

export function absoluteHrefs($: cheerio.CheerioAPI, baseUrl: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  $("a[href]").each((_, el) => {
    try {
      const abs = new URL($(el).attr("href") ?? "", baseUrl).toString();
      if (!seen.has(abs)) {
        seen.add(abs);
        out.push(abs);
      }
    } catch {
      /* ignore */
    }
  });
  return out;
}

export function relMeHrefs($: cheerio.CheerioAPI, baseUrl: string): string[] {
  const out: string[] = [];
  $('a[rel~="me"][href]').each((_, el) => {
    try {
      out.push(new URL($(el).attr("href") ?? "", baseUrl).toString());
    } catch {
      /* ignore */
    }
  });
  return out;
}

// Markdown from remote-reader fallbacks: extract text contacts + link URLs.
export function extractFromMarkdown(md: string, pageUrl: string): { contacts: ExtractedContact[]; hrefs: string[] } {
  const hrefs: string[] = [];
  for (const m of md.matchAll(MD_LINK_RE)) {
    if (m[2]) hrefs.push(m[2]);
  }
  const textOnly = md.replace(MD_LINK_RE, " $1 ").slice(0, 200000);
  const clean = deobfuscateText(textOnly);
  const contacts: ExtractedContact[] = [];
  const seen = new Set<string>();
  for (const m of clean.matchAll(EMAIL_RE)) {
    const e = m[0].toLowerCase();
    if (!isRealEmail(e) || seen.has(`e|${e}`)) continue;
    seen.add(`e|${e}`);
    contacts.push({ type: "email", value: e, normalized: normalizeEmail(e), category: categorizeEmail(e, pageUrl), origin: "text" });
    if (contacts.length > 80) break;
  }
  for (const line of clean.split(/\r?\n/)) {
    const s = line.replace(/\s+/g, " ");
    if (s.length > 300) continue;
    for (const m of s.matchAll(PHONE_RE)) {
      const v = m[0].trim();
      if (!isPlausiblePhone(v)) continue;
      const n = normalizePhone(v);
      if (!n || seen.has(`p|${n}`)) continue;
      seen.add(`p|${n}`);
      contacts.push({ type: "phone", value: v, normalized: n, category: "general", origin: "text" });
      if (contacts.length > 120) break;
    }
  }
  return { contacts, hrefs };
}
