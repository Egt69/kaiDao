import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { AppConfigProvider, type PublicConfig } from "@/components/app-config";
import { Brand } from "@/components/brand";
import { Nav } from "@/components/nav";
import { WalletProvider } from "@/components/wallet-provider";
import { WalletBar } from "@/components/wallet-bar";
import { env, EXPECTED_CHAIN_ID, WALLET_SDK_URL } from "@/lib/env";
import { safeUrl } from "@/lib/safe-url";

const publicConfig: PublicConfig = {
  contractId: env.RETIUM_CONTRACT_ID,
  codeHash: env.RETIUM_CONTRACT_CODE_HASH,
  chainId: EXPECTED_CHAIN_ID,
  contractType: "stake_dao",
  contractVersion: "v1.0.0",
  explorerUrl: "https://retium.net",
  walletUrl: "https://wallet.retium.org",
};

export const metadata: Metadata = {
  title: "KaiDAO — stake-weighted governance",
  description:
    "Stake RTM, delegate voting power and govern a treasury on the Retium public testnet. Reads are free; writes are signed by your own wallet.",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading the nonce makes every page dynamic, which a nonce-based CSP needs.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en">
      <head>
        {/*
          The wallet provider is pinned by version and by its SRI hash from
          https://wallet.retium.org/connect/sdk/manifest.json. A swapped file
          fails the integrity check and never runs.
        */}
        <script
          src={safeUrl(WALLET_SDK_URL)}
          integrity={env.RETIUM_WALLET_SDK_INTEGRITY}
          crossOrigin="anonymous"
          nonce={nonce}
        />
      </head>
      <body className="min-h-screen antialiased">
        <AppConfigProvider value={publicConfig}>
          <WalletProvider>
            <div className="flex min-h-screen flex-col">
              <header className="sticky top-0 z-40 border-b border-white/10 bg-black/70 backdrop-blur-xl">
                <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-5">
                    <Brand />
                    <Nav />
                  </div>
                  <WalletBar />
                </div>
              </header>

              <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:py-10">{children}</main>

              <footer className="border-t border-white/10 px-4 py-6">
                <div className="mx-auto flex max-w-6xl flex-col gap-1.5 text-[11px] text-zinc-600">
                  <p>
                    KaiDAO on the Retium public testnet (chain {EXPECTED_CHAIN_ID}). Coins here have
                    no value.
                  </p>
                  <p className="mono break-all">contract {env.RETIUM_CONTRACT_ID}</p>
                  <p className="mono break-all">code hash {env.RETIUM_CONTRACT_CODE_HASH}</p>
                </div>
              </footer>
            </div>
          </WalletProvider>
        </AppConfigProvider>
      </body>
    </html>
  );
}
