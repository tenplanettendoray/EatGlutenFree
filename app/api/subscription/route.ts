import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { claimTrial } from "../../lib/trial-claim";

import { getDb } from "../../../db";
import { user } from "../../../db/schema";
import { auth } from "../../lib/auth";
import { getAccountAccess, PREMIUM_COOKIE, premiumCookieOptions, type PremiumPlan } from "../../lib/premium";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  const access = await getAccountAccess(session);
  return NextResponse.json(access);
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Sign in before choosing a Premium plan." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { plan?: PremiumPlan; trial?: unknown; screen?: unknown; timezone?: unknown };
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Send a valid plan selection." }, { status: 400 });
  if (!["monthly", "annual", "lifetime"].includes(body.plan || "")) return NextResponse.json({ error: "Choose a monthly, yearly, or lifetime plan." }, { status: 400 });
  const access = await getAccountAccess(session);
  if (access.premium) return NextResponse.json(access);
  if (body.trial !== true) {
    const now = new Date();
    const premiumExpiresAt = body.plan === "monthly"
      ? new Date(now.getTime() + 30 * 86400000)
      : body.plan === "annual"
        ? new Date(now.getTime() + 365 * 86400000)
        : null;
    await getDb()
      .update(user)
      .set({
        premiumPlan: body.plan,
        premiumActivatedAt: now,
        premiumPaymentReference: `local-preview-${crypto.randomUUID()}`,
        premiumExpiresAt,
        premiumUpdatedAt: now,
        updatedAt: now,
      })
      .where(eq(user.id, session.user.id));
    return NextResponse.json(await getAccountAccess(session));
  }
  if (!access.trialEligible) return NextResponse.json({ error: "Your free trial has already been used. Paid checkout is not available yet." }, { status: 409 });
  try {
    const failure = await claimTrial(request, session.user.id, body);
    if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });
  } catch {
    return NextResponse.json({ error: "Trial verification is temporarily unavailable. Please try again later." }, { status: 503 });
  }
  return NextResponse.json(await getAccountAccess(session));
}

export async function DELETE(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Sign in to manage Premium." }, { status: 401 });
  const now = new Date();
  await getDb()
    .update(user)
    .set({ premiumPlan: null, trialCancelledAt: now, premiumUpdatedAt: now, updatedAt: now })
    .where(eq(user.id, session.user.id));
  const response = NextResponse.json(await getAccountAccess(session));
  response.cookies.set(PREMIUM_COOKIE, "", { ...premiumCookieOptions(), maxAge: 0 });
  return response;
}
