import { NextResponse, type NextRequest } from "next/server";

/**
 * Content-Security-Policy with a per-request nonce.
 *
 * Next.js 16 renamed `middleware.ts` to `proxy.ts` (the function is `proxy`).
 * A nonce requires dynamic rendering: `app/layout.tsx` reads `headers()`, so
 * every page is rendered per request and gets the same nonce the policy names.
 *
 * Tradeoffs, deliberately:
 * - `script-src` has no `'unsafe-inline'`. React and Next attach the nonce to
 *   their own scripts; the wallet bundle is loaded dynamically from an already
 *   trusted script, which `'strict-dynamic'` allows.
 *   `https://wallet.retium.org` stays in the list for browsers without
 *   `'strict-dynamic'`.
 * - `style-src` keeps `'unsafe-inline'`. Next inlines critical CSS and Tailwind
 *   emits classes, not inline attributes, but a strict style nonce breaks
 *   hydration styling. Styles cannot execute script, so this is the lower risk.
 * - `connect-src` allows `rpc.retium.org` and `wallet.retium.org`: the wallet
 *   provider runs in this page's context and talks to both. Our own data comes
 *   from `'self'` through the route handlers.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://wallet.retium.org${
      isDev ? " 'unsafe-eval'" : ""
    }`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self' https://rpc.retium.org https://wallet.retium.org",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
