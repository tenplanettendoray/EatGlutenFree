// Brand aliases shared by discovery, guide merging and community reactions.
export function restaurantBrandKey(name: string) {
  let value = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  if (/^(?:pny|paris new york)(?:\s|$)/.test(value)) return "pny";
  if (/^frie?d?man(?:s| s)?(?:\s|$)/.test(value)) return "friedmans";
  if (/^no\s*glu(?:\s|$)/.test(value)) return "noglu";
  if (/^niche(?:\s|$)/.test(value)) return "niche";
  value = value.replace(/\b(restaurants?|nyc|new york|city|bar|and|cafe|diner|s)\b/g, " ").replace(/\s+/g, " ").trim();
  return value;
}

export function sameRestaurantBrand(a: string, b: string) {
  const left = restaurantBrandKey(a), right = restaurantBrandKey(b);
  return Boolean(left && right && (left === right || left.replace(/ /g, "") === right.replace(/ /g, "") || left.startsWith(`${right} `) || right.startsWith(`${left} `)));
}
