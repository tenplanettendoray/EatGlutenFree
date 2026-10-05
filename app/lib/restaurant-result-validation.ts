function normalized(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

const CATEGORY_ONLY_NAMES = new Set([
  "allergy friendly", "bakery", "burger", "burgers", "cafe", "dairy", "eggs",
  "fish", "food", "gluten", "gluten free", "gluten free restaurant", "healthy",
  "italian", "local restaurant", "mediterranean", "milk", "peanuts", "pizza",
  "restaurant", "restaurants", "sesame", "shellfish", "soy", "tree nuts", "wheat",
]);

export function isPlausibleRestaurantName(name: string, food: string, allergies: string[]) {
  const candidate = normalized(name);
  if (candidate.length < 2 || !/[\p{L}]/u.test(candidate)) return false;
  if (CATEGORY_ONLY_NAMES.has(candidate)) return false;
  if (/^(?:\d+\s+)?(?:best|top|guide|visit|menu|reviews?|potential allergens)(?:\s|$)/.test(candidate)) return false;
  if (normalized(food) === candidate) return false;
  if (allergies.some((allergy) => normalized(allergy) === candidate)) return false;
  if (/^(best|top|popular|recommended)\s+(place|places|restaurant|restaurants|food|foods)\b/.test(candidate)) return false;
  if (/^(restaurant|place|option|result)\s*\d+$/.test(candidate)) return false;
  return true;
}
