export function premiumReturn(raw: string | null, origin: string) {
  try {
    const url = new URL(raw || "/", origin);
    if (url.origin !== origin || /^\/(account|premium|contact|sign-in|sign-up)(\/|$)/.test(url.pathname)) return "/";
    return url.pathname + url.search + url.hash;
  } catch { return "/"; }
}
