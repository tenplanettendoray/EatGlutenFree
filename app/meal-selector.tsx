"use client";

import { useEffect, useRef, useState } from "react";

type Meal = { name: string; detail: string; image: number; query?: string; bowl?: number };
const meals: Meal[] = [
  { name: "Anything", detail: "Keep your options open", image: 11, query: "" },
  { name: "Burgers", detail: "Stacked, grilled, satisfying", image: 0 },
  { name: "Pizza", detail: "A slice of something good", image: 1 },
  { name: "Pasta", detail: "Comfort by the forkful", image: 2 },
  { name: "Sushi", detail: "Rolls, nigiri & sashimi", image: 3 },
  { name: "Tacos", detail: "Small bites, big flavor", image: 4 },
  { name: "Curry", detail: "Spiced & slow simmered", image: 5 },
  { name: "Noodles", detail: "Wok tossed or in a broth", image: 6 },
  { name: "Rice bowls", detail: "A little of everything", image: 8 },
  { name: "Salads", detail: "Fresh, crisp & colorful", image: 10 },
  { name: "Sandwiches", detail: "Lunch between two slices", image: 0 },
  { name: "Soups", detail: "Something warming", image: 7 },
  { name: "Chicken", detail: "Roasted, grilled or crispy", image: 11 },
  { name: "Steak & barbecue", detail: "Fresh from the grill", image: 12 },
  { name: "Seafood", detail: "Fish & coastal favorites", image: 13 },
  { name: "Breakfast & brunch", detail: "Make a morning of it", image: 14 },
  { name: "Vegetarian", detail: "Vegetables take the lead", image: 9 },
  { name: "Vegan", detail: "Entirely plant based", image: 10 },
  { name: "Desserts", detail: "Finish on a sweet note", image: 15 },
];
const cuisines: Meal[] = [
  { name: "Mexican", detail: "Tacos, tortillas & bright flavors", image: 4, bowl: 0 },
  { name: "Asian", detail: "Noodles, rice & fragrant spices", image: 6, bowl: 1 },
  { name: "Mediterranean", detail: "Fresh produce & coastal plates", image: 10, bowl: 2 },
  { name: "Italian", detail: "Pasta, pizza & regional classics", image: 2, bowl: 3 },
  { name: "Middle Eastern", detail: "Mezze, flatbreads & grills", image: 9, bowl: 4 },
  { name: "Healthy", detail: "Colorful bowls & fresh ingredients", image: 13, bowl: 5 },
  { name: "Japanese", detail: "Sushi, ramen & more", image: 3 },
  { name: "Chinese", detail: "Noodles, dumplings & stir fries", image: 6 },
  { name: "Indian", detail: "Curries, tandoor & spices", image: 5 },
  { name: "Thai", detail: "Fragrant curries & noodles", image: 7 },
  { name: "Korean", detail: "Barbecue, bowls & banchan", image: 8 },
  { name: "Vietnamese", detail: "Pho, fresh herbs & banh mi", image: 6 },
  { name: "Greek", detail: "Salads, souvlaki & shared plates", image: 10 },
  { name: "French", detail: "Bistro favorites & patisserie", image: 11 },
  { name: "American", detail: "Diner classics & barbecue", image: 0 },
  { name: "Spanish", detail: "Tapas, rice & seafood", image: 13 },
  { name: "Turkish", detail: "Kebabs, pide & mezze", image: 12 },
  { name: "Caribbean", detail: "Island spices & grilled favorites", image: 11 },
  { name: "African", detail: "Explore regional kitchens", image: 5 },
  { name: "Latin American", detail: "Grills, bowls & regional dishes", image: 4 },
];

// The artwork is not an evenly spaced grid. Keep complete plate/bowl bounds,
// then fit each crop into the same centered display area without a shape mask.
const plateColumns = [[12, 310], [322, 306], [628, 304], [933, 309]];
const plateRows = [[74, 242], [355, 254], [647, 254], [941, 251]];
const bowlColumns = [[5, 414], [420, 409], [831, 423]];
const bowlRows = [[161, 407], [646, 407]];

function MealPhoto({ meal }: { meal: Meal }) {
  const bowl = meal.bowl !== undefined;
  const index = meal.bowl ?? meal.image;
  const [x, width] = (bowl ? bowlColumns : plateColumns)[index % (bowl ? 3 : 4)];
  const [y, height] = (bowl ? bowlRows : plateRows)[Math.floor(index / (bowl ? 3 : 4))];
  return <span className="ss-meal-photo" aria-hidden="true"><svg viewBox={`${x} ${y} ${width} ${height}`} style={{ aspectRatio: `${width} / ${height}` }} overflow="hidden"><image href={bowl ? "/meal-bowls.png" : "/meal-atlas.png"} width="1254" height="1254" /></svg></span>;
}

