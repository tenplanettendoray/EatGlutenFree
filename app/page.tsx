"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { readJson } from "./lib/http-json";
import { useDialogFocus } from "./lib/use-dialog-focus";
import { useRouter } from "next/navigation";
import { AccountControls } from "./auth-ui";
import { CityInput } from "./city-input";
import { AllergyQuest } from "./allergy-quest";
import { InteractiveGlobe } from "./interactive-globe";
import { SearchFoodPicker } from "./meal-selector";
import { BrandWordmark, SafeServeMark } from "./safe-serve-logo";

type RestaurantLocation = {
  label: string;
  address: string;
  website: string;
  sourceUrl: string;
  latitude?: number;
  longitude?: number;
};

type Restaurant = {
  id: string;
  name: string;
  cuisine: string[];
  address: string;
  distanceKm: number | null;
  website: string;
  websiteStatus?: "verified" | "unverified" | "missing";
  checkedAt?: string;
  dietary: Record<string, string>;
  source: "free" | "ai";
  sourceUrl: string;
  menuSourceUrl: string;
  qualitySourceUrl: string;
  evidenceSummary: string;
  popularitySummary: string;
  rankingReason: string;
  rating?: number | null;
  reviewCount?: number | null;
  suggestionCount?: number;
  avoidCount?: number;
  evidenceTier?: "ai" | "community" | "partial";
  supportedAllergies?: string[];
  allergenEvidence?: Array<{ allergy: string; quote: string; url: string }>;
  missingAllergies?: string[];
  locations: RestaurantLocation[];
};

type AiCitation = {
  startIndex: number;
  endIndex: number;
  url: string;
  title: string;
};

type AiResearch = {
  summary: string;
  citations: AiCitation[];
  model: string;
};

type RestaurantLookup = {
  id: string;
  name: string;
  address: string;
  location: string;
};

type SearchMode = "free" | "premium";
type SuggestionFeedback = "idle" | "saving" | "success" | "favorable" | "warning" | "caution" | "blocked" | "error";
type GlobeSelection = { label: string; latitude: number; longitude: number };

const allergyOptions = ["Peanuts", "Tree nuts", "Milk", "Eggs", "Wheat", "Gluten"];
const loadingSteps = ["Finding nearby restaurants", "Checking menu signals", "Ranking allergy-aware matches"];
const preferenceParticleOffsets = [
  { x: -24, y: -16 }, { x: -9, y: -24 }, { x: 12, y: -22 }, { x: 25, y: -9 },
  { x: 22, y: 14 }, { x: 7, y: 22 }, { x: -14, y: 19 }, { x: -26, y: 5 },
];

function normalizeCitySearch(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function cityOnlySearchLocation(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 200);
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  if (!text.trim()) return {} as Record<string, unknown>;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(response.ok ? "The server returned an unreadable response." : "The server returned an error page instead of JSON.");
  }
}

function responseString(data: Record<string, unknown>, key: string) {
  const value = data[key];
  return typeof value === "string" ? value : "";
}

const safetyItems = [
  { icon: "◇", title: "Ingredients change", copy: "Menus, recipes, and suppliers can change without notice." },
  { icon: "◎", title: "Cross-contact matters", copy: "Shared fryers, grills, utensils, and surfaces can introduce allergens." },
  { icon: "☎", title: "Call before you go", copy: "Confirm your needs directly with a manager or trained staff member." },
];
const fallbackRestaurantPhotos = [
  "https://images.unsplash.com/photo-1673081760594-828ed9f8d0f5?auto=format&fit=crop&w=1200&q=82",
  "https://images.unsplash.com/photo-1744776411221-702f2848b0b2?auto=format&fit=crop&w=1200&q=82",
  "https://images.unsplash.com/photo-1758537697448-dbfc1cb83e49?auto=format&fit=crop&w=1200&q=82",
];

function fallbackRestaurantPhoto(name: string) {
  const hash = [...name].reduce((total, character) => total + character.charCodeAt(0), 0);
  return fallbackRestaurantPhotos[hash % fallbackRestaurantPhotos.length];
}

function HeroImageLayers({ reducedMotion }: { reducedMotion: boolean | null }) {
  return (
    <motion.div
      className="hero-image-layers"
      aria-hidden="true"
      initial={reducedMotion ? false : { opacity: 0, y: 24, scale: .97 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: .25 }}
      transition={{ duration: reducedMotion ? 0 : .38, ease: [.22, 1, .36, 1] }}
    >
      <figure className="hero-photo hero-photo-main">
        <Image src="/hero-table.jpg" alt="" fill priority unoptimized sizes="(max-width: 780px) 70vw, 260px" />
      </figure>
      <figure className="hero-photo hero-photo-dish">
        <Image src="/hero-dish.jpg" alt="" fill unoptimized sizes="(max-width: 780px) 42vw, 180px" />
      </figure>
      <figure className="hero-photo hero-photo-interior">
        <Image src="/hero-interior.jpg" alt="" fill unoptimized sizes="(max-width: 780px) 48vw, 210px" />
      </figure>
    </motion.div>
  );
}


export default function Home() {
  return <SafeServeApp />;
}

function WordGroups({ text }: { text: string }) {
  return <span className="word-groups" aria-label={text}>{text.split(/(\s+)/).map((part, index) => /^\s+$/.test(part) ? part : <span className="word-group" aria-hidden="true" key={`${part}-${index}`}>{part}</span>)}</span>;
}

function PreferenceChip({ name, kind, reducedMotion, onRemove }: { name: string; kind: "suggest" | "avoid"; reducedMotion: boolean | null; onRemove: () => void }) {
  return <motion.li
    layout={!reducedMotion}
    className={kind === "avoid" ? "preference-chip preference-chip-avoid" : "preference-chip"}
    initial={reducedMotion ? false : { opacity: 0, scale: .94, x: 8 }}
    animate={{ opacity: 1, scale: 1, x: 0 }}
    exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: .72, x: 16, filter: "blur(4px)" }}
    transition={{ duration: reducedMotion ? 0 : .38, ease: [.22, 1, .36, 1] }}
  >
    <span><WordGroups text={name} /></span>
    <button type="button" onClick={onRemove} aria-label={`Remove ${name}`}>×</button>
    {!reducedMotion && <span className="preference-particle-cloud" aria-hidden="true">{preferenceParticleOffsets.map((offset, index) => <motion.i
      key={`${offset.x}-${offset.y}`}
      initial={false}
      animate={{ opacity: 0, x: 0, y: 0, scale: .2 }}
      exit={{ opacity: [0, 1, 0], x: offset.x, y: offset.y, scale: [.2, 1, 0] }}
      transition={{ duration: .36, delay: index * .012, ease: "easeOut" }}
    />)}</span>}
  </motion.li>;
}

function HeadlineWord({ children, index, reducedMotion }: { children: string; index: number; reducedMotion: boolean | null }) {
  return <motion.span className="word-group" initial={reducedMotion ? false : { opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .65 }} transition={{ duration: reducedMotion ? 0 : .25, delay: reducedMotion ? 0 : index * .025, ease: "easeOut" }}>{children}</motion.span>;
}

