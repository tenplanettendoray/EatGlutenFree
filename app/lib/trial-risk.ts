export type TrialSignals = { device: string; network: string; browser: string; screen: string; timezone: string };
export function trialRisk(current: TrialSignals, previous: TrialSignals) {
  const reasons: string[] = [];
  let score = 0;
  for (const [signal, points] of Object.entries({ device: 100, network: 55, browser: 15, screen: 15, timezone: 10 })) {
    const key = signal as keyof TrialSignals;
    if (current[key] && current[key] === previous[key]) { score += points; reasons.push(`${signal}: +${points}`); }
  }
  return { score: Math.min(100, score), reasons, blocked: score >= 90 };
}
