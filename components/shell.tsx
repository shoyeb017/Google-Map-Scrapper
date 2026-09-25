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

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/search", label: "New Scraping", icon: Search },
  { href: "/businesses", label: "Search", icon: Building2 },
  { href: "/map", label: "Map", icon: MapIcon },
  { href: "/map-search", label: "Map Scraper", icon: MapPinned },
  { href: "/jobs", label: "Scraped Packs", icon: Layers },
  { href: "/exports", label: "Export Settings", icon: Download },
  { href: "/saved-searches", label: "Saved Scrapings", icon: Bookmark },
  { href: "/providers", label: "Providers", icon: Plug },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/logs", label: "Logs", icon: ScrollText },
];

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

function NavLinks({ onNavigate, active, animate }: { onNavigate?: () => void; active: string; animate?: boolean }) {
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((n, i) => {
        const isActive = n.href === "/" ? active === "/" : active === n.href || active.startsWith(n.href + "/");
        const Icon = n.icon;
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={onNavigate}
            style={animate ? { animationDelay: `${Math.min(i * 35, 350)}ms` } : undefined}
            className={cn(
              "group relative flex items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
              animate && "animate-fade-up",
              isActive
                ? "bg-gradient-to-r from-teal-600 via-cyan-600 to-teal-600 text-white shadow-md shadow-teal-600/30 dark:shadow-teal-500/20"
                : "text-slate-600 hover:translate-x-0.5 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/80 dark:hover:text-white"
            )}
          >
            {isActive ? <span className="absolute inset-0 animate-gradient bg-gradient-to-r from-transparent via-white/15 to-transparent" /> : null}
            <Icon className={cn("h-[18px] w-[18px] shrink-0 transition-transform duration-200 group-hover:scale-110", isActive ? "" : "text-slate-400 group-hover:text-teal-500 dark:text-slate-500")} />
            {n.label}
            {isActive ? <span className="ml-auto h-1.5 w-1.5 animate-glow rounded-full bg-white" /> : null}
          </Link>
        );
      })}
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

