import Link from "next/link";
import type { ReactNode } from "react";
import { safeUrl } from "@/lib/safe-url";

export function Panel({
  title,
  description,
  children,
  actions,
  icon,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/[0.09] bg-white/[0.02]">
      <header className="flex flex-wrap items-center justify-between gap-2 px-5 pb-3 pt-4">
        <div className="flex items-center gap-2.5">
          {icon ? (
            <span className="text-kai">{icon}</span>
          ) : (
            <span className="h-4 w-1 rounded-full bg-kai" />
          )}
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
            {description ? <p className="mt-0.5 text-xs text-zinc-500">{description}</p> : null}
          </div>
        </div>
        {actions}
      </header>
      <div className="px-5 pb-5">{children}</div>
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</span>
      <span className="text-sm text-zinc-100">{children}</span>
    </div>
  );
}

export function Stat({
  label,
  hint,
  children,
  icon,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.09] bg-white/[0.02] px-5 py-4">
      <div className="pointer-events-none absolute -bottom-12 right-0 h-24 w-32 rounded-full bg-kai/[0.06] blur-2xl" />
      <div className="relative flex items-center gap-2">
        {icon ? <span className="text-kai">{icon}</span> : null}
        <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
      </div>
      <p className="relative mt-2 text-2xl font-semibold tracking-tight text-zinc-50">{children}</p>
      {hint ? <p className="relative mt-1 text-[11px] text-zinc-600">{hint}</p> : null}
    </div>
  );
}

export function Notice({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "warning" | "danger" | "success" | "accent";
  children: ReactNode;
}) {
  const styles = {
    neutral: "border-white/10 bg-white/[0.03] text-zinc-400",
    accent: "border-kai/30 bg-kai/[0.08] text-kai-soft",
    warning: "border-amber-500/30 bg-amber-500/[0.08] text-amber-200",
    danger: "border-red-500/40 bg-red-500/[0.08] text-red-200",
    success: "border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-200",
  } as const;

  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${styles[tone]}`} role="status">
      {children}
    </div>
  );
}

export function Loading({ what }: { what: string }) {
  return (
    <p className="text-sm text-zinc-500" aria-busy="true">
      Loading {what}…
    </p>
  );
}

export function Failure({ message, hint }: { message: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-red-500/40 bg-red-500/[0.08] px-4 py-3 text-sm text-red-200">
      <p>{message}</p>
      {hint ? <p className="mt-1 text-xs text-red-300/80">{hint}</p> : null}
    </div>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON: Record<ButtonVariant, string> = {
  primary:
    "bg-kai text-black font-semibold hover:bg-kai-soft disabled:bg-white/[0.07] disabled:text-zinc-500 disabled:opacity-100",
  secondary:
    "border border-white/10 bg-white/[0.04] text-zinc-200 hover:border-white/20 hover:text-white",
  ghost: "text-zinc-400 hover:text-white",
  danger: "border border-red-500/40 bg-red-500/10 text-red-200 hover:bg-red-500/20",
};

export function LinkButton({
  href,
  variant = "primary",
  external = false,
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  external?: boolean;
  children: ReactNode;
}) {
  const className = `inline-flex items-center rounded-full px-4 py-2 text-sm transition-colors ${BUTTON[variant]}`;

  if (external) {
    return (
      <a href={safeUrl(href)} target="_blank" rel="noreferrer noopener" className={className}>
        {children}
      </a>
    );
  }

  return (
    <Link href={safeUrl(href)} className={className}>
      {children}
    </Link>
  );
}
