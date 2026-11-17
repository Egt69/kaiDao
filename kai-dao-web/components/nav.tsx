"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { safeUrl } from "@/lib/safe-url";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/stake", label: "Stake" },
  { href: "/proposals", label: "Proposals" },
  { href: "/treasury", label: "Treasury" },
  { href: "/activity", label: "Activity" },
  { href: "/parameters", label: "Parameters" },
];

/**
 * The current section is marked by colour and a filled pill, not by colour
 * alone, so it is still readable for someone who cannot tell orange from grey.
 */
export function Nav() {
  const pathname = usePathname();

  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <nav aria-label="Main" className="flex flex-wrap items-center gap-1 text-sm">
      {LINKS.map((item) => {
        const active = isActive(item.href);

        return (
          <Link
            key={item.href}
            href={safeUrl(item.href)}
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-3 py-1.5 transition-colors ${
              active
                ? "bg-kai/10 font-medium text-kai"
                : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
