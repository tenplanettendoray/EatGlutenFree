import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTsModule } from './load-ts-module.mjs';
const path = 'app/lib/tavily-foursquare-discovery.ts';
const lib = loadTsModule(path);
const source = quote => [{title:'Restaurant evidence',url:'https://foodguide.org/review',quote}];

test('requested evidence hierarchy and negative claims', () => {
  const cases = [
    ['Juniper is a dedicated gluten-free restaurant.',5],
    ['Juniper offers a gluten-free menu. Reviews describe it as celiac-safe.',4],
    ['Juniper offers gluten-free buns and a dedicated fryer.',3],
    ['Juniper offers gluten-free buns.',2],
    ['Juniper has gluten-free options, but uses a shared fryer with a risk of cross contamination.',1],
    ['Juniper has no gluten-free buns. It is not a dedicated gluten-free restaurant.',0],
    ['Juniper has a dedicated gluten-free menu in a mixed restaurant.',2],
  ];
  for (const [quote, rank] of cases) assert.equal(lib.classifyEvidence(source(quote),['Gluten']).evidenceRank,rank,quote);
  const mixed=lib.classifyEvidence(source('Gluten-free options and a shared kitchen.'),['Gluten','Wheat']);
  assert.deepEqual(mixed.supportedAllergies,['Gluten']);
  assert.deepEqual(mixed.missingAllergies,['Wheat']);
  assert.equal(mixed.confidence,'weak');
  assert.ok(mixed.crossContaminationWarning);
  assert.ok(lib.classifyEvidence(source('Gluten-free buns. Staff prevent cross contamination.'),['Gluten']).crossContaminationWarning);
});

test('guide evidence does not leak between restaurants', () => {
  const data={answer:'Juniper Table and Cedar Kitchen.',results:[{title:'Two restaurants',url:'https://foodguide.org/city',content:'### Juniper Table\n\nJuniper Table is a dedicated gluten-free restaurant.\n\n### Cedar Kitchen\n\nCedar Kitchen has gluten-free buns but uses a shared fryer.'}]};
  const candidates=lib.extractCandidates(data,'Paris');
  const juniper=candidates.find(x=>x.name==='Juniper Table');
  const cedar=candidates.find(x=>x.name==='Cedar Kitchen');
  assert.ok(juniper && cedar);
  assert.equal(lib.classifyEvidence(juniper.sources,['Gluten']).evidenceRank,5);
  assert.equal(lib.classifyEvidence(cedar.sources,['Gluten']).evidenceRank,1);
});

test('all six city coordinates, genuine name matches and food categories', () => {
  for(const [location,expected] of Object.entries({'New York City':[40.758,-73.9855],Paris:[48.8566,2.3522],London:[51.5074,-0.1278],Dublin:[53.3498,-6.2603],Lisbon:[38.7223,-9.1393],Madrid:[40.4168,-3.7038]})) assert.deepEqual(lib.cityCoordinates({location}),expected);
  assert.equal(lib.nameMatches('Bareburger','Bareburger'),true);
  assert.equal(lib.nameMatches('Modern Bread and Bagel','Modern Bread & Bagel'),true);
  assert.equal(lib.nameMatches('Springy Burgers & Fries','Vertigo Burgers & Fries'),false);
  assert.equal(lib.nameMatches('Bareburger','Bareburgerish'),false);
  assert.equal(lib.restaurantCategory({categories:[{name:'Food Bank'}]}),false);
  assert.equal(lib.restaurantCategory({categories:[{name:'Burger Joint'}]}),true);
  assert.equal(lib.matchesCity({location:{locality:'Mount Vernon'}},'New York City'),false);
  assert.equal(lib.matchesCity({location:{locality:'Brooklyn'}},'New York City'),true);
  assert.equal(lib.matchesCity({location:{locality:'Lisboa'}},'Lisbon'),true);
});

