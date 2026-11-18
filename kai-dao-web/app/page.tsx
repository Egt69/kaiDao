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
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[linear-gradient(115deg,#0d0906_0%,#180d07_42%,#2c1406_76%,#110b07_100%)] px-6 py-8 sm:px-9 sm:py-10">
        <div className="pointer-events-none absolute -right-24 -top-32 h-80 w-[560px] rotate-[-22deg] bg-gradient-to-l from-kai/25 via-kai/[0.06] to-transparent blur-3xl" />
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 sm:block">
          <div className="absolute right-[9%] top-1/2 h-52 w-52 -translate-y-1/2 rotate-12 rounded-[3rem] bg-kai/10 blur-3xl" />
          <svg
            viewBox="0 0 120 120"
            className="absolute right-[7%] top-1/2 h-48 w-48 -translate-y-1/2 text-kai/70"
            fill="currentColor"
          >
            <path d="M18 12h30v33l29-33h40L86 52l34 56H76L53 72v36H18z" />
          </svg>
        </div>
        <div className="relative max-w-xl">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-kai">
            Stake-weighted DAO
          </p>
          <h1 className="mt-1.5 text-5xl font-bold tracking-tight sm:text-6xl">
            <span className="text-zinc-50">Kai</span>
            <span className="text-kai">DAO</span>
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Stake RTM to vote. Passed proposals pay from the treasury.
          </p>
          <div className="mt-5 flex flex-wrap gap-2.5">
            <LinkButton href="/stake">Stake RTM →</LinkButton>
            <LinkButton href="/proposals" variant="secondary">
              See proposals
            </LinkButton>
          </div>
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
        <Stat
          label="Total staked"
          hint="locked in governance"
          icon={
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="h-5 w-5"
            >
              <circle cx="9" cy="8" r="3" />
              <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5a3 3 0 0 1 0 6M18 14c1.8.8 3 2.5 3 4.5" />
            </svg>
          }
        >
          {config ? <Amount atomic={config.totalStakedAtomic} /> : "—"}
        </Stat>
        <Stat
          label="Treasury"
          hint="spendable by vote only"
          icon={
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="h-5 w-5"
            >
              <rect x="3" y="6" width="18" height="13" rx="2.5" />
              <path d="M3 10h18M16 15h2" />
            </svg>
          }
        >
          {config ? <Amount atomic={config.treasuryAtomic} /> : "—"}
        </Stat>
        <Stat
          label="Proposals"
          hint="all time"
          icon={
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="h-5 w-5"
            >
              <path d="M6 3h9l4 4v14H6z" />
              <path d="M14 3v5h5M9 12h7M9 16h7" />
            </svg>
          }
        >
          {config ? config.proposalCount : "—"}
        </Stat>
        <Stat
          label="Your power"
          hint={connected ? "stake plus delegated" : "connect to see it"}
          icon={
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="h-5 w-5"
            >
              <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
            </svg>
          }
        >
          {connected ? mine ? <Amount atomic={mine.powerAtomic} /> : "…" : "—"}
        </Stat>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Panel
          title="Latest Proposals"
          actions={
            <Link href="/proposals" className="text-xs font-medium text-kai hover:text-kai-soft">
              View all →
            </Link>
          }
        >
          {proposals.data && proposals.data.proposals.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
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
                    className="group flex min-h-[13.5rem] flex-col rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 transition-colors hover:border-kai/40 hover:bg-white/[0.045]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="mono text-[11px] text-zinc-500">#{proposal.id}</span>
                      <StatusBadge status={proposal.status} />
                    </div>
                    <p className="mt-3 flex items-center gap-1.5 text-[11px] text-zinc-500">
                      <span>by</span>
                      <AddressChip address={proposal.proposer} short copy={false} />
                    </p>
                    <h3
                      className="mt-1 line-clamp-2 text-sm font-medium text-zinc-100 group-hover:text-kai"
                      title={proposal.description || undefined}
                    >
                      {title}
                    </h3>
                    <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                      <span className="font-medium text-zinc-300">
                        {formatRtm(proposal.amountAtomic)} RTM
                      </span>
                      <span>to</span>
                      <AddressChip address={proposal.recipient} short copy={false} />
                    </p>
                    <div className="mt-auto pt-4">
                      <div className="border-t border-white/[0.07] pt-3">
                        <div className="grid grid-cols-3 gap-2 text-center">
                          {(["yes", "no", "abstain"] as const).map((choice) => {
                            const raw =
                              choice === "yes"
                                ? proposal.yesAtomic
                                : choice === "no"
                                  ? proposal.noAtomic
                                  : proposal.abstainAtomic;
                            const color =
                              choice === "yes"
                                ? "text-emerald-400"
                                : choice === "no"
                                  ? "text-red-400"
                                  : "text-zinc-400";
                            return (
                              <div key={choice}>
                                <p className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wide text-zinc-600">
                                  {choice === "yes" ? (
                                    <span className="text-emerald-400">✓</span>
                                  ) : null}
                                  {choice}
                                </p>
                                <p className={`mt-0.5 text-xs font-semibold ${color}`}>
                                  {formatRtm(raw)}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-zinc-500">
                        <span className="flex items-center gap-1.5 group-hover:text-kai">
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.7"
                            className="h-3.5 w-3.5"
                          >
                            <circle cx="12" cy="12" r="9" />
                            <path d="M12 7v5l3 2" />
                          </svg>
                          {proposal.status === "active" ? (
                            <Countdown
                              deadline={proposal.votingEnds}
                              prefix="Ends"
                              showAbsolute={false}
                            />
                          ) : proposal.status === "queued" ? (
                            <Countdown
                              deadline={proposal.timelockEnds}
                              prefix="Unlocks"
                              showAbsolute={false}
                            />
                          ) : (
                            "final"
                          )}
                        </span>
                        <span className="text-zinc-600">
                          Quorum {Math.round(percent)}% · {formatRtm(participation)} /{" "}
                          {formatRtm(quorum)} RTM
                        </span>
                      </div>
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
          <Panel
            title="Your Position"
            icon={
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                className="h-5 w-5"
              >
                <circle cx="12" cy="8" r="3.5" />
                <path d="M5 20c0-3.8 3.1-6.5 7-6.5s7 2.7 7 6.5" />
              </svg>
            }
          >
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

          <Panel
            title="How it works"
            icon={
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                className="h-5 w-5"
              >
                <path d="M9 18h6M10 21h4" />
                <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.4.9 1 .9 1.6h5.2c0-.6.3-1.2.9-1.6A6 6 0 0 0 12 3z" />
              </svg>
            }
          >
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
