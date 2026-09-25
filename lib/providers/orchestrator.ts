import { BrowserDiscoveryProvider } from "@/lib/providers/browser-discovery/browser-provider";
import { GooglePlacesProvider } from "@/lib/providers/google-places/google-places-provider";
import type {
  DiscoveryProvider,
  DiscoveryResult,
  OrchestratedSearch,
  ProviderAttempt,
  SearchParams,
} from "@/lib/providers/types";

export type ProviderChoice = "google_places" | "browser_discovery" | "automatic";

// In Automatic mode ANY primary failure triggers the fallback: missing/invalid
// API key, quota, rate limits, timeouts, blocks, parse errors, empty results.
// (The spec lists "API key unavailable" and "API credentials invalid" as
// explicit fallback triggers.) Input validation happens before orchestration,
// so there is no invalid-input case at this layer.
export function shouldFallback(_code?: string): boolean {
  return true;
}

function resolveProvider(id: string): DiscoveryProvider {
  if (id === "google_places") return new GooglePlacesProvider();
  return new BrowserDiscoveryProvider();
}

export interface OrchestratorOptions {
  mode: ProviderChoice;
  primary?: string;
  fallback?: string;
}

export async function orchestrateSearch(
  params: SearchParams,
  opts: OrchestratorOptions
): Promise<OrchestratedSearch> {
  const attempts: ProviderAttempt[] = [];

  // Explicit single-provider mode
  if (opts.mode === "google_places" || opts.mode === "browser_discovery") {
    const provider = resolveProvider(opts.mode);
    const started = Date.now();
    try {
      const r: DiscoveryResult = await provider.searchBusinesses(params);
      attempts.push({
        provider: opts.mode,
        role: "primary",
        status: "success",
        resultsCount: r.businesses.length,
        durationMs: Date.now() - started,
      });
      return {
        ...r,
        primaryProvider: opts.mode,
        providerAttempts: attempts,
        fallbackUsed: false,
      };
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      attempts.push({
        provider: opts.mode,
        role: "primary",
        status: "failed",
        errorCode: (err.code as never) ?? "UNKNOWN",
        errorMessage: err.message ?? "provider failed",
        durationMs: Date.now() - started,
      });
      throw Object.assign(new Error(err.message ?? "provider failed"), {
        code: err.code ?? "UNKNOWN",
        attempts,
      });
    }
  }

  // Automatic / fallback mode
  const primary = opts.primary ?? "google_places";
  const fallback = opts.fallback ?? "browser_discovery";
  const startedP = Date.now();
  try {
    const provider = resolveProvider(primary);
    const r = await provider.searchBusinesses(params);
    attempts.push({
      provider: primary,
      role: "primary",
      status: "success",
      resultsCount: r.businesses.length,
      durationMs: Date.now() - startedP,
    });
    if (r.businesses.length === 0) {
      // No usable results -> try fallback
      return await runFallback(params, primary, fallback, attempts, "Primary provider returned no usable results");
    }
    return { ...r, primaryProvider: primary, fallbackProvider: fallback, providerAttempts: attempts, fallbackUsed: false };
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    attempts.push({
      provider: primary,
      role: "primary",
      status: "failed",
      errorCode: (err.code as never) ?? "UNKNOWN",
      errorMessage: err.message ?? "primary failed",
      durationMs: Date.now() - startedP,
    });
    if (!shouldFallback(err.code)) {
      throw Object.assign(new Error(err.message ?? "primary failed"), { code: err.code, attempts });
    }
    return await runFallback(params, primary, fallback, attempts, err.message ?? primary + " failed");
  }
}

async function runFallback(
  params: SearchParams,
  primary: string,
  fallback: string,
  attempts: ProviderAttempt[],
  reason: string
): Promise<OrchestratedSearch> {
  const started = Date.now();
  try {
    const provider = resolveProvider(fallback);
    const r = await provider.searchBusinesses(params);
    attempts.push({
      provider: fallback,
      role: "fallback",
      status: "success",
      resultsCount: r.businesses.length,
      durationMs: Date.now() - started,
    });
    return {
      ...r,
      primaryProvider: primary,
      fallbackProvider: fallback,
      providerAttempts: attempts,
      fallbackUsed: true,
      fallbackReason: reason,
    };
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    attempts.push({
      provider: fallback,
      role: "fallback",
      status: "failed",
      errorCode: (err.code as never) ?? "UNKNOWN",
      errorMessage: err.message ?? "fallback failed",
      durationMs: Date.now() - started,
    });
    throw Object.assign(new Error(`Both providers failed. Primary: ${reason}. Fallback: ${err.message}`), {
      code: err.code ?? "UNKNOWN",
      attempts,
      fallbackUsed: true,
      fallbackReason: reason,
    });
  }
}
