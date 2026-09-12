import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { incrementRestaurantSignals } from "@/app/lib/restaurant-signals";
import { getAccountAccess } from "@/app/lib/premium";
import { getDb } from "../../../db";
import { restaurantPreference } from "../../../db/schema";
import { auth } from "../../lib/auth";

const FREE_DAILY_LIMIT = 3;
const FREE_SUGGESTION_BONUS = 1;
const FREE_SEARCH_COOKIE = "safeserve_free_searches";
const FREE_SUGGESTION_COOKIE = "safeserve_suggestion_bonus";

type PreferenceKind = "suggest" | "avoid";
type AiCompatibility = {
  compatible?: boolean;
  confidence?: "high" | "medium" | "low";
  reason?: string;
  supportedAllergies?: string[];
  unsupportedAllergies?: string[];
  unknownAllergies?: string[];
};

type AiCompatibilityAttempt = {
  result: AiCompatibility | null;
  error?: string;
};
type VerificationVerdict = "favorable" | "caution" | "blocked";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function dailySearchCount(request: NextRequest, today: string) {
  const [savedDate, savedCount] = (request.cookies.get(FREE_SEARCH_COOKIE)?.value || "").split(":");
  return savedDate === today ? Math.max(0, Number.parseInt(savedCount || "0", 10) || 0) : 0;
}

function hasSuggestionBonus(request: NextRequest, today: string) {
  const [savedDate, savedClaimed] = (request.cookies.get(FREE_SUGGESTION_COOKIE)?.value || "").split(":");
  return savedDate === today && savedClaimed === "1";
}

async function hasPremiumAccess(session: Awaited<ReturnType<typeof auth.api.getSession>>) {
  return (await getAccountAccess(session)).premium;
}

function normalizedName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\b(restaurants?|nyc|new york)\b/g, "").replace(/\s+/g, " ").trim();
}

function normalizedScope(value: unknown) {
  return typeof value === "string"
    ? value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120)
    : "";
}

function allergyScope(value: unknown) {
  return allergiesFrom(value)
    .map((item) => normalizedName(String(item)))
    .filter(Boolean)
    .sort()
    .join("|")
    .slice(0, 240);
}

function allergiesFrom(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)) : typeof value === "string" ? value.split("|") : [];
}

function contextFromRequest(request: NextRequest) {
  return {
    locationScope: normalizedScope(request.nextUrl.searchParams.get("location")),
    allergyScope: allergyScope(request.nextUrl.searchParams.get("allergies") || ""),
    foodScope: normalizedScope(request.nextUrl.searchParams.get("food")),
  };
}

function contextFromBody(body: Record<string, unknown>) {
  const rawLocation = body.location ?? body.locationScope ?? body.city ?? body.place;
  const rawAllergies = body.allergies ?? body.allergyScope ?? body.allergy ?? body.allergiesText;
  const rawFood = body.food ?? body.foodScope ?? body.query ?? body.craving;
  return {
    locationScope: normalizedScope(rawLocation),
    allergyScope: allergyScope(rawAllergies),
    foodScope: normalizedScope(rawFood),
  };
}

function mergeContext(primary: { locationScope: string; allergyScope: string; foodScope: string }, fallback: { locationScope: string; allergyScope: string; foodScope: string }) {
  return {
    locationScope: primary.locationScope || fallback.locationScope,
    allergyScope: primary.allergyScope || fallback.allergyScope,
    foodScope: primary.foodScope || fallback.foodScope,
  };
}

function scopeOverlaps(stored: string, current: string, mode: "location" | "allergy" | "food") {
  if (!stored) return false;
  if (!current) return false;
  if (mode === "allergy") {
    const storedAllergies = stored.split("|").filter(Boolean);
    const currentAllergies = new Set(current.split("|").filter(Boolean));
    return storedAllergies.some((allergy) => currentAllergies.has(allergy));
  }
  return stored === current || stored.includes(current) || current.includes(stored);
}

