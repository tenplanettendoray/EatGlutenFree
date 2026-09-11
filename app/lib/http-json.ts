/** A proxy may return HTML or an empty body when an upstream request fails. */
export async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    const value: unknown = JSON.parse(text);
    if (value === null || typeof value !== "object") throw new Error("Invalid response");
    return value as T;
  } catch {
    throw new Error(response.ok
      ? "The server returned an incomplete response. Please try again."
      : "The service is temporarily unavailable. Please try again in a moment.");
  }
}
