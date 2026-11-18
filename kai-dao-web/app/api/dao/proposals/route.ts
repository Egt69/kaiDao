import type { NextRequest } from "next/server";
import { z } from "zod";
import { listProposals } from "@/lib/dao";
import { toProposalDto, type ProposalListDto } from "@/lib/dto";
import { fail, failUnexpected, ok } from "@/lib/http";
import { rateLimit, tooMany } from "@/lib/ratelimit";
import { RpcError } from "@/lib/rpc";

export const dynamic = "force-dynamic";

const limitSchema = z.coerce.number().int().min(1).max(100);

export async function GET(request: NextRequest) {
  const limit = rateLimit(request);
  if (!limit.allowed) return tooMany(limit.retryAfter);

  const url = new URL(request.url);
  const raw = url.searchParams.get("limit") ?? "50";
  const parsed = limitSchema.safeParse(raw);

  if (!parsed.success) {
    return fail(
      new RpcError("refused", '"limit" must be a whole number from 1 to 100.', {
        retryable: false,
      }),
    );
  }

  try {
    const withDescriptions = url.searchParams.get("details") === "1";
    const result = await listProposals(parsed.data, withDescriptions);

    const body: ProposalListDto = {
      proposals: result.proposals.map(toProposalDto),
      total: result.total,
      shown: result.shown,
      truncated: result.truncated,
    };

    return ok(body);
  } catch (error) {
    return failUnexpected(error);
  }
}
