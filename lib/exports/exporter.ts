import type { PersistedBusiness } from "@/lib/store";

export const EXPORT_COLUMNS = [
  "Business Name",
  "Category",
  "Subcategories",
  "Description",
  "Phone",
  "Additional Phones",
  "Email",
  "Additional Emails",
  "Website",
  "About URL",
  "Contact URL",
  "Facebook",
  "LinkedIn",
  "Instagram",
  "YouTube",
  "X",
  "TikTok",
  "WhatsApp",
  "Telegram",
  "Address",
  "City",
  "District",
  "State",
  "Country",
  "Postal Code",
  "Latitude",
  "Longitude",
  "Maps URL",
  "Place ID",
  "Opening Hours",
  "Business Status",
  "Rating",
  "Reviews Count",
  "Provider",
  "Source URL",
  "Completeness",
  "Last Verified",
] as const;

function socialOf(b: PersistedBusiness, platform: string): string {
  const links = (b as unknown as { socialLinks?: { platform: string; url: string }[] }).socialLinks ?? [];
  return links.find((s) => s.platform === platform)?.url ?? "";
}

export function businessToRow(b: PersistedBusiness): Record<string, string | number> {
  const phones = b.phones ?? [];
  const emails = b.emails ?? [];
  return {
    "Business Name": b.name ?? "",
    Category: b.primaryCategory ?? "",
    Subcategories: (b.secondaryCategories ?? []).join("; "),
    Description: b.description ?? "",
    Phone: phones[0] ?? "",
    "Additional Phones": phones.slice(1).join("; "),
    Email: emails[0] ?? "",
    "Additional Emails": emails.slice(1).join("; "),
    Website: b.website ?? "",
    "About URL": "",
    "Contact URL": "",
    Facebook: socialOf(b, "facebook"),
    LinkedIn: socialOf(b, "linkedin"),
    Instagram: socialOf(b, "instagram"),
    YouTube: socialOf(b, "youtube"),
    X: socialOf(b, "x"),
    TikTok: socialOf(b, "tiktok"),
    WhatsApp: socialOf(b, "whatsapp"),
    Telegram: socialOf(b, "telegram"),
    Address: b.formattedAddress ?? "",
    City: b.city ?? "",
    District: b.district ?? "",
    State: (b as unknown as { state?: string }).state ?? "",
    Country: b.country ?? "",
    "Postal Code": (b as unknown as { postalCode?: string }).postalCode ?? "",
    Latitude: b.latitude ?? "",
    Longitude: b.longitude ?? "",
    "Maps URL": b.mapsUrl ?? "",
    "Place ID": b.placeId ?? "",
    "Opening Hours": (b.openingHours ?? []).join(" | "),
    "Business Status": (b as unknown as { businessStatus?: string }).businessStatus ?? "",
    Rating: (b as unknown as { rating?: number }).rating ?? "",
    "Reviews Count": (b as unknown as { reviewsCount?: number }).reviewsCount ?? "",
    Provider: (b.providers ?? [b.sourceProvider]).join("+"),
    "Source URL": b.sourceUrl ?? "",
    Completeness: b.completenessScore ?? 0,
    "Last Verified": b.updatedAt ?? "",
  };
}

export function toCsv(rows: Record<string, string | number>[], columns: string[]): string {
  const cols = columns.length ? columns : [...EXPORT_COLUMNS];
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c] ?? "")).join(","))].join("\n");
}

export async function toXlsx(rows: Record<string, string | number>[], columns: string[]): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Businesses");
  const cols = columns.length ? columns : [...EXPORT_COLUMNS];
  ws.columns = cols.map((c) => ({ header: c, key: c, width: 22 }));
  for (const r of rows) ws.addRow(r);
  ws.getRow(1).font = { bold: true };
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}
