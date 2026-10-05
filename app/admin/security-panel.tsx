"use client";
import { useEffect, useState } from "react";
type Event = { user_id: string | null; kind: string; score: number; reasons: string; created_at: number };
export function SecurityPanel() {
  const [events, setEvents] = useState<Event[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/admin/security", { cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error("Security history is unavailable.");
      setEvents(((await response.json()) as { events: Event[] }).events);
    }).catch(error => setError(error.message));
  }, []);
  return <section aria-label="Security activity"><h2>Security activity</h2><p>Trial risk threshold: 90. Device match: 100; network: 55; browser: 15; screen: 15; time zone: 10. Similarity is a risk signal, not proof of identity. Review disputed blocks through support.</p>{error ? <p role="alert">{error}</p> : <ul>{events.map((event, index) => <li key={index}><strong>{event.kind.replaceAll("_", " ")} · {event.score}/100</strong> — {event.user_id || "Anonymous"} · {new Date(event.created_at).toLocaleString()}<br />{JSON.parse(event.reasons).join("; ")}</li>)}</ul>}</section>;
}
