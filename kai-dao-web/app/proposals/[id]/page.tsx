"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { AddressChip } from "@/components/address-chip";
import { Amount } from "@/components/amount";
import { Countdown } from "@/components/countdown";
import { StatusBadge } from "@/components/status-badge";
import { TxDialog, type TxIntent } from "@/components/tx-dialog";
import { VoteButtons } from "@/components/vote-buttons";
import { useWallet } from "@/components/wallet-provider";
import { Failure, LinkButton, Loading, Notice, Panel } from "@/components/ui";
import { accountDtoSchema, overviewDtoSchema, proposalDetailDtoSchema } from "@/lib/api-schemas";
import { formatRtm } from "@/lib/amount";
import type { VoteChoice } from "@/lib/contract";
import { useApi } from "@/lib/use-api";
import { useNow } from "@/lib/use-now";

export default function ProposalPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);
  const validId = Number.isSafeInteger(id) && id > 0;

  const { address, state, connect } = useWallet();
  const now = useNow(10_000);

  const detail = useApi(
    validId ? `/api/dao/proposals/${id}` : "/api/dao/proposals/1",
    proposalDetailDtoSchema,
    { intervalMs: 6_000, enabled: validId },
  );
  const overview = useApi("/api/dao/overview", overviewDtoSchema, { intervalMs: 15_000 });
  const account = useApi(
    address && validId
      ? `/api/dao/account?address=${encodeURIComponent(address)}&proposal=${id}`
      : "/api/dao/overview",
    accountDtoSchema,
    { enabled: address !== null && validId, intervalMs: 8_000 },
  );

  const [intent, setIntent] = useState<TxIntent | null>(null);

  if (!validId) return <Failure message="That is not a proposal id." />;
  if (detail.loading && !detail.data) return <Loading what="the proposal" />;
  if (!detail.data) {
    return (
      <Failure
        message={detail.failure?.message ?? "This proposal could not be loaded."}
        hint={detail.failure?.retryable ? "Retrying automatically." : undefined}
      />
    );
  }

  const { proposal, description, voters, votersComplete } = detail.data;
  const connected = state.status === "connected" && address !== null;
  const mine = account.data;

  const amount = BigInt(proposal.amountAtomic);
  const deposit = BigInt(proposal.depositAtomic);
  const treasury = overview.data?.config ? BigInt(overview.data.config.treasuryAtomic) : null;

  const participation =
    BigInt(proposal.yesAtomic) + BigInt(proposal.noAtomic) + BigInt(proposal.abstainAtomic);
  const quorum = BigInt(proposal.quorumAtomic);
  const quorumMet = participation >= quorum;
  const percent =
    quorum === 0n ? 100 : Math.min(100, Number((participation * 10_000n) / quorum) / 100);

  const votingOpen = proposal.status === "active" && now < proposal.votingEnds;
  const votingClosed = proposal.status === "active" && now >= proposal.votingEnds;
  const power = mine ? BigInt(mine.powerAtomic) : null;
  const inWindow =
    proposal.status === "queued" && now >= proposal.timelockEnds && now <= proposal.graceEnds;
  const windowClosed = proposal.status === "queued" && now > proposal.graceEnds;
  const canExecute = inWindow && treasury !== null && treasury >= amount + deposit;
  const canFinalize = votingClosed;
  const canCancel =
    connected &&
    address === proposal.proposer &&
    proposal.status === "active" &&
    now < proposal.votingEnds;

  const codeHashMatches = overview.data?.codeHashMatches;

  function openIntent(next: Omit<TxIntent, "codeHashMatches">) {
    setIntent({ ...next, codeHashMatches });
  }

  function openVote(choice: VoteChoice) {
    openIntent({
      title: `Vote ${choice} on proposal #${proposal.id}`,
      method: "vote",
      args: [String(proposal.id), choice],
      rows: [
        { label: "Proposal", value: `#${proposal.id}` },
        { label: "Your vote", value: choice },
        { label: "Voting power", value: <Amount atomic={mine?.powerAtomic ?? "0"} exact /> },
        { label: "Locks until", value: new Date(proposal.votingEnds).toLocaleString() },
      ],
      warning:
        "A vote is final. Your stake stays locked until voting ends and cannot be moved before then.",
    });
  }

  const showActions = canFinalize || inWindow || windowClosed || canCancel;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Link href="/proposals" className="text-xs text-zinc-500 transition-colors hover:text-kai">
          ← Proposals
        </Link>
        <StatusBadge status={proposal.status} />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Proposal #{proposal.id}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-zinc-400">
            by <AddressChip address={proposal.proposer} short />
          </p>
        </div>
        <p className="text-3xl font-semibold tracking-tight text-zinc-50">
          {formatRtm(proposal.amountAtomic)}
          <span className="ml-1.5 text-sm font-normal text-zinc-500">RTM</span>
        </p>
      </div>

      {codeHashMatches === false ? (
        <Notice tone="danger">
          This contract&apos;s code hash is not the one this app was built for. Do not sign anything
          until you know why.
        </Notice>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          <Panel title="Payment">
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs uppercase tracking-wide text-zinc-500">Amount</span>
                <Amount atomic={proposal.amountAtomic} exact />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs uppercase tracking-wide text-zinc-500">Recipient</span>
                <AddressChip address={proposal.recipient} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs uppercase tracking-wide text-zinc-500">Deposit</span>
                <span>
                  <Amount atomic={proposal.depositAtomic} exact />{" "}
                  <span className="text-xs text-zinc-500">refunded on execution</span>
                </span>
              </div>
              {description !== "" ? (
                <div className="rounded-xl border border-white/[0.06] bg-black/40 px-3 py-2.5 text-zinc-200">
                  <span className="break-words">{description}</span>
                </div>
              ) : null}
            </div>
          </Panel>

          <Panel title="Votes">
            <div className="grid grid-cols-3 gap-2">
              <Tally label="Yes" atomic={proposal.yesAtomic} tone="yes" />
              <Tally label="No" atomic={proposal.noAtomic} tone="no" />
              <Tally label="Abstain" atomic={proposal.abstainAtomic} tone="neutral" />
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>
                  {formatRtm(participation)} / {formatRtm(proposal.quorumAtomic)} RTM quorum
                </span>
                <span className={quorumMet ? "text-emerald-300" : "text-zinc-400"}>
                  {percent.toFixed(0)}%
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className={`h-full rounded-full transition-all ${quorumMet ? "bg-emerald-400" : "bg-kai"}`}
                  style={{ width: `${Math.max(percent, 1)}%` }}
                />
              </div>
            </div>

            <div className="mt-4">
              {voters.length === 0 ? (
                <p className="text-sm text-zinc-500">No votes yet.</p>
              ) : (
                <ul className="divide-y divide-white/[0.06]">
                  {voters.map((voter) => (
                    <li
                      key={`${voter.voter}-${voter.weightAtomic}`}
                      className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                    >
                      <AddressChip address={voter.voter} short copy={false} />
                      <span className="flex items-center gap-3 text-xs">
                        <span
                          className={
                            voter.choice === "yes"
                              ? "text-emerald-300"
                              : voter.choice === "no"
                                ? "text-red-300"
                                : "text-zinc-400"
                          }
                        >
                          {voter.choice}
                        </span>
                        <Amount atomic={voter.weightAtomic} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {!votersComplete ? (
                <p className="mt-2 text-[11px] text-amber-300">
                  Older voters may be missing: the event log was longer than one read.
                </p>
              ) : null}
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Your vote">
            {!connected ? (
              <div className="space-y-3">
                <VoteButtons disabled onVote={() => undefined} />
                <button
                  type="button"
                  onClick={() => void connect()}
                  className="rounded-full bg-kai px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-kai-soft"
                >
                  Connect wallet to vote
                </button>
              </div>
            ) : power === null ? (
              <div className="space-y-3">
                <VoteButtons disabled onVote={() => undefined} />
                <p className="text-sm text-zinc-500">Reading your voting power…</p>
              </div>
            ) : mine?.vote ? (
              <div className="space-y-1">
                <p className="text-sm text-zinc-300">
                  You voted{" "}
                  <span
                    className={
                      mine.vote === "yes"
                        ? "font-semibold text-emerald-300"
                        : mine.vote === "no"
                          ? "font-semibold text-red-300"
                          : "font-semibold text-zinc-100"
                    }
                  >
                    {mine.vote}
                  </span>
                </p>
                <p className="text-xs text-zinc-500">
                  One vote per proposal. It cannot be changed.
                </p>
              </div>
            ) : !votingOpen ? (
              <p className="text-sm text-zinc-400">
                {proposal.status === "active"
                  ? "Voting has ended. Finalize it below."
                  : "Voting is closed for this proposal."}
              </p>
            ) : power === 0n ? (
              <div className="space-y-3">
                <VoteButtons disabled onVote={() => undefined} />
                <p className="text-sm text-zinc-400">You need stake to vote.</p>
                <LinkButton href="/stake" variant="primary">
                  Stake RTM
                </LinkButton>
              </div>
            ) : (
              <div className="space-y-3">
                <VoteButtons onVote={openVote} />
                <p className="text-sm text-zinc-400">
                  Your power: <Amount atomic={mine?.powerAtomic ?? "0"} exact />
                </p>
                <p className="text-xs text-zinc-600">
                  Your stake locks until {new Date(proposal.votingEnds).toLocaleString()}.
                </p>
              </div>
            )}
          </Panel>

          <Panel title="Timeline">
            <div className="space-y-2.5 text-sm">
              <Row label="Voting ends">
                <Countdown deadline={proposal.votingEnds} />
              </Row>
              <Row label="Executable">
                {proposal.timelockEnds === 0 ? (
                  <span className="text-xs text-zinc-600">after it is queued</span>
                ) : (
                  <Countdown deadline={proposal.timelockEnds} />
                )}
              </Row>
              <Row label="Window closes">
                {proposal.graceEnds === 0 ? (
                  <span className="text-xs text-zinc-600">after it is queued</span>
                ) : (
                  <Countdown deadline={proposal.graceEnds} />
                )}
              </Row>
            </div>
          </Panel>

          {showActions ? (
            <Panel title="Actions">
              <div className="flex flex-col gap-2">
                {canFinalize ? (
                  <ActionButton
                    label="Finalize result"
                    hint="Tally now; queues it or defeats it."
                    onClick={() =>
                      openIntent({
                        title: `Finalize proposal #${proposal.id}`,
                        method: "finalize",
                        args: [String(proposal.id)],
                        rows: [
                          {
                            label: "Participation",
                            value: `${formatRtm(participation.toString())} RTM`,
                          },
                          { label: "Quorum", value: `${formatRtm(proposal.quorumAtomic)} RTM` },
                          {
                            label: "Outcome now",
                            value:
                              quorumMet && BigInt(proposal.yesAtomic) > BigInt(proposal.noAtomic)
                                ? "queued"
                                : "defeated",
                          },
                        ],
                      })
                    }
                  />
                ) : null}

                {inWindow ? (
                  <ActionButton
                    label="Execute payment"
                    hint={
                      canExecute
                        ? `Pays ${formatRtm(proposal.amountAtomic)} RTM to the recipient.`
                        : `Treasury needs ${formatRtm((amount + deposit).toString())} RTM.`
                    }
                    variant="primary"
                    disabled={!canExecute}
                    onClick={() =>
                      openIntent({
                        title: `Execute proposal #${proposal.id}`,
                        method: "execute",
                        args: [String(proposal.id)],
                        rows: [
                          { label: "Pays", value: <Amount atomic={proposal.amountAtomic} exact /> },
                          { label: "To", value: <AddressChip address={proposal.recipient} /> },
                          {
                            label: "Deposit refund",
                            value: <Amount atomic={proposal.depositAtomic} exact />,
                          },
                        ],
                        warning: "This moves RTM out of the treasury. It cannot be undone.",
                      })
                    }
                  />
                ) : null}

                {windowClosed ? (
                  <ActionButton
                    label="Mark expired"
                    hint="Execution window closed; no RTM moves."
                    onClick={() =>
                      openIntent({
                        title: `Expire proposal #${proposal.id}`,
                        method: "expire",
                        args: [String(proposal.id)],
                        rows: [
                          { label: "Status", value: proposal.status },
                          { label: "New status", value: "expired" },
                        ],
                      })
                    }
                  />
                ) : null}

                {canCancel ? (
                  <ActionButton
                    label="Cancel proposal"
                    hint="Only you, as proposer, before voting ends."
                    variant="ghost"
                    onClick={() =>
                      openIntent({
                        title: `Cancel proposal #${proposal.id}`,
                        method: "cancel",
                        args: [String(proposal.id)],
                        rows: [
                          { label: "New status", value: "cancelled" },
                          {
                            label: "Deposit",
                            value: `${formatRtm(proposal.depositAtomic)} RTM stays in the treasury`,
                          },
                        ],
                      })
                    }
                  />
                ) : null}
              </div>

              {proposal.status === "queued" && !inWindow && !windowClosed ? (
                <p className="mt-3 text-xs text-zinc-500">
                  Timelock running. Execution opens{" "}
                  {new Date(proposal.timelockEnds).toLocaleString()}.
                </p>
              ) : null}
            </Panel>
          ) : null}
        </div>
      </div>

      <p className="text-xs text-zinc-600">
        Gas is charged even if the contract refuses. It settles only at HardFinal with result ok.
      </p>

      <TxDialog
        intent={intent}
        onClose={() => setIntent(null)}
        onSettled={() => {
          setIntent(null);
          void detail.refresh();
          void overview.refresh();
          void account.refresh();
        }}
      />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="text-xs text-zinc-300">{children}</span>
    </div>
  );
}

function ActionButton({
  label,
  hint,
  onClick,
  variant = "secondary",
  disabled = false,
}: {
  label: string;
  hint: string;
  onClick: () => void;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
}) {
  const styles =
    variant === "primary"
      ? "bg-kai text-black hover:bg-kai-soft"
      : variant === "ghost"
        ? "border border-white/10 text-zinc-400 hover:text-white"
        : "border border-white/10 bg-white/[0.04] text-zinc-200 hover:border-white/20";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl px-4 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${styles}`}
    >
      <span className="block text-sm font-semibold">{label}</span>
      <span
        className={`mt-0.5 block text-[11px] ${variant === "primary" ? "text-black/70" : "text-zinc-500"}`}
      >
        {hint}
      </span>
    </button>
  );
}

function Tally({
  label,
  atomic,
  tone,
}: {
  label: string;
  atomic: string;
  tone: "yes" | "no" | "neutral";
}) {
  const color =
    tone === "yes" ? "text-emerald-300" : tone === "no" ? "text-red-300" : "text-zinc-300";

  return (
    <div className="rounded-xl border border-white/[0.08] bg-black/40 px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mono mt-0.5 text-sm tabular-nums ${color}`}>
        {formatRtm(atomic)}
        <span className="ml-1 text-[11px] font-normal text-zinc-500">RTM</span>
      </p>
    </div>
  );
}
