import { getDb } from "../../db";
import { userSearch } from "../../db/schema";

export async function recordUserSearch(input: {
  userId?: string | null;
  mode: "free" | "premium";
  location: string;
  food: string;
  allergies: string[];
  resultCount: number;
}) {
  if (!input.userId) return;

  try {
    await getDb().insert(userSearch).values({
      id: crypto.randomUUID(),
      userId: input.userId,
      mode: input.mode,
      location: input.location,
      food: input.food,
      allergies: input.allergies.join(" | "),
      resultCount: input.resultCount,
      createdAt: new Date(),
    });
  } catch (error) {
    console.error("Unable to record user search", error);
  }
}