function WebsitePreview({ restaurant }: { restaurant: Restaurant }) {
  const [failed, setFailed] = useState(false);
  const photoParams = new URLSearchParams({
    name: restaurant.name,
    food: restaurant.cuisine.join(" "),
    website: restaurant.website || "",
    menu: restaurant.menuSourceUrl || "",
  });
  const imageUrl = failed ? fallbackRestaurantPhoto(restaurant.name) : `/api/restaurant-image?${photoParams.toString()}`;
  return (
    <div className={`restaurant-visual ${failed ? "visual-fallback" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt={restaurant.website && !failed ? `Restaurant website image for ${restaurant.name}` : `Illustrative restaurant photo; not ${restaurant.name}`}
        onError={() => { if (!failed) setFailed(true); }}
        referrerPolicy="no-referrer"
      />
      <div className="visual-shade" />
      {(!restaurant.website || failed) && <span className="restaurant-image-caption">Illustrative photo</span>}
      <span className="distance-pill">{restaurant.locations.length} mapped {restaurant.locations.length === 1 ? "location" : "locations"}</span>
    </div>
  );
}

function RestaurantMap({ restaurants }: { restaurants: Restaurant[] }) {
  const places = restaurants.flatMap((restaurant) =>
    restaurant.locations.map((location) => ({ restaurant, location }))
  );
  const [activeIndex, setActiveIndex] = useState(0);
  if (!places.length) return null;
  const safeIndex = Math.min(activeIndex, places.length - 1);
  const active = places[safeIndex];
  const mapPosition = Number.isFinite(active.location.latitude) && Number.isFinite(active.location.longitude) ? `${active.location.latitude},${active.location.longitude}` : active.location.address;
  const mapUrl = `https://www.google.com/maps?q=${encodeURIComponent(mapPosition)}&output=embed`;

  return (
    <section className="ai-location-map" aria-label="Map of AI-researched restaurant locations">
      <div className="map-heading">
        <div><span className="section-kicker">Location overview</span><h3>Restaurant location map</h3></div>
        <p>{places.length} {places.length === 1 ? "location" : "locations"}</p>
      </div>
      <div className="map-canvas">
        <iframe src={mapUrl} title={`Map showing ${active.restaurant.name}, ${active.location.label}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
        <span className="map-watermark">Restaurant location</span>
      </div>
      <div className="map-location-choices">
        {places.map(({ restaurant, location }, index) => (
          <button type="button" className={index === safeIndex ? "active" : ""} key={`${restaurant.id}-${location.address}`} onClick={() => setActiveIndex(index)}>
            <strong>{restaurant.name}</strong><span>{location.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function LockedRestaurantCard({ index, visibleCount, onUnlock }: { index: number; visibleCount: number; onUnlock: () => void }) {
  return (
    <button type="button" className="restaurant-card locked-restaurant-card" aria-label="Unlock this Premium restaurant result" onClick={onUnlock}>
      <div className="locked-preview-image" style={{ backgroundImage: `url(${fallbackRestaurantPhotos[index % fallbackRestaurantPhotos.length]})` }} />
      <div className="restaurant-body locked-preview-body" aria-hidden="true">
        <span className="rank-number">#{visibleCount + index + 1}</span>
        <span className="locked-copy-line locked-copy-title" />
        <span className="locked-copy-line" />
        <span className="locked-copy-line locked-copy-short" />
      </div>
      <span className="locked-result-badge" aria-hidden="true">⌕</span>
      <div className="locked-result-overlay"><span aria-hidden="true">🔒</span><strong>Premium result</strong></div>
    </button>
  );
}

function LocationList({ restaurant }: { restaurant: Restaurant }) {
  return (
    <ol className="location-list">
      {restaurant.locations.map((location, index) => (
        <li key={`${location.address}-${index}`}>
          <div><strong>{location.label}</strong><span>{location.address}</span></div>
          <div className="location-links">
            <a href={location.website || location.sourceUrl} target="_blank" rel="noreferrer">{location.website ? "Restaurant website ↗" : "Map listing ↗"}</a>
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location.address)}`} target="_blank" rel="noreferrer">Directions ↗</a>
          </div>
        </li>
      ))}
    </ol>
  );
}

function AllergyReview({ restaurant }: { restaurant: Restaurant }) {
  const isFree = restaurant.source === "free";
  const isCommunity = isFree && restaurant.evidenceTier === "community";
  const isPartial = restaurant.evidenceTier === "partial";
  return (
    <div className="allergy-review">
      <div className="review-title-row"><span className="review-icon" aria-hidden="true">✦</span><div><strong>Allergen information</strong><p>{isPartial ? "Some requested allergens have no confirmed menu evidence" : "Menu information still needs direct confirmation with staff"}</p></div></div>
      <div className={`review-status ${isCommunity || isPartial || !restaurant.supportedAllergies?.length ? "unknown" : "cautiously-positive"}`}><strong>{restaurant.supportedAllergies?.length ? "Options mentioned on the website" : "Direct confirmation needed"}</strong><span>{restaurant.evidenceSummary}</span><a className="evidence-link" href={restaurant.menuSourceUrl || restaurant.sourceUrl} target="_blank" rel="noreferrer">{restaurant.menuSourceUrl ? "Open menu source ↗" : "Open map listing ↗"}</a></div>
      {Boolean(restaurant.allergenEvidence?.length) && <ul className="allergen-evidence">{restaurant.allergenEvidence!.map(item => <li key={item.allergy}><strong>{item.allergy}</strong><q>{item.quote}</q><a href={item.url} target="_blank" rel="noreferrer">Read the source ↗</a></li>)}</ul>}
    </div>
  );
}

