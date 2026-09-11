import { NextRequest, NextResponse } from "next/server";
import { compactCompletion } from "../../lib/compact-ai";
import { boundedText } from "../../lib/public-web";
import { parseSupportMessages, referenceReply, supportSources, supportSystemPrompt, urgentAllergyMessage, urgentReply } from "../../lib/support-knowledge";

const usage = new Map<string, { count: number; until: number }>();
let globalWindow = { count: 0, until: 0 };
function allowRequest(identity: string) {
  const now = Date.now();
  if (globalWindow.until < now) globalWindow = { count: 0, until: now + 60_000 };
  for (const [key, value] of usage) if (value.until < now) usage.delete(key);
  const window = usage.get(identity) || { count: 0, until: now + 60_000 };
  if (window.count >= 8 || globalWindow.count >= 60) return false;
  window.count++; globalWindow.count++; usage.set(identity, window); return true;
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "Open support from Safe Serve to send a message." }, { status: 403 });
  let body: unknown;
  try { body = JSON.parse(await boundedText(new Response(request.body), 24_000)); }
  catch { return NextResponse.json({ error: "Please send a shorter message." }, { status: 400 }); }
  const messages = parseSupportMessages(body);
  if (!messages) return NextResponse.json({ error: "Please send a question of up to 1,800 characters." }, { status: 400 });
  if (urgentAllergyMessage(messages.at(-1)!.content)) return NextResponse.json({ reply: urgentReply, urgent: true, sources: [supportSources[2]] }, { headers: { "Cache-Control": "no-store" } });
  // cf-connecting-ip is supplied by Cloudflare in production; local development shares one bucket.
  if (!allowRequest(request.headers.get("cf-connecting-ip") || "local")) return NextResponse.json({ error: "A few messages arrived at once. Please try again in a minute." }, { status: 429, headers: { "Retry-After": "60" } });
  const reference = referenceReply(messages.at(-1)!.content);
  if (reference) return NextResponse.json({ reply: reference, answerKind: "reference", urgent: false, sources: supportSources.filter(source => reference.includes(`[${source.id}]`)) }, { headers: { "Cache-Control": "no-store" } });
  const completion = await compactCompletion({ messages: [{ role: "system", content: supportSystemPrompt }, ...messages], mode: "support", maxTokens: 400, signal: request.signal });
  if (!completion) return NextResponse.json({ error: "AI support is temporarily unavailable. Please try again shortly.", sources: supportSources }, { status: 503 });
  // Render plain text only. The model cannot introduce arbitrary links into the support widget.
  const reply = completion.text.replace(/\n\s*\[[1-3]\]\s*Source\s*:[\s\S]*$/i, "").replace(/https?:\/\/\S+/g, "").slice(0, 1800);
  const sources = supportSources.filter(source => reply.includes(`[${source.id}]`));
  return NextResponse.json({ reply, urgent: false, sources }, { headers: { "Cache-Control": "no-store" } });
}
