"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AddressChip } from "@/components/address-chip";
import { Amount } from "@/components/amount";
import { TxDialog, type TxIntent } from "@/components/tx-dialog";
import { useWallet } from "@/components/wallet-provider";
import { Failure, Loading, Notice, Panel } from "@/components/ui";
import { accountDtoSchema, overviewDtoSchema } from "@/lib/api-schemas";
import { addressProblemText, isValidAddress } from "@/lib/address";
import { formatRtm, parseRtm } from "@/lib/amount";
import { useApi } from "@/lib/use-api";

const FORBIDDEN = /[(),]|::/;
const MAX_DESCRIPTION_BYTES = 512;

export default function NewProposalPage() {
  const router = useRouter();
  const { address, state, connect } = useWallet();
  const connected = state.status === "connected" && address !== null;

  const overview = useApi("/api/dao/overview", overviewDtoSchema, { intervalMs: 15_000 });
  const account = useApi(
    address ? `/api/dao/account?address=${encodeURIComponent(address)}` : "/api/dao/overview",
    accountDtoSchema,
    { enabled: connected, intervalMs: 15_000 },
  );

  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [intent, setIntent] = useState<TxIntent | null>(null);

  const config = overview.data?.config ?? null;
  const mine = account.data;

  const recipientOk = isValidAddress(recipient);
  const recipientProblem = recipient === "" ? null : addressProblemText(recipient);

  const parsedAmount = useMemo(() => parseRtm(amount), [amount]);
  const amountProblem = amount === "" ? null : parsedAmount.ok ? null : parsedAmount.error;

  const descriptionBytes = new TextEncoder().encode(description).length;
  const descriptionProblem =
    description === ""
      ? "Describe what this pays for."
      : FORBIDDEN.test(description)
        ? "Remove , ( ) or :: — the chain refuses those in an argument."
        : descriptionBytes > MAX_DESCRIPTION_BYTES
          ? `Too long: ${descriptionBytes} of ${MAX_DESCRIPTION_BYTES} bytes.`
          : null;

  const deposit = config ? BigInt(config.depositAtomic) : null;
  const threshold = config ? BigInt(config.proposeThresholdAtomic) : null;
  const power = mine ? BigInt(mine.powerAtomic) : null;
  const treasury = config ? BigInt(config.treasuryAtomic) : null;
  const amountAtomic = parsedAmount.ok ? parsedAmount.atomic : null;

  const belowThreshold = threshold !== null && mine !== null && (power ?? 0n) < threshold;
  const shortForPayout =
    treasury !== null &&
    deposit !== null &&
    amountAtomic !== null &&
    treasury < amountAtomic + deposit;

  const canSubmit =
    connected &&
    config !== null &&
    recipientOk &&
    amountProblem === null &&
    parsedAmount.ok &&
    descriptionProblem === null &&
    !belowThreshold;

  if (overview.loading && !overview.data) return <Loading what="the rules" />;
  if (!overview.data) {
    return <Failure message={overview.failure?.message ?? "The DAO could not be read."} />;
  }

  if (config === null) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-semibold tracking-tight">New proposal</h1>
        <Notice tone="warning">This contract has not been initialized yet.</Notice>
      </div>
    );
  }

  function review() {
    if (!canSubmit || !config || !parsedAmount.ok) return;

    setIntent({
      title: "Open proposal",
      method: "propose",
      args: [recipient.trim(), parsedAmount.atomic.toString(), description],
      amountAtomic: config.depositAtomic,
      codeHashMatches: overview.data?.codeHashMatches,
      rows: [
        { label: "Recipient", value: <AddressChip address={recipient.trim()} /> },
        { label: "Amount", value: <Amount atomic={parsedAmount.atomic.toString()} exact /> },
        { label: "Description", value: <span className="break-words">{description}</span> },
        { label: "Deposit", value: <Amount atomic={config.depositAtomic} exact /> },
      ],
      warning: "The deposit joins the treasury now and is refunded only if this proposal executes.",
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">New proposal</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Needs {formatRtm(config.proposeThresholdAtomic)} RTM of voting power and a{" "}
          {formatRtm(config.depositAtomic)} RTM deposit.
        </p>
      </div>

      {overview.data && !overview.data.codeHashMatches ? (
        <Notice tone="danger">
          This contract&apos;s code hash is not the one this app was built for. Do not sign anything
          until you know why.
        </Notice>
      ) : null}

      {!connected ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-4">
          <p className="text-sm text-zinc-400">Connect a wallet to check your voting power.</p>
          <button
            type="button"
            onClick={() => void connect()}
            className="rounded-full bg-kai px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-kai-soft"
          >
            Connect wallet
          </button>
        </div>
      ) : belowThreshold ? (
        <Notice tone="warning">
          Your power is below {formatRtm(config.proposeThresholdAtomic)} RTM, so the contract would
          refuse this.
        </Notice>
      ) : null}

      <Panel title="Payment">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            review();
          }}
        >
          <div>
            <label htmlFor="recipient" className="text-xs text-zinc-500">
              Recipient
            </label>
            <input
              id="recipient"
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              spellCheck={false}
              autoComplete="off"
              placeholder="rete…"
              aria-invalid={recipient !== "" && !recipientOk}
              className="mono mt-1.5 w-full rounded-xl border border-white/10 bg-black/60 px-3.5 py-2.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-kai/50 focus:outline-none"
            />
            <p className="mt-1.5 min-h-4 text-xs">
              {recipient === "" ? (
                <span className="text-zinc-500">Checksum checked before signing.</span>
              ) : recipientOk ? (
                <span className="text-emerald-300">Checksum valid.</span>
              ) : (
                <span className="text-red-300">{recipientProblem}</span>
              )}
            </p>
          </div>

          <div>
            <label htmlFor="amount" className="text-xs text-zinc-500">
              Amount (RTM)
            </label>
            <input
              id="amount"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.5"
              aria-invalid={amount !== "" && !parsedAmount.ok}
              className="mono mt-1.5 w-full rounded-xl border border-white/10 bg-black/60 px-3.5 py-3 text-base text-zinc-100 placeholder:text-zinc-600 focus:border-kai/50 focus:outline-none"
            />
            <p className="mt-1.5 min-h-4 text-xs text-zinc-500">
              {amountProblem ? (
                <span className="text-red-300">{amountProblem}</span>
              ) : parsedAmount.ok ? (
                `${parsedAmount.atomic.toString()} atomic units`
              ) : (
                "Up to 18 decimals."
              )}
            </p>
          </div>

          <div>
            <label htmlFor="description" className="text-xs text-zinc-500">
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              placeholder="What is this payment for?"
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/60 px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-kai/50 focus:outline-none"
            />
            <p className="mt-1.5 min-h-4 text-xs">
              {description !== "" && descriptionProblem ? (
                <span className="text-red-300">{descriptionProblem}</span>
              ) : (
                <span className="text-zinc-500">
                  {descriptionBytes}/{MAX_DESCRIPTION_BYTES} bytes · stored on chain, public
                </span>
              )}
            </p>
          </div>

          {shortForPayout ? (
            <Notice tone="warning">
              Treasury holds {formatRtm(treasury?.toString() ?? "0")} RTM, less than amount +
              deposit. Execution would fail until it is funded.
            </Notice>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 border-t border-white/[0.06] pt-4">
            <button
              type="submit"
              disabled={!canSubmit}
              className="rounded-full bg-kai px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-kai-soft disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-zinc-500"
            >
              Continue
            </button>
            <span className="text-xs text-zinc-600">
              Attaches {formatRtm(config.depositAtomic)} RTM deposit · {config.quorumBps / 100}%
              quorum · {days(config.votingPeriodMs)} vote
            </span>
          </div>
        </form>
      </Panel>

      <TxDialog
        intent={intent}
        onClose={() => setIntent(null)}
        onSettled={() => {
          setIntent(null);
          void overview.refresh();
          router.push("/proposals");
        }}
      />
    </div>
  );
}

function days(ms: number): string {
  if (ms === 0) return "no time";
  if (ms % 86_400_000 === 0) {
    const d = ms / 86_400_000;
    return `${d}d`;
  }
  const h = ms / 3_600_000;
  return `${h}h`;
}
