import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { Shell } from "@/components/shell";

export const metadata: Metadata = {
  title: "LeadScraper — Business Discovery & Company Intelligence",
  description: "Discover businesses, enrich company data, and export leads.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('leadscraper.theme');if(!t||t==='system'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}if(t==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-screen text-slate-900 dark:text-white dark:text-slate-100">
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}

