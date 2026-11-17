"use client";

import { useMemo, useState } from "react";
import { AddressChip } from "@/components/address-chip";
import { Amount } from "@/components/amount";
import { Countdown } from "@/components/countdown";
import { TxDialog, type TxIntent } from "@/components/tx-dialog";
import { useWallet } from "@/components/wallet-provider";
import { Failure, Loading, Notice, Panel, Stat } from "@/components/ui";
import { accountDtoSchema, overviewDtoSchema } from "@/lib/api-schemas";
import { addressProblemText, isValidAddress } from "@/lib/address";
import { formatRtm, parseRtm } from "@/lib/amount";
import { useApi } from "@/lib/use-api";

export default function StakePage() {
  const { address, state, connect } = useWallet();
  const connected = state.status === "connected" && address !== null;

  const overview = useApi("/api/dao/overview", overviewDtoSchema);
  const account = useApi(
    address ? `/api/dao/account?address=${encodeURIComponent(address)}` : "/api/dao/overview",
    accountDtoSchema,
    { enabled: connected, intervalMs: 8_000 },
  );

  const [stakeAmount, setStakeAmount] = useState("");
  const [unstakeAmount, setUnstakeAmount] = useState("");
  const [delegateTo, setDelegateTo] = useState("");
  const [intent, setIntent] = useState<TxIntent | null>(null);

  const config = overview.data?.config ?? null;
  const mine = account.data;
  const locked = mine !== null && mine.lockMs > Date.now();

  const staked = mine ? BigInt(mine.stakedAtomic) : 0n;
  const minStake = config ? BigInt(config.minStakeAtomic) : null;

  const stakeParsed = useMemo(() => parseRtm(stakeAmount), [stakeAmount]);
  const unstakeParsed = useMemo(() => parseRtm(unstakeAmount), [unstakeAmount]);

  const stakeProblem =
    stakeAmount === ""
      ? null
      : !stakeParsed.ok
        ? stakeParsed.error
        : minStake !== null && staked + stakeParsed.atomic < minStake
          ? `Minimum stake is ${formatRtm(minStake)} RTM.`
          : null;

  const unstakeProblem =
    unstakeAmount === ""
      ? null
      : !unstakeParsed.ok
        ? unstakeParsed.error
        : unstakeParsed.atomic > staked
          ? "That is more than you have staked."
          : minStake !== null &&
              staked - unstakeParsed.atomic !== 0n &&
              staked - unstakeParsed.atomic < minStake
            ? `Leave ${formatRtm(minStake)} RTM or take everything.`
            : locked
              ? "Locked until your live vote ends."
              : null;

  const delegateProblem =
    delegateTo === ""
      ? null
      : address === delegateTo.trim()
        ? null
        : addressProblemText(delegateTo);

  if (overview.loading && !overview.data) return <Loading what="the DAO rules" />;
  if (!overview.data) {
    return <Failure message={overview.failure?.message ?? "The DAO could not be read."} />;
  }

  if (config === null) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-semibold tracking-tight">Stake</h1>
        <Notice tone="warning">This contract has not been initialized yet.</Notice>
      </div>
    );
  }

  const codeHashMatches = overview.data.codeHashMatches;

  function reviewStake() {
    if (!stakeParsed.ok || stakeProblem !== null) return;
    const atomic = stakeParsed.atomic.toString();

    setIntent({
      title: "Stake RTM",
      method: "stake",
      args: [atomic],
      amountAtomic: atomic,
      codeHashMatches,
      rows: [
        { label: "Amount", value: <Amount atomic={atomic} exact /> },
        { label: "From", value: <AddressChip address={address ?? ""} /> },
        {
          label: "Voting power to",
          value:
            mine?.delegate === null || mine?.delegate === undefined ? (
              "yourself"
            ) : (
              <AddressChip address={mine.delegate} short />
            ),
        },
      ],
      warning: "Stake leaves your wallet. You can unstake only when no live vote is using it.",
    });
  }

  function reviewUnstake() {
    if (!unstakeParsed.ok || unstakeProblem !== null) return;
    const atomic = unstakeParsed.atomic.toString();

    setIntent({
      title: "Unstake RTM",
      method: "unstake",
      args: [atomic],
      codeHashMatches,
      rows: [
        { label: "Amount", value: <Amount atomic={atomic} exact /> },
        { label: "Returned to", value: <AddressChip address={address ?? ""} /> },
        {
          label: "Stake after",
          value: <Amount atomic={(staked - unstakeParsed.atomic).toString()} exact />,
        },
      ],
    });
  }

  function reviewDelegate() {
    if (delegateProblem !== null) return;
    const target = delegateTo.trim() === "" ? address : delegateTo.trim();
    if (!target || !isValidAddress(target)) return;

    setIntent({
      title: target === address ? "Undelegate" : "Delegate voting power",
      method: "delegate",
      args: [target],
      codeHashMatches,
      rows: [
        { label: "Your stake", value: <Amount atomic={staked.toString()} exact /> },
        {
          label: "Power goes to",
          value: target === address ? "yourself" : <AddressChip address={target} />,
        },
        {
          label: "Current",
          value:
            mine?.delegate === null || mine?.delegate === undefined ? (
              "yourself"
            ) : (
              <AddressChip address={mine.delegate} short />
            ),
        },
      ],
      warning: "Delegation is one hop. The contract refuses it while either side has a live vote.",
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Stake</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Stake RTM for voting power. Min {formatRtm(config.minStakeAtomic)} RTM to hold,{" "}
          {formatRtm(config.proposeThresholdAtomic)} RTM to propose.
        </p>
      </div>

      {!codeHashMatches ? (
        <Notice tone="danger">
          This contract&apos;s code hash is not the one this app was built for. Do not sign anything
          until you know why.
        </Notice>
      ) : null}

      {connected ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Your stake">{mine ? <Amount atomic={mine.stakedAtomic} /> : "—"}</Stat>
          <Stat label="Voting power">{mine ? <Amount atomic={mine.powerAtomic} /> : "—"}</Stat>
          <Stat label="Delegate">
            {mine ? (
              mine.delegate === null ? (
                <span className="text-sm font-normal text-zinc-400">yourself</span>
              ) : (
                <AddressChip address={mine.delegate} short />
              )
            ) : (
              "—"
            )}
          </Stat>
          <Stat label="Lock">
            {mine ? (
              mine.lockMs === 0 ? (
                <span className="text-sm font-normal text-zinc-400">none</span>
              ) : (
                <span className="text-sm font-normal text-zinc-300">
                  <Countdown deadline={mine.lockMs} />
                </span>
              )
            ) : (
              "—"
            )}
          </Stat>
        </div>
      ) : null}

      {!connected ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-4">
          <p className="text-sm text-zinc-400">Connect a wallet to stake, unstake or delegate.</p>
          <button
            type="button"
            onClick={() => void connect()}
            className="rounded-full bg-kai px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-kai-soft"
          >
            Connect wallet
          </button>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Stake">
          <label htmlFor="stake" className="text-xs text-zinc-500">
            Amount (RTM)
          </label>
          <input
            id="stake"
            value={stakeAmount}
            onChange={(event) => setStakeAmount(event.target.value)}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            className="mono mt-1.5 w-full rounded-xl border border-white/10 bg-black/60 px-3.5 py-3 text-base text-zinc-100 placeholder:text-zinc-600 focus:border-kai/50 focus:outline-none"
          />
          <p className="mt-1.5 min-h-4 text-xs text-zinc-500">
            {stakeProblem ? (
              <span className="text-red-300">{stakeProblem}</span>
            ) : stakeParsed.ok ? (
              `New total ${formatRtm(staked + stakeParsed.atomic)} RTM`
            ) : (
              "Up to 18 decimals."
            )}
          </p>
          <button
            type="button"
            disabled={!connected || !stakeParsed.ok || stakeProblem !== null}
            onClick={reviewStake}
            className="mt-3 w-full rounded-full bg-kai px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-kai-soft disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-zinc-500"
          >
            Stake
          </button>
        </Panel>

        <Panel title="Unstake">
          <label htmlFor="unstake" className="text-xs text-zinc-500">
            Amount (RTM)
          </label>
          <input
            id="unstake"
            value={unstakeAmount}
            onChange={(event) => setUnstakeAmount(event.target.value)}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            className="mono mt-1.5 w-full rounded-xl border border-white/10 bg-black/60 px-3.5 py-3 text-base text-zinc-100 placeholder:text-zinc-600 focus:border-kai/50 focus:outline-none"
          />
          <p className="mt-1.5 min-h-4 text-xs text-zinc-500">
            {unstakeProblem ? (
              <span className="text-red-300">{unstakeProblem}</span>
            ) : unstakeParsed.ok ? (
              `${unstakeParsed.atomic.toString()} atomic units`
            ) : locked ? (
              <span className="text-amber-300">
                Locked <Countdown deadline={mine?.lockMs ?? 0} showAbsolute={false} /> by a live
                vote.
              </span>
            ) : (
              "Partial unstake must leave the minimum."
            )}
          </p>
          <button
            type="button"
            disabled={!connected || !unstakeParsed.ok || unstakeProblem !== null}
            onClick={reviewUnstake}
            className="mt-3 w-full rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-zinc-200 transition-colors hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Unstake
          </button>
        </Panel>
      </div>

      <Panel title="Delegate" description="One hop. Enter your own address to take it back.">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex-1">
            <label htmlFor="delegate" className="text-xs text-zinc-500">
              Delegate address
            </label>
            <input
              id="delegate"
              value={delegateTo}
              onChange={(event) => setDelegateTo(event.target.value)}
              spellCheck={false}
              autoComplete="off"
              placeholder="rete…"
              className="mono mt-1.5 w-full rounded-xl border border-white/10 bg-black/60 px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-kai/50 focus:outline-none"
            />
            <p className="mt-1.5 min-h-4 text-xs">
              {delegateTo === "" ? (
                <span className="text-zinc-500">Checksum checked here before signing.</span>
              ) : delegateProblem === null ? (
                <span className="text-emerald-300">Checksum valid.</span>
              ) : (
                <span className="text-red-300">{delegateProblem}</span>
              )}
            </p>
          </div>
          <div className="flex gap-2 sm:mt-6">
            <button
              type="button"
              disabled={!connected || delegateProblem !== null || delegateTo.trim() === ""}
              onClick={reviewDelegate}
              className="rounded-full bg-kai px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-kai-soft disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-zinc-500"
            >
              Delegate
            </button>
            <button
              type="button"
              disabled={!connected || address === null}
              onClick={() => setDelegateTo(address ?? "")}
              className="rounded-full border border-white/10 px-4 py-2.5 text-sm text-zinc-300 transition-colors hover:text-white disabled:opacity-40"
            >
              Use mine
            </button>
          </div>
        </div>
      </Panel>

      <TxDialog
        intent={intent}
        onClose={() => setIntent(null)}
        onSettled={() => {
          setIntent(null);
          setStakeAmount("");
          setUnstakeAmount("");
          void account.refresh();
          void overview.refresh();
        }}
      />
    </div>
  );
}
