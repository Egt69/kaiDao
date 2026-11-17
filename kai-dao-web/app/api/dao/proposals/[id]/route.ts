import type { NextRequest } from "next/server";
import { z } from "zod";
import { getProposalDetail } from "@/lib/dao";
import { toProposalDto, type ProposalDetailDto } from "@/lib/dto";
import { fail, failUnexpected, ok } from "@/lib/http";
import { rateLimit, tooMany } from "@/lib/ratelimit";
import { RpcError } from "@/lib/rpc";

export const dynamic = "force-dynamic";

const idSchema = z.coerce.number().int().min(1).max(1_000_000_000);

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const limit = rateLimit(request);
  if (!limit.allowed) return tooMany(limit.retryAfter);

  const { id } = await context.params;
  const parsed = idSchema.safeParse(id);

  if (!parsed.success) {
    return fail(
      new RpcError("refused", "Proposal id must be a positive whole number.", {
        retryable: false,
      }),
    );
  }

  try {
    const detail = await getProposalDetail(parsed.data);

    const body: ProposalDetailDto = {
      proposal: toProposalDto(detail.proposal),
      description: detail.description,
      voters: detail.voters.map((voter) => ({
        voter: voter.voter,
        choice: voter.choice,
        weightAtomic: voter.weightAtomic.toString(),
      })),
      votersComplete: detail.votersComplete,
    };

    return ok(body);
  } catch (error) {
    return failUnexpected(error);
  }
}