test('Tavily runs first and Foursquare receives only extracted names plus coordinates', async () => {
  const calls=[];
  const data={answer:'Juniper Table offers gluten-free burgers.',results:[{title:'Juniper Table',url:'https://junipertable.org/menu',content:'Juniper Table is a dedicated gluten-free restaurant serving burgers.'}]};
  const loaded=loadTsModule(path,{}, {process:{env:{TAVILY_API_KEY:'tavily-test',FOURSQUARE_API_KEY:'fsq-test'}},fetch:async(url,options)=>{
    calls.push(String(url));
    if(String(url).includes('tavily.com')) {
      assert.equal(options.headers.Authorization,'Bearer tavily-test');
      const body=JSON.parse(options.body);
      assert.equal(body.include_answer,true);assert.equal(body.search_depth,'basic');assert.equal(body.max_results,8);
      if (calls.length === 1) assert.match(body.query,/dedicated fryer cross contamination reviews/);
      return Response.json(data);
    }
    assert.equal(calls[0],'https://api.tavily.com/search');
    const params=new URL(url).searchParams;
    assert.equal(params.get('query'),'Juniper Table');assert.equal(params.get('ll'),'48.8566,2.3522');assert.equal(params.get('limit'),'5');
    assert.equal(options.headers.Authorization,'Bearer fsq-test');assert.equal(options.headers['X-Places-Api-Version'],'2025-06-17');
    return Response.json({results:[
      {fsq_place_id:'wrong',name:'Free Shoes',distance:20,categories:[{name:'Store'}]},
      {fsq_place_id:'far',name:'Juniper Table',distance:900000,categories:[{name:'Burger Joint'}]},
      {fsq_place_id:'real',name:'Juniper Table',distance:400,categories:[{name:'Burger Joint'}],location:{formatted_address:'1 Rue Example, Paris'},tel:'+33123456789',website:'https://junipertable.org',latitude:48.857,longitude:2.353},
    ]});
  }});
  const result=await loaded.discoverRestaurantsWithTavilyFoursquare({location:'Paris',food:'burger',allergies:['Gluten']});
  assert.equal(result.restaurants.length,1);const restaurant=result.restaurants[0];
  assert.equal(restaurant.fsqPlaceId,'real');assert.equal(restaurant.distanceKm,.4);assert.equal(restaurant.phone,'+33123456789');
  assert.equal(restaurant.locations[0].address,'1 Rue Example, Paris');assert.equal(restaurant.confidence,'strong');
  assert.deepEqual(restaurant.sourceUrls,['https://junipertable.org/menu']);assert.equal(restaurant.evidenceRank,5);
});

test('empty evidence never triggers a broad Foursquare search and keys stay out of errors', async () => {
  let calls=0;
  const loaded=loadTsModule(path,{}, {process:{env:{TAVILY_API_KEY:'secret-test',FOURSQUARE_API_KEY:'other-secret'}},fetch:async()=>{calls++;return Response.json({answer:'No useful evidence found',results:[]});}});
  const result=await loaded.discoverRestaurantsWithTavilyFoursquare({location:'Paris',food:'burger',allergies:['Gluten']});
  assert.equal(calls,3);assert.deepEqual(result.restaurants,[]);
  const failure=loadTsModule(path,{}, {process:{env:{TAVILY_API_KEY:'secret-test',FOURSQUARE_API_KEY:'other-secret'}},fetch:async()=>new Response('secret-test',{status:401})});
  await assert.rejects(()=>failure.discoverRestaurantsWithTavilyFoursquare({location:'Paris',food:'burger',allergies:[]}),/Tavily authentication failed/);
});

