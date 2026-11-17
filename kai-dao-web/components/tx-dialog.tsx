"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppConfig } from "@/components/app-config";
import { Amount } from "@/components/amount";
import { useWallet } from "@/components/wallet-provider";
import { apiGet } from "@/lib/api-client";
import { txDtoSchema } from "@/lib/api-schemas";
import { callContract, toWalletError } from "@/lib/wallet";
import { safeUrl } from "@/lib/safe-url";

export type TxIntent = {
  title: string;
  method: string;
  args: string[];
  /** RTM attached to the call, in atomic units. stake, propose and deposit use it. */
  amountAtomic?: string;
  rows: { label: string; value: React.ReactNode }[];
  warning?: string;
  codeHashMatches?: boolean;
};

type Phase =
  | { kind: "review" }
  | { kind: "signing" }
  | { kind: "sent"; txId: string }
  | { kind: "settled"; txId: string; note: string }
  | { kind: "failed"; txId: string | null; message: string; resubmit: boolean };

const POLL_MS = 1_500;
const MAX_WAIT_MS = 120_000;

/**
 * Everything the user is about to sign, then the transaction id, then finality.
 * A txId is not success: this dialog only says "settled" after the node reports
 * HardFinal and a good result, and it never offers to resend an unknown outcome.
 */
