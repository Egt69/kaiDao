import { blake3 } from "@noble/hashes/blake3.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

/**
 * A Retium address is `rete` + 64 hex (blake3 of the public key) + 4 hex
 * (checksum), 72 characters in all. The checksum is
 * `blake3("retium.addr.v1" || hash)` cut to two bytes.
 *
 * This mirrors `crates/retium-sdk/src/address.rs`. It was checked against three
 * real addresses and rejects a one-character change, so the UI can refuse a
 * typo before the wallet ever sees it.
 */

export const ADDRESS_PREFIX = "rete";
export const ADDRESS_LENGTH = 72;

const CHECKSUM_DOMAIN = new TextEncoder().encode("retium.addr.v1");
const HEX_BODY = /^[0-9a-f]{68}$/;

export type AddressProblem = "empty" | "length" | "prefix" | "characters" | "checksum";

const PROBLEM_TEXT: Record<AddressProblem, string> = {
  empty: "Enter an address.",
  length: `A Retium address is exactly ${ADDRESS_LENGTH} characters.`,
  prefix: "A Retium address starts with rete.",
  characters: "Only lowercase hex digits may follow the rete prefix.",
  checksum: "The checksum does not match. This address contains a typo or is incomplete.",
};

/** The exact reason a string is not a valid address, or null when it is one. */
export function addressProblem(value: string): AddressProblem | null {
  const address = value.trim();

  if (address === "") return "empty";
  if (address.length !== ADDRESS_LENGTH) return "length";
  if (!address.startsWith(ADDRESS_PREFIX)) return "prefix";

  const body = address.slice(ADDRESS_PREFIX.length);
  if (!HEX_BODY.test(body)) return "characters";

  const hash = hexToBytes(body.slice(0, 64));
  const checksum = body.slice(64, 68);

  const input = new Uint8Array(CHECKSUM_DOMAIN.length + hash.length);
  input.set(CHECKSUM_DOMAIN, 0);
  input.set(hash, CHECKSUM_DOMAIN.length);

  const expected = bytesToHex(blake3(input).slice(0, 2));
  return expected === checksum ? null : "checksum";
}

export function isValidAddress(value: string): boolean {
  return addressProblem(value) === null;
}

export function addressProblemText(value: string): string | null {
  const problem = addressProblem(value);
  return problem ? PROBLEM_TEXT[problem] : null;
}

/**
 * Display helper for tables only. Never use it on a confirmation screen: a
 * shortened address is how address poisoning works.
 */
export function shortenAddress(value: string, edge = 6): string {
  if (value.length <= edge * 2 + 3) return value;
  return `${value.slice(0, edge + 4)}…${value.slice(-edge)}`;
}
