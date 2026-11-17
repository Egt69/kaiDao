import type { NextRequest } from "next/server";
import { getOverview } from "@/lib/dao";
import { toConfigDto, toContractDto, type OverviewDto } from "@/lib/dto";
import { fail, failUnexpected, ok } from "@/lib/http";
import { rateLimit, tooMany } from "@/lib/ratelimit";
import { RpcError } from "@/lib/rpc";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const limit = rateLimit(request);
  if (!limit.allowed) return tooMany(limit.retryAfter);

  try {
    const overview = await getOverview();

    const body: OverviewDto = {
      health: overview.health,
      contract: toContractDto(overview.contract),
      config: overview.config ? toConfigDto(overview.config) : null,
      codeHashMatches: overview.codeHashMatches,
      configProblem: overview.configProblem,
    };

    return ok(body);
  } catch (error) {
    if (error instanceof RpcError) return fail(error);
    return failUnexpected(error);
  }
}
