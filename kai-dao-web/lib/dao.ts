import {
  ContractShapeError,
  parseAtomic,
  parseConfig,
  parseContractReply,
  parseDelegate,
  parseEventData,
  parseProposal,
  parseVote,
  type DaoEvent,
  type DaoConfig,
  type Proposal,
  type VoteChoice,
} from "./contract";
import { env } from "./env";
import { RpcError, rpcRead } from "./rpc";
import {
  contractSchema,
  eventsPageSchema,
  healthSchema,
  queryEnvelopeSchema,
  transactionSchema,
  type ContractEvent,
  type ContractRecord,
  type EventsPage,
  type Health,
  type Transaction,
} from "./schemas";

/**
 * The DAO's read interface, taken from examples/StakeDao/src/lib.rs: the chain
 * publishes no method list, so the names here are the whole of it.
 *
 * The query endpoint does not decode its URL; arguments travel as they are and
 * may only use this character set. Rejecting locally keeps a stray comma or a
 * bracket out of the signature path.
 */
const URL_SAFE = /^[A-Za-z0-9\-_.~:]+$/;

async function read(method: string, args: string[] = []): Promise<string> {
  for (const value of args) {
    if (!URL_SAFE.test(value)) {
      throw new RpcError("refused", `Argument "${value}" is not URL safe.`, {
        retryable: false,
      });
    }
  }

  const suffix = args.length > 0 ? `&args=${args.join(",")}` : "";
  const path = `/api/contract/${env.RETIUM_CONTRACT_ID}/query?method=${method}${suffix}`;

  const envelope = await rpcRead(path, queryEnvelopeSchema);
  const reply = parseContractReply(envelope.output);

  if (reply.kind === "refused") {
    // A refusal is a real answer about state, not a transport problem.
    throw new RpcError("refused", reply.error, { retryable: false });
  }

  return reply.data;
}

export async function getConfig(): Promise<DaoConfig> {
  return parseConfig(await read("config"));
}

/**
 * `config` is refused before `init` has run. That is a state, not a failure, so
 * the overview can still render the contract identity and say what is missing.
 */
export async function getConfigState(): Promise<
  { ok: true; config: DaoConfig } | { ok: false; problem: string }
> {
  try {
    return { ok: true, config: await getConfig() };
  } catch (error) {
    if (error instanceof RpcError && error.kind === "refused") {
      return { ok: false, problem: error.message };
    }
    throw error;
  }
}

export async function getStaked(address: string): Promise<bigint> {
  return parseAtomic(await read("staked_of", [address]));
}

export async function getPower(address: string): Promise<bigint> {
  return parseAtomic(await read("power_of", [address]));
}

export async function getDelegate(address: string): Promise<string | null> {
  return parseDelegate(await read("delegate_of", [address]));
}

export async function getLock(address: string): Promise<number> {
  const raw = await read("lock_of", [address]);
  if (!/^\d+$/.test(raw)) {
    throw new ContractShapeError("lock_of is not a timestamp");
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) {
    throw new ContractShapeError("lock_of is out of range");
  }
  return parsed;
}

export async function getVote(id: number, address: string): Promise<VoteChoice | null> {
  return parseVote(await read("vote_of", [String(id), address]));
}

export async function getDescription(id: number): Promise<string> {
  return read("proposal_description", [String(id)]);
}

export async function getProposal(id: number): Promise<Proposal> {
  return parseProposal(id, await read("proposal", [String(id)]));
}

export async function getHealth(): Promise<Health> {
  return rpcRead("/health", healthSchema);
}

export async function getContractRecord(): Promise<ContractRecord> {
  return rpcRead(`/api/contract/${env.RETIUM_CONTRACT_ID}`, contractSchema);
}

export async function getTransaction(txId: string): Promise<Transaction> {
  if (!/^tx_[0-9a-f]{8,64}$/.test(txId)) {
    throw new RpcError("refused", "That is not a transaction id.", {
      retryable: false,
    });
  }
  return rpcRead(`/api/transaction/${txId}`, transactionSchema);
}

export async function getEvents(after: string, limit: number, type?: string): Promise<EventsPage> {
  if (!/^[0-9-]{1,40}$/.test(after)) {
    throw new RpcError("refused", "Bad event cursor.", { retryable: false });
  }
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const typeFilter = type && /^[a-z_]{1,40}$/.test(type) ? `&type=${type}` : "";

  return rpcRead(
    `/api/contract/${env.RETIUM_CONTRACT_ID}/events?after=${after}&limit=${safeLimit}${typeFilter}`,
    eventsPageSchema,
  );
}

/** Reads the log in bounded pages. */
export async function getAllEvents(maxPages = 10): Promise<{
  events: (ContractEvent & { parsed: DaoEvent })[];
  truncated: boolean;
}> {
  const collected: (ContractEvent & { parsed: DaoEvent })[] = [];
  let cursor = "0";
  let truncated = false;

  for (let page = 0; page < maxPages; page += 1) {
    const result = await getEvents(cursor, 100);
    for (const event of result.events) {
      let parsed: DaoEvent;
      try {
        parsed = parseEventData(event.event_type, event.data);
      } catch {
        parsed = { type: "unknown", eventType: event.event_type, raw: event.data };
      }
      collected.push({ ...event, parsed });
    }

    if (!result.more || !result.next) return { events: collected, truncated };
    cursor = result.next;
    truncated = page === maxPages - 1;
  }

  return { events: collected, truncated };
}

