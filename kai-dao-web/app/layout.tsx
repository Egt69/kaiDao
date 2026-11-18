import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { AppConfigProvider, type PublicConfig } from "@/components/app-config";
import { Brand } from "@/components/brand";
import { Nav } from "@/components/nav";
import { Sidebar } from "@/components/sidebar";
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
            <div className="flex min-h-screen">
              <Sidebar />
              <div className="flex min-w-0 flex-1 flex-col">
                <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-black/75 backdrop-blur-xl">
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
                    <div className="lg:hidden">
                      <Brand />
                    </div>
                    <WalletBar />
                  </div>
                  <div className="border-t border-white/[0.06] px-4 py-2 lg:hidden">
                    <Nav />
                  </div>
                </header>

                <main className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-6 sm:px-7 sm:py-7">
                  {children}
                </main>
              </div>
            </div>
          </WalletProvider>
        </AppConfigProvider>
      </body>
    </html>
  );
}
