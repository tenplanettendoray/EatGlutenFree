"use client";

import { FormEvent, type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { AccountControls } from "./auth-ui";
import { InteractiveGlobe } from "./interactive-globe";
import { SafeServeMark } from "./safe-serve-logo";

type RestaurantLocation = {
  label: string;
  address: string;
  website: string;
  sourceUrl: string;
};

type Restaurant = {
  id: string;
  name: string;
  cuisine: string[];
  address: string;
  distanceKm: number | null;
  website: string;
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
  evidenceTier?: "official" | "community" | "partial";
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

const allergyOptions = ["Peanuts", "Tree nuts", "Milk", "Eggs", "Wheat", "Soy", "Fish", "Shellfish", "Sesame", "Gluten"];

function normalizeCitySearch(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function cityOnlySearchLocation(value: string, cityCatalog: string[]) {
  const cleaned = value.trim().replace(/\s+/g, " ");
  const parts = cleaned.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return cleaned;
  const catalogNames = new Map(cityCatalog.map((city) => [normalizeCitySearch(city), city]));
  const catalogMatch = parts.map((part) => catalogNames.get(normalizeCitySearch(part))).find(Boolean);
  if (catalogMatch) return catalogMatch;
  const first = normalizeCitySearch(parts[0]).replace(/[^a-z ]/g, "").trim();
  const countryFirst = /^(united states(?: of america)?|usa|us|canada|france|united kingdom|uk|england|australia|germany|italy|spain|china|japan|india)$/.test(first);
  return countryFirst ? parts[1] : parts[0];
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

type AllergyQuestProps = {
  allergies: string[];
  customAllergy: string;
  location: string;
  food: string;
  cityOptions: string[];
  allergyOptions: string[];
  reducedMotion: boolean | null;
  onToggleAllergy: (allergy: string) => void;
  onCustomAllergyChange: (value: string) => void;
  onLocationChange: (value: string) => void;
  onGlobeLocationSelect: (selection: GlobeSelection) => void;
  onFoodChange: (value: string) => void;
  onStart: () => void;
};

function AllergyQuest({ allergies, customAllergy, location, food, cityOptions, allergyOptions, reducedMotion, onToggleAllergy, onCustomAllergyChange, onGlobeLocationSelect, onLocationChange, onFoodChange, onStart }: AllergyQuestProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragObject, setDragObject] = useState<{ name: string; index: number; x: number; y: number; rotation: number } | null>(null);
  const pointerRef = useRef({ x: 0, y: 0, time: 0, offsetX: 0, offsetY: 0, moved: false });
  const safeMotion = reducedMotion ? { duration: 0 } : { duration: .28, ease: [.22, 1, .36, 1] as [number, number, number, number] };

  function addCustom() {
    const name = customAllergy.trim();
    if (!name) return;
    if (!allergies.some((allergy) => allergy.toLowerCase() === name.toLowerCase())) onToggleAllergy(name);
    onCustomAllergyChange("");
  }

  function dropAllergy() {
    if (dragging && !allergies.includes(dragging)) onToggleAllergy(dragging);
    setDragging(null);
  }

  function updateIngredientHover(target: HTMLButtonElement, clientX: number, clientY: number) {
    const bounds = target.getBoundingClientRect();
    const relativeX = (clientX - bounds.left) / bounds.width;
    const relativeY = (clientY - bounds.top) / bounds.height;
    const offsetX = (relativeX - .5) * 12;
    const offsetY = (relativeY - .5) * 10;
    const rotateY = (relativeX - .5) * 10;
    const rotateX = (.5 - relativeY) * 10;
    target.style.setProperty("--hover-offset-x", `${offsetX.toFixed(2)}px`);
    target.style.setProperty("--hover-offset-y", `${offsetY.toFixed(2)}px`);
    target.style.setProperty("--hover-rotate-x", `${rotateX.toFixed(2)}deg`);
    target.style.setProperty("--hover-rotate-y", `${rotateY.toFixed(2)}deg`);
    target.style.setProperty("--hover-translate-y", "0px");
  }

  function resetIngredientHover(target: HTMLButtonElement) {
    target.style.setProperty("--hover-offset-x", "0px");
    target.style.setProperty("--hover-offset-y", "0px");
    target.style.setProperty("--hover-rotate-x", "0deg");
    target.style.setProperty("--hover-rotate-y", "0deg");
    target.style.setProperty("--hover-translate-y", "0px");
  }

  function startPlateDrag(event: React.PointerEvent<HTMLButtonElement>, allergy: string, index: number) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = event.currentTarget.getBoundingClientRect();
    pointerRef.current = { x: event.clientX, y: event.clientY, time: event.timeStamp, offsetX: event.clientX - bounds.left, offsetY: event.clientY - bounds.top, moved: false };
    setDragging(allergy);
    setDragObject({ name: allergy, index, x: bounds.left, y: bounds.top, rotation: 0 });
  }

  function movePlateDrag(event: React.PointerEvent<HTMLButtonElement>) {
    if (!dragging) {
      updateIngredientHover(event.currentTarget, event.clientX, event.clientY);
      return;
    }
    const previous = pointerRef.current;
    const elapsed = Math.max(8, event.timeStamp - previous.time);
    const dx = event.clientX - previous.x;
    const dy = event.clientY - previous.y;
    const speed = Math.min(34, Math.hypot(dx, dy) / elapsed * 8.5);
    const targetRotation = (dx * 1.55) + (dy * .28) + (dx >= 0 ? speed : -speed);
    pointerRef.current = { x: event.clientX, y: event.clientY, time: event.timeStamp, offsetX: previous.offsetX, offsetY: previous.offsetY, moved: previous.moved || Math.abs(dx) + Math.abs(dy) > .5 };
    setDragObject((current) => current ? { ...current, x: event.clientX - previous.offsetX, y: event.clientY - previous.offsetY, rotation: Math.max(-52, Math.min(52, (current.rotation * .36) + (targetRotation * .64))) } : current);
  }

  function finishPlateDrag(event: React.PointerEvent<HTMLButtonElement>, allergy: string) {
    const didMove = pointerRef.current.moved;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".target-plate");
    if (target && !allergies.includes(allergy)) onToggleAllergy(allergy);
    else if (!didMove) onToggleAllergy(allergy);
    setDragging(null); setDragObject(null);
    resetIngredientHover(event.currentTarget);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return <main className="allergy-quest">
    <div className="quest-sky" aria-hidden="true"><i /><b /><span /></div>
    <header className="quest-header">
      <Link className="brand" href="/" aria-label="Safe Serve home"><span className="brand-symbol"><SafeServeMark /></span><span className="brand-lockup"><WordGroups text="Safe Serve" /><small>CanIEatIt?</small></span></Link>
      <div className="quest-progress" aria-label={`Step ${step} of 2`}><span className={step === 1 ? "active" : "done"}>1</span><i /><span className={step === 2 ? "active" : ""}>2</span></div>
      <AccountControls />
    </header>

    <AnimatePresence mode="wait">
      {step === 1 ? <motion.section key="allergy-step" className="quest-stage quest-allergy-stage" initial={reducedMotion ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={reducedMotion ? undefined : { opacity: 0, x: -20 }} transition={safeMotion}>
        <div className="quest-intro"><span className="quest-eyebrow">Step one</span><h1>Set your <em>allergy profile.</em></h1><p>Drag any ingredient you want to avoid onto the center plate. Safe Serve will use those filters in every search.</p></div>
        <div className="quest-table" aria-label="Allergy plate game">
          <div className="table-glow" aria-hidden="true" />
          <div className="allergy-plate-rack" aria-label="Available allergy plates">
            {allergyOptions.map((allergy, index) => <motion.button type="button" onPointerDown={(event) => startPlateDrag(event, allergy, index)} onPointerMove={movePlateDrag} onPointerUp={(event) => finishPlateDrag(event, allergy)} onPointerLeave={(event) => resetIngredientHover(event.currentTarget)} onPointerCancel={(event) => { setDragging(null); setDragObject(null); resetIngredientHover(event.currentTarget); }} key={allergy} className={`allergen-dish dish-${index % 5} ${allergies.includes(allergy) ? "chosen" : ""}`} style={{ "--dish-x": `${(index % 5) * 25}%`, "--dish-y": `${Math.floor(index / 5) * 100}%`, "--hover-offset-x": "0px", "--hover-offset-y": "0px", "--hover-rotate-x": "0deg", "--hover-rotate-y": "0deg", "--hover-translate-y": "0px" } as CSSProperties & Record<"--dish-x" | "--dish-y" | "--hover-offset-x" | "--hover-offset-y" | "--hover-rotate-x" | "--hover-rotate-y" | "--hover-translate-y", string>} whileTap={undefined} transition={{ type: "spring", stiffness: 360, damping: 18, mass: .55 }} aria-pressed={allergies.includes(allergy)}>
              <span className="dish-food" aria-hidden="true" /><strong>{allergy}</strong><small>{allergies.includes(allergy) ? "On your plate" : "Drag to avoid"}</small>
            </motion.button>)}
          </div>
          <div className="custom-allergy-panel">
            <label htmlFor="quest-custom-allergy">Add new allergy</label>
            <div className="custom-allergy-row">
              <input id="quest-custom-allergy" value={customAllergy} onChange={(event) => onCustomAllergyChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCustom(); } }} placeholder="Type another allergy" />
              <button type="button" onClick={addCustom}>Add</button>
            </div>
          </div>
          <div className={`target-plate ${dragging ? "dragging" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={dropAllergy}>
            <div className="plate-rim"><div className="plate-inner"><span className="plate-caption">Ingredients to avoid</span>
              <div className="plate-tags" aria-live="polite">{allergies.length ? allergies.map((allergy) => <button type="button" onClick={() => onToggleAllergy(allergy)} key={allergy} aria-label={`Remove ${allergy}`}>{allergy}<b>×</b></button>) : <p>Drop plates here</p>}</div>
            </div></div>
          </div>
          <p className="quest-help">You can also tap a plate to add it instantly.</p>
          {dragObject && <motion.div className="floating-allergen-dish" style={{ "--dish-x": `${(dragObject.index % 5) * 25}%`, "--dish-y": `${Math.floor(dragObject.index / 5) * 100}%`, left: dragObject.x, top: dragObject.y } as CSSProperties & Record<"--dish-x" | "--dish-y", string>} initial={{ scale: .82, opacity: 0, rotate: 0 }} animate={{ scale: 1.06, opacity: 1, rotate: dragObject.rotation }} transition={{ type: "spring", stiffness: 520, damping: 16, mass: .38 }} aria-hidden="true"><span className="dish-food" /><strong>{dragObject.name}</strong></motion.div>}
        </div>
        <div className="quest-actions"><span>{allergies.length ? `${allergies.length} ${allergies.length === 1 ? "allergy" : "allergies"} selected` : "No allergies selected yet"}</span><button type="button" className="quest-primary" onClick={() => setStep(2)}>Continue <b>→</b></button></div>
      </motion.section> : <motion.section key="location-step" className="quest-stage quest-location-stage" initial={reducedMotion ? false : { opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={reducedMotion ? undefined : { opacity: 0, x: 20 }} transition={safeMotion}>
        <div className="location-copy"><span className="quest-eyebrow">Step two</span><h1>Choose your <em>destination.</em></h1><p>Enter a city, country, neighbourhood, or ZIP first, then refine with the globe for a more precise search.</p>
          <label htmlFor="quest-location">Location</label><div className="quest-location-input"><input id="quest-location" value={location} onChange={(event) => onLocationChange(event.target.value)} placeholder="Paris, France" autoComplete="address-level2" list="city-catalog-options" /><span aria-hidden="true">⌖</span></div>
          <datalist id="city-catalog-options">{cityOptions.map((city) => <option value={city} key={city} />)}</datalist>
          <label htmlFor="quest-food">Cuisine or dish <em>(optional)</em></label><div className="quest-location-input quest-food-input"><input id="quest-food" value={food} onChange={(event) => onFoodChange(event.target.value)} placeholder="Burger, pizza, sushi…" /><span aria-hidden="true">⌕</span></div>
        </div>
        <InteractiveGlobe location={location} reducedMotion={reducedMotion} onSelectCountry={onGlobeLocationSelect} />
        <div className="quest-actions location-actions"><button type="button" className="quest-back" onClick={() => setStep(1)}>← Back</button><button type="button" className="quest-primary" onClick={onStart} disabled={!location.trim()}>Find matches <b>→</b></button></div>
      </motion.section>}
    </AnimatePresence>
  </main>;
}

export default function Home() {
  return <SafeServeApp />;
}

function WordGroups({ text }: { text: string }) {
  return <span className="word-groups" aria-label={text}>{text.split(/(\s+)/).map((part, index) => /^\s+$/.test(part) ? part : <span className="word-group" aria-hidden="true" key={`${part}-${index}`}>{part}</span>)}</span>;
}

function HeadlineWord({ children, index, reducedMotion }: { children: string; index: number; reducedMotion: boolean | null }) {
  return <motion.span className="word-group" initial={reducedMotion ? false : { opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .65 }} transition={{ duration: reducedMotion ? 0 : .25, delay: reducedMotion ? 0 : index * .025, ease: "easeOut" }}>{children}</motion.span>;
}

function WebsitePreview({ restaurant }: { restaurant: Restaurant }) {
  const [failed, setFailed] = useState(false);
  const preview = restaurant.website ? `https://image.thum.io/get/width/900/crop/560/noanimate/${restaurant.website}` : "";
  const usingFallback = failed || !preview;
  const imageUrl = usingFallback ? fallbackRestaurantPhoto(restaurant.name) : preview;
  return (
    <div className={`restaurant-visual ${usingFallback ? "visual-fallback" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt={usingFallback ? `Sample restaurant setting for ${restaurant.name}` : `Website preview for ${restaurant.name}`}
        onError={() => { if (!usingFallback) setFailed(true); }}
        referrerPolicy="no-referrer"
      />
      <div className="visual-shade" />
      <span className="distance-pill">{restaurant.locations.length} verified {restaurant.locations.length === 1 ? "location" : "locations"}</span>
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
  const mapUrl = `https://www.google.com/maps?q=${encodeURIComponent(active.location.address)}&output=embed`;

  return (
    <section className="ai-location-map" aria-label="Map of AI-researched restaurant locations">
      <div className="map-heading">
        <div><span className="section-kicker">Location overview</span><h3>AI-researched location map</h3></div>
        <p>{places.length} verified {places.length === 1 ? "location" : "locations"} · choose an address</p>
      </div>
      <div className="map-canvas">
        <iframe src={mapUrl} title={`Map showing ${active.restaurant.name}, ${active.location.label}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
        <span className="map-watermark">{restaurants.every((restaurant) => restaurant.source === "free") ? "Address from OpenStreetMap" : "Address researched by OpenAI"}</span>
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

function LocationList({ restaurant }: { restaurant: Restaurant }) {
  return (
    <ol className="location-list">
      {restaurant.locations.map((location, index) => (
        <li key={`${location.address}-${index}`}>
          <div><strong>{location.label}</strong><span>{location.address}</span></div>
          <div className="location-links">
            <a href={location.website} target="_blank" rel="noreferrer">Location page ↗</a>
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
  const isPartial = isFree && restaurant.evidenceTier === "partial";
  return (
    <div className="allergy-review">
      <div className="review-title-row"><span className="review-icon" aria-hidden="true">✦</span><div><strong>{isPartial ? "Partial allergy evidence" : isCommunity ? "Community map evidence" : isFree ? "Free browser-agent research" : "Verified web discovery"}</strong><p>{isPartial ? "At least one selected allergy has no published or community-map support" : isCommunity ? "A matching OpenStreetMap diet tag was found, but the restaurant website did not confirm every request" : isFree ? "Safe Serve checked OpenStreetMap tags and searched the restaurant’s public website" : "OpenAI checked official menu evidence and an independent quality source"}</p></div></div>
      <div className={`review-status ${isCommunity || isPartial ? "unknown" : "cautiously-positive"}`}><strong>{isPartial ? "Not a complete allergy match" : isCommunity ? "Direct confirmation needed" : isFree ? "Published evidence found" : "Menu and allergy evidence"}</strong><span>{restaurant.evidenceSummary}</span><a className="evidence-link" href={restaurant.menuSourceUrl} target="_blank" rel="noreferrer">View supporting source ↗</a></div>
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
  const [freeSearchesRemaining, setFreeSearchesRemaining] = useState<number | null>(null);
  const [freeSearchesLimit, setFreeSearchesLimit] = useState(3);
  const [cityCatalog, setCityCatalog] = useState<string[]>([]);
  const [suggestionMenuOpen, setSuggestionMenuOpen] = useState(false);
  const [suggestionMode, setSuggestionMode] = useState<"suggest" | "avoid">("suggest");
  const [suggestionMessage, setSuggestionMessage] = useState("");
  const [suggestionFeedback, setSuggestionFeedback] = useState<SuggestionFeedback>("idle");
  const [suggestionSaving, setSuggestionSaving] = useState(false);
  const [suggestionAccountRequired, setSuggestionAccountRequired] = useState(false);
  const [restaurantLookup, setRestaurantLookup] = useState<RestaurantLookup[]>([]);
  const [restaurantLookupLoading, setRestaurantLookupLoading] = useState(false);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [selected, setSelected] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(searchPage);
  const [error, setError] = useState("");
  const [searchedLocation, setSearchedLocation] = useState("");
  const [agentQuery, setAgentQuery] = useState("");
  const [aiResearch, setAiResearch] = useState<Record<string, AiResearch>>({});
  const [aiLoadingId, setAiLoadingId] = useState("");
  const [aiError, setAiError] = useState("");
  const [loadingStage, setLoadingStage] = useState(0);
  const shouldReduceMotion = useReducedMotion();
  const initialSearchStarted = useRef(false);
  const loadingSteps = ["Finding nearby spots", "Checking menus and websites", "Ranking the strongest matches"];
  const cityOptions = useMemo(() => {
    const query = normalizeCitySearch(location.trim());
    if (query.length < 2) return cityCatalog;
    const startsWith: string[] = [];
    const includes: string[] = [];
    cityCatalog.forEach((city) => {
      const normalized = normalizeCitySearch(city);
      if (normalized.startsWith(query)) startsWith.push(city);
      else if (normalized.includes(query)) includes.push(city);
    });
    return [...startsWith, ...includes];
  }, [cityCatalog, location]);

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
    setLocation(cityOnlySearchLocation(selection.label, cityCatalog));
    setSelectedCoordinates({ latitude: selection.latitude, longitude: selection.longitude });
  }

  async function runSearch(params: URLSearchParams, label: string, overrides?: { mode: SearchMode; food: string; occasion: string; allergies: string[]; suggestedRestaurants: string[]; avoidedRestaurants: string[] }) {
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
    setLoadingStage(0);
    setLoading(true); setError(""); setSelected(null);
    try {
      const response = await fetch(`/api/restaurants?${params.toString()}`);
      const data = await response.json();
      if (typeof data.freeSearchesRemaining === "number" || data.freeSearchesRemaining === null) setFreeSearchesRemaining(data.freeSearchesRemaining);
      if (typeof data.freeSearchesLimit === "number") setFreeSearchesLimit(data.freeSearchesLimit);
      if (!response.ok) throw new Error(data.error || "Restaurant search failed.");
      setRestaurants(data.restaurants);
      setSearchedLocation(data.location || label);
      setAgentQuery(data.agentQuery || "");
      if (!data.restaurants.length) setError(activeMode === "free" ? "No nearby food-relevant restaurants could be researched right now. Try the city name, a broader food, or search again in a moment." : "OpenAI could not research enough restaurants for this search. Try a broader food or location.");
    } catch (searchError) {
      setRestaurants([]);
      setError(searchError instanceof Error ? searchError.message : "Restaurant search failed.");
    } finally {
      setLoading(false);
    }
  }
  function submitSearch(event: FormEvent) {
    event.preventDefault();
    if (!location.trim()) { setError("Enter a city, neighborhood, or ZIP code first."); return; }
    const searchLocation = cityOnlySearchLocation(location, cityCatalog);
    if (searchLocation !== location) setLocation(searchLocation);
    if (!searchPage) {
      const query = new URLSearchParams({ location: searchLocation, mode: searchMode });
      if (selectedCoordinates) {
        query.set("lat", String(selectedCoordinates.latitude));
        query.set("lon", String(selectedCoordinates.longitude));
      }
      if (food.trim()) query.set("food", food.trim());
      if (occasion) query.set("occasion", occasion);
      if (allergies.length) query.set("allergies", allergies.join("|"));
      if (suggestedRestaurants.length) query.set("suggestedRestaurants", suggestedRestaurants.join("|"));
      if (avoidedRestaurants.length) query.set("avoidedRestaurants", avoidedRestaurants.join("|"));
      window.location.assign(`/search?${query.toString()}`);
      return;
    }
    const params = new URLSearchParams({ location: searchLocation });
    if (selectedCoordinates) {
      params.set("lat", String(selectedCoordinates.latitude));
      params.set("lon", String(selectedCoordinates.longitude));
    }
    runSearch(params, searchLocation);
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
      if (!response.ok) throw new Error(data.error || "Could not remove that preference.");
      applyPreferenceData(data);
      setSuggestionMessage(data.message || "Preference removed.");
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
    setSuggestionMessage(kind === "suggest"
      ? `Checking allergy evidence for ${value} in ${location.trim()}${food.trim() ? ` · ${food.trim()}` : ""} · ${allergies.join(", ")}...`
      : `Avoiding ${value} for ${location.trim()}${food.trim() ? ` · ${food.trim()}` : ""} · ${allergies.join(", ")}...`);
    if (kind === "suggest") {
      setSuggestedRestaurants((current) => current.some((item) => item.toLowerCase() === value.toLowerCase()) ? current : [value, ...current].slice(0, 8));
    } else {
      setAvoidedRestaurants((current) => current.some((item) => item.toLowerCase() === value.toLowerCase()) ? current : [value, ...current].slice(0, 8));
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), kind === "suggest" ? 65000 : 12000);
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
      if (!response.ok) throw new Error(data.error || "Could not save that suggestion.");
      applyPreferenceData(data);
      if (kind === "suggest") setSuggestedRestaurant("");
      else setAvoidedRestaurant("");
      setSuggestionAccountRequired(false);
      setSuggestionMessage(data.message || "Suggestion saved.");
      setSuggestionFeedback(data.feedbackTone === "favorable"
        ? "favorable"
        : data.feedbackTone === "blocked"
          ? "blocked"
          : data.feedbackTone === "caution" || Array.isArray(data.unverifiedSuggestions) && data.unverifiedSuggestions.length
            ? "caution"
            : data.bonusGranted ? "success" : "warning");
    } catch (suggestionError) {
      setSuggestedRestaurants(previousSuggestedRestaurants);
      setAvoidedRestaurants(previousAvoidedRestaurants);
      const message = suggestionError instanceof Error && suggestionError.name === "AbortError"
        ? kind === "suggest" ? "Allergy verification took too long. Try a more specific restaurant location or search first." : "Saving took too long. Finish the current restaurant search, then try again."
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
        .then((response) => response.json())
        .then((data) => setRestaurantLookup(Array.isArray(data.restaurants) ? data.restaurants : []))
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
  }, [location, food, allergies.join("|")]);
  useEffect(() => {
    if (!searchPage || initialSearchStarted.current) return;
    initialSearchStarted.current = true;
    const query = new URLSearchParams(window.location.search);
    const initialLocation = query.get("location")?.trim() ?? "";
    const initialLatitude = Number(query.get("lat"));
    const initialLongitude = Number(query.get("lon"));
    const hasInitialCoordinates = query.has("lat") && query.has("lon") && Number.isFinite(initialLatitude) && Number.isFinite(initialLongitude);
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
    const initialMode: SearchMode = query.get("mode") === "premium" ? "premium" : "free";
    queueMicrotask(() => {
      setLocation(initialLocation);
      setFood(initialFood);
      setOccasion(initialOccasion);
      setAllergies(initialAllergies);
      setSuggestedRestaurants(initialSuggestions);
      setAvoidedRestaurants(initialAvoids);
      setSearchMode(initialMode);
      setSelectedCoordinates(hasInitialCoordinates ? { latitude: initialLatitude, longitude: initialLongitude } : null);
      if (!initialLocation) {
        setLoading(false);
        setError("Enter a city, neighborhood, or ZIP code to begin searching.");
        return;
      }
      const initialParams = new URLSearchParams({ location: initialLocation });
      if (hasInitialCoordinates) {
        initialParams.set("lat", String(initialLatitude));
        initialParams.set("lon", String(initialLongitude));
      }
      void runSearch(initialParams, initialLocation, { mode: initialMode, food: initialFood, occasion: initialOccasion, allergies: initialAllergies, suggestedRestaurants: initialSuggestions, avoidedRestaurants: initialAvoids });
    });
    // This initialization intentionally runs only once for the URL that opened the search page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchPage]);

  useEffect(() => {
    if (!loading) return;
    const stageOne = window.setTimeout(() => setLoadingStage(1), 1100);
    const stageTwo = window.setTimeout(() => setLoadingStage(2), 2500);
    return () => {
      window.clearTimeout(stageOne);
      window.clearTimeout(stageTwo);
    };
  }, [loading]);
  function useMyLocation() {
    if (!navigator.geolocation) { setError("Location services are not supported by this browser."); return; }
    setLoading(true); setError("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => runSearch(new URLSearchParams({ lat: String(coords.latitude), lon: String(coords.longitude) }), "your location"),
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
      const data = await response.json();
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
  const quickAllergyOptions = allergyOptions.filter((allergy) => ["Peanuts", "Tree nuts", "Milk", "Wheat", "Sesame", "Gluten"].includes(allergy));
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
      onStart={() => {
        if (!location.trim()) return;
        const query = new URLSearchParams({ location: location.trim(), mode: searchMode });
        if (selectedCoordinates) {
          query.set("lat", String(selectedCoordinates.latitude));
          query.set("lon", String(selectedCoordinates.longitude));
        }
        if (food.trim()) query.set("food", food.trim());
        if (allergies.length) query.set("allergies", allergies.join("|"));
        window.location.assign(`/search?${query.toString()}`);
      }}
    />;
  }

  return (
    <main className={searchPage ? "search-page" : undefined}>
      <div className="ambient-scene" aria-hidden="true">
        <span className="ambient-orb ambient-orb-one" />
        <span className="ambient-orb ambient-orb-two" />
        <span className="ambient-shape ambient-aurora" />
      </div>
      <motion.header className="site-header" initial={shouldReduceMotion ? false : { opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .3, ease: [.22, 1, .36, 1] }}>
        <Link className="brand" href="/" aria-label="Return to the Safe Serve start page"><span className="brand-symbol"><SafeServeMark /></span><span className="brand-lockup"><WordGroups text="Safe Serve" /><small>CanIEatIt?</small></span></Link>
        {!searchPage && <AccountControls />}
      </motion.header>

      <section className={searchPage ? "hero search-workspace-hero" : "hero"} id="top">
        {!searchPage && <>
        <motion.div className="hero-copy" initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .35 }} transition={{ duration: .28, ease: "easeOut" }}>
          <motion.p className="brand-catchphrase" initial={shouldReduceMotion ? false : { opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, amount: .7 }} transition={{ duration: .22 }}><WordGroups text="CanIEatIt?" /></motion.p>
          <h1 className="animated-headline" aria-label="Find a table that fits you."><span className="headline-line" aria-hidden="true">{["Find", "a", "table", "that"].map((word, index) => <HeadlineWord key={word} index={index} reducedMotion={shouldReduceMotion}>{word}</HeadlineWord>)}</span><br /><motion.em className="word-group fits-you" aria-hidden="true" initial={shouldReduceMotion ? false : { opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} whileHover={shouldReduceMotion ? undefined : { y: -2, fontWeight: 500 }} viewport={{ once: true, amount: .65 }} transition={{ duration: shouldReduceMotion ? 0 : .25, delay: shouldReduceMotion ? 0 : .1, ease: "easeOut" }}>fits you.</motion.em></h1>
        </motion.div>

        <HeroImageLayers reducedMotion={shouldReduceMotion} />
        </>}

        <motion.div className="search-card-shell" initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .18 }} transition={{ duration: shouldReduceMotion ? 0 : .28, ease: "easeOut" }}>
        <form className="search-card" onSubmit={submitSearch}>
          <motion.div className="card-heading" initial={shouldReduceMotion ? false : { opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true, amount: .7 }} transition={{ duration: .2 }}>
            <WordGroups text="Start your search" />
            <motion.span key={`${freeSearchesRemaining}-${searchMode}`} className="search-credit-pill heading-credit-pill" initial={shouldReduceMotion ? false : { opacity: 0, scale: .92, y: -3 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: .18, ease: "easeOut" }}><WordGroups text={freeSearchesRemaining === null || searchMode === "premium" ? "Unlimited" : `${freeSearchesRemaining ?? freeSearchesLimit} left`} /></motion.span>
          </motion.div>
          <div className="tier-switch" role="group" aria-label="Choose search version">
            <button type="button" className={searchMode === "free" ? "active" : ""} onClick={() => { setSearchMode("free"); setRestaurants([]); setSelected(null); setError(""); }}><strong><WordGroups text="Free" /></strong></button>
            <button type="button" className={searchMode === "premium" ? "active" : ""} onClick={() => { setSearchMode("premium"); setRestaurants([]); setSelected(null); setError(""); }}><strong><WordGroups text="Premium" /></strong></button>
          </div>
          <label htmlFor="location"><WordGroups text="Where are you dining?" /></label>
          <div className="location-row"><span className="input-icon" aria-hidden="true">⌖</span><input id="location" value={location} onChange={(event) => updateLocation(event.target.value)} placeholder="City, neighborhood, or ZIP" autoComplete="postal-code" list="city-catalog-options" /><button type="button" className="locate-button" onClick={useMyLocation} aria-label="Use my current location">◎</button></div>
          <datalist id="city-catalog-options">{cityOptions.map((city) => <option value={city} key={city} />)}</datalist>
          <label className="food-label" htmlFor="food"><WordGroups text="What food are you craving?" /></label>
          <div className="food-row"><span className="input-icon" aria-hidden="true">⌕</span><input id="food" value={food} onChange={(event) => setFood(event.target.value)} placeholder="Pizza, burgers, sushi, tacos…" /></div>
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
          <div className="suggestion-menu">
            <button type="button" className="suggestion-trigger" onClick={() => setSuggestionMenuOpen((open) => !open)} aria-expanded={suggestionMenuOpen} aria-controls="suggestion-panel">
              <span>+</span>
              <strong><WordGroups text={suggestedRestaurants.length || avoidedRestaurants.length ? `${suggestedRestaurants.length} suggested · ${avoidedRestaurants.length} avoided` : "Tune recommendations"} /></strong>
              <small><WordGroups text="+1 search today" /></small>
            </button>
            {(suggestedRestaurants.length > 0 || avoidedRestaurants.length > 0) && <div className="preference-list" aria-label="Suggested and avoided restaurants">
              {suggestedRestaurants.length > 0 && <div className="preference-list-section">
                <strong><WordGroups text="Suggested" /></strong>
                <ul>
                  {suggestedRestaurants.map((suggestion) => <li key={suggestion}><span><WordGroups text={suggestion} /></span><button type="button" onClick={() => removeSuggestion(suggestion)} aria-label={`Remove ${suggestion}`}>×</button></li>)}
                </ul>
              </div>}
              {avoidedRestaurants.length > 0 && <div className="preference-list-section avoid-list-section">
                <strong><WordGroups text="Avoided" /></strong>
                <ul>
                  {avoidedRestaurants.map((restaurant) => <li key={restaurant}><span><WordGroups text={restaurant} /></span><button type="button" onClick={() => removeAvoidedRestaurant(restaurant)} aria-label={`Remove ${restaurant}`}>×</button></li>)}
                </ul>
              </div>}
            </div>}
            <AnimatePresence initial={false}>
              {suggestionMenuOpen && <motion.div id="suggestion-panel" className="suggestion-panel" initial={shouldReduceMotion ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={shouldReduceMotion ? undefined : { opacity: 0, y: -4 }} transition={{ duration: shouldReduceMotion ? 0 : .16, ease: "easeOut" }}>
                <div className="suggestion-mode-switch" role="group" aria-label="Choose recommendation tuning mode">
                  <button type="button" className={suggestionMode === "suggest" ? "active" : ""} onClick={() => setSuggestionMode("suggest")}>Suggest</button>
                  <button type="button" className={suggestionMode === "avoid" ? "active" : ""} onClick={() => setSuggestionMode("avoid")}>Avoid</button>
                </div>
                <label htmlFor={suggestionMode === "suggest" ? "suggested-restaurant" : "avoided-restaurant"}><WordGroups text={suggestionMode === "suggest" ? "Restaurant to recommend more" : "Restaurant to recommend less"} /></label>
                {suggestionMode === "suggest"
                  ? <div className="suggestion-row"><span className="input-icon" aria-hidden="true">+</span><input id="suggested-restaurant" value={suggestedRestaurant} onChange={(event) => setSuggestedRestaurant(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void saveSuggestion(); } }} placeholder="Friedman's, Bareburger..." maxLength={120} /></div>
                  : <div className="suggestion-row avoid-row"><span className="input-icon" aria-hidden="true">-</span><input id="avoided-restaurant" value={avoidedRestaurant} onChange={(event) => setAvoidedRestaurant(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void saveAvoidedRestaurant(); } }} placeholder="Five Guys, McDonald's..." maxLength={120} /></div>}
                {activeRestaurantLookupQuery.length >= 2 && (restaurantLookupLoading || restaurantLookup.length > 0) && <div className="restaurant-lookup-list" role="listbox" aria-label="Matching restaurants">
                  {restaurantLookupLoading && <p>Looking for real restaurants...</p>}
                  {!restaurantLookupLoading && restaurantLookup.map((restaurant) => (
                    <button type="button" key={restaurant.id} onClick={() => selectRestaurantLookup(restaurant)}>
                      <strong>{restaurant.name}</strong>
                      <span>{restaurant.location || restaurant.address}</span>
                    </button>
                  ))}
                </div>}
                <button type="button" className={`suggestion-save ${suggestionMode === "avoid" ? "avoid-save" : ""}`} onClick={suggestionMode === "suggest" ? saveSuggestion : saveAvoidedRestaurant} disabled={suggestionSaving}>{suggestionSaving ? "Saving..." : suggestionMode === "suggest" ? "Add suggestion" : "Add avoid"}</button>
                {(visibleSuggestionMessage || suggestionSaving) && <motion.p
                  key={`inside-${suggestionFeedback}-${visibleSuggestionMessage}`}
                  className={`suggestion-message suggestion-message-${suggestionFeedback}`}
                  initial={shouldReduceMotion ? false : { opacity: 0, y: -4, scale: .98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: shouldReduceMotion ? 0 : .18, ease: "easeOut" }}
                >
                  {suggestionFeedback === "saving" && <span className="mini-spinner" aria-hidden="true" />}
                  <WordGroups text={visibleSuggestionMessage || "Saving preference..."} />
                </motion.p>}
                <p>{suggestionAccountRequired ? "Need an account to make suggestions/avoids." : "Suggestions and avoids are saved to your account and counted publicly. The bonus is still limited to 1 extra Free search per day."}</p>
              </motion.div>}
            </AnimatePresence>
            {!suggestionMenuOpen && (visibleSuggestionMessage || suggestionSaving) && <motion.p
              key={`${suggestionFeedback}-${visibleSuggestionMessage}`}
              className={`suggestion-message suggestion-message-${suggestionFeedback}`}
              initial={shouldReduceMotion ? false : { opacity: 0, y: -4, scale: .98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: shouldReduceMotion ? 0 : .18, ease: "easeOut" }}
            >
              {suggestionFeedback === "saving" && <span className="mini-spinner" aria-hidden="true" />}
              <WordGroups text={visibleSuggestionMessage || "Saving preference..."} />
            </motion.p>}
          </div>
          <button className="primary-button" type="submit" disabled={loading}>{loading ? <><span className="spinner" /><WordGroups text={searchMode === "free" ? "Searching public sources…" : "Researching the best matches…"} /></> : <><WordGroups text="Find restaurants" /> <span>→</span></>}</button>
        </form>
        </motion.div>
      </section>

      <section className="results-section" aria-live="polite">
        {error && <div className="message-banner"><span>!</span>{error}</div>}
        {loading ? <motion.div className="search-loading-screen" initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="search-loading-orbit" aria-hidden="true"><span /><i /><b /></div>
          <span className="section-kicker">Live restaurant research</span>
          <h2><WordGroups text={searchMode === "free" ? "Searching public sources" : "Researching the strongest matches"} /></h2>
          <p><WordGroups text={`Checking ${[location, food, occasion, allergies.join(", ")].filter(Boolean).join(" · ")}`} /></p>
          <div className="search-loading-progress" aria-hidden="true">
            <div className="search-progress-bar"><span style={{ width: `${Math.round(((loadingStage + 1) / loadingSteps.length) * 100)}%` }} /></div>
            <div className="search-progress-steps">
              {loadingSteps.map((step, index) => (
                <div key={step} className={index === loadingStage ? "active" : index < loadingStage ? "done" : ""}>
                  <i>{index < loadingStage ? "✓" : index + 1}</i>
                  <span>{step}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div> : restaurants.length > 0 ? <>
          <motion.div className="results-heading" initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .3 }} transition={{ duration: .25, ease: "easeOut" }}><div><motion.span className="section-kicker" initial={shouldReduceMotion ? false : { opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true, amount: .7 }} transition={{ duration: .2 }}><WordGroups text={agentQuery || [food, occasion].filter(Boolean).join(" · ") || "Restaurant research"} /></motion.span><motion.h2 className="living-heading" initial={shouldReduceMotion ? false : { opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true, amount: .55 }} transition={{ duration: .22 }}><WordGroups text={`Best matches around ${searchedLocation}`} /></motion.h2></div></motion.div>
          <div className="restaurant-grid">{restaurants.map((restaurant, index) => <motion.button type="button" className="restaurant-card" key={restaurant.id} onClick={() => setSelected(restaurant)} aria-label={`Review ${restaurant.name} details`} aria-haspopup="dialog" aria-expanded={selected?.id === restaurant.id} initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .18 }} transition={{ duration: .25, delay: shouldReduceMotion ? 0 : (index % 3) * .025, ease: "easeOut" }} whileTap={shouldReduceMotion ? undefined : { scale: .99 }}>
            <WebsitePreview restaurant={restaurant} />
            <div className="restaurant-body">
              <div className="restaurant-title-row"><div><span className="rank-number">#{index + 1}</span><h3><WordGroups text={restaurant.name} /></h3><p><WordGroups text={restaurant.cuisine.length ? restaurant.cuisine.join(" · ") : "Restaurant"} /></p></div></div>
              <p className="ranking-reason"><WordGroups text={restaurant.rankingReason} /></p>
              <ul className="branch-preview">{restaurant.locations.slice(0, 3).map((branch) => <li key={branch.address}><strong>{branch.label}</strong><span>{branch.address}</span></li>)}</ul>
              {restaurant.locations.length > 3 && <p className="more-locations">+ {restaurant.locations.length - 3} more locations</p>}
              <div className="card-tags">{restaurant.source === "free" ? <><span>{restaurant.evidenceTier === "partial" ? "△ Partial allergy evidence" : restaurant.evidenceTier === "community" ? "◇ Community map evidence" : "✦ Restaurant-site evidence"}</span><span className="needs-review">{restaurant.rating ? `★ ${restaurant.rating.toFixed(1)}${restaurant.reviewCount ? ` · ${restaurant.reviewCount.toLocaleString()} reviews` : ""}` : "★ Popularity researched"}</span></> : <><span>✦ Official menu verified</span><span>★ Quality source checked</span></>}</div>
              <span className="details-button"><WordGroups text="Review all locations" /> <span>→</span></span>
            </div>
          </motion.button>)}</div>
          <motion.p className="ranking-disclosure" initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .7 }} transition={{ duration: .24 }}><WordGroups text="Research only. Confirm ingredients and cross-contact directly with restaurant staff." /></motion.p>
        </> : !loading && !error ? <motion.div className="empty-state empty-state-simple" id="how-it-works" initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .3 }} transition={{ duration: .25, ease: "easeOut" }}><motion.h2 className="living-heading" initial={shouldReduceMotion ? false : { opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true, amount: .6 }} transition={{ duration: .22 }}><WordGroups text="Start with a location, food, and allergies." /></motion.h2></motion.div> : null}
      </section>

      {!searchPage && <motion.section className="safety-strip" id="safety" initial={shouldReduceMotion ? false : { opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .25 }} transition={{ duration: .25, ease: "easeOut" }}>{safetyItems.map((item, index) => <motion.div key={item.title} initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .65 }} transition={{ duration: .22, delay: shouldReduceMotion ? 0 : index * .025, ease: "easeOut" }}><span aria-hidden="true">{item.icon}</span><strong><WordGroups text={item.title} /></strong><p><WordGroups text={item.copy} /></p></motion.div>)}</motion.section>}

      {!searchPage && <motion.footer initial={shouldReduceMotion ? false : { opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true, amount: .55 }} transition={{ duration: .22 }}><div className="brand"><span className="brand-symbol"><SafeServeMark /></span><span className="brand-lockup"><WordGroups text="Safe Serve" /><small>CanIEatIt?</small></span></div><p><WordGroups text="Locations © OpenStreetMap contributors." /></p><p><WordGroups text="Research only—confirm with staff." /></p></motion.footer>}

      <AnimatePresence>
      {selected && <motion.div className="modal-backdrop" role="presentation" onMouseDown={() => setSelected(null)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: shouldReduceMotion ? 0 : .2 }}><motion.section className="detail-panel" role="dialog" aria-modal="true" aria-labelledby="detail-title" onMouseDown={(event) => event.stopPropagation()} initial={shouldReduceMotion ? false : { opacity: 0, y: 26, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={shouldReduceMotion ? undefined : { opacity: 0, y: 18, scale: .98 }} transition={{ duration: shouldReduceMotion ? 0 : .28, ease: "easeOut" }}><button className="close-button" onClick={() => setSelected(null)} aria-label="Close restaurant details">×</button><WebsitePreview restaurant={selected} /><div className="detail-content">
        <span className="section-kicker">Restaurant summary</span><div className="detail-title-row"><h2 id="detail-title">{selected.name}</h2><span>{selected.locations.length} {selected.locations.length === 1 ? "location" : "locations"}</span></div><p className="detail-meta">{selected.cuisine.length ? selected.cuisine.join(" · ") : "Restaurant"} · {selected.source === "free" ? "found by the free public-source agent" : "verified through OpenAI web research"}</p>
        <p className="detail-ranking">{selected.rankingReason}</p>
        <AllergyReview restaurant={selected} />
        <div className="detail-section"><div className="detail-section-heading"><h3>All grouped locations</h3><span>{selected.source === "free" ? "OpenStreetMap records" : "Official pages checked"}</span></div><LocationList restaurant={selected} /></div>
        <RestaurantMap restaurants={[selected]} />
        <div className="detail-section"><div className="detail-section-heading"><h3>AI restaurant research</h3><span>Restaurant confirmation required</span></div>
          {selected.source === "free" ? <div className="ingredient-empty"><span aria-hidden="true">⌕</span><div><strong>Free browser-agent search complete.</strong><p>This result uses public map tags and text found on available restaurant pages. Switch to Premium for OpenAI web research and independent popularity evidence.</p></div></div> : aiResearch[selected.id] ? <div className="ai-research-result"><div className="ai-research-label"><span>✦</span><strong>Source-linked web research</strong></div><CitedResearch research={aiResearch[selected.id]} /><button type="button" className="ai-refresh-button" onClick={() => researchRestaurant(selected)} disabled={aiLoadingId === selected.id}>Research again</button></div> : <div className="ingredient-empty"><span aria-hidden="true">✦</span><div><strong>Run a deeper menu and ingredient check.</strong><p>OpenAI will revisit current official sources and link its findings. This uses API credit and does not certify that a meal is safe.</p><button type="button" className="ai-research-button" onClick={() => researchRestaurant(selected)} disabled={aiLoadingId === selected.id}>{aiLoadingId === selected.id ? <><span className="spinner" /> Researching official sources…</> : "Research with AI"}</button></div></div>}
          {aiError && <p className="ai-error" role="alert">{aiError}</p>}
        </div>
        <dl className="restaurant-facts"><dt>Why it ranks</dt><dd>{selected.rankingReason}</dd><dt>Quality evidence</dt><dd>{selected.popularitySummary}</dd><dt>Found through</dt><dd>{selected.source === "free" ? "AI discovery + Safe Serve evidence checks" : "OpenAI verified web research"}</dd><dt>Safety</dt><dd>Restaurant confirmation required</dd></dl>
        <div className="detail-actions"><a className="primary-link" href={selected.website} target="_blank" rel="noreferrer">Open restaurant website ↗</a><a className="map-link" href={selected.menuSourceUrl} target="_blank" rel="noreferrer">Menu evidence</a><a className="map-link" href={selected.qualitySourceUrl} target="_blank" rel="noreferrer">{selected.source === "free" ? "Map source" : "Quality source"}</a></div>
        <p className="safety-callout"><strong>Before ordering:</strong> Tell staff about every allergy and ask whether they can prevent cross-contact. If you are unsure, do not eat the item.</p>
      </div></motion.section></motion.div>}
      </AnimatePresence>
    </main>
  );
}
