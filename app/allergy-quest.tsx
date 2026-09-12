"use client";

import { useEffect, useLayoutEffect, useId, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useMotionValue, useSpring } from "motion/react";
import Link from "next/link";
import { AccountControls } from "./auth-ui";
import { BrandWordmark, SafeServeMark } from "./safe-serve-logo";
import { InteractiveGlobe } from "./interactive-globe";
import { MealSelector } from "./meal-selector";
import { CityInput } from "./city-input";

type Props = {
  allergies: string[]; customAllergy: string; location: string; food: string;
  cityOptions: string[]; allergyOptions: string[]; reducedMotion: boolean | null;
  onToggleAllergy: (name: string) => void; onCustomAllergyChange: (value: string) => void;
  onLocationChange: (value: string) => void; onFoodChange: (value: string) => void;
  onGlobeLocationSelect: (selection: { label: string; latitude: number; longitude: number }) => void;
  onStart: (foodOverride?: string) => void;
};

const foodStyle = (index: number): CSSProperties => ({
  "--food-x": `${(index % 5) * 25}%`, "--food-y": `${Math.floor(index / 5) * 100}%`,
} as CSSProperties);

// The image atlas keeps its original order even when the visible list is shorter.
const foodAtlas = ["peanuts", "tree nuts", "milk", "eggs", "wheat", "soy", "fish", "shellfish", "sesame", "gluten"];
const foodIndex = (name: string) => foodAtlas.indexOf(name.trim().toLowerCase());

