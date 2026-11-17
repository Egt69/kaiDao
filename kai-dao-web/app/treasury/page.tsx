"use client";

import { useState } from "react";
import { AddressChip } from "@/components/address-chip";
import { Amount } from "@/components/amount";
import { TxDialog, type TxIntent } from "@/components/tx-dialog";
import { useWallet } from "@/components/wallet-provider";
import { Failure, Loading, Notice, Panel, Stat } from "@/components/ui";
import { eventPageDtoSchema, overviewDtoSchema } from "@/lib/api-schemas";
import { parseRtm } from "@/lib/amount";
import { useApi } from "@/lib/use-api";

export default function TreasuryPage() {
  const { address, state, connect } = useWallet();
  const connected = state.status === "connected" && address !== null;

  const overview = useApi("/api/dao/overview", overviewDtoSchema, { intervalMs: 8_000 });
  const events = useApi("/api/dao/events?limit=100", eventPageDtoSchema, {
    intervalMs: 15_000,
  });

  const [amount, setAmount] = useState("");
  const [intent, setIntent] = useState<TxIntent | null>(null);

  const parsed = parseRtm(amount);
  const problem = amount === "" ? null : parsed.ok ? null : parsed.error;

  if (overview.loading && !overview.data) return <Loading what="the treasury" />;
  if (!overview.data) {
    return <Failure message={overview.failure?.message ?? "The treasury could not be read."} />;
  }

  const config = overview.data.config;

  if (config === null) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-semibold tracking-tight">Treasury</h1>
        <Notice tone="warning">This contract has not been initialized yet.</Notice>
      </div>
    );
  }

  const money = (events.data?.events ?? []).filter(
    (event) =>
      event.data.type === "treasury_deposit" ||
      event.data.type === "proposal_executed" ||
      event.data.type === "skimmed",
  );

  function reviewDeposit() {
    if (!parsed.ok) return;

    setIntent({
      title: "Deposit into the treasury",
      method: "deposit",
      args: [],
      amountAtomic: parsed.atomic.toString(),
      codeHashMatches: overview.data?.codeHashMatches,
      rows: [
        { label: "Amount", value: <Amount atomic={parsed.atomic.toString()} exact /> },
        { label: "From", value: address ? <AddressChip address={address} /> : "your wallet" },
        { label: "Grants voting power", value: "no" },
      ],
      warning: "Treasury RTM belongs to the DAO. Only a passed proposal can pay it out.",
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Treasury</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Staked RTM belongs to stakers. Only the treasury can be spent by a vote.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Treasury" hint="spendable by vote">
          <Amount atomic={config.treasuryAtomic} />
        </Stat>
        <Stat label="Staked" hint="owned by stakers">
          <Amount atomic={config.totalStakedAtomic} />
        </Stat>
        <Stat label="Contract balance" hint="stake + treasury">
          <Amount
            atomic={(BigInt(config.treasuryAtomic) + BigInt(config.totalStakedAtomic)).toString()}
          />
        </Stat>
      </div>

      <Panel title="Deposit">
        {!connected ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-zinc-400">Connect a wallet to deposit RTM.</p>
            <button
              type="button"
              onClick={() => void connect()}
              className="rounded-full bg-kai px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-kai-soft"
            >
              Connect wallet
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="flex-1">
              <label htmlFor="deposit" className="text-xs text-zinc-500">
                Amount (RTM)
              </label>
              <input
                id="deposit"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.5"
                className="mono mt-1.5 w-full rounded-xl border border-white/10 bg-black/60 px-3.5 py-3 text-base text-zinc-100 placeholder:text-zinc-600 focus:border-kai/50 focus:outline-none sm:w-56"
              />
              <p className="mt-1.5 min-h-4 text-xs text-zinc-500">
                {problem ? (
                  <span className="text-red-300">{problem}</span>
                ) : parsed.ok ? (
                  "No approval step; the amount you sign is what moves."
                ) : (
                  "Up to 18 decimals."
                )}
              </p>
            </div>
            <button
              type="button"
              disabled={!parsed.ok}
              onClick={reviewDeposit}
              className="rounded-full bg-kai px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-kai-soft disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-zinc-500 sm:mt-6"
            >
              Deposit
            </button>
          </div>
        )}
      </Panel>

      <Panel
        title="Movements"
        actions={
          events.data ? (
            <button
              type="button"
              onClick={() => void events.refresh()}
              className="text-xs text-zinc-500 transition-colors hover:text-kai"
            >
              Refresh
            </button>
          ) : null
        }
      >
        {events.loading && !events.data ? <p className="text-sm text-zinc-500">Loading…</p> : null}
        {events.failure && !events.data ? <Failure message={events.failure.message} /> : null}

        {money.length === 0 ? (
          <p className="text-sm text-zinc-400">No deposits or payouts in recent events.</p>
        ) : (
          <ul className="-my-1 divide-y divide-white/[0.06]">
            {money.map((event) => {
              const data = event.data;
              if (
                data.type !== "treasury_deposit" &&
                data.type !== "proposal_executed" &&
                data.type !== "skimmed"
              ) {
                return null;
              }

              return (
                <li
                  key={`${event.txId}-${event.eventIdx}-${data.type}`}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span
                      className={
                        data.type === "proposal_executed" ? "text-amber-300" : "text-emerald-300"
                      }
                    >
                      {data.type === "proposal_executed" ? "Payout" : "In"}
                    </span>
                    {data.type === "treasury_deposit" ? (
                      <AddressChip address={data.from} short copy={false} />
                    ) : data.type === "proposal_executed" ? (
                      <>
                        <span className="text-zinc-500">proposal #{data.id} to</span>
                        <AddressChip address={data.recipient} short copy={false} />
                      </>
                    ) : (
                      <span className="text-zinc-500">stray RTM skimmed</span>
                    )}
                  </span>
                  <span className="flex items-center gap-3 text-xs text-zinc-500">
                    <Amount atomic={data.amountAtomic} exact />
                    {event.timestamp ? (
                      <span>{new Date(event.timestamp).toLocaleDateString()}</span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <p className="text-xs text-zinc-600">
        {config.quorumBps / 100}% quorum · {days(config.timelockMs)} timelock ·{" "}
        {days(config.graceMs)} execution window. Deposits are refunded only when a proposal
        executes.
      </p>

      <TxDialog
        intent={intent}
        onClose={() => setIntent(null)}
        onSettled={() => {
          setIntent(null);
          setAmount("");
          void overview.refresh();
          void events.refresh();
        }}
      />
    </div>
  );
}

function days(ms: number): string {
  if (ms === 0) return "none";
  if (ms % 86_400_000 === 0) {
    const d = ms / 86_400_000;
    return `${d}d`;
  }
  const h = ms / 3_600_000;
  return `${Number(h.toFixed(1))}h`;
}
