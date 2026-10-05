"use client";
import { useEffect, useState } from "react";
import { restaurantRatingKey } from "./lib/rating-key";

type Summary = { authenticated?: boolean; average: number | null; count: number; own: number | null };
type Place = { name: string; address: string; rating?: number | null; reviewCount?: number | null; qualitySourceUrl?: string };
export function RestaurantStars({ restaurant, editable = false, compact = false }: { restaurant: Place; editable?: boolean; compact?: boolean }) {
  const [data, setData] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [hovered, setHovered] = useState(0);
  const [pulse, setPulse] = useState(0);
  const key = restaurantRatingKey(restaurant.name, restaurant.address);
  useEffect(() => {
    if (!restaurant.address) return;
    let active = true;
    const refresh = () => fetch(`/api/restaurant-rating?${new URLSearchParams({ name: restaurant.name, address: restaurant.address })}`)
      .then(async response => { if (!response.ok) throw new Error(); return response.json() as Promise<Summary>; })
      .then(value => { if (active) setData(value); }).catch(() => {});
    const onChange = (event: Event) => { if ((event as CustomEvent).detail?.key === key) void refresh(); };
    void refresh(); window.addEventListener("restaurant-rating-changed", onChange);
    return () => { active = false; window.removeEventListener("restaurant-rating-changed", onChange); };
  }, [key, restaurant.name, restaurant.address]);
  async function rate(stars: number) {
    if (busy) return;
    setBusy(true); setMessage(""); setPulse(value => value + 1);
    try {
      const response = await fetch("/api/restaurant-rating", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: restaurant.name, address: restaurant.address, stars: data?.own === stars ? null : stars }) });
      const result = await response.json() as Summary & { error?: string };
      if (!response.ok) throw new Error(result.error || "Rating could not be saved.");
      setData(result); setHovered(0);
      window.dispatchEvent(new CustomEvent("restaurant-rating-changed", { detail: { key, average: result.average, count: result.count } }));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Rating could not be saved."); }
    finally { setBusy(false); }
  }
  const sourceRating = typeof restaurant.rating === "number" && restaurant.rating > 0 && restaurant.rating <= 5 && Boolean(restaurant.reviewCount && restaurant.qualitySourceUrl);
  const hasRealRating = Boolean(data?.count) || sourceRating;
  const average = (data?.count ? data.average : sourceRating ? restaurant.rating : 3) ?? 3;
  const count = data?.count || (sourceRating ? restaurant.reviewCount : 0);
  return <div className={compact ? "restaurant-stars restaurant-stars-compact" : "restaurant-stars"}>
    <div className="star-summary" aria-label={hasRealRating ? `${average.toFixed(1)} out of 5, ${count} ${data?.count ? "community" : "source"} ratings` : "Unrated, shown at the default 3 out of 5"}>
      {editable ? <div className="half-star-input" role="group" aria-label={`Your rating for ${restaurant.name}`} title={data?.own ? `Your rating: ${data.own}/5. Select it again to remove.` : hasRealRating ? `${average.toFixed(1)}/5 from ${count} ratings` : "Unrated — defaults to 3/5. Select a half or whole star."} onMouseLeave={() => setHovered(0)}>{[1,2,3,4,5].map(star => <span className="half-star-cell" key={star}>
        <span className={pulse ? "half-star-glyph rating-pop" : "half-star-glyph"} key={pulse} aria-hidden="true">★<span style={{ width: `${Math.max(0, Math.min(1, (hovered || data?.own || average || 0) - star + 1)) * 100}%` }}>★</span></span>
        {[star - 0.5, star].map((value, half) => <button type="button" className={half ? "star-hit star-hit-right" : "star-hit star-hit-left"} key={value} disabled={busy || !restaurant.address} aria-label={`${data?.own === value ? "Remove" : "Rate"} ${restaurant.name} ${value} stars`} aria-pressed={data?.own === value} onMouseEnter={() => setHovered(value)} onMouseLeave={() => setHovered(0)} onFocus={() => setHovered(value)} onBlur={() => setHovered(0)} onClick={() => void rate(value)} />)}
      </span>)}<span className="star-average">{average.toFixed(1)}</span></div> : <><span className="star-meter" aria-hidden="true"><span>★★★★★</span><span className="star-meter-fill" style={{ width: `${average * 20}%` }}>★★★★★</span></span><span className="star-average">{average.toFixed(1)}</span></>}
    </div>
    {message && <small className="rating-feedback" role="status">{message}</small>}
    {!compact && sourceRating && <a href={restaurant.qualitySourceUrl} target="_blank" rel="noreferrer" aria-label="View online rating source">↗</a>}
  </div>;
}