test('same-name restaurants use evidence cuisine before proximity', () => {
  const candidate={name:'Tasca',sources:source('Tasca serves gluten-free Italian pizza and pasta.')};
  const portuguese={name:'Tasca',categories:[{name:'Portuguese Restaurant'}],distance:305};
  const italian={name:'Tasca',categories:[{name:'Italian Restaurant'}],distance:4073};
  assert.equal(lib.placeMatchScore(portuguese,candidate,'pizza'),-1);
  assert.ok(lib.placeMatchScore(italian,candidate,'pizza')>0);
  assert.deepEqual(lib.classifyEvidence(source('Not a gluten-free restaurant, but offers gluten-free buns.'),['Gluten']).supportedAllergies,['Gluten']);
});

test('dedicated cuisine venues rank first while conflicting fryer reviews rank last', () => {
  assert.equal(lib.classifyEvidence(source('Little Nonna is a 100% gluten free Italian restaurant.'),['Gluten']).evidenceRank,5);
  const conflicting=lib.classifyEvidence(source('Gluten-free buns and a dedicated fryer. Another review: fries are cross contaminated.'),['Gluten']);
  assert.equal(conflicting.evidenceRank,1);assert.equal(conflicting.confidence,'weak');assert.ok(conflicting.crossContaminationWarning);
});

test('numbered business names survive and generic menu headings never become candidates', () => {
  const candidates=lib.extractCandidates({results:[
    {title:'5 Napkin Burger - Gluten-Free Quick Service Restaurant',url:'https://foodguide.org/5napkin',content:'Popular gluten-free menu items: Bread/Buns, Burgers. Featured review: dedicated fryer. ## 20. San Sabino'},
  ]},'New York City');
  assert.ok(candidates.some(x=>x.name==='5 Napkin Burger'));
  assert.equal(candidates.some(x=>x.name==='Popular'),false);
  assert.equal(candidates.some(x=>x.name==='San Sabino'),false);
});

test('expands sparse evidence, reuses place lookups, and stops at three matches', async () => {
  let rounds=0;
  const lookups=[];
  const names=['Juniper Table','Cedar Kitchen','Maple Bistro'];
  const loaded=loadTsModule(path,{}, {process:{env:{TAVILY_API_KEY:'test',FOURSQUARE_API_KEY:'test'}},fetch:async(url)=>{
    if(String(url).includes('tavily.com')) {
      rounds++;
      return Response.json({results:names.slice(0,rounds===1?2:3).map((name,i)=>({title:name,url:`https://restaurant${i}.org/menu`,content:`${name} is a dedicated gluten-free restaurant serving pizza.`}))});
    }
    const name=new URL(url).searchParams.get('query');
    lookups.push(name);
    return Response.json({results:[{fsq_place_id:name,name,distance:100,categories:[{name:'Pizza Restaurant'}],location:{locality:'Paris'}}]});
  }});
  const result=await loaded.discoverRestaurantsWithTavilyFoursquare({location:'Paris',food:'pizza',allergies:['Gluten']});
  assert.equal(rounds,2);
  assert.equal(lookups.length,3);
  assert.equal(result.restaurants.length,3);
  assert.equal(result.searchWarning,undefined);
});

test('caps results at nine after evidence ranking without unnecessary expansion', async () => {
  let rounds=0;
  const names=['Juniper Table','Cedar Kitchen','Maple Bistro','Willow Kitchen','Birch Table','Elm Bistro','Oak Kitchen','Pine Table','Aspen Bistro','Hazel Kitchen'];
  const loaded=loadTsModule(path,{}, {process:{env:{TAVILY_API_KEY:'test',FOURSQUARE_API_KEY:'test'}},fetch:async(url)=>{
    if(String(url).includes('tavily.com')) {
      rounds++;
      return Response.json({answer:names.join('. '),results:[{title:'City dining guide',url:'https://guide.org/paris',content:names.map(name=>`### ${name}\n\n${name} is a dedicated gluten-free restaurant serving pizza.`).join('\n\n')}]});
    }
    const name=new URL(url).searchParams.get('query');
    return Response.json({results:[{fsq_place_id:name,name,distance:100,categories:[{name:'Pizza Restaurant'}],location:{locality:'Paris'}}]});
  }});
  const result=await loaded.discoverRestaurantsWithTavilyFoursquare({location:'Paris',food:'pizza',allergies:['Gluten']});
  assert.equal(rounds,1);
  assert.equal(result.restaurants.length,9);
  assert.equal(new Set(result.restaurants.map(r=>r.fsqPlaceId)).size,9);
});

