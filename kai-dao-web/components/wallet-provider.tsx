"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { isValidAddress } from "@/lib/address";
import {
  connectWallet,
  toWalletError,
  waitForRetium,
  type ConnectedWallet,
  type RetiumProvider,
} from "@/lib/wallet";

const EXPECTED_CHAIN_ID = 3;

export type WalletState =
  | { status: "no-wallet" }
  | { status: "idle" }
  | { status: "connecting" }
  | { status: "wrong-network"; chainId: number }
  | { status: "connected"; wallet: ConnectedWallet };

type WalletContextValue = {
  state: WalletState;
  provider: RetiumProvider | null;
  connect: () => Promise<void>;
  forget: () => void;
  error: string | null;
  clearError: () => void;
  /** The connected address, or null. Never read from storage: always from the wallet. */
  address: string | null;
};

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>({ status: "idle" });
  const [error, setError] = useState<string | null>(null);
  const providerRef = useRef<RetiumProvider | null>(null);
  const busy = useRef(false);

  // Detect the provider once. The extension injects before hydration; the
  // pinned script fires `retium#initialized` if it loads later.
  useEffect(() => {
    let cancelled = false;
    const onAccountsChanged = () => {
      // The wallet switched or revoked the account. Drop to idle rather than
      // keep acting on a stale address; the user connects again explicitly.
      setState({ status: "idle" });
      setError("Your wallet changed accounts. Connect again to continue.");
    };

    void waitForRetium(1_500).then((provider) => {
      if (cancelled) return;
      providerRef.current = provider;
      provider?.on?.("accountsChanged", onAccountsChanged);
      setState((current) =>
        current.status === "connected" || current.status === "connecting"
          ? current
          : { status: provider ? "idle" : "no-wallet" },
      );
    });

    return () => {
      cancelled = true;
      providerRef.current?.off?.("accountsChanged", onAccountsChanged);
    };
  }, []);

  const connect = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    setState({ status: "connecting" });

    try {
      const provider = providerRef.current ?? (await waitForRetium(1_500));
      if (!provider) {
        providerRef.current = null;
        setState({ status: "no-wallet" });
        setError("No Retium wallet found in this browser.");
        return;
      }

      providerRef.current = provider;
      const wallet = await connectWallet(provider);

      if (wallet.chainId !== EXPECTED_CHAIN_ID) {
        setState({ status: "wrong-network", chainId: wallet.chainId });
        setError(
          `This app only works on the Retium testnet (chain id 3). Your wallet reports chain id ${wallet.chainId}.`,
        );
        return;
      }

      if (!isValidAddress(wallet.address)) {
        setState({ status: "idle" });
        setError("Your wallet returned an address with a bad checksum.");
        return;
      }

      setState({ status: "connected", wallet });
    } catch (cause) {
      const walletError = toWalletError(cause);
      setState({ status: "idle" });
      // 4001 is the user saying no. Stay quiet, as the docs ask.
      if (walletError.code !== 4001) setError(walletError.message);
    } finally {
      busy.current = false;
    }
  }, []);

  const forget = useCallback(() => {
    setState({ status: providerRef.current ? "idle" : "no-wallet" });
    setError(null);
  }, []);

  const value = useMemo<WalletContextValue>(
    () => ({
      state,
      provider: providerRef.current,
      connect,
      forget,
      error,
      clearError: () => setError(null),
      address: state.status === "connected" ? state.wallet.address : null,
    }),
    [state, connect, forget, error],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used inside WalletProvider");
  return context;
}
