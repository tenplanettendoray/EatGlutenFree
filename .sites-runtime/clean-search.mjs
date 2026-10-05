import {readFileSync,writeFileSync} from 'node:fs';
const path='app/api/restaurants/route.ts';let s=readFileSync(path,'utf8');
function cut(from,to,replacement=''){const start=s.indexOf(from),end=s.indexOf(to,start);if(start<0||end<0)throw Error('Missing source marker');s=s.slice(0,start)+replacement+s.slice(end);}
cut('function restoredStrongCandidates(', 'function isIneligibleGenericChain(');
cut('function fillWithFallbackCandidates(', 'function resultPayload(');
cut('async function readBestPreviousSearchCache(', 'export async function GET(',`async function runCachedPublicDiscovery(input: SearchInput, mode: "free" | "premium") {
  const cacheKey = await cacheKeyFor(input, mode);
  const cached = await readRestaurantSearchCache<PublicDiscoveryPayload>(cacheKey).catch(() => null);
  const sanitizedCached = cached ? sanitizeCachedPayload(input, mode, cached) : null;
  if (sanitizedCached?.restaurants.length) return { data: sanitizedCached, cacheStatus: "hit" as const };
  const data = sanitizeCachedPayload(input, mode, await runAiDiscovery(input, mode));
  // Never revive legacy AI/map answers or select an answer just because it is longer.
  if (data.restaurants.length && !data.searchWarning) await writeRestaurantSearchCache(cacheKey, mode, data).catch(error => console.error("Restaurant cache write failed", error));
  return { data, cacheStatus: "miss" as const };
}

`);
writeFileSync(path,s);
