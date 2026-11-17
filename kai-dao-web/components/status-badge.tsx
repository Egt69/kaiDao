import type { ProposalStatus } from "@/lib/contract";

const STYLES: Record<ProposalStatus, string> = {
  active: "border-kai/50 bg-kai/10 text-kai",
  queued: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  executed: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  defeated: "border-red-500/40 bg-red-500/10 text-red-300",
  cancelled: "border-line bg-panel-soft text-zinc-400",
  expired: "border-amber-500/40 bg-amber-500/10 text-amber-300",
};

export function StatusBadge({ status }: { status: ProposalStatus }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${STYLES[status]}`}
    >
      {status}
    </span>
  );
}