export function AllergyQuest(props: Props) {
  const customPlateCurveId = useId();
  const [editingCustom, setEditingCustom] = useState(false);
  const customInputRef = useRef<HTMLInputElement>(null);
  const customTriggerRef = useRef<HTMLButtonElement>(null);
  const wasEditingCustom = useRef(false);
  const { allergies, allergyOptions, customAllergy, location, food, cityOptions, reducedMotion,
    onToggleAllergy, onCustomAllergyChange, onLocationChange, onFoodChange, onGlobeLocationSelect, onStart } = props;
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const stepRef = useRef<1 | 2 | 3>(1);
  const [drag, setDrag] = useState<{ name: string; index: number; width: number; height: number } | null>(null);
  const [overTarget, setOverTarget] = useState(false);
  const targetRef = useRef<HTMLDivElement>(null);
  const journeyRef = useRef<HTMLElement>(null);
  const pointer = useRef({ x: 0, y: 0, startX: 0, startY: 0, offsetX: 0, offsetY: 0, moved: false });
  const dragX = useMotionValue(0), dragY = useMotionValue(0), tilt = useMotionValue(0);
  const rotation = useSpring(tilt, { stiffness: 430, damping: 24, mass: .5 });
  const transition = { duration: reducedMotion ? 0 : .36, ease: [.22, 1, .36, 1] as [number, number, number, number] };
  const selectionLabel = allergies.length ? `${allergies.length} ${allergies.length === 1 ? "allergy" : "allergies"} selected` : "No allergies selected yet";

  useEffect(() => {
    if (editingCustom) customInputRef.current?.focus();
    else if (wasEditingCustom.current) customTriggerRef.current?.focus();
    wasEditingCustom.current = editingCustom;
  }, [editingCustom]);

  useEffect(() => {
    const restoreStep = () => {
      const saved = window.history.state?.safeServeQuestStep;
      const fromUrl = new URLSearchParams(window.location.search).get("step");
      const restored = saved === 2 || saved === 3 ? saved : fromUrl === "destination" ? 2 : fromUrl === "meal" ? 3 : 1;
      stepRef.current = restored;
      setStep(restored);
    };
    if (!window.history.state?.safeServeQuestStep && !new URLSearchParams(window.location.search).has("step")) {
      window.history.replaceState({ ...window.history.state, safeServeQuestStep: 1 }, "", "/?step=allergies");
    }
    restoreStep();
    window.addEventListener("popstate", restoreStep);
    return () => window.removeEventListener("popstate", restoreStep);
  }, []);

  function commitStep(next: 1 | 2 | 3) {
    if (next === stepRef.current) return;
    if (next < stepRef.current && window.history.state?.safeServeQuestPreviousStep === next) {
      window.history.back();
      return;
    }
    const stepName = next === 1 ? "allergies" : next === 2 ? "destination" : "meal";
    window.history.pushState({ ...window.history.state, safeServeQuestStep: next, safeServeQuestPreviousStep: stepRef.current }, "", `/?step=${stepName}`);
    stepRef.current = next;
    setStep(next);
  }

  function goToStep(next: 1 | 2 | 3) {
    commitStep(next);
  }

  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, [step]);
  useLayoutEffect(() => {
    if (journeyRef.current) journeyRef.current.scrollTop = 0;
  }, [step]);

  useEffect(() => {
    const viewport = window.visualViewport;
    const updateHeight = () => {
      // Do not interfere with the browser's own accessibility page zoom.
      if (viewport && viewport.scale === 1) document.documentElement.style.setProperty("--phone-viewport-height", `${viewport.height}px`);
    };
    updateHeight();
    viewport?.addEventListener("resize", updateHeight);
    return () => {
      viewport?.removeEventListener("resize", updateHeight);
      document.documentElement.style.removeProperty("--phone-viewport-height");
    };
  }, []);

  useEffect(() => {
    const continueOnEnter = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.repeat || event.isComposing || event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("button, a, textarea, [contenteditable=true], [role=dialog]") || target?.id === "quest-custom-allergy") return;
      if (step === 1 && allergies.length > 0) { event.preventDefault(); commitStep(2); }
      if (step === 2 && location.trim()) { event.preventDefault(); commitStep(3); }
    };
    window.addEventListener("keydown", continueOnEnter);
    return () => window.removeEventListener("keydown", continueOnEnter);
  }, [step, location, allergies.length]);

  function addCustom() {
    const entered = customAllergy.trim();
    if (!entered) return;
    const value = allergyOptions.find(name => name.toLowerCase() === entered.toLowerCase()) ?? entered;
    if (!allergies.some(item => item.toLowerCase() === value.toLowerCase())) onToggleAllergy(value);
    onCustomAllergyChange("");
    setEditingCustom(false);
    customTriggerRef.current?.focus();
  }
  function resetHover(element: HTMLButtonElement) {
    element.style.setProperty("--pick-x", "0px");
    element.style.setProperty("--pick-y", "0px");
  }
  function begin(event: PointerEvent<HTMLButtonElement>, name: string, index: number) {
    if (event.button !== 0) return;
    const bounds = event.currentTarget.querySelector(".ss-food-plate")!.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointer.current = { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY,
      offsetX: event.clientX - bounds.left, offsetY: event.clientY - bounds.top, moved: false };
    dragX.set(bounds.left); dragY.set(bounds.top); tilt.set(0);
    setDrag({ name, index, width: bounds.width, height: bounds.height });
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    if (!drag) {
      if (reducedMotion || event.pointerType === "touch") return;
      const rect = event.currentTarget.getBoundingClientRect();
      event.currentTarget.style.setProperty("--pick-x", `${((event.clientX - rect.left) / rect.width - .5) * 9}px`);
      event.currentTarget.style.setProperty("--pick-y", `${((event.clientY - rect.top) / rect.height - .5) * 7}px`);
      return;
    }
    const p = pointer.current;
    dragX.set(event.clientX - p.offsetX); dragY.set(event.clientY - p.offsetY);
    tilt.set(reducedMotion ? 0 : Math.max(-22, Math.min(22, (event.clientX - p.x) * .9)));
    p.x = event.clientX; p.y = event.clientY;
    p.moved ||= Math.hypot(p.x - p.startX, p.y - p.startY) > 6;
    const r = targetRef.current?.getBoundingClientRect();
    const inside = Boolean(r && p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom);
    setOverTarget(current => current === inside ? current : inside);
  }
  function finish(event: PointerEvent<HTMLButtonElement>, cancelled = false) {
    if (drag && !cancelled) {
      const r = targetRef.current?.getBoundingClientRect();
      const inside = r && event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
      if (!pointer.current.moved) onToggleAllergy(drag.name);
      else if (inside && !allergies.includes(drag.name)) onToggleAllergy(drag.name);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    resetHover(event.currentTarget); setDrag(null); setOverTarget(false);
  }

  return <main className={`ss-experience ss-step-${step}`}>
    <header className="ss-nav">
      <Link href="/" className="ss-brand" aria-label="Gluten FreEat home"><SafeServeMark /><BrandWordmark /></Link>
      <nav className="ss-steps" aria-label="Search steps"><button type="button" aria-label="1. Allergy profile" aria-current={step === 1 ? "step" : undefined} onClick={() => goToStep(1)}><b>1</b><span>Allergy profile</span></button><i /><button type="button" aria-label="2. Destination" aria-current={step === 2 ? "step" : undefined} onClick={() => goToStep(2)}><b>2</b><span>Destination</span></button><i /><button type="button" disabled={!location.trim()} aria-label="3. What to eat" aria-current={step === 3 ? "step" : undefined} onClick={() => goToStep(3)}><b>3</b><span>What to eat</span></button></nav>
      <AccountControls />
    </header>
    <AnimatePresence mode="wait">
      {step === 1 ? <motion.section className="ss-table-scene" key="table" initial={reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={transition}>
        <aside className="ss-sidebar">
          <h1>Your allergy profile</h1>
          <p>Tap the ingredients you avoid.</p>
          <div className="ss-safety-note"><SafeServeMark /><span>We’ll use these filters in every search. Always confirm with restaurant staff.</span></div>
          <div className="ss-sidebar-status" aria-live="polite"><span className="ss-selection-count">{allergies.length.toString().padStart(2, "0")}</span><span>{selectionLabel}</span></div>
        </aside>
        <div className="ss-table">
          <div className="ss-plate-grid" aria-label="Choose allergies to avoid">
            {allergyOptions.map((name, index) => <button key={name} type="button" className={`ss-ingredient ${allergies.includes(name) ? "is-chosen" : ""} ${drag?.name === name ? "is-held" : ""}`} style={{ ...foodStyle(foodIndex(name)), "--entry": index } as CSSProperties}
              aria-pressed={allergies.includes(name)} aria-label={`${name}: ${allergies.includes(name) ? "remove from" : "add to"} avoid list`}
              onPointerDown={e => begin(e, name, foodIndex(name))} onPointerMove={move} onPointerUp={e => finish(e)} onPointerCancel={e => finish(e, true)} onLostPointerCapture={e => finish(e, true)} onPointerLeave={e => resetHover(e.currentTarget)}
              onClick={e => { if (e.detail === 0) onToggleAllergy(name); }}>
              <span className="ss-food-plate"><span className="ss-food" /></span><strong className="ss-name-tag">{name}</strong><span className="ss-check" aria-hidden="true">✓</span>
            </button>)}
            <div ref={targetRef} className={`ss-drop-plate ${overTarget ? "is-over" : ""}`} aria-label="Ingredients to avoid">
              <div className="ss-drop-content">
                <div className="ss-selected-plates">
                  <AnimatePresence initial={false}>{allergies.map(name => <motion.button
                    type="button" key={name} className="ss-selected-plate" style={foodStyle(foodIndex(name))}
                    onClick={() => onToggleAllergy(name)} aria-label={`Remove ${name}`} title={name}
                    initial={reducedMotion ? false : { opacity: 0, scale: .55, y: -12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .6 }} transition={transition}
                  ><span className="ss-food-plate" aria-hidden="true">{foodIndex(name) >= 0 && <span className="ss-food" />}</span></motion.button>)}</AnimatePresence>
                </div>
              </div>
              <button ref={customTriggerRef} type="button" className="ss-plate-rim" aria-label="Add allergy" aria-expanded={editingCustom} aria-controls={editingCustom ? "quest-custom-allergy" : undefined} onClick={() => setEditingCustom(true)}>
                <svg viewBox="0 0 320 96" aria-hidden="true">
                  <defs><path id={customPlateCurveId} d="M 36 12 Q 160 114 284 12" /></defs>
                  <text><textPath href={`#${customPlateCurveId}`} startOffset="50%" textAnchor="middle">Add allergy</textPath></text>
                </svg>
              </button>
              {editingCustom && <form className="ss-rim-editor" onSubmit={event => { event.preventDefault(); addCustom(); }}>
                <input ref={customInputRef} id="quest-custom-allergy" aria-label="Custom allergy" value={customAllergy} onChange={e => onCustomAllergyChange(e.target.value)} onKeyDown={e => {
                  if (e.nativeEvent.isComposing) { if (e.key === "Enter") e.preventDefault(); return; }
                  if (e.key === "Escape") { e.preventDefault(); setEditingCustom(false); onCustomAllergyChange(""); customTriggerRef.current?.focus(); }
                }} placeholder="Add allergy" autoComplete="off" enterKeyHint="done" maxLength={60} />
              </form>}
            </div>
          </div>
          {allergies.some(name => foodIndex(name) < 0) && <div className="ss-custom-selections" aria-label="Custom allergies">{allergies.filter(name => foodIndex(name) < 0).map(name => <button type="button" key={name} onClick={() => onToggleAllergy(name)} aria-label={`Remove custom allergy ${name}`}>{name}<span aria-hidden="true">×</span></button>)}</div>}
          <div className="ss-table-actions"><button type="button" className="ss-primary" onClick={() => goToStep(2)}>Continue <span>→</span></button></div>
        </div>
      </motion.section> : <motion.section ref={journeyRef} className={`ss-destination ss-journey-scene ${step === 3 ? "is-meal-scene" : ""}`} key="destination" initial={reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={transition}>
        <div className="ss-destination-copy" hidden={step === 3}><h1>Where to?</h1>
          <label htmlFor="quest-location">Location</label><div className="ss-location-field"><CityInput id="quest-location" value={location} options={cityOptions} onChange={onLocationChange} onChoose={city => { onLocationChange(city); goToStep(3); }} /><span aria-hidden="true">⌖</span></div>
          <button className="ss-back" type="button" onClick={() => goToStep(1)}>← Allergy profile</button>
        </div>
        <div className="ss-earth-stage"><InteractiveGlobe location={location} reducedMotion={reducedMotion} presentation={step === 3 ? "meal" : "destination"} onSelectCountry={selection => { onGlobeLocationSelect(selection); goToStep(3); }} /></div>
        <aside className="ss-destination-summary" hidden={step === 3}><div className="ss-destination-card"><span>Current location</span><strong>{location || "Choose a destination"}</strong><span>Your avoid list</span><p>{allergies.length ? allergies.join(", ") : "No allergies selected"}</p></div></aside>
        {step === 3 && <MealSelector food={food} location={location} allergies={allergies} reducedMotion={reducedMotion} onChange={onFoodChange} onBack={() => goToStep(2)} onStart={onStart} />}
      </motion.section>}
    </AnimatePresence>
    {drag && createPortal(<motion.div className="ss-drag-plate" style={{ ...foodStyle(drag.index), x: dragX, y: dragY, rotate: rotation, width: drag.width, height: drag.height }} aria-hidden="true"><span className="ss-food" /></motion.div>, document.body)}
  </main>;
}
