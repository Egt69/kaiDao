import { z } from "zod";

/**
 * The Retium browser provider: `window.retium`. It signs with the user's own
 * keys, in its own window, after showing the user what they approve. This app
 * never sees a key, a seed or a key file.
 *
 * Docs: docs/10-connecting-a-wallet.md
 */

type RequestArguments = {
  method: string;
  params?: Record<string, unknown>;
};

export type RetiumProvider = {
  request: <T = unknown>(args: RequestArguments) => Promise<T>;
  /** Present in the pinned browser bundle (1.5.0). */
  on?: (event: "accountsChanged", listener: (accounts: string[]) => void) => void;
  off?: (event: "accountsChanged", listener: (accounts: string[]) => void) => void;
  preOpen?: () => boolean;
  version?: string;
};

declare global {
  interface Window {
    retium?: RetiumProvider;
  }
}

const accountsSchema = z.object({
  address: z.string().regex(/^rete[0-9a-f]{68}$/),
  publicKey: z.string().min(2),
  chainId: z.coerce.number().int(),
});

const txSchema = z.object({ txId: z.string().regex(/^tx_[0-9a-f]{8,64}$/) });

export type WalletError = {
  code?: number;
  message: string;
  /** True when trying the same request again could make sense. */
  retryable: boolean;
};

const ERROR_TEXT: Record<number, string> = {
  4001: "You rejected the request in your wallet.",
  4100: "No wallet is set up in this browser.",
  4101: "Your wallet is on a different account than the one connected. Connect again.",
  4102: "This site is not connected to your wallet. Connect again.",
  4200: "Your wallet does not support that method.",
  4300: "The network refused it. Nothing was spent.",
  4301: "The outcome is unknown. Check the transaction; do not resend it.",
  4900: "Your wallet could not reach the network. Try again later.",
  [-32002]: "A request is already open in your wallet. Finish that one first.",
  [-32602]: "Those parameters were invalid.",
};

const RETRYABLE = new Set([4900, -32002]);

export function toWalletError(error: unknown): WalletError {
  if (typeof error === "object" && error !== null) {
    const maybe = error as { code?: unknown; message?: unknown };
    const code = typeof maybe.code === "number" ? maybe.code : undefined;
    const known = code !== undefined ? ERROR_TEXT[code] : undefined;

    return {
      code,
      message:
        known ??
        (typeof maybe.message === "string" && maybe.message !== ""
          ? maybe.message
          : "Your wallet reported an unknown problem."),
      retryable: code !== undefined && RETRYABLE.has(code),
    };
  }

  return { message: "Your wallet reported an unknown problem.", retryable: false };
}

/** The extension injects early; the fallback script fires an event. */
export async function waitForRetium(timeoutMs = 800): Promise<RetiumProvider | null> {
  if (typeof window === "undefined") return null;
  if (window.retium) return window.retium;

  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(window.retium ?? null), timeoutMs);
    window.addEventListener(
      "retium#initialized",
      () => {
        clearTimeout(timer);
        resolve(window.retium ?? null);
      },
      { once: true },
    );
  });
}

export type ConnectedWallet = {
  address: string;
  publicKey: string;
  chainId: number;
};

/**
 * Call this from a click handler only: popups and the approval window depend on
 * the user gesture. Never cache the address; ask again on every page load.
 */
export async function connectWallet(provider: RetiumProvider): Promise<ConnectedWallet> {
  const accounts = await provider.request({ method: "retium_requestAccounts" });
  const parsed = accountsSchema.safeParse(accounts);

  if (!parsed.success) {
    throw { message: "Your wallet returned an account this app cannot read.", retryable: false };
  }

  return parsed.data;
}

export type ContractCall = {
  contractId: string;
  method: string;
  args: string[];
  amountAtomic?: string;
};

/**
 * The wallet joins `args` with commas and signs that exact text, and the chain
 * rejects any argument containing `,` `(` `)` or `::`. Anything the UI builds is
 * checked against that rule before it gets here; this is the last guard.
 */
export function checkCallArguments(args: string[]): string | null {
  for (const value of args) {
    if (value === "") return "An argument is empty.";
    if (/[(),]|::/.test(value)) {
      return "An argument contains a character the chain does not allow: , ( ) or ::";
    }
    if (value.length > 1024) return "An argument is too long.";
  }
  return null;
}

export async function callContract(
  provider: RetiumProvider,
  call: ContractCall,
): Promise<{ txId: string }> {
  const problem = checkCallArguments(call.args);
  if (problem) throw { message: problem, retryable: false };

  const result = await provider.request({
    method: "retium_call",
    params: {
      contractId: call.contractId,
      method: call.method,
      args: call.args,
      amountAtomic: call.amountAtomic ?? "0",
    },
  });

  const parsed = txSchema.safeParse(result);
  if (!parsed.success) {
    throw {
      message: "Your wallet answered without a transaction id. Check your wallet before retrying.",
      retryable: false,
    };
  }

  return parsed.data;
}
