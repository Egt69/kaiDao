"use client";

import Link from "next/link";
import { useState } from "react";
import { AddressChip } from "@/components/address-chip";
import { Amount } from "@/components/amount";
import { Countdown } from "@/components/countdown";
import { StatusBadge } from "@/components/status-badge";
import { TxDialog, type TxIntent } from "@/components/tx-dialog";
import { VoteButtons } from "@/components/vote-buttons";
import { useWallet } from "@/components/wallet-provider";
import { Failure, LinkButton, Loading, Notice, Panel } from "@/components/ui";
import { overviewDtoSchema, proposalListDtoSchema, votesDtoSchema } from "@/lib/api-schemas";
import { formatRtm } from "@/lib/amount";
import type { VoteChoice } from "@/lib/contract";
import type { ProposalDto } from "@/lib/dto";
import { safeUrl } from "@/lib/safe-url";
import { useApi } from "@/lib/use-api";
import { useNow } from "@/lib/use-now";

type Choice = VoteChoice;

export default function ProposalsPage() {
  const { address, state, connect } = useWallet();
  const connected = state.status === "connected" && address !== null;
  const now = useNow(10_000);

  const overview = useApi("/api/dao/overview", overviewDtoSchema, { intervalMs: 15_000 });
  const proposals = useApi("/api/dao/proposals?limit=50", proposalListDtoSchema, {
    intervalMs: 8_000,
  });
  const voter = useApi(
    address ? `/api/dao/votes?address=${encodeURIComponent(address)}` : "/api/dao/overview",
    votesDtoSchema,
    { enabled: connected, intervalMs: 8_000 },
  );

  const [intent, setIntent] = useState<TxIntent | null>(null);

  const config = overview.data?.config ?? null;
  const power = voter.data ? BigInt(voter.data.powerAtomic) : null;
  const votedOn = new Map((voter.data?.votes ?? []).map((vote) => [vote.id, vote.choice]));

  function voteIntent(proposal: ProposalDto, choice: Choice) {
    setIntent({
      title: `Vote ${choice} on proposal #${proposal.id}`,
      method: "vote",
      args: [String(proposal.id), choice],
      codeHashMatches: overview.data?.codeHashMatches,
      rows: [
        { label: "Proposal", value: `#${proposal.id}` },
        { label: "Your vote", value: choice },
        { label: "Voting power", value: <Amount atomic={voter.data?.powerAtomic ?? "0"} exact /> },
        {
          label: "Effect",
          value: "your stake stays locked until this vote ends",
        },
      ],
      warning:
        "A vote is final. It cannot be changed or withdrawn, and the stake behind it is locked until the deadline.",
    });
  }

  function voteArea(proposal: ProposalDto) {
    const voted = votedOn.get(proposal.id);

    if (voted) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-300">
          You voted
          <span
            className={
              voted === "yes"
                ? "font-semibold text-emerald-300"
                : voted === "no"
                  ? "font-semibold text-red-300"
                  : "font-semibold text-zinc-200"
            }
          >
            {voted}
          </span>
        </span>
      );
    }

    if (proposal.status !== "active") return null;

    if (now >= proposal.votingEnds) {
      return <span className="text-xs text-zinc-500">Voting ended — finalize it</span>;
    }

    if (!connected) {
      return (
        <div className="flex flex-wrap items-center gap-2">
          <VoteButtons size="sm" disabled onVote={() => undefined} />
          <button
            type="button"
            onClick={() => void connect()}
            className="text-xs font-medium text-kai transition-colors hover:text-kai-soft"
          >
            Connect to vote
          </button>
        </div>
      );
    }

    if (power === null) {
      return (
        <div className="flex flex-wrap items-center gap-2">
          <VoteButtons size="sm" disabled onVote={() => undefined} />
          <span className="text-xs text-zinc-600">Reading your power…</span>
        </div>
      );
    }

    if (power === 0n) {
      return (
        <div className="flex flex-wrap items-center gap-2">
          <VoteButtons size="sm" disabled onVote={() => undefined} />
          <Link
            href="/stake"
            className="text-xs font-medium text-kai transition-colors hover:text-kai-soft"
          >
            Stake to vote →
          </Link>
        </div>
      );
    }

    return <VoteButtons size="sm" onVote={(choice) => voteIntent(proposal, choice)} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Proposals</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Vote with your stake. One vote per proposal, final and public.
          </p>
        </div>
        <LinkButton href="/proposals/new">New proposal</LinkButton>
      </div>

      {connected && power === 0n ? (
        <Notice tone="accent">
          Your wallet has no voting power yet.{" "}
          <Link href="/stake" className="font-semibold text-kai underline decoration-kai/40">
            Stake RTM
          </Link>{" "}
          to vote.
        </Notice>
      ) : null}

      {proposals.loading && !proposals.data ? <Loading what="proposals" /> : null}

      {proposals.failure && !proposals.data ? (
        <Failure
          message={proposals.failure.message}
          hint={proposals.failure.retryable ? "Retrying automatically." : undefined}
        />
      ) : null}

      {proposals.data ? (
        proposals.data.proposals.length === 0 ? (
          <Panel title="No proposals yet">
            <p className="text-sm text-zinc-400">
              Anyone with enough voting power can open the first one.
            </p>
          </Panel>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {proposals.data.proposals.map((proposal) => {
              const participation =
                BigInt(proposal.yesAtomic) +
                BigInt(proposal.noAtomic) +
                BigInt(proposal.abstainAtomic);
              const quorum = BigInt(proposal.quorumAtomic);
              const percent =
                quorum === 0n
                  ? 100
                  : Math.min(100, Number((participation * 10_000n) / quorum) / 100);
              const quorumMet = quorum === 0n || participation >= quorum;

              return (
                <article
                  key={proposal.id}
                  className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.02] p-5 transition-colors hover:border-white/15"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-zinc-500">#{proposal.id}</span>
                      <StatusBadge status={proposal.status} />
                    </div>
                    <span className="text-xs text-zinc-500">
                      {proposal.status === "active" ? (
                        <Countdown
                          deadline={proposal.votingEnds}
                          prefix="ends"
                          showAbsolute={false}
                        />
                      ) : proposal.status === "queued" ? (
                        <Countdown
                          deadline={proposal.timelockEnds}
                          prefix="unlocks"
                          showAbsolute={false}
                        />
                      ) : (
                        <span className="text-zinc-600">final</span>
                      )}
                    </span>
                  </div>

                  <div className="mt-4">
                    <p className="text-3xl font-semibold tracking-tight text-zinc-50">
                      {formatRtm(proposal.amountAtomic)}
                      <span className="ml-1.5 text-sm font-normal text-zinc-500">RTM</span>
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-zinc-400">
                      to <AddressChip address={proposal.recipient} short />
                    </p>
                  </div>

                  <div className="mt-5">
                    <div className="flex items-center justify-between text-[11px] text-zinc-500">
                      <span>
                        {quorumMet ? "Quorum met" : "Quorum"} · {formatRtm(participation)} /{" "}
                        {formatRtm(proposal.quorumAtomic)} RTM
                      </span>
                      <span className="tabular-nums">{percent.toFixed(0)}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className={`h-full rounded-full transition-all ${quorumMet ? "bg-emerald-400" : "bg-kai"}`}
                        style={{ width: `${Math.max(percent, 1)}%` }}
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
                      <span>
                        Yes{" "}
                        <span className="font-medium text-emerald-300">
                          {formatRtm(proposal.yesAtomic)}
                        </span>
                      </span>
                      <span>
                        No{" "}
                        <span className="font-medium text-red-300">
                          {formatRtm(proposal.noAtomic)}
                        </span>
                      </span>
                      <span>
                        Abstain{" "}
                        <span className="font-medium text-zinc-300">
                          {formatRtm(proposal.abstainAtomic)}
                        </span>
                      </span>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
                    {voteArea(proposal)}
                    <Link
                      href={safeUrl(`/proposals/${proposal.id}`)}
                      className="text-xs text-zinc-400 transition-colors hover:text-kai"
                    >
                      Details →
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )
      ) : null}

      {config && proposals.data && proposals.data.truncated ? (
        <p className="text-xs text-zinc-600">
          Showing the newest {proposals.data.shown} of {proposals.data.total} proposals.
        </p>
      ) : null}

      <TxDialog
        intent={intent}
        onClose={() => setIntent(null)}
        onSettled={() => {
          setIntent(null);
          void proposals.refresh();
          void voter.refresh();
          void overview.refresh();
        }}
      />
    </div>
  );
}
