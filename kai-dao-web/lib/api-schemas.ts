import { z } from "zod";

/**
 * Shapes of this app's own JSON. The server already validated the node's answer,
 * but the browser validates again: a stale deploy, a proxy in the middle or a
 * bug in a route must not become a wrong number on screen.
 */

const atomic = z.string().regex(/^\d+$/);
const address = z.string().regex(/^rete[0-9a-f]{68}$/);
const hex64 = z.string().regex(/^[0-9a-f]{64}$/);

export const proposalStatusSchema = z.enum([
  "active",
  "queued",
  "executed",
  "defeated",
  "cancelled",
  "expired",
]);

export const voteChoiceSchema = z.enum(["yes", "no", "abstain"]);

export const configDtoSchema = z.object({
  minStakeAtomic: atomic,
  proposeThresholdAtomic: atomic,
  quorumBps: z.number().int().min(1).max(10_000),
  votingPeriodMs: z.number().int().nonnegative(),
  timelockMs: z.number().int().nonnegative(),
  graceMs: z.number().int().nonnegative(),
  depositAtomic: atomic,
  totalStakedAtomic: atomic,
  treasuryAtomic: atomic,
  proposalCount: z.number().int().nonnegative(),
});

export const proposalDtoSchema = z.object({
  id: z.number().int().positive(),
  description: z.string().optional(),
  proposer: address,
  recipient: address,
  amountAtomic: atomic,
  depositAtomic: atomic,
  status: proposalStatusSchema,
  createdMs: z.number().int().nonnegative(),
  votingEnds: z.number().int().nonnegative(),
  timelockEnds: z.number().int().nonnegative(),
  graceEnds: z.number().int().nonnegative(),
  quorumAtomic: atomic,
  yesAtomic: atomic,
  noAtomic: atomic,
  abstainAtomic: atomic,
});

export const overviewDtoSchema = z.object({
  health: z.object({
    status: z.string(),
    tick: z.number().int().nonnegative(),
    peers: z.number().int().nonnegative().optional(),
    version: z.string(),
  }),
  contract: z.object({
    contractId: hex64,
    deployer: address,
    codeHash: hex64,
    type: z.string(),
    version: z.string(),
    traits: z.array(z.string()),
    weight: z.number().int().nonnegative().nullable(),
    status: z.string(),
  }),
  config: configDtoSchema.nullable(),
  codeHashMatches: z.boolean(),
  configProblem: z.string().nullable(),
});

export const accountDtoSchema = z.object({
  address,
  stakedAtomic: atomic,
  powerAtomic: atomic,
  delegate: address.nullable(),
  lockMs: z.number().int().nonnegative(),
  vote: voteChoiceSchema.nullable(),
  proposalId: z.number().int().positive().nullable(),
});

export const votesDtoSchema = z.object({
  address,
  stakedAtomic: atomic,
  powerAtomic: atomic,
  lockMs: z.number().int().nonnegative(),
  votes: z.array(
    z.object({
      id: z.number().int().positive(),
      choice: voteChoiceSchema,
    }),
  ),
  votesComplete: z.boolean(),
});

export const proposalListDtoSchema = z.object({
  proposals: z.array(proposalDtoSchema),
  total: z.number().int().nonnegative(),
  shown: z.number().int().nonnegative(),
  truncated: z.boolean(),
});

export const proposalDetailDtoSchema = z.object({
  proposal: proposalDtoSchema,
  description: z.string(),
  voters: z.array(
    z.object({
      voter: address,
      choice: voteChoiceSchema,
      weightAtomic: atomic,
    }),
  ),
  votersComplete: z.boolean(),
});

const eventDataSchema = z.union([
  z.object({
    type: z.literal("dao_initialized"),
    owner: address,
    minStakeAtomic: atomic,
    proposeThresholdAtomic: atomic,
    quorumBps: z.number(),
    votingPeriodMs: z.number(),
    timelockMs: z.number(),
    graceMs: z.number(),
    depositAtomic: atomic,
  }),
  z.object({
    type: z.literal("treasury_deposit"),
    from: address,
    amountAtomic: atomic,
    treasuryAtomic: atomic,
  }),
  z.object({
    type: z.literal("staked"),
    staker: address,
    amountAtomic: atomic,
    powerTo: address,
    stakedAtomic: atomic,
    totalStakedAtomic: atomic,
  }),
  z.object({
    type: z.literal("unstaked"),
    staker: address,
    amountAtomic: atomic,
    stakedAtomic: atomic,
  }),
  z.object({
    type: z.literal("delegated"),
    delegator: address,
    oldDelegate: z.string(),
    to: address,
    amountAtomic: atomic,
  }),
  z.object({
    type: z.literal("proposal_created"),
    id: z.number(),
    proposer: address,
    recipient: address,
    amountAtomic: atomic,
    description: z.string(),
    votingEnds: z.number(),
    quorumAtomic: atomic,
  }),
  z.object({
    type: z.literal("vote_cast"),
    id: z.number(),
    voter: address,
    choice: z.string(),
    weightAtomic: atomic,
    yesAtomic: atomic,
    noAtomic: atomic,
    abstainAtomic: atomic,
  }),
  z.object({
    type: z.literal("proposal_queued"),
    id: z.number(),
    yesAtomic: atomic,
    noAtomic: atomic,
    abstainAtomic: atomic,
    quorumAtomic: atomic,
    timelockEnds: z.number(),
    graceEnds: z.number(),
  }),
  z.object({
    type: z.literal("proposal_defeated"),
    id: z.number(),
    reason: z.string(),
    yesAtomic: atomic,
    noAtomic: atomic,
    abstainAtomic: atomic,
    quorumAtomic: atomic,
    participationAtomic: atomic,
  }),
  z.object({
    type: z.literal("proposal_executed"),
    id: z.number(),
    recipient: address,
    amountAtomic: atomic,
    depositReturnedAtomic: atomic,
    treasuryAtomic: atomic,
  }),
  z.object({
    type: z.literal("proposal_cancelled"),
    id: z.number(),
    proposer: address,
    depositKeptAtomic: atomic,
  }),
  z.object({ type: z.literal("proposal_expired"), id: z.number(), depositKeptAtomic: atomic }),
  z.object({ type: z.literal("skimmed"), amountAtomic: atomic, treasuryAtomic: atomic }),
  z.object({ type: z.literal("unknown"), eventType: z.string(), raw: z.string() }),
]);

export const eventDtoSchema = z.object({
  eventType: z.string(),
  eventIdx: z.number().int().nonnegative(),
  txId: z.string().nullable(),
  timestamp: z.number().int().nonnegative().nullable(),
  tick: z.number().int().nonnegative().nullable(),
  data: eventDataSchema,
});

export const eventPageDtoSchema = z.object({
  events: z.array(eventDtoSchema),
  next: z.string().nullable(),
  more: z.boolean(),
});

export const txDtoSchema = z.object({
  txId: z.string(),
  finality: z.enum(["Pending", "SoftFinal", "HardFinal", "Rejected", "Voided"]),
  execStatus: z.enum(["ok", "failed", "pending"]).nullable(),
  execError: z.string().nullable(),
  action: z.string().nullable(),
  settled: z.boolean(),
});

export const apiErrorBodySchema = z.object({
  error: z.object({
    kind: z.string(),
    message: z.string(),
    status: z.number().int().optional(),
    retryable: z.boolean(),
  }),
});