function rowMatchesContext(row: typeof restaurantPreference.$inferSelect, context: { locationScope: string; allergyScope: string; foodScope: string }) {
  return scopeOverlaps(row.locationScope, context.locationScope, "location")
    && scopeOverlaps(row.allergyScope, context.allergyScope, "allergy")
    && (!row.foodScope || !context.foodScope || scopeOverlaps(row.foodScope, context.foodScope, "food"));
}

function cleanName(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 120) : "";
}

function canonicalRestaurantName(value: string) {
  const cleaned = cleanName(value);
  const normalized = normalizedName(cleaned);
  if (/^frie?ndmans?$/.test(normalized) || /^friedmans?$/.test(normalized)) return "Friedman's";
  return cleaned;
}

function cleanKind(value: unknown): PreferenceKind {
  return value === "avoid" ? "avoid" : "suggest";
}

function preferenceNameMatches(candidateName: string, preferenceName: string) {
  const candidate = normalizedName(candidateName);
  const preference = normalizedName(preferenceName);
  if (!candidate || !preference) return false;
  return candidate === preference || candidate.includes(preference) || preference.includes(candidate);
}

function parseJsonObject(content: string) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const source = fenced || content;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end <= start) return {};
  try {
    return JSON.parse(source.slice(start, end + 1)) as AiCompatibility;
  } catch {
    return {};
  }
}

function cleanAllergyList(value: unknown, requestedAllergies: string[]) {
  if (!Array.isArray(value)) return [];
  const requested = new Map(requestedAllergies.map((allergy) => [normalizedName(allergy), allergy]));
  return [...new Set(value.flatMap((item) => {
    const normalized = normalizedName(String(item));
    const exact = requested.get(normalized);
    if (exact) return [exact];
    const match = [...requested.entries()].find(([key]) => key.includes(normalized) || normalized.includes(key));
    return match ? [match[1]] : [];
  }))];
}

function normalizeAiCompatibility(result: AiCompatibility, requestedAllergies: string[]) {
  const supportedAllergies = cleanAllergyList(result.supportedAllergies, requestedAllergies);
  const unsupportedAllergies = cleanAllergyList(result.unsupportedAllergies, requestedAllergies)
    .filter((allergy) => !supportedAllergies.includes(allergy));
  let unknownAllergies = cleanAllergyList(result.unknownAllergies, requestedAllergies)
    .filter((allergy) => !supportedAllergies.includes(allergy) && !unsupportedAllergies.includes(allergy));
  const reason = (result.reason || "").trim();

  // A gluten-free option can still carry a cross-contact warning. That warning is
  // important, but it does not mean the option itself contains a gluten ingredient.
  const mentionsGlutenOption = /\b(gluten[- ]free|gf)\b.{0,50}\b(option|bun|menu|available|offer)/i.test(reason)
    || /\b(option|bun|menu|available|offer)\b.{0,50}\b(gluten[- ]free|gf)\b/i.test(reason);
  if (mentionsGlutenOption) {
    const glutenRequests = requestedAllergies.filter((allergy) => ["gluten", "wheat"].includes(normalizedName(allergy)));
    for (const allergy of glutenRequests) {
      if (!supportedAllergies.includes(allergy)) supportedAllergies.push(allergy);
      const unsupportedIndex = unsupportedAllergies.indexOf(allergy);
      if (unsupportedIndex >= 0) unsupportedAllergies.splice(unsupportedIndex, 1);
    }
  }

  if (!supportedAllergies.length && !unsupportedAllergies.length && !unknownAllergies.length) {
    unknownAllergies = [...requestedAllergies];
  } else {
    for (const allergy of requestedAllergies) {
      if (!supportedAllergies.includes(allergy) && !unsupportedAllergies.includes(allergy) && !unknownAllergies.includes(allergy)) {
        unknownAllergies.push(allergy);
      }
    }
  }

  const coversEveryAllergy = requestedAllergies.every((allergy) => supportedAllergies.includes(allergy));
  return {
    ...result,
    compatible: Boolean(result.compatible || mentionsGlutenOption) && coversEveryAllergy && unsupportedAllergies.length === 0,
    confidence: result.confidence || "low",
    reason,
    supportedAllergies,
    unsupportedAllergies,
    unknownAllergies,
  } satisfies AiCompatibility;
}

