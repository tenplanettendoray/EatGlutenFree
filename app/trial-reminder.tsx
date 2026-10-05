"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
export function TrialReminder() {
  const [end, setEnd] = useState<string | null>(null);
  const [dismissedPath, setDismissedPath] = useState<string | null>(null);
  const pathname = usePathname();
  useEffect(() => {
    let active = true;
    const refresh = () => { if (document.visibilityState === "hidden") return; void fetch("/api/subscription", { cache: "no-store" }).then(response => response.json() as Promise<{ trialReminder: boolean; trialEndsAt: string }>).then(access => { if (active) setEnd(access.trialReminder ? access.trialEndsAt : null); }).catch(() => {}); };
    refresh(); const timer = window.setInterval(refresh, 60000);
    document.addEventListener("visibilitychange", refresh);
    return () => { active = false; clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  const dismissed = dismissedPath === pathname;
  return end && !dismissed ? <aside className="trial-reminder" role="status"><span>Your free trial ends {new Date(end).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}. No payment will be taken. <Link href="/premium">View Premium</Link></span><button type="button" onClick={() => setDismissedPath(pathname)} aria-label="Dismiss free trial notice">×</button></aside> : null;
}
