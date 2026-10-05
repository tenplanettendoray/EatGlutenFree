import type { AiDiscoveredRestaurant } from "./ai-discovery";
import { fetchPublicPage, htmlText, normalize, officialUrl } from "./public-web";
import { searchRestaurantWebsites, mentionsLocation } from "./restaurant-web-search";
import { readOnlineRating } from "./restaurant-reputation";

type Page = { url: string; html: string };
type Input = { location: string; food: string; allergies: string[] };

function brandWords(name: string) {
  // Models often append a branch or cuisine after a spaced dash. The branch
  // remains in locations; the brand's home page need not repeat that suffix.
  return normalize(name.split(/\s[-–—|]\s/)[0]).split(" ").filter(word => !/^(restaurant|ristorante|pizzeria|osteria|trattoria|cafe|bar|bistro|the|le|la|les|de|di|da|du|del|della|dello|il|lo|l|and|et|gluten|free|senza|glutine)$/.test(word));
}

export function matchesBusinessDomain(url: string, name: string) {
  const host = new URL(url).hostname.replace(/^www\./, "").split(".").slice(0, -1).join("");
  const words = brandWords(name);
  // This is additional ownership evidence, never a substitute for reading the
  // page. A guide may title its review with the business's exact name.
  return Boolean(words[0]?.length >= 4 && host.includes(words[0]))
    || (words.slice(0, 2).join("").length >= 5 && host.includes(words.slice(0, 2).join("")))
    || (words.join("").length >= 3 && host.includes(words.join("")));
}

function sameSite(url: string, home: string) {
  const base = new URL(home).hostname.replace(/^www\./, "");
  const host = new URL(url).hostname.replace(/^www\./, "");
  return host === base || host.endsWith(`.${base}`);
}

