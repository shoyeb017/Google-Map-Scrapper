// Central domain types. No review data by design.

export type DiscoveryProviderId =
  | "google_places"
  | "browser_discovery"
  | "automatic";

export type ProviderErrorCode =
  | "AUTHENTICATION"
  | "QUOTA"
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "ACCESS_DENIED"
  | "NETWORK"
  | "PARSING"
  | "NOT_CONFIGURED"
  | "UNKNOWN";

export interface SearchParams {
  keyword: string;
  category?: string;
  locationText: string;
  latitude?: number;
  longitude?: number;
  radiusMeters?: number;
  country?: string;
  limit?: number;
  enrichWebsite?: boolean;
  discoverSocial?: boolean;
  discoverContacts?: boolean;
}

export interface NormalizedBusiness {
  name: string;
  officialName?: string | null;
  description?: string | null;
  primaryCategory?: string | null;
  secondaryCategories?: string[];
  businessTypes?: string[];
  industry?: string | null;
  businessStatus?: string | null;
  establishmentStatus?: string | null;
  website?: string | null;
  phones: string[];
  emails: string[];
  formattedAddress?: string | null;
  streetAddress?: string | null;
  city?: string | null;
  district?: string | null;
  state?: string | null;
  country?: string | null;
  countryCode?: string | null;
  postalCode?: string | null;
  plusCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  mapsUrl?: string | null;
  googleMapsUri?: string | null;
  placeId?: string | null;
  priceLevel?: number | null;
  openingHours?: string[];
  openNow?: boolean | null;
  // Aggregate card rating only (e.g. 4.5 from "4.5 (24)"). Never review text.
  rating?: number | null;
  reviewsCount?: number | null;
  sourceProvider: string;
  sourceRecordId?: string | null;
  sourceUrl?: string | null;
  socialLinks?: { platform: string; url: string }[];
  raw?: unknown;
}

export interface DiscoveryResult {
  provider: string;
  businesses: NormalizedBusiness[];
  totalDiscovered: number;
  truncated: boolean;
  durationMs: number;
}

export interface ProviderHealth {
  provider: string;
  status: "healthy" | "degraded" | "unavailable" | "not_configured";
  message?: string;
  latencyMs?: number;
}

export interface DiscoveryProvider {
  id: string;
  searchBusinesses(params: SearchParams): Promise<DiscoveryResult>;
  healthCheck?(): Promise<ProviderHealth>;
}

export interface ProviderAttempt {
  provider: string;
  role: "primary" | "fallback";
  status: "success" | "failed" | "skipped";
  errorCode?: ProviderErrorCode;
  errorMessage?: string;
  resultsCount?: number;
  durationMs?: number;
}

export interface OrchestratedSearch extends DiscoveryResult {
  primaryProvider: string;
  fallbackProvider?: string;
  providerAttempts: ProviderAttempt[];
  fallbackUsed: boolean;
  fallbackReason?: string;
}

export interface BusinessRecord extends NormalizedBusiness {
  id: string;
  completenessScore: number;
  enrichmentStatus: string;
  providers: string[];
  createdAt: string;
  updatedAt: string;
}

export const PROVIDER_LABELS: Record<string, string> = {
  google_places: "Google Places API",
  browser_discovery: "Browser Discovery",
  automatic: "Automatic / Fallback",
};
