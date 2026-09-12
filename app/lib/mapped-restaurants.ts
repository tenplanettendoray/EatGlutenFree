export type MappedRestaurant = { name: string; address: string; label: string; website: string; sourceUrl: string };

type Place = { osm_type?: string; osm_id?: number; display_name?: string; type?: string; namedetails?: { name?: string }; address?: Record<string, string | undefined>; extratags?: Record<string, string | undefined> };
const headers = { "User-Agent": "Gluten-FreeEat/1.0 (restaurant verification)", "Accept-Language": "en" };

function webUrl(value: unknown) {
  if (typeof value !== "string") return "";
  try { const url = new URL(value); return /^https?:$/.test(url.protocol) ? url.toString() : ""; } catch { return ""; }
}

export async function findMappedRestaurants(location: string, food: string): Promise<MappedRestaurant[]> {
  for (const query of [[food, "restaurant", location], ["restaurant", location]].map(parts => parts.filter(Boolean).join(" "))) {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    for (const [key, value] of Object.entries({ q: query, format: "jsonv2", addressdetails: "1", namedetails: "1", extratags: "1", limit: "20" })) url.searchParams.set(key, value);
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
      if (!response.ok) continue;
      const places = await response.json() as Place[];
      const results = places.flatMap(place => {
        if (!place.osm_type || !place.osm_id || !place.display_name || !/restaurant|fast_food|cafe|bar|pub|food_court/.test(place.type || "")) return [];
        const name = (place.namedetails?.name || place.address?.amenity || place.address?.shop || place.display_name.split(",")[0] || "").trim();
        if (!name) return [];
        return [{ name, address: place.display_name, label: place.address?.city || place.address?.town || place.address?.village || place.address?.suburb || location, website: webUrl(place.extratags?.website || place.extratags?.["contact:website"]), sourceUrl: `https://www.openstreetmap.org/${place.osm_type}/${place.osm_id}` }];
      }).filter((place, index, all) => all.findIndex(item => item.name.toLowerCase() === place.name.toLowerCase()) === index);
      if (results.length) return results.slice(0, 12);
    } catch { /* use broader query */ }
  }
  return [];
}
