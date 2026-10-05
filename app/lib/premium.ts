import type { NextRequest } from "next/server";

import { eq } from "drizzle-orm";

import { getDb } from "../../db";
import { user } from "../../db/schema";

export const PREMIUM_COOKIE = "safeserve_premium_plan";
export type PremiumPlan = "monthly" | "annual" | "lifetime";

type SessionLike = {
  user?: {
    id?: string | null;
    email?: string | null;
    emailVerified?: boolean;
  } | null;
} | null;

function envList(name: string) {
  return (process.env[name] || "")
    .split(/[\s,;]+/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function adminEmails() {
  return [...envList("ADMIN_EMAILS"), ...envList("ADMIN_EMAIL")];
}

export function isConfiguredAdminEmail(email: string | null | undefined) {
  const normalized = email?.trim().toLowerCase();
  return Boolean(normalized && adminEmails().includes(normalized));
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
    isConfiguredAdminEmail(email) ||
      (userId && envList("ADMIN_USER_IDS").includes(userId)),
  );
}

export async function getAccountAccess(session: SessionLike) {
  const userId = session?.user?.id?.trim();
  let account: {
    role: "user" | "admin";
    premiumPlan: PremiumPlan | null;
    premiumActivatedAt: Date | null;
    premiumPaymentReference: string | null;
    premiumExpiresAt: Date | null;
    trialStartedAt?: Date | null;
    trialCancelledAt?: Date | null;
  } | null = null;

  if (userId) {
    try {
      const [row] = await getDb()
        .select({
          role: user.role,
          premiumPlan: user.premiumPlan,
          premiumActivatedAt: user.premiumActivatedAt,
          premiumPaymentReference: user.premiumPaymentReference,
          premiumExpiresAt: user.premiumExpiresAt,
          trialStartedAt: user.trialStartedAt,
          trialCancelledAt: user.trialCancelledAt,
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
  const admin = Boolean(account && (isConfiguredAdmin(session) || account.role === "admin"));
  const paid = Boolean(account?.premiumPaymentReference && account?.premiumActivatedAt &&
    (account.premiumPlan === "lifetime" || (account.premiumExpiresAt && account.premiumExpiresAt.getTime() > Date.now())));
  const plan = paid ? account?.premiumPlan || null : null;

  const trialEndsAt = account?.trialStartedAt ? new Date(account.trialStartedAt.getTime() + 7 * 86400000) : null;
  const trialActive = Boolean(!account?.trialCancelledAt && trialEndsAt && trialEndsAt.getTime() > Date.now());
  const trialReminder = Boolean(trialActive && trialEndsAt!.getTime() - Date.now() <= 2 * 86400000);
  return {
    trialEndsAt,
    trialActive,
    trialReminder,
    trialEligible: Boolean(userId && account && !account.trialStartedAt && !account.trialCancelledAt && !plan),
    authenticated: Boolean(userId),
    premium: Boolean(userId && account && (plan || trialActive)),
    plan,
    whitelisted,
    admin,
    premiumActivatedAt: account?.premiumActivatedAt || null,
  };
}

export function premiumPlanFromRequest(request: NextRequest): PremiumPlan | null {
  const value = request.cookies.get(PREMIUM_COOKIE)?.value;
  return value === "monthly" || value === "annual" || value === "lifetime" ? value : null;
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
