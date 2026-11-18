"use client";

import Link from "next/link";
import { AddressChip } from "@/components/address-chip";
import { Amount } from "@/components/amount";
import { Countdown } from "@/components/countdown";
import { StatusBadge } from "@/components/status-badge";
import { useWallet } from "@/components/wallet-provider";
import { Failure, LinkButton, Loading, Notice, Panel, Stat } from "@/components/ui";
import { accountDtoSchema, overviewDtoSchema, proposalListDtoSchema } from "@/lib/api-schemas";
import { formatRtm } from "@/lib/amount";
import { safeUrl } from "@/lib/safe-url";
import { useApi } from "@/lib/use-api";

export default function DashboardPage() {
  const { address, state, connect } = useWallet();
  const connected = state.status === "connected" && address !== null;

  const overview = useApi("/api/dao/overview", overviewDtoSchema);
  const proposals = useApi("/api/dao/proposals?limit=4&details=1", proposalListDtoSchema, {
    intervalMs: 8_000,
  });
  const account = useApi(
    address ? `/api/dao/account?address=${encodeURIComponent(address)}` : "/api/dao/overview",
    accountDtoSchema,
    { enabled: connected, intervalMs: 8_000 },
  );

  if (overview.loading && !overview.data) return <Loading what="KaiDAO" />;
  if (!overview.data) {
    return (
      <Failure
        message={overview.failure?.message ?? "This app could not read the DAO."}
        hint={
          overview.failure?.retryable
            ? "The node is busy. This page keeps retrying on its own."
            : undefined
        }
      />
    );
  }

  const { config, codeHashMatches, configProblem } = overview.data;
  const mine = account.data;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-transparent p-6 sm:p-8">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-kai">
          Stake-weighted DAO
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">KaiDAO</h1>
        <p className="mt-2 max-w-md text-sm text-zinc-400">
          Stake RTM to vote. Passed proposals pay from the treasury.
        </p>
        <div className="mt-5 flex flex-wrap gap-2.5">
          <LinkButton href="/stake">Stake RTM</LinkButton>
          <LinkButton href="/proposals" variant="secondary">
            See proposals
          </LinkButton>
        </div>
      </section>

      {!codeHashMatches ? (
        <Notice tone="danger">
          This contract&apos;s code hash is not the one this app was built for. Do not sign anything
          until you know why.
        </Notice>
      ) : null}

      {config === null ? (
        <Notice tone="warning">
          Not initialized yet: <span className="mono">{configProblem ?? "config was refused"}</span>
          . It cannot accept stake until <span className="mono">init</span> runs.
        </Notice>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total staked" hint="locked in governance">
          {config ? <Amount atomic={config.totalStakedAtomic} /> : "—"}
        </Stat>
        <Stat label="Treasury" hint="spendable by vote only">
          {config ? <Amount atomic={config.treasuryAtomic} /> : "—"}
        </Stat>
        <Stat label="Proposals" hint="all time">
          {config ? config.proposalCount : "—"}
        </Stat>
        <Stat label="Your power" hint={connected ? "stake plus delegated" : "connect to see it"}>
          {connected ? mine ? <Amount atomic={mine.powerAtomic} /> : "…" : "—"}
        </Stat>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Panel
          title="Latest proposals"
          actions={
            <Link href="/proposals" className="text-xs text-zinc-500 hover:text-kai">
              All →
            </Link>
          }
        >
          {proposals.data && proposals.data.proposals.length > 0 ? (
            <div className="grid gap-2.5">
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
                const title =
                  proposal.description?.split("\n")[0]?.trim() || `Proposal #${proposal.id}`;

                return (
                  <Link
                    key={proposal.id}
                    href={safeUrl(`/proposals/${proposal.id}`)}
                    className="group block rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 transition-colors hover:border-kai/40 hover:bg-white/[0.045]"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px]">
                          <span className="mono text-zinc-500">#{proposal.id}</span>
                          <StatusBadge status={proposal.status} />
                          <span className="text-zinc-700">·</span>
                          <span className="text-zinc-500">by</span>
                          <AddressChip address={proposal.proposer} short copy={false} />
                        </div>
                        <h3
                          className="truncate text-sm font-medium text-zinc-100 group-hover:text-kai"
                          title={proposal.description || undefined}
                        >
                          {title}
                        </h3>
                        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                          <span className="font-medium text-zinc-300">
                            {formatRtm(proposal.amountAtomic)} RTM
                          </span>
                          <span>to</span>
                          <AddressChip address={proposal.recipient} short copy={false} />
                        </p>
                      </div>
                      <span className="shrink-0 text-right text-[11px] text-zinc-500 group-hover:text-kai">
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
                          "final"
                        )}
                      </span>
                    </div>
                    <div className="mt-3.5 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className={`h-full rounded-full ${percent >= 100 ? "bg-emerald-400" : "bg-kai"}`}
                        style={{ width: `${Math.max(percent, 2)}%` }}
                      />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-3 text-[10px] text-zinc-600">
                      <span>Quorum {Math.round(percent)}%</span>
                      <span className="mono">
                        {formatRtm(participation)} / {formatRtm(quorum)} RTM
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : proposals.failure ? (
            <Failure message={proposals.failure.message} />
          ) : proposals.data ? (
            <p className="text-sm text-zinc-400">
              Nothing yet.{" "}
              <Link href="/proposals/new" className="text-kai hover:text-kai-soft">
                Open the first proposal
              </Link>
              .
            </p>
          ) : (
            <p className="text-sm text-zinc-500">Loading…</p>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel title="Your position">
            {!connected ? (
              <div className="space-y-3">
                <p className="text-sm text-zinc-400">Connect a wallet to see your stake.</p>
                <button
                  type="button"
                  onClick={() => void connect()}
                  className="rounded-full bg-kai px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-kai-soft"
                >
                  Connect wallet
                </button>
              </div>
            ) : !mine ? (
              <p className="text-sm text-zinc-500">Reading your position…</p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-zinc-500">Staked</span>
                  <Amount atomic={mine.stakedAtomic} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-zinc-500">Voting power</span>
                  <Amount atomic={mine.powerAtomic} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-zinc-500">Delegate</span>
                  {mine.delegate === null ? (
                    <span className="text-sm text-zinc-400">yourself</span>
                  ) : (
                    <AddressChip address={mine.delegate} short />
                  )}
                </div>
                {mine.lockMs > 0 ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-zinc-500">Locked</span>
                    <span className="text-xs text-zinc-300">
                      <Countdown deadline={mine.lockMs} showAbsolute={false} />
                    </span>
                  </div>
                ) : null}
                <LinkButton href="/stake" variant="secondary">
                  Manage stake
                </LinkButton>
              </div>
            )}
          </Panel>

          <Panel title="How it works">
            <ol className="space-y-2.5 text-sm">
              {[
                ["01", "Stake", "Lock RTM to get voting power."],
                ["02", "Vote", "Yes, no or abstain. Stake locks until voting ends."],
                ["03", "Execute", "A passed proposal pays after its timelock."],
              ].map(([number, title, text]) => (
                <li key={number} className="flex gap-3">
                  <span className="mono mt-0.5 text-[11px] text-kai">{number}</span>
                  <span>
                    <span className="font-medium text-zinc-100">{title}</span>
                    <span className="block text-xs text-zinc-500">{text}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>
    </div>
  );
}
