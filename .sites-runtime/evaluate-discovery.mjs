import { loadTsModule } from '../tests/load-ts-module.mjs';
import { writeFileSync } from 'node:fs';
process.loadEnvFile('.env.local');
// Blind evaluations use NVIDIA alone; never supply reference restaurant names.
const grounding = loadTsModule('app/lib/restaurant-grounding.ts');
if (process.argv[4]) process.env.NVIDIA_DISCOVERY_MODEL = process.argv[4];
const calls = [];
const realFetch = globalThis.fetch;
const discovery = loadTsModule('app/lib/openrouter-discovery.ts', {}, { fetch: async (url, options) => {
  const response = await realFetch(url, options);
  if (url.includes('/chat/completions')) {
    const data = await response.clone().json();
    calls.push({ status: response.status, model: JSON.parse(options.body).model, usage: data.usage, choices: data.choices });
    writeFileSync(`.sites-runtime/${process.argv[2] || 'discovery-eval'}-raw.json`, JSON.stringify(calls, null, 2));
  }
  return response;
} });
const cases = [
  { location: 'Paris, France', food: 'Pizza', allergies: ['Gluten', 'Sesame'] },
  { location: 'Lisbon, Portugal', food: 'Burger', allergies: ['Gluten'] },
  { location: 'Rome, Italy', food: 'Pizza', allergies: ['Gluten'] },
  { location: 'New York, USA', food: 'Burger', allergies: ['Gluten'] },
];
const selected = process.argv[3] && process.argv[3] !== 'all' ? cases.filter((_, i) => i === Number(process.argv[3])) : cases;
const results = [];
for (const input of selected) {
  const start = Date.now();
  const sources = await grounding.findRestaurantSources(input);
  const savedKey = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  const result = await discovery.discoverRestaurantsWithOpenRouter(input, sources);
  process.env.OPENROUTER_API_KEY = savedKey;
  results.push({ input, elapsedMs: Date.now() - start, sources, result });
  console.log(JSON.stringify({input, result}));
}
writeFileSync(`.sites-runtime/${process.argv[2] || 'discovery-eval'}.json`, JSON.stringify({ results, calls }, null, 2));
