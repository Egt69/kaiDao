"use client";

import { formatRtm, formatRtmExact, tryAtomic } from "@/lib/amount";

/** BigInt in, text out. Never a JavaScript number for money. */
export function Amount({
  atomic,
  exact = false,
  suffix = true,
}: {
  atomic: string;
  exact?: boolean;
  suffix?: boolean;
}) {
  const value = tryAtomic(atomic);
  if (value === null) {
    return <span className="text-red-400">bad amount</span>;
  }

  const text = exact ? formatRtmExact(value) : formatRtm(value);

  return (
    <span className="mono tabular-nums">
      {text}
      {suffix ? <span className="ml-1.5 text-xs font-normal text-zinc-500">RTM</span> : null}
    </span>
  );
}
