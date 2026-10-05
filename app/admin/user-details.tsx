"use client";
import { useEffect, useState } from "react";

type Details = {
  profile: { id: string; name: string; email: string; emailVerified: boolean; username: string | null; role: string; premiumPlan: string | null; premiumActivatedAt?: string | null; premiumExpiresAt?: string | null; trialStartedAt: string | null; trialCancelledAt: string | null; createdAt: string; updatedAt: string };
  logins: { id: string; ipAddress: string | null; userAgent: string | null; createdAt: string; expiresAt: string }[];
  searches: { id: string; location: string; food: string; allergies: string; resultCount: number; createdAt: string }[];
  preferences: { id: string; name: string; kind: string; locationScope: string }[];
  ratings: { restaurantKey: string; stars: number }[];
};
export function AdminUserDetails({ userId, onClose, onCancelled }: { userId: string; onClose: () => void; onCancelled: () => void }) {
  const [data, setData] = useState<Details | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/users?userId=${encodeURIComponent(userId)}`, { cache: "no-store", signal: controller.signal }).then(async r => {
      const body = await r.json() as Details & { error?: string }; if (!r.ok) throw new Error(body.error); setData(body);
    }).catch(e => { if (!controller.signal.aborted) setMessage(e.message); });
    return () => controller.abort();
  }, [userId]);
  async function cancel() {
    if (!window.confirm(`Stop the plan and free trial for ${data?.profile.email}? Access ends immediately. Admin/allowlisted access is separate.`)) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/users", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId }) });
      const body = await r.json() as { error?: string; message: string }; if (!r.ok) throw new Error(body.error);
      setMessage(body.message); setData(d => d ? { ...d, profile: { ...d.profile, premiumPlan: null, trialCancelledAt: new Date().toISOString() } } : d); onCancelled();
    } catch (e) { setMessage(e instanceof Error ? e.message : "Cancellation failed."); } finally { setBusy(false); }
  }
  async function togglePremium(enabled: boolean) {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, premium: enabled }) });
      const body = await r.json() as { error?: string; message: string; premiumPlan: string | null }; if (!r.ok) throw new Error(body.error);
      setMessage(body.message);
      setData(d => d ? { ...d, profile: { ...d.profile, premiumPlan: body.premiumPlan, premiumActivatedAt: enabled ? new Date().toISOString() : null, premiumExpiresAt: null } } : d);
      onCancelled();
    } catch (e) { setMessage(e instanceof Error ? e.message : "Premium update failed."); } finally { setBusy(false); }
  }
  return <section className="admin-user-detail" aria-label="User details"><button onClick={onClose} type="button">Close details ×</button>
    {message && <p role="status">{message}</p>}
    {!data ? <p>Loading account…</p> : <>
      <h2>{data.profile.name}</h2><p>{data.profile.email} · {data.profile.emailVerified ? "Email verified" : "Email unverified"}</p>
      <dl><dt>User ID</dt><dd>{data.profile.id}</dd><dt>Username / role</dt><dd>{data.profile.username || "—"} / {data.profile.role}</dd><dt>Plan</dt><dd>{data.profile.premiumPlan || "No paid plan"}</dd><dt>Premium active since</dt><dd>{data.profile.premiumActivatedAt || "Not active"}</dd><dt>Premium expires</dt><dd>{data.profile.premiumExpiresAt || (data.profile.premiumPlan === "lifetime" ? "Never" : "Not active")}</dd><dt>Trial started</dt><dd>{data.profile.trialStartedAt || "Not started"}</dd><dt>Trial stopped</dt><dd>{data.profile.trialCancelledAt || "Not stopped"}</dd><dt>Joined</dt><dd>{data.profile.createdAt}</dd></dl>
      <label className={`admin-premium-switch ${data.profile.premiumPlan ? "enabled" : ""}`}>
        <span><strong>Premium access</strong><small>{data.profile.premiumPlan ? "On for this user" : "Off for this user"}</small></span>
        <input type="checkbox" checked={Boolean(data.profile.premiumPlan)} disabled={busy} onChange={event => void togglePremium(event.target.checked)} />
      </label>
      <button type="button" disabled={busy || Boolean(data.profile.trialCancelledAt && !data.profile.premiumPlan)} onClick={cancel}>{busy ? "Stopping…" : "Stop plan and trial"}</button>
      <p>The switch grants local lifetime Premium access. Admin or allowlisted access is still separate. No external billing is connected.</p>
      <h3>Stored sessions and IP addresses</h3><p>Physical location is not collected. These are stored session IPs, not verified locations. Up to 100 records per section.</p>
      {data.logins.length ? data.logins.map(login => <article key={login.id}><strong>{login.ipAddress || "IP unavailable"}</strong><p>{login.userAgent || "Device unavailable"}</p><small>Created {login.createdAt} · Expires {login.expiresAt}</small></article>) : <p>No stored sessions.</p>}
      <h3>Search history — searched destinations</h3>{data.searches.length ? data.searches.map(search => <article key={search.id}><strong>{search.location} · {search.food || "Any food"}</strong><p>{search.allergies || "No filters"} · {search.resultCount} results · {search.createdAt}</p></article>) : <p>No recorded searches.</p>}
      <h3>Recommendations and avoids</h3>{data.preferences.map((item, i) => <p key={item.id || i}>{item.name} · {item.kind} · {item.locationScope}</p>)}
      <h3>Restaurant ratings</h3>{data.ratings.map(item => <p key={item.restaurantKey}>{item.restaurantKey} · {item.stars} ★</p>)}
    </>}
  </section>;
}
