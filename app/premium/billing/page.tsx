"use client";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { premiumReturn } from "../../lib/premium-return";
const subscribe = () => () => {};
export default function BillingPreview() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function confirmAccess() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/subscription", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan: selection.plan, trial: selection.trialEnabled, screen: `${window.screen.width}x${window.screen.height}`, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }) });
      const body = await response.json() as { error?: string; premium?: boolean; trialActive?: boolean };
      if (!response.ok || !body.premium) throw new Error(body.error || "Premium could not be activated.");
      finish();
    } catch (error) { setError(error instanceof Error ? error.message : "Please try again later."); }
    finally { setBusy(false); }
  }
  const query = useSyncExternalStore(subscribe, () => window.location.search, () => "");
  const params = new URLSearchParams(query);
  const requested = params.get("plan") || "annual";
  const selection = { plan: ["monthly", "annual", "lifetime"].includes(requested) ? requested : "annual", trialEnabled: params.get("trial") === "1", returnTo: premiumReturn(params.get("return"), "https://local.invalid") };
  function finish() {
    try { sessionStorage.setItem("custom-confetti-at", String(Date.now())); } catch { /* Navigation still works when storage is unavailable. */ }
    window.location.assign(selection.returnTo);
  }
  const label = selection.plan === "annual" ? "Yearly · $9.99/year" : selection.plan === "monthly" ? "Monthly · $0.99/month" : "Lifetime · $19.99 once";
  return <main className="billing-preview"><section className="billing-card"><Link href={`/premium?return=${encodeURIComponent(selection.returnTo)}`}>← Plans</Link><span className="billing-preview-label">{selection.trialEnabled ? "Trial checkout" : "Premium checkout"}</span><h1>Billing</h1><p className="billing-plan">{label}</p><div className="billing-placeholder"><span aria-hidden="true">🔒</span><h2>{selection.trialEnabled ? "Start your trial" : "Activate Premium"}</h2><p>{selection.trialEnabled ? "No card details are collected in this local preview. Your 7-day trial starts after confirmation." : "This local checkout activates Premium for the selected plan. No card details are collected in this preview."}</p></div><button className="premium-subscribe-button" disabled={busy} onClick={confirmAccess}>{busy ? "Confirming…" : selection.trialEnabled ? "Start free trial" : "Activate Premium"}</button>
    {selection.trialEnabled && <p><small>To prevent repeat trials, we compare a device cookie, network, browser, screen size and time zone. Similarities are stored as keyed hashes. Shared networks alone do not block trials.</small></p>}
    {error && <p role="alert">{error} <Link href="/contact">Contact support</Link></p>}
  </section></main>;
}
