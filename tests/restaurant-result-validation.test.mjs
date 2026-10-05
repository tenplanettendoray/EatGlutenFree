import assert from "node:assert/strict";
import test from "node:test";
import { loadTsModule } from "./load-ts-module.mjs";

const { isPlausibleRestaurantName } = loadTsModule("app/lib/restaurant-result-validation.ts");

test("rejects allergens, foods, and placeholders as restaurant names", () => {
  const allergies = ["Gluten", "Sesame"];
  for (const name of ["Gluten", "Sesame", "Pizza", "Restaurant", "Result 2", "Best restaurants"]) {
    assert.equal(isPlausibleRestaurantName(name, "Pizza", allergies), false, name);
  }
});

test("keeps real restaurant business names", () => {
  const allergies = ["Gluten", "Sesame"];
  for (const name of ["Little Nonna", "PNY", "NoGlu", "The Gluten Free Bakery"]) {
    assert.equal(isPlausibleRestaurantName(name, "Pizza", allergies), true, name);
  }
});
