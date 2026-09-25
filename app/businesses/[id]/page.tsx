"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Check,
  Copy,
  ExternalLink,
  Globe,
  Link2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Share2,
  Star,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import {
  Badge,
  Button,
  Completeness,
  ConfirmButton,
  CopyButton,
  EmptyState,
  Input,
  NotFound,
  ProviderBadge,
  Section,
  Select,
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

function ContactRow({
  icon,
  display,
  contact,
  onCopy,
  onPrimary,
  onDelete,
}: {
  icon: React.ReactNode;
  display: React.ReactNode;
  contact: { isPrimary: boolean; category?: string | null; source?: string | null };
  onCopy: () => void;
  onPrimary: () => void;
  onDelete: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 px-2 py-1.5">
      {icon}
      <span className="min-w-0 flex-1 truncate">{display}</span>
      {contact.isPrimary ? (
        <span title="Primary — shown first in exports" className="flex shrink-0 items-center gap-0.5 rounded-full bg-amber-100 dark:bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
          <Star className="h-3 w-3 fill-amber-500 text-amber-500" /> Main
        </span>
      ) : null}
      {contact.category && contact.category !== "general" ? (
        <span className="hidden shrink-0 rounded-full bg-slate-200/70 dark:bg-slate-700 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-300 sm:inline">
          {contact.category}
        </span>
      ) : null}
      {contact.source === "manual" ? (
        <span title="Added manually by you" className="hidden shrink-0 rounded-full bg-teal-100 dark:bg-teal-500/15 px-1.5 py-0.5 text-[10px] font-medium text-teal-700 dark:text-teal-300 sm:inline">
          manual
        </span>
      ) : null}
      <button
        title="Copy"
        onClick={() => {
          onCopy();
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      {!contact.isPrimary ? (
        <button
          title="Set as primary"
          onClick={onPrimary}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-amber-100 hover:text-amber-600 dark:hover:bg-amber-500/10"
        >
          <Star className="h-3.5 w-3.5" />
        </button>
      ) : null}
      <button
        title="Delete"
        onClick={onDelete}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-500/10"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default function BusinessDetailPage() {  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [b, setB] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [enrich, setEnrich] = useState<EnrichData | null>(null);
  const [enrichLines, setEnrichLines] = useState<StreamLine[]>([]);
  const [enrichStartedAt, setEnrichStartedAt] = useState<number | null>(null);

  interface ContactRec {
    id: string;
    type: "phone" | "email";
    value: string;
    category?: string | null;
    isPrimary: boolean;
    source?: string | null;
  }
  const [contacts, setContacts] = useState<ContactRec[]>([]);
  const [newContact, setNewContact] = useState({ type: "phone", value: "", category: "general" });
  const [contactError, setContactError] = useState<string | null>(null);
  const [contactBusy, setContactBusy] = useState(false);

  const [newSocial, setNewSocial] = useState({ platform: "facebook", url: "" });
  const [socialError, setSocialError] = useState<string | null>(null);
  const [socialBusy, setSocialBusy] = useState(false);

  const [editingOverview, setEditingOverview] = useState(false);
  const [overviewForm, setOverviewForm] = useState<Record<string, string>>({});
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [overviewSaving, setOverviewSaving] = useState(false);

  function load() {
    setLoading(true);
    fetch(`/api/businesses/${id}`)
      .then((r) => r.json())
      .then((d) => setB(d.business))
      .catch(() => undefined)
      .finally(() => setLoading(false));
    fetch(`/api/businesses/${id}/contacts`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.contacts) setContacts(d.contacts);
      })
      .catch(() => undefined);
  }

  useEffect(load, [id]);

  async function refreshAll() {
    await load();
  }

  async function addContact() {
    setContactError(null);
    if (!newContact.value.trim()) {
      setContactError("Enter a value first.");
      return;
    }
    setContactBusy(true);
    try {
      const res = await fetch(`/api/businesses/${id}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: newContact.type, value: newContact.value.trim(), category: newContact.category || undefined }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setContactError(data?.error ?? "Could not save.");
        return;
      }
      setNewContact((f) => ({ ...f, value: "" }));
      await refreshAll();
    } finally {
      setContactBusy(false);
    }
  }

  async function removeContact(c: ContactRec) {
    await fetch(`/api/businesses/${id}/contacts`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        c.id.startsWith("local-") ? { type: c.type, value: c.value } : { contactId: c.id }
      ),
    });
    await refreshAll();
  }

  async function makePrimary(c: ContactRec) {
    await fetch(`/api/businesses/${id}/contacts`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        c.id.startsWith("local-") ? { type: c.type, value: c.value } : { contactId: c.id }
      ),
    });
    await refreshAll();
  }

  async function addSocial() {
    setSocialError(null);
    if (!newSocial.url.trim()) {
      setSocialError("Enter a profile URL first.");
      return;
    }
    setSocialBusy(true);
    try {
      const res = await fetch(`/api/businesses/${id}/socials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: newSocial.platform, url: newSocial.url.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setSocialError(data?.error ?? "Could not save.");
        return;
      }
      setNewSocial((f) => ({ ...f, url: "" }));
      await refreshAll();
    } finally {
      setSocialBusy(false);
    }
  }

  async function removeSocial(platform: string, url: string) {
    await fetch(`/api/businesses/${id}/socials`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform, url }),
    });
    await refreshAll();
  }

  function startOverviewEdit() {
    setOverviewForm({
      name: str("name"),
      primaryCategory: str("primaryCategory"),
      description: str("description"),
      website: str("website"),
      formattedAddress: str("formattedAddress"),
      city: str("city"),
      district: str("district") || (b as Record<string, unknown>)?.district as string || "",
      state: (b as Record<string, unknown>)?.state as string || "",
      country: str("country"),
      postalCode: (b as Record<string, unknown>)?.postalCode as string || "",
    });
    setOverviewError(null);
    setEditingOverview(true);
  }

  async function saveOverview() {
    setOverviewError(null);
    if (!overviewForm.name?.trim()) {
      setOverviewError("Business name cannot be empty.");
      return;
    }
    setOverviewSaving(true);
    try {
      const res = await fetch(`/api/businesses/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(overviewForm),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setOverviewError(data?.error ?? "Could not save.");
        return;
      }
      setEditingOverview(false);
      await refreshAll();
    } finally {
      setOverviewSaving(false);
    }
  }

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
  // Prefer full contact records (ids, primary, category); fall back to the
  // business arrays so rows render instantly on first paint.
  const allContacts: ContactRec[] = contacts.length
    ? contacts
    : [
        ...phones.map((p, i) => ({ id: `local-phone-${i}`, type: "phone" as const, value: p, isPrimary: i === 0 })),
        ...emails.map((e, i) => ({ id: `local-email-${i}`, type: "email" as const, value: e, isPrimary: i === 0 })),
      ];
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
              <Button
                variant="secondary"
                onClick={() => (editingOverview ? setEditingOverview(false) : startOverviewEdit())}
                className="px-3 py-2 text-xs sm:px-4 sm:text-sm"
              >
                <Pencil className="h-4 w-4" /> {editingOverview ? "Cancel edit" : "Edit details"}
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

      {/* Overview edit form */}
      {editingOverview ? (
        <Section title="Edit business details" subtitle="Changes save to the database immediately">
          <div className="grid gap-2.5 sm:grid-cols-2">
            {(
              [
                ["name", "Business name *"],
                ["primaryCategory", "Category"],
                ["website", "Website"],
                ["formattedAddress", "Address"],
                ["city", "City"],
                ["district", "District"],
                ["state", "State"],
                ["country", "Country"],
                ["postalCode", "Postal code"],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="flex min-w-0 flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</span>
                <Input value={overviewForm[k] ?? ""} onChange={(e) => setOverviewForm((f) => ({ ...f, [k]: e.target.value }))} />
              </label>
            ))}
            <label className="flex min-w-0 flex-col gap-1 sm:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Description</span>
              <textarea
                value={overviewForm.description ?? ""}
                onChange={(e) => setOverviewForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
          </div>
          {overviewError ? <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{overviewError}</p> : null}
          <div className="mt-3 flex gap-2">
            <Button onClick={saveOverview} loading={overviewSaving} className="px-6">
              <Check className="h-4 w-4" /> Save changes
            </Button>
            <Button variant="secondary" onClick={() => setEditingOverview(false)}>Cancel</Button>
          </div>
        </Section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Contact — every phone & email, editable */}
        <Section
          title="Contact"
          subtitle={`${allContacts.length} records — star sets the primary shown in exports`}
          action={
            <span className="rounded-full bg-teal-50 dark:bg-teal-500/10 px-2.5 py-0.5 text-xs font-medium text-teal-700 dark:text-teal-300">
              {phones.length} phone · {emails.length} email
            </span>
          }
        >
          <div className="flex flex-col gap-2 text-sm">
            {allContacts.filter((c) => c.type === "phone").map((c) => (
              <ContactRow
                key={c.id}
                icon={<Phone className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />}
                display={<a href={`tel:${c.value}`} className="min-w-0 flex-1 truncate font-medium">{c.value}</a>}
                contact={c}
                onCopy={() => navigator.clipboard.writeText(c.value).catch(() => undefined)}
                onPrimary={() => makePrimary(c)}
                onDelete={() => removeContact(c)}
              />
            ))}
            {!contacts.some((c) => c.type === "phone") ? <div><NotFound what="Phone" /></div> : null}
            {allContacts.filter((c) => c.type === "email").map((c) => (
              <ContactRow
                key={c.id}
                icon={<Mail className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />}
                display={<a href={`mailto:${c.value}`} className="min-w-0 flex-1 truncate font-medium">{c.value}</a>}
                contact={c}
                onCopy={() => navigator.clipboard.writeText(c.value).catch(() => undefined)}
                onPrimary={() => makePrimary(c)}
                onDelete={() => removeContact(c)}
              />
            ))}
            {!contacts.some((c) => c.type === "email") ? <div><NotFound what="Email" /></div> : null}
            {!allContacts.length ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">Add one manually below, or run <span className="font-medium">Re-enrich website</span> to crawl the official site.</p>
            ) : null}
            <div className="mt-1 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Add manually</p>
              <div className="grid gap-2 sm:grid-cols-[110px_1fr]">
                <Select value={newContact.type} onChange={(e) => setNewContact((f) => ({ ...f, type: e.target.value }))} className="py-2">
                  <option value="phone">Phone</option>
                  <option value="email">Email</option>
                </Select>
                <Input
                  value={newContact.value}
                  onChange={(e) => setNewContact((f) => ({ ...f, value: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && addContact()}
                  placeholder={newContact.type === "phone" ? "+880…" : "name@company.com"}
                  className="py-2"
                />
              </div>
              {newContact.type === "email" ? (
                <div className="mt-2">
                  <Select value={newContact.category} onChange={(e) => setNewContact((f) => ({ ...f, category: e.target.value }))} className="py-2">
                    {["general", "sales", "support", "info", "hr", "careers", "marketing"].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </Select>
                </div>
              ) : null}
              {contactError ? <p className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">{contactError}</p> : null}
              <Button onClick={addContact} loading={contactBusy} className="mt-2 w-full py-2 text-sm">
                <Plus className="h-4 w-4" /> Add {newContact.type}
              </Button>
            </div>
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

        {/* Social — every profile, editable */}
        <Section title="Social media" subtitle={`${socials.length} linked profile${socials.length === 1 ? "" : "s"} — links open in new tabs`}>
          {socials.length ? (
            <ul className="flex flex-col gap-2 text-sm">
              {socials.map((s) => (
                <li key={`${s.platform}|${s.url}`} className="flex items-center gap-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 px-3 py-2">
                  <Share2 className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
                  <a href={s.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-medium hover:text-teal-700 dark:hover:text-teal-300 hover:underline">
                    {s.url.replace(/^https?:\/\//, "")}
                  </a>
                  <Badge tone="violet">{s.platform}</Badge>
                  <button
                    title="Delete profile"
                    onClick={() => removeSocial(s.platform, s.url)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-500/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400"><NotFound what="Social profiles" /> None linked yet — add one below or enrich the website.</p>
          )}
          <div className="mt-2 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Add manually</p>
            <div className="grid gap-2 sm:grid-cols-[140px_1fr]">
              <Select value={newSocial.platform} onChange={(e) => setNewSocial((f) => ({ ...f, platform: e.target.value }))} className="py-2">
                {["facebook", "linkedin", "instagram", "youtube", "x", "tiktok", "whatsapp", "telegram", "threads", "pinterest"].map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </Select>
              <Input
                value={newSocial.url}
                onChange={(e) => setNewSocial((f) => ({ ...f, url: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && addSocial()}
                placeholder="https://facebook.com/…"
                className="py-2"
              />
            </div>
            {socialError ? <p className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">{socialError}</p> : null}
            <Button onClick={addSocial} loading={socialBusy} className="mt-2 w-full py-2 text-sm">
              <Plus className="h-4 w-4" /> Add profile
            </Button>
          </div>
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



