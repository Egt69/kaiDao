"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AddressChip } from "@/components/address-chip";
import { Amount } from "@/components/amount";
import { Failure, Loading, Panel } from "@/components/ui";
import { eventPageDtoSchema } from "@/lib/api-schemas";
import { apiGet, type ApiFailure } from "@/lib/api-client";
import { formatRtm } from "@/lib/amount";
import type { EventDto } from "@/lib/dto";
import { safeUrl } from "@/lib/safe-url";

export default function ActivityPage() {
  const [events, setEvents] = useState<EventDto[]>([]);
  const [cursor, setCursor] = useState<string | null>("0");
  const [more, setMore] = useState(true);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [loading, setLoading] = useState(true);
  const busy = useRef(false);

  const load = useCallback(async (after: string) => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    if (after === "0") setEvents([]);

    const result = await apiGet(
      `/api/dao/events?after=${encodeURIComponent(after)}&limit=25`,
      eventPageDtoSchema,
    );

    if (result.ok) {
      setEvents((current) =>
        after === "0" ? result.data.events : [...current, ...result.data.events],
      );
      setCursor(result.data.next);
      setMore(result.data.more && result.data.next !== null);
      setFailure(null);
    } else {
      setFailure(result.failure);
    }

    setLoading(false);
    busy.current = false;
  }, []);

  useEffect(() => {
    void load("0");
  }, [load]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Activity</h1>
        <p className="mt-1 text-sm text-zinc-400">Everything the contract has done.</p>
      </div>

      {failure && events.length === 0 ? (
        <Failure
          message={failure.message}
          hint={failure.retryable ? "This page keeps retrying when you ask again." : undefined}
        />
      ) : null}

      <Panel
        title="Events"
        actions={
          <button
            type="button"
            onClick={() => void load("0")}
            className="rounded-full border border-white/10 px-3 py-1 text-[11px] text-zinc-400 transition-colors hover:border-white/20 hover:text-zinc-100"
          >
            Reload
          </button>
        }
      >
        {events.length === 0 && loading ? <Loading what="events" /> : null}

        {events.length === 0 && !loading ? (
          <p className="text-sm text-zinc-400">No events yet.</p>
        ) : (
          <ol className="divide-y divide-white/[0.06]">
            {events.map((event) => (
              <li
                key={`${event.txId}-${event.eventIdx}-${event.eventType}`}
                className="flex flex-wrap items-start justify-between gap-2 py-2.5 text-sm"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-zinc-200">{describe(event)}</span>
                  {event.txId ? (
                    <span className="mono break-all text-[11px] text-zinc-700">{event.txId}</span>
                  ) : null}
                </div>
                {event.timestamp ? (
                  <time
                    className="text-xs text-zinc-600"
                    dateTime={new Date(event.timestamp).toISOString()}
                  >
                    {new Date(event.timestamp).toLocaleString()}
                  </time>
                ) : null}
              </li>
            ))}
          </ol>
        )}

        <div className="mt-4 flex items-center gap-3">
          {more ? (
            <button
              type="button"
              disabled={loading || cursor === null}
              onClick={() => cursor && void load(cursor)}
              className="rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs text-zinc-200 transition-colors hover:border-white/20 disabled:opacity-40"
            >
              {loading ? "Loading…" : "Load older"}
            </button>
          ) : (
            <span className="text-xs text-zinc-600">End of the log.</span>
          )}
          {failure && events.length > 0 ? (
            <span className="text-xs text-red-300">{failure.message}</span>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}

function describe(event: EventDto): React.ReactNode {
  const data = event.data;

  switch (data.type) {
    case "dao_initialized":
      return (
        <>
          <span className="text-kai">DAO initialized</span> by{" "}
          <AddressChip address={data.owner} short copy={false} /> — min stake{" "}
          <Amount atomic={data.minStakeAtomic} suffix={false} /> RTM, threshold{" "}
          <Amount atomic={data.proposeThresholdAtomic} suffix={false} /> RTM, quorum{" "}
          {data.quorumBps / 100}%, voting {duration(data.votingPeriodMs)}, timelock{" "}
          {duration(data.timelockMs)}, grace {duration(data.graceMs)}
        </>
      );
    case "treasury_deposit":
      return (
        <>
          <span className="text-emerald-300">Treasury deposit</span>{" "}
          <Amount atomic={data.amountAtomic} exact /> from{" "}
          <AddressChip address={data.from} short copy={false} />
        </>
      );
    case "staked":
      return (
        <>
          <span className="text-kai">Staked</span> <Amount atomic={data.amountAtomic} exact /> by{" "}
          <AddressChip address={data.staker} short copy={false} />, power to{" "}
          <AddressChip address={data.powerTo} short copy={false} />
        </>
      );
    case "unstaked":
      return (
        <>
          <span className="text-zinc-300">Unstaked</span>{" "}
          <Amount atomic={data.amountAtomic} exact /> by{" "}
          <AddressChip address={data.staker} short copy={false} />
        </>
      );
    case "delegated":
      return (
        <>
          <span className="text-zinc-300">Delegated</span>{" "}
          <Amount atomic={data.amountAtomic} exact /> from{" "}
          <AddressChip address={data.delegator} short copy={false} /> to{" "}
          <AddressChip address={data.to} short copy={false} />
          {data.oldDelegate === "" ? null : (
            <>
              {" "}
              (was <AddressChip address={data.oldDelegate} short copy={false} />)
            </>
          )}
        </>
      );
    case "proposal_created":
      return (
        <>
          Proposal{" "}
          <Link href={safeUrl(`/proposals/${data.id}`)} className="text-kai hover:text-kai-soft">
            #{data.id}
          </Link>{" "}
          opened for <Amount atomic={data.amountAtomic} exact /> to{" "}
          <AddressChip address={data.recipient} short copy={false} /> — “{data.description}”
        </>
      );
    case "vote_cast":
      return (
        <>
          Vote <span className="text-zinc-300">{data.choice}</span> with{" "}
          <Amount atomic={data.weightAtomic} exact /> on proposal{" "}
          <Link href={safeUrl(`/proposals/${data.id}`)} className="text-kai hover:text-kai-soft">
            #{data.id}
          </Link>{" "}
          by <AddressChip address={data.voter} short copy={false} />
        </>
      );
    case "proposal_queued":
      return (
        <>
          Proposal{" "}
          <Link href={safeUrl(`/proposals/${data.id}`)} className="text-kai hover:text-kai-soft">
            #{data.id}
          </Link>{" "}
          queued: yes {formatRtm(data.yesAtomic)} RTM / no {formatRtm(data.noAtomic)} RTM / abstain{" "}
          {formatRtm(data.abstainAtomic)} RTM
        </>
      );
    case "proposal_defeated":
      return (
        <>
          Proposal {data.id} defeated ({data.reason === "quorum" ? "no quorum" : "votes"})
        </>
      );
    case "proposal_executed":
      return (
        <>
          Proposal{" "}
          <Link href={safeUrl(`/proposals/${data.id}`)} className="text-kai hover:text-kai-soft">
            #{data.id}
          </Link>{" "}
          executed: <Amount atomic={data.amountAtomic} exact /> to{" "}
          <AddressChip address={data.recipient} short copy={false} />
        </>
      );
    case "proposal_cancelled":
      return (
        <>
          Proposal {data.id} cancelled by <AddressChip address={data.proposer} short copy={false} />
        </>
      );
    case "proposal_expired":
      return <>Proposal {data.id} expired after its window</>;
    case "skimmed":
      return (
        <>
          <span className="text-zinc-300">Skimmed</span> <Amount atomic={data.amountAtomic} exact />{" "}
          of stray RTM into the treasury
        </>
      );
    default:
      return <>Unknown event {data.type === "unknown" ? data.eventType : event.eventType}</>;
  }
}

function duration(ms: number): string {
  if (ms === 0) return "none";
  if (ms % 86_400_000 === 0) {
    const d = ms / 86_400_000;
    return `${d} day${d === 1 ? "" : "s"}`;
  }
  if (ms % 3_600_000 === 0) {
    const h = ms / 3_600_000;
    return `${h} hour${h === 1 ? "" : "s"}`;
  }
  return `${Math.round(ms / 60_000)} minutes`;
}
