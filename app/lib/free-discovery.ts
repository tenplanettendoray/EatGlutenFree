import type { NvidiaRestaurantLead } from "@/app/lib/nvidia-discovery";

type FreeDiscoveryInput = {
  location: string;
  latitude?: number;
  longitude?: number;
  food: string;
  occasion: string;
  priceRange?: string;
  allergies: string[];
  suggestedRestaurant?: string;
  suggestedRestaurants?: string[];
  avoidedRestaurants?: string[];
  nvidiaLeads?: NvidiaRestaurantLead[];
};

type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

type Candidate = {
  id: string;
  name: string;
  cuisine: string[];
  address: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  website: string;
  sourceUrl: string;
  dietary: Record<string, string>;
  tags: Record<string, string>;
  foodTagMatch: boolean;
  searchRank: number;
  nvidiaLead?: NvidiaRestaurantLead;
  suggestedMatch: boolean;
  suggestionWeight: number;
  avoidedMatch: boolean;
};

export type FreeRestaurant = {
  name: string;
  cuisine: string[];
  website: string;
  menuSourceUrl: string;
  qualitySourceUrl: string;
  evidenceSummary: string;
  popularitySummary: string;
  rankingReason: string;
  rating: number | null;
  reviewCount: number | null;
  dietary: Record<string, string>;
  distanceKm: number;
  evidenceTier: "official" | "community" | "partial";
  supportedAllergies: string[];
  missingAllergies: string[];
  locations: Array<{
    label: string;
    address: string;
    latitude: number;
    longitude: number;
    website: string;
    sourceUrl: string;
  }>;
};

const sourceHeaders = {
  "User-Agent": "SafeServe-Free-Research/0.2 (https://github.com/tenplanettendoray/Allergen-Reccomen)",
  "Accept-Language": "en,fr;q=0.9",
};

const foodAliases: Record<string, string[]> = {
  burger: ["burger", "hamburger"], burgers: ["burger", "hamburger"],
  pizza: ["pizza"], sushi: ["sushi", "japanese"], taco: ["taco", "tacos", "mexican"], tacos: ["taco", "tacos", "mexican"],
  chicken: ["chicken", "wings"], wings: ["wings", "chicken"], seafood: ["seafood", "fish"],
  sandwich: ["sandwich", "deli"], sandwiches: ["sandwich", "deli"], salad: ["salad"],
  pasta: ["pasta", "italian"], barbecue: ["barbecue", "bbq"], bbq: ["barbecue", "bbq"],
};

const allergyAliases: Record<string, string[]> = {
  gluten: ["gluten free", "gluten-free", "sans gluten", "sans-gluten"],
  wheat: ["wheat free", "wheat-free", "sans blé", "sans ble", "gluten free", "gluten-free", "sans gluten"],
  sesame: ["sesame free", "sesame-free", "sans sésame", "sans sesame"],
  peanuts: ["peanut free", "peanut-free", "sans arachide", "sans arachides"],
  "tree nuts": ["nut free", "nut-free", "sans fruits à coque", "sans fruits a coque"],
  milk: ["dairy free", "dairy-free", "sans lait", "sans lactose"],
  eggs: ["egg free", "egg-free", "sans œuf", "sans oeuf", "sans œufs", "sans oeufs"],
  soy: ["soy free", "soy-free", "soya free", "sans soja"],
  fish: ["fish free", "fish-free", "sans poisson"],
  shellfish: ["shellfish free", "shellfish-free", "sans crustacés", "sans crustaces"],
};

function termsForFood(food: string) {
  const normalized = food.toLowerCase().trim();
  return foodAliases[normalized] || normalized.split(/\s+/).filter((term) => term.length > 1);
}

function termsForAllergy(allergy: string) {
  const normalized = allergy.toLowerCase().trim();
  return allergyAliases[normalized] || [`${normalized} free`, `${normalized}-free`, `${normalized} allergen`];
}

function searchTermsForAllergy(allergy: string) {
  const terms = termsForAllergy(allergy);
  const localized = terms.find((term) => term.startsWith("sans "));
  return [...new Set([terms[0], localized || terms[1]].filter(Boolean))];
}

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
  if (!raw) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function normalizedName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\b(restaurants?|nyc|new york)\b/g, "").replace(/\s+/g, " ").trim();
}

const genericPreferenceTokens = new Set([
  "bar",
  "bistro",
  "brasserie",
  "burger",
  "burgers",
  "cafe",
  "coffee",
  "diner",
  "eatery",
  "food",
  "grill",
  "kitchen",
  "menu",
  "restaurant",
  "restaurants",
  "shop",
]);

