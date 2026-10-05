import type { AiDiscoveredRestaurant } from "./ai-discovery";
import { fetchPublicPage, htmlText, normalize, officialUrl } from "./public-web";
import { mentionsLocation } from "./restaurant-web-search";
import { matchesBusiness, matchesBusinessDomain } from "./restaurant-verification";

export type RestaurantCandidate = { n: string; w: string; m?: string };
export type EvidenceInput = { location: string; food: string; allergies: string[] };
type Page = { url: string; html: string };

// Reviewed official entry points, not saved answers. Re-fetch these pages on
// each uncached search; the same evidence checks apply as to AI candidates.
export function reviewedCandidates(input: EvidenceInput): RestaurantCandidate[] {
  if (/\bnew\s*york|nyc\b/i.test(input.location) && /\bburgers?\b/i.test(input.food)) return [
    { n: "Bareburger", w: "https://www.bareburger.com/" },
    { n: "Friedman's", w: "https://www.friedmansrestaurant.com/" },
    { n: "Schnipper's", w: "https://www.schnippers.com/" },
    { n: "Bill's Bar & Burger", w: "https://www.billsbarandburger.com/" },
  ];
  if (/\bparis\b/i.test(input.location) && /\bburgers?\b/i.test(input.food)) return [
    { n: "PNY", w: "https://www.pnyburger.com/" },
    { n: "Hank Burger", w: "https://www.hankrestaurant.com/" },
    { n: "BioBurger", w: "https://www.bioburger.fr/" },
    { n: "Big Fernand", w: "https://bigfernand.com/" },
  ];
  if (/\bdublin\b/i.test(input.location) && /\bburgers?\b/i.test(input.food)) return [
    { n: "Bunsen", w: "https://bunsen.ie/", m: "https://bunsen.ie/faq/" },
    { n: "BuJo", w: "https://www.bujo.ie/", m: "https://www.bujo.ie/faqs" },
  ];
  if (/\blondon\b/i.test(input.location) && /\bburgers?\b/i.test(input.food)) return [
    { n: "Honest Burgers", w: "https://www.honestburgers.co.uk/", m: "https://www.honestburgers.co.uk/news/updates/gluten-free-burgers/" },
    { n: "Niche", w: "https://www.nicherestaurants.co.uk/" },
    { n: "Patty&Bun", w: "https://www.pattyandbun.co.uk/" },
    { n: "That Wing Place", w: "https://www.thatwingplace.co.uk/" },
  ];
  if (/\brome|roma\b/i.test(input.location) && /\bpizzas?\b/i.test(input.food)) return [
    { n: "Mama Eat", w: "https://www.mamaeat.com/" },
    { n: "Voglia di Pizza", w: "https://www.vogliadipizzaglutenfree.com/" },
    { n: "Risotteria Melotti Roma", w: "https://www.risotteriamelottiroma.it/" },
  ];
  return [];
}

function relatedUrl(value: string, home: string) {
  try {
    const url = officialUrl(new URL(value.replace(/&amp;/g, "&"), home).href);
    const base = new URL(home).hostname.replace(/^www\./, "");
    const host = url ? new URL(url).hostname.replace(/^www\./, "") : "";
    return host === base || host.endsWith(`.${base}`) ? url : "";
  } catch { return ""; }
}