export function SearchFoodPicker({ food, onChoose, onClose }: {
  food: string;
  onChoose: (value: string) => void;
  onClose: () => void;
}) {
  const foodMatchesCuisine = cuisines.some((item) => (item.query ?? item.name).toLowerCase() === food.trim().toLowerCase());
  const [category, setCategory] = useState<"meals" | "cuisines">(foodMatchesCuisine ? "cuisines" : "meals");
  const list = category === "meals" ? meals : cuisines;

  return <section id="search-food-picker" className="search-food-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="search-food-picker-title">
    <button type="button" className="location-picker-close" onClick={onClose} aria-label="Close food picker">×</button>
    <header className="search-food-picker-heading">
      <div><span className="section-kicker">Food and cuisine</span><h2 id="search-food-picker-title">Choose what you’re <em>craving.</em></h2></div>
      <p>Pick an option to add it to your search instantly, or close this menu and type anything you like.</p>
    </header>
    <div className="search-food-picker-tabs" role="group" aria-label="Food choice type">
      <button type="button" aria-pressed={category === "meals"} onClick={() => setCategory("meals")}>Meals &amp; dishes</button>
      <button type="button" aria-pressed={category === "cuisines"} onClick={() => setCategory("cuisines")}>Cuisines</button>
    </div>
    <div className="search-food-picker-grid" role="listbox" aria-label={category === "meals" ? "Meals and dishes" : "Cuisines"}>
      {list.map((meal) => {
        const value = meal.query ?? meal.name;
        const selected = food.trim().toLowerCase() === value.toLowerCase();
        return <button type="button" key={meal.name} className={selected ? "search-food-choice is-selected" : "search-food-choice"} role="option" aria-selected={selected} onClick={() => onChoose(value)}>
          <MealPhoto meal={meal} />
          <span className="search-food-choice-copy"><strong>{meal.name}</strong><small>{meal.detail}</small></span>
          <span className="search-food-choice-check" aria-hidden="true">✓</span>
        </button>;
      })}
    </div>
  </section>;
}