function distinctiveNameTokens(value: string) {
  return normalizedName(value)
    .split(" ")
    .filter((token) => token.length >= 3 && !genericPreferenceTokens.has(token));
}

function normalizedBrandName(value: string) {
  if (/\bparis\s+new\s+york\b/i.test(value)) return "pny";
  const normalized = normalizedName(value);
  if (/^pny(\b|$)/.test(normalized)) return "pny";
  return normalized
    .replace(/\b(paris|marais|oberkampf|pigalle|sentier|faubourg|saint|germain|republique|republique|montmartre|bastille|chatelet|opera|halles|local branch)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function preferenceNameMatches(candidateName: string, preferenceName: string) {
  if (!candidateName || !preferenceName) return false;
  if (candidateName === preferenceName) return true;
  const candidateTokens = distinctiveNameTokens(candidateName);
  const preferenceTokens = distinctiveNameTokens(preferenceName);
  if (!candidateTokens.length || !preferenceTokens.length) return false;
  const candidateDistinctiveName = candidateTokens.join(" ");
  const preferenceDistinctiveName = preferenceTokens.join(" ");
  if (candidateDistinctiveName === preferenceDistinctiveName) return true;
  if (candidateDistinctiveName.length >= 4 && preferenceDistinctiveName.includes(candidateDistinctiveName) && preferenceTokens.length === 1) return true;
  if (preferenceDistinctiveName.length >= 4 && candidateDistinctiveName.includes(preferenceDistinctiveName)) return true;
  return preferenceTokens.every((token) => candidateTokens.includes(token))
    || (candidateTokens.length === 1 && preferenceTokens.includes(candidateTokens[0]));
}

function nvidiaLeadFor(name: string, leads: NvidiaRestaurantLead[]) {
  const normalized = normalizedName(name);
  const tokens = normalized.split(" ").filter((token) => token.length > 2);
  return leads.find((lead) => {
    const leadName = normalizedName(lead.name);
    const leadTokens = leadName.split(" ").filter((token) => token.length > 2);
    return leadName === normalized
      || (tokens.length > 1 && tokens.every((token) => leadName.includes(token)))
      || (leadTokens.length > 1 && leadTokens.every((token) => normalized.includes(token)));
  });
}

type PublicSearchHit = { title: string; url: string; description: string };

function decodeEntities(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

async function fetchPublicSearch(query: string): Promise<PublicSearchHit[]> {
  try {
    const url = new URL("https://html.duckduckgo.com/html/");
    url.searchParams.set("q", query);
    const response = await fetch(url, {
      headers: { ...sourceHeaders, "User-Agent": "Mozilla/5.0 (compatible; SafeServe-Free-Research/0.3)" },
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) return [];
    const html = (await response.text()).slice(0, 700000);
    const anchors = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)]
      .filter((match) => /\bresult__a\b/i.test(match[1]));
    return anchors.slice(0, 15).flatMap((match, index) => {
      const href = decodeEntities(match[1].match(/href\s*=\s*["']([^"']+)["']/i)?.[1] || "");
      let hitUrl = href;
      try {
        const redirect = new URL(href, "https://duckduckgo.com");
        hitUrl = redirect.searchParams.get("uddg") || redirect.toString();
      } catch {
        return [];
      }
      if (!isPublicWebsite(hitUrl)) return [];
      const nextIndex = anchors[index + 1]?.index ?? Math.min(html.length, (match.index || 0) + 4000);
      const afterAnchor = html.slice((match.index || 0) + match[0].length, nextIndex);
      const snippet = afterAnchor.match(/class\s*=\s*["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/a>/i)?.[1] || "";
      return [{
        title: readableText(match[2]).slice(0, 300),
        url: hitUrl,
        description: readableText(snippet).slice(0, 600),
      }];
    });
  } catch {
    return [];
  }
}

function searchRankFor(name: string, hits: PublicSearchHit[]) {
  const normalized = normalizedName(name);
  if (normalized.length < 4) return 0;
  const tokens = normalized.split(" ").filter((token) => token.length > 2);
  const index = hits.findIndex((hit) => {
    const searchable = normalizedName(`${hit.title} ${hit.description} ${hit.url}`);
    return searchable.includes(normalized) || (tokens.length > 1 && tokens.every((token) => searchable.includes(token)));
  });
  return index < 0 ? 0 : Math.max(1, 15 - index);
}

function likelyOfficialSearchUrl(candidateName: string, hits: PublicSearchHit[]) {
  const blockedHosts = /(^|\.)(bing|google|tripadvisor|thefork|yelp|facebook|instagram|tiktok|wikipedia|ubereats|deliveroo|doordash|atly|findmeglutenfree|glutenfreealchemist|wheatlesswanderlust|happyceliac|celiaquita|glutoapp|kollection-paris|mygfguide)\./i;
  const normalized = normalizedName(candidateName);
  const tokens = normalized.split(" ").filter((token) => token.length > 3 && !/^(paris|cafe|restaurant|burger|grill|food)$/.test(token));
  if (!tokens.length) return "";
  for (const hit of hits) {
    try {
      const url = new URL(hit.url);
      const title = normalizedName(hit.title);
      const host = normalizedName(url.hostname.replace(/^www\./, ""));
      const nameMatches = title.includes(normalized) && tokens.every((token) => host.includes(token));
      if (nameMatches && !blockedHosts.test(url.hostname) && isPublicWebsite(url.toString())) return url.toString();
    } catch {
      // Ignore malformed search results.
    }
  }
  return "";
}

function matchesFood(tags: Record<string, string>, food: string) {
  if (!food) return true;
  const searchable = [tags.name, tags.cuisine, tags.description, tags.brand].filter(Boolean).join(" ").toLowerCase().replaceAll("_", " ");
  return termsForFood(food).some((term) => searchable.includes(term));
}

function conflictsWithFood(tags: Record<string, string>, food: string) {
  const requested = food.toLowerCase().trim();
  const cuisine = (tags.cuisine || "").toLowerCase().replaceAll("_", " ");
  const searchable = [tags.name, tags.description, tags.brand].filter(Boolean).join(" ").toLowerCase().replaceAll("_", " ");
  if (!requested || !cuisine) return false;
  const explicitFoodMatch = termsForFood(food).some((term) => searchable.includes(term) || cuisine.includes(term));
  if (explicitFoodMatch) return false;
  if (/burgers?|hamburgers?/.test(requested)) return /\b(japanese|sushi|ramen|thai|vietnamese|korean|indian|chinese|seafood|ice cream|bakery|coffee|cafe)\b/.test(cuisine);
  if (/pizza/.test(requested)) return /\b(japanese|sushi|ramen|thai|vietnamese|korean|indian|chinese|burger|hamburger)\b/.test(cuisine);
  if (/sushi|japanese/.test(requested)) return /\b(burger|hamburger|pizza|mexican|taco|bbq|barbecue)\b/.test(cuisine);
  return false;
}

function matchesOccasion(tags: Record<string, string>, occasion: string) {
  if (!occasion) return true;
  const amenity = tags.amenity || "";
  const searchable = [tags.name, tags.cuisine, tags.description, tags.brand].filter(Boolean).join(" ").toLowerCase();
  if (occasion === "coffee") return amenity === "cafe" || /coffee|espresso|tea/.test(searchable);
  if (occasion === "breakfast") return amenity === "cafe" || /breakfast|brunch|bakery|bagel|pancake|waffle|coffee/.test(searchable);
  if (occasion === "lunch") return /restaurant|cafe|fast_food|food_court/.test(amenity);
  if (occasion === "dinner") return /restaurant|pub|bar/.test(amenity);
  if (occasion === "snacks") return /cafe|fast_food|ice_cream|food_court/.test(amenity) || /snack|bakery|donut|pastry|dessert/.test(searchable);
  if (occasion === "dessert") return /cafe|ice_cream/.test(amenity) || /dessert|cake|pastry|ice cream|gelato|donut|bakery/.test(searchable);
  return true;
}

function restaurantGroupKey(candidate: Candidate) {
  const normalizedBrand = normalizedBrandName([candidate.name, candidate.tags.brand, candidate.tags.operator, candidate.nvidiaLead?.name].filter(Boolean).join(" "));
  if (normalizedBrand === "pny") return "brand:pny";
  if (candidate.website) {
    try {
      const hostname = new URL(candidate.website).hostname.replace(/^www\./, "").toLowerCase();
      const sharedPlatforms = /(^|\.)(toasttab|square|clover|grubhub|seamless|doordash|ubereats|ordering)\./;
      if (!sharedPlatforms.test(hostname)) return `site:${hostname}`;
    } catch {
      // Fall back to the normalized restaurant name.
    }
  }
  const brand = normalizedName(candidate.tags.brand || candidate.tags.operator || "");
  if (brand) return `brand:${brand}`;
  if (normalizedBrand) return `name:${normalizedBrand}`;
  return `name:${normalizedName(candidate.name)}`;
}

function isPublicWebsite(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (!["http:", "https:"].includes(url.protocol)) return false;
    if (hostname === "localhost" || hostname.endsWith(".local") || hostname === "0.0.0.0" || hostname === "::1") return false;
    if (/^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

function isSuspiciousRestaurantWebsite(text: string) {
  return /\b(casino|gambling|sportsbook|roulette|jackpot|slot machines?|online betting|paris sportifs?|jeux d['’]argent)\b/i.test(text);
}

function pageIdentifiesRestaurant(page: { url: string; text: string }, restaurantName: string) {
  if (isSuspiciousRestaurantWebsite(page.text)) return false;
  const name = normalizedName(restaurantName);
  if (!name) return false;
  const text = normalizedName(page.text);
  const tokens = name.split(" ").filter((token) => token.length > 3 && !/^(cafe|restaurant|paris|burger|grill|food)$/.test(token));
  const textMatches = text.includes(name) || (tokens.length > 1 && tokens.filter((token) => text.includes(token)).length >= Math.min(2, tokens.length));
  try {
    const host = normalizedName(new URL(page.url).hostname.replace(/^www\./, ""));
    const hostMatches = tokens.length > 0 && tokens.some((token) => host.includes(token));
    return textMatches || hostMatches;
  } catch {
    return false;
  }
}

function readableText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .slice(0, 180000);
}

function researchLinks(html: string, baseUrl: string) {
  const links: string[] = [];
  const base = new URL(baseUrl);
  const pattern = /<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    const label = readableText(match[2]).slice(0, 180);
    const href = match[1];
    if (!/menu|carte|allerg|diet|gluten|sans[- _]?gluten|nutrition|food|plat|burger|pizza|sushi|taco|sandwich/i.test(`${label} ${href}`)) continue;
    try {
      const url = new URL(href, base);
      if (url.hostname.replace(/^www\./, "") !== base.hostname.replace(/^www\./, "") || !isPublicWebsite(url.toString())) continue;
      if (!links.includes(url.toString())) links.push(url.toString());
    } catch {
      // Ignore malformed website links.
    }
    if (links.length >= 16) break;
  }
  return links.sort((a, b) => Number(/allerg|sans[- _]?gluten|gluten|diet|nutrition/i.test(b)) * 5 + Number(/menu|carte/i.test(b)) * 4 + Number(/burger|pizza|sushi|taco|sandwich|plat/i.test(b)) * 2 - Number(/allerg|sans[- _]?gluten|gluten|diet|nutrition/i.test(a)) * 5 - Number(/menu|carte/i.test(a)) * 4 - Number(/burger|pizza|sushi|taco|sandwich|plat/i.test(a)) * 2);
}

async function fetchPublicPage(url: string) {
  if (!isPublicWebsite(url)) return null;
  try {
    const response = await fetch(url, {
      headers: sourceHeaders,
      redirect: "follow",
      signal: AbortSignal.timeout(6500),
    });
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !contentType.includes("text/html")) return null;
    const html = (await response.text()).slice(0, 900000);
    return { url: response.url, html, text: readableText(html) };
  } catch {
    return null;
  }
}

async function researchCandidate(candidate: Candidate, food: string, allergies: string[]) {
  const foodTerms = termsForFood(food);
  const fetchedHomepage = candidate.website ? await fetchPublicPage(candidate.website) : null;
  const homepage = fetchedHomepage && pageIdentifiesRestaurant(fetchedHomepage, candidate.name) ? fetchedHomepage : null;
  const websiteRejected = Boolean(fetchedHomepage && !homepage);
  const pages = homepage ? [homepage] : [];
  if (homepage) {
    const links = researchLinks(homepage.html, homepage.url).slice(0, 4);
    const extraPages = await Promise.all(links.map(fetchPublicPage));
    pages.push(...extraPages.filter((page): page is NonNullable<typeof page> => Boolean(page) && pageIdentifiesRestaurant(page as NonNullable<typeof page>, candidate.name)));
  }
  const safeWebsite = homepage?.url || "";

  const foundFoodOnWebsite = !foodTerms.length || pages.some((page) => foodTerms.some((term) => page.text.includes(term)));
  const websiteEvidence = allergies.filter((allergy) => pages.some((page) => termsForAllergy(allergy).some((term) => page.text.includes(term.toLowerCase()))));
  let bestPage = pages[0] || null;
  let bestScore = -1;
  for (const page of pages) {
    const pageFood = !foodTerms.length || foodTerms.some((term) => page.text.includes(term));
    const pageAllergies = allergies.filter((allergy) => termsForAllergy(allergy).some((term) => page.text.includes(term.toLowerCase())));
    const pageScore = Number(pageFood) * 4 + pageAllergies.length * 5 + Number(/menu|carte|allerg|diet|gluten|nutrition/i.test(page.url)) * 2;
    if (pageScore > bestScore) {
      bestPage = page;
      bestScore = pageScore;
    }
  }

  const dietaryMatches = allergies.filter((allergy) => {
    const key = allergy.toLowerCase() === "gluten" || allergy.toLowerCase() === "wheat" ? "gluten_free" : `${allergy.toLowerCase().replace(/\s+/g, "_")}_free`;
    return candidate.dietary[key] === "yes";
  });
  const allEvidence = [...new Set([...websiteEvidence, ...dietaryMatches])];
  const missingAllergies = allergies.filter((allergy) => !allEvidence.some((found) => found.toLowerCase() === allergy.toLowerCase()));
  const evidenceSource = bestPage?.url || safeWebsite || candidate.sourceUrl;
  const hasAllOfficialEvidence = !allergies.length || allergies.every((allergy) => websiteEvidence.some((found) => found.toLowerCase() === allergy.toLowerCase()));
  const hasAllEvidence = !allergies.length || missingAllergies.length === 0;
  const evidenceTier: FreeRestaurant["evidenceTier"] = hasAllOfficialEvidence ? "official" : hasAllEvidence ? "community" : "partial";
  const evidenceSummary = evidenceTier === "partial" && allEvidence.length
    ? `Published or community-map evidence supports ${allEvidence.join(", ")}, but no explicit evidence was found for ${missingAllergies.join(", ")}. This is not a complete allergy match; contact the restaurant before ordering.`
    : evidenceTier === "official" && websiteEvidence.length
    ? `The restaurant's website or menu explicitly mentions ${websiteEvidence.join(", ")} accommodation${foundFoodOnWebsite && food ? ` alongside ${food}` : ""}. Ingredients and cross-contact still require confirmation with the restaurant.`
    : websiteEvidence.length && dietaryMatches.length
      ? `The restaurant's website mentions ${websiteEvidence.join(", ")}; OpenStreetMap community data additionally marks ${dietaryMatches.join(", ")} options. ${missingAllergies.length ? `No evidence for ${missingAllergies.join(", ")} was found. ` : ""}Confirm every request directly.`
    : dietaryMatches.length
      ? `OpenStreetMap community data marks ${dietaryMatches.join(", ")} options, but the restaurant's website did not confirm them. This is a lower-confidence lead; contact the restaurant before ordering.`
    : `The free agent found no explicit published evidence for ${allergies.length ? allergies.join(", ") : "the requested dietary needs"}. Review the menu and contact the restaurant directly.`;
  const foodMatched = candidate.foodTagMatch || foundFoodOnWebsite;
  const lowerName = candidate.name.trim().toLowerCase();
  const chainCautionPenalty = /^(five guys|mcdonald'?s|burger king|quick|shake shack)$/i.test(lowerName) && evidenceTier !== "official" ? 30 : 0;
  const score = Number(Boolean(safeWebsite)) * 3
    + Number(foundFoodOnWebsite) * 8
    + websiteEvidence.length * 14
    + dietaryMatches.length * 3
    + candidate.searchRank * 1.5
    + Number(allergies.length > 0 && websiteEvidence.length === allergies.length) * 12
    - chainCautionPenalty
    - candidate.distanceKm * 0.25;

  return { candidate, score, evidenceSource, evidenceSummary, allEvidence, websiteEvidence, foodMatched, evidenceTier, safeWebsite, websiteRejected };
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
        signal: AbortSignal.timeout(45000),
      });
      if (response.ok) return await response.json() as { elements: OsmElement[] };
    } catch {
      // Try another public Overpass instance.
    }
  }
  throw new Error("Free restaurant data is temporarily busy. Please try again in a moment.");
}

export async function discoverFreeRestaurants(input: FreeDiscoveryInput) {
  let latitude = input.latitude;
  let longitude = input.longitude;
  let locationLabel = input.location || "your location";

  // Prefer the typed location text when it exists so city searches do not stay
  // anchored to an older manually selected globe pin.
  if (input.location) {
    const geocodeUrl = new URL("https://nominatim.openstreetmap.org/search");
    geocodeUrl.searchParams.set("q", input.location);
    geocodeUrl.searchParams.set("format", "jsonv2");
    geocodeUrl.searchParams.set("limit", "1");
    const response = await fetch(geocodeUrl, { headers: sourceHeaders, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error("The free location service is temporarily unavailable.");
    const places = await response.json() as Array<{ lat: string; lon: string; display_name: string }>;
    if (!places.length) throw new Error("We could not find that location. Try a city and state or ZIP code.");
    latitude = Number(places[0].lat);
    longitude = Number(places[0].lon);
    locationLabel = places[0].display_name.split(",").slice(0, 2).join(",");
  } else if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("Enter a location to search.");
  }
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error("We could not resolve that location.");

  const nvidiaLeads = input.nvidiaLeads || [];
  const suggestedRestaurants = (input.suggestedRestaurants?.length ? input.suggestedRestaurants : input.suggestedRestaurant ? [input.suggestedRestaurant] : [])
    .map((suggestion) => suggestion.trim())
    .filter(Boolean);
  const suggestedNameWeights = suggestedRestaurants.reduce((map, suggestion) => {
    const name = normalizedName(suggestion);
    if (name) map.set(name, (map.get(name) || 0) + 1);
    return map;
  }, new Map<string, number>());
  const suggestedNames = [...suggestedNameWeights.keys()];
  const avoidedRestaurants = (input.avoidedRestaurants || [])
    .map((restaurant) => restaurant.trim())
    .filter(Boolean);
  const avoidedNames = avoidedRestaurants.map(normalizedName).filter(Boolean);
  const agentQuery = [
    locationLabel,
    input.occasion,
    input.food,
    input.priceRange,
    ...suggestedRestaurants,
    ...input.allergies.flatMap(searchTermsForAllergy),
    "restaurant menu",
  ].filter(Boolean).join(" ");
  const query = `[out:json][timeout:20];nwr["amenity"~"^(restaurant|cafe|fast_food|ice_cream|food_court|pub|bar)$"](around:6500,${latitude},${longitude});out center tags;`;
  const [data, searchHits] = await Promise.all([fetchOverpass(query), fetchPublicSearch(agentQuery)]);
  const candidates = data.elements.flatMap((element) => {
    const tags = element.tags || {};
    const lat = element.lat ?? element.center?.lat;
    const lon = element.lon ?? element.center?.lon;
    if (!tags.name || lat === undefined || lon === undefined || !matchesOccasion(tags, input.occasion)) return [];
    const dietary = Object.fromEntries(Object.entries(tags).filter(([key]) => key.startsWith("diet:")).map(([key, value]) => [key.replace("diet:", ""), value]));
    const foodTagMatch = matchesFood(tags, input.food);
    const foodConflict = conflictsWithFood(tags, input.food);
    const searchRank = searchRankFor(tags.name, searchHits);
    const nvidiaLead = nvidiaLeadFor(tags.name, nvidiaLeads);
    const candidateName = normalizedName(tags.name);
    const suggestionWeight = suggestedNames.reduce((score, suggestedName) => preferenceNameMatches(candidateName, suggestedName) ? score + (suggestedNameWeights.get(suggestedName) || 1) : score, 0);
    const suggestedMatch = suggestionWeight > 0;
    const avoidedMatch = avoidedNames.some((avoidedName) => preferenceNameMatches(candidateName, avoidedName));
    if (avoidedMatch && !suggestedMatch) return [];
    if (input.food && foodConflict) return [];
    const mappedWebsite = normalizedWebsite(tags);
    const allergyTagMatch = input.allergies.some((allergy) => {
      const key = allergy.toLowerCase() === "gluten" || allergy.toLowerCase() === "wheat" ? "gluten_free" : `${allergy.toLowerCase().replace(/\s+/g, "_")}_free`;
      return dietary[key] === "yes";
    });
    if (input.food && !foodTagMatch && !allergyTagMatch && !searchRank && !nvidiaLead && !suggestedMatch) return [];
    const sourceUrl = `https://www.openstreetmap.org/${element.type}/${element.id}`;
    return [{
      id: `${element.type}-${element.id}`,
      name: tags.name,
      cuisine: (tags.cuisine || "").split(";").filter(Boolean).map((item) => item.replaceAll("_", " ")),
      address: addressFrom(tags),
      latitude: lat,
      longitude: lon,
      distanceKm: distanceKm(latitude as number, longitude as number, lat, lon),
      website: mappedWebsite || nvidiaLead?.website || likelyOfficialSearchUrl(tags.name, searchHits),
      sourceUrl,
      dietary,
      tags,
      foodTagMatch,
      searchRank,
      nvidiaLead,
      suggestedMatch,
      suggestionWeight,
      avoidedMatch,
    } satisfies Candidate];
  });

  const byResearchPriority = (a: Candidate, b: Candidate) => {
      const scoreA = Math.min(a.suggestionWeight, 4) * 8 + Number(Boolean(a.nvidiaLead)) * 80 + (a.nvidiaLead ? 13 - a.nvidiaLead.rank : 0) * 6 + a.searchRank * 2 + Number(a.foodTagMatch) * 8 + Object.keys(a.dietary).length * 4 + Number(Boolean(a.website)) * 3 - a.distanceKm * 0.2;
      const scoreB = Math.min(b.suggestionWeight, 4) * 8 + Number(Boolean(b.nvidiaLead)) * 80 + (b.nvidiaLead ? 13 - b.nvidiaLead.rank : 0) * 6 + b.searchRank * 2 + Number(b.foodTagMatch) * 8 + Object.keys(b.dietary).length * 4 + Number(Boolean(b.website)) * 3 - b.distanceKm * 0.2;
      return scoreB - scoreA;
  };
  const nvidiaCandidates = candidates.filter((candidate) => candidate.nvidiaLead).sort(byResearchPriority).slice(0, 20);
  const searchCandidates = candidates.filter((candidate) => candidate.searchRank > 0).sort(byResearchPriority).slice(0, 12);
  const foodWebsiteCandidates = candidates
    .filter((candidate) => candidate.foodTagMatch && candidate.website)
    .sort((a, b) => {
      const directNameA = Number(termsForFood(input.food).some((term) => a.name.toLowerCase().includes(term)));
      const directNameB = Number(termsForFood(input.food).some((term) => b.name.toLowerCase().includes(term)));
      return directNameB - directNameA || a.distanceKm - b.distanceKm;
    })
    .slice(0, 36);
  const dietaryCandidates = candidates
    .filter((candidate) => Object.keys(candidate.dietary).length > 0)
    .sort(byResearchPriority)
    .slice(0, 10);
  const suggestedCandidates = candidates
    .filter((candidate) => candidate.suggestedMatch)
    .sort(byResearchPriority)
    .slice(0, 12);
  const preliminary = [...new Map([...suggestedCandidates, ...nvidiaCandidates, ...searchCandidates, ...foodWebsiteCandidates, ...dietaryCandidates].map((candidate) => [candidate.id, candidate])).values()].slice(0, 48);
  const researched = await Promise.all(preliminary.map((candidate) => researchCandidate(candidate, input.food, input.allergies)));
  const exactlyQualifies = (result: (typeof researched)[number]) => !result.websiteRejected && result.foodMatched
    && (!input.allergies.length || input.allergies.every((allergy) => result.allEvidence.some((found) => found.toLowerCase() === allergy.toLowerCase())));
  const tierRank: Record<FreeRestaurant["evidenceTier"], number> = { official: 3, community: 2, partial: 1 };
  const byFinalRank = (a: (typeof researched)[number], b: (typeof researched)[number]) =>
    Number(Boolean(b.candidate.nvidiaLead)) - Number(Boolean(a.candidate.nvidiaLead))
    || (a.candidate.nvidiaLead?.rank || 99) - (b.candidate.nvidiaLead?.rank || 99)
    || tierRank[b.evidenceTier] - tierRank[a.evidenceTier]
    || Math.min(b.candidate.suggestionWeight, 4) - Math.min(a.candidate.suggestionWeight, 4)
    || b.score - a.score;
  let qualified = researched
    .filter(exactlyQualifies)
    .sort(byFinalRank);

  const researchedIds = new Set(researched.map((result) => result.candidate.id));
  const secondaryCandidates = candidates
    .filter((candidate) => candidate.website && !researchedIds.has(candidate.id))
    .sort((a, b) => Number(b.searchRank > 0) - Number(a.searchRank > 0) || byResearchPriority(a, b) || a.distanceKm - b.distanceKm)
    .slice(0, 48);
  const distinctQualifiedCount = () => new Set(qualified.map((result) => restaurantGroupKey(result.candidate))).size;
  for (let start = 0; start < secondaryCandidates.length && distinctQualifiedCount() < 3; start += 12) {
    const batch = secondaryCandidates.slice(start, start + 12);
    const batchResearch = await Promise.all(batch.map((candidate) => researchCandidate(candidate, input.food, input.allergies)));
    researched.push(...batchResearch);
    qualified = [...new Map(researched.filter(exactlyQualifies).map((result) => [result.candidate.id, result])).values()]
      .sort(byFinalRank);

  if (distinctQualifiedCount() < 3 && input.allergies.length) {
    // Keep the results page useful when public menus do not publish enough
    // allergy detail. These remain explicitly marked as partial research leads
    // and rank below every result with actual allergy evidence.
    const partialMatches = researched.filter((result) => {
      if (result.websiteRejected || !result.foodMatched) return false;
      if (result.allEvidence.length === 0) return false;
      const lowerName = result.candidate.name.trim().toLowerCase();
      if (/^(wendy'?s|mcdonald'?s|burger king|checkers|rally'?s|sonic|jack in the box|hardee'?s|carl'?s jr)\b/i.test(lowerName)
        && result.evidenceTier !== "official") return false;
      return true;
    });
    qualified = [...new Map([...qualified, ...partialMatches].map((result) => [result.candidate.id, result])).values()]
      .sort((a, b) => tierRank[b.evidenceTier] - tierRank[a.evidenceTier]
        || b.allEvidence.length - a.allEvidence.length
        || b.score - a.score);
  }
  }

  const grouped = new Map<string, FreeRestaurant>();
  for (const result of qualified) {
    const candidate = { ...result.candidate, website: result.safeWebsite };
    const key = restaurantGroupKey(candidate);
    const location = {
      label: candidate.tags["addr:suburb"] || candidate.tags["addr:neighbourhood"] || candidate.tags["addr:street"] || "Local branch",
      address: candidate.address || "Address details unavailable",
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      website: candidate.website || candidate.sourceUrl,
      sourceUrl: candidate.sourceUrl,
    };
    const existing = grouped.get(key);
    if (existing) {
      if (!existing.locations.some((item) => normalizedName(item.address) === normalizedName(location.address))) existing.locations.push(location);
      const candidateBrand = normalizedBrandName(candidate.name);
      const existingBrand = normalizedBrandName(existing.name);
      if (candidateBrand && candidateBrand === existingBrand && candidateBrand.length <= 5) existing.name = candidateBrand.toUpperCase();
      else if (candidate.name.length < existing.name.length) existing.name = candidate.name;
      existing.cuisine = [...new Set([...existing.cuisine, ...candidate.cuisine])].slice(0, 6);
      existing.website = existing.website.startsWith("http") ? existing.website : candidate.website || existing.website;
      existing.distanceKm = Math.min(existing.distanceKm, candidate.distanceKm);
      continue;
    }
    grouped.set(key, {
      name: candidate.name,
      cuisine: candidate.cuisine,
      website: candidate.website || candidate.sourceUrl,
      menuSourceUrl: result.evidenceSource,
      qualitySourceUrl: candidate.nvidiaLead?.qualitySourceUrl || candidate.sourceUrl,
      evidenceSummary: result.evidenceSummary,
      popularitySummary: candidate.nvidiaLead?.popularitySummary || "Current ratings and review counts were not supported by the AI-retrieved web sources for this fallback result.",
      rankingReason: result.evidenceTier === "partial"
        ? result.evidenceSummary
        : candidate.nvidiaLead?.rankingReason || (candidate.suggestedMatch
          ? `Community suggestions gave this a modest boost after the same food relevance, allergy evidence, website detail, and distance checks as other results.`
          : result.evidenceTier === "official"
            ? `Ranked using the restaurant's published dietary language, public search prominence, food relevance, website detail, and distance.`
            : `Included to complete the minimum-three research set because community map data matches every requested diet. Restaurant confirmation is required.`),
      rating: candidate.nvidiaLead?.rating ?? null,
      reviewCount: candidate.nvidiaLead?.reviewCount ?? null,
      dietary: candidate.dietary,
      distanceKm: candidate.distanceKm,
      evidenceTier: result.evidenceTier,
      supportedAllergies: result.allEvidence,
      missingAllergies: input.allergies.filter((allergy) => !result.allEvidence.some((found) => found.toLowerCase() === allergy.toLowerCase())),
      locations: [location],
    });
    if (grouped.size >= 10) break;
  }

  return { locationLabel, restaurants: [...grouped.values()], query: agentQuery };
}

