function normalized(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

const CATEGORY_ONLY_NAMES = new Set([
  "allergy friendly", "bakery", "burger", "burgers", "cafe", "dairy", "eggs",
  "fish", "food", "gluten", "gluten free", "gluten free restaurant", "healthy",
  "italian", "local restaurant", "mediterranean", "milk", "peanuts", "pizza",
  "restaurant", "restaurants", "sesame", "shellfish", "soy", "tree nuts", "wheat",
]);

export function isPlausibleRestaurantName(name: string, food: string, allergies: string[]) {
  const candidate = normalized(name);
  if (candidate.length < 2 || !/[a-z]/.test(candidate)) return false;
  if (CATEGORY_ONLY_NAMES.has(candidate)) return false;
  if (normalized(food) === candidate) return false;
  if (allergies.some((allergy) => normalized(allergy) === candidate)) return false;
  if (/^(best|top|popular|recommended)\s+(place|places|restaurant|restaurants|food|foods)\b/.test(candidate)) return false;
  if (/^(restaurant|place|option|result)\s*\d+$/.test(candidate)) return false;
  return true;
}
