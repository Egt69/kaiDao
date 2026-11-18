"use client";

import { useAppConfig } from "@/components/app-config";
import { AddressChip } from "@/components/address-chip";
import { useWallet } from "@/components/wallet-provider";
import { safeUrl } from "@/lib/safe-url";

export function WalletBar() {
  const { state, connect, forget, error, clearError } = useWallet();
  const config = useAppConfig();

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-zinc-400">
          <span className="h-1.5 w-1.5 rounded-full bg-kai" />
          testnet
        </span>

        {state.status === "no-wallet" ? (
          <a
            href={safeUrl(config.walletUrl)}
            target="_blank"
            rel="noreferrer noopener"
            className="rounded-full border border-kai/40 bg-kai/10 px-4 py-2 text-xs font-medium text-kai-soft transition-colors hover:bg-kai/20"
          >
            Get a wallet
          </a>
        ) : null}

        {state.status === "idle" ? (
          <button
            type="button"
            onClick={() => void connect()}
            className="rounded-full bg-kai px-4 py-2 text-xs font-semibold text-black transition-colors hover:bg-kai-soft"
          >
            Connect wallet
          </button>
        ) : null}

        {state.status === "connecting" ? (
          <button
            type="button"
            disabled
            className="rounded-full bg-white/[0.06] px-4 py-2 text-xs font-medium text-zinc-400"
          >
            Check your wallet…
          </button>
        ) : null}

        {state.status === "wrong-network" ? (
          <span className="rounded-full border border-red-500/50 bg-red-500/10 px-3 py-1.5 text-xs text-red-200">
            Wrong network ({state.chainId})
          </span>
        ) : null}

        {state.status === "connected" ? (
          <>
            <AddressChip address={state.wallet.address} short />
            <button
              type="button"
              onClick={forget}
              className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-zinc-500 transition-colors hover:text-zinc-200"
            >
              Disconnect
            </button>
          </>
        ) : null}
      </div>

      {error ? (
        <div className="flex items-start gap-2 text-[11px] text-red-300">
          <span>{error}</span>
          <button
            type="button"
            onClick={clearError}
            className="underline decoration-dotted hover:text-red-200"
          >
            dismiss
          </button>
        </div>
      ) : null}
    </div>
  );
}
