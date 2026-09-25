"use client";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/cn";

const KEY = "leadscraper.theme";

export function currentTheme(): "dark" | "light" {
  if (typeof document !== "undefined" && document.documentElement.classList.contains("dark")) return "dark";
  return "light";
}

export function applyTheme(t: "dark" | "light") {
  document.documentElement.classList.toggle("dark", t === "dark");
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* ignore */
  }
}

export type ThemeChoice = "light" | "dark" | "system";

export function resolveTheme(c: ThemeChoice): "dark" | "light" {
  if (c === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return c;
}

export function applyThemeChoice(c: ThemeChoice) {
  applyTheme(resolveTheme(c));
  try {
    localStorage.setItem(KEY, c);
  } catch {
    /* ignore */
  }
}

export function currentChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "dark" || v === "light" || v === "system") return v;
  } catch {
    /* ignore */
  }
  return "system";
}

export function ThemeToggle({ className, showLabel }: { className?: string; showLabel?: boolean }) {
  const [theme, setTheme] = useState<"dark" | "light">("light");

  useEffect(() => {
    setTheme(currentTheme());
  }, []);

  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      onClick={() => {
        applyTheme(next);
        setTheme(next);
      }}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "group relative inline-flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-amber-300",
        className
      )}
    >
      <span key={theme} className="animate-fade-up flex">
        {theme === "dark" ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
      </span>
      {showLabel ? <span className="text-xs">{theme === "dark" ? "Light" : "Dark"}</span> : null}
      <span className="absolute inset-0 rounded-xl ring-1 ring-inset ring-slate-200 transition group-hover:ring-slate-300 dark:ring-slate-700" />
    </button>
  );
}
