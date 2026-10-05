import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../lib/auth";
import { getAccountAccess } from "../../../lib/premium";
import { securityDb } from "../../../lib/security";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!(await getAccountAccess(session)).admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const events = await securityDb().prepare("SELECT user_id, kind, score, reasons, created_at FROM security_event ORDER BY created_at DESC LIMIT 100").all();
  return NextResponse.json({ events: events.results }, { headers: { "Cache-Control": "private, no-store" } });
}