test('a city in a restaurant title cannot inherit its allergy evidence', () => {
  const candidates=lib.extractCandidates({answer:'Pizza Locale in Istanbul.',results:[{title:'Pizza Locale - Gluten-Free Friendly Pizza Restaurant in Istanbul',url:'https://guide.org/pizza-locale',content:'Title: Pizza Locale - Gluten-Free Friendly Pizza Restaurant in Istanbul. Gluten-free pizza and separate oven.'}]},'Paris');
  assert.equal(candidates.some(candidate=>candidate.name==='Istanbul'),false);
});

test('Rome and other cities without coordinates use near without radius', async () => {
  let placeCalls=0;
  const loaded=loadTsModule(path,{}, {process:{env:{TAVILY_API_KEY:'test',FOURSQUARE_API_KEY:'test'}},fetch:async(url)=>{
    if(String(url).includes('tavily.com')) return Response.json({results:[{title:'Juniper Table',url:'https://juniper.org/menu',content:'Juniper Table serves gluten-free pizza in Rome.'}]});
    const params=new URL(url).searchParams;
    placeCalls++;
    assert.equal(params.get('near'),'Rome');
    assert.equal(params.has('radius'),false);
    assert.equal(params.has('ll'),false);
    return Response.json({results:[{fsq_place_id:'rome',name:'Juniper Table',categories:[{name:'Pizza Restaurant'}],location:{locality:'Roma'}}]});
  }});
  const result=await loaded.discoverRestaurantsWithTavilyFoursquare({location:'Rome',food:'pizza',allergies:['Gluten']});
  assert.equal(placeCalls,1);
  assert.equal(result.restaurants[0].fsqPlaceId,'rome');
});

test('AI extracts grounded names and rejects invented quotations', async () => {
  const quote='Juniper Table serves gluten-free pizza in Rome.';
  let called=false;
  const loaded=loadTsModule(path,{}, {process:{env:{OPENROUTER_API_KEY:'test',OPENROUTER_MODEL:'configured-model'}},fetch:async(url,options)=>{
    called=true;
    assert.match(url,/openrouter/);
    assert.equal(JSON.parse(options.body).model,'configured-model');
    return Response.json({choices:[{message:{content:JSON.stringify({restaurants:[
      {name:'Juniper Table',evidence:[{sourceIndex:0,quote}]},
      {name:'Invented Restaurant',evidence:[{sourceIndex:0,quote:'Invented Restaurant is dedicated gluten-free.'}]},
      {name:'Rome',evidence:[{sourceIndex:0,quote}]},
    ]})}}]});
  }});
  const result=await loaded.extractCandidatesWithAi({results:[{title:'Juniper Table',url:'https://juniper.org/menu',content:quote}]},{location:'Rome',food:'pizza',allergies:['Gluten']});
  assert.equal(called,true);
  assert.equal(result.model,'configured-model');
  assert.deepEqual(result.candidates.map(c=>c.name),['Juniper Table']);
});

test('AI provider failure retains deterministic evidence extraction', async () => {
  const loaded=loadTsModule(path,{}, {process:{env:{OPENROUTER_API_KEY:'test'}},fetch:async()=>new Response('quota',{status:429})});
  const result=await loaded.extractCandidatesWithAi({results:[{title:'Juniper Table',url:'https://juniper.org/menu',content:'Juniper Table serves gluten-free pizza.'}]},{location:'Rome',food:'pizza',allergies:['Gluten']});
  assert.deepEqual(result.candidates,[]);
  assert.equal(result.model,undefined);
});