function allergyEvidenceSummary(result: AiCompatibility) {
  const parts: string[] = [];
  if (result.supportedAllergies?.length) parts.push(`Evidence supports options for ${result.supportedAllergies.join(", ")}.`);
  if (result.unsupportedAllergies?.length) parts.push(`No suitable option was found for ${result.unsupportedAllergies.join(", ")}.`);
  if (result.unknownAllergies?.length) parts.push(`${result.unknownAllergies.join(", ")} remains unverified.`);
  return parts.join(" ");
}

function messageContentText(content: unknown) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => {
    if (typeof part === "string") return part;
    if (!part || typeof part !== "object") return "";
    const record = part as Record<string, unknown>;
    return typeof record.text === "string" ? record.text : typeof record.content === "string" ? record.content : "";
  }).filter(Boolean).join(" ");
}

function compatibilityFromText(content: string): AiCompatibility | null {
  const text = content.replace(/\s+/g, " ").trim();
  const lower = text.toLowerCase();
  if (!text) return null;
  if (/\b(incompatible|not compatible|not a fit|does not fit|clearly conflicts|not safe|unsafe|avoid|do not recommend|no gluten[- ]free|contains gluten)\b/.test(lower)) {
    return { compatible: false, confidence: lower.includes("clearly") || lower.includes("unsafe") ? "high" : "medium", reason: text.slice(0, 240) };
  }
  if (/\b(compatible|reasonable|plausible|may fit|can accommodate|offers|has gluten[- ]free|has gluten free|allergen information|allergy-aware)\b/.test(lower)) {
    return { compatible: true, confidence: /\b(strong|known|offers|has gluten[- ]free|has gluten free|confirmed)\b/.test(lower) ? "medium" : "low", reason: text.slice(0, 240) };
  }
  return { compatible: true, confidence: "low", reason: `AI response was not structured, so Gluten FreEat saved this only as a low-confidence lead: ${text.slice(0, 180)}` };
}

async function askAiCompatibility(name: string, location: string, food: string, allergies: string[]): Promise<AiCompatibilityAttempt> {
  const apiKey = (process.env.OPENROUTER_API_KEY || process.env.NVIDIA_API_KEY || "").trim();
  if (!apiKey.startsWith("sk-or-v1-")) return { result: null, error: "Free restaurant assessment is not configured." };
  const endpoint = "https://openrouter.ai/api/v1/chat/completions";
  const model = process.env.OPENROUTER_DISCOVERY_MODEL?.trim() || process.env.OPENROUTER_MODEL?.trim() || "z-ai/glm-5.2:free";
  const providerLabel = "Restaurant assessment";

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.BETTER_AUTH_URL?.trim() || "http://localhost:3000",
        "X-Title": "Gluten FreEat",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: [
              "Judge if a suggested restaurant is a reasonable allergy-aware lead.",
              "Use known menu/allergen knowledge; country matters for chains.",
              "Never call it safe; cross-contact needs staff confirmation.",
              "GF burger/bread needs GF bun/menu or fully GF venue.",
              "Approve incomplete-but-plausible evidence as low confidence; reject only fake/closed/irrelevant/conflicting.",
              "Put each allergy in supportedAllergies, unsupportedAllergies, or unknownAllergies.",
              "Input keys: r restaurant, loc location, alg allergies.",
              "Return JSON only as {\"compatible\":true,\"confidence\":\"high|medium|low\",\"supportedAllergies\":[\"Gluten\"],\"unsupportedAllergies\":[],\"unknownAllergies\":[],\"reason\":\"short sentence naming the relevant menu option and cross-contact caveat\"}.",
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify({
              r: name,
              loc: location,
              food: food || "any",
              alg: allergies.slice(0, 10),
            }),
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
        max_tokens: 220,
        reasoning: { effort: "none", exclude: true },
        include_reasoning: false,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      const details = (await response.text().catch(() => "")).replace(/\s+/g, " ").trim().slice(0, 180);
      return {
        result: null,
        error: `${providerLabel} verification failed (${response.status}${response.statusText ? ` ${response.statusText}` : ""}).${details ? ` ${details}` : ""}`,
      };
    }
    const data = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
    const rawContent = messageContentText(data.choices?.[0]?.message?.content);
    const parsed = parseJsonObject(rawContent);
    const compatible = typeof parsed.compatible === "boolean" ? parsed : compatibilityFromText(rawContent);
    if (!compatible || typeof compatible.compatible !== "boolean") return { result: null };
    const normalized = normalizeAiCompatibility(compatible, allergies);
    return {
      result: {
        compatible: normalized.compatible,
        confidence: normalized.confidence === "high" || normalized.confidence === "medium" || normalized.confidence === "low" ? normalized.confidence : "low",
        reason: typeof normalized.reason === "string" ? normalized.reason.trim().slice(0, 240) : "",
        supportedAllergies: normalized.supportedAllergies,
        unsupportedAllergies: normalized.unsupportedAllergies,
        unknownAllergies: normalized.unknownAllergies,
      },
    };
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return {
      result: null,
      error: timedOut
        ? `${providerLabel} verification timed out. Please try again.`
        : `${providerLabel} verification could not connect. Please try again.`,
    };
  }
}

