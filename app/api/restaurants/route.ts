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
  const raw = tags.website || tags["contact:website"] || tags.url || tags["contact:url"];
  if (!raw) return undefined;
  try {
    const value = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : undefined;
  } catch { return undefined; }
}

function matchesFood(tags: Record<string, string>, food: string) {
  if (!food) return true;
  const aliases: Record<string, string[]> = {
    burger: ["burger", "hamburger"], burgers: ["burger", "hamburger"],
    pizza: ["pizza"], sushi: ["sushi", "japanese"], taco: ["taco", "mexican"], tacos: ["taco", "mexican"],
    chicken: ["chicken", "wings"], wings: ["wings", "chicken"], seafood: ["seafood", "fish"],
    sandwich: ["sandwich", "deli"], sandwiches: ["sandwich", "deli"], salad: ["salad", "healthy"],
    pasta: ["pasta", "italian"], barbecue: ["barbecue", "bbq"], bbq: ["barbecue", "bbq"],
  };
  const requested = food.toLowerCase().trim();
  const terms = aliases[requested] || requested.split(/\s+/).filter((term) => term.length > 1);
  const searchable = [tags.name, tags.cuisine, tags.description, tags.brand].filter(Boolean).join(" ").toLowerCase().replaceAll("_", " ");
  return terms.some((term) => searchable.includes(term));
}

function matchesOccasion(tags: Record<string, string>, occasion: string) {
  if (!occasion) return true;
  const amenity = tags.amenity || "";
  const searchable = [tags.name, tags.cuisine, tags.description, tags["brand"], tags["takeaway"]].filter(Boolean).join(" ").toLowerCase();
  if (occasion === "coffee") return amenity === "cafe" || /coffee|espresso|tea/.test(searchable);
  if (occasion === "breakfast") return amenity === "cafe" || /breakfast|brunch|bakery|bagel|pancake|waffle|coffee/.test(searchable);
  if (occasion === "lunch") return /restaurant|cafe|fast_food|food_court/.test(amenity);
  if (occasion === "dinner") return /restaurant|pub|bar/.test(amenity);
  if (occasion === "snacks") return /cafe|fast_food|ice_cream|food_court/.test(amenity) || /snack|bakery|donut|pastry|dessert/.test(searchable);
  if (occasion === "dessert") return /cafe|ice_cream/.test(amenity) || /dessert|cake|pastry|ice cream|gelato|donut|bakery/.test(searchable);
  return true;
}

async function fetchOverpass(query: string) {
  const endpoints = [
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
  ];
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { ...sourceHeaders, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(25000),
      });
      if (response.ok) return await response.json() as { elements: OsmElement[] };
    } catch {
      // Try the next public instance when one is busy or unavailable.
    }
  }
  throw new Error("Nearby restaurant data is temporarily busy. Please try again in a moment.");
}

export async function GET(request: NextRequest) {
  const location = request.nextUrl.searchParams.get("location")?.trim();
  const food = request.nextUrl.searchParams.get("food")?.trim().toLowerCase() || "";
  const occasion = request.nextUrl.searchParams.get("occasion")?.trim().toLowerCase() || "";
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

    const query = `[out:json][timeout:18];nwr["amenity"~"^(restaurant|cafe|fast_food|ice_cream|food_court|pub|bar)$"](around:4000,${latitude},${longitude});out center tags;`;
    const data = await fetchOverpass(query);

    const restaurants = data.elements.flatMap((element) => {
      const tags = element.tags || {};
      const lat = element.lat ?? element.center?.lat;
      const lon = element.lon ?? element.center?.lon;
      if (!tags.name || lat === undefined || lon === undefined || !matchesFood(tags, food) || !matchesOccasion(tags, occasion)) return [];
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