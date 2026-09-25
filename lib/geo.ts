// OpenStreetMap helpers (Nominatim + Photon fallback). No API key required.
// Used for geocoding + as a reliable fallback discovery source.

const UA = "LeadScraper-Company-Intelligence/1.0 (contact: admin@example.com)";
const REFERER = "http://localhost:3000/";

const HEADERS = {
  "User-Agent": UA,
  Referer: REFERER,
  Accept: "application/json",
};

const geoCache = new Map<string, { lat: number; lng: number } | null>();

export async function geocodeLocation(text: string): Promise<{ lat: number; lng: number } | null> {
  const key = text.trim().toLowerCase();
  if (!key) return null;
  if (geoCache.has(key)) return geoCache.get(key)!;
  // Primary: Nominatim
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, { headers: HEADERS });
    if (res.ok) {
      const json = (await res.json()) as { lat?: string; lon?: string }[];
      if (json?.length && json[0].lat && json[0].lon) {
        const out = { lat: Number(json[0].lat), lng: Number(json[0].lon) };
        geoCache.set(key, out);
        return out;
      }
    }
  } catch {
    /* try Photon */
  }
  // Fallback: Photon (Komoot, OSM-based, no key)
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(text)}&limit=1`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) {
      geoCache.set(key, null);
      return null;
    }
    const json = (await res.json()) as { features?: { geometry?: { coordinates?: [number, number] } }[] };
    const coords = json.features?.[0]?.geometry?.coordinates;
    if (!coords || coords.length < 2) {
      geoCache.set(key, null);
      return null;
    }
    const out = { lat: Number(coords[1]), lng: Number(coords[0]) };
    geoCache.set(key, out);
    return out;
  } catch {
    geoCache.set(key, null);
    return null;
  }
}

export interface OsmPlace {
  name?: string;
  display_name: string;
  lat: string;
  lon: string;
  class: string;
  type: string;
  osm_type: string;
  osm_id: number;
  address?: Record<string, string>;
  extratags?: Record<string, string>;
}

export async function searchOsmPlaces(
  query: string,
  limit: number,
  viewbox?: { minLng: number; minLat: number; maxLng: number; maxLat: number }
): Promise<OsmPlace[]> {
  const params = new URLSearchParams({
    format: "jsonv2",
    extratags: "1",
    addressdetails: "1",
    limit: String(Math.min(Math.max(limit, 1), 50)),
    q: query,
  });
  if (viewbox) {
    params.set(
      "viewbox",
      `${viewbox.minLng},${viewbox.maxLat},${viewbox.maxLng},${viewbox.minLat}`
    );
  }
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: { ...HEADERS, "Accept-Language": "en" },
  });
  if (res.ok) return (await res.json()) as OsmPlace[];
  // Nominatim blocked/rate-limited → Photon fallback (mapped to OsmPlace shape)
  const photon = new URLSearchParams({
    q: query,
    limit: String(Math.min(Math.max(limit, 1), 50)),
  });
  if (viewbox) {
    photon.set("lat", String((viewbox.minLat + viewbox.maxLat) / 2));
    photon.set("lon", String((viewbox.minLng + viewbox.maxLng) / 2));
  }
  const pres = await fetch(`https://photon.komoot.io/api/?${photon.toString()}`, { headers: HEADERS });
  if (!pres.ok) throw new Error(`Place search failed (Nominatim HTTP ${res.status}, Photon HTTP ${pres.status})`);
  const pjson = (await pres.json()) as {
    features?: {
      geometry?: { coordinates?: [number, number] };
      properties?: Record<string, string | number | undefined>;
    }[];
  };
  const osmType = (t: string) => (t === "N" ? "node" : t === "W" ? "way" : "relation");
  return (pjson.features ?? []).map((f, i) => {
    const p = f.properties ?? {};
    const lng = f.geometry?.coordinates?.[0];
    const lat = f.geometry?.coordinates?.[1];
    const addr: Record<string, string> = {};
    for (const k of ["street", "housenumber", "suburb", "district", "city", "town", "village", "county", "state", "country", "countrycode", "postcode"]) {
      const v = p[k];
      if (typeof v === "string" && v) addr[k === "countrycode" ? "country_code" : k] = v;
    }
    const display = [p.name, p.street, p.suburb ?? p.district, p.city ?? p.town ?? p.village, p.state, p.country]
      .filter((x) => typeof x === "string" && x)
      .join(", ");
    return {
      name: typeof p.name === "string" ? p.name : undefined,
      display_name: display || query,
      lat: String(lat ?? ""),
      lon: String(lng ?? ""),
      class: "place",
      type: typeof p.osm_value === "string" ? p.osm_value : "yes",
      osm_type: osmType(typeof p.osm_type === "string" ? p.osm_type : "N"),
      osm_id: typeof p.osm_id === "number" ? p.osm_id : i,
      address: addr,
      extratags: {},
    } as OsmPlace;
  });
}