function decodeEntities(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function readableText(value: string) {
  return decodeEntities(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function allergyTerms(allergy: string) {
  const normalized = normalizedName(allergy);
  if (normalized === "gluten" || normalized === "wheat") return ["gluten free", "gluten-free", "gluten friendly", "sans gluten", "sans-gluten", "celiac", "coeliac", "allergen"];
  if (normalized === "milk") return ["dairy free", "dairy-free", "milk free", "allergen"];
  if (normalized === "eggs") return ["egg free", "egg-free", "allergen"];
  if (normalized === "tree nuts") return ["nut free", "nut-free", "tree nut", "allergen"];
  return [`${normalized} free`, `${normalized}-free`, normalized, "allergen"];
}

function supportiveAllergyTerms(allergy: string) {
  return allergyTerms(allergy).filter((term) => term !== "allergen");
}

function needsOfficialCorroboration(name: string, food: string, allergies: string[]) {
  const restaurant = normalizedName(name);
  const requestedFood = normalizedName(food);
  const hasGlutenRequest = allergies.some((allergy) => ["gluten", "wheat"].includes(normalizedName(allergy)));
  const isChainWithCountrySpecificMenus = /^(mcdonalds|mc donalds|burger king|five guys|quick|kfc|subway|shake shack)$/.test(restaurant);
  const isBreadBasedFood = !requestedFood || /\b(burger|sandwich|bun|bread|wrap|chicken|fries|fast food)\b/.test(requestedFood);
  return hasGlutenRequest && isBreadBasedFood && isChainWithCountrySpecificMenus;
}

function curatedSuggestionVerdict(name: string, location: string, food: string, allergies: string[]): AiCompatibility | null {
  const restaurant = normalizedName(name);
  const city = normalizedName(location);
  const requestedFood = normalizedName(food);
  const hasGlutenRequest = allergies.some((allergy) => ["gluten", "wheat"].includes(normalizedName(allergy)));
  const isBurgerSearch = !requestedFood || /\b(burger|hamburger|cheeseburger|sandwich|bun)\b/.test(requestedFood);
  if (!hasGlutenRequest || !isBurgerSearch) return null;

  if ((restaurant === "pny" || restaurant === "paris new york") && city.includes("paris")) {
    return {
      compatible: true,
      confidence: "medium",
      reason: "PNY is a relevant Paris burger lead for gluten-free/sans-gluten searches, but ingredients and cross-contact still need restaurant confirmation.",
    };
  }

  if (/^(mcdonalds|mc donalds)$/.test(restaurant) && (city.includes("paris") || city.includes("france"))) {
    return {
      compatible: false,
      confidence: "high",
      reason: "McDonald's France burger pages list gluten and describe wheat-based buns, so it should not be boosted for gluten-free burger searches.",
    };
  }

  return null;
}

function shouldHardBlockAiRejection(name: string, reason: string) {
  const normalizedReason = reason.toLowerCase();
  const restaurant = normalizedName(name);
  if (/^pny\b/.test(restaurant) || restaurant === "paris new york") return /\b(not real|does not exist|closed|permanently closed|wrong location|not a restaurant|irrelevant)\b/.test(normalizedReason);
  if (/\b(not real|does not exist|closed|permanently closed|wrong location|not a restaurant|irrelevant)\b/.test(normalizedReason)) return true;
  const hardConflictPhrases = [
    "no gluten-free",
    "no gluten free",
    "does not offer gluten-free",
    "does not offer gluten free",
    "not gluten-free",
    "not gluten free",
    "no allergy accommodation",
    "clearly unsafe",
  ];
  if (hardConflictPhrases.some((phrase) => normalizedReason.includes(phrase))) return true;
  return false;
}

async function directPublicEvidence(name: string, location: string, food: string, allergies: string[]) {
  const query = [
    `"${name}"`,
    location,
    food,
    ...allergies.flatMap((allergy) => allergyTerms(allergy).slice(0, 2)),
    "menu allergen restaurant",
  ].filter(Boolean).join(" ");

  try {
    const url = new URL("https://html.duckduckgo.com/html/");
    url.searchParams.set("q", query);
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SafeServe-Suggestion-Verify/0.1)",
        "Accept-Language": "en,fr;q=0.9",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const html = (await response.text()).slice(0, 650000);
    const text = readableText(html);
    const nameTokens = normalizedName(name).split(" ").filter((token) => token.length > 2);
    const nameFound = nameTokens.length
      ? nameTokens.every((token) => text.includes(token))
      : text.includes(normalizedName(name));
    if (!nameFound) return null;

    const missingAllergies = allergies.filter((allergy) => {
      const terms = supportiveAllergyTerms(allergy);
      return !terms.some((term) => text.includes(term.toLowerCase()));
    });
    const hasMenuContext = /\b(menu|allergen|allergy|dietary|gluten[- ]free|celiac|coeliac)\b/i.test(text);
    if (missingAllergies.length || !hasMenuContext) return null;
    return { source: "public-search", query };
  } catch {
    return null;
  }
}

async function verifySuggestionCompatible(name: string, body: Record<string, unknown>, request: NextRequest, context: { locationScope: string; allergyScope: string; foodScope: string }) {
  const restaurantName = canonicalRestaurantName(name);
  const location = cleanName(body.location ?? request.nextUrl.searchParams.get("location")) || context.locationScope;
  const food = cleanName(body.food ?? request.nextUrl.searchParams.get("food")) || context.foodScope;
  const allergies = allergiesFrom(body.allergies ?? request.nextUrl.searchParams.get("allergies"))
    .map((allergy) => cleanName(allergy))
    .filter(Boolean)
    .slice(0, 20);

  if (!location || !allergies.length) {
    return { ok: false, verified: false, verdict: "blocked" as VerificationVerdict, message: "Choose a location and at least one allergy before making suggestions/avoids." };
  }

  const curatedVerdict = curatedSuggestionVerdict(restaurantName, location, food, allergies);
  if (curatedVerdict) {
    if (!curatedVerdict.compatible) {
      return { ok: false, verified: false, verdict: "blocked" as VerificationVerdict, message: `Not a fit: ${curatedVerdict.reason}` };
    }
    return {
      ok: true,
      verified: curatedVerdict.confidence !== "low",
      verdict: curatedVerdict.confidence === "low" ? "caution" as VerificationVerdict : "favorable" as VerificationVerdict,
      message: `Good match signal: ${curatedVerdict.reason}`,
    };
  }

  const aiAttempt = await askAiCompatibility(restaurantName, location, food, allergies);
  const aiCompatibility = aiAttempt.result;
  if (aiCompatibility) {
    const evidenceSummary = allergyEvidenceSummary(aiCompatibility);
    if (!aiCompatibility.compatible && aiCompatibility.confidence === "high") {
      const hasExplicitlyUnsupportedAllergy = Boolean(aiCompatibility.unsupportedAllergies?.length);
      if (hasExplicitlyUnsupportedAllergy || shouldHardBlockAiRejection(restaurantName, aiCompatibility.reason || "")) {
        return { ok: false, verified: false, verdict: "blocked" as VerificationVerdict, message: `Not a fit for the complete request. ${evidenceSummary} ${aiCompatibility.reason}` };
      }
      return {
        ok: true,
        verified: false,
        verdict: "caution" as VerificationVerdict,
        message: `AI is unsure about the complete request. ${evidenceSummary} ${aiCompatibility.reason || "Confirm directly with the restaurant before ordering."}`,
      };
    }
    const favorable = aiCompatibility.compatible && aiCompatibility.confidence !== "low";
    return {
      ok: true,
      verified: favorable,
      verdict: favorable ? "favorable" as VerificationVerdict : "caution" as VerificationVerdict,
      message: favorable
        ? `Good match signal: ${evidenceSummary} ${aiCompatibility.reason || "It looks like a reasonable allergy-aware lead."} Confirm ingredients and cross-contact with the restaurant.`
        : aiCompatibility.compatible
          ? `Weak match signal: ${evidenceSummary} ${aiCompatibility.reason || "Treat it as a lead to call before ordering."}`
          : `Not enough support for the complete request. ${evidenceSummary} ${aiCompatibility.reason || "It was saved only as a low-confidence lead."}`,
    };
  }
  if (aiAttempt.error) {
    return { ok: false, verified: false, verdict: "blocked" as VerificationVerdict, message: aiAttempt.error };
  }

  return { ok: false, verified: false, verdict: "blocked" as VerificationVerdict, message: "Restaurant assessment did not return a usable answer. Please try again." };
}

async function currentSession(request: NextRequest) {
  return auth.api.getSession({ headers: request.headers });
}

async function safeIncrementSignals(payload: Parameters<typeof incrementRestaurantSignals>[0]) {
  try {
    await incrementRestaurantSignals(payload);
  } catch (error) {
    console.error("Suggestion signal update failed", error);
  }
}

async function preferencePayload(userId: string | undefined, context: { locationScope: string; allergyScope: string; foodScope: string }) {
  const rows = await getDb()
    .select()
    .from(restaurantPreference)
    .limit(500);
  const publicMap = new Map<string, { kind: PreferenceKind; name: string; normalizedName: string; count: number }>();
  const userSuggested: string[] = [];
  const userAvoided: string[] = [];

  for (const row of rows) {
    if (!rowMatchesContext(row, context)) continue;
    const kind = row.kind as PreferenceKind;
    const key = `${kind}:${row.normalizedName}`;
    const existing = publicMap.get(key);
    if (existing) existing.count += 1;
    else publicMap.set(key, { kind, name: row.name, normalizedName: row.normalizedName, count: 1 });
    if (userId && row.userId === userId) {
      if (kind === "avoid") userAvoided.push(row.name);
      else userSuggested.push(row.name);
    }
  }

  const publicPreferences = [...publicMap.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 40);

  return {
    publicPreferences,
    publicSuggestedRestaurants: publicPreferences.filter((item) => item.kind === "suggest").map((item) => item.name),
    publicAvoidedRestaurants: publicPreferences.filter((item) => item.kind === "avoid").map((item) => item.name),
    suggestedRestaurants: [...new Set(userSuggested)].slice(0, 8),
    avoidedRestaurants: [...new Set(userAvoided)].slice(0, 8),
  };
}

export async function GET(request: NextRequest) {
  const session = await currentSession(request);
  const context = contextFromRequest(request);
  const premium = await hasPremiumAccess(session);
  if (!premium) return NextResponse.json({ authenticated: Boolean(session?.user), premium: false, publicPreferences: [], publicSuggestedRestaurants: [], publicAvoidedRestaurants: [], suggestedRestaurants: [], avoidedRestaurants: [] });
  return NextResponse.json({
    authenticated: Boolean(session?.user),
    premium: true,
    ...(await preferencePayload(session?.user.id, context)),
  });
}

export async function POST(request: NextRequest) {
  const session = await currentSession(request);
  if (!session?.user) {
    return NextResponse.json({ error: "Need an account to make suggestions/avoids." }, { status: 401 });
  }
  if (!(await hasPremiumAccess(session))) {
    return NextResponse.json({ error: "Premium is required to save suggestions or avoids.", premiumRequired: true }, { status: 402 });
  }

  const raw: unknown = await request.json().catch(() => null);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  const body = raw as Record<string, unknown>;
  const kind = cleanKind(body.kind);
  const context = mergeContext(contextFromBody(body), contextFromRequest(request));
  if (!context.locationScope || !context.allergyScope) {
    return NextResponse.json({ error: "Choose a location and at least one allergy before making suggestions/avoids." }, { status: 400 });
  }
  const names = [
    ...(Array.isArray(body.names) ? body.names : []),
    ...(Array.isArray(body.suggestedRestaurants) ? body.suggestedRestaurants : []),
    ...(Array.isArray(body.avoidedRestaurants) ? body.avoidedRestaurants : []),
    body.name,
    body.suggestedRestaurant,
    body.avoidedRestaurant,
  ]
    .map(cleanName)
    .map(canonicalRestaurantName)
    .filter(Boolean)
    .slice(0, 8);

  if (!names.length) {
    return NextResponse.json({ error: "Enter at least one restaurant name first." }, { status: 400 });
  }

  // Suggestions and avoids are direct community votes. Allergy assessment is
  // handled by restaurant search and never runs as part of saving a vote.

  const db = getDb();
  const now = new Date();
  for (const name of names) {
    const normalized = normalizedName(name);
    if (!normalized) continue;
    const oppositeKind: PreferenceKind = kind === "suggest" ? "avoid" : "suggest";
    const existingSamePreference = await db.select({ id: restaurantPreference.id }).from(restaurantPreference).where(and(
      eq(restaurantPreference.userId, session.user.id),
      eq(restaurantPreference.kind, kind),
      eq(restaurantPreference.normalizedName, normalized),
      eq(restaurantPreference.locationScope, context.locationScope),
      eq(restaurantPreference.allergyScope, context.allergyScope),
      eq(restaurantPreference.foodScope, context.foodScope),
    )).limit(1).then((rows) => rows[0]);
    const existingOppositePreference = await db.select({ id: restaurantPreference.id }).from(restaurantPreference).where(and(
      eq(restaurantPreference.userId, session.user.id),
      eq(restaurantPreference.kind, oppositeKind),
      eq(restaurantPreference.normalizedName, normalized),
      eq(restaurantPreference.locationScope, context.locationScope),
      eq(restaurantPreference.allergyScope, context.allergyScope),
      eq(restaurantPreference.foodScope, context.foodScope),
    )).limit(1).then((rows) => rows[0]);
    await db.delete(restaurantPreference).where(and(
      eq(restaurantPreference.userId, session.user.id),
      eq(restaurantPreference.kind, oppositeKind),
      eq(restaurantPreference.normalizedName, normalized),
      eq(restaurantPreference.locationScope, context.locationScope),
      eq(restaurantPreference.allergyScope, context.allergyScope),
      eq(restaurantPreference.foodScope, context.foodScope),
    ));
    await db.insert(restaurantPreference)
      .values({
        id: crypto.randomUUID(),
        userId: session.user.id,
        kind,
        name,
        normalizedName: normalized,
        locationScope: context.locationScope,
        allergyScope: context.allergyScope,
        foodScope: context.foodScope,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          restaurantPreference.userId,
          restaurantPreference.kind,
          restaurantPreference.normalizedName,
          restaurantPreference.locationScope,
          restaurantPreference.allergyScope,
          restaurantPreference.foodScope,
        ],
        set: { name, updatedAt: now },
      });

    if (existingOppositePreference) {
      await safeIncrementSignals([{
        name,
        locationScope: context.locationScope,
        allergyScope: context.allergyScope,
        foodScope: context.foodScope,
        suggestionWeight: oppositeKind === "suggest" ? -1 : 0,
        avoidWeight: oppositeKind === "avoid" ? -1 : 0,
      }]);
    }
    if (!existingSamePreference) {
      await safeIncrementSignals([{
        name,
        locationScope: context.locationScope,
        allergyScope: context.allergyScope,
        foodScope: context.foodScope,
        suggestionWeight: kind === "suggest" ? 1 : 0,
        avoidWeight: kind === "avoid" ? 1 : 0,
      }]);
    }
  }

  const today = todayKey();
  const searchCount = dailySearchCount(request, today);
  const alreadyClaimed = hasSuggestionBonus(request, today);
  const freeSearchesLimit = FREE_DAILY_LIMIT + (alreadyClaimed ? FREE_SUGGESTION_BONUS : 0);
  const payload = await preferencePayload(session.user.id, context);
  const feedbackTone = "favorable";
  const savedMessage = kind === "avoid"
    ? `${names[0]} avoided. Gluten FreEat will push it down for this location/allergy/search context.`
    : `${names[0]} suggested. Gluten FreEat will give it a moderate boost for this location/allergy/search context.`;

  if (alreadyClaimed) {
    return NextResponse.json({
      ...payload,
      bonusGranted: false,
      message: `${savedMessage} Today's extra search was already claimed.`,
      feedbackTone,
      unverifiedSuggestions: [],
      freeSearchesRemaining: Math.max(0, freeSearchesLimit - searchCount),
      freeSearchesLimit,
    });
  }

  const nextLimit = FREE_DAILY_LIMIT + FREE_SUGGESTION_BONUS;
  const response = NextResponse.json({
    ...payload,
    bonusGranted: true,
    message: `${savedMessage} You got 1 extra Free search today.`,
    feedbackTone,
    unverifiedSuggestions: [],
    freeSearchesRemaining: Math.max(0, nextLimit - searchCount),
    freeSearchesLimit: nextLimit,
  });

  response.cookies.set(FREE_SUGGESTION_COOKIE, `${today}:1`, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 48,
  });

  return response;
}

