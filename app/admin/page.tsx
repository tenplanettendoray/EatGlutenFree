"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { BrandWordmark, SafeServeMark } from "../safe-serve-logo";

type AdminUser = {
  id: string;
  name: string;
  username?: string | null;
  email: string;
  role: "user" | "admin";
  premiumPlan: "monthly" | "annual" | null;
  premiumActivatedAt: string | null;
  createdAt: string;
  searchCount: number;
  premiumSearchCount: number;
  lastSearchAt: string | null;
  lastSearch: null | { mode: string; location: string; food: string; allergies: string; resultCount: number };
  suggestionCount: number;
  avoidCount: number;
};

type AdminData = {
  summary: { users: number; premiumUsers: number; searches: number; searchesToday: number };
  users: AdminUser[];
};

function readableDate(value: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function AdminPage() {
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/api/admin/users", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as AdminData & { error?: string };
        if (!response.ok) throw new Error(body.error || "Admin data could not be loaded.");
        setData(body);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Admin data could not be loaded."));
  }, []);

  const visibleUsers = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return data?.users || [];
    return (data?.users || []).filter((account) => [account.name, account.username, account.email, account.premiumPlan, account.role].some((value) => value?.toLowerCase().includes(term)));
  }, [data, query]);

  return (
    <main className="admin-page">
      <header className="admin-header">
        <Link className="brand" href="/?step=allergies" aria-label="Return to Gluten FreEat allergy selection"><span className="brand-symbol"><SafeServeMark /></span><BrandWordmark /></Link>
        <div><span>Private workspace</span><strong>Admin console</strong></div>
        <Link className="admin-back-link" href="/account">Account</Link>
      </header>

      <section className="admin-content">
        <div className="admin-title-row">
          <div><span className="section-kicker">Operations</span><h1>User overview</h1><p>Account entitlements, search activity, and community participation.</p></div>
          <label className="admin-search"><span>Filter users</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, email, plan..." /></label>
        </div>

        {error ? <div className="admin-denied"><strong>Access unavailable</strong><p>{error}</p><Link href="/">Return home</Link></div> : !data ? <div className="admin-loading">Loading user activity...</div> : <>
          <div className="admin-summary-grid">
            <article><span>Total users</span><strong>{data.summary.users}</strong></article>
            <article><span>Premium users</span><strong>{data.summary.premiumUsers}</strong></article>
            <article><span>Recorded searches</span><strong>{data.summary.searches}</strong></article>
            <article><span>Searches today</span><strong>{data.summary.searchesToday}</strong></article>
          </div>

          <div className="admin-table-wrap">
            <table className="admin-users-table">
              <thead><tr><th>User</th><th>Access</th><th>Search activity</th><th>Community</th><th>Last search</th></tr></thead>
              <tbody>{visibleUsers.map((account) => <tr key={account.id}>
                <td><strong>{account.username || account.name}</strong><span>{account.email}</span><small>Joined {readableDate(account.createdAt)}</small></td>
                <td><span className={`admin-plan-badge ${account.premiumPlan || account.role}`}>{account.role === "admin" ? "Admin" : account.premiumPlan ? `${account.premiumPlan} Premium` : "Free"}</span>{account.premiumActivatedAt && <small>Active since {readableDate(account.premiumActivatedAt)}</small>}</td>
                <td><strong>{account.searchCount}</strong><span>{account.premiumSearchCount} Premium</span></td>
                <td><strong>{account.suggestionCount} ♥</strong><span>{account.avoidCount} avoided</span></td>
                <td>{account.lastSearch ? <><strong>{account.lastSearch.location}</strong><span>{account.lastSearch.food || "Any food"} · {account.lastSearch.allergies || "No allergies"}</span><small>{readableDate(account.lastSearchAt)} · {account.lastSearch.resultCount} results</small></> : <span>No recorded searches</span>}</td>
              </tr>)}</tbody>
            </table>
            {!visibleUsers.length && <p className="admin-empty">No users match this filter.</p>}
          </div>
        </>}
      </section>
    </main>
  );
}
