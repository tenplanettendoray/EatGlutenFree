"use client";

import Link from "next/link";
import { AccountControls } from "../auth-ui";
import { useEffect, useState } from "react";
import { BrandWordmark, SafeServeMark } from "../safe-serve-logo";
import { readJson } from "../lib/http-json";

type Plan = "monthly" | "annual";

const benefits = [
  "Unlimited searches",
  "Every ranked match",
  "Community ranking",
  "Deeper restaurant research",
  "Source-linked menu checks",
  "Live preference updates",
];

export default function PremiumPage() {
  const [plan, setPlan] = useState<Plan>("annual");
  const [status, setStatus] = useState<"idle" | "loading" | "active" | "error">("idle");
  const [message, setMessage] = useState("");
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [returnTo, setReturnTo] = useState("/search");

  useEffect(() => {
    fetch("/api/subscription", { cache: "no-store" })
      .then((response) => readJson<{ authenticated?: boolean; premium?: boolean }>(response))
      .then((data) => {
        const requestedReturn = new URLSearchParams(window.location.search).get("return") || "/search";
        const resolved = new URL(requestedReturn, window.location.origin);
        if (resolved.origin === window.location.origin) setReturnTo(resolved.pathname + resolved.search);
        setAuthenticated(Boolean(data.authenticated));
        if (data.premium) {
          setStatus("active");
          setMessage("Premium is active on this account.");
        }
      })
      .catch(() => setAuthenticated(false));
  }, []);

  async function choosePlan() {
    if (authenticated === false) {
      window.location.assign(`/sign-in?callbackURL=${encodeURIComponent(window.location.href)}`);
      return;
    }
    setStatus("loading");
    setMessage("");
    try {
      const response = await fetch("/api/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await readJson<{ error?: string }>(response);
      if (response.status === 401) {
        window.location.assign(`/sign-in?callbackURL=${encodeURIComponent(window.location.href)}`);
        return;
      }
      if (!response.ok) throw new Error(data.error || "Premium could not be activated.");
      setStatus("active");
      setMessage("Premium is active. Returning to your search...");
      window.setTimeout(() => window.location.assign(returnTo), 650);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Premium could not be activated.");
    }
  }

  return (
    <main className="premium-page">
      <header className="premium-nav">
        <Link className="brand" href="/?step=allergies" aria-label="Return to the Gluten FreEat allergy selection"><span className="brand-symbol"><SafeServeMark /></span><BrandWordmark /></Link>
        <div className="premium-nav-actions"><Link href={returnTo}>Back to search</Link><AccountControls /></div>
      </header>

      <section className="premium-stage">
        <div className="premium-story">
          <span className="premium-kicker">Gluten FreEat Premium</span>
          <h1>More strong matches.<br /><em>Fewer dead ends.</em></h1>
          <div className="premium-limit-visual" aria-label="Upgrade from three daily searches to unlimited searches">
            <div><small>Daily limit</small><strong>3</strong></div>
            <span aria-hidden="true">becomes</span>
            <div><small>Premium</small><strong>∞</strong></div>
          </div>
          <div className="premium-benefit-grid">
            {benefits.map(title => <article key={title}><span aria-hidden="true">✓</span><div><strong>{title}</strong></div></article>)}
          </div>
        </div>

        <aside className="premium-checkout">
          <div className="premium-checkout-heading"><span>Choose your plan</span><strong>Cancel anytime</strong></div>
          <div className="premium-plan-options" role="radiogroup" aria-label="Premium billing period">
            <button type="button" role="radio" aria-checked={plan === "monthly"} className={plan === "monthly" ? "selected" : ""} onClick={() => setPlan("monthly")}><span>Monthly</span><strong>$2.99</strong><small>per month</small></button>
            <button type="button" role="radio" aria-checked={plan === "annual"} className={plan === "annual" ? "selected" : ""} onClick={() => setPlan("annual")}><span>Annual</span><strong>$29.99</strong><small>$2.50 per month</small><b>Best value</b></button>
          </div>
          <div className="premium-price-summary"><span>{plan === "annual" ? "Billed annually" : "Billed monthly"}</span><strong>{plan === "annual" ? "$29.99/year" : "$2.99/month"}</strong></div>
          <button type="button" className="premium-subscribe-button" onClick={choosePlan} disabled={status === "loading" || status === "active"}>{status === "loading" ? "Activating Premium..." : status === "active" ? "Premium active" : authenticated === false ? "Sign in to continue" : `Choose ${plan}`}</button>
          {message && <p className={`premium-checkout-message ${status}`}>{message}</p>}
          <p className="premium-preview-note">Paid checkout coming soon. No payment is collected.</p>
          <p className="premium-safety-note">Gluten FreEat provides research, not medical certification. Always confirm ingredients and cross-contact with restaurant staff.</p>
        </aside>
      </section>
    </main>
  );
}
