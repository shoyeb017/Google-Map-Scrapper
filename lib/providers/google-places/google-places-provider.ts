import type {
  DiscoveryProvider,
  DiscoveryResult,
  NormalizedBusiness,
  ProviderErrorCode,
  ProviderHealth,
  SearchParams,
} from "@/lib/providers/types";

export class ProviderError extends Error {
  code: ProviderErrorCode;
  constructor(code: ProviderErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export function mapGoogleError(status: string, message: string): ProviderError {
  const s = `${status} ${message}`.toUpperCase();
  if (s.includes("INVALID") || s.includes("DENIED") || s.includes("UNAUTHORIZED") || s.includes("API KEY"))
    return new ProviderError("AUTHENTICATION", message || status);
  if (s.includes("QUOTA") || s.includes("OVER_QUERY") || s.includes("RESOURCE_EXHAUSTED"))
    return new ProviderError("QUOTA", message || status);
  if (s.includes("429") || s.includes("RATE"))
    return new ProviderError("RATE_LIMIT", message || status);
  if (s.includes("TIMEOUT") || s.includes("DEADLINE"))
    return new ProviderError("TIMEOUT", message || status);
  if (s.includes("NOT_FOUND")) return new ProviderError("ACCESS_DENIED", message || status);
  return new ProviderError("UNKNOWN", message || status);
}

// Google Places API (New). Text Search + Place Details (no review fields requested).
export class GooglePlacesProvider implements DiscoveryProvider {
  id = "google_places";
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env.GOOGLE_MAPS_API_KEY ?? "";
  }

  private ensureKey() {
    if (!this.apiKey) {
      throw new ProviderError("NOT_CONFIGURED", "GOOGLE_MAPS_API_KEY is not configured");
    }
  }

  async searchBusinesses(params: SearchParams): Promise<DiscoveryResult> {
    const started = Date.now();
    this.ensureKey();
    const limit = Math.min(params.limit ?? 20, 500);
    const query = [params.keyword, params.category, params.locationText].filter(Boolean).join(" ");

    const collected: NormalizedBusiness[] = [];
    let pageToken: string | undefined;
    let page = 0;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    try {
      while (collected.length < limit && page < 5) {
        const body: Record<string, unknown> = {
          textQuery: query,
          maxResultCount: Math.min(20, limit - collected.length),
          languageCode: "en",
        };
        if (pageToken) body.pageToken = pageToken;
        if (params.latitude && params.longitude) {
          body.locationBias = {
            circle: {
              center: { latitude: params.latitude, longitude: params.longitude },
              radius: params.radiusMeters ?? 10000,
            },
          };
        }

        let res: Response;
        try {
          res = await fetch("https://places.googleapis.com/v1/places:searchText", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": this.apiKey,
              // Deliberately excludes reviews / rating fields.
              "X-Goog-FieldMask":
                "places.id,places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.internationalPhoneNumber,places.location,places.viewport,places.businessStatus,places.primaryType,places.types,places.addressComponents,places.plusCode,places.timeZone,places.priceLevel,places.regularOpeningHours,places.currentOpeningHours,places.accessibilityOptions,places.googleMapsUri,nextPageToken",
            },
            body: JSON.stringify(body),
            signal: controller.signal,
          });
        } catch (e: unknown) {
          throw new ProviderError("NETWORK", e instanceof Error ? e.message : "network error");
        }

        if (res.status === 429) throw new ProviderError("RATE_LIMIT", "Google Places rate limited");
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw mapGoogleError(res.statusText, text.slice(0, 500));
        }
        const json = (await res.json()) as {
          places?: Record<string, unknown>[];
          nextPageToken?: string;
        };
        for (const p of json.places ?? []) {
          collected.push(this.toNormalized(p));
          if (collected.length >= limit) break;
        }
        pageToken = json.nextPageToken;
        if (!pageToken) break;
        page++;
        await new Promise((r) => setTimeout(r, 2000)); // pageToken warm-up
      }
    } finally {
      clearTimeout(timeout);
    }

    return {
      provider: "google_places",
      businesses: collected,
      totalDiscovered: collected.length,
      truncated: collected.length >= limit && Boolean(pageToken),
      durationMs: Date.now() - started,
    };
  }

  private toNormalized(p: Record<string, unknown>): NormalizedBusiness {
    const get = (k: string) => p[k] as never;
    const displayName = (get("displayName") as { text?: string } | undefined)?.text ?? "Unknown";
    const location = get("location") as { latitude?: number; longitude?: number } | undefined;
    const comps = (get("addressComponents") as { longText?: string; shortText?: string; types?: string[] }[] | undefined) ?? [];
    const comp = (t: string) => comps.find((c) => c.types?.includes(t));
    const phones = [get("nationalPhoneNumber"), get("internationalPhoneNumber")].filter(Boolean) as string[];
    const types = (get("types") as string[] | undefined) ?? [];
    const primaryType = get("primaryType") as string | undefined;
    const opening = get("regularOpeningHours") as { weekdayDescriptions?: string[]; openNow?: boolean } | undefined;
    return {
      name: displayName,
      primaryCategory: primaryType ?? types[0] ?? null,
      secondaryCategories: types.slice(1),
      businessTypes: types,
      businessStatus: (get("businessStatus") as string | undefined) ?? null,
      website: (get("websiteUri") as string | undefined) ?? null,
      phones,
      emails: [],
      formattedAddress: (get("formattedAddress") as string | undefined) ?? null,
      city: comp("locality")?.longText ?? null,
      district: comp("administrative_area_level_2")?.longText ?? comp("sublocality")?.longText ?? null,
      state: comp("administrative_area_level_1")?.longText ?? null,
      country: comp("country")?.longText ?? null,
      countryCode: (comp("country")?.shortText as string | undefined) ?? null,
      postalCode: comp("postal_code")?.longText ?? null,
      plusCode: (get("plusCode") as { globalCode?: string } | undefined)?.globalCode ?? null,
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      mapsUrl: (get("googleMapsUri") as string | undefined) ?? null,
      googleMapsUri: (get("googleMapsUri") as string | undefined) ?? null,
      placeId: (get("id") as string | undefined) ?? null,
      priceLevel: (get("priceLevel") as number | undefined) ?? null,
      openingHours: opening?.weekdayDescriptions ?? [],
      openNow: opening?.openNow ?? null,
      sourceProvider: "google_places",
      sourceRecordId: (get("id") as string | undefined) ?? null,
      sourceUrl: (get("googleMapsUri") as string | undefined) ?? null,
      socialLinks: [],
      raw: p,
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    if (!this.apiKey)
      return { provider: "google_places", status: "not_configured", message: "GOOGLE_MAPS_API_KEY missing" };
    return { provider: "google_places", status: "healthy", message: "API key present (quota unknown until call)" };
  }
}
