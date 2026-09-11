import { NextRequest, NextResponse } from "next/server";
import { allergySignalScope, incrementRestaurantSignals, normalizedSignalScope } from "@/app/lib/restaurant-signals";

type SignalAction = "search" | "click";

function cleanName(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 120) : "";
}

function cleanAction(value: unknown): SignalAction {
  return value === "click" ? "click" : "search";
}

export async function POST(request: NextRequest) {
  const input: unknown = await request.json().catch(() => null);
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return NextResponse.json({ error: "Send a valid restaurant signal." }, { status: 400 });
  }
  const body = input as Record<string, unknown>;
  const action = cleanAction(body.action);
  const locationScope = normalizedSignalScope(typeof body.location === "string" ? body.location : "");
  const allergyScope = allergySignalScope(Array.isArray(body.allergies) ? body.allergies.slice(0, 20).filter((item): item is string => typeof item === "string") : []);
  const foodScope = normalizedSignalScope(typeof body.food === "string" ? body.food : "");
  const restaurants = Array.isArray(body.restaurants)
    ? body.restaurants.slice(0, 10)
    : body.restaurant ? [body.restaurant] : [];

  if (!locationScope || !allergyScope || !restaurants.length) {
    return NextResponse.json({ ok: true });
  }

  const increments = restaurants
    .map((item, index) => {
      const name = cleanName(typeof item === "string" ? item : (item && typeof item === "object" ? (item as { name?: string }).name : ""));
      if (!name) return null;
      return {
        name,
        locationScope,
        allergyScope,
        foodScope,
        searchWeight: action === "search" ? Math.max(1, 3 - Math.min(index, 2)) : 0,
        clickWeight: action === "click" ? 4 : 0,
      };
    })
    .filter(Boolean) as Array<{
      name: string;
      locationScope: string;
      allergyScope: string;
      foodScope: string;
      searchWeight: number;
      clickWeight: number;
    }>;

  if (!increments.length) {
    return NextResponse.json({ ok: true });
  }

  await incrementRestaurantSignals(increments);
  return NextResponse.json({ ok: true });
}
