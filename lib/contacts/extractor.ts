import * as cheerio from "cheerio";
import { isPlausiblePhone, normalizeEmail, normalizePhone } from "@/lib/normalization/normalize";

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Single-line only: [ \t] instead of \s so matches can't glue across lines.
const PHONE_RE = /\+?\d[\d \t()./-]{5,}\d/g;

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
}

export function extractContactsFromHtml(html: string, pageUrl: string): ExtractedContact[] {
  const $ = cheerio.load(html);
  // Remove scripts/styles to reduce noise
  $("script, style, noscript").remove();
  const text = $("body").text().slice(0, 200000);
  const hrefs = $("a[href]")
    .map((_, el) => $(el).attr("href") ?? "")
    .get();

  const out: ExtractedContact[] = [];
  const seen = new Set<string>();

  const emails = new Set<string>();
  for (const m of text.matchAll(EMAIL_RE)) emails.add(m[0].toLowerCase());
  for (const h of hrefs) {
    if (h.toLowerCase().startsWith("mailto:")) {
      emails.add(h.slice(7).split("?")[0].toLowerCase());
    }
  }
  for (const e of emails) {
    if (e.endsWith(".png") || e.endsWith(".jpg") || e.includes("example.")) continue;
    const key = `email|${e}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      type: "email",
      value: e,
      normalized: normalizeEmail(e),
      category: categorizeEmail(e, pageUrl),
    });
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
  }
  for (const h of hrefs) {
    if (h.toLowerCase().startsWith("tel:")) {
      const v = h.slice(4).split("?")[0].trim();
      if (isPlausiblePhone(v)) phones.add(v);
    }
    if (h.includes("wa.me/")) {
      const digits = h.match(/wa\.me\/(\d+)/)?.[1];
      if (digits) {
        const key = `phone|+${digits}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push({ type: "phone", value: `+${digits}`, normalized: `+${digits}`, category: "whatsapp" });
        }
      }
    }
  }
  for (const p of phones) {
    const n = normalizePhone(p);
    if (!n) continue;
    const key = `phone|${n}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ type: "phone", value: p, normalized: n, category: "general" });
  }
  return out;
}
