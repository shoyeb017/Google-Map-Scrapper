import type { NextConfig } from "next";

const mapSessionTraceIncludes = [
  "./node_modules/playwright/**/*",
  "./node_modules/playwright-core/**/*",
  "./node_modules/playwright-core/.local-browsers/**/*",
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["playwright", "cheerio", "exceljs"],
  // Playwright is loaded dynamically by the map-session route handlers.
  // Include its external runtime packages in Vercel's per-route function trace.
  outputFileTracingIncludes: {
    "/api/map-session": mapSessionTraceIncludes,
    "/api/map-session/*": mapSessionTraceIncludes,
  },
  // Type safety is enforced via `npx tsc --noEmit` before building;
  // skipping the in-build type worker, which OOMs on this machine.
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
