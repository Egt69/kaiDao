import type { ZodType } from "zod";
import { apiErrorBodySchema } from "./api-schemas";

export type ApiFailure = {
  kind: string;
  message: string;
  retryable: boolean;
  status?: number;
};

export type ApiResult<T> = { ok: true; data: T } | { ok: false; failure: ApiFailure };

const UNEXPECTED: ApiFailure = {
  kind: "shape",
  message: "This app could not understand its own data.",
  retryable: false,
};

/**
 * One way in and out of the app's own API. Network failures, error bodies and
 * shapes the UI does not expect all end up as an ApiFailure, so no component
 * ever renders half an answer.
 */
export async function apiGet<T>(
  path: string,
  schema: ZodType<T>,
  signal?: AbortSignal,
): Promise<ApiResult<T>> {
  let response: Response;

  try {
    response = await fetch(path, {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: signal ?? null,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, failure: { kind: "aborted", message: "Cancelled.", retryable: false } };
    }
    return {
      ok: false,
      failure: {
        kind: "transport",
        message: "Could not reach this app's server.",
        retryable: true,
      },
    };
  }

  const text = await response.text();
  let body: unknown;

  try {
    body = text === "" ? null : JSON.parse(text);
  } catch {
    return { ok: false, failure: UNEXPECTED };
  }

  if (!response.ok) {
    const parsed = apiErrorBodySchema.safeParse(body);
    if (parsed.success) {
      return {
        ok: false,
        failure: {
          kind: parsed.data.error.kind,
          message: parsed.data.error.message,
          retryable: parsed.data.error.retryable,
          ...(parsed.data.error.status === undefined ? {} : { status: parsed.data.error.status }),
        },
      };
    }
    return {
      ok: false,
      failure: {
        kind: "transport",
        message: `The server answered HTTP ${response.status}.`,
        retryable: response.status >= 500,
        status: response.status,
      },
    };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return { ok: false, failure: UNEXPECTED };

  return { ok: true, data: parsed.data };
}
