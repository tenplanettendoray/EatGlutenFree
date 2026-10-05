import { readFile, writeFile, mkdir } from "node:fs/promises";

const input = process.argv[2];
if (!input) throw new Error("Pass the city guide text file path.");
const text = await readFile(input, "utf8");
const cities = [];
let current;

const titleCase = value => value.toLocaleLowerCase("en").replace(/(^|[\s'-])\p{L}/gu, match => match.toLocaleUpperCase("en"));
const entries = value => value.split(/;\s*/).flatMap(item => {
  const entry = item.match(/^(\d+)\s+(.+)\[([A-Z?]+)\]$/u);
  if (!entry) return [];
  return [{ rank: Number(entry[1]), name: entry[2].trim(), label: entry[3] }];
});

for (const line of text.split(/\r?\n/).map(line => line.trim())) {
  const city = line.match(/^\d{2}\s+(.+?)(?:,\s+(.+?))?(?:\s+\+NEW)?$/u);
  if (city) {
    const cityName = titleCase(city[1]);
    current = {
      city: cityName,
      country: titleCase(city[2] || city[1]),
      categories: {},
      allergyCategories: {},
      sources: ["/gluten-free-city-guide.txt"],
    };
    cities.push(current);
    continue;
  }
  if (!current || !/^[FA]\s+\|\s+/.test(line)) continue;
  for (const section of line.split(/\s+\|\s+/).slice(1)) {
    const category = section.match(/^([A-Z]{1,2}):\s+(.+)$/u);
    if (!category) continue;
    const target = ["ML", "PN", "SF"].includes(category[1]) ? current.allergyCategories : current.categories;
    target[category[1]] = entries(category[2]);
  }
}

const foodKeys = ["B", "C", "D", "N", "P", "S"];
const allergyKeys = ["ML", "PN", "SF"];
const complete = cities.length === 40 && cities.every(city =>
  foodKeys.every(key => city.categories[key]?.length === 5)
  && allergyKeys.every(key => city.allergyCategories[key]?.length === 3));
if (!complete) throw new Error("Incomplete guide import.");

const sourceDate = text.match(/Revision date:\s*(\d{4}-\d{2}-\d{2})/i)?.[1] || new Date().toISOString().slice(0, 10);
await mkdir("app/lib/data", { recursive: true });
await writeFile("app/lib/data/gluten-free-city-guide.json", JSON.stringify({
  title: "GF + Allergy World City Index — 2026 Compact Edition",
  sourceDate,
  cities,
}, null, 2) + "\n");
await writeFile("public/gluten-free-city-guide.txt", text.endsWith("\n") ? text : `${text}\n`);

const placementCount = cities.reduce((total, city) => total
  + Object.values(city.categories).flat().length
  + Object.values(city.allergyCategories).flat().length, 0);
console.log(`Imported ${cities.length} cities and ${placementCount} ranked placements.`);
