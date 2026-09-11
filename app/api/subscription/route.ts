import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

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
  if (process.env.NODE_ENV === "production" || process.env.PREMIUM_PREVIEW_ENABLED !== "true") {
    return NextResponse.json({ error: "Paid checkout is not connected yet. No payment was taken and your plan has not changed." }, { status: 503 });
  }
  const body = await request.json().catch(() => ({})) as { plan?: PremiumPlan };
  if (body.plan !== "monthly" && body.plan !== "annual") {
    return NextResponse.json({ error: "Choose a monthly or annual plan." }, { status: 400 });
  }

  const now = new Date();
  await getDb()
    .update(user)
    .set({
      premiumPlan: body.plan,
      premiumActivatedAt: now,
      premiumUpdatedAt: now,
      updatedAt: now,
    })
    .where(eq(user.id, session.user.id));

  // This records the entitlement in the account database. Connect a payment
  // provider before production billing; no card is charged by this endpoint.
  const response = NextResponse.json({ premium: true, plan: body.plan });
  response.cookies.set(PREMIUM_COOKIE, body.plan, premiumCookieOptions());
  return response;
}

export async function DELETE(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Sign in to manage Premium." }, { status: 401 });
  const now = new Date();
  await getDb()
    .update(user)
    .set({ premiumPlan: null, premiumUpdatedAt: now, updatedAt: now })
    .where(eq(user.id, session.user.id));
  const response = NextResponse.json({ premium: false, plan: null });
  response.cookies.set(PREMIUM_COOKIE, "", { ...premiumCookieOptions(), maxAge: 0 });
  return response;
}
