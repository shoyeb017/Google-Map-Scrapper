"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bookmark,
  Building2,
  Download,
  Layers,
  LayoutDashboard,
  Map as MapIcon,
  MapPinned,
  Menu,
  Plug,
  ScrollText,
  Search,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { ThemeToggle } from "@/components/theme";

const NAV_SINGLE_TOP = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
];

const NAV_GROUPS = [
  {
    id: "scraping",
    label: "Scraping",
    icon: Search,
    children: [
      { href: "/search", label: "New Scraping", icon: Search },
      { href: "/map-search", label: "Map Scraper", icon: MapPinned },
    ],
  },
  {
    id: "leads",
    label: "Leads",
    icon: Building2,
    children: [
      { href: "/businesses", label: "Business Search", icon: Building2 },
      { href: "/jobs", label: "Packs Analysis", icon: Layers },
    ],
  },
];

const NAV_SINGLE_MID = [
  { href: "/map", label: "Map", icon: MapIcon },
  { href: "/saved-searches", label: "Saved Scrapings", icon: Bookmark },
  { href: "/providers", label: "Providers", icon: Plug },
  { href: "/logs", label: "Logs", icon: ScrollText },
];

const NAV_SETTINGS_GROUP = {
  id: "settings",
  label: "Settings",
  icon: Settings,
  children: [
    { href: "/exports", label: "Export Settings", icon: Download },
    { href: "/settings", label: "App Settings", icon: Settings },
  ],
};

function Brand() {
  return (
    <Link href="/" className="group flex items-center gap-2.5">
      <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 via-cyan-600 to-teal-500 text-base font-bold text-white shadow-md shadow-teal-600/30 transition-transform duration-300 group-hover:rotate-6 group-hover:scale-105">
        <Sparkles className="h-4 w-4" />
        <span className="absolute inset-0 rounded-xl bg-gradient-to-t from-transparent via-transparent to-white/25" />
      </span>
      <span className="leading-tight">
        <span className="block text-[15px] font-bold tracking-tight text-slate-900 dark:text-white">
          Lead<span className="text-gradient">Scraper</span>
        </span>
        <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">Company Intelligence</span>
      </span>
    </Link>
  );
}

function isLinkActive(href: string, active: string) {
  return href === "/" ? active === "/" : active === href || active.startsWith(href + "/");
}

function NavItem({ href, label, Icon, active, onNavigate }: { href: string; label: string; Icon: typeof Search; active: string; onNavigate?: () => void }) {
  const isActive = isLinkActive(href, active);
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "group relative flex items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
        isActive
          ? "bg-gradient-to-r from-teal-600 via-cyan-600 to-teal-600 text-white shadow-md shadow-teal-600/30 dark:shadow-teal-500/20"
          : "text-slate-600 hover:translate-x-0.5 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/80 dark:hover:text-white"
      )}
    >
      {isActive ? <span className="absolute inset-0 animate-gradient bg-gradient-to-r from-transparent via-white/15 to-transparent" /> : null}
      <Icon className={cn("h-[18px] w-[18px] shrink-0 transition-transform duration-200 group-hover:scale-110", isActive ? "" : "text-slate-400 group-hover:text-teal-500 dark:text-slate-500")} />
      {label}
      {isActive ? <span className="ml-auto h-1.5 w-1.5 animate-glow rounded-full bg-white" /> : null}
    </Link>
  );
}

