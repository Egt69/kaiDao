/**
 * RTM amounts. The chain uses 18 decimals and a u128, so every amount is a
 * BigInt here and a decimal string on the wire. JavaScript numbers never touch
 * money: `Number("1.000000000000000001")` silently loses a wei.
 */

export const RTM_DECIMALS = 18;
export const RTM_SCALE = 10n ** BigInt(RTM_DECIMALS);
export const U128_MAX = (1n << 128n) - 1n;

export type ParsedAmount = { ok: true; atomic: bigint } | { ok: false; error: string };

/**
 * "1.5" -> 1500000000000000000n. Rejects anything a human could mean
 * differently from what the chain would charge.
 */
export function parseRtm(input: string): ParsedAmount {
  const value = input.trim();

  if (value === "") return { ok: false, error: "Enter an amount." };

  if (/[eE,]/.test(value)) {
    return {
      ok: false,
      error: "Use plain decimals, for example 12.5. No commas or exponents.",
    };
  }

  if (!/^\d+(\.\d+)?$/.test(value)) {
    return {
      ok: false,
      error: "Use digits and a single dot, for example 12.5.",
    };
  }

  const [whole = "", fraction = ""] = value.split(".");

  if (fraction.length > RTM_DECIMALS) {
    return {
      ok: false,
      error: `At most ${RTM_DECIMALS} decimals are allowed.`,
    };
  }

  const atomic =
    BigInt(whole) * RTM_SCALE +
    BigInt((fraction + "0".repeat(RTM_DECIMALS)).slice(0, RTM_DECIMALS));

  if (atomic > U128_MAX) {
    return { ok: false, error: "Amount is larger than the chain can hold." };
  }

  return { ok: true, atomic };
}

/** Atomic units (string or BigInt) -> "1.5 RTM", trimmed for display. */
export function formatRtm(
  atomic: string | bigint,
  options: { maxFractionDigits?: number } = {},
): string {
  const maxFractionDigits = options.maxFractionDigits ?? 4;

  let value: bigint;
  try {
    value = typeof atomic === "bigint" ? atomic : BigInt(atomic);
  } catch {
    return "—";
  }

  const negative = value < 0n;
  const absolute = negative ? -value : value;

  const whole = absolute / RTM_SCALE;
  const fraction = (absolute % RTM_SCALE)
    .toString()
    .padStart(RTM_DECIMALS, "0")
    .slice(0, maxFractionDigits)
    .replace(/0+$/, "");

  const body = fraction ? `${whole}.${fraction}` : `${whole}`;
  return `${negative ? "-" : ""}${body}`;
}

/** Full precision, for confirmation screens and copy buttons. */
export function formatRtmExact(atomic: string | bigint): string {
  return formatRtm(atomic, { maxFractionDigits: RTM_DECIMALS });
}

/** Validates a decimal string and returns atomic units, or null. */
export function tryAtomic(atomic: string): bigint | null {
  if (!/^\d+$/.test(atomic)) return null;
  try {
    return BigInt(atomic);
  } catch {
    return null;
  }
}
