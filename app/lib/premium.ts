import type { NextRequest } from "next/server";

import { eq } from "drizzle-orm";

import { getDb } from "../../db";
import { user } from "../../db/schema";

export const PREMIUM_COOKIE = "safeserve_premium_plan";
export type PremiumPlan = "monthly" | "annual";

type SessionLike = {
  user?: {
    id?: string | null;
    email?: string | null;
  } | null;
} | null;

function envList(name: string) {
  return (process.env[name] || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function isWhitelistedUser(session: SessionLike) {
  const email = session?.user?.email?.trim().toLowerCase();
  const userId = session?.user?.id?.trim().toLowerCase();
  return Boolean(
    (email && envList("SEARCH_WHITELIST_EMAILS").includes(email)) ||
      (userId && envList("SEARCH_WHITELIST_USER_IDS").includes(userId)),
  );
}

export function isConfiguredAdmin(session: SessionLike) {
  const email = session?.user?.email?.trim().toLowerCase();
  const userId = session?.user?.id?.trim().toLowerCase();
  return Boolean(
    (email && envList("ADMIN_EMAILS").includes(email)) ||
      (userId && envList("ADMIN_USER_IDS").includes(userId)),
  );
}

export async function getAccountAccess(session: SessionLike) {
  const userId = session?.user?.id?.trim();
  let account: {
    role: "user" | "admin";
    premiumPlan: PremiumPlan | null;
    premiumActivatedAt: Date | null;
  } | null = null;

  if (userId) {
    try {
      const [row] = await getDb()
        .select({
          role: user.role,
          premiumPlan: user.premiumPlan,
          premiumActivatedAt: user.premiumActivatedAt,
        })
        .from(user)
        .where(eq(user.id, userId))
        .limit(1);
      account = row || null;
    } catch (error) {
      console.error("Unable to read account access", error);
    }
  }

  const whitelisted = isWhitelistedUser(session);
  const admin = isConfiguredAdmin(session) || account?.role === "admin";
  const plan = account?.premiumPlan || null;

  return {
    authenticated: Boolean(userId),
    premium: Boolean(userId && (plan || whitelisted || admin)),
    plan,
    whitelisted,
    admin,
    premiumActivatedAt: account?.premiumActivatedAt || null,
  };
}

export function premiumPlanFromRequest(request: NextRequest): PremiumPlan | null {
  const value = request.cookies.get(PREMIUM_COOKIE)?.value;
  return value === "monthly" || value === "annual" ? value : null;
}

export function premiumCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 366,
  };
}
