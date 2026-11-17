"use client";

import { useEffect, useState } from "react";

/**
 * Deadlines are chain timestamps in milliseconds. The absolute time is the
 * source of truth; the relative text is a convenience and is derived from the
 * browser clock, so it can drift by the user's own clock error.
 */
export function Countdown({
  deadline,
  prefix,
  showAbsolute = true,
}: {
  deadline: number;
  prefix?: string;
  showAbsolute?: boolean;
}) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  if (deadline === 0) {
    return <span className="text-zinc-500">—</span>;
  }

  const absolute = new Date(deadline);

  return (
    <span className="inline-flex flex-col gap-0.5 text-xs">
      {showAbsolute ? (
        <span className="text-zinc-300">
          {absolute.toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </span>
      ) : null}
      <span className="text-zinc-500">
        {prefix ? `${prefix} ` : ""}
        {now === null ? "…" : relative(deadline - now)}
      </span>
    </span>
  );
}

function relative(deltaMs: number): string {
  const past = deltaMs < 0;
  let seconds = Math.floor(Math.abs(deltaMs) / 1000);

  const days = Math.floor(seconds / 86_400);
  seconds -= days * 86_400;
  const hours = Math.floor(seconds / 3_600);
  seconds -= hours * 3_600;
  const minutes = Math.floor(seconds / 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (days === 0) parts.push(`${minutes}m`);

  const text = parts.join(" ") || "less than a minute";
  return past ? `${text} ago` : `in ${text}`;
}
