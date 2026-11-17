import type { ZodType } from "zod";
import { env } from "./env";

/**
 * Server-only access to rpc.retium.org. Nothing in the browser calls the node
 * directly: one place decides how long to wait, what to retry and which shapes
 * are acceptable.
 *
 * Retry policy follows docs/05-transactions.md and docs/08-wire-reference.md:
 * `Busy` (503), rate limits (429) and transport failures are worth retrying;
 * a refusal (4xx with a reason) never is.
 */

export type RpcFailureKind = "busy" | "transport" | "refused" | "shape" | "not-found";

export class RpcError extends Error {
  readonly kind: RpcFailureKind;
  readonly status?: number;
  readonly retryable: boolean;

  constructor(
    kind: RpcFailureKind,
    message: string,
    options: { status?: number; retryable?: boolean } = {},
  ) {
    super(message);
    this.name = "RpcError";
    this.kind = kind;
    this.status = options.status;
    this.retryable = options.retryable ?? (kind === "busy" || kind === "transport");
  }
}

const TIMEOUT_MS = 8_000;
const ATTEMPTS = 3;

async function getJson(path: string): Promise<unknown> {
  const url = new URL(path, env.RETIUM_RPC_URL);
  let lastError: RpcError | null = null;

  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { accept: "application/json" },
        // Reads are cacheable at the edge; the contract state is cheap to refetch.
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (response.status === 404) {
        throw new RpcError("not-found", "The node has no record of that yet.", {
          status: 404,
          retryable: false,
        });
      }

      if (response.status === 429 || response.status === 503) {
        const retryable = new RpcError("busy", "The node is busy. Try again in a moment.", {
          status: response.status,
          retryable: true,
        });
        lastError = retryable;
        if (attempt < ATTEMPTS) {
          await delay(backoff(attempt, response.headers.get("retry-after")));
          continue;
        }
        throw retryable;
      }

      if (!response.ok) {
        throw new RpcError("refused", `The node refused the read (HTTP ${response.status}).`, {
          status: response.status,
          retryable: false,
        });
      }

      return (await response.json()) as unknown;
    } catch (error) {
      if (error instanceof RpcError) {
        if (error.retryable && attempt < ATTEMPTS && error === lastError) {
          continue;
        }
        throw error;
      }
      const transport = new RpcError("transport", "Could not reach the node.", { retryable: true });
      lastError = transport;
      if (attempt < ATTEMPTS) {
        await delay(backoff(attempt, null));
        continue;
      }
      throw transport;
    }
  }

  throw lastError ?? new RpcError("transport", "Could not reach the node.");
}

/** GET a read endpoint and validate the shape before anyone sees it. */
export async function rpcRead<T>(path: string, schema: ZodType<T>): Promise<T> {
  const body = await getJson(path);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new RpcError("shape", "The node answered with a shape this app does not understand.", {
      retryable: false,
    });
  }
  return parsed.data;
}

function backoff(attempt: number, retryAfter: string | null): number {
  const header = retryAfter ? Number(retryAfter) : Number.NaN;
  if (Number.isFinite(header) && header >= 0) {
    return Math.min(header * 1000, 5_000);
  }
  return Math.min(250 * 2 ** (attempt - 1), 2_000);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(() => resolve(), ms));
}

export function rpcErrorBody(error: unknown): {
  kind: RpcFailureKind;
  message: string;
  status?: number;
  retryable: boolean;
} {
  if (error instanceof RpcError) {
    return {
      kind: error.kind,
      message: error.message,
      ...(error.status === undefined ? {} : { status: error.status }),
      retryable: error.retryable,
    };
  }

  return {
    kind: "shape",
    message: error instanceof Error ? error.message : "Unexpected error.",
    retryable: false,
  };
}
