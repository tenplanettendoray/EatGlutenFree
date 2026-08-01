"use client";

import { FormEvent, useMemo, useState } from "react";

type Restaurant = {
  id: string;
  name: string;
  cuisine: string[];
  address: string;
  distanceKm: number;
  website?: string;
  phone?: string;
  openingHours?: string;
  dietary: Record<string, string>;
  latitude: number;
  longitude: number;
};

const allergyOptions = ["Peanuts", "Tree nuts", "Milk", "Eggs", "Wheat", "Soy", "Fish", "Shellfish", "Sesame", "Gluten"];
const dietKeys: Record<string, string> = {
  gluten: "gluten_free", wheat: "gluten_free", milk: "dairy_free", eggs: "egg_free",
  "tree nuts": "nut_free", peanuts: "peanut_free", vegan: "vegan", vegetarian: "vegetarian",
};

function WebsitePreview({ restaurant }: { restaurant: Restaurant }) {
  const [failed, setFailed] = useState(false);
  const preview = restaurant.website ? `https://image.thum.io/get/width/900/crop/560/noanimate/${restaurant.website}` : "";
  return (
    <div className={`restaurant-visual ${failed || !preview ? "visual-fallback" : ""}`}>
      {preview && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="" onError={() => setFailed(true)} />
      ) : <div className="fallback-mark" aria-hidden="true">{restaurant.name.slice(0, 1).toUpperCase()}</div>}
      <div className="visual-shade" />
      <span className="distance-pill">{restaurant.distanceKm.toFixed(1)} km</span>
      {restaurant.website && <span className="site-preview-pill">Website preview</span>}
    </div>
  );
}

function AllergyReview({ restaurant, allergies }: { restaurant: Restaurant; allergies: string[] }) {
  const checks = allergies.map((allergy) => ({ allergy, value: restaurant.dietary[dietKeys[allergy.toLowerCase()]] }));
  const supported = checks.filter(({ value }) => value === "yes");
  return (
    <div className="allergy-review">
      <div className="review-title-row"><span className="review-icon" aria-hidden="true">✦</span><div><strong>Allergy review</strong><p>Based on restaurant details available in OpenStreetMap</p></div></div>
      {allergies.length === 0 ? <p className="review-copy">Add your allergies to personalize this check.</p> : supported.length > 0 ? (
        <div className="review-status cautiously-positive"><strong>Published options found</strong><span>{supported.map(({ allergy }) => allergy).join(", ")} options are listed, but cross-contact still needs confirmation.</span></div>
      ) : (
        <div className="review-status unknown"><strong>Ingredients not verified</strong><span>Ask the restaurant about ingredients, preparation surfaces, fryers, and cross-contact.</span></div>
      )}
    </div>
  );
}