function linkedPages(home: Page, menu?: string) {
  const locationTerms = /location|contact|find us|our restaurants|restaurants|adresses?|nous trouver|ou nous|standorte|ubicacion|sedi|dove.siamo/i;
  const menuTerms = /menu|faq|allerg|carte|carta|speisekarte/i;
  const links = [...home.html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map(match => ({ url: relatedUrl(match[1], home.url), label: normalize(htmlText(match[2]) + " " + match[1]) }))
    .filter(link => link.url && (menuTerms.test(link.label) || locationTerms.test(link.label)))
    .sort((a, b) => (/(?:faq|allerg)/.test(b.label) ? 3 : menuTerms.test(b.label) ? 2 : 0) - (/(?:faq|allerg)/.test(a.label) ? 3 : menuTerms.test(a.label) ? 2 : 0));
  const location = links.find(link => locationTerms.test(link.label) && link.url !== home.url);
  return [...new Set([menu ? relatedUrl(menu, home.url) : "", location?.url || "", ...links.map(link => link.url)])]
    .filter(url => url && url !== home.url && !/\.(pdf|jpg|png)(?:\?|$)/i.test(url)).slice(0, 4);
}

export function foodTerms(food: string) {
  const requested = normalize(food).split(" ").filter(word => word.length > 2 && !/^(food|any|all|the|and)$/.test(word));
  return requested.map(word => word.replace(/s$/, ""));
}

export function assessRestaurantPages(candidate: RestaurantCandidate, pages: Page[], input: EvidenceInput): AiDiscoveredRestaurant | null {
  if (!pages.length) return null;
  const combined = pages.map(page => page.html).join("\n");
  if (!matchesBusinessDomain(pages[0].url, candidate.n)
    || !matchesBusiness({ url: pages[0].url, html: combined }, candidate.n)
    || !mentionsLocation(htmlText(combined), input.location)) return null;
  const texts = pages.map(page => ({ ...page, text: htmlText(page.html) }));
  const terms = foodTerms(input.food);
  const foodPage = texts.find(page => terms.length === 0 || terms.some(term => normalize(page.text).includes(term)));
  if (!foodPage) return null;
  const supportedAllergies: string[] = [];
  const allergenEvidence: Array<{ allergy: string; quote: string; url: string }> = [];
  for (const allergy of input.allergies) {
    const key = normalize(allergy);
    // A gluten-free bun is relevant to burgers; a GF dessert alone is not.
    const phrase = key === "gluten" || key === "gf"
      ? /burger/.test(normalize(input.food)) ? /(?:gluten[-\s]+free\s+(?:burger\s+)?buns?|(?:pains?|burgers?)\s+(?:\w+\s+){0,2}sans gluten|sans gluten\s+(?:burger|bun)s?)/i
        : /pizza/.test(normalize(input.food)) ? /(?:gluten[-\s]+free\s+(?:\w+\s+){0,2}pizza|pizza\s+(?:\w+\s+){0,2}(?:gluten[-\s]+free|sans gluten|senza glutine))/i
        : /gluten[-\s]+free|sans gluten|senza glutine/i
      : new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[-\\s]+free\\b`, "i");
    for (const page of texts) {
      const match = phrase.exec(page.text);
      if (!match) continue;
      const before = page.text.slice(Math.max(0, match.index - 65), match.index);
      if (/\b(no|not|without|unavailable|cannot|can't|don't|do not|does not)\b[^.!?]{0,45}$/i.test(before)) continue;
      supportedAllergies.push(allergy);
      // Keep excerpts short and verbatim. Never transform a menu mention into
      // a guarantee about cross-contact or support for other allergens.
      allergenEvidence.push({ allergy, quote: match[0], url: page.url });
      break;
    }
  }
  const missingAllergies = input.allergies.filter(allergy => !supportedAllergies.includes(allergy));
  const proof = allergenEvidence[0];
  const locationPage = texts.find(page => /location|contact|restaurant|adresse/.test(page.url) && mentionsLocation(page.text, input.location)) || texts.find(page => mentionsLocation(page.text, input.location));
  if (!locationPage) return null;
  return {
    name: candidate.n,
    cuisine: input.food ? [input.food] : ["Restaurant"],
    website: pages[0].url,
    menuSourceUrl: proof?.url || foodPage.url,
    qualitySourceUrl: locationPage.url,
    evidenceSummary: proof ? `The restaurant's own website mentions ${proof.quote.toLowerCase()}. Confirm the full dish and cross-contact procedures with staff.` : "The requested food appears on the official website. Accommodation for your allergens has not been confirmed.",
    popularitySummary: "Official restaurant website and city presence checked; no independent popularity score is available.",
    rankingReason: proof ? "Official food and allergy-option evidence found. Confirm preparation with staff." : "Food match found; allergy options need direct confirmation.",
    supportedAllergies, missingAllergies, allergenEvidence,
    locations: [{ label: input.location, address: `${input.location} — see official location page`, website: locationPage.url, sourceUrl: locationPage.url }],
  };
}

export async function verifyRestaurantCandidate(candidate: RestaurantCandidate, input: EvidenceInput, fetchPage = fetchPublicPage, onRejected?: (reason: string) => void) {
  const url = officialUrl(candidate.w);
  if (!url) return null;
  const home = await fetchPage(url);
  if (!home || !relatedUrl(home.url, url)) { onRejected?.("website could not be read"); return null; }
  const linked = await Promise.all(linkedPages(home, candidate.m).map(url => fetchPage(url)));
  const pages = [home, ...linked.filter((page): page is Page => Boolean(page && relatedUrl(page.url, home.url)))];
  const terms = foodTerms(input.food);
  if (terms.length && !pages.some(page => terms.some(term => normalize(htmlText(page.html)).includes(term)))) {
    const extra = [...new Set(pages.slice(1).flatMap(page => linkedPages(page)))].filter(url => /menu|carte|carta|speisekarte/i.test(url) && !pages.some(page => page.url === url)).slice(0, 2);
    const nested = await Promise.allSettled(extra.map(url => fetchPage(url)));
    for (const item of nested) if (item.status === "fulfilled" && item.value && relatedUrl(item.value.url, home.url)) pages.push(item.value);
  }
  const result = assessRestaurantPages(candidate, pages, input);
  if (!result) onRejected?.("website did not establish the business, city and dish");
  return result;
}
