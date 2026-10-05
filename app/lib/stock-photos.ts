// Generated editorial food images, selected consistently by restaurant identity.
// None of these defaults represents a photo of a particular restaurant.
const categories = [
  { name: "dessert", match: /dessert|patisserie|pastry|bakery|cake|cookie|donut|sweet|gelato|ice cream/, atlas: "food", row: 2 },
  { name: "burger", match: /burger|hamburger|cheeseburger/, atlas: "food", row: 0 },
  { name: "pizza", match: /pizza|pizzeria/, atlas: "food", row: 1 },
  { name: "sushi", match: /sushi|sashimi|nigiri/, atlas: "food", row: 5 },
  { name: "noodles", match: /noodle|ramen|pho\b|pad thai/, atlas: "bowls", row: 1 },
  { name: "pasta", match: /pasta|spaghetti|ravioli|linguine|penne/, atlas: "bowls", row: 0 },
  { name: "rice", match: /rice|bibimbap|risotto/, atlas: "bowls", row: 2 },
  { name: "soup", match: /soup|broth/, atlas: "bowls", row: 3 },
  { name: "breakfast", match: /breakfast|brunch|pancake|waffle|omelette/, atlas: "extras", row: 1 },
  { name: "tacos", match: /taco|mexican|burrito|latin american/, atlas: "extras", row: 2 },
  { name: "sandwich", match: /sandwich|wrap|panini|deli\b/, atlas: "extras", row: 4 },
  { name: "vegetarian", match: /salad|vegetarian|vegan|healthy|vegetable|mediterranean|greek|mezze/, atlas: "food", row: 6 },
  { name: "chicken", match: /chicken|wing|poultry/, atlas: "food", row: 3 },
  { name: "steak", match: /steak|barbecue|bbq|grill|kebab|turkish/, atlas: "extras", row: 3 },
  { name: "seafood", match: /seafood|fish|salmon|prawn|spanish/, atlas: "extras", row: 0 },
  { name: "curry", match: /curry|curries|indian|thai|african|caribbean/, atlas: "food", row: 7 },
  { name: "cafe", match: /cafe|café|coffee|bistro|french/, atlas: "extras", row: 5 },
  { name: "pasta", match: /italian/, atlas: "bowls", row: 0 },
  { name: "noodles", match: /asian|chinese|vietnamese|japanese/, atlas: "bowls", row: 1 },
  { name: "rice", match: /korean/, atlas: "bowls", row: 2 },
  { name: "burger", match: /american|fast food/, atlas: "food", row: 0 },
] as const;

export function stockPhotoTile(identity: string) {
  return [...identity].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 0);
}

export function stockPhotoChoice(tile: number, food = "", cuisine: string[] = []) {
  const find = (value: string) => categories.find(category => category.match.test(value.toLowerCase()));
  const category = find(cuisine.join(" ")) || find(food);
  if (!category) return { src: "/restaurant-variety-atlas.png", x: tile % 4 * 384, y: Math.floor(tile % 12 / 4) * 1024 / 3, width: 384, height: 1024 / 3, atlasWidth: 1536, atlasHeight: 1024, label: "Restaurant atmosphere illustration" };
  return {
    // Inset each crop so contact-sheet separators never appear on cards.
    src: `/stock/restaurant-${category.atlas}.png`, x: tile % 6 * 100 + 8, y: category.row * 100 + 8,
    width: 84, height: 84, atlasWidth: 600,
    atlasHeight: category.atlas === "food" ? 800 : category.atlas === "extras" ? 600 : 400,
    label: `Illustrative ${category.name} photo`,
  };
}
