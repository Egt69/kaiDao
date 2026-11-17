"use client";

import { useState } from "react";
import { shortenAddress } from "@/lib/address";

/**
 * Never truncate an address on a confirmation screen. `short` exists for tables
 * only; the copy button always copies the full string.
 */
export function AddressChip({
  address,
  short = false,
  label,
  copy = true,
}: {
  address: string;
  short?: boolean;
  label?: string;
  /** Long lists read better without a copy button on every row. */
  copy?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1_500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      {label ? <span className="text-xs text-zinc-500">{label}</span> : null}
      <span className="mono break-all text-xs text-zinc-300" title={address} aria-label={address}>
        {short ? shortenAddress(address) : address}
      </span>
      {copy ? (
        <button
          type="button"
          onClick={onCopy}
          className="rounded-full border border-white/10 px-1.5 py-0.5 text-[11px] text-zinc-500 transition-colors hover:border-white/25 hover:text-zinc-200"
          aria-label="Copy address"
        >
          {copied ? "copied" : "copy"}
        </button>
      ) : null}
    </span>
  );
}
