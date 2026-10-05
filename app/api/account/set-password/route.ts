import { auth } from "../../../lib/auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { newPassword?: string };
  if (!body || typeof body.newPassword !== "string" || body.newPassword.length < 8 || body.newPassword.length > 128) {
    return Response.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }
  try {
    const accounts = await auth.api.listUserAccounts({ headers: request.headers });
    if (accounts.some((account) => account.providerId === "credential")) {
      return Response.json({ error: "This account already has a password. Use Change password instead." }, { status: 409 });
    }
    await auth.api.setPassword({ body: { newPassword: body.newPassword }, headers: request.headers });
    return Response.json({ status: true });
  } catch (error) {
    return Response.json({ error: "The password could not be set. Sign in again and retry." }, { status: 400 });
  }
}
