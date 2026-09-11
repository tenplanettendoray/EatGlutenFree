"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useMotionValue, useSpring } from "motion/react";
import Link from "next/link";
import { AccountControls } from "./auth-ui";
import { SafeServeMark } from "./safe-serve-logo";
import { InteractiveGlobe } from "./interactive-globe";
import { MealSelector } from "./meal-selector";

type Props = {
  allergies: string[]; customAllergy: string; location: string; food: string;
  cityOptions: string[]; allergyOptions: string[]; reducedMotion: boolean | null;
  onToggleAllergy: (name: string) => void; onCustomAllergyChange: (value: string) => void;
  onLocationChange: (value: string) => void; onFoodChange: (value: string) => void;
  onGlobeLocationSelect: (selection: { label: string; latitude: number; longitude: number }) => void;
  onStart: () => void;
};

const foodStyle = (index: number): CSSProperties => ({
  "--food-x": `${(index % 5) * 25}%`, "--food-y": `${Math.floor(index / 5) * 100}%`,
} as CSSProperties);

export function AllergyQuest(props: Props) {
  const { allergies, allergyOptions, customAllergy, location, food, cityOptions, reducedMotion,
    onToggleAllergy, onCustomAllergyChange, onLocationChange, onFoodChange, onGlobeLocationSelect, onStart } = props;
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const stepRef = useRef<1 | 2 | 3>(1);
  const [drag, setDrag] = useState<{ name: string; index: number; width: number; height: number } | null>(null);
  const [overTarget, setOverTarget] = useState(false);
  const targetRef = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0, startX: 0, startY: 0, offsetX: 0, offsetY: 0, moved: false });
  const dragX = useMotionValue(0), dragY = useMotionValue(0), tilt = useMotionValue(0);
  const rotation = useSpring(tilt, { stiffness: 430, damping: 24, mass: .5 });
  const transition = { duration: reducedMotion ? 0 : .36, ease: [.22, 1, .36, 1] as [number, number, number, number] };
  const selectionLabel = allergies.length ? `${allergies.length} ${allergies.length === 1 ? "allergy" : "allergies"} selected` : "No allergies selected yet";

  useEffect(() => {
    const restoreStep = () => {
      const saved = window.history.state?.safeServeQuestStep;
      const restored = saved === 2 || saved === 3 ? saved : 1;
      stepRef.current = restored;
      setStep(restored);
    };
    if (!window.history.state?.safeServeQuestStep) {
      window.history.replaceState({ ...window.history.state, safeServeQuestStep: 1 }, "");
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
    window.history.pushState({ ...window.history.state, safeServeQuestStep: next, safeServeQuestPreviousStep: stepRef.current }, "");
    stepRef.current = next;
    setStep(next);
  }

  function goToStep(next: 1 | 2 | 3) {
    commitStep(next);
  }

  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, [step]);

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
    const value = customAllergy.trim();
    if (!value) return;
    if (!allergies.some(item => item.toLowerCase() === value.toLowerCase())) onToggleAllergy(value);
    onCustomAllergyChange("");
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
      <Link href="/" className="ss-brand" aria-label="Safe Serve home"><SafeServeMark /><span>Safe Serve<small>CanIEatIt?</small></span></Link>
      <nav className="ss-steps" aria-label="Search steps"><button type="button" aria-current={step === 1 ? "step" : undefined} onClick={() => goToStep(1)}><b>1</b><span>Allergy profile</span></button><i /><button type="button" aria-current={step === 2 ? "step" : undefined} onClick={() => goToStep(2)}><b>2</b><span>Destination</span></button><i /><button type="button" disabled={!location.trim()} aria-current={step === 3 ? "step" : undefined} onClick={() => goToStep(3)}><b>3</b><span>What to eat</span></button></nav>
      <AccountControls />
    </header>
    <AnimatePresence mode="wait">
      {step === 1 ? <motion.section className="ss-table-scene" key="table" initial={reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={transition}>
        <aside className="ss-sidebar">
          <h1>Your allergy profile</h1>
          <p>Select the ingredients you avoid. You can also drag them onto the center plate.</p>
          <div className="ss-safety-note"><SafeServeMark /><span>We’ll use these filters in every search. Always confirm with restaurant staff.</span></div>
          <div className="ss-sidebar-status" aria-live="polite"><span className="ss-selection-count">{allergies.length.toString().padStart(2, "0")}</span><span>{selectionLabel}</span></div>
        </aside>
        <div className="ss-table">
          <div className="ss-plate-grid" aria-label="Choose allergies to avoid">
            {allergyOptions.map((name, index) => <button key={name} type="button" className={`ss-ingredient ${allergies.includes(name) ? "is-chosen" : ""} ${drag?.name === name ? "is-held" : ""}`} style={{ ...foodStyle(index), "--entry": index } as CSSProperties}
              aria-pressed={allergies.includes(name)} aria-label={`${name}: ${allergies.includes(name) ? "remove from" : "add to"} avoid list`}
              onPointerDown={e => begin(e, name, index)} onPointerMove={move} onPointerUp={e => finish(e)} onPointerCancel={e => finish(e, true)} onPointerLeave={e => resetHover(e.currentTarget)}
              onClick={e => { if (e.detail === 0) onToggleAllergy(name); }}>
              <span className="ss-food-plate"><span className="ss-food" /></span><strong className="ss-name-tag">{name}</strong><span className="ss-check" aria-hidden="true">✓</span>
            </button>)}
            <div ref={targetRef} className={`ss-drop-plate ${overTarget ? "is-over" : ""}`} aria-label="Ingredients to avoid">
              <div className="ss-drop-content"><span>Ingredients to avoid</span><div className="ss-selected-tags" aria-live="polite"><AnimatePresence initial={false}>{allergies.length ? allergies.map(name => <motion.button type="button" key={name} onClick={() => onToggleAllergy(name)} aria-label={`Remove ${name}`} initial={reducedMotion ? false : { opacity: 0, scale: .75 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .7 }} transition={transition}>{name}<b>×</b></motion.button>) : <motion.p key="empty">These are the ones<br />you want to avoid.</motion.p>}</AnimatePresence></div></div>
            </div>
            <div className="ss-custom-plate"><button className="ss-custom-focus" type="button" onClick={() => document.getElementById("quest-custom-allergy")?.focus()} aria-label="Add another allergy"><span>+</span></button><label htmlFor="quest-custom-allergy" className="ss-name-tag">Add other allergy</label><div className="ss-custom-input"><input id="quest-custom-allergy" value={customAllergy} onChange={e => onCustomAllergyChange(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }} placeholder="Other allergy" maxLength={60} /><button type="button" onClick={addCustom} disabled={!customAllergy.trim()} aria-label="Add custom allergy">+</button></div></div>
          </div>
          <div className="ss-table-actions"><span>{selectionLabel}<small>Tap a plate to select it, too.</small></span><button type="button" className="ss-primary" onClick={() => goToStep(2)}>Continue <span>→</span></button></div>
        </div>
      </motion.section> : <motion.section className={`ss-destination ss-journey-scene ${step === 3 ? "is-meal-scene" : ""}`} key="destination" initial={reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={transition}>
        <div className="ss-destination-copy" hidden={step === 3}><h1>Where are you going?</h1><p>Search a city, neighborhood, or ZIP code. You can also choose a place on the globe.</p>
          <label htmlFor="quest-location">Location</label><div className="ss-location-field"><input id="quest-location" value={location} onChange={e => onLocationChange(e.target.value)} placeholder="Paris, France" autoComplete="address-level2" list="city-catalog-options" /><span aria-hidden="true">⌖</span></div>
          <datalist id="city-catalog-options">{cityOptions.map(city => <option value={city} key={city} />)}</datalist>
          <button className="ss-back" type="button" onClick={() => goToStep(1)}>← Allergy profile</button>
        </div>
        <div className="ss-earth-stage"><InteractiveGlobe location={location} reducedMotion={reducedMotion} presentation={step === 3 ? "meal" : "destination"} onSelectCountry={selection => { onGlobeLocationSelect(selection); goToStep(3); }} /></div>
        <aside className="ss-destination-summary" hidden={step === 3}><div className="ss-destination-card"><span>Current location</span><strong>{location || "Choose a destination"}</strong><span>Your avoid list</span><p>{allergies.length ? allergies.join(", ") : "No allergies selected"}</p></div><button type="button" className="ss-primary" disabled={!location.trim()} onClick={() => goToStep(3)}>What to eat <span>→</span></button></aside>
        {step === 3 && <MealSelector food={food} location={location} allergies={allergies} reducedMotion={reducedMotion} onChange={onFoodChange} onBack={() => goToStep(2)} onStart={onStart} />}
      </motion.section>}
    </AnimatePresence>
    {drag && createPortal(<motion.div className="ss-drag-plate" style={{ ...foodStyle(drag.index), x: dragX, y: dragY, rotate: rotation, width: drag.width, height: drag.height }} aria-hidden="true"><span className="ss-food" /></motion.div>, document.body)}
  </main>;
}
