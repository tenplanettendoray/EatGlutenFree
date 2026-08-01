import { NextRequest, NextResponse } from "next/server";

type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

const sourceHeaders = {
  "User-Agent": "ClearPlate-Restaurant-Research/0.1 (https://github.com/tenplanettendoray/Allergen-Reccomen)",
  "Accept-Language": "en",
};

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radius = 6371;
  const toRadians = (value: number) => value * Math.PI / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function addressFrom(tags: Record<string, string>) {
  const street = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
  const place = [tags["addr:city"], tags["addr:state"], tags["addr:postcode"]].filter(Boolean).join(", ");
  return [street, place].filter(Boolean).join(" · ");
}

function normalizedWebsite(tags: Record<string, string>) {
  const raw = tags.website || tags["contact:website"];
  if (!raw) return undefined;
  try {
    const value = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : undefined;
  } catch { return undefined; }
}

export async function GET(request: NextRequest) {
  const location = request.nextUrl.searchParams.get("location")?.trim();
  let latitude = Number(request.nextUrl.searchParams.get("lat"));
  let longitude = Number(request.nextUrl.searchParams.get("lon"));
  let locationLabel = location || "your location";

  try {
    if (!request.nextUrl.searchParams.has("lat") || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      if (!location) return NextResponse.json({ error: "Enter a location to search." }, { status: 400 });
      const geocodeUrl = new URL("https://nominatim.openstreetmap.org/search");
      geocodeUrl.searchParams.set("q", location);
      geocodeUrl.searchParams.set("format", "jsonv2");
      geocodeUrl.searchParams.set("limit", "1");
      const geocodeResponse = await fetch(geocodeUrl, { headers: sourceHeaders, signal: AbortSignal.timeout(9000) });
      if (!geocodeResponse.ok) throw new Error("The location service is temporarily unavailable.");
      const places = await geocodeResponse.json() as Array<{ lat: string; lon: string; display_name: string }>;
      if (!places.length) return NextResponse.json({ error: "We could not find that location. Try a city and state or ZIP code." }, { status: 404 });
      latitude = Number(places[0].lat);
      longitude = Number(places[0].lon);
      locationLabel = places[0].display_name.split(",").slice(0, 2).join(",");
    }

    const query = `[out:json][timeout:18];(nwr["amenity"="restaurant"](around:5000,${latitude},${longitude});nwr["amenity"="cafe"](around:5000,${latitude},${longitude}););out center tags;`;
    const overpassResponse = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { ...sourceHeaders, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ data: query }),
      signal: AbortSignal.timeout(20000),
    });
    if (!overpassResponse.ok) throw new Error("Nearby restaurant data is temporarily busy. Please try again in a moment.");
    const data = await overpassResponse.json() as { elements: OsmElement[] };

    const restaurants = data.elements.flatMap((element) => {
      const tags = element.tags || {};
      const lat = element.lat ?? element.center?.lat;
      const lon = element.lon ?? element.center?.lon;
      if (!tags.name || lat === undefined || lon === undefined) return [];
      const dietary = Object.fromEntries(Object.entries(tags).filter(([key]) => key.startsWith("diet:")).map(([key, value]) => [key.replace("diet:", ""), value]));
      return [{
        id: `${element.type}-${element.id}`,
        name: tags.name,
        cuisine: (tags.cuisine || "").split(";").filter(Boolean).map((item) => item.replaceAll("_", " ")),
        address: addressFrom(tags),
        distanceKm: distanceKm(latitude, longitude, lat, lon),
        website: normalizedWebsite(tags),
        phone: tags.phone || tags["contact:phone"],
        openingHours: tags.opening_hours,
        dietary,
        latitude: lat,
        longitude: lon,
      }];
    }).sort((a, b) => {
      const detailDifference = Number(Boolean(b.website)) + Object.keys(b.dietary).length - Number(Boolean(a.website)) - Object.keys(a.dietary).length;
      return detailDifference || a.distanceKm - b.distanceKm;
    }).slice(0, 18);

    return NextResponse.json({ location: locationLabel, restaurants }, { headers: { "Cache-Control": "public, max-age=300, s-maxage=1800" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Restaurant search failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}