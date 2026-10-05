import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, gt } from "drizzle-orm";
import { getDb } from "../../../db";
import { supportMessage } from "../../../db/schema";
import { auth } from "../../lib/auth";
import { getAccountAccess } from "../../lib/premium";

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Please sign in to send your question." }, { status: 401 });
  const body = await request.json().catch(() => null) as { message?: unknown } | null;
  if (typeof body?.message !== "string" || body.message.trim().length < 5 || body.message.length > 3000) return NextResponse.json({ error: "Write a question between 5 and 3,000 characters." }, { status: 400 });
  const db = getDb();
  const recent = await db.select({ id: supportMessage.id }).from(supportMessage).where(and(eq(supportMessage.userId, session.user.id), gt(supportMessage.createdAt, new Date(Date.now() - 60000)))).limit(1);
  if (recent.length) return NextResponse.json({ error: "Please wait a minute before sending another question." }, { status: 429 });
  await db.insert(supportMessage).values({ id: crypto.randomUUID(), userId: session.user.id, email: session.user.email, message: body.message.trim(), createdAt: new Date() });
  return NextResponse.json({ sent: true }, { status: 201 });
}
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!(await getAccountAccess(session)).admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const messages = await getDb().select().from(supportMessage).orderBy(desc(supportMessage.createdAt)).limit(200);
  return NextResponse.json({ messages }, { headers: { "Cache-Control": "private, no-store" } });
}
