import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username } from "better-auth/plugins";
import { getDb } from "../../db";
import * as schema from "../../db/schema";

const socialProviders = {
  ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? {
    google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET },
  } : {}),
  ...(process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET ? {
    apple: { clientId: process.env.APPLE_CLIENT_ID, clientSecret: process.env.APPLE_CLIENT_SECRET },
  } : {}),
  ...(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET ? {
    microsoft: { clientId: process.env.MICROSOFT_CLIENT_ID, clientSecret: process.env.MICROSOFT_CLIENT_SECRET },
  } : {}),
};

function createAuth() {
  return betterAuth({
  appName: "Gluten FreEat",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(getDb(), { provider: "sqlite", schema }),
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
  // The shared D1 middleware limiter runs in development and production.
  // Better Auth's own CSRF/origin checks remain enabled as a second layer.
  advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
  session: { expiresIn: 60 * 60 * 24 * 7, freshAge: 60 * 15 },
  socialProviders,
  plugins: [username({ minUsernameLength: 3, maxUsernameLength: 30 })],
});
}

// Workers are evaluated before deployment bindings are available. Initialize
// the database adapter only when a request actually uses authentication.
let instance: ReturnType<typeof createAuth> | undefined;
export const auth = new Proxy({} as ReturnType<typeof createAuth>, {
  has(_target, property) {
    return property === "handler" || Boolean(instance && property in instance);
  },
  get(_target, property) {
    instance ??= createAuth();
    return Reflect.get(instance, property);
  },
});