function NavGroup({ id, label, Icon, children, active, onNavigate, defaultOpen }: { id: string; label: string; Icon: typeof Search; children: { href: string; label: string; icon: typeof Search }[]; active: string; onNavigate?: () => void; defaultOpen?: boolean }) {
  const childActive = children.some((c) => isLinkActive(c.href, active));
  // SSR-safe: server and first client render are always open.
  // Saved closed state is applied after hydration, so no mismatch.
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (childActive) {
      setOpen(true);
      return;
    }
    try {
      if (window.localStorage.getItem(`leadscraper.nav.${id}`) === "closed") setOpen(false);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, childActive]);
  function toggle() {
    setOpen((v) => {
      try {
        window.localStorage.setItem(`leadscraper.nav.${id}`, v ? "closed" : "open");
      } catch {
        /* ignore */
      }
      return !v;
    });
  }
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className={cn(
          "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
          childActive
            ? "bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-200 dark:bg-teal-500/10 dark:text-teal-200 dark:ring-teal-500/30"
            : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800/80"
        )}
      >
        <Icon className="h-[18px] w-[18px] shrink-0 text-slate-400 group-hover:text-teal-500 dark:text-slate-500" />
        {label}
        <span className={cn("ml-auto text-xs transition-transform", open ? "rotate-180" : "")}>▾</span>
      </button>
      {open ? (
        <div className="ml-4 flex flex-col gap-1 border-l-2 border-slate-100 pl-2 dark:border-slate-800">
          {children.map((c) => (
            <NavItem key={c.href} href={c.href} label={c.label} Icon={c.icon} active={active} onNavigate={onNavigate} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function NavLinks({ onNavigate, active, animate }: { onNavigate?: () => void; active: string; animate?: boolean }) {
  return (
    <nav className="flex flex-col gap-1">
      <div className={cn(animate && "animate-fade-up")}>
        {NAV_SINGLE_TOP.map((n) => (
          <NavItem key={n.href} href={n.href} label={n.label} Icon={n.icon} active={active} onNavigate={onNavigate} />
        ))}
      </div>
      {NAV_GROUPS.map((g) => (
        <NavGroup key={g.id} id={g.id} label={g.label} Icon={g.icon} children={g.children} active={active} onNavigate={onNavigate} defaultOpen />
      ))}
      {NAV_SINGLE_MID.map((n) => (
        <NavItem key={n.href} href={n.href} label={n.label} Icon={n.icon} active={active} onNavigate={onNavigate} />
      ))}
      <NavGroup id={NAV_SETTINGS_GROUP.id} label={NAV_SETTINGS_GROUP.label} Icon={NAV_SETTINGS_GROUP.icon} children={NAV_SETTINGS_GROUP.children} active={active} onNavigate={onNavigate} />
    </nav>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [backend, setBackend] = useState<"supabase" | "local" | null>(null);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((h) => setBackend(h?.supabase?.status === "healthy" ? "supabase" : "local"))
      .catch(() => setBackend(null));
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open ]);

  return (
    <div className="relative flex min-h-screen">
      <div className="aurora aurora-a" aria-hidden />
      <div className="aurora aurora-b" aria-hidden />
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-4 overflow-y-auto border-r border-slate-200/70 bg-white/70 p-4 backdrop-blur-xl lg:flex dark:border-slate-800/70 dark:bg-slate-950/60">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-teal-500/10 to-transparent dark:from-teal-500/20" />
        <Brand />
        <NavLinks active={pathname} />
        <div className="mt-auto flex flex-col gap-2">
          <div className="flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white/60 px-3 py-2 backdrop-blur dark:border-slate-800/70 dark:bg-slate-900/60">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Appearance</span>
            <ThemeToggle showLabel />
          </div>
        <div className="relative mt-auto overflow-hidden rounded-2xl bg-gradient-to-br from-teal-600 via-cyan-600 to-teal-600 p-3.5 text-xs leading-relaxed text-white shadow-lg shadow-teal-600/25">
          <div className="absolute -right-6 -top-6 h-20 w-20 animate-float rounded-full bg-white/15 blur-sm" />
          <span className="font-semibold">Privacy-first dataset.</span>
          <br />
          <span className="text-teal-100">Identity, contact, location &amp; enrichment only — no reviews collected.</span>
        </div>
        </div>
      </aside>

      {/* Mobile drawer (above Leaflet map panes, which use z-index up to 1000) */}
      <div className={cn("fixed inset-0 z-[1002] lg:hidden", open ? "" : "pointer-events-none")}>
        <div
          className={cn(
            "absolute inset-0 bg-slate-950/50 backdrop-blur-sm transition-opacity duration-300",
            open ? "opacity-100" : "opacity-0"
          )}
          onClick={() => setOpen(false)}
        />
        <aside
          className={cn(
            "absolute left-0 top-0 flex h-full w-72 flex-col gap-4 border-r border-slate-200/70 bg-white/90 p-4 shadow-2xl backdrop-blur-xl transition-transform duration-300 ease-[cubic-bezier(0.21,1.02,0.73,1)] dark:border-slate-800/70 dark:bg-slate-950/90",
            open ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="flex items-center justify-between">
            <Brand />
            <button
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:rotate-90 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="slim-scroll flex-1 overflow-y-auto">
            <NavLinks onNavigate={() => setOpen(false)} active={pathname} animate={open} />
          </div>
          <div className="flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white/80 px-3 py-2 dark:border-slate-800/70 dark:bg-slate-900/70">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Appearance</span>
            <ThemeToggle showLabel />
          </div>
          <p className="text-center text-[11px] text-slate-400 dark:text-slate-500">LeadScraper · v1.0</p>
        </aside>
      </div>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-[1001] border-b border-slate-200/70 bg-white/75 backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-950/70">
          <div className="mx-auto flex w-full max-w-7xl items-center gap-2 px-3 py-2.5 sm:px-4 lg:px-6">
            <button
              onClick={() => setOpen(true)}
              aria-label="Open menu"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-100 active:scale-95 lg:hidden dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="lg:hidden">
              <Brand />
            </span>
            <div className="ml-auto flex items-center gap-2">
              {backend ? (
                <span
                  className={cn(
                    "hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset sm:inline-flex",
                    backend === "supabase"
                      ? "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30"
                      : "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30"
                  )}
                >
                  <Activity className="h-3.5 w-3.5" />
                  {backend === "supabase" ? "Supabase" : "Local store"}
                </span>
              ) : null}
              <ThemeToggle />
              <Link
                href="/search"
                className="group inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-teal-600 via-cyan-600 to-teal-600 px-3.5 py-2 text-sm font-medium text-white shadow-md shadow-teal-600/25 transition hover:shadow-lg hover:shadow-teal-600/40 hover:brightness-110 active:scale-95"
              >
                <Search className="h-4 w-4 transition-transform group-hover:rotate-12" />
                <span className="hidden sm:inline">New Scraping</span>
                <span className="sm:hidden">Scrape</span>
              </Link>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-3 py-4 sm:px-4 sm:py-6 lg:px-6">{children}</main>
        <footer className="border-t border-slate-200/60 px-4 py-3 text-center text-[11px] text-slate-400 dark:border-slate-800/60 dark:text-slate-500">
          LeadScraper · v2.0-teal · Business discovery &amp; company intelligence · No review data
        </footer>
      </div>
    </div>
  );
}

