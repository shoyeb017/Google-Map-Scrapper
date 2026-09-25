import { NextResponse } from "next/server";
import { GooglePlacesProvider } from "@/lib/providers/google-places/google-places-provider";
import { BrowserDiscoveryProvider } from "@/lib/providers/browser-discovery/browser-provider";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export async function GET() {
  const [google, browser] = await Promise.all([
    new GooglePlacesProvider().healthCheck(),
    new BrowserDiscoveryProvider().healthCheck(),
  ]);
  return NextResponse.json({
    google_places: google,
    browser_discovery: browser,
    website_enrichment: {
      provider: "website_enrichment",
      status: (process.env.WEBSITE_ENRICHMENT_ENABLED ?? "true") === "true" ? "healthy" : "not_configured",
    },
    supabase: {
      provider: "supabase",
      status: isSupabaseConfigured() ? "healthy" : "not_configured",
      message: isSupabaseConfigured() ? "credentials present" : "Using local file store; add Supabase env to persist remotely",
    },
  });
}
