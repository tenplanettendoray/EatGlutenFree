export async function GET() {
  const providers = [
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? "google" : null,
    process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET ? "apple" : null,
    process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET ? "microsoft" : null,
  ].filter((provider): provider is string => Boolean(provider));

  return Response.json({ providers }, { headers: { "Cache-Control": "no-store" } });
}
