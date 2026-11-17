"use client";

import type { VoteChoice } from "@/lib/contract";

/**
 * Three plain buttons, in the same order everywhere, so voting is one obvious
 * click instead of a form. The parent decides whether they are enabled; the
 * contract still enforces every rule.
 */
export function VoteButtons({
  onVote,
  disabled = false,
  size = "md",
}: {
  onVote: (choice: VoteChoice) => void;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  const padding = size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2.5 text-sm";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onVote("yes")}
        className={`rounded-full bg-kai font-semibold text-black transition-colors hover:bg-kai-soft disabled:cursor-not-allowed disabled:bg-white/[0.04] disabled:text-zinc-600 ${padding}`}
      >
        Vote yes
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onVote("no")}
        className={`rounded-full border border-white/10 bg-white/[0.04] font-medium text-zinc-200 transition-colors hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-200 disabled:cursor-not-allowed disabled:text-zinc-600 ${padding}`}
      >
        Vote no
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onVote("abstain")}
        className={`rounded-full border border-white/10 font-medium text-zinc-400 transition-colors hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:text-zinc-600 ${padding}`}
      >
        Abstain
      </button>
    </div>
  );
}
