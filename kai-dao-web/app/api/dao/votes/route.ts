import type { NextRequest } from "next/server";
import { z } from "zod";
import { getVoterState } from "@/lib/dao";
import { fail, failUnexpected, ok } from "@/lib/http";
import { rateLimit, tooMany } from "@/lib/ratelimit";
import { RpcError } from "@/lib/rpc";

export const dynamic = "force-dynamic";

const addressSchema = z.string().regex(/^rete[0-9a-f]{68}$/);

/**
 * Everything the proposals page needs to render one wallet's voting state:
 * power, stake lock, and which proposals it already voted on. The address is
 * shape-checked here and only ever used as an argument to allowlisted reads.
 */
export async function GET(request: NextRequest) {
  const limit = rateLimit(request);
  if (!limit.allowed) return tooMany(limit.retryAfter);

  const url = new URL(request.url);
  const address = addressSchema.safeParse(url.searchParams.get("address") ?? "");

  if (!address.success) {
    return fail(
      new RpcError("refused", '"address" must be a Retium address.', {
        retryable: false,
      }),
    );
  }

  try {
    const state = await getVoterState(address.data);

    return ok({
      address: state.address,
      stakedAtomic: state.stakedAtomic.toString(),
      powerAtomic: state.powerAtomic.toString(),
      lockMs: state.lockMs,
      votes: state.votes,
      votesComplete: state.votesComplete,
    });
  } catch (error) {
    return failUnexpected(error);
  }
}
