"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Public chain identity, handed down from the server layout. Keeping it here
 * means the browser never imports `lib/env.ts`, so configuration cannot leak
 * server-only values into a bundle by accident.
 */
export type PublicConfig = {
  contractId: string;
  codeHash: string;
  chainId: number;
  contractType: string;
  contractVersion: string;
  explorerUrl: string;
  walletUrl: string;
};

const ConfigContext = createContext<PublicConfig | null>(null);

export function AppConfigProvider({
  value,
  children,
}: {
  value: PublicConfig;
  children: ReactNode;
}) {
  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

export function useAppConfig(): PublicConfig {
  const value = useContext(ConfigContext);
  if (!value) throw new Error("useAppConfig must be used inside AppConfigProvider");
  return value;
}
