"use client";
import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import {
  AtSign,
  Check,
  Copy,
  Layers,
  MapPinned,
  MessageCircle,
  Music2,
  Pin,
  Send,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";

/* ---------- Pack type ---------- */

export type PackKind = "map-session" | "normal";

// Session packs carry a browser_discovery attempt marked "session-list".
export function packKind(job: {
  providerAttempts?: { provider?: string; status?: string }[] | unknown;
}): PackKind {
  const attempts = (job?.providerAttempts ?? []) as { provider?: string; status?: string }[];
  return attempts.some((a) => a?.provider === "browser_discovery" && a?.status === "session-list")
    ? "map-session"
    : "normal";
}

export function PackBadge({ job, className }: { job: { providerAttempts?: { provider?: string; status?: string }[] | unknown }; className?: string }) {
  const kind = packKind(job);
  return kind === "map-session" ? (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-gradient-to-r from-teal-600 to-cyan-600 px-2.5 py-0.5 text-xs font-semibold text-white shadow-sm shadow-teal-600/30", className)}>
      <MapPinned className="h-3.5 w-3.5" /> Map Session
    </span>
  ) : (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-teal-700 px-2.5 py-0.5 text-xs font-semibold text-white dark:bg-teal-600", className)}>
      <Layers className="h-3.5 w-3.5" /> Normal
    </span>
  );
}

/* ---------- Buttons ---------- */

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "success" | "dark";

const buttonStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-r from-teal-600 via-cyan-600 to-teal-600 text-white shadow-md shadow-teal-600/25 hover:shadow-lg hover:shadow-teal-600/40 hover:brightness-110 dark:shadow-teal-500/20",
  secondary:
    "bg-white text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800",
  danger: "bg-rose-600 text-white shadow-sm shadow-rose-600/25 hover:bg-rose-500 dark:shadow-rose-500/20",
  ghost: "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
  success:
    "bg-emerald-600 text-white shadow-sm shadow-emerald-600/25 hover:bg-emerald-500 dark:shadow-emerald-500/20",
  dark: "bg-slate-900 text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
}

export function Button({ variant = "primary", loading, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 hover:-translate-y-px active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0",
        buttonStyles[variant],
        className
      )}
      {...rest}
    >
      {loading ? <Spinner className="h-4 w-4" /> : null}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

/* ---------- Cards & sections ---------- */

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("lift rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05)] backdrop-blur transition-colors duration-300 sm:p-5 dark:border-slate-800/80 dark:bg-slate-900/70 dark:shadow-[0_8px_30px_rgba(0,0,0,0.35)]", className)}>
      {children}
    </div>
  );
}

export function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = "indigo",
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub?: string;
  tone?: "indigo" | "emerald" | "amber" | "sky" | "violet" | "rose";
}) {
  const tones: Record<string, string> = {
    indigo: "bg-teal-50 text-teal-600 dark:bg-teal-500/15 dark:text-teal-300",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
    sky: "bg-cyan-50 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-300",
    violet: "bg-cyan-50 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-300",
    rose: "bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",
  };
  return (
    <Card className="group flex items-start gap-3 transition-transform duration-200 hover:-translate-y-0.5">
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110 group-hover:rotate-3", tones[tone])}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</span>
        <span className="block truncate text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{value}</span>
        {sub ? <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{sub}</span> : null}
      </span>
    </Card>
  );
}

export function Section({
  title,
  subtitle,
  action,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05)] backdrop-blur transition-colors duration-300 sm:p-5 dark:border-slate-800/80 dark:bg-slate-900/70 dark:shadow-[0_8px_30px_rgba(0,0,0,0.35)]", className)}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold tracking-tight text-slate-900 dark:text-white">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/* ---------- Badges & dots ---------- */

type Tone = "gray" | "green" | "amber" | "red" | "blue" | "violet";

