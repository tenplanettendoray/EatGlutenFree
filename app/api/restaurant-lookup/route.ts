import { NextRequest, NextResponse } from "next/server";

const sourceHeaders = {
  "User-Agent": "SafeServe-Restaurant-Lookup/0.1 (https://github.com/tenplanettendoray/Allergen-Reccomen)",
  "Accept-Language": "en,fr;q=0.9",
};

type NominatimPlace = {
  osm_type: string;
  osm_id: number;
  display_name: string;
  lat: string;
  lon: string;
  class?: string;
  type?: string;
  namedetails?: { name?: string };
  address?: {
    amenity?: string;
    shop?: string;
    road?: string;
    neighbourhood?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    country?: string;
  };
};

function clean(value: string | null) {
  return (value || "").trim().replace(/\s+/g, " ").slice(0, 120);
}

function displayName(place: NominatimPlace) {
  return place.namedetails?.name
    || place.address?.amenity
    || place.address?.shop
    || place.display_name.split(",")[0]?.trim()
    || "Restaurant";
}

function locationLabel(place: NominatimPlace) {
  return [
    place.address?.city || place.address?.town || place.address?.village || place.address?.suburb || place.address?.neighbourhood,
    place.address?.state,
    place.address?.country,
  ].filter(Boolean).slice(0, 2).join(", ");
}

export async function GET(request: NextRequest) {
  const query = clean(request.nextUrl.searchParams.get("q"));
  const location = clean(request.nextUrl.searchParams.get("location"));
  if (query.length < 2) return NextResponse.json({ restaurants: [] });

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", [query, "restaurant", location].filter(Boolean).join(" "));
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("namedetails", "1");
  url.searchParams.set("limit", "8");

  try {
    const response = await fetch(url, { headers: sourceHeaders, signal: AbortSignal.timeout(8000) });
    if (!response.ok) return NextResponse.json({ restaurants: [] });
    const places = await response.json() as NominatimPlace[];
    const restaurants = places
      .filter((place) => {
        const kind = `${place.class || ""} ${place.type || ""}`.toLowerCase();
        const name = displayName(place).toLowerCase();
        return /amenity|shop|tourism/.test(kind)
          && /restaurant|fast_food|cafe|bar|pub|food|bakery|deli|ice_cream/.test(kind)
          || name.includes(query.toLowerCase());
      })
      .map((place) => ({
        id: `${place.osm_type}-${place.osm_id}`,
        name: displayName(place),
        address: place.display_name,
        location: locationLabel(place),
        latitude: Number(place.lat),
        longitude: Number(place.lon),
        sourceUrl: `https://www.openstreetmap.org/${place.osm_type}/${place.osm_id}`,
      }))
      .filter((place, index, all) => all.findIndex((item) => item.name.toLowerCase() === place.name.toLowerCase() && item.location === place.location) === index)
      .slice(0, 6);

    return NextResponse.json({ restaurants });
  } catch {
    return NextResponse.json({ restaurants: [] });
  }
}
