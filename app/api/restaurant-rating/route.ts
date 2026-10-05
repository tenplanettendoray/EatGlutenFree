import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { restaurantRating } from "../../../db/schema";
import { auth } from "../../lib/auth";
import { restaurantRatingKey } from "../../lib/rating-key";

async function summary(key: string, userId?: string) {
  const rows = await getDb().select({ stars: restaurantRating.stars, userId: restaurantRating.userId }).from(restaurantRating).where(eq(restaurantRating.restaurantKey, key));
  return { authenticated: Boolean(userId), average: rows.length ? rows.reduce((sum, row) => sum + row.stars, 0) / rows.length : null, count: rows.length, own: rows.find(row => row.userId === userId)?.stars || null };
}
function identity(name: unknown, address: unknown) {
  return typeof name === "string" && name.trim().length > 0 && name.length <= 160 && typeof address === "string" && address.trim().length > 0 && address.length <= 400 ? restaurantRatingKey(name, address) : null;
}
export async function GET(request: NextRequest) {
  const key = identity(request.nextUrl.searchParams.get("name"), request.nextUrl.searchParams.get("address"));
  if (!key) return NextResponse.json({ error: "Restaurant name and address are required." }, { status: 400 });
  const session = await auth.api.getSession({ headers: request.headers });
  return NextResponse.json(await summary(key, session?.user.id), { headers: { "Cache-Control": "private, no-store" } });
}
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") && request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Sign in to rate a restaurant." }, { status: 401 });
  const input = await request.json().catch(() => null);
  const body = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const key = identity(body?.name, body?.address);
  if (!key) return NextResponse.json({ error: "Restaurant name and address are required." }, { status: 400 });
  if (body.stars === null) {
    await getDb().delete(restaurantRating).where(and(eq(restaurantRating.restaurantKey, key), eq(restaurantRating.userId, session.user.id)));
    return NextResponse.json(await summary(key, session.user.id));
  }
  if (typeof body.stars !== "number" || !Number.isInteger(body.stars * 2) || body.stars < 0.5 || body.stars > 5) return NextResponse.json({ error: "Choose 0.5 to 5 stars in half-star steps." }, { status: 400 });
  await getDb().insert(restaurantRating).values({ id: crypto.randomUUID(), userId: session.user.id, restaurantKey: key, stars: body.stars, updatedAt: new Date() }).onConflictDoUpdate({ target: [restaurantRating.userId, restaurantRating.restaurantKey], set: { stars: body.stars, updatedAt: new Date() } });
  return NextResponse.json(await summary(key, session.user.id));
}
