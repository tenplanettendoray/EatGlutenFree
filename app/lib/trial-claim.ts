import { NextRequest } from "next/server";
import { auditSecurity, clientNetwork, securityDb, securityHash } from "./security";
import { trialRisk, type TrialSignals } from "./trial-risk";

export async function claimTrial(request: NextRequest, userId: string, hints: { screen?: unknown; timezone?: unknown }) {
  const cookie = request.cookies.get("trial_device")?.value || "";
  const [id, signature] = cookie.split(".");
  if (!id || !/^[a-f0-9-]{36}$/.test(id) || signature !== await securityHash(`device:${id}`)) {
    return { status: 403, error: "Reload this page and enable cookies before starting your trial." };
  }
  const network = clientNetwork(request);
  const screen = typeof hints.screen === "string" && /^\d{2,5}x\d{2,5}$/.test(hints.screen) ? hints.screen : "";
  const timezone = typeof hints.timezone === "string" ? hints.timezone.slice(0, 80) : "";
  const signals: TrialSignals = {
    device: await securityHash(`device-id:${id}`),
    network: network === "local-or-unknown" ? "" : await securityHash(`trial-network:${network}`),
    browser: await securityHash(`browser:${(request.headers.get("user-agent") || "").slice(0, 500)}`),
    screen: screen ? await securityHash(`screen:${screen}`) : "",
    timezone: timezone ? await securityHash(`timezone:${timezone}`) : "",
  };
  const db = securityDb();
  const rows = await db.prepare(`SELECT device_hash AS device, network_hash AS network, browser_hash AS browser,
    screen_hash AS screen, timezone_hash AS timezone FROM trial_claim WHERE device_hash = ? OR (network_hash = ? AND network_hash <> '') LIMIT 500`)
    .bind(signals.device, signals.network).all<TrialSignals>();
  let risk = { score: 0, reasons: [] as string[], blocked: false };
  for (const prior of rows.results) { const next = trialRisk(signals, prior); if (next.score > risk.score) risk = next; }
  if (risk.blocked) {
    await auditSecurity(userId, "trial_blocked", risk.score, risk.reasons);
    return { status: 403, error: "A previous trial appears linked to this device. Contact support if this is incorrect." };
  }
  // Unique claims and the user update commit together in D1's transactional batch.
  // The composite claim prevents a simultaneous match from winning after the read.
  const fingerprint = signals.network && signals.screen && signals.timezone
    ? await securityHash(JSON.stringify([signals.network, signals.browser, signals.screen, signals.timezone])) : null;
  try {
    const now = Math.floor(Date.now() / 1000);
    await db.batch([
      db.prepare(`INSERT INTO trial_claim (user_id, device_hash, fingerprint_hash, network_hash, browser_hash, screen_hash, timezone_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(userId, signals.device, fingerprint, signals.network, signals.browser, signals.screen, signals.timezone, now),
      db.prepare("UPDATE user SET trial_started_at = ?, updated_at = ? WHERE id = ? AND trial_started_at IS NULL AND trial_cancelled_at IS NULL AND premium_plan IS NULL").bind(now, now, userId),
      db.prepare("INSERT INTO security_event (id, user_id, kind, score, reasons, created_at) VALUES (?, ?, 'trial_started', ?, ?, ?)").bind(crypto.randomUUID(), userId, risk.score, JSON.stringify(risk.reasons), Date.now()),
    ]);
  } catch (error) {
    if (!String(error).includes("UNIQUE constraint failed")) throw error;
    await auditSecurity(userId, "trial_blocked", 100, ["Concurrent or previously claimed trial"]);
    return { status: 409, error: "This trial has already been claimed. Contact support if this is incorrect." };
  }
  return null;
}
