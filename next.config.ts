import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["playwright", "cheerio", "exceljs"],
  // Type safety is enforced via `npx tsc --noEmit` before building;
  // skipping the in-build type worker, which OOMs on this machine.
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