export async function DELETE(request: NextRequest) {
  const session = await currentSession(request);
  if (!session?.user) {
    return NextResponse.json({ error: "Need an account to make suggestions/avoids." }, { status: 401 });
  }
  if (!(await hasPremiumAccess(session))) {
    return NextResponse.json({ error: "Premium is required to edit suggestions or avoids.", premiumRequired: true }, { status: 402 });
  }

  const raw: unknown = await request.json().catch(() => null);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  const body = raw as Record<string, unknown>;
  const kind = cleanKind(body.kind);
  const context = mergeContext(contextFromBody(body), contextFromRequest(request));
  const name = cleanName(body.name);
  const normalized = normalizedName(name);
  if (!normalized) {
    return NextResponse.json({ error: "Choose a restaurant preference to remove." }, { status: 400 });
  }

  const existingPreference = await getDb().select({ id: restaurantPreference.id }).from(restaurantPreference).where(and(
    eq(restaurantPreference.userId, session.user.id),
    eq(restaurantPreference.kind, kind),
    eq(restaurantPreference.normalizedName, normalized),
  )).limit(1).then((rows) => rows[0]);

  await getDb().delete(restaurantPreference).where(and(
    eq(restaurantPreference.userId, session.user.id),
    eq(restaurantPreference.kind, kind),
    eq(restaurantPreference.normalizedName, normalized),
  ));

  if (existingPreference) {
    await safeIncrementSignals([{
      name,
      locationScope: context.locationScope,
      allergyScope: context.allergyScope,
      foodScope: context.foodScope,
      suggestionWeight: kind === "suggest" ? -1 : 0,
      avoidWeight: kind === "avoid" ? -1 : 0,
    }]);
  }

  return NextResponse.json({
    ...(await preferencePayload(session.user.id, context)),
    message: `${kind === "avoid" ? "Avoid" : "Suggestion"} removed.`,
  });
}
