import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["playwright", "cheerio", "exceljs"],
  // Playwright is loaded dynamically by the map-session route handlers.
  // Include its external runtime packages in Vercel's per-route function trace.
  outputFileTracingIncludes: {
    "/api/map-session*": [
      "./node_modules/playwright/**/*",
      "./node_modules/playwright-core/**/*",
    ],
  },
  // Type safety is enforced via `npx tsc --noEmit` before building;
  // skipping the in-build type worker, which OOMs on this machine.
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
