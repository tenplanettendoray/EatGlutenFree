import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTsModule } from './load-ts-module.mjs';

const { groundRestaurants, sourcesFromAnnotations, sourcesFromGroqTools } = loadTsModule('app/lib/restaurant-grounding.ts');
const { parseJsonObject } = loadTsModule('app/lib/openrouter-discovery.ts');
const input = { location: 'Paris, France', food: 'Pizza', allergies: ['Gluten', 'Sesame', 'Wheat'] };
const source = { id: 1, title: 'Juniper Kitchen Paris menu', url: 'https://juniperkitchen.fr/menu', text: 'Juniper Kitchen Paris. 12 Rue des Fleurs, Paris. Our gluten-free pizza is prepared to order. Ask about cross-contact.' };
const row = { n: 'Juniper Kitchen', s: 1, a: '12 Rue des Fleurs, Paris', fq: 'Our gluten-free pizza is prepared to order.', ae: [{ n: 'Gluten', q: 'Our gluten-free pizza is prepared to order.' }] };

test('unfinished reasoning and bare allergen lists cannot become restaurants', () => {
  for (const content of ['Here is my thinking: ["Gluten","Sesame"]', '["Gluten","Sesame"]', '{"p":["Gluten","Sesame"]}', '{"p":[{"n":"Gluten","s":1}]}']) {
    assert.deepEqual(groundRestaurants(parseJsonObject(content), input, [source]), []);
  }
  assert.equal(groundRestaurants(parseJsonObject('```json\n'+JSON.stringify({p:[row]})+'\n```'), input, [source]).length, 1);
});

test('allergy claims require literal evidence; gluten-free never implies sesame or wheat safety', () => {
  const [restaurant] = groundRestaurants({p:[{...row, ae:[...row.ae, {n:'Sesame',q:'Sesame-free pizza'}, {n:'Wheat',q:row.ae[0].q}]}]}, input, [source]);
  assert.deepEqual(restaurant.supportedAllergies, ['Gluten']);
  assert.deepEqual(restaurant.missingAllergies, ['Sesame','Wheat']);
  assert.match(restaurant.rankingReason, /Sesame, Wheat.*unconfirmed/);
});

test('model URLs, fabricated addresses, unknown source IDs and wrong restaurants are rejected', () => {
  const [restaurant] = groundRestaurants({p:[{...row,a:'999 Fake Street',w:'https://fake.invalid/'}]}, input, [source]);
  assert.equal(restaurant.website, source.url);
  assert.match(restaurant.locations[0].address, /confirm branch/);
  for (const bad of [{...row,s:99},{...row,n:'Invented Pizza'},{...row,fq:'A made up pizza quote'}]) assert.deepEqual(groundRestaurants({p:[bad]},input,[source]),[]);
});

test('gluten-free salad does not establish gluten-free pizza availability', () => {
  const other = {...source,text:'Juniper Kitchen Paris. Our pizza menu. Gluten-free salad available.'};
  assert.deepEqual(groundRestaurants({p:[{...row,fq:'Our pizza menu.',ae:[{n:'Gluten',q:'Gluten-free salad available.'}]}]},input,[other]),[]);
});

test('generic healthy gluten-free copy does not establish gluten-free ramen', () => {
  const ramenInput = { location: 'Tokyo, Japan', food: 'Ramen', allergies: ['Gluten'] };
  const generic = { id: 1, title: 'MyRamen Tokyo', url: 'https://myramen.company/shop', text: 'A healthy ramen shop for a healthy lifestyle: vegan, organic, gluten-free, etc.' };
  assert.deepEqual(groundRestaurants({p:[{n:'MyRamen',s:1}]},ramenInput,[generic]),[]);
  const japanese = { id: 2, title: '東京 グルテンフリーラーメン｜らーめんこうすけ', url: 'https://kousuke-glutenfree.tokyo/', text: '東京 グルテンフリーラーメン【らーめんこうすけ】。' };
  assert.equal(groundRestaurants({p:[{n:'Kousuke',s:2}]},ramenInput,[japanese]).length,1);
});

test('search citations filter wrong-city pages, directories and duplicate URLs', () => {
  const annotation = source => ({type:'url_citation',url_citation:{url:source.url,title:source.title,content:source.text}});
  const annotations = [annotation(source),annotation(source),annotation({...source,url:'https://lacarte.menu/juniper'}),annotation({...source,url:'https://juniperkitchen.fr/lyon',title:'Juniper Kitchen Lyon',text:'Our Lyon restaurant serves gluten-free pizza.'})];
  assert.equal(sourcesFromAnnotations(annotations,input).length,1);
});

test('chain branches are not used to fill the result list', () => {
  assert.equal(groundRestaurants({p:[row,row]},input,[source]).length,1);
});

test('Groq search tools retain official pages and reject directories', () => {
  const tools=[{output:`Title: Juniper Kitchen Paris\nURL: https://juniperkitchen.fr/menu\nContent: Juniper Kitchen Paris serves gluten-free pizza.\nTitle: Directory\nURL: https://www.findmeglutenfree.com/juniper\nContent: Paris gluten-free pizza.\nTitle: Travel guide\nURL: https://tripaligner.com/paris/juniper\nContent: Paris gluten-free pizza.`}];
  assert.deepEqual(sourcesFromGroqTools(tools,input).map(item=>item.url),['https://juniperkitchen.fr/menu']);
});

test('OpenRouter truncated answers fall back to NVIDIA without displaying partial content', async () => {
  const calls=[];
  const loaded=loadTsModule('app/lib/openrouter-discovery.ts',{}, {process:{env:{NVIDIA_API_KEY:'test',OPENROUTER_API_KEY:'test'}},fetch:async(url, options)=>{
    const body=JSON.parse(options.body); calls.push(body);
    return Response.json({choices:[{finish_reason:calls.length===1?'length':'stop',message:{content:JSON.stringify({p:[row]})}}]});
  }});
  const result=await loaded.discoverRestaurantsWithOpenRouter(input,[source]);
  assert.equal(result.provider,'NVIDIA');
  assert.equal(result.restaurants.length,1);
  assert.equal(calls[0].chat_template_kwargs,undefined);
  assert.equal(calls[1].chat_template_kwargs.enable_thinking,false);
  assert.equal(calls.length,2);
});
