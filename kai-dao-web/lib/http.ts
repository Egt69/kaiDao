import { NextResponse } from "next/server";
import { RpcError, rpcErrorBody } from "./rpc";

/** JSON in, JSON out, with one shape for every failure. */
export function ok<T>(data: T): NextResponse {
  return NextResponse.json(data, {
    headers: { "cache-control": "no-store" },
  });
}

const STATUS: Record<string, number> = {
  busy: 503,
  transport: 502,
  refused: 422,
  "not-found": 404,
  shape: 502,
  input: 400,
};

export function fail(error: unknown): NextResponse {
  const body = rpcErrorBody(error);
  const status = STATUS[body.kind] ?? 500;

  return NextResponse.json(
    { error: body },
    {
      status,
      headers: {
        "cache-control": "no-store",
        ...(body.retryable ? { "retry-after": "2" } : {}),
      },
    },
  );
}

/**
 * A route handler catches everything and never leaks an exception message that
 * came from the node. Unexpected errors are reported as a shape problem and the
 * original text stays in the server log.
 */
export function failUnexpected(error: unknown): NextResponse {
  if (error instanceof RpcError) return fail(error);
  console.error("[dao-api]", error);
  return fail(
    new RpcError("shape", "This app could not understand the node's answer.", {
      retryable: false,
    }),
  );
}
