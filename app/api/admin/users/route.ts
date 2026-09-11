import { desc } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "../../../../db";
import { restaurantPreference, user, userSearch } from "../../../../db/schema";
import { auth } from "../../../lib/auth";
import { getAccountAccess } from "../../../lib/premium";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  const access = await getAccountAccess(session);
  if (!session?.user) return NextResponse.json({ error: "Sign in to open the admin panel." }, { status: 401 });
  if (!access.admin) return NextResponse.json({ error: "This account is not an admin." }, { status: 403 });

  const db = getDb();
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
    summary: {
      users: accounts.length,
      premiumUsers: accounts.filter((account) => Boolean(account.premiumPlan) || account.role === "admin").length,
      searches: searches.length,
      searchesToday: searches.filter((search) => search.createdAt >= todayStart).length,
    },
    users: accounts.map((account) => ({ ...account, ...(activity.get(account.id) || statsFor(account.id)) })),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
