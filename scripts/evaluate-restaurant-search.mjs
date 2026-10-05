import { mkdir, writeFile } from "node:fs/promises";
import { loadTsModule } from "../tests/load-ts-module.mjs";

// Explicit opt-in: this script uses the configured live provider and public web.
// Reports contain public restaurant results only, never environment variables.
try { process.loadEnvFile(".env.local"); } catch { /* deployed environment */ }
const { discoverRestaurants } = loadTsModule("app/lib/guided-discovery.ts");
const location = (process.argv[2] || "New York City").split(",")[0].trim();
const input = { location, food: process.argv[3] || "burger", allergies: ["Gluten"] };
const started = Date.now();
const result = await discoverRestaurants(input);
const restaurants = result.restaurants;
const evidence = restaurants.filter(item => item.allergenEvidence?.length);
const report = {
  checkedAt: new Date().toISOString(), input, elapsedMs: Date.now() - started,
  checks: {
    providerReturnedResults: result.status === "used" && restaurants.length > 0,
    uniqueResults: new Set(restaurants.map(item => item.name.toLowerCase())).size === restaurants.length,
    sourcedEvidence: restaurants.every(item => item.qualitySourceUrl || item.website),
    allergyEvidenceFound: evidence.length > 0,
    noUncheckedWebsiteButtons: restaurants.every(item => !item.website || item.websiteStatus === "verified"),
    noUnsupportedAllergenClaims: restaurants.every(item => item.supportedAllergies.every(allergy => item.allergenEvidence?.some(proof => proof.allergy === allergy))),
    onlineStarsHaveSources: restaurants.every(item => !item.rating || item.reviewCount > 0 && item.qualitySourceUrl),
  },
  ...result,
};
await mkdir("outputs/search-evaluation", { recursive: true });
const path = `outputs/search-evaluation/${location.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}.json`;
await writeFile(path, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ path, elapsedMs: report.elapsedMs, checks: report.checks, provider: result.provider, model: result.model, restaurants: restaurants.map(item => ({ name: item.name, confidence: item.confidence, evidenceRank: item.evidenceRank, distanceKm: item.distanceKm, website: item.website, websiteStatus: item.websiteStatus, supported: item.supportedAllergies, location: item.locations[0]?.address })) }, null, 2));
if (Object.values(report.checks).some(value => !value)) process.exitCode = 1;
