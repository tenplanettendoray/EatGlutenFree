// Live, uncached evaluation. Uses existing NVIDIA/OpenRouter credentials and
// incurs a bounded web lookup per case. Reference URLs are never model input.
import { loadTsModule } from '../tests/load-ts-module.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

if (!process.env.NVIDIA_API_KEY || !process.env.OPENROUTER_API_KEY) throw Error('Set NVIDIA_API_KEY and OPENROUTER_API_KEY (for example with --env-file=.env.local).');
const { findRestaurantSources } = loadTsModule('app/lib/restaurant-grounding.ts');
const { discoverRestaurantsWithOpenRouter } = loadTsModule('app/lib/openrouter-discovery.ts');
const runtimeOrder = process.argv.includes('--runtime');
const filter = process.argv.slice(2).filter(value=>!value.startsWith('--')).join(' ').trim().toLowerCase();
const references = JSON.parse(readFileSync('tests/fixtures/restaurant-benchmark.json','utf8')).filter(item => !filter || item.query.location.toLowerCase().includes(filter));
const results=[];
for (const { query, referenceUrls, expectEmpty = false } of references) {
  if (results.length) await new Promise(resolve => setTimeout(resolve, 3500));
  const start=Date.now();
  const sources=await findRestaurantSources(query);
  const savedKey=process.env.OPENROUTER_API_KEY;
  let result;
  try {
    if (!runtimeOrder) delete process.env.OPENROUTER_API_KEY; // Optional isolated NVIDIA test; references remain hidden.
    result=await discoverRestaurantsWithOpenRouter(query,sources);
  } finally { process.env.OPENROUTER_API_KEY=savedKey; }
  const names=result.restaurants.map(r=>r.name);
  const hosts=result.restaurants.map(r=>new URL(r.website).hostname.replace(/^www\./,''));
  const referenceHits=referenceUrls.filter(url=>hosts.includes(new URL(url).hostname.replace(/^www\./,''))).length;
  const passed = expectEmpty ? names.length === 0 : names.length > 0 && referenceHits > 0;
  const observation={query,mode:runtimeOrder?'runtime-order':'nvidia-isolated',provider:result.provider||null,names,count:names.length,referenceHits,referenceCount:referenceUrls.length,expectEmpty,passed,elapsedMs:Date.now()-start,restaurants:result.restaurants};
  results.push(observation);
  console.log(JSON.stringify({city:query.location,sources:sources.map(source=>source.url),names,referenceHits,referenceCount:referenceUrls.length,expectEmpty,passed,elapsedMs:observation.elapsedMs}));
}
mkdirSync('.sites-runtime',{recursive:true});
writeFileSync('.sites-runtime/restaurant-evaluation.json',JSON.stringify({date:new Date().toISOString(),results},null,2));
if(results.some(result=>!result.passed)) process.exitCode=1;
