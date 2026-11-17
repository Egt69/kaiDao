import type { NextRequest } from "next/server";
import { z } from "zod";
import { getEvents } from "@/lib/dao";
import { parseEventData, type DaoEvent } from "@/lib/contract";
import { toEventDto } from "@/lib/dto";
import { fail, failUnexpected, ok } from "@/lib/http";
import { rateLimit, tooMany } from "@/lib/ratelimit";
import { RpcError } from "@/lib/rpc";

export const dynamic = "force-dynamic";

const countSchema = z.coerce.number().int().min(1).max(100);
const cursorSchema = z.string().regex(/^[0-9-]{1,40}$/);
const typeSchema = z
  .string()
  .regex(/^[a-z_]{1,40}$/)
  .optional();

export async function GET(request: NextRequest) {
  const limit = rateLimit(request);
  if (!limit.allowed) return tooMany(limit.retryAfter);

  const url = new URL(request.url);

  const after = cursorSchema.safeParse(url.searchParams.get("after") ?? "0");
  const count = countSchema.safeParse(url.searchParams.get("limit") ?? "25");
  const type = typeSchema.safeParse(url.searchParams.get("type") ?? undefined);

  if (!after.success || !count.success || !type.success) {
    return fail(
      new RpcError("refused", "Bad event cursor, limit or type.", {
        retryable: false,
      }),
    );
  }

  try {
    const page = await getEvents(after.data, count.data, type.data);

    return ok({
      events: page.events.map((event) => {
        let parsed: DaoEvent;
        try {
          parsed = parseEventData(event.event_type, event.data);
        } catch {
          parsed = { type: "unknown", eventType: event.event_type, raw: event.data };
        }
        return toEventDto({ ...event, parsed });
      }),
      next: page.next ?? null,
      more: page.more,
    });
  } catch (error) {
    return failUnexpected(error);
  }
}
