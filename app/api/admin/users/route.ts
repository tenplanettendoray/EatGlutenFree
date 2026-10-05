import { desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "../../../../db";
import { restaurantPreference, restaurantRating, session as sessions, user, userSearch } from "../../../../db/schema";
import { auth } from "../../../lib/auth";
import { getAccountAccess, isConfiguredAdminEmail } from "../../../lib/premium";
import { auditSecurity } from "../../../lib/security";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  const access = await getAccountAccess(session);
  if (!session?.user) return NextResponse.json({ error: "Sign in to open the admin panel." }, { status: 401 });
  if (!access.admin) return NextResponse.json({ error: "This account is not an admin." }, { status: 403 });

  const db = getDb();
  const userId = request.nextUrl.searchParams.get("userId");
  if (userId) {
    const [profile] = await db.select({ id: user.id, name: user.name, email: user.email, emailVerified: user.emailVerified, username: user.username, role: user.role, premiumPlan: user.premiumPlan, premiumActivatedAt: user.premiumActivatedAt, premiumExpiresAt: user.premiumExpiresAt, trialStartedAt: user.trialStartedAt, trialCancelledAt: user.trialCancelledAt, createdAt: user.createdAt, updatedAt: user.updatedAt }).from(user).where(eq(user.id, userId)).limit(1);
    if (!profile) return NextResponse.json({ error: "User not found." }, { status: 404 });
    const [logins, searches, preferences, ratings] = await Promise.all([
      db.select({ id: sessions.id, ipAddress: sessions.ipAddress, userAgent: sessions.userAgent, createdAt: sessions.createdAt, expiresAt: sessions.expiresAt }).from(sessions).where(eq(sessions.userId, userId)).orderBy(desc(sessions.createdAt)).limit(100),
      db.select().from(userSearch).where(eq(userSearch.userId, userId)).orderBy(desc(userSearch.createdAt)).limit(100),
      db.select().from(restaurantPreference).where(eq(restaurantPreference.userId, userId)).limit(100),
      db.select().from(restaurantRating).where(eq(restaurantRating.userId, userId)).limit(100),
    ]);
    return NextResponse.json({ profile, logins, searches, preferences, ratings }, { headers: { "Cache-Control": "private, no-store" } });
  }
  const [accounts, searches, preferences] = await Promise.all([
    db.select({
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      role: user.role,
      premiumPlan: user.premiumPlan,
      premiumActivatedAt: user.premiumActivatedAt,
      createdAt: user.createdAt,
    }).from(user).orderBy(desc(user.createdAt)).limit(500),
    db.select().from(userSearch).orderBy(desc(userSearch.createdAt)).limit(10000),
    db.select({ userId: restaurantPreference.userId, kind: restaurantPreference.kind }).from(restaurantPreference).limit(10000),
  ]);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  type UserActivity = {
    searchCount: number;
    premiumSearchCount: number;
    lastSearchAt: Date | null;
    lastSearch: null | { mode: string; location: string; food: string; allergies: string; resultCount: number };
    suggestionCount: number;
    avoidCount: number;
  };
  const activity = new Map<string, UserActivity>();

  const statsFor = (userId: string) => {
    const existing = activity.get(userId);
    if (existing) return existing;
    const next: UserActivity = { searchCount: 0, premiumSearchCount: 0, lastSearchAt: null, lastSearch: null, suggestionCount: 0, avoidCount: 0 };
    activity.set(userId, next);
    return next;
  };

  for (const search of searches) {
    const stats = statsFor(search.userId);
    stats.searchCount += 1;
    if (search.mode === "premium") stats.premiumSearchCount += 1;
    if (!stats.lastSearchAt) {
      stats.lastSearchAt = search.createdAt;
      stats.lastSearch = {
        mode: search.mode,
        location: search.location,
        food: search.food,
        allergies: search.allergies,
        resultCount: search.resultCount,
      };
    }
  }
  for (const preference of preferences) {
    const stats = statsFor(preference.userId);
    if (preference.kind === "suggest") stats.suggestionCount += 1;
    else stats.avoidCount += 1;
  }

  return NextResponse.json({
    viewerId: session.user.id,
    summary: {
      users: accounts.length,
      premiumUsers: accounts.filter((account) => Boolean(account.premiumPlan) || account.role === "admin" || isConfiguredAdminEmail(account.email)).length,
      searches: searches.length,
      searchesToday: searches.filter((search) => search.createdAt >= todayStart).length,
    },
    users: accounts.map((account) => ({
      ...account,
      role: isConfiguredAdminEmail(account.email) ? "admin" as const : account.role,
      ...(activity.get(account.id) || statsFor(account.id)),
    })),
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function DELETE(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!(await getAccountAccess(session)).admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const body = await request.json().catch(() => null) as { userId?: unknown } | null;
  if (typeof body?.userId !== "string" || !body.userId.trim()) return NextResponse.json({ error: "Choose a user." }, { status: 400 });
  const db = getDb();
  const [target] = await db.select({ id: user.id }).from(user).where(eq(user.id, body.userId)).limit(1);
  if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });
  const now = new Date();
  await db.update(user).set({ premiumPlan: null, trialCancelledAt: now, premiumUpdatedAt: now, updatedAt: now }).where(eq(user.id, target.id));
  await auditSecurity(session.user.id, "subscription_revoked", 0, [`Target account: ${target.id}`]);
  return NextResponse.json({ message: "Plan and trial access stopped. No external billing is connected." }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!(await getAccountAccess(session)).admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const body = await request.json().catch(() => null) as { userId?: unknown; premium?: unknown } | null;
  if (typeof body?.userId !== "string" || !body.userId.trim()) return NextResponse.json({ error: "Choose a user." }, { status: 400 });
  if (typeof body.premium !== "boolean") return NextResponse.json({ error: "Choose whether Premium is on or off." }, { status: 400 });
  const db = getDb();
  const [target] = await db.select({ id: user.id }).from(user).where(eq(user.id, body.userId)).limit(1);
  if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });
  const now = new Date();
  await db.update(user).set(body.premium ? {
    premiumPlan: "lifetime",
    premiumActivatedAt: now,
    premiumPaymentReference: `admin-grant-${crypto.randomUUID()}`,
    premiumExpiresAt: null,
    premiumUpdatedAt: now,
    updatedAt: now,
  } : {
    premiumPlan: null,
    premiumActivatedAt: null,
    premiumPaymentReference: null,
    premiumExpiresAt: null,
    premiumUpdatedAt: now,
    updatedAt: now,
  }).where(eq(user.id, target.id));
  await auditSecurity(session.user.id, body.premium ? "premium_admin_enabled" : "premium_admin_disabled", 0, [`Target account: ${target.id}`]);
  return NextResponse.json({ message: body.premium ? "Premium turned on for this user." : "Premium turned off for this user.", premiumPlan: body.premium ? "lifetime" : null }, { headers: { "Cache-Control": "private, no-store" } });
}