const badgeStyles: Record<Tone, string> = {
  gray: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  green: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30",
  amber: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30",
  red: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30",
  blue: "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/30",
  violet: "bg-cyan-50 text-cyan-700 ring-1 ring-inset ring-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-300 dark:ring-cyan-500/30",
};

export function Badge({ tone = "gray", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium", badgeStyles[tone], className)}>
      {children}
    </span>
  );
}

export function statusTone(status: string): Tone {
  const s = status.toLowerCase();
  if (["healthy", "completed", "success", "enriched", "active"].includes(s)) return "green";
  if (["degraded", "partial", "running", "pending"].includes(s)) return "amber";
  if (["failed", "unavailable", "error"].includes(s)) return "red";
  if (["not_configured", "skipped"].includes(s)) return "gray";
  return "blue";
}

export function HealthDot({ status }: { status: string }) {
  const color =
    status === "healthy" ? "bg-emerald-500"
    : status === "degraded" ? "bg-amber-500"
    : status === "unavailable" ? "bg-rose-500"
    : "bg-slate-300";
  return (
    <span className="relative flex h-2.5 w-2.5">
      <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", color, status === "healthy" ? "" : "hidden")} />
      <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", color)} />
    </span>
  );
}

const PROVIDER_META: Record<string, { label: string; tone: Tone }> = {
  google_places: { label: "Google Places", tone: "blue" },
  browser_discovery: { label: "Browser", tone: "violet" },
  mock: { label: "Mock", tone: "gray" },
  automatic: { label: "Automatic", tone: "green" },
  company_website: { label: "Website", tone: "amber" },
};

export function ProviderBadge({ provider }: { provider: string }) {
  const meta = PROVIDER_META[provider] ?? { label: provider, tone: "gray" as Tone };
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

/* ---------- Forms ---------- */

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</span>
      {children}
      {hint ? <span className="text-[11px] text-slate-400 dark:text-slate-500">{hint}</span> : null}
    </label>
  );
}

const inputBase =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-teal-500 dark:focus:ring-teal-500/20";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputBase, props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(inputBase, "pr-8", props.className)} />;
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2.5 rounded-xl px-1 py-1 text-left text-sm text-slate-700 transition dark:text-slate-200"
    >
      <span
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200",
          checked ? "bg-gradient-to-r from-teal-600 to-cyan-600 shadow-sm shadow-teal-600/30" : "bg-slate-200 dark:bg-slate-700"
        )}
      >
        <span
          className={cn(
            "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-6" : "translate-x-1"
          )}
        />
      </span>
      {label}
    </button>
  );
}

/* ---------- Feedback ---------- */

export function ProgressBar({ value, max = 100, className }: { value: number; max?: number; className?: string }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800", className)}>
      <div
        className="h-full animate-gradient rounded-full bg-gradient-to-r from-teal-500 via-cyan-500 to-teal-500 transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden />;
}

export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-10 text-center dark:border-slate-700 dark:bg-slate-900/40">
      <span className="flex h-12 w-12 animate-float items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm dark:bg-slate-800 dark:text-slate-500">
        <Icon className="h-6 w-6" />
      </span>
      <p className="font-medium text-slate-700 dark:text-slate-200">{title}</p>
      {hint ? <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">{hint}</p> : null}
      {action}
    </div>
  );
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(value).catch(() => undefined);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : label}
    </button>
  );
}

export function Completeness({ value }: { value: number }) {
  return (
    <span className="flex min-w-24 items-center gap-2">
      <ProgressBar value={value} className="h-1.5 flex-1" />
      <span className="text-xs tabular-nums text-slate-500">{value}%</span>
    </span>
  );
}

/* ---------- Missing data ---------- */

export function NotFound({ what }: { what: string }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-dashed border-slate-300 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-400 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-500">
      {what} not found
    </span>
  );
}

/* ---------- Social presence icons ---------- */

/* ---------- Social presence icons ---------- */

