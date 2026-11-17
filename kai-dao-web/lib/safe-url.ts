/**
 * One gate for every URL the interface puts in an `href` or `src`.
 *
 * Most links here are internal routes, but a dApp also renders values it did
 * not write: an address, an id, and one day maybe a URL from the chain. A
 * browser will run `href="java…script:…"` and will load `src` from any scheme,
 * so the rule is an allowlist, not a blocklist: a same-origin path or `https:`
 * and nothing else. Anything else becomes `#`, a link that goes nowhere.
 *
 * Allowlist by construction is the point: a new scheme the browser invents
 * later is refused without anyone remembering to add it here.
 */
const FALLBACK = "#";

/** Control characters can hide a scheme from a naive check (`java\nscript:`). */
const CONTROL = /[\u0000-\u001f\u007f]/;

export function safeUrl(value: string | null | undefined): string {
  if (typeof value !== "string") return FALLBACK;

  const candidate = value.trim();
  if (candidate === "" || CONTROL.test(candidate)) return FALLBACK;

  if (candidate.startsWith("/")) {
    // `//host` and `/\host` are protocol-relative: the browser leaves this site.
    if (candidate.startsWith("//") || candidate.startsWith("/\\")) return FALLBACK;
    return candidate;
  }

  try {
    const url = new URL(candidate);
    if (url.protocol === "https:" && url.hostname !== "") return candidate;
  } catch {
    return FALLBACK;
  }

  return FALLBACK;
}
