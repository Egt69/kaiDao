import type { DaoConfig, DaoEvent, Proposal, ProposalStatus, VoteChoice } from "./contract";
import type { ContractEvent, ContractRecord, Health } from "./schemas";

/**
 * JSON-safe views of chain data. `bigint` cannot be serialised, so every amount
 * crosses to the browser as a decimal string and stays one.
 */

export type ConfigDto = {
  minStakeAtomic: string;
  proposeThresholdAtomic: string;
  quorumBps: number;
  votingPeriodMs: number;
  timelockMs: number;
  graceMs: number;
  depositAtomic: string;
  totalStakedAtomic: string;
  treasuryAtomic: string;
  proposalCount: number;
};

export function toConfigDto(config: DaoConfig): ConfigDto {
  return {
    minStakeAtomic: config.minStakeAtomic.toString(),
    proposeThresholdAtomic: config.proposeThresholdAtomic.toString(),
    quorumBps: config.quorumBps,
    votingPeriodMs: config.votingPeriodMs,
    timelockMs: config.timelockMs,
    graceMs: config.graceMs,
    depositAtomic: config.depositAtomic.toString(),
    totalStakedAtomic: config.totalStakedAtomic.toString(),
    treasuryAtomic: config.treasuryAtomic.toString(),
    proposalCount: config.proposalCount,
  };
}

export type ProposalDto = {
  id: number;
  proposer: string;
  recipient: string;
  amountAtomic: string;
  depositAtomic: string;
  status: ProposalStatus;
  createdMs: number;
  votingEnds: number;
  timelockEnds: number;
  graceEnds: number;
  quorumAtomic: string;
  yesAtomic: string;
  noAtomic: string;
  abstainAtomic: string;
};

export function toProposalDto(proposal: Proposal): ProposalDto {
  return {
    id: proposal.id,
    proposer: proposal.proposer,
    recipient: proposal.recipient,
    amountAtomic: proposal.amountAtomic.toString(),
    depositAtomic: proposal.depositAtomic.toString(),
    status: proposal.status,
    createdMs: proposal.createdMs,
    votingEnds: proposal.votingEnds,
    timelockEnds: proposal.timelockEnds,
    graceEnds: proposal.graceEnds,
    quorumAtomic: proposal.quorumAtomic.toString(),
    yesAtomic: proposal.yesAtomic.toString(),
    noAtomic: proposal.noAtomic.toString(),
    abstainAtomic: proposal.abstainAtomic.toString(),
  };
}

export type ContractDto = {
  contractId: string;
  deployer: string;
  codeHash: string;
  type: string;
  version: string;
  traits: string[];
  weight: number | null;
  status: string;
};

export function toContractDto(contract: ContractRecord): ContractDto {
  return {
    contractId: contract.contract_id,
    deployer: contract.deployer,
    codeHash: contract.code_hash,
    type: contract.rcp_metadata.rcp_type,
    version: contract.rcp_metadata.version,
    traits: contract.rcp_metadata.traits,
    weight: contract.weight ?? null,
    status: contract.status,
  };
}

export type OverviewDto = {
  health: Health;
  contract: ContractDto;
  config: ConfigDto | null;
  codeHashMatches: boolean;
  /** Set when the contract answered `config` with a refusal, e.g. before init. */
  configProblem: string | null;
};

export type AccountDto = {
  address: string;
  stakedAtomic: string;
  powerAtomic: string;
  delegate: string | null;
  lockMs: number;
  /** Only present when the request named a proposal. */
  vote: VoteChoice | null;
  proposalId: number | null;
};

export type VoterDto = {
  voter: string;
  choice: VoteChoice;
  weightAtomic: string;
};

export type ProposalDetailDto = {
  proposal: ProposalDto;
  description: string;
  voters: VoterDto[];
  /** False when the event log was too long to read completely. */
  votersComplete: boolean;
};

export type ProposalListDto = {
  proposals: ProposalDto[];
  total: number;
  shown: number;
  truncated: boolean;
};

export type EventDto = {
  eventType: string;
  eventIdx: number;
  txId: string | null;
  timestamp: number | null;
  tick: number | null;
  data: DaoEventJson;
};

export type DaoEventJson =
  | {
      type: "dao_initialized";
      owner: string;
      minStakeAtomic: string;
      proposeThresholdAtomic: string;
      quorumBps: number;
      votingPeriodMs: number;
      timelockMs: number;
      graceMs: number;
      depositAtomic: string;
    }
  | { type: "treasury_deposit"; from: string; amountAtomic: string; treasuryAtomic: string }
  | {
      type: "staked";
      staker: string;
      amountAtomic: string;
      powerTo: string;
      stakedAtomic: string;
      totalStakedAtomic: string;
    }
  | { type: "unstaked"; staker: string; amountAtomic: string; stakedAtomic: string }
  | { type: "delegated"; delegator: string; oldDelegate: string; to: string; amountAtomic: string }
  | {
      type: "proposal_created";
      id: number;
      proposer: string;
      recipient: string;
      amountAtomic: string;
      description: string;
      votingEnds: number;
      quorumAtomic: string;
    }
  | {
      type: "vote_cast";
      id: number;
      voter: string;
      choice: string;
      weightAtomic: string;
      yesAtomic: string;
      noAtomic: string;
      abstainAtomic: string;
    }
  | {
      type: "proposal_queued";
      id: number;
      yesAtomic: string;
      noAtomic: string;
      abstainAtomic: string;
      quorumAtomic: string;
      timelockEnds: number;
      graceEnds: number;
    }
  | {
      type: "proposal_defeated";
      id: number;
      reason: string;
      yesAtomic: string;
      noAtomic: string;
      abstainAtomic: string;
      quorumAtomic: string;
      participationAtomic: string;
    }
  | {
      type: "proposal_executed";
      id: number;
      recipient: string;
      amountAtomic: string;
      depositReturnedAtomic: string;
      treasuryAtomic: string;
    }
  | { type: "proposal_cancelled"; id: number; proposer: string; depositKeptAtomic: string }
  | { type: "proposal_expired"; id: number; depositKeptAtomic: string }
  | { type: "skimmed"; amountAtomic: string; treasuryAtomic: string }
  | { type: "unknown"; eventType: string; raw: string };