export function TxDialog({
  intent,
  onClose,
  onSettled,
}: {
  intent: TxIntent | null;
  onClose: () => void;
  onSettled: () => void;
}) {
  const config = useAppConfig();
  const { state, provider, connect } = useWallet();
  const [phase, setPhase] = useState<Phase>({ kind: "review" });
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (intent) {
      setPhase({ kind: "review" });
      busy.current = false;
    }
  }, [intent]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && phase.kind !== "signing") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase.kind, onClose]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const poll = useCallback(
    async (txId: string, startedAt: number) => {
      const result = await apiGet(`/api/tx/${encodeURIComponent(txId)}`, txDtoSchema);

      if (!result.ok) {
        if (result.failure.kind === "not-found") {
          // A fresh transaction can 404 for a moment. That is not an error.
          return schedule(txId, startedAt);
        }
        if (result.failure.retryable) return schedule(txId, startedAt);
        setPhase({
          kind: "failed",
          txId,
          message: result.failure.message,
          resubmit: false,
        });
        return;
      }

      const tx = result.data;

      if (tx.finality === "Rejected" || tx.finality === "Voided") {
        setPhase({
          kind: "failed",
          txId,
          message:
            tx.finality === "Voided"
              ? "Another transaction from this account used its nonce. It will never run."
              : "The network rejected this transaction. It will never run.",
          resubmit: true,
        });
        return;
      }

      if (tx.finality === "HardFinal") {
        if (tx.execStatus === "failed") {
          setPhase({
            kind: "failed",
            txId,
            message:
              tx.execError ??
              "The contract refused this call. Nothing it did was kept, and the gas was paid.",
            resubmit: false,
          });
          return;
        }
        if (tx.execStatus === "pending") return schedule(txId, startedAt);

        setPhase({ kind: "settled", txId, note: "HardFinal, result ok." });
        onSettled();
        return;
      }

      schedule(txId, startedAt);
    },
    [onSettled],
  );

  function schedule(txId: string, startedAt: number) {
    if (Date.now() - startedAt > MAX_WAIT_MS) {
      setPhase({
        kind: "failed",
        txId,
        message:
          "Still not settled after two minutes. It may still settle; check the transaction id before doing anything else.",
        resubmit: false,
      });
      return;
    }
    timer.current = setTimeout(() => void poll(txId, startedAt), POLL_MS);
  }

  async function submit() {
    if (!intent || busy.current) return;
    if (state.status !== "connected" || !provider) {
      await connect();
      return;
    }

    busy.current = true;
    setPhase({ kind: "signing" });

    try {
      const { txId } = await callContract(provider, {
        contractId: config.contractId,
        method: intent.method,
        args: intent.args,
        amountAtomic: intent.amountAtomic ?? "0",
      });

      setPhase({ kind: "sent", txId });
      void poll(txId, Date.now());
    } catch (cause) {
      const walletError = toWalletError(cause);
      setPhase({
        kind: "failed",
        txId: null,
        message: walletError.message,
        resubmit: walletError.code !== 4301,
      });
    } finally {
      busy.current = false;
    }
  }

  if (!intent) return null;

  const connected = state.status === "connected";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tx-dialog-title"
    >
      <div className="w-full max-w-xl rounded-xl border border-line bg-panel shadow-2xl shadow-black">
        <div className="border-b border-line px-4 py-3">
          <h2 id="tx-dialog-title" className="text-sm font-semibold text-zinc-100">
            {intent.title}
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Check every line. Your wallet will ask you to approve exactly this.
          </p>
        </div>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto px-4 py-4">
          <dl className="space-y-2">
            {intent.rows.map((row) => (
              <div key={row.label} className="flex flex-col gap-0.5 text-sm">
                <dt className="text-[11px] uppercase tracking-wide text-zinc-500">{row.label}</dt>
                <dd className="break-words text-zinc-100">{row.value}</dd>
              </div>
            ))}
          </dl>

          <div className="rounded-lg border border-line bg-black px-3 py-2 text-xs text-zinc-500">
            <p className="text-zinc-400">
              Contract: <span className="mono break-all">{config.contractId}</span>
            </p>
            <p className="mt-1">
              {config.contractType} {config.contractVersion} · code hash{" "}
              <span className="mono break-all">{config.codeHash}</span>
            </p>
            {intent.codeHashMatches === false ? (
              <p className="mt-1 text-red-300">
                Warning: this contract&apos;s code hash does not match the source this app was built
                for.
              </p>
            ) : null}
            <p className="mt-1">
              Method <span className="mono text-zinc-300">{intent.method}</span>
              {intent.args.length > 0 ? (
                <>
                  {" "}
                  with arguments{" "}
                  <span className="mono break-all text-zinc-300">{intent.args.join(", ")}</span>
                </>
              ) : null}
            </p>
            {intent.amountAtomic && intent.amountAtomic !== "0" ? (
              <p className="mt-1">
                Attached RTM: <Amount atomic={intent.amountAtomic} exact />
              </p>
            ) : null}
            <p className="mt-1">
              Gas is a flat fee by weight on this network (this contract is weight 5, about 0.5
              RTM). It is charged even if the contract refuses the call.
            </p>
            <p className="mt-1">Network: Retium public testnet, chain id {config.chainId}.</p>
          </div>

          {intent.warning ? (
            <p className="rounded-lg border border-kai/30 bg-kai/10 px-3 py-2 text-xs text-kai-soft">
              {intent.warning}
            </p>
          ) : null}

          {phase.kind === "signing" ? (
            <p className="text-xs text-zinc-300" role="status">
              Waiting for your wallet. Do not close this window.
            </p>
          ) : null}

          {phase.kind === "sent" ? (
            <p className="text-xs text-zinc-300" role="status">
              Submitted: <span className="mono break-all">{phase.txId}</span>. Waiting for finality…
            </p>
          ) : null}

          {phase.kind === "settled" ? (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
              <p>Settled. {phase.note}</p>
              <p className="mono mt-1 break-all">{phase.txId}</p>
            </div>
          ) : null}

          {phase.kind === "failed" ? (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              <p>{phase.message}</p>
              {phase.txId ? <p className="mono mt-1 break-all">{phase.txId}</p> : null}
              {!phase.resubmit ? (
                <p className="mt-1 text-red-300/80">
                  Do not resend this transaction. Check its id first.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-4 py-3">
          {phase.kind === "settled" ? (
            <a
              href={safeUrl(config.explorerUrl)}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-lg border border-line px-3 py-1.5 text-xs text-zinc-300 hover:text-white"
            >
              Open explorer
            </a>
          ) : null}

          <button
            type="button"
            onClick={onClose}
            disabled={phase.kind === "signing"}
            className="rounded-lg border border-line px-3 py-1.5 text-xs text-zinc-300 hover:text-white disabled:opacity-50"
          >
            {phase.kind === "settled" ? "Close" : "Cancel"}
          </button>

          {phase.kind === "review" || phase.kind === "failed" ? (
            <button
              type="button"
              onClick={() => void submit()}
              disabled={connected && phase.kind === "failed" && !phase.resubmit}
              className="rounded-lg bg-kai px-3 py-1.5 text-xs font-semibold text-black hover:bg-kai-soft disabled:opacity-40"
            >
              {connected ? "Approve in wallet" : "Connect wallet"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
