"use client";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { BrandWordmark, SafeServeMark } from "../safe-serve-logo";
import { premiumReturn } from "../lib/premium-return";

const subscribe = () => () => {};
type Plan = "monthly" | "annual" | "lifetime";
export default function PremiumPage() {
  const [plan, setPlan] = useState<Plan>("annual");
  const [trialEnabled, setTrialEnabled] = useState(false);
  const returnTo = useSyncExternalStore(subscribe, () => {
    let saved = ""; try { saved = sessionStorage.getItem("premium-origin") || ""; } catch { /* Private browsing may restrict storage. */ }
    return premiumReturn(new URLSearchParams(window.location.search).get("return") || saved || document.referrer, window.location.origin);
  }, () => "/");
  return <main className="premium-page premium-compact">
    <header className="premium-nav"><Link className="brand" href="/" aria-label="Start menu"><span className="brand-symbol"><SafeServeMark /></span><BrandWordmark /></Link><div className="premium-nav-actions"><Link href={returnTo}>Back</Link><Link href="/contact">Contact us</Link></div></header>
    <section className="premium-compact-frame">
      <div className="premium-intro-grid">
        <ol className="trial-journey" id="trial-timeline" aria-label="Your seven-day trial">
          <li><span className="journey-icon" aria-hidden="true">🔓</span><div><small>DAY 1</small><h2>Instant access</h2><p>Explore every Premium feature.</p></div></li>
          <li><span className="journey-icon" aria-hidden="true">🔔</span><div><small>DAY 5</small><h2>A friendly reminder</h2><p>We’ll remind you in the app, two days before it ends.</p></div></li>
          <li><span className="journey-icon" aria-hidden="true">★</span><div><small>DAY 7</small><h2>Your trial ends</h2><p>No automatic charge.</p></div></li>
        </ol>
        <div className="premium-compact-copy"><span className="premium-kicker">Gluten FreEat Premium</span><h1>Find your next<br /><em>great table.</em></h1><p>More places to explore. More details to help you choose.</p><ul><li>Unlimited searches and every ranked match</li><li>Deeper research and source-linked menu checks</li><li>Community recommendations and ratings</li></ul><small>Confirm ingredients and cross-contact with restaurant staff.</small></div>
      </div>
      <div className="premium-plan-options" role="radiogroup" aria-label="Premium billing period">
        <button type="button" role="radio" aria-checked={plan === "monthly"} className={plan === "monthly" ? "selected" : ""} onClick={() => setPlan("monthly")}><strong>$0.99</strong><small>per month</small><ul className="plan-benefits"><li>Unlimited searches</li><li>Ranked allergy-aware matches</li><li>Community hearts and stars</li></ul><span className="plan-name">Monthly</span></button>
        <button type="button" role="radio" aria-checked={plan === "annual"} className={`featured-year ${plan === "annual" ? "selected" : ""}`} onClick={() => setPlan("annual")}><b>Save 16%</b><strong>$9.99</strong><small>per year · <s>$11.88</s></small><ul className="plan-benefits"><li>Everything in Monthly</li><li>Deeper menu and source checks</li><li>Best value for regular searches</li></ul><span className="plan-name">Yearly</span></button>
        <button type="button" role="radio" aria-checked={plan === "lifetime"} className={`lifetime-plan ${plan === "lifetime" ? "selected" : ""}`} onClick={() => setPlan("lifetime")}><strong>$19.99</strong><small>One payment. Lifetime access.</small><ul className="plan-benefits"><li>Everything in Yearly</li><li>All future Premium access</li><li>No recurring payments</li></ul><span className="plan-name">Lifetime</span></button>
      </div>
      <label className={`trial-toggle ${trialEnabled ? "enabled" : ""}`}>
        <span><strong>Enable 7-day free trial</strong><small>{trialEnabled ? "Trial will start after checkout." : "Off by default. Continue without a trial."}</small></span>
        <input type="checkbox" checked={trialEnabled} onChange={(event) => setTrialEnabled(event.target.checked)} />
      </label>
      <footer className="premium-continue"><span role="status">Selected: {plan === "annual" ? "Yearly" : plan === "monthly" ? "Monthly" : "Lifetime"}{trialEnabled ? " with trial" : ""}</span><Link className="premium-subscribe-button" href={`/premium/billing?plan=${plan}&trial=${trialEnabled ? "1" : "0"}&return=${encodeURIComponent(returnTo)}`}>Continue →</Link><small>{trialEnabled ? "Trial starts only after you confirm." : "Premium activates after the checkout confirmation."}</small></footer>
    </section>
  </main>;
}
