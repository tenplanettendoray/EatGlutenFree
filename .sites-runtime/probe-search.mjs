import { loadEnvFile } from 'node:process';
import { loadTsModule } from '../tests/load-ts-module.mjs';
loadEnvFile('.env.local');
const web = loadTsModule('app/lib/public-web.ts');
const validation = loadTsModule('app/lib/restaurant-result-validation.ts');
const discovery = loadTsModule('app/lib/openrouter-discovery.ts', {
  '@/app/lib/restaurant-result-validation': validation,
  '@/app/lib/public-web': {...web, fetchPublicPage: async url => { const p = await web.fetchPublicPage(url); console.log('PAGE', url, p ? p.html.length : 'unavailable'); return p; }, websiteIdentity: (html,names,city) => { const match=web.websiteIdentity(html,names,city); console.log('IDENTITY',names,match); return match; }},
}, {fetch: async (url, init) => { const start=Date.now(); const r=await fetch(url,init); if(String(url).includes('/chat/completions')){const d=await r.clone().json(); console.log('PROVIDER', new URL(url).hostname, r.status, Date.now()-start, JSON.stringify({model:d.model,usage:d.usage,error:d.error,choices:d.choices}).slice(0,10000));} else console.log('PAGE',url,r.status); return r; }});
console.log('RESULT', JSON.stringify(await discovery.discoverRestaurantsWithOpenRouter({location:process.argv[2]||'Dublin, Ireland',food:process.argv[3]||'Burgers',allergies:['Gluten']})));