export function MealSelector({ food, location, allergies, reducedMotion, onChange, onBack, onStart }: {
  food: string; location: string; allergies: string[]; reducedMotion: boolean | null;
  onChange: (value: string) => void; onBack: () => void; onStart: () => void;
}) {
  const [category, setCategory] = useState<"meals" | "cuisines">("meals");
  const list = category === "meals" ? meals : cuisines;
  const rail = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const scrollTarget = useRef(0);
  const activeRef = useRef(0);
  const requestedIndex = useRef<number | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touching = useRef(false);
  const drag = useRef({ active: false, x: 0, scroll: 0, moved: false, lastX: 0, lastTime: 0, velocity: 0 });
  const [active, setActive] = useState(0);
  const [anythingSelected, setAnythingSelected] = useState(!food.trim());
  const initializedCategory = useRef<string | null>(null);
  const cancelScroll = () => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = null;
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    requestedIndex.current = null;
  };
  const animateTo = (left: number) => {
    const element = rail.current;
    if (!element) return;
    scrollTarget.current = Math.max(0, Math.min(element.scrollWidth - element.clientWidth, left));
    if (reducedMotion) { element.scrollLeft = scrollTarget.current; requestedIndex.current = null; return; }
    if (frame.current) return;
    let previous = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(now - previous, 40);
      previous = now;
      const remaining = scrollTarget.current - element.scrollLeft;
      if (Math.abs(remaining) < .7) {
        element.scrollLeft = scrollTarget.current;
        frame.current = 0;
        requestedIndex.current = null;
        scheduleSnap();
        return;
      }
      element.scrollLeft += remaining * (1 - Math.exp(-dt / 125));
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  };
  const updateEmphasis = () => {
    const element = rail.current;
    if (!element) return 0;
    const center = element.scrollLeft + element.clientWidth / 2;
    let nearest = 0, distance = Infinity;
    Array.from(element.children).forEach((child, index) => {
      const node = child as HTMLElement;
      const d = Math.abs(node.offsetLeft + node.offsetWidth / 2 - center);
      const emphasis = Math.max(0, 1 - d / (node.offsetWidth + 26));
      const eased = emphasis * emphasis * (3 - 2 * emphasis);
      node.style.setProperty("--meal-emphasis", String(eased));
      if (d < distance) { distance = d; nearest = index; }
    });
    return nearest;
  };
  // Native touch/trackpad momentum must finish before centering an option.
  // Every scroll event postpones this, so fast swipes are never pulled back.
  function scheduleSnap() {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      settleTimer.current = null;
      if (touching.current || drag.current.active || frame.current) return;
      const element = rail.current;
      if (!element) return;
      const index = updateEmphasis();
      const node = element.children[index] as HTMLElement | undefined;
      if (!node) return;
      const left = node.offsetLeft + node.offsetWidth / 2 - element.clientWidth / 2;
      if (Math.abs(element.scrollLeft - left) > 1) go(index);
    }, 140);
  }
  function releaseWithMomentum() {
    const element = rail.current;
    if (!element) return;
    let velocity = performance.now() - drag.current.lastTime > 100 ? 0 : drag.current.velocity;
    if (reducedMotion || Math.abs(velocity) <= .12) { go(updateEmphasis()); return; }
    let previous = performance.now();
    const coast = (now: number) => {
      const dt = Math.min(now - previous, 40);
      previous = now;
      const decay = Math.exp(-dt / 240);
      const before = element.scrollLeft;
      element.scrollLeft += velocity * 240 * (1 - decay);
      scrollTarget.current = element.scrollLeft;
      velocity *= decay;
      // Only engage the centering animation once speed falls below 120px/s.
      if (Math.abs(velocity) <= .12 || Math.abs(element.scrollLeft - before) < .1) {
        frame.current = 0;
        go(updateEmphasis());
        return;
      }
      frame.current = requestAnimationFrame(coast);
    };
    frame.current = requestAnimationFrame(coast);
  }
  useEffect(() => {
    if (initializedCategory.current === category) return;
    initializedCategory.current = category;
    const match = list.findIndex(item => (item.query ?? item.name).toLowerCase() === food.toLowerCase());
    const index = match >= 0 ? match : category === "cuisines" ? 2 : 0;
    setActive(index);
    activeRef.current = index;
    const node = rail.current?.children[index] as HTMLElement | undefined;
    if (node && rail.current) rail.current.scrollLeft = node.offsetLeft + node.offsetWidth / 2 - rail.current.clientWidth / 2;
    updateEmphasis();
  }, [category, food, list]);
  useEffect(() => {
    const element = rail.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey) return;
      const delta = (Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY) * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientWidth : 1);
      if (!delta) return;
      event.preventDefault();
      const target = requestedIndex.current === null && frame.current ? scrollTarget.current : element.scrollLeft;
      cancelScroll();
      requestedIndex.current = null;
      animateTo(target + delta * .85);
      scheduleSnap();
    };
    const resize = new ResizeObserver(() => {
      cancelScroll();
      const node = element.children[activeRef.current] as HTMLElement | undefined;
      if (node) element.scrollLeft = node.offsetLeft + node.offsetWidth / 2 - element.clientWidth / 2;
      updateEmphasis();
    });
    resize.observe(element);
    element.addEventListener("wheel", wheel, { passive: false });
    return () => { cancelScroll(); resize.disconnect(); element.removeEventListener("wheel", wheel); };
  }, [category, reducedMotion]);
  const select = (index: number) => {
    const item = list[index];
    setActive(index);
    activeRef.current = index;
    setAnythingSelected(item.query === "");
    onChange(item.query ?? item.name);
  };
  const go = (index: number) => {
    index = Math.max(0, Math.min(list.length - 1, index));
    cancelScroll();
    requestedIndex.current = index;
    const node = rail.current?.children[index] as HTMLElement | undefined;
    if (node && rail.current) animateTo(node.offsetLeft + node.offsetWidth / 2 - rail.current.clientWidth / 2);
    select(index);
  };
  useEffect(() => {
    const continueOnEnter = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.repeat || event.isComposing || event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("a, textarea, [contenteditable=true], [role=dialog]")) return;
      const button = target?.closest("button");
      if (button && !button.matches('.ss-meal-pillar[aria-pressed="true"]')) return;
      if (!location.trim() || (!food.trim() && !anythingSelected)) return;
      event.preventDefault();
      onStart();
    };
    window.addEventListener("keydown", continueOnEnter);
    return () => window.removeEventListener("keydown", continueOnEnter);
  }, [food, location, anythingSelected, onStart]);
  return <div className="ss-meal-stage">
    <div className="ss-meal-intro"><span className="ss-meal-eyebrow">Step 03</span><h1>A world of <em>flavors.</em></h1></div>
    <div className="ss-meal-tabs" role="group" aria-label="Browse food options">{(["meals", "cuisines"] as const).map(value => <button key={value} type="button" aria-pressed={category === value} onClick={() => { cancelScroll(); setCategory(value); }} >{value === "meals" ? "Meals & dishes" : "Around the world"}</button>)}</div>
    <div className="ss-meal-gallery">
      <div key={category} ref={rail} className="ss-meal-rail" role="region" aria-roledescription="carousel" aria-label="Choose a meal or cuisine" tabIndex={0}
        onKeyDown={event => { if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); go((requestedIndex.current ?? activeRef.current) + (event.key === "ArrowRight" ? 1 : -1)); } }}
        onScroll={() => {
          const nearest = updateEmphasis();
          scheduleSnap();
          if (requestedIndex.current !== null) return;
          if (nearest !== activeRef.current) select(nearest);
        }}
        onPointerDown={event => { cancelScroll(); drag.current.moved = false; if (event.pointerType !== "mouse") { touching.current = true; return; } if (event.button !== 0) return; drag.current = { active: true, x: event.clientX, scroll: event.currentTarget.scrollLeft, moved: false, lastX: event.clientX, lastTime: performance.now(), velocity: 0 }; }}
        onPointerMove={event => { const d = drag.current; if (!d.active) return; const dx = event.clientX - d.x; const now = performance.now(); const dt = now - d.lastTime; if (dt > 0) d.velocity = d.velocity * .25 + (d.lastX - event.clientX) / dt * .75; d.lastX = event.clientX; d.lastTime = now; if (Math.abs(dx) > 5) { d.moved = true; event.currentTarget.setPointerCapture(event.pointerId); } if (d.moved) event.currentTarget.scrollLeft = d.scroll - dx; }}
        onPointerUp={event => { touching.current = false; const d = drag.current; const wasDragging = d.active; d.active = false; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); if (wasDragging && d.moved) releaseWithMomentum(); else scheduleSnap(); }}
        onPointerCancel={() => { touching.current = false; drag.current.active = false; scheduleSnap(); }}
        onLostPointerCapture={() => { touching.current = false; drag.current.active = false; scheduleSnap(); }}>
        {list.map((meal, index) => <button type="button" key={meal.name} className={`ss-meal-pillar ${active === index ? "is-centered" : ""}`} aria-pressed={food === (meal.query ?? meal.name)} aria-label={`Choose ${meal.name}`} onClick={() => { if (!drag.current.moved) { go(index); select(index); } drag.current.moved = false; }}>
          <span className="ss-meal-halo" aria-hidden="true" />
          <MealPhoto meal={meal} />
          <span className="ss-pillar-wood" aria-hidden="true" />
          <span className="ss-pillar-label"><strong>{meal.name}</strong></span>
        </button>)}
      </div>
      <div className="ss-meal-navigation"><button type="button" onClick={() => go((requestedIndex.current ?? activeRef.current) - 1)} disabled={active === 0} aria-label="Previous option"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m14 5-7 7 7 7" /></svg></button><span aria-live="polite">{list[active]?.name}<small>{active + 1} of {list.length} · Swipe or scroll to explore</small></span><button type="button" onClick={() => go((requestedIndex.current ?? activeRef.current) + 1)} disabled={active === list.length - 1} aria-label="Next option"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m10 5 7 7-7 7" /></svg></button></div>
      <div className="ss-meal-dots" aria-hidden="true">{list.map((meal, index) => <i key={meal.name} className={index === active ? "is-active" : ""} />)}</div>
    </div>
    <div className="ss-meal-finish"><div><label htmlFor="quest-food">Your choice, or something else <span>(optional)</span></label><input id="quest-food" value={food} onChange={event => { setAnythingSelected(false); onChange(event.target.value); }} placeholder="Anything — or type a dish or cuisine" /><p>{location} · {allergies.length ? `${allergies.length} allergy filters applied` : "No allergy filters selected"}</p></div><button type="button" className="ss-primary" onClick={onStart} disabled={!location.trim()}>Find places to eat <span>→</span></button></div>
    <button type="button" className="ss-meal-back" onClick={onBack}>← Change destination</button>
  </div>;
}
