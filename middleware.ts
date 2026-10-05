import { NextRequest, NextResponse } from "next/server";
import { clientNetwork, consumeLimit, requestPolicy, securityHash, validMutationOrigin } from "./app/lib/security";
import { auth } from "./app/lib/auth";
import { getAccountAccess } from "./app/lib/premium";

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const secure = (response: NextResponse) => {
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    response.headers.set("Permissions-Policy", "camera=(), microphone=(), payment=()");
    response.headers.set("Content-Security-Policy", "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'");
    if (request.nextUrl.protocol === "https:") response.headers.set("Strict-Transport-Security", "max-age=31536000");
    if (path.startsWith("/api/") || path.startsWith("/admin") || path.startsWith("/account")) response.headers.set("Cache-Control", "private, no-store");
    return response;
  };
  try {
    if (path.startsWith("/api/")) {
      if (!validMutationOrigin(request)) return secure(NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 }));
      if (request.url.length > 8192) return secure(NextResponse.json({ error: "Request too large." }, { status: 414 }));
      if (Number(request.headers.get("content-length")) > 32768) return secure(NextResponse.json({ error: "Request too large." }, { status: 413 }));
      const network = await securityHash(`network:${clientNetwork(request)}`);
      const policy = requestPolicy(path, request.method);
      const limit = await consumeLimit(`${policy.group}:${network}`, policy.max, policy.seconds);
      if (!limit.allowed) return secure(NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }));
      if (!path.startsWith("/api/auth/")) {
        const session = await auth.api.getSession({ headers: request.headers });
        if (path === "/api/restaurants" && request.nextUrl.searchParams.get("mode") !== "premium" && !(await getAccountAccess(session)).premium) {
          // A server-side ceiling also applies if usage cookies are cleared or forged.
          const identity = session?.user?.id ? `user:${session.user.id}` : `network:${network}`;
          const day = new Date().toISOString().slice(0, 10);
          const daily = await consumeLimit(`free-search:${day}:${identity}`, 4, 86400);
          if (!daily.allowed) return secure(NextResponse.json({ error: "Today's free search limit has been reached." }, { status: 429, headers: { "Retry-After": String(daily.retryAfter) } }));
        }
        if (session?.user) {
          const accountLimit = await consumeLimit(`${policy.group}:user:${session.user.id}`, policy.max, policy.seconds);
          if (!accountLimit.allowed) return secure(NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429, headers: { "Retry-After": String(accountLimit.retryAfter) } }));
        }
      }
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
        // Count actual streamed bytes too: Content-Length is optional and untrusted.
        const reader = request.clone().body?.getReader();
        if (reader) {
          let bytes = 0;
          try {
            while (true) {
              const chunk = await reader.read();
              if (chunk.done) break;
              bytes += chunk.value.byteLength;
              if (bytes > 32768) { void reader.cancel(); return secure(NextResponse.json({ error: "Request too large." }, { status: 413 })); }
            }
          } finally { reader.releaseLock(); }
        }
      }
    }
    if (path === "/admin" || path.startsWith("/admin/") || path.startsWith("/api/admin/")) {
      const session = await auth.api.getSession({ headers: request.headers });
      if (!(await getAccountAccess(session)).admin) return secure(NextResponse.json({ error: "Admin access required." }, { status: session?.user ? 403 : 401 }));
    }
    const response = secure(NextResponse.next());
    if (!request.cookies.get("trial_device")) {
      const id = crypto.randomUUID();
      response.cookies.set("trial_device", `${id}.${await securityHash(`device:${id}`)}`, { httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax", path: "/", maxAge: 31536000 });
    }
    return response;
  } catch {
    return secure(NextResponse.json({ error: "Security checks are temporarily unavailable. Please try again later." }, { status: 503 }));
  }
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|woff2|css|js)$).*)"] };
