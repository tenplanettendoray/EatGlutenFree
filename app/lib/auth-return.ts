export function safeAuthReturn(raw: string, origin: string) {
  try {
    const url = new URL(raw, origin);
    return url.origin === origin && !/^\/(sign-in|sign-up|onboarding)(\/|$)/.test(url.pathname) ? url.pathname + url.search + url.hash : "/search";
  } catch { return "/search"; }
}
