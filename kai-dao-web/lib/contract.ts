import { z } from "zod";

/**
 * The contract replies with a JSON string inside a JSON string:
 *
 *   {"ok":true,"output":"{\"ok\":true,\"data\":\"1000000000000000000|…\"}"}
 *
 * The outer `ok` is about the query, not about the contract. A refusal looks
 * like `{"ok":true,"output":"{\"ok\":false,\"error\":\"caller has no voting power\"}"}`.
 * Treating the outer flag as the result is the classic way to show success for
 * a call the chain refused, so this module is the only place that may read
 * `output`.
 *
 * Field order below is taken from examples/StakeDao/src/lib.rs. The chain does
 * not publish an ABI, so this file and `lib/dao.ts` together are the ABI.
 */

export type ContractReply = { kind: "ok"; data: string } | { kind: "refused"; error: string };

export class ContractShapeError extends Error {}

const replySchema = z.union([
  z.object({ ok: z.literal(true), data: z.string() }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);

export function parseContractReply(rawOutput: string): ContractReply {
  let outer: unknown;
  try {
    outer = JSON.parse(rawOutput);
  } catch {
    throw new ContractShapeError("The contract reply was not JSON.");
  }

  const parsed = replySchema.safeParse(outer);
  if (!parsed.success) {
    throw new ContractShapeError(
      "The contract reply was JSON but not a reply this app understands.",
    );
  }

  return parsed.data.ok
    ? { kind: "ok", data: parsed.data.data }
    : { kind: "refused", error: parsed.data.error };
}

/** Addresses on chain are shape-checked, not checksum-checked: a contract
 * cannot compute blake3. The UI still verifies what the user types. */
const ADDRESS = /^rete[0-9a-f]{68}$/;

export function isChainAddress(value: string): boolean {
  return ADDRESS.test(value);
}

function toAtomic(value: string, field = "amount"): bigint {
  if (!/^\d+$/.test(value)) {
    throw new ContractShapeError(`${field} is not an atomic amount`);
  }
  return BigInt(value);
}

function toCount(value: string, field = "count"): number {
  if (!/^\d+$/.test(value)) {
    throw new ContractShapeError(`${field} is not a number`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new ContractShapeError(`${field} is too large to display`);
  }
  return parsed;
}

function toTime(value: string, field = "timestamp"): number {
  if (!/^\d+$/.test(value)) {
    throw new ContractShapeError(`${field} is not a timestamp`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new ContractShapeError(`${field} is out of range`);
  }
  return parsed;
}

function toAddress(value: string, field: string): string {
  if (!ADDRESS.test(value)) {
    throw new ContractShapeError(`${field} is not an address`);
  }
  return value;
}

export type DaoConfig = {
  minStakeAtomic: bigint;
  proposeThresholdAtomic: bigint;
  quorumBps: number;
  votingPeriodMs: number;
  timelockMs: number;
  graceMs: number;
  depositAtomic: bigint;
  totalStakedAtomic: bigint;
  treasuryAtomic: bigint;
  proposalCount: number;
};

/** `min_stake|propose_threshold|quorum_bps|voting_period_ms|timelock_ms|grace_ms|deposit|total_staked|treasury|proposal_count` */
export function parseConfig(data: string): DaoConfig {
  const parts = data.split("|");
  if (parts.length !== 10) {
    throw new ContractShapeError(`config has ${parts.length} fields, expected 10`);
  }

  const [
    minStake,
    proposeThreshold,
    quorumBps,
    votingPeriod,
    timelock,
    grace,
    deposit,
    totalStaked,
    treasury,
    proposalCount,
  ] = parts as [string, string, string, string, string, string, string, string, string, string];

  const quorum = toCount(quorumBps, "quorum_bps");
  if (quorum < 1 || quorum > 10_000) {
    throw new ContractShapeError(`quorum_bps is ${quorum}`);
  }

  return {
    minStakeAtomic: toAtomic(minStake, "min_stake"),
    proposeThresholdAtomic: toAtomic(proposeThreshold, "propose_threshold"),
    quorumBps: quorum,
    votingPeriodMs: toTime(votingPeriod, "voting_period_ms"),
    timelockMs: toTime(timelock, "timelock_ms"),
    graceMs: toTime(grace, "grace_ms"),
    depositAtomic: toAtomic(deposit, "deposit"),
    totalStakedAtomic: toAtomic(totalStaked, "total_staked"),
    treasuryAtomic: toAtomic(treasury, "treasury"),
    proposalCount: toCount(proposalCount, "proposal_count"),
  };
}

export type Stats = {
  totalStakedAtomic: bigint;
  treasuryAtomic: bigint;
  proposalCount: number;
};

/** `total_staked|treasury|proposal_count` */
export function parseStats(data: string): Stats {
  const parts = data.split("|");
  if (parts.length !== 3) {
    throw new ContractShapeError(`stats has ${parts.length} fields, expected 3`);
  }
  const [totalStaked, treasury, proposalCount] = parts as [string, string, string];
  return {
    totalStakedAtomic: toAtomic(totalStaked, "total_staked"),
    treasuryAtomic: toAtomic(treasury, "treasury"),
    proposalCount: toCount(proposalCount, "proposal_count"),
  };
}

export type ProposalStatus =
  "active" | "queued" | "executed" | "defeated" | "cancelled" | "expired";

const STATUSES: ProposalStatus[] = [
  "active",
  "queued",
  "executed",
  "defeated",
  "cancelled",
  "expired",
];

export type Proposal = {
  id: number;
  proposer: string;
  recipient: string;
  amountAtomic: bigint;
  depositAtomic: bigint;
  status: ProposalStatus;
  createdMs: number;
  votingEnds: number;
  timelockEnds: number;
  graceEnds: number;
  quorumAtomic: bigint;
  yesAtomic: bigint;
  noAtomic: bigint;
  abstainAtomic: bigint;
};

/**
 * `proposer|recipient|amount|deposit|status|created_ms|voting_ends|
 *  timelock_ends|grace_ends|quorum|yes|no|abstain`
 */
export function parseProposal(id: number, data: string): Proposal {
  const parts = data.split("|");
  if (parts.length !== 13) {
    throw new ContractShapeError(`proposal has ${parts.length} fields, expected 13`);
  }

  const [
    proposer,
    recipient,
    amount,
    deposit,
    status,
    created,
    votingEnds,
    timelockEnds,
    graceEnds,
    quorum,
    yes,
    no,
    abstain,
  ] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];

  if (!STATUSES.includes(status as ProposalStatus)) {
    throw new ContractShapeError(`proposal status is "${status}"`);
  }

  return {
    id,
    proposer: toAddress(proposer, "proposer"),
    recipient: toAddress(recipient, "recipient"),
    amountAtomic: toAtomic(amount, "amount"),
    depositAtomic: toAtomic(deposit, "deposit"),
    status: status as ProposalStatus,
    createdMs: toTime(created, "created_ms"),
    votingEnds: toTime(votingEnds, "voting_ends"),
    timelockEnds: toTime(timelockEnds, "timelock_ends"),
    graceEnds: toTime(graceEnds, "grace_ends"),
    quorumAtomic: toAtomic(quorum, "quorum"),
    yesAtomic: toAtomic(yes, "yes"),
    noAtomic: toAtomic(no, "no"),
    abstainAtomic: toAtomic(abstain, "abstain"),
  };
}

export type VoteChoice = "yes" | "no" | "abstain";

/** `yes`, `no`, `abstain`, or an empty string when the address has not voted. */
export function parseVote(data: string): VoteChoice | null {
  if (data === "yes" || data === "no" || data === "abstain") return data;
  if (data === "") return null;
  throw new ContractShapeError(`vote is "${data}"`);
}

/** `delegate_of` replies with an address, or "" when the stake is self-held. */
export function parseDelegate(data: string): string | null {
  if (data === "") return null;
  return toAddress(data, "delegate");
}

/** Balances and powers are atomic units in a decimal string. */
export function parseAtomic(data: string): bigint {
  return toAtomic(data);
}

export type DaoEvent =
  | {
      type: "dao_initialized";
      owner: string;
      minStakeAtomic: bigint;
      proposeThresholdAtomic: bigint;
      quorumBps: number;
      votingPeriodMs: number;
      timelockMs: number;
      graceMs: number;
      depositAtomic: bigint;
    }
  | { type: "treasury_deposit"; from: string; amountAtomic: bigint; treasuryAtomic: bigint }
  | {
      type: "staked";
      staker: string;
      amountAtomic: bigint;
      powerTo: string;
      stakedAtomic: bigint;
      totalStakedAtomic: bigint;
    }
  | { type: "unstaked"; staker: string; amountAtomic: bigint; stakedAtomic: bigint }
  | { type: "delegated"; delegator: string; oldDelegate: string; to: string; amountAtomic: bigint }
  | {
      type: "proposal_created";
      id: number;
      proposer: string;
      recipient: string;
      amountAtomic: bigint;
      description: string;
      votingEnds: number;
      quorumAtomic: bigint;
    }
  | {
      type: "vote_cast";
      id: number;
      voter: string;
      choice: string;
      weightAtomic: bigint;
      yesAtomic: bigint;
      noAtomic: bigint;
      abstainAtomic: bigint;
    }
  | {
      type: "proposal_queued";
      id: number;
      yesAtomic: bigint;
      noAtomic: bigint;
      abstainAtomic: bigint;
      quorumAtomic: bigint;
      timelockEnds: number;
      graceEnds: number;
    }
  | {
      type: "proposal_defeated";
      id: number;
      reason: string;
      yesAtomic: bigint;
      noAtomic: bigint;
      abstainAtomic: bigint;
      quorumAtomic: bigint;
      participationAtomic: bigint;
    }
  | {
      type: "proposal_executed";
      id: number;
      recipient: string;
      amountAtomic: bigint;
      depositReturnedAtomic: bigint;
      treasuryAtomic: bigint;
    }
  | { type: "proposal_cancelled"; id: number; proposer: string; depositKeptAtomic: bigint }
  | { type: "proposal_expired"; id: number; depositKeptAtomic: bigint }
  | { type: "skimmed"; amountAtomic: bigint; treasuryAtomic: bigint }
  | { type: "unknown"; eventType: string; raw: string };

export function parseEventData(eventType: string, raw: string): DaoEvent {
  const fields = parseFields(raw);

  switch (eventType) {
    case "dao_initialized":
      return {
        type: "dao_initialized",
        owner: toAddress(text(fields.owner), "owner"),
        minStakeAtomic: toAtomic(text(fields.min_stake), "min_stake"),
        proposeThresholdAtomic: toAtomic(text(fields.propose_threshold), "propose_threshold"),
        quorumBps: toCount(text(fields.quorum_bps), "quorum_bps"),
        votingPeriodMs: toTime(text(fields.voting_period_ms), "voting_period_ms"),
        timelockMs: toTime(text(fields.timelock_ms), "timelock_ms"),
        graceMs: toTime(text(fields.grace_ms), "grace_ms"),
        depositAtomic: toAtomic(text(fields.deposit), "deposit"),
      };
    case "treasury_deposit":
      return {
        type: "treasury_deposit",
        from: toAddress(text(fields.from), "from"),
        amountAtomic: amount(fields.amount),
        treasuryAtomic: amount(fields.treasury),
      };
    case "staked":
      return {
        type: "staked",
        staker: toAddress(text(fields.staker), "staker"),
        amountAtomic: amount(fields.amount),
        powerTo: toAddress(text(fields.power_to), "power_to"),
        stakedAtomic: amount(fields.staked),
        totalStakedAtomic: amount(fields.total_staked),
      };
    case "unstaked":
      return {
        type: "unstaked",
        staker: toAddress(text(fields.staker), "staker"),
        amountAtomic: amount(fields.amount),
        stakedAtomic: amount(fields.staked),
      };
    case "delegated":
      return {
        type: "delegated",
        delegator: toAddress(text(fields.delegator), "delegator"),
        // The old delegate is "" when the stake was self-held.
        oldDelegate: text(fields.old_delegate),
        to: toAddress(text(fields.to), "to"),
        amountAtomic: amount(fields.amount),
      };
    case "proposal_created":
      return {
        type: "proposal_created",
        id: count(fields.id),
        proposer: toAddress(text(fields.proposer), "proposer"),
        recipient: toAddress(text(fields.recipient), "recipient"),
        amountAtomic: amount(fields.amount),
        description: text(fields.description),
        votingEnds: count(fields.voting_ends),
        quorumAtomic: amount(fields.quorum),
      };
    case "vote_cast":
      return {
        type: "vote_cast",
        id: count(fields.id),
        voter: toAddress(text(fields.voter), "voter"),
        choice: text(fields.choice),
        weightAtomic: amount(fields.weight),
        yesAtomic: amount(fields.yes),
        noAtomic: amount(fields.no),
        abstainAtomic: amount(fields.abstain),
      };
    case "proposal_queued":
      return {
        type: "proposal_queued",
        id: count(fields.id),
        yesAtomic: amount(fields.yes),
        noAtomic: amount(fields.no),
        abstainAtomic: amount(fields.abstain),
        quorumAtomic: amount(fields.quorum),
        timelockEnds: count(fields.timelock_ends),
        graceEnds: count(fields.grace_ends),
      };
    case "proposal_defeated":
      return {
        type: "proposal_defeated",
        id: count(fields.id),
        reason: text(fields.reason),
        yesAtomic: amount(fields.yes),
        noAtomic: amount(fields.no),
        abstainAtomic: amount(fields.abstain),
        quorumAtomic: amount(fields.quorum),
        participationAtomic: amount(fields.participation),
      };
    case "proposal_executed":
      return {
        type: "proposal_executed",
        id: count(fields.id),
        recipient: toAddress(text(fields.recipient), "recipient"),
        amountAtomic: amount(fields.amount),
        depositReturnedAtomic: amount(fields.deposit_returned),
        treasuryAtomic: amount(fields.treasury),
      };
    case "proposal_cancelled":
      return {
        type: "proposal_cancelled",
        id: count(fields.id),
        proposer: toAddress(text(fields.proposer), "proposer"),
        depositKeptAtomic: amount(fields.deposit_kept),
      };
    case "proposal_expired":
      return {
        type: "proposal_expired",
        id: count(fields.id),
        depositKeptAtomic: amount(fields.deposit_kept),
      };
    case "skimmed":
      return {
        type: "skimmed",
        amountAtomic: amount(fields.amount),
        treasuryAtomic: amount(fields.treasury),
      };
    default:
      return { type: "unknown", eventType, raw };
  }
}

function parseFields(raw: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new ContractShapeError("event data is not JSON");
  }
  const parsed = z.record(z.string(), z.unknown()).safeParse(value);
  if (!parsed.success) throw new ContractShapeError("event data is not an object");
  return parsed.data;
}

function text(value: unknown): string {
  if (typeof value !== "string") throw new ContractShapeError("event field is not text");
  return value;
}

function count(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isSafeInteger(parsed) || parsed < 0) {
    throw new ContractShapeError("event field is not a count");
  }
  return parsed;
}

function amount(value: unknown): bigint {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new ContractShapeError("event field is not an amount");
  }
  return BigInt(value);
}