function CitedResearch({ research }: { research: AiResearch }) {
  const citations = [...research.citations]
    .filter((citation) => citation.startIndex >= 0 && citation.endIndex <= research.summary.length)
    .sort((a, b) => a.startIndex - b.startIndex);
  const parts: React.ReactNode[] = [];
  const cleanDisplayText = (value: string) => value.replaceAll("**", "").replace(/^##\s+/gm, "");
  let cursor = 0;

  citations.forEach((citation, index) => {
    if (citation.startIndex < cursor) return;
    parts.push(cleanDisplayText(research.summary.slice(cursor, citation.startIndex)));
    parts.push(<a key={`${citation.url}-${index}`} href={citation.url} target="_blank" rel="noreferrer" title={citation.title}>[source {index + 1}]</a>);
    cursor = citation.endIndex;
  });
  parts.push(cleanDisplayText(research.summary.slice(cursor)));
  return <div className="ai-research-copy">{parts}</div>;
}

export function SafeServeApp({ searchPage = false }: { searchPage?: boolean }) {
  const router = useRouter();
  const [searchMode, setSearchMode] = useState<SearchMode>("free");
  const [location, setLocation] = useState("");
  const [selectedCoordinates, setSelectedCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  const [food, setFood] = useState("");
  const [occasion, setOccasion] = useState("");
  const [allergies, setAllergies] = useState<string[]>([]);
  const [customAllergy, setCustomAllergy] = useState("");
  const [suggestedRestaurant, setSuggestedRestaurant] = useState("");
  const [suggestedRestaurants, setSuggestedRestaurants] = useState<string[]>([]);
  const [avoidedRestaurant, setAvoidedRestaurant] = useState("");
  const [avoidedRestaurants, setAvoidedRestaurants] = useState<string[]>([]);
  const [freeSearchesRemaining, setFreeSearchesRemaining] = useState<number | null>(3);
  const [freeSearchesLimit, setFreeSearchesLimit] = useState(3);
  const [premiumAccess, setPremiumAccess] = useState(false);
  const [accountAccessLoaded, setAccountAccessLoaded] = useState(false);
  const [cityCatalog, setCityCatalog] = useState<string[]>([]);
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [foodPickerOpen, setFoodPickerOpen] = useState(false);
  const [suggestionMenuOpen, setSuggestionMenuOpen] = useState(false);
  const [suggestionMode, setSuggestionMode] = useState<"suggest" | "avoid">("suggest");
  const [suggestionMessage, setSuggestionMessage] = useState("");
  const [suggestionFeedback, setSuggestionFeedback] = useState<SuggestionFeedback>("idle");
  const [suggestionSaving, setSuggestionSaving] = useState(false);
  const [suggestionAccountRequired, setSuggestionAccountRequired] = useState(false);
  const [restaurantLookup, setRestaurantLookup] = useState<RestaurantLookup[]>([]);
  const [restaurantLookupLoading, setRestaurantLookupLoading] = useState(false);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [lockedResultCount, setLockedResultCount] = useState(0);
  const [cacheStatus, setCacheStatus] = useState<"hit" | "miss" | "">("");
  const [selected, setSelected] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(searchPage);
  const [loadingStage, setLoadingStage] = useState(0);
  const [error, setError] = useState("");
  const [searchedLocation, setSearchedLocation] = useState("");
  const [agentQuery, setAgentQuery] = useState("");
  const [aiProvider, setAiProvider] = useState("");
  const [aiResearch, setAiResearch] = useState<Record<string, AiResearch>>({});
  const [aiLoadingId, setAiLoadingId] = useState("");
  const [aiError, setAiError] = useState("");
  const shouldReduceMotion = useReducedMotion();
  const initialSearchStarted = useRef(false);
  const searchRequest = useRef<AbortController | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  useEffect(() => () => searchRequest.current?.abort(), []);
  useEffect(() => {
    if (searchPage) return;
    const draft = window.history.state?.safeServeDraft;
    if (draft && typeof draft === "object") {
      if (typeof draft.location === "string") setLocation(draft.location.slice(0, 160));
      if (typeof draft.food === "string") setFood(draft.food.slice(0, 160));
      if (Array.isArray(draft.allergies)) setAllergies(draft.allergies.filter((name: unknown): name is string => typeof name === "string" && Boolean(name.trim())).slice(0, 100));
      const coordinates = draft.coordinates;
      if (coordinates && Number.isFinite(coordinates.latitude) && Math.abs(coordinates.latitude) <= 90 && Number.isFinite(coordinates.longitude) && Math.abs(coordinates.longitude) <= 180) setSelectedCoordinates(coordinates);
    }
    setDraftReady(true);
  }, [searchPage]);
  useEffect(() => {
    if (searchPage || !draftReady) return;
    window.history.replaceState({ ...window.history.state, safeServeDraft: { location, food, allergies, coordinates: selectedCoordinates } }, "");
  }, [searchPage, draftReady, location, food, allergies, selectedCoordinates]);
  useDialogFocus(locationPickerOpen || foodPickerOpen || suggestionMenuOpen || Boolean(selected), () => {
    setLocationPickerOpen(false);
    setFoodPickerOpen(false);
    setSuggestionMenuOpen(false);
    setSelected(null);
  });
  const indexedCities = useMemo(() => cityCatalog.map(city => ({ city, normalized: normalizeCitySearch(city) })), [cityCatalog]);
  const cityOptions = useMemo(() => {
    const query = normalizeCitySearch(location.trim());
    if (query.length < 2) return [];
    const startsWith: string[] = [];
    const includes: string[] = [];
    for (const { city, normalized } of indexedCities) {
      if (normalized.startsWith(query)) startsWith.push(city);
      else if (includes.length < 8 && normalized.includes(query)) includes.push(city);
      if (startsWith.length === 8) break;
    }
    return [...startsWith, ...includes].slice(0, 8);
  }, [indexedCities, location]);

  useEffect(() => {
    let active = true;
    void fetch("/city-catalog.txt")
      .then((response) => response.ok ? response.text() : "")
      .then((text) => {
        if (!active || !text) return;
        const cities = Array.from(new Set(text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)));
        setCityCatalog(cities);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  function toggleAllergy(allergy: string) {
    setAllergies((current) => current.includes(allergy) ? current.filter((item) => item !== allergy) : [...current, allergy]);
  }
  function addCustomAllergy() {
    const value = customAllergy.trim();
    if (value && !allergies.some((item) => item.toLowerCase() === value.toLowerCase())) setAllergies((current) => [...current, value]);
    setCustomAllergy("");
  }
  function updateLocation(value: string) {
    setLocation(value);
    setSelectedCoordinates(null);
  }
  function selectGlobeLocation(selection: GlobeSelection) {
    const label = cityOnlySearchLocation(selection.label);
    setLocation(label);
    setSelectedCoordinates({ latitude: selection.latitude, longitude: selection.longitude });
    setLocationPickerOpen(false);
    if (searchPage) applySearchFilters({ location: label });
  }

  function selectFood(value: string) {
    setFood(value);
    setFoodPickerOpen(false);
    if (searchPage) applySearchFilters({ food: value });
  }

  function publicSearchParams(values: { location?: string; food?: string; mode?: SearchMode } = {}) {
    const nextLocation = cityOnlySearchLocation(values.location ?? location);
    const nextFood = (values.food ?? food).trim();
    const params = new URLSearchParams();
    if (nextLocation) params.set("location", nextLocation);
    if (nextFood) params.set("food", nextFood);
    if (occasion) params.set("occasion", occasion);
    if (allergies.length) params.set("allergies", allergies.join("|"));
    if (suggestedRestaurants.length) params.set("suggestedRestaurants", suggestedRestaurants.join("|"));
    if (avoidedRestaurants.length) params.set("avoidedRestaurants", avoidedRestaurants.join("|"));
    params.set("mode", values.mode ?? searchMode);
    return params;
  }

  function applySearchFilters(values: { location?: string; food?: string }) {
    const nextLocation = cityOnlySearchLocation(values.location ?? location);
    const nextFood = (values.food ?? food).trim();
    if (values.location !== undefined) {
      setLocation(nextLocation);
      setSelectedCoordinates(null);
    }
    if (values.food !== undefined) setFood(nextFood);
    if (!searchPage || !nextLocation) return;
    const params = publicSearchParams({ location: nextLocation, food: nextFood });
    window.history.pushState({ ...window.history.state }, "", `/search?${params.toString()}`);
    void runSearch(params, nextLocation, { mode: searchMode, food: nextFood, occasion, allergies, suggestedRestaurants, avoidedRestaurants });
  }

  function premiumReturnPath() {
    const params = new URLSearchParams();
    if (location.trim()) params.set("location", cityOnlySearchLocation(location));
    params.set("mode", "premium");
    if (food.trim()) params.set("food", food.trim());
    if (allergies.length) params.set("allergies", allergies.join("|"));
    return `/search?${params.toString()}`;
  }

  function openPremium(reason: "switch" | "locked" | "limit" | "community") {
    const params = new URLSearchParams({ reason, return: premiumReturnPath() });
    router.push(`/premium?${params.toString()}`);
  }

  async function runSearch(params: URLSearchParams, label: string, overrides?: { mode: SearchMode; food: string; occasion: string; allergies: string[]; suggestedRestaurants: string[]; avoidedRestaurants: string[] }) {
    searchRequest.current?.abort();
    const controller = new AbortController();
    searchRequest.current = controller;
    const activeMode = overrides?.mode ?? searchMode;
    const activeFood = overrides?.food ?? food;
    const activeOccasion = overrides?.occasion ?? occasion;
    const activeAllergies = overrides?.allergies ?? allergies;
    const activeSuggestions = overrides?.suggestedRestaurants ?? suggestedRestaurants;
    const activeAvoids = overrides?.avoidedRestaurants ?? avoidedRestaurants;
    params.set("mode", activeMode);
    if (activeFood.trim()) params.set("food", activeFood.trim());
    if (activeOccasion) params.set("occasion", activeOccasion.toLowerCase());
    if (activeAllergies.length) params.set("allergies", activeAllergies.join("|"));
    if (activeSuggestions.length) params.set("suggestedRestaurants", activeSuggestions.join("|"));
    if (activeAvoids.length) params.set("avoidedRestaurants", activeAvoids.join("|"));
    setLoading(true); setLoadingStage(0); setError(""); setSelected(null); setLockedResultCount(0); setCacheStatus(""); setAiProvider("");
    try {
      const response = await fetch(`/api/restaurants?${params.toString()}`, { signal: controller.signal });
      const data = await readJson<{ freeSearchesRemaining?: number | null; freeSearchesLimit?: number; premiumAccess?: boolean; premiumRequired?: boolean; error?: string; restaurants: Restaurant[]; lockedResultCount?: number; cacheStatus?: string; location?: string; agentQuery?: string; aiProvider?: string }>(response);
      if (controller.signal.aborted) return;
      if (typeof data.freeSearchesRemaining === "number" || data.freeSearchesRemaining === null) setFreeSearchesRemaining(data.freeSearchesRemaining);
      if (typeof data.freeSearchesLimit === "number") setFreeSearchesLimit(data.freeSearchesLimit);
      if (data.premiumAccess === true) setPremiumAccess(true);
      if ((response.status === 402 || response.status === 429) && data.premiumRequired) {
        if (response.status === 402) {
          setPremiumAccess(false);
          setSearchMode("free");
        }
        throw new Error(data.error || (response.status === 429
          ? "You have used today's Free searches. Choose Premium if you want unlimited searches."
          : "Premium is not active on this account. Free search is still available."));
      }
      if (!response.ok) throw new Error(data.error || "Restaurant search failed.");
      setRestaurants(data.restaurants);
      setLockedResultCount(typeof data.lockedResultCount === "number" ? data.lockedResultCount : 0);
      setCacheStatus(data.cacheStatus === "hit" ? "hit" : data.cacheStatus === "miss" ? "miss" : "");
      setSearchedLocation(data.location || label);
      setAgentQuery(data.agentQuery || "");
      setAiProvider(data.aiProvider || "");
      if (!data.restaurants.length) setError(activeMode === "free" ? "No nearby food-relevant restaurants could be researched right now. Try the city name, a broader food, or search again in a moment." : "Not enough restaurants could be researched for this search. Try a broader food or location.");
    } catch (searchError) {
      if (controller.signal.aborted) return;
      setRestaurants([]);
      setLockedResultCount(0);
      setAiProvider("");
      setError(searchError instanceof Error ? searchError.message : "Restaurant search failed.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  function submitSearch(event: FormEvent) {
    event.preventDefault();
    if (!location.trim()) { setError("Enter a city, neighborhood, or ZIP code first."); return; }
    const searchLocation = cityOnlySearchLocation(location);
    if (searchLocation !== location) setLocation(searchLocation);
    if (!searchPage) {
      const query = new URLSearchParams({ location: searchLocation, mode: searchMode });
      if (food.trim()) query.set("food", food.trim());
      if (occasion) query.set("occasion", occasion);
      if (allergies.length) query.set("allergies", allergies.join("|"));
      if (suggestedRestaurants.length) query.set("suggestedRestaurants", suggestedRestaurants.join("|"));
      if (avoidedRestaurants.length) query.set("avoidedRestaurants", avoidedRestaurants.join("|"));
      window.location.assign(`/search?${query.toString()}`);
      return;
    }
    applySearchFilters({ location: searchLocation, food });
  }

  function upgradeAndSearch() {
    if (!premiumAccess) {
      openPremium("locked");
      return;
    }
    const searchLocation = cityOnlySearchLocation(location);
    const params = new URLSearchParams({ location: searchLocation });
    setSearchMode("premium");
    void runSearch(params, searchLocation, { mode: "premium", food, occasion, allergies, suggestedRestaurants, avoidedRestaurants });
  }

  function applyPreferenceData(data: { suggestedRestaurants?: string[]; avoidedRestaurants?: string[] }) {
    if (Array.isArray(data.suggestedRestaurants)) setSuggestedRestaurants(data.suggestedRestaurants);
    if (Array.isArray(data.avoidedRestaurants)) setAvoidedRestaurants(data.avoidedRestaurants);
  }

  function preferenceContext() {
    const selectedAllergies = allergies.map((allergy) => allergy.trim()).filter(Boolean);
    return {
      location: location.trim(),
      food: food.trim(),
      allergies: selectedAllergies,
      allergyScope: selectedAllergies.join("|"),
      allergiesText: selectedAllergies.join("|"),
    };
  }

  function preferenceQuery() {
    const params = new URLSearchParams();
    if (location.trim()) params.set("location", location.trim());
    if (food.trim()) params.set("food", food.trim());
    if (allergies.length) params.set("allergies", allergies.join("|"));
    return params.toString();
  }

  function preferenceQueryFromContext(context: ReturnType<typeof preferenceContext>) {
    const params = new URLSearchParams();
    if (context.location) params.set("location", context.location);
    if (context.food) params.set("food", context.food);
    if (context.allergies.length) params.set("allergies", context.allergies.join("|"));
    return params.toString();
  }

  async function removePreference(kind: "suggest" | "avoid", value: string) {
    const context = preferenceContext();
    const query = preferenceQueryFromContext(context);
    if (kind === "suggest") setSuggestedRestaurants((current) => current.filter((item) => item !== value));
    else setAvoidedRestaurants((current) => current.filter((item) => item !== value));
    try {
      const response = await fetch(`/api/suggestions${query ? `?${query}` : ""}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, name: value, ...context }),
      });
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(responseString(data, "error") || "Could not remove that preference.");
      applyPreferenceData(data);
      setSuggestionMessage(responseString(data, "message") || "Preference removed.");
      setSuggestionFeedback("success");
    } catch (preferenceError) {
      setSuggestionMessage(preferenceError instanceof Error ? preferenceError.message : "Could not remove that preference.");
      setSuggestionFeedback("error");
    }
  }

  function removeSuggestion(value: string) {
    void removePreference("suggest", value);
  }

  function removeAvoidedRestaurant(value: string) {
    void removePreference("avoid", value);
  }

  async function savePreference(kind: "suggest" | "avoid") {
    const value = (kind === "suggest" ? suggestedRestaurant : avoidedRestaurant).trim();
    const context = preferenceContext();
    if (!value) {
      setSuggestionMessage("Enter a restaurant name first.");
      setSuggestionFeedback("warning");
      return;
    }
    const contextWarning = !context.location && !context.allergies.length
      ? "Add a location and choose at least one allergy before making suggestions/avoids."
      : !context.location
        ? "Add a location before making suggestions/avoids."
        : !context.allergies.length
          ? "Choose at least one allergy before making suggestions/avoids."
          : "";
    if (contextWarning) {
      setSuggestionMessage(contextWarning);
      setSuggestionFeedback("warning");
      return;
    }
    const previousSuggestedRestaurants = suggestedRestaurants;
    const previousAvoidedRestaurants = avoidedRestaurants;
    const query = preferenceQueryFromContext(context);
    setSuggestionSaving(true);
    setSuggestionFeedback("saving");
    setSuggestionMessage(kind === "suggest" ? `Adding ${value}...` : `Avoiding ${value}...`);
    if (kind === "suggest") {
      setSuggestedRestaurants((current) => current.some((item) => item.toLowerCase() === value.toLowerCase()) ? current : [value, ...current].slice(0, 8));
    } else {
      setAvoidedRestaurants((current) => current.some((item) => item.toLowerCase() === value.toLowerCase()) ? current : [value, ...current].slice(0, 8));
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`/api/suggestions${query ? `?${query}` : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ kind, name: value, ...context }),
      });
      const data = await readJsonResponse(response);
      if (typeof data.freeSearchesRemaining === "number") setFreeSearchesRemaining(data.freeSearchesRemaining);
      if (typeof data.freeSearchesLimit === "number") setFreeSearchesLimit(data.freeSearchesLimit);
      if (!response.ok) {
        if (data.premiumRequired) openPremium("community");
        throw new Error(responseString(data, "error") || "Could not save that suggestion.");
      }
      applyPreferenceData(data);
      if (kind === "suggest") setSuggestedRestaurant("");
      else setAvoidedRestaurant("");
      setSuggestionAccountRequired(false);
      setSuggestionMessage(responseString(data, "message") || "Suggestion saved.");
      setSuggestionFeedback(data.feedbackTone === "favorable"
        ? "favorable"
        : data.feedbackTone === "blocked"
          ? "blocked"
          : data.feedbackTone === "caution" || Array.isArray(data.unverifiedSuggestions) && data.unverifiedSuggestions.length
            ? "caution"
            : data.bonusGranted ? "success" : "warning");
      if (searchPage && location.trim()) {
        const nextSuggestions = Array.isArray(data.suggestedRestaurants) ? data.suggestedRestaurants as string[] : suggestedRestaurants;
        const nextAvoids = Array.isArray(data.avoidedRestaurants) ? data.avoidedRestaurants as string[] : avoidedRestaurants;
        setSuggestionMenuOpen(false);
        const searchLocation = cityOnlySearchLocation(location);
        void runSearch(new URLSearchParams({ location: searchLocation }), searchLocation, { mode: "premium", food, occasion, allergies, suggestedRestaurants: nextSuggestions, avoidedRestaurants: nextAvoids });
      }
    } catch (suggestionError) {
      setSuggestedRestaurants(previousSuggestedRestaurants);
      setAvoidedRestaurants(previousAvoidedRestaurants);
      const message = suggestionError instanceof Error && suggestionError.name === "AbortError"
        ? "Saving took too long. Finish the current restaurant search, then try again."
        : suggestionError instanceof Error ? suggestionError.message : "Could not save that suggestion.";
      if (/account/i.test(message)) setSuggestionAccountRequired(true);
      setSuggestionMessage(message);
      setSuggestionFeedback(/^Not a fit:/i.test(message) ? "blocked" : "error");
    } finally {
      window.clearTimeout(timeout);
      setSuggestionSaving(false);
    }
  }

  async function saveSuggestion() {
    await savePreference("suggest");
  }

  async function saveAvoidedRestaurant() {
    await savePreference("avoid");
  }

  function selectRestaurantLookup(restaurant: RestaurantLookup) {
    if (suggestionMode === "suggest") setSuggestedRestaurant(restaurant.name);
    else setAvoidedRestaurant(restaurant.name);
    if (!location.trim() && restaurant.location) updateLocation(restaurant.location);
    setSuggestionMessage("");
    setSuggestionFeedback("idle");
    setRestaurantLookup([]);
  }

  useEffect(() => {
    if (!loading) return;
    const timer = window.setInterval(() => setLoadingStage((stage) => Math.min(loadingSteps.length - 1, stage + 1)), 950);
    return () => window.clearInterval(timer);
  }, [loading]);

  useEffect(() => {
    const query = (suggestionMode === "suggest" ? suggestedRestaurant : avoidedRestaurant).trim();
    if (!suggestionMenuOpen || query.length < 2) {
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setRestaurantLookupLoading(true);
      const params = new URLSearchParams({ q: query });
      if (location.trim()) params.set("location", location.trim());
      fetch(`/api/restaurant-lookup?${params.toString()}`, { signal: controller.signal, cache: "no-store" })
        .then((response) => readJson<{ restaurants?: RestaurantLookup[] }>(response))
        .then((data: { restaurants?: RestaurantLookup[] }) => setRestaurantLookup(Array.isArray(data.restaurants) ? data.restaurants : []))
        .catch(() => {
          if (!controller.signal.aborted) setRestaurantLookup([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setRestaurantLookupLoading(false);
        });
    }, 260);
    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [suggestionMenuOpen, suggestionMode, suggestedRestaurant, avoidedRestaurant, location]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/subscription", { cache: "no-store" })
      .then((response) => readJson<{ premium?: boolean }>(response))
      .then((data) => {
        if (!cancelled) {
          const hasPremium = Boolean(data.premium);
          setPremiumAccess(hasPremium);
          if (!hasPremium) {
            setSuggestedRestaurants([]);
            setAvoidedRestaurants([]);
          }
        }
      })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setAccountAccessLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!searchPage) return;
    const timer = window.setTimeout(() => router.prefetch("/premium"), 700);
    return () => window.clearTimeout(timer);
  }, [router, searchPage]);

  useEffect(() => {
    if (!premiumAccess) return;
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      const query = preferenceQuery();
      fetch(`/api/suggestions${query ? `?${query}` : ""}`, { cache: "no-store" })
        .then((response) => readJsonResponse(response))
        .then((data) => {
          if (cancelled) return;
          setSuggestionAccountRequired(!data.authenticated);
          applyPreferenceData(data);
        })
        .catch(() => {
          if (!cancelled) setSuggestionAccountRequired(true);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
    // Reload saved chips when the preference context changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, food, allergies.join("|"), premiumAccess]);
  useEffect(() => {
    if (!searchPage || !accountAccessLoaded || initialSearchStarted.current) return;
    initialSearchStarted.current = true;
    const query = new URLSearchParams(window.location.search);
    const initialLocation = query.get("location")?.trim() ?? "";
    const initialFood = query.get("food")?.trim() ?? "";
    const initialOccasion = query.get("occasion")?.trim() ?? "";
    const initialAllergies = (query.get("allergies") ?? "").split("|").map((item) => item.trim()).filter(Boolean);
    const initialSuggestions = [
      query.get("suggestedRestaurants") || "",
      query.get("suggestedRestaurant") || "",
    ].join("|").split("|").map((item) => item.trim()).filter(Boolean).slice(0, 8);
    const initialAvoids = [
      query.get("avoidedRestaurants") || "",
      query.get("avoidedRestaurant") || "",
    ].join("|").split("|").map((item) => item.trim()).filter(Boolean).slice(0, 8);
    const initialMode: SearchMode = premiumAccess ? "premium" : "free";
    const usableSuggestions = premiumAccess ? initialSuggestions : [];
    const usableAvoids = premiumAccess ? initialAvoids : [];
    let cleanedLegacyCoordinates = false;
    if (query.has("lat") || query.has("lon")) {
      query.delete("lat");
      query.delete("lon");
      cleanedLegacyCoordinates = true;
    }
    if (!premiumAccess && query.get("mode") === "premium") {
      query.set("mode", "free");
      cleanedLegacyCoordinates = true;
    }
    if (cleanedLegacyCoordinates) {
      window.history.replaceState(null, "", `/search?${query.toString()}`);
    }
    queueMicrotask(() => {
      setLocation(initialLocation);
      setFood(initialFood);
      setOccasion(initialOccasion);
      setAllergies(initialAllergies);
      setSuggestedRestaurants(usableSuggestions);
      setAvoidedRestaurants(usableAvoids);
      setSearchMode(initialMode);
      setSelectedCoordinates(null);
      if (!initialLocation) {
        setLoading(false);
        setError("Enter a city, neighborhood, or ZIP code to begin searching.");
        return;
      }
      const initialParams = new URLSearchParams({ location: initialLocation });
      void runSearch(initialParams, initialLocation, { mode: initialMode, food: initialFood, occasion: initialOccasion, allergies: initialAllergies, suggestedRestaurants: usableSuggestions, avoidedRestaurants: usableAvoids });
    });
    // This initialization intentionally runs only once for the URL that opened the search page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchPage, accountAccessLoaded, premiumAccess]);

  function useMyLocation() {
    if (!navigator.geolocation) { setError("Location services are not supported by this browser."); return; }
    setLoading(true); setError("");
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const reverseUrl = new URL("https://nominatim.openstreetmap.org/reverse");
          reverseUrl.searchParams.set("format", "jsonv2");
          reverseUrl.searchParams.set("lat", String(coords.latitude));
          reverseUrl.searchParams.set("lon", String(coords.longitude));
          reverseUrl.searchParams.set("zoom", "10");
          reverseUrl.searchParams.set("addressdetails", "1");
          const response = await fetch(reverseUrl);
          const place = await response.json() as { address?: Record<string, string>; display_name?: string };
          const address = place.address || {};
          const city = address.city || address.town || address.village || address.county || address.state || place.display_name?.split(",")[0]?.trim() || "";
          const resolvedLocation = [city, address.country].filter(Boolean).join(", ");
          if (!resolvedLocation) throw new Error("No city found.");
          setLocation(resolvedLocation);
          setSelectedCoordinates({ latitude: coords.latitude, longitude: coords.longitude });
          applySearchFilters({ location: resolvedLocation });
        } catch {
          setLoading(false);
          setError("We found your position, but not a city name. Enter a city or ZIP code instead.");
        }
      },
      () => { setLoading(false); setError("We could not access your location. Enter a city or ZIP code instead."); },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }
  async function researchRestaurant(restaurant: Restaurant) {
    setAiLoadingId(restaurant.id); setAiError("");
    try {
      const response = await fetch("/api/restaurant-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurant, allergies, food, occasion }),
      });
      const data = await readJson<AiResearch & { error?: string }>(response);
      if (!response.ok) throw new Error(data.error || "AI research failed.");
      setAiResearch((current) => ({ ...current, [restaurant.id]: data as AiResearch }));
    } catch (researchError) {
      setAiError(researchError instanceof Error ? researchError.message : "AI research failed.");
    } finally {
      setAiLoadingId("");
    }
  }

  const visibleSuggestionMessage = suggestionMessage;
  const activeRestaurantLookupQuery = (suggestionMode === "suggest" ? suggestedRestaurant : avoidedRestaurant).trim();
  const quickAllergyOptions = allergyOptions.filter((allergy) => ["Peanuts", "Tree nuts", "Milk", "Eggs", "Wheat", "Gluten"].includes(allergy));
  const visibleAllergyOptions = [...quickAllergyOptions, ...allergies.filter((allergy) => !quickAllergyOptions.includes(allergy))];

  if (!searchPage) {
    return <AllergyQuest
      allergies={allergies}
      customAllergy={customAllergy}
      location={location}
      food={food}
      cityOptions={cityOptions}
      allergyOptions={allergyOptions}
      reducedMotion={shouldReduceMotion}
      onToggleAllergy={toggleAllergy}
      onCustomAllergyChange={setCustomAllergy}
      onLocationChange={updateLocation}
      onGlobeLocationSelect={selectGlobeLocation}
      onFoodChange={setFood}
      onStart={(foodOverride) => {
        if (!location.trim()) return;
        const selectedFood = foodOverride ?? food;
        const query = new URLSearchParams({ location: location.trim(), mode: searchMode });
        if (selectedFood.trim()) query.set("food", selectedFood.trim());
        if (allergies.length) query.set("allergies", allergies.join("|"));
        window.location.assign(`/search?${query.toString()}`);
      }}
    />;
  }

  return (
    <main className={searchPage ? "search-page" : undefined}>
      <motion.header className="site-header" initial={shouldReduceMotion ? false : { opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .3, ease: [.22, 1, .36, 1] }}>
        <Link className="brand" href="/" aria-label="Return to the Gluten FreEat start page"><span className="brand-symbol"><SafeServeMark /></span><BrandWordmark /></Link>
        <AccountControls />
      </motion.header>

      {searchPage && <div className="ambient-scene" aria-hidden="true"><span className="ambient-orb ambient-orb-one" /><span className="ambient-orb ambient-orb-two" /><span className="ambient-orb ambient-orb-three" /><span className="ambient-shape ambient-dot-matrix" /><span className="ambient-shape ambient-aurora" /><span className="ambient-shape ambient-arc" /></div>}

      <section className={searchPage ? "hero search-workspace-hero" : "hero"} id="top">
        {!searchPage && <>
        <motion.div className="hero-copy" initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .35 }} transition={{ duration: .28, ease: "easeOut" }}>
          <motion.p className="brand-catchphrase" initial={shouldReduceMotion ? false : { opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, amount: .7 }} transition={{ duration: .22 }}><WordGroups text="Can I Eat It?" /></motion.p>
          <h1 className="animated-headline" aria-label="Find a table that fits you."><span className="headline-line" aria-hidden="true">{["Find", "a", "table", "that"].map((word, index) => <HeadlineWord key={word} index={index} reducedMotion={shouldReduceMotion}>{word}</HeadlineWord>)}</span><br /><motion.em className="word-group fits-you" aria-hidden="true" initial={shouldReduceMotion ? false : { opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} whileHover={shouldReduceMotion ? undefined : { y: -2, fontWeight: 500 }} viewport={{ once: true, amount: .65 }} transition={{ duration: shouldReduceMotion ? 0 : .25, delay: shouldReduceMotion ? 0 : .1, ease: "easeOut" }}>fits you.</motion.em></h1>
        </motion.div>

        <HeroImageLayers reducedMotion={shouldReduceMotion} />
        </>}

        <motion.div className="search-card-shell" initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .18 }} transition={{ duration: shouldReduceMotion ? 0 : .28, ease: "easeOut" }}>
        <form className="search-card" onSubmit={submitSearch}>
          <motion.div className="card-heading" initial={shouldReduceMotion ? false : { opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true, amount: .7 }} transition={{ duration: .2 }}>
            <h2><WordGroups text="Find a table" /></h2>
            <motion.span key={`${freeSearchesRemaining}-${searchMode}-${premiumAccess}`} className="search-credit-pill heading-credit-pill" initial={shouldReduceMotion ? false : { opacity: 0, scale: .92, y: -3 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: .18, ease: "easeOut" }}><WordGroups text={freeSearchesRemaining === null || (premiumAccess && searchMode === "premium") ? "Unlimited" : `${freeSearchesRemaining ?? freeSearchesLimit} left`} /></motion.span>
          </motion.div>
          <div className="search-mode-switch" aria-label="Search mode">
            <button type="button" className={searchMode === "free" ? "active" : ""} aria-pressed={searchMode === "free"} onClick={() => { setSearchMode("free"); setRestaurants([]); setLockedResultCount(0); setSelected(null); setError(""); }}>
              <span><small>Included</small><strong>Free</strong></span>
              <b>{searchMode === "free" ? "Selected" : "Use"}</b>
            </button>
            <button type="button" className={searchMode === "premium" ? "active premium" : "premium"} aria-pressed={searchMode === "premium"} onClick={() => { if (!premiumAccess) { openPremium("switch"); return; } setSearchMode("premium"); setRestaurants([]); setLockedResultCount(0); setSelected(null); setError(""); }}>
              <span><small>{premiumAccess ? "Unlimited" : "Upgrade"}</small><strong>Premium</strong></span>
              <b>{premiumAccess ? (searchMode === "premium" ? "Selected" : "Use") : "View"}</b>
            </button>
          </div>
          <label id="location-picker-label"><WordGroups text="Where are you dining?" /></label>
          <button type="button" id="search-location-button" className="location-picker-button" onClick={() => setLocationPickerOpen(true)} aria-labelledby="location-picker-label" aria-haspopup="dialog" aria-expanded={locationPickerOpen} aria-controls="search-location-picker">
            <span className="location-picker-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2.5" /></svg></span>
            <strong>{location || "Choose a city or country"}</strong>
            <span className="location-picker-action" aria-hidden="true">↗</span>
          </button>
          <datalist id="city-catalog-options">{cityOptions.map((city) => <option value={city} key={city} />)}</datalist>
          <label className="food-label" htmlFor="food"><WordGroups text="What food are you craving?" /></label>
          <div className="food-row food-picker-row"><span className="input-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg></span><input id="food" value={food} onChange={(event) => setFood(event.target.value)} placeholder="Pizza, burgers, sushi, tacos…" /><button type="button" className="food-picker-button" onClick={() => setFoodPickerOpen(true)} aria-label="Browse meals and cuisines" aria-haspopup="dialog" aria-expanded={foodPickerOpen} aria-controls="search-food-picker"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 14h16" /><path d="M6 14a6 6 0 0 1 12 0" /><path d="M12 6V4" /><path d="M3 18h18" /></svg></button></div>
          <div className="allergy-label-row"><label><WordGroups text="Allergy filters" /></label><WordGroups text={`${allergies.length} selected`} /></div>
          {searchPage ? <div className="selected-allergy-column" aria-label="Selected allergies">
            <AnimatePresence initial={false}>
              {allergies.length ? allergies.map((allergy) => (
                <motion.button type="button" key={allergy} className="selected-allergy-pill" onClick={() => toggleAllergy(allergy)} aria-label={`Remove ${allergy}`} initial={shouldReduceMotion ? false : { opacity: 0, x: 14, scale: .94 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={shouldReduceMotion ? undefined : { opacity: 0, x: 28, scale: .78, filter: "blur(3px)" }} transition={{ duration: shouldReduceMotion ? 0 : .2, ease: "easeOut" }} whileTap={shouldReduceMotion ? undefined : { scale: .95 }}>
                  <WordGroups text={allergy} /><b>×</b>
                </motion.button>
              )) : <motion.p className="selected-allergy-empty" initial={shouldReduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }}><WordGroups text="No allergy filters selected" /></motion.p>}
            </AnimatePresence>
            <div className="custom-allergy-row search-allergy-add"><input value={customAllergy} onChange={(event) => setCustomAllergy(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCustomAllergy(); } }} placeholder="Add allergy" aria-label="Add another allergy" /><button type="button" onClick={addCustomAllergy}><WordGroups text="Add" /></button></div>
          </div> : <>
            <div className="allergy-grid">
              {visibleAllergyOptions.map((allergy) => <motion.button type="button" key={allergy} className={allergies.includes(allergy) ? "allergy-chip selected" : "allergy-chip"} onClick={() => toggleAllergy(allergy)} aria-pressed={allergies.includes(allergy)} whileTap={shouldReduceMotion ? undefined : { scale: .94 }} transition={{ duration: .12 }}><span className="allergy-chip-icon">{allergies.includes(allergy) ? "✓" : "+"}</span><WordGroups text={allergy} /></motion.button>)}
            </div>
            <div className="custom-allergy-row"><input value={customAllergy} onChange={(event) => setCustomAllergy(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCustomAllergy(); } }} placeholder="Add another allergy" aria-label="Add another allergy" /><button type="button" onClick={addCustomAllergy}><WordGroups text="Add" /></button></div>
          </>}
          {premiumAccess && <button type="button" className="preference-manager-trigger" onClick={() => { setSuggestionMenuOpen(true); setRestaurantLookup([]); }} aria-haspopup="dialog" aria-expanded={suggestionMenuOpen}>
            <span aria-hidden="true">♥</span>
            <strong><WordGroups text="Suggestions and avoids" /></strong>
            {(suggestedRestaurants.length > 0 || avoidedRestaurants.length > 0) && <small>{suggestedRestaurants.length} · {avoidedRestaurants.length}</small>}
            <b aria-hidden="true">→</b>
          </button>}
          <button className="primary-button" type="submit" disabled={loading}>{loading ? <><span className="spinner" /><WordGroups text="Finding matches…" /></> : <><WordGroups text="Find restaurants" /> <span>→</span></>}</button>
        </form>
        </motion.div>
      </section>

      <section className="results-section" aria-live="polite" aria-busy={loading}>
        {error && <div className="message-banner"><span>!</span><div><p>{error}</p>{freeSearchesRemaining === 0 && !premiumAccess && <button type="button" onClick={() => openPremium("limit")}>View Premium plans <b aria-hidden="true">→</b></button>}</div></div>}
        {loading ? <motion.div className="search-loading-screen" initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="search-loading-orbit" aria-hidden="true"><span /><i /><b /></div>
          <h2><WordGroups text="Finding matches" /></h2>
          <p><WordGroups text={`Checking ${[location, food, occasion, allergies.join(", ")].filter(Boolean).join(" · ")}`} /></p>
          <div className="search-loading-progress" aria-hidden="true">
            <div className="search-progress-bar"><span style={{ width: `${((loadingStage + 1) / loadingSteps.length) * 100}%` }} /></div>
            <div className="search-progress-steps">{loadingSteps.map((step, index) => <div key={step} className={index < loadingStage ? "done" : index === loadingStage ? "active" : ""}><i>{index + 1}</i><span>{step}</span></div>)}</div>
          </div>
        </motion.div> : restaurants.length > 0 ? <>
          <motion.div className="results-heading" initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .3 }} transition={{ duration: .25, ease: "easeOut" }}><div><motion.span className="section-kicker" initial={shouldReduceMotion ? false : { opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true, amount: .7 }} transition={{ duration: .2 }}><WordGroups text={agentQuery || [food, occasion].filter(Boolean).join(" · ") || "Restaurant research"} /></motion.span><motion.h2 className="living-heading" initial={shouldReduceMotion ? false : { opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true, amount: .55 }} transition={{ duration: .22 }}><WordGroups text={`Best matches around ${searchedLocation}`} /></motion.h2></div>{aiProvider && <motion.span className="ai-provider-pill" initial={shouldReduceMotion ? false : { opacity: 0, scale: .94, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: .18, ease: "easeOut" }}><WordGroups text={`AI: ${aiProvider}`} /></motion.span>}</motion.div>
          <div className="restaurant-grid">{restaurants.map((restaurant, index) => <motion.button type="button" className="restaurant-card" key={restaurant.id} onClick={() => setSelected(restaurant)} aria-label={`Review ${restaurant.name} details`} aria-haspopup="dialog" aria-expanded={selected?.id === restaurant.id} initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .18 }} transition={{ duration: .25, delay: shouldReduceMotion ? 0 : (index % 3) * .025, ease: "easeOut" }} whileTap={shouldReduceMotion ? undefined : { scale: .99 }}>
            <WebsitePreview restaurant={restaurant} />
            <div className="restaurant-body">
              <div className="restaurant-title-row"><div><span className="rank-number">#{index + 1}</span><h3><WordGroups text={restaurant.name} /></h3><p><WordGroups text={restaurant.cuisine.length ? restaurant.cuisine.join(" · ") : "Restaurant"} /></p></div></div>
              <p className="ranking-reason">{restaurant.rankingReason}</p>
              <ul className="branch-preview">{restaurant.locations.slice(0, 3).map((branch) => <li key={branch.address}><strong>{branch.label}</strong><span>{branch.address}</span></li>)}</ul>
              {restaurant.locations.length > 3 && <p className="more-locations">+ {restaurant.locations.length - 3} more locations</p>}
              <span className="details-button"><WordGroups text="Review all locations" /> <span>→</span></span>
            </div>
          </motion.button>)}{searchMode === "free" && Array.from({ length: Math.min(3, lockedResultCount) }, (_, index) => <LockedRestaurantCard key={`locked-${index}`} index={index} visibleCount={restaurants.length} onUnlock={() => openPremium("locked")} />)}</div>
          {searchMode === "free" && lockedResultCount > 0 && <motion.div className="premium-results-gate" initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}><div><span>More matches are ready</span><strong>Unlock every ranked restaurant and unlimited searches.</strong></div><button type="button" onClick={upgradeAndSearch}>Upgrade to Premium for more <span>→</span></button></motion.div>}
          <motion.p className="ranking-disclosure" initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .7 }} transition={{ duration: .24 }}><WordGroups text="Research only. Confirm ingredients and cross-contact directly with restaurant staff." /></motion.p>
        </> : !loading && !error ? <motion.div className="empty-state empty-state-simple" id="how-it-works" initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .3 }} transition={{ duration: .25, ease: "easeOut" }}><motion.h2 className="living-heading" initial={shouldReduceMotion ? false : { opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true, amount: .6 }} transition={{ duration: .22 }}><WordGroups text="Start with a location, food, and allergies." /></motion.h2></motion.div> : null}
      </section>

      {!searchPage && <motion.section className="safety-strip" id="safety" initial={shouldReduceMotion ? false : { opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .25 }} transition={{ duration: .25, ease: "easeOut" }}>{safetyItems.map((item, index) => <motion.div key={item.title} initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .65 }} transition={{ duration: .22, delay: shouldReduceMotion ? 0 : index * .025, ease: "easeOut" }}><span aria-hidden="true">{item.icon}</span><strong><WordGroups text={item.title} /></strong><p><WordGroups text={item.copy} /></p></motion.div>)}</motion.section>}

      {!searchPage && <motion.footer initial={shouldReduceMotion ? false : { opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true, amount: .55 }} transition={{ duration: .22 }}><div className="brand"><span className="brand-symbol"><SafeServeMark /></span><BrandWordmark /></div><p><WordGroups text="Locations © OpenStreetMap contributors." /></p><p><WordGroups text="Research only—confirm with staff." /></p></motion.footer>}

      <AnimatePresence>
      {locationPickerOpen && <motion.div className="location-picker-backdrop" role="presentation" onMouseDown={() => setLocationPickerOpen(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: shouldReduceMotion ? 0 : .18 }}>
        <motion.section id="search-location-picker" className="location-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="location-picker-title" onMouseDown={(event) => event.stopPropagation()} initial={shouldReduceMotion ? false : { opacity: 0, y: 20, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={shouldReduceMotion ? undefined : { opacity: 0, y: 14, scale: .98 }} transition={{ duration: shouldReduceMotion ? 0 : .24, ease: [.22, 1, .36, 1] }}>
          <button type="button" className="location-picker-close" onClick={() => setLocationPickerOpen(false)} aria-label="Close location picker">×</button>
          <div className="location-picker-copy">
            <span className="section-kicker">Destination</span>
            <h2 id="location-picker-title">Choose your <em>destination.</em></h2>
            <label htmlFor="location-picker-input">Location</label>
            <div className="location-picker-input"><span aria-hidden="true">⌖</span><CityInput id="location-picker-input" value={location} options={cityOptions} onChange={updateLocation} onChoose={city => { applySearchFilters({ location: city }); setLocationPickerOpen(false); }} /></div>
          </div>
          <div className="location-picker-globe"><InteractiveGlobe location={location} reducedMotion={shouldReduceMotion} onSelectCountry={selectGlobeLocation} /></div>
        </motion.section>
      </motion.div>}
      </AnimatePresence>

      <AnimatePresence>
      {foodPickerOpen && <motion.div className="location-picker-backdrop food-picker-backdrop" role="presentation" onMouseDown={() => setFoodPickerOpen(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: shouldReduceMotion ? 0 : .18 }}>
        <motion.div onMouseDown={(event) => event.stopPropagation()} initial={shouldReduceMotion ? false : { opacity: 0, y: 18, scale: .975 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={shouldReduceMotion ? undefined : { opacity: 0, y: 12, scale: .985 }} transition={{ duration: shouldReduceMotion ? 0 : .24, ease: [.22, 1, .36, 1] }}>
          <SearchFoodPicker food={food} onChoose={selectFood} onClose={() => setFoodPickerOpen(false)} />
        </motion.div>
      </motion.div>}
      </AnimatePresence>

      <AnimatePresence>
      {suggestionMenuOpen && premiumAccess && <motion.div className="preference-manager-backdrop" role="presentation" onMouseDown={() => setSuggestionMenuOpen(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: shouldReduceMotion ? 0 : .18 }}>
        <motion.section className="preference-manager-dialog" role="dialog" aria-modal="true" aria-labelledby="preference-manager-title" onMouseDown={(event) => event.stopPropagation()} initial={shouldReduceMotion ? false : { opacity: 0, y: 18, scale: .975 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={shouldReduceMotion ? undefined : { opacity: 0, y: 12, scale: .985 }} transition={{ duration: shouldReduceMotion ? 0 : .24, ease: [.22, 1, .36, 1] }}>
          <button type="button" className="preference-manager-close" onClick={() => setSuggestionMenuOpen(false)} aria-label="Close suggestions and avoids">×</button>
          <header className="preference-manager-heading"><span className="section-kicker">Community ranking</span><h2 id="preference-manager-title">Shape your results</h2></header>
          <div className="preference-manager-grid">
            <section className="preference-vote-panel suggest-vote-panel">
              <div className="preference-vote-title"><span aria-hidden="true">♥</span><div><strong>Suggest</strong><small>Raise a restaurant in similar searches</small></div><b>{suggestedRestaurants.length}</b></div>
              <label htmlFor="suggested-restaurant">Restaurant to recommend more</label>
              <div className="suggestion-row"><span className="input-icon" aria-hidden="true">+</span><input id="suggested-restaurant" value={suggestedRestaurant} onFocus={() => setSuggestionMode("suggest")} onChange={(event) => { setSuggestionMode("suggest"); setSuggestedRestaurant(event.target.value); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void saveSuggestion(); } }} placeholder="Friedman's, Bareburger..." maxLength={120} /></div>
              {suggestionMode === "suggest" && activeRestaurantLookupQuery.length >= 2 && (restaurantLookupLoading || restaurantLookup.length > 0) && <div className="restaurant-lookup-list" role="listbox" aria-label="Matching restaurants to suggest">
                {restaurantLookupLoading && <p>Looking for real restaurants...</p>}
                {!restaurantLookupLoading && restaurantLookup.map((restaurant) => <button type="button" key={restaurant.id} onClick={() => selectRestaurantLookup(restaurant)}><strong>{restaurant.name}</strong><span>{restaurant.location || restaurant.address}</span></button>)}
              </div>}
              <button type="button" className="suggestion-save" onClick={() => { setSuggestionMode("suggest"); void saveSuggestion(); }} disabled={suggestionSaving}>{suggestionSaving && suggestionMode === "suggest" ? "Saving..." : "Add suggestion"}</button>
              <div className="preference-list preference-modal-list">
                <div className="preference-list-section"><strong>Suggested here</strong><ul><AnimatePresence initial={false} mode="popLayout">
                  {suggestedRestaurants.map((suggestion) => <PreferenceChip key={suggestion} name={suggestion} kind="suggest" reducedMotion={shouldReduceMotion} onRemove={() => removeSuggestion(suggestion)} />)}
                </AnimatePresence></ul>{!suggestedRestaurants.length && <p className="preference-empty">No suggestions yet.</p>}</div>
              </div>
            </section>
            <section className="preference-vote-panel avoid-vote-panel">
              <div className="preference-vote-title"><span aria-hidden="true">⊘</span><div><strong>Avoid</strong><small>Lower a restaurant in similar searches</small></div><b>{avoidedRestaurants.length}</b></div>
              <label htmlFor="avoided-restaurant">Restaurant to recommend less</label>
              <div className="suggestion-row avoid-row"><span className="input-icon" aria-hidden="true">-</span><input id="avoided-restaurant" value={avoidedRestaurant} onFocus={() => setSuggestionMode("avoid")} onChange={(event) => { setSuggestionMode("avoid"); setAvoidedRestaurant(event.target.value); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void saveAvoidedRestaurant(); } }} placeholder="Five Guys, McDonald's..." maxLength={120} /></div>
              {suggestionMode === "avoid" && activeRestaurantLookupQuery.length >= 2 && (restaurantLookupLoading || restaurantLookup.length > 0) && <div className="restaurant-lookup-list" role="listbox" aria-label="Matching restaurants to avoid">
                {restaurantLookupLoading && <p>Looking for real restaurants...</p>}
                {!restaurantLookupLoading && restaurantLookup.map((restaurant) => <button type="button" key={restaurant.id} onClick={() => selectRestaurantLookup(restaurant)}><strong>{restaurant.name}</strong><span>{restaurant.location || restaurant.address}</span></button>)}
              </div>}
              <button type="button" className="suggestion-save avoid-save" onClick={() => { setSuggestionMode("avoid"); void saveAvoidedRestaurant(); }} disabled={suggestionSaving}>{suggestionSaving && suggestionMode === "avoid" ? "Saving..." : "Add avoid"}</button>
              <div className="preference-list preference-modal-list">
                <div className="preference-list-section avoid-list-section"><strong>Avoided here</strong><ul><AnimatePresence initial={false} mode="popLayout">
                  {avoidedRestaurants.map((restaurant) => <PreferenceChip key={restaurant} name={restaurant} kind="avoid" reducedMotion={shouldReduceMotion} onRemove={() => removeAvoidedRestaurant(restaurant)} />)}
                </AnimatePresence></ul>{!avoidedRestaurants.length && <p className="preference-empty">No avoids yet.</p>}</div>
              </div>
            </section>
          </div>
          {(visibleSuggestionMessage || suggestionSaving) && <motion.p key={`${suggestionFeedback}-${visibleSuggestionMessage}`} className={`suggestion-message preference-manager-message suggestion-message-${suggestionFeedback}`} initial={shouldReduceMotion ? false : { opacity: 0, y: -4, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: shouldReduceMotion ? 0 : .18, ease: "easeOut" }}>{suggestionFeedback === "saving" && <span className="mini-spinner" aria-hidden="true" />}<WordGroups text={visibleSuggestionMessage || "Saving preference..."} /></motion.p>}
          <p className="preference-manager-note">{suggestionAccountRequired ? "You need an account to save suggestions or avoids." : "Votes are saved to your account and counted publicly for this location and allergy context."}</p>
        </motion.section>
      </motion.div>}
      </AnimatePresence>

      <AnimatePresence>
      {selected && <motion.div className="modal-backdrop" role="presentation" onMouseDown={() => setSelected(null)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: shouldReduceMotion ? 0 : .2 }}><motion.section className="detail-panel" role="dialog" aria-modal="true" aria-labelledby="detail-title" onMouseDown={(event) => event.stopPropagation()} initial={shouldReduceMotion ? false : { opacity: 0, y: 26, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={shouldReduceMotion ? undefined : { opacity: 0, y: 18, scale: .98 }} transition={{ duration: shouldReduceMotion ? 0 : .28, ease: "easeOut" }}><button className="close-button" onClick={() => setSelected(null)} aria-label="Close restaurant details">×</button><WebsitePreview restaurant={selected} /><div className="detail-content">
        <span className="section-kicker">Restaurant summary</span><div className="detail-title-row"><h2 id="detail-title">{selected.name}</h2><span>{selected.locations.length} {selected.locations.length === 1 ? "location" : "locations"}</span></div><p className="detail-meta">{selected.cuisine.length ? selected.cuisine.join(" · ") : "Restaurant"} · {selected.source === "free" ? "ranked with public location data" : "ranked with premium research"}</p>
        <p className="detail-ranking">{selected.rankingReason}</p>
        <AllergyReview restaurant={selected} />
        <div className="detail-section"><div className="detail-section-heading"><h3>All grouped locations</h3><span>{selected.source === "free" ? "OpenStreetMap records" : "AI location results"}</span></div><LocationList restaurant={selected} /></div>
        <RestaurantMap restaurants={[selected]} />
        <div className="detail-section"><div className="detail-section-heading"><h3>Restaurant research</h3><span>Restaurant confirmation required</span></div>
          {selected.source === "free" ? <div className="ingredient-empty"><span aria-hidden="true">⌕</span><div><strong>Check the restaurant details.</strong><p>Review the available restaurant and menu links. Ingredients and preparation still need direct confirmation with staff.</p></div></div> : aiResearch[selected.id] ? <div className="ai-research-result"><div className="ai-research-label"><span>✦</span><strong>Source-linked web research</strong></div><CitedResearch research={aiResearch[selected.id]} /><button type="button" className="ai-refresh-button" onClick={() => researchRestaurant(selected)} disabled={aiLoadingId === selected.id}>Research again</button></div> : <div className="ingredient-empty"><span aria-hidden="true">✦</span><div><strong>Run a deeper menu and ingredient check.</strong><p>Premium research will revisit current official sources and link its findings. This uses API credit and does not certify that a meal is safe.</p><button type="button" className="ai-research-button" onClick={() => researchRestaurant(selected)} disabled={aiLoadingId === selected.id}>{aiLoadingId === selected.id ? <><span className="spinner" /> Researching official sources…</> : "Research ingredients"}</button></div></div>}
          {aiError && <p className="ai-error" role="alert">{aiError}</p>}
        </div>
        <dl className="restaurant-facts"><dt>Why it ranks</dt><dd>{selected.rankingReason}</dd>{premiumAccess && (selected.suggestionCount || 0) > 0 && <><dt>Community suggestions</dt><dd>♥ {selected.suggestionCount}</dd></>}{premiumAccess && (selected.avoidCount || 0) > 0 && <><dt>Community avoids</dt><dd>⊘ {selected.avoidCount}</dd></>}<dt>Quality signal</dt><dd>{selected.popularitySummary}</dd><dt>Found through</dt><dd>{selected.source === "free" ? "Restaurant discovery + OpenStreetMap" : "Premium restaurant research"}</dd><dt>Safety</dt><dd>Restaurant confirmation required</dd></dl>
        <div className="detail-actions"><a className="primary-link" href={selected.website || selected.sourceUrl} target="_blank" rel="noreferrer">{selected.website ? "Open restaurant website ↗" : "Open map listing ↗"}</a>{selected.menuSourceUrl && <a className="map-link" href={selected.menuSourceUrl} target="_blank" rel="noreferrer">Menu source</a>}<a className="map-link" href={selected.qualitySourceUrl} target="_blank" rel="noreferrer">{selected.source === "free" ? "Map source" : "Quality source"}</a></div>
        <p className="safety-callout"><strong>Before ordering:</strong> Tell staff about every allergy and ask whether they can prevent cross-contact. If you are unsure, do not eat the item.</p>
      </div></motion.section></motion.div>}
      </AnimatePresence>
    </main>
  );
}