export type AccountState = {
  address: string;
  stakedAtomic: bigint;
  powerAtomic: bigint;
  delegate: string | null;
  lockMs: number;
  vote: VoteChoice | null;
};

export async function getAccount(address: string, proposalId?: number): Promise<AccountState> {
  const [stakedAtomic, powerAtomic, delegate, lockMs, vote] = await Promise.all([
    getStaked(address),
    getPower(address),
    getDelegate(address),
    getLock(address),
    proposalId === undefined ? Promise.resolve(null) : getVote(proposalId, address),
  ]);

  return { address, stakedAtomic, powerAtomic, delegate, lockMs, vote };
}

export type VoterState = {
  address: string;
  stakedAtomic: bigint;
  powerAtomic: bigint;
  lockMs: number;
  /** Every proposal this address has voted on, from the event log. */
  votes: { id: number; choice: VoteChoice }[];
  votesComplete: boolean;
};

/**
 * One request per wallet instead of one query per proposal: the event log
 * already records every `vote_cast` with the voter, so a single bounded pass
 * answers "which of these did I already vote on?". The live `power_of` and
 * `staked_of` reads come from the contract, not from the log.
 */
export async function getVoterState(address: string): Promise<VoterState> {
  const [account, log] = await Promise.all([getAccount(address), getAllEvents()]);
  const seen = new Map<number, VoteChoice>();

  for (const event of log.events) {
    if (event.parsed.type !== "vote_cast" || event.parsed.voter !== address) continue;
    const choice = event.parsed.choice;
    if (choice === "yes" || choice === "no" || choice === "abstain") {
      seen.set(event.parsed.id, choice);
    }
  }

  return {
    address,
    stakedAtomic: account.stakedAtomic,
    powerAtomic: account.powerAtomic,
    lockMs: account.lockMs,
    votes: [...seen].map(([id, choice]) => ({ id, choice })),
    votesComplete: !log.truncated,
  };
}

export type ProposalDetail = {
  proposal: Proposal;
  description: string;
  voters: { voter: string; choice: VoteChoice; weightAtomic: bigint }[];
  votersComplete: boolean;
};

/**
 * Voters are not enumerable on chain. The event log carries every `vote_cast`
 * with its weight, so the detail page is built from events and confirmed
 * against the live `proposal` totals shown above it.
 */
export async function getProposalDetail(id: number): Promise<ProposalDetail> {
  const [proposal, description, log] = await Promise.all([
    getProposal(id),
    getDescription(id),
    getAllEvents(),
  ]);

  const voters: ProposalDetail["voters"] = [];
  for (const event of log.events) {
    if (event.parsed.type !== "vote_cast" || event.parsed.id !== id) continue;
    const choice = event.parsed.choice;
    if (choice !== "yes" && choice !== "no" && choice !== "abstain") continue;
    voters.push({
      voter: event.parsed.voter,
      choice,
      weightAtomic: event.parsed.weightAtomic,
    });
  }

  // Newest first.
  voters.reverse();

  return { proposal, description, voters, votersComplete: !log.truncated };
}

export async function listProposals(limit = 50): Promise<{
  proposals: Proposal[];
  total: number;
  shown: number;
  truncated: boolean;
}> {
  const config = await getConfig();
  const total = config.proposalCount;
  const ids: number[] = [];

  for (let id = total; id >= 1 && ids.length < limit; id -= 1) ids.push(id);

  const results = await mapLimit(ids, 4, async (id) => {
    try {
      return await getProposal(id);
    } catch (error) {
      if (error instanceof RpcError && error.kind === "refused") return null;
      throw error;
    }
  });

  const proposals = results.filter((item): item is Proposal => item !== null);

  return {
    proposals,
    total,
    shown: proposals.length,
    truncated: total > ids.length,
  };
}

export type Overview = {
  health: Health;
  contract: ContractRecord;
  config: DaoConfig | null;
  configProblem: string | null;
  treasuryAtomic: bigint;
  codeHashMatches: boolean;
};

export async function getOverview(): Promise<Overview> {
  const [health, contract, configState] = await Promise.all([
    getHealth(),
    getContractRecord(),
    getConfigState(),
  ]);

  return {
    health,
    contract,
    config: configState.ok ? configState.config : null,
    configProblem: configState.ok ? null : configState.problem,
    treasuryAtomic: configState.ok ? configState.config.treasuryAtomic : 0n,
    codeHashMatches: contract.code_hash === env.RETIUM_CONTRACT_CODE_HASH,
  };
}

export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index] as T);
    }
  });

  await Promise.all(runners);
  return results;
}

export { ContractShapeError };