export function matchesBusiness(page: Page, name: string) {
  const title = [...page.html.matchAll(/<(?:title|h1)\b[^>]*>([\s\S]*?)<\/(?:title|h1)>/gi)].map(match => htmlText(match[1])).join(" ");
  const metadata = [...page.html.matchAll(/<meta\b[^>]*(?:property|name)=["'](?:og:site_name|og:title)["'][^>]*content=["']([^"']+)["']/gi)].map(match => match[1]).join(" ");
  const identity = normalize(`${title} ${metadata}`).split(" ");
  const words = brandWords(name);
  const text = normalize(htmlText(page.html));
  if (/domain (?:is )?for sale|buy this domain|domain expired|not (?:the |an? )?official website|unofficial website/.test(text)) return false;
  return words.length > 0 && (words.every(word => identity.includes(word)) || identity.includes(words.join("")))
    && /restaurant|ristorante|osteria|trattoria|menu|cuisine|food|dining|cafe|bistro|burger|pizza|cucina|bakery|pasta|restaurante/.test(text);
}

function menuLinks(page: Page) {
  const links = [...new Set([...page.html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .filter(match => /menu|menù|allerg|gluten|senza|sans|faq|carte|carta|speisekarte|location|contact|adresse|restaurants/i.test(`${match[1]} ${htmlText(match[2])}`))
    .map(match => {
      try {
        const url = officialUrl(new URL(match[1].replace(/&amp;/g, "&"), page.url).href);
        return url && sameSite(url, page.url) && !/\.(pdf|png|jpe?g)(?:\?|$)/i.test(url) ? url : "";
      } catch { return ""; }
    }).filter(url => url && url !== page.url))];
  // Navigation order often puts several menu variants before the allergy
  // information. Reserve a location page and read the most useful evidence.
  const location = links.find(url => /location|contact|adresse|restaurants/i.test(url));
  const priority = (url: string) => /allerg|gluten|senza|sans|faq/i.test(url) ? 3 : /menu|carte|carta|speisekarte/i.test(url) ? 2 : 0;
  links.sort((a, b) => priority(b) - priority(a));
  return [...new Set([...(location ? [location] : []), ...links])].slice(0, 4);
}

export function menuEvidence(pages: Page[], input: Input) {
  const evidence: NonNullable<AiDiscoveredRestaurant["allergenEvidence"]> = [];
  for (const allergy of input.allergies) {
    const key = normalize(allergy);
    // Wheat allergy is distinct from gluten intolerance; do not equate them.
    const pattern = /^(gluten|gf|gluten free)$/.test(key)
      ? /gluten[-\s]*free|sans gluten|senza glutine|sin gluten|glutenvrij|glutenfrei/gi
      : new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[-\\s]+free\\b`, "gi");
    for (const page of pages) {
      const text = htmlText(page.html);
      for (const match of text.matchAll(pattern)) {
        const before = text.slice(Math.max(0, match.index! - 90), match.index);
        const after = text.slice(match.index! + match[0].length, match.index! + match[0].length + 100);
        if (/\b(no|not|cannot|can't|don't|doesn't|do not|does not|non|pas|kein|geen|unavailable)\b[^.!?;]{0,75}$/i.test(before)
          || /^\s*(?:options?|meals?|food|pizza|buns?)?\s*(?:is|are)?\s*(?:not available|unavailable|not offered)/i.test(after)) continue;
        const context = `${before} ${match[0]} ${after}`;
        const dedicated = /(?:100\s*%|entirely|completely|fully|tutto|tutta|interamente|dedicated)\s*(?:\w+\s+){0,3}(?:gluten[-\s]*free|senza glutine)|(?:entire|whole) menu.{0,50}gluten[-\s]*free/i.test(context);
        if (/burger/i.test(input.food) && !dedicated && !/(?:gluten[-\s]*free\s+(?:\w+\s+){0,2}(?:buns?|burgers?)|(?:pains?|burgers?).{0,25}sans gluten)/i.test(context)) continue;
        if (/pizza/i.test(input.food) && !dedicated && !/(?:gluten[-\s]*free|senza glutine|sans gluten).{0,25}pizza|pizza.{0,25}(?:gluten[-\s]*free|senza glutine|sans gluten)/i.test(context)) continue;
        evidence.push({ allergy, quote: context.trim().replace(/\s+/g, " "), url: page.url });
        break;
      }
      if (evidence.some(item => item.allergy === allergy)) break;
    }
  }
  return evidence;
}

/** Keep uncertainty in the results, but never publish an unchecked model URL. */
export async function verifyDiscoveredRestaurant(restaurant: AiDiscoveredRestaurant, input: Input, fetchPage = fetchPublicPage): Promise<AiDiscoveredRestaurant> {
  const sourceUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${restaurant.name} ${input.location}`)}`;
  const pending: AiDiscoveredRestaurant = {
    ...restaurant, website: "", websiteStatus: restaurant.website ? "unverified" : "missing", locationConfirmed: false, foodConfirmed: false,
    cuisine: restaurant.cuisine.filter(tag => !/free|senza|sans|glutenvrij|glutenfrei|dedicated|celiac|coeliac|allerg/i.test(tag)),
    rating: null, reviewCount: null, confidence: "weak", evidenceRank: 1,
    menuSourceUrl: "", qualitySourceUrl: sourceUrl, supportedAllergies: [], missingAllergies: [...input.allergies], allergenEvidence: [], dedicatedGlutenFree: false,
    evidenceSummary: "AI-suggested restaurant; current menu and allergy accommodation are unconfirmed. Confirm ingredients and cross-contact with staff.",
    popularitySummary: "AI discovery order; no independently verified review score.",
    rankingReason: "Potential match retained while details need confirmation.",
    locations: [{ label: input.location, address: input.location, website: "", sourceUrl }],
  };
  try {
    const url = officialUrl(restaurant.website);
    if (!url || !matchesBusinessDomain(url, restaurant.name)) return pending;
    const home = await fetchPage(url);
    if (!home || !officialUrl(home.url) || !matchesBusinessDomain(home.url, restaurant.name) || !matchesBusiness(home, restaurant.name)) return pending;
    const pages = [home];
    const links = menuLinks(home);
    const linked = await Promise.allSettled(links.map(link => fetchPage(link)));
    for (const result of linked) if (result.status === "fulfilled" && result.value && sameSite(result.value.url, home.url)) pages.push(result.value);
    // Some sites use /menus as an index of branch menus, with no dishes on
    // the index itself. Follow at most two observed menu links one level deeper.
    const requestedFood = normalize(input.food).replace(/s$/, "");
    if (requestedFood && !pages.some(page => normalize(htmlText(page.html)).includes(requestedFood))) {
      const nested = [...new Set(pages.slice(1).flatMap(menuLinks))].filter(url => /menu|carte|carta|speisekarte/i.test(url) && !pages.some(page => page.url === url)).slice(0, 2);
      const details = await Promise.allSettled(nested.map(url => fetchPage(url)));
      for (const result of details) if (result.status === "fulfilled" && result.value && sameSite(result.value.url, home.url)) pages.push(result.value);
    }
    const evidence = menuEvidence(pages, input);
    const supportedAllergies = evidence.map(item => item.allergy);
    const onlineRating = readOnlineRating(home.html, restaurant.name);
    const pageText = normalize(pages.map(page => htmlText(page.html)).join(" "));
    const locationConfirmed = mentionsLocation(pageText, input.location);
    const foodTerms = normalize(input.food).split(" ").filter(Boolean).map(word => word.replace(/s$/, ""));
    const foodConfirmed = !foodTerms.length || foodTerms.some(word => pageText.includes(word));
    const confirmedLocations = restaurant.locations.filter(location => {
      const street = normalize(location.address.split(",")[0]);
      return /\d/.test(street) && pageText.includes(street);
    }).map(location => ({ ...location, website: home.url, sourceUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${restaurant.name} ${location.address}`)}` }));
    const dedicatedGlutenFree = evidence.some(item => /^(gluten|gf|gluten free)$/i.test(item.allergy) && /(?:100\s*%|entirely|completely|fully|tutto|tutta|interamente|dedicated)\s*(?:\w+\s+){0,3}(?:gluten[-\s]*free|senza glutine)|(?:entire|whole) menu.{0,50}gluten[-\s]*free/i.test(item.quote));
    const crossContact = pages.map(page => htmlText(page.html).match(/[^.!?]{0,65}\b(?:cross[- ]?(?:contact|contamination)|shared (?:fryer|kitchen)|traces of gluten)[^.!?]{0,100}/i)?.[0]).find(Boolean);
    return {
      ...pending, website: home.url, websiteStatus: "verified", checkedAt: new Date().toISOString(), locationConfirmed, foodConfirmed,
      ...(onlineRating ? { ...onlineRating, qualitySourceUrl: home.url } : {}),
      menuSourceUrl: evidence[0]?.url || "", allergenEvidence: evidence, supportedAllergies, dedicatedGlutenFree,
      confidence: dedicatedGlutenFree && foodConfirmed ? "strong" : evidence.length ? "medium" : "weak",
      evidenceRank: evidence.length && !foodConfirmed ? 2 : dedicatedGlutenFree ? 5 : evidence.length ? crossContact ? 3 : 4 : 1,
      crossContaminationWarning: crossContact || undefined,
      missingAllergies: input.allergies.filter(allergy => !supportedAllergies.includes(allergy)),
      evidenceSummary: evidence.length ? `The restaurant website mentions ${evidence.map(item => item.quote).join(", ")}.${!foodConfirmed ? " The requested dish was not confirmed on its website." : ""} Confirm the requested dish, branch and cross-contact procedures with staff.` : "Restaurant website checked; the requested allergy options are unconfirmed. Confirm the menu and cross-contact procedures with staff.",
      rankingReason: evidence.length ? "Website-backed allergy options; confirm your dish and branch." : "Restaurant website checked; allergy accommodation needs confirmation.",
      locations: confirmedLocations.length ? confirmedLocations : pending.locations.map(location => ({ ...location, website: home.url })),
    };
  } catch (error) { console.warn("Restaurant verification unavailable", restaurant.name, error instanceof Error ? error.message : "unknown error"); return pending; }
}

export function rankRestaurantMatches(restaurants: AiDiscoveredRestaurant[], input: Input) {
  const terms = normalize(input.food).split(" ").filter(Boolean).map(term => term.replace(/s$/, ""));
  return restaurants.map(restaurant => {
    const cuisine = normalize(restaurant.cuisine.join(" "));
    const snacksOnly = /gelato|ice cream|dessert|pastry|patisserie|bakery|coffee/.test(cuisine)
      && !/pizza|pasta|burger|lunch|dinner|bistro|italian|mediterranean|restaurant|sandwich/.test(cuisine);
    const foodFit = terms.length
      ? terms.some(term => cuisine.includes(term)) ? 3 : (restaurant.foodRelevanceTier || 0) >= 4 ? 2 : 1
      : snacksOnly ? 0 : 3;
    const allergyFit = (restaurant.supportedAllergies?.length || 0) * 4 - (restaurant.missingAllergies?.length || 0);
    const matchQuality = foodFit * 10 + allergyFit + Number(Boolean(restaurant.dedicatedGlutenFree)) * 3 + Number(restaurant.websiteStatus === "verified");
    return { ...restaurant, matchQuality };
  }).sort((a, b) => (b.popularityTier || 0) - (a.popularityTier || 0)
    || (b.rating || 0) - (a.rating || 0)
    || (b.evidenceRank || 0) - (a.evidenceRank || 0)
    || (b.matchQuality || 0) - (a.matchQuality || 0)
    || (b.rating || 0) - (a.rating || 0));
}

export async function verifyAndRankRestaurants(restaurants: AiDiscoveredRestaurant[], input: Input, observedUrls: string[] = []) {
  // Reuse actual discovery links before spending another search on URL repair.
  restaurants = restaurants.map(restaurant => {
    const observed = observedUrls.find(url => officialUrl(url) && matchesBusinessDomain(url, restaurant.name));
    return observed ? { ...restaurant, website: observed } : restaurant;
  });
  const checked = await Promise.all(restaurants.map(restaurant => verifyDiscoveredRestaurant(restaurant, input)));
  // A guessed .com or an empty URL should lead to a real lookup, not the loss
  // of a useful restaurant. Keep repair work bounded to nine candidates.
  const unresolved = checked.map((restaurant, index) => ({ restaurant, index })).filter(item => item.restaurant.websiteStatus !== "verified").slice(0, 9);
  await Promise.allSettled(unresolved.map(async ({ index }) => {
    const urls = await searchRestaurantWebsites(restaurants[index].name, input.location);
    for (const website of urls) {
      const repaired = await verifyDiscoveredRestaurant({ ...restaurants[index], website }, input);
      if (repaired.websiteStatus === "verified") { checked[index] = repaired; break; }
    }
  }));
  const ranked = rankRestaurantMatches(checked, input);
  const grouped = new Map<string, AiDiscoveredRestaurant>();
  for (const restaurant of ranked) {
    const key = restaurant.website ? new URL(restaurant.website).hostname.replace(/^www\./, "") : `name:${normalize(restaurant.name)}`;
    const existing = grouped.get(key);
    if (!existing) { grouped.set(key, restaurant); continue; }
    for (const location of restaurant.locations) if (!existing.locations.some(item => normalize(item.address) === normalize(location.address))) existing.locations.push(location);
    existing.cuisine = [...new Set([...existing.cuisine, ...restaurant.cuisine])];
  }
  return [...grouped.values()];
}
