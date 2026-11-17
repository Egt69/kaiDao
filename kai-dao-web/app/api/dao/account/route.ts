import type { NextRequest } from "next/server";
import { z } from "zod";
import { getAccount } from "@/lib/dao";
import type { AccountDto } from "@/lib/dto";
import { fail, failUnexpected, ok } from "@/lib/http";
import { rateLimit, tooMany } from "@/lib/ratelimit";
import { RpcError } from "@/lib/rpc";

export const dynamic = "force-dynamic";

const addressSchema = z.string().regex(/^rete[0-9a-f]{68}$/);
const proposalSchema = z.coerce.number().int().min(1).max(1_000_000_000);

/**
 * One browser-supplied value reaches the node here: an address. It is checked
 * for shape (and the client checks the checksum before it asks), never trusted
 * as a path fragment, and only ever used as an argument to the four allowlisted
 * address reads.
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

  const rawProposal = url.searchParams.get("proposal");
  const proposal = rawProposal === null ? null : proposalSchema.safeParse(rawProposal);

  if (proposal !== null && !proposal.success) {
    return fail(
      new RpcError("refused", '"proposal" must be a positive whole number.', {
        retryable: false,
      }),
    );
  }

  try {
    const account = await getAccount(address.data, proposal === null ? undefined : proposal.data);

    const body: AccountDto = {
      address: account.address,
      stakedAtomic: account.stakedAtomic.toString(),
      powerAtomic: account.powerAtomic.toString(),
      delegate: account.delegate,
      lockMs: account.lockMs,
      vote: account.vote,
      proposalId: proposal === null ? null : proposal.data,
    };

    return ok(body);
  } catch (error) {
    return failUnexpected(error);
  }
}