// Brand marks drawn inline (lucide no longer ships brand icons). Stroke style
// matches lucide so they blend with the rest of the icon set.
function brandIcon(paths: ReactNode) {
  return function BrandMark({ className }: { className?: string }) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden
      >
        {paths}
      </svg>
    );
  };
}

const FacebookIcon = brandIcon(<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />);
const LinkedinIcon = brandIcon(
  <>
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
    <rect width="4" height="12" x="2" y="9" />
    <circle cx="4" cy="4" r="2" />
  </>
);
const InstagramIcon = brandIcon(
  <>
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
  </>
);
const YoutubeIcon = brandIcon(
  <>
    <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.56 49.56 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
    <path d="m10 15 5-3-5-3z" />
  </>
);
const XIcon = brandIcon(
  <path d="M4 4l16 16M20 4L4 20" />
);

type IconComponent = (props: { className?: string }) => React.JSX.Element;

const SOCIAL_PLATFORMS: { key: string; label: string; icon: IconComponent | LucideIcon; color: string }[] = [
  { key: "facebook", label: "Facebook", icon: FacebookIcon, color: "text-[#1877F2]" },
  { key: "linkedin", label: "LinkedIn", icon: LinkedinIcon, color: "text-[#0A66C2]" },
  { key: "instagram", label: "Instagram", icon: InstagramIcon, color: "text-[#E1306C]" },
  { key: "youtube", label: "YouTube", icon: YoutubeIcon, color: "text-[#FF0000]" },
  { key: "x", label: "X", icon: XIcon, color: "text-slate-900 dark:text-white" },
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle, color: "text-[#25D366]" },
  { key: "tiktok", label: "TikTok", icon: Music2, color: "text-slate-900 dark:text-white" },
  { key: "telegram", label: "Telegram", icon: Send, color: "text-[#229ED9]" },
  { key: "threads", label: "Threads", icon: AtSign, color: "text-slate-900 dark:text-white" },
  { key: "pinterest", label: "Pinterest", icon: Pin, color: "text-[#E60023]" },
];

export function SocialIcons({
  links,
  iconClass = "h-4 w-4",
}: {
  links?: { platform: string; url: string }[] | null;
  iconClass?: string;
}) {
  const found = new Map((links ?? []).map((s) => [s.platform.toLowerCase(), s.url]));
  return (
    <span className="inline-flex items-center gap-[3px]" role="group" aria-label="Social media presence">
      {SOCIAL_PLATFORMS.map((p) => {
        const url = found.get(p.key);
        const Icon = p.icon;
        const icon = <Icon className={cn(iconClass, url ? p.color : "text-slate-300 dark:text-slate-700")} />;
        return url ? (
          <a
            key={p.key}
            href={url}
            target="_blank"
            rel="noreferrer"
            title={`${p.label} found — open profile`}
            onClick={(e) => e.stopPropagation()}
            className="rounded p-[1px] transition hover:scale-110 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {icon}
          </a>
        ) : (
          <span key={p.key} title={`${p.label} not found`} className="rounded p-[1px]">
            {icon}
          </span>
        );
      })}
    </span>
  );
}

/* ---------- Two-tap delete confirm ---------- */

export function ConfirmButton({
  onConfirm,
  title = "Delete",
  confirmTitle = "Confirm?",
  busy,
  className,
}: {
  onConfirm: () => void | Promise<void>;
  title?: string;
  confirmTitle?: string;
  busy?: boolean;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        if (armed) {
          setArmed(false);
          void onConfirm();
        } else {
          setArmed(true);
        }
      }}
      className={cn(
        "inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-medium transition active:scale-[0.98] disabled:opacity-50",
        armed
          ? "bg-rose-600 text-white shadow-md shadow-rose-600/30 hover:bg-rose-500"
          : "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30 dark:hover:bg-rose-500/20",
        className
      )}
    >
      {busy ? <Spinner className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
      {armed ? confirmTitle : title}
    </button>
  );
}