export function toEventDto(event: ContractEvent & { parsed: DaoEvent }): EventDto {
  return {
    eventType: event.event_type,
    eventIdx: event.event_idx,
    txId: event.tx_id ?? null,
    timestamp: event.timestamp ?? null,
    tick: event.tick ?? null,
    data: eventJson(event.parsed),
  };
}

function eventJson(event: DaoEvent): DaoEventJson {
  switch (event.type) {
    case "dao_initialized":
      return {
        type: event.type,
        owner: event.owner,
        minStakeAtomic: event.minStakeAtomic.toString(),
        proposeThresholdAtomic: event.proposeThresholdAtomic.toString(),
        quorumBps: event.quorumBps,
        votingPeriodMs: event.votingPeriodMs,
        timelockMs: event.timelockMs,
        graceMs: event.graceMs,
        depositAtomic: event.depositAtomic.toString(),
      };
    case "treasury_deposit":
      return {
        type: event.type,
        from: event.from,
        amountAtomic: event.amountAtomic.toString(),
        treasuryAtomic: event.treasuryAtomic.toString(),
      };
    case "staked":
      return {
        type: event.type,
        staker: event.staker,
        amountAtomic: event.amountAtomic.toString(),
        powerTo: event.powerTo,
        stakedAtomic: event.stakedAtomic.toString(),
        totalStakedAtomic: event.totalStakedAtomic.toString(),
      };
    case "unstaked":
      return {
        type: event.type,
        staker: event.staker,
        amountAtomic: event.amountAtomic.toString(),
        stakedAtomic: event.stakedAtomic.toString(),
      };
    case "delegated":
      return {
        type: event.type,
        delegator: event.delegator,
        oldDelegate: event.oldDelegate,
        to: event.to,
        amountAtomic: event.amountAtomic.toString(),
      };
    case "proposal_created":
      return {
        type: event.type,
        id: event.id,
        proposer: event.proposer,
        recipient: event.recipient,
        amountAtomic: event.amountAtomic.toString(),
        description: event.description,
        votingEnds: event.votingEnds,
        quorumAtomic: event.quorumAtomic.toString(),
      };
    case "vote_cast":
      return {
        type: event.type,
        id: event.id,
        voter: event.voter,
        choice: event.choice,
        weightAtomic: event.weightAtomic.toString(),
        yesAtomic: event.yesAtomic.toString(),
        noAtomic: event.noAtomic.toString(),
        abstainAtomic: event.abstainAtomic.toString(),
      };
    case "proposal_queued":
      return {
        type: event.type,
        id: event.id,
        yesAtomic: event.yesAtomic.toString(),
        noAtomic: event.noAtomic.toString(),
        abstainAtomic: event.abstainAtomic.toString(),
        quorumAtomic: event.quorumAtomic.toString(),
        timelockEnds: event.timelockEnds,
        graceEnds: event.graceEnds,
      };
    case "proposal_defeated":
      return {
        type: event.type,
        id: event.id,
        reason: event.reason,
        yesAtomic: event.yesAtomic.toString(),
        noAtomic: event.noAtomic.toString(),
        abstainAtomic: event.abstainAtomic.toString(),
        quorumAtomic: event.quorumAtomic.toString(),
        participationAtomic: event.participationAtomic.toString(),
      };
    case "proposal_executed":
      return {
        type: event.type,
        id: event.id,
        recipient: event.recipient,
        amountAtomic: event.amountAtomic.toString(),
        depositReturnedAtomic: event.depositReturnedAtomic.toString(),
        treasuryAtomic: event.treasuryAtomic.toString(),
      };
    case "proposal_cancelled":
      return {
        type: event.type,
        id: event.id,
        proposer: event.proposer,
        depositKeptAtomic: event.depositKeptAtomic.toString(),
      };
    case "proposal_expired":
      return {
        type: event.type,
        id: event.id,
        depositKeptAtomic: event.depositKeptAtomic.toString(),
      };
    case "skimmed":
      return {
        type: event.type,
        amountAtomic: event.amountAtomic.toString(),
        treasuryAtomic: event.treasuryAtomic.toString(),
      };
    default:
      return event;
  }
}

export type { Health, ContractEvent };
