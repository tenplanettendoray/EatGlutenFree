import {loadEnvFile} from 'node:process';
loadEnvFile('.env.local');
const prompt='Find 5 well-established restaurants in the requested city specializing in the requested dish with relevant allergy accommodations. Return ONLY JSON {"places":[{"name":"proper business name","website":"official URL","menu":"menu or FAQ URL","reason":"specific accommodation, or unknown"}]}. Prioritize actual gluten-free burger buns for gluten-free burgers, never bunless substitutes. Do not invent domains, branches or claims. Return fewer if unsure.';
await Promise.all(['google/gemma-4-31b-it:free','nvidia/nemotron-3-super-120b-a12b:free'].map(async model=>{
 try {const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENROUTER_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model,messages:[{role:'system',content:prompt},{role:'user',content:'Dublin, Ireland; Burgers; Gluten'}],max_tokens:1800,temperature:0,reasoning:{enabled:false}}),signal:AbortSignal.timeout(45000)});const d=await r.json();console.log(JSON.stringify({model,status:r.status,data:d}));}catch(e){console.log(model,e.name);}
}));
