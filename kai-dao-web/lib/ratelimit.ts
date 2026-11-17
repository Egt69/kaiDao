import { NextResponse, type NextRequest } from "next/server";

/**
 * A small per-IP limiter for the proxy routes. One process, one map: enough to
 * stop a runaway tab from hammering the node, not a substitute for a real
 * limiter once this runs on more than one instance.
 */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 120;

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(
  request: NextRequest,
): { allowed: true } | { allowed: false; retryAfter: number } {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "local";

  const now = Date.now();
  const bucket = buckets.get(ip);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true };
  }

  bucket.count += 1;
  if (bucket.count <= MAX_PER_WINDOW) return { allowed: true };

  return {
    allowed: false,
    retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

export function tooMany(retryAfter: number): NextResponse {
  return NextResponse.json(
    {
      error: {
        kind: "busy",
        message: "Too many requests from this browser. Wait a moment.",
        retryable: true,
      },
    },
    { status: 429, headers: { "retry-after": String(retryAfter) } },
  );
}
