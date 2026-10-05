import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const supportMessage = sqliteTable("support_message", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  email: text("email").notNull(),
  message: text("message").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, table => [index("support_message_user_created").on(table.userId, table.createdAt)]);

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  username: text("username").unique(),
  displayUsername: text("display_username"),
  role: text("role", { enum: ["user", "admin"] }).notNull().default("user"),
  premiumPlan: text("premium_plan", { enum: ["monthly", "annual", "lifetime"] }),
  premiumActivatedAt: integer("premium_activated_at", { mode: "timestamp" }),
  premiumPaymentReference: text("premium_payment_reference"),
  premiumExpiresAt: integer("premium_expires_at", { mode: "timestamp" }),
  trialStartedAt: integer("trial_started_at", { mode: "timestamp" }),
  trialCancelledAt: integer("trial_cancelled_at", { mode: "timestamp" }),
  premiumUpdatedAt: integer("premium_updated_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
}, (table) => [index("session_user_id_idx").on(table.userId)]);

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (table) => [index("account_user_id_idx").on(table.userId)]);

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
}, (table) => [index("verification_identifier_idx").on(table.identifier)]);

export const restaurantPreference = sqliteTable("restaurant_preference", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["suggest", "avoid"] }).notNull(),
  name: text("name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  locationScope: text("location_scope").notNull().default(""),
  allergyScope: text("allergy_scope").notNull().default(""),
  foodScope: text("food_scope").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  uniqueIndex("restaurant_preference_user_kind_name_unique").on(table.userId, table.kind, table.normalizedName, table.locationScope, table.allergyScope, table.foodScope),
  index("restaurant_preference_user_idx").on(table.userId),
  index("restaurant_preference_public_idx").on(table.kind, table.normalizedName, table.locationScope, table.allergyScope, table.foodScope),
]);

export const restaurantSignal = sqliteTable("restaurant_signal", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  locationScope: text("location_scope").notNull().default(""),
  allergyScope: text("allergy_scope").notNull().default(""),
  foodScope: text("food_scope").notNull().default(""),
  suggestionWeight: integer("suggestion_weight").notNull().default(0),
  avoidWeight: integer("avoid_weight").notNull().default(0),
  clickWeight: integer("click_weight").notNull().default(0),
  searchWeight: integer("search_weight").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  uniqueIndex("restaurant_signal_scope_unique").on(table.normalizedName, table.locationScope, table.allergyScope, table.foodScope),
  index("restaurant_signal_scope_idx").on(table.locationScope, table.allergyScope, table.foodScope),
  index("restaurant_signal_weight_idx").on(table.suggestionWeight, table.avoidWeight, table.clickWeight, table.searchWeight),
]);

export const restaurantSearchCache = sqliteTable("restaurant_search_cache", {
  cacheKey: text("cache_key").primaryKey(),
  mode: text("mode", { enum: ["free", "premium"] }).notNull(),
  payload: text("payload").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const userSearch = sqliteTable("user_search", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  mode: text("mode", { enum: ["free", "premium"] }).notNull(),
  location: text("location").notNull(),
  food: text("food").notNull().default(""),
  allergies: text("allergies").notNull().default(""),
  resultCount: integer("result_count").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => [index("user_search_user_created_idx").on(table.userId, table.createdAt)]);

export const restaurantRating = sqliteTable("restaurant_rating", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  restaurantKey: text("restaurant_key").notNull(),
  stars: real("stars").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (table) => [uniqueIndex("restaurant_rating_user_key").on(table.userId, table.restaurantKey), index("restaurant_rating_key").on(table.restaurantKey)]);