export default function Home() {
  const [location, setLocation] = useState("");
  const [allergies, setAllergies] = useState<string[]>([]);
  const [customAllergy, setCustomAllergy] = useState("");
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [selected, setSelected] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchedLocation, setSearchedLocation] = useState("");
  const allergySummary = useMemo(() => allergies.length ? allergies.join(", ") : "No allergies selected", [allergies]);

  function toggleAllergy(allergy: string) {
    setAllergies((current) => current.includes(allergy) ? current.filter((item) => item !== allergy) : [...current, allergy]);
  }
  function addCustomAllergy() {
    const value = customAllergy.trim();
    if (value && !allergies.some((item) => item.toLowerCase() === value.toLowerCase())) setAllergies((current) => [...current, value]);
    setCustomAllergy("");
  }
  async function runSearch(params: URLSearchParams, label: string) {
    setLoading(true); setError(""); setSelected(null);
    try {
      const response = await fetch(`/api/restaurants?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Restaurant search failed.");
      setRestaurants(data.restaurants); setSearchedLocation(data.location || label);
      if (!data.restaurants.length) setError("No restaurants were found in this area. Try a nearby city or ZIP code.");
    } catch (searchError) {
      setRestaurants([]); setError(searchError instanceof Error ? searchError.message : "Restaurant search failed.");
    } finally { setLoading(false); }
  }
  function submitSearch(event: FormEvent) {
    event.preventDefault();
    if (!location.trim()) { setError("Enter a city, neighborhood, or ZIP code first."); return; }
    runSearch(new URLSearchParams({ location: location.trim() }), location.trim());
  }
  function useMyLocation() {
    if (!navigator.geolocation) { setError("Location services are not supported by this browser."); return; }
    setLoading(true); setError("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => runSearch(new URLSearchParams({ lat: String(coords.latitude), lon: String(coords.longitude) }), "your location"),
      () => { setLoading(false); setError("We could not access your location. Enter a city or ZIP code instead."); },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="ClearPlate home"><span className="brand-symbol" aria-hidden="true">C</span><span>ClearPlate</span></a>
        <nav aria-label="Main navigation"><a href="#how-it-works">How it works</a><a href="#safety">Safety first</a></nav>
        <span className="header-badge">Free preview</span>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <span className="eyebrow"><span>✦</span> Dine out with more clarity</span>
          <h1>Find a table that<br /><em>fits you.</em></h1>
          <p className="hero-lede">Discover nearby restaurants, review available dietary details, and know what questions to ask before you order.</p>
          <div className="trust-row"><span><b>01</b> Search nearby</span><span><b>02</b> Review details</span><span><b>03</b> Confirm directly</span></div>
        </div>

        <form className="search-card" onSubmit={submitSearch}>
          <div className="card-heading"><span>Start your search</span><small>Your choices stay on this device</small></div>
          <label htmlFor="location">Where are you dining?</label>
          <div className="location-row"><span className="input-icon" aria-hidden="true">⌖</span><input id="location" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="City, neighborhood, or ZIP" autoComplete="postal-code" /><button type="button" className="locate-button" onClick={useMyLocation} aria-label="Use my current location">◎</button></div>
          <div className="allergy-label-row"><label>What should we look out for?</label><span>{allergies.length} selected</span></div>
          <div className="allergy-grid">
            {allergyOptions.map((allergy) => <button type="button" key={allergy} className={allergies.includes(allergy) ? "allergy-chip selected" : "allergy-chip"} onClick={() => toggleAllergy(allergy)} aria-pressed={allergies.includes(allergy)}><span>{allergies.includes(allergy) ? "✓" : "+"}</span>{allergy}</button>)}
          </div>
          <div className="custom-allergy-row"><input value={customAllergy} onChange={(event) => setCustomAllergy(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCustomAllergy(); } }} placeholder="Add another allergy" aria-label="Add another allergy" /><button type="button" onClick={addCustomAllergy}>Add</button></div>
          <button className="primary-button" type="submit" disabled={loading}>{loading ? <><span className="spinner" /> Searching nearby…</> : <>Find restaurants <span>→</span></>}</button>
          <p className="form-note">ClearPlate helps you research—it does not guarantee a meal is allergen-free.</p>
        </form>
      </section>

      <section className="results-section" aria-live="polite">
        {error && <div className="message-banner"><span>!</span>{error}</div>}
        {restaurants.length > 0 ? <>
          <div className="results-heading"><div><span className="section-kicker">Nearby tables</span><h2>Restaurants around {searchedLocation}</h2></div><div className="active-profile"><span>Watching for</span><strong>{allergySummary}</strong></div></div>
          <div className="restaurant-grid">{restaurants.map((restaurant) => <article className="restaurant-card" key={restaurant.id}>
            <WebsitePreview restaurant={restaurant} />
            <div className="restaurant-body"><div className="restaurant-title-row"><div><h3>{restaurant.name}</h3><p>{restaurant.cuisine.length ? restaurant.cuisine.join(" · ") : "Restaurant"}</p></div><span className="rating-unavailable" title="Public rating unavailable"><b>☆</b> —</span></div>
              <p className="address">⌖ {restaurant.address || "Address details unavailable"}</p>
              <div className="card-tags">{Object.entries(restaurant.dietary).filter(([, value]) => value === "yes").slice(0, 3).map(([key]) => <span key={key}>✓ {key.replaceAll("_", " ")}</span>)}{!Object.values(restaurant.dietary).includes("yes") && <span className="needs-review">? Menu needs review</span>}</div>
              <button className="details-button" onClick={() => setSelected(restaurant)}>Review this restaurant <span>→</span></button>
            </div>
          </article>)}</div>
        </> : !loading && !error ? <div className="empty-state" id="how-it-works"><div className="empty-orbit"><span>⌖</span><i /><i /><i /></div><div><span className="section-kicker">Built for better questions</span><h2>Your next meal starts here.</h2><p>Enter a location and your allergies. We’ll find nearby restaurants and surface the details that help you decide what to investigate.</p></div></div> : null}
      </section>

      <section className="safety-strip" id="safety"><div><span aria-hidden="true">◇</span><strong>Ingredients change</strong><p>Menus, recipes, and suppliers can change without notice.</p></div><div><span aria-hidden="true">◎</span><strong>Cross-contact matters</strong><p>Shared fryers, grills, utensils, and surfaces can introduce allergens.</p></div><div><span aria-hidden="true">☎</span><strong>Call before you go</strong><p>Confirm your needs directly with a manager or trained staff member.</p></div></section>

      <footer><div className="brand"><span className="brand-symbol">C</span><span>ClearPlate</span></div><p>Restaurant data © OpenStreetMap contributors. Website previews by Thum.io.</p><p>Research support only—not medical advice or a safety guarantee.</p></footer>

      {selected && <div className="modal-backdrop" role="presentation" onMouseDown={() => setSelected(null)}><section className="detail-panel" role="dialog" aria-modal="true" aria-labelledby="detail-title" onMouseDown={(event) => event.stopPropagation()}><button className="close-button" onClick={() => setSelected(null)} aria-label="Close restaurant details">×</button><WebsitePreview restaurant={selected} /><div className="detail-content">
        <span className="section-kicker">Restaurant summary</span><h2 id="detail-title">{selected.name}</h2><p className="detail-meta">{selected.cuisine.length ? selected.cuisine.join(" · ") : "Restaurant"} · {selected.distanceKm.toFixed(1)} km away</p><p className="detail-address">{selected.address || "Address details unavailable"}</p>
        <AllergyReview restaurant={selected} allergies={allergies} />
        <div className="detail-section"><div className="detail-section-heading"><h3>Meals & ingredients</h3><span>Restaurant confirmation required</span></div><div className="ingredient-empty"><span aria-hidden="true">≋</span><div><strong>No verified ingredient list is published in the map data.</strong><p>Use the restaurant website to find its current menu or allergen guide. Never rely on an AI-generated ingredient list.</p></div></div></div>
        <dl className="restaurant-facts">{selected.openingHours && <><dt>Hours</dt><dd>{selected.openingHours}</dd></>}{selected.phone && <><dt>Phone</dt><dd><a href={`tel:${selected.phone}`}>{selected.phone}</a></dd></>}<dt>Rating</dt><dd>Not available from this data source</dd></dl>
        <div className="detail-actions">{selected.website ? <a className="primary-link" href={selected.website} target="_blank" rel="noreferrer">Open restaurant website ↗</a> : <span className="disabled-link">Website unavailable</span>}<a className="map-link" href={`https://www.openstreetmap.org/?mlat=${selected.latitude}&mlon=${selected.longitude}#map=18/${selected.latitude}/${selected.longitude}`} target="_blank" rel="noreferrer">View on map</a></div>
        <p className="safety-callout"><strong>Before ordering:</strong> Tell staff about every allergy and ask whether they can prevent cross-contact. If you are unsure, do not eat the item.</p>
      </div></section></div>}
    </main>
  );
}