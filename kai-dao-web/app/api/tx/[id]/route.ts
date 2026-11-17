import type { NextRequest } from "next/server";
import { getTransaction } from "@/lib/dao";
import { failUnexpected, ok } from "@/lib/http";
import { rateLimit, tooMany } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/**
 * Finality is the only thing this app accepts as "done". The route re-validates
 * the transaction id and the answer's shape before the UI can claim success.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const limit = rateLimit(request);
  if (!limit.allowed) return tooMany(limit.retryAfter);

  const { id } = await context.params;

  try {
    const transaction = await getTransaction(id);

    return ok({
      txId: id,
      finality: transaction.finality,
      execStatus: transaction.exec_status ?? null,
      execError: transaction.exec_error ?? null,
      action: transaction.action ?? null,
      settled: transaction.finality === "HardFinal" && (transaction.exec_status ?? "ok") === "ok",
    });
  } catch (error) {
    return failUnexpected(error);
  }
}
