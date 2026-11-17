//! StakeDao: a conventional, stake-weighted DAO.
//!
//! RTM is the governance token. Anyone can stake RTM to gain voting power,
//! voting power can be delegated one hop, proposals need a quorum of the stake
//! that existed when they were created, and an approved payment waits out a
//! timelock before it can be executed.
//!
//! Two buckets of RTM live side by side in this account and are never mixed:
//! `total_staked` belongs to stakers and only `unstake` returns it, `treasury`
//! belongs to the DAO and only an executed proposal pays it out. After every
//! action `balance == total_staked + treasury`.
//!
//! There is no admin key: `init` runs once, validates its parameters and then
//! every rule is frozen into the code and the storage it wrote.

#![cfg_attr(target_arch = "wasm32", no_std)]
extern crate alloc;

use alloc::format;
use alloc::string::{String, ToString};
use alloc::vec::Vec;

use retium_contract::{call, entrypoint, env, error, events, ok, storage, Call, Error, Reply};

entrypoint!(handle);

retium_contract::rcp_metadata!(
    r#"{"rcp_type":"stake_dao","traits":["dao","governance","timelock","testnet"],"capabilities":["execute"],"lockable_fields":[],"evolves_from":"","weight":5,"version":"v1.0.0"}"#
);

/// Only this address may call `init`. It has no power afterwards.
const INITIALIZER: &str = "rete4203660202c54aeea6d540c2063eb928a049201dbf50a50123b7ab7dd608c44da641";

/// `rete` + 64 hex characters of hash + 4 hex characters of checksum.
const ADDRESS_LEN: usize = 72;

const MAX_DESCRIPTION_BYTES: usize = 512;

/// Basis points: 10_000 = 100%.
const BPS_DENOMINATOR: u128 = 10_000;

const ONE_HOUR_MS: u128 = 60 * 60 * 1000;
const ONE_DAY_MS: u128 = 24 * ONE_HOUR_MS;

/// Bounds on the parameters `init` accepts. They stop a deploy from freezing a
/// configuration that is unusable: a vote that closes in a second, a quorum no
/// one can reach, an execution window that never opens.
const MIN_VOTING_PERIOD_MS: u128 = ONE_HOUR_MS;
const MAX_VOTING_PERIOD_MS: u128 = 30 * ONE_DAY_MS;
const MAX_TIMELOCK_MS: u128 = 30 * ONE_DAY_MS;
const MIN_GRACE_MS: u128 = ONE_HOUR_MS;
const MAX_GRACE_MS: u128 = 30 * ONE_DAY_MS;

const STATUS_ACTIVE: &str = "active";
const STATUS_QUEUED: &str = "queued";
const STATUS_EXECUTED: &str = "executed";
const STATUS_DEFEATED: &str = "defeated";
const STATUS_CANCELLED: &str = "cancelled";
const STATUS_EXPIRED: &str = "expired";

// ---------------------------------------------------------------------------
// entry point
// ---------------------------------------------------------------------------

pub fn handle(call: Call) -> Reply {
    // Money may only arrive where the contract knows what to do with it. Every
    // other action refuses attached RTM before touching storage.
    let payable = matches!(call.action(), "stake" | "propose" | "deposit");
    if !payable && call.value() > 0 {
        return error("attach RTM only with stake, propose or deposit");
    }

    match call.action() {
        "init" => init(&call),
        "deposit" => deposit(&call),
        "stake" => stake(&call),
        "unstake" => unstake(&call),
        "delegate" => delegate(&call),
        "propose" => propose(&call),
        "vote" => vote(&call),
        "finalize" => finalize(&call),
        "execute" => execute(&call),
        "cancel" => cancel(&call),
        "expire" => expire(&call),
        "skim" => skim(&call),
        "config" => read_config(),
        "stats" => read_stats(),
        "proposal" => read_proposal(&call),
        "proposal_description" => read_description(&call),
        "staked_of" => read_staked(&call),
        "power_of" => read_power(&call),
        "delegate_of" => read_delegate(&call),
        "lock_of" => read_lock(&call),
        "vote_of" => read_vote(&call),
        "treasury_balance" => read_treasury(),
        other => error(&format!("unknown action {other}")),
    }
}

// ---------------------------------------------------------------------------
// setup
// ---------------------------------------------------------------------------

fn init(call: &Call) -> Reply {
    if storage::get("initialized")?.is_some() {
        return error("DAO is already initialized");
    }
    if call.caller() != INITIALIZER {
        return error("only the deployer may initialize this DAO");
    }

    let min_stake = call.arg_u128(0)?;
    let propose_threshold = call.arg_u128(1)?;
    let quorum_bps = call.arg_u128(2)?;
    let voting_period_ms = call.arg_u128(3)?;
    let timelock_ms = call.arg_u128(4)?;
    let grace_ms = call.arg_u128(5)?;
    let deposit = call.arg_u128(6)?;

    if min_stake == 0 {
        return error("min_stake must be greater than zero");
    }
    if propose_threshold < min_stake {
        return error("propose_threshold must be at least min_stake");
    }
    if quorum_bps == 0 || quorum_bps > BPS_DENOMINATOR {
        return error("quorum_bps must be between 1 and 10000");
    }
    if !(MIN_VOTING_PERIOD_MS..=MAX_VOTING_PERIOD_MS).contains(&voting_period_ms) {
        return error("voting_period_ms must be between one hour and thirty days");
    }
    if timelock_ms > MAX_TIMELOCK_MS {
        return error("timelock_ms must be at most thirty days");
    }
    if !(MIN_GRACE_MS..=MAX_GRACE_MS).contains(&grace_ms) {
        return error("grace_ms must be between one hour and thirty days");
    }

    storage::set_u128("min_stake", min_stake)?;
    storage::set_u128("propose_threshold", propose_threshold)?;
    storage::set_u128("quorum_bps", quorum_bps)?;
    storage::set_u128("voting_period_ms", voting_period_ms)?;
    storage::set_u128("timelock_ms", timelock_ms)?;
    storage::set_u128("grace_ms", grace_ms)?;
    storage::set_u128("deposit", deposit)?;
    storage::set("owner", INITIALIZER)?;
    storage::set_u128("total_staked", 0)?;
    storage::set_u128("treasury", 0)?;
    storage::set_u128("proposal_count", 0)?;
    storage::set("initialized", "1")?;

    events::emit_fields(
        "dao_initialized",
        &[
            ("owner", INITIALIZER),
            ("min_stake", &min_stake.to_string()),
            ("propose_threshold", &propose_threshold.to_string()),
            ("quorum_bps", &quorum_bps.to_string()),
            ("voting_period_ms", &voting_period_ms.to_string()),
            ("timelock_ms", &timelock_ms.to_string()),
            ("grace_ms", &grace_ms.to_string()),
            ("deposit", &deposit.to_string()),
        ],
    )?;

    ok("stake DAO ready")
}

fn require_initialized() -> Result<(), Error> {
    if storage::get_or("initialized", "")? != "1" {
        return Err("DAO is not initialized".to_string());
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// money in
// ---------------------------------------------------------------------------

fn deposit(call: &Call) -> Reply {
    require_initialized()?;
    let amount = call.value();
    if amount == 0 {
        return error("attach RTM to deposit");
    }
    let treasury = storage::add_u128("treasury", amount)?;
    events::emit_fields(
        "treasury_deposit",
        &[
            ("from", call.caller()),
            ("amount", &amount.to_string()),
            ("treasury", &treasury.to_string()),
        ],
    )?;
    ok(&format!("{amount} atomic RTM added to the treasury"))
}

fn stake(call: &Call) -> Reply {
    require_initialized()?;
    let cfg = Config::load()?;
    let amount = call.arg_u128(0)?;
    let staker = call.caller();

    if amount == 0 {
        return error("amount must be greater than zero");
    }
    if call.value() != amount {
        return error(&format!(
            "attach exactly {amount} atomic RTM with stake, got {}",
            call.value()
        ));
    }

    let staked = storage::get_u128(&stake_key(staker))?;
    let next = staked
        .checked_add(amount)
        .ok_or_else(|| "stake would overflow".to_string())?;
    if next < cfg.min_stake {
        return error(&format!(
            "a staker needs at least {} atomic RTM, this would leave {next}",
            cfg.min_stake
        ));
    }

    let total = storage::get_u128("total_staked")?;
    let total_next = total
        .checked_add(amount)
        .ok_or_else(|| "total stake would overflow".to_string())?;

    // Voting power is aggregated on the address that will cast the vote, so a
    // vote never has to walk a list of delegators.
    let power_to = recipient(staker)?;
    let power = storage::get_u128(&power_key(&power_to))?;
    let power_next = power
        .checked_add(amount)
        .ok_or_else(|| "voting power would overflow".to_string())?;

    storage::set_u128(&stake_key(staker), next)?;
    storage::set_u128(&power_key(&power_to), power_next)?;
    storage::set_u128("total_staked", total_next)?;

    events::emit_fields(
        "staked",
        &[
            ("staker", staker),
            ("amount", &amount.to_string()),
            ("power_to", &power_to),
            ("staked", &next.to_string()),
            ("total_staked", &total_next.to_string()),
        ],
    )?;

    ok(&format!(
        "{amount} staked, voting power of {power_to} is {power_next}"
    ))
}

fn unstake(call: &Call) -> Reply {
    require_initialized()?;
    let cfg = Config::load()?;
    let amount = call.arg_u128(0)?;
    let staker = call.caller();

    if amount == 0 {
        return error("amount must be greater than zero");
    }

    let staked = storage::get_u128(&stake_key(staker))?;
    if amount > staked {
        return error(&format!("unstake of {amount} exceeds the staked {staked}"));
    }

    // While a vote on this stake is live the money stays put. The lock is read
    // through the delegate as well: if the delegatee voted, the stake behind
    // that vote cannot walk away.
    let lock = effective_lock(staker)?;
    let now = now_ms()?;
    if now < lock {
        return error(&format!(
            "stake is locked until {lock}: a vote on this stake is live"
        ));
    }

    let remaining = staked - amount;
    if remaining != 0 && remaining < cfg.min_stake {
        return error("remaining stake would be below the minimum, unstake everything instead");
    }

    let power_to = recipient(staker)?;
    let power = storage::get_u128(&power_key(&power_to))?;
    if power < amount {
        return error("stored voting power is below the staked amount");
    }
    let total = storage::get_u128("total_staked")?;
    if total < amount {
        return error("stored total stake is below the staked amount");
    }

    storage::set_u128(&stake_key(staker), remaining)?;
    storage::set_u128(&power_key(&power_to), power - amount)?;
    storage::set_u128("total_staked", total - amount)?;

    pay(staker, amount);

    events::emit_fields(
        "unstaked",
        &[
            ("staker", staker),
            ("amount", &amount.to_string()),
            ("staked", &remaining.to_string()),
        ],
    )?;

    ok(&format!("{amount} returned to {staker}"))
}

fn delegate(call: &Call) -> Reply {
    require_initialized()?;
    let from = call.caller();
    let target = call.arg(0)?;

    // One hop only: sending your power to yourself removes the delegation.
    let to = if target == from {
        from.to_string()
    } else {
        if !looks_like_address(target) {
            return error("delegate is not a valid Retium address");
        }
        target.to_string()
    };

    let old = recipient(from)?;
    if old == to {
        return error("already delegating to that address");
    }

    // Moving power is only allowed when neither side has a live vote. Without
    // this, an address could vote, hand its stake to a fresh address and vote
    // the same stake a second time.
    let now = now_ms()?;
    let lock = effective_lock(from)?;
    if now < lock {
        return error(&format!(
            "voting power is locked until {lock}: a vote on this stake is live"
        ));
    }
    if to != from {
        let target_lock = storage::get_u128(&lock_key(&to))?;
        if now < target_lock {
            return error(&format!("the delegate has a live vote until {target_lock}"));
        }
    }

    let amount = storage::get_u128(&stake_key(from))?;
    if amount > 0 {
        let old_power = storage::get_u128(&power_key(&old))?;
        if old_power < amount {
            return error("stored voting power is below the staked amount");
        }
        let new_power = storage::get_u128(&power_key(&to))?;
        let new_power = new_power
            .checked_add(amount)
            .ok_or_else(|| "voting power would overflow".to_string())?;
        storage::set_u128(&power_key(&old), old_power - amount)?;
        storage::set_u128(&power_key(&to), new_power)?;
    }

    if to == from {
        storage::remove(&delegate_key(from))?;
    } else {
        storage::set(&delegate_key(from), &to)?;
    }

    events::emit_fields(
        "delegated",
        &[
            ("delegator", from),
            ("old_delegate", &old),
            ("to", &to),
            ("amount", &amount.to_string()),
        ],
    )?;

    ok(&format!("{from} delegates {amount} to {to}"))
}

// ---------------------------------------------------------------------------
// proposals
// ---------------------------------------------------------------------------

fn propose(call: &Call) -> Reply {
    let cfg = Config::load()?;
    let proposer = call.caller();
    let target = call.arg(0)?;
    let amount = call.arg_u128(1)?;
    let description = call.arg(2)?;

    if !looks_like_address(target) {
        return error("recipient is not a valid Retium address");
    }
    if amount == 0 {
        return error("amount must be greater than zero");
    }
    // A proposal whose amount and refund cannot even be added would be created,
    // approved and then fail at execution for good.
    if amount.checked_add(cfg.deposit).is_none() {
        return error("amount plus the deposit overflows");
    }
    if description.is_empty() || description.len() > MAX_DESCRIPTION_BYTES {
        return error(&format!(
            "description must be 1 to {MAX_DESCRIPTION_BYTES} bytes"
        ));
    }
    if call.value() != cfg.deposit {
        return error(&format!(
            "attach exactly {} atomic RTM as the proposal deposit, got {}",
            cfg.deposit,
            call.value()
        ));
    }

    let power = storage::get_u128(&power_key(proposer))?;
    if power < cfg.propose_threshold {
        return error(&format!(
            "voting power {power} is below the proposal threshold {}",
            cfg.propose_threshold
        ));
    }

    let now = now_ms()?;
    let voting_ends = add_ms(now, cfg.voting_period_ms)?;
    let total = storage::get_u128("total_staked")?;
    // Snapshot, rounded up, so the bar cannot be lowered mid-vote.
    let quorum = mul_div_ceil(total, cfg.quorum_bps, BPS_DENOMINATOR)?;

    let id = storage::get_u128("proposal_count")?
        .checked_add(1)
        .ok_or_else(|| "proposal count would overflow".to_string())?;

    let proposal = Proposal {
        proposer: proposer.to_string(),
        recipient: target.to_string(),
        amount,
        deposit: cfg.deposit,
        status: STATUS_ACTIVE.to_string(),
        created_ms: now,
        voting_ends,
        timelock_ends: 0,
        grace_ends: 0,
        quorum,
        yes: 0,
        no: 0,
        abstain: 0,
    };
    proposal.save(id)?;
    storage::set_u128("proposal_count", id)?;
    storage::set(&description_key(id), description)?;
    // The deposit joins the treasury now and is refunded on execution.
    storage::add_u128("treasury", cfg.deposit)?;

    events::emit_fields(
        "proposal_created",
        &[
            ("id", &id.to_string()),
            ("proposer", proposer),
            ("recipient", target),
            ("amount", &amount.to_string()),
            ("description", description),
            ("voting_ends", &voting_ends.to_string()),
            ("quorum", &quorum.to_string()),
        ],
    )?;

    ok(&format!("proposal {id} created, voting ends at {voting_ends}"))
}

fn vote(call: &Call) -> Reply {
    require_initialized()?;
    let id = call.arg_u128(0)?;
    let choice = call.arg(1)?;
    if !matches!(choice, "yes" | "no" | "abstain") {
        return error("choice must be yes, no or abstain");
    }

    let mut proposal = Proposal::load(id)?;
    if proposal.status != STATUS_ACTIVE {
        return error(&format!(
            "proposal {id} is {}, not active",
            proposal.status
        ));
    }
    let now = now_ms()?;
    if now >= proposal.voting_ends {
        return error("voting has ended for this proposal");
    }

    let voter = call.caller();
    if storage::get(&vote_key(id, voter))?.is_some() {
        return error("caller has already voted on this proposal");
    }

    let weight = storage::get_u128(&power_key(voter))?;
    if weight == 0 {
        return error("caller has no voting power");
    }

    match choice {
        "yes" => {
            proposal.yes = proposal
                .yes
                .checked_add(weight)
                .ok_or_else(|| "vote weight would overflow".to_string())?
        }
        "no" => {
            proposal.no = proposal
                .no
                .checked_add(weight)
                .ok_or_else(|| "vote weight would overflow".to_string())?
        }
        _ => {
            proposal.abstain = proposal
                .abstain
                .checked_add(weight)
                .ok_or_else(|| "vote weight would overflow".to_string())?
        }
    }
    proposal.save(id)?;

    storage::set(&vote_key(id, voter), choice)?;
    storage::set_u128(&weight_key(id, voter), weight)?;

    // Lock the stake behind this vote until the voting deadline.
    let lock = storage::get_u128(&lock_key(voter))?.max(proposal.voting_ends);
    storage::set_u128(&lock_key(voter), lock)?;

    events::emit_fields(
        "vote_cast",
        &[
            ("id", &id.to_string()),
            ("voter", voter),
            ("choice", choice),
            ("weight", &weight.to_string()),
            ("yes", &proposal.yes.to_string()),
            ("no", &proposal.no.to_string()),
            ("abstain", &proposal.abstain.to_string()),
        ],
    )?;

    ok(&format!("{weight} voting power cast for {choice}"))
}

fn finalize(call: &Call) -> Reply {
    require_initialized()?;
    let cfg = Config::load()?;
    let id = call.arg_u128(0)?;
    let mut proposal = Proposal::load(id)?;

    if proposal.status != STATUS_ACTIVE {
        return error(&format!(
            "proposal {id} is {}, not active",
            proposal.status
        ));
    }
    let now = now_ms()?;
    if now < proposal.voting_ends {
        return error(&format!(
            "voting is still open until {}",
            proposal.voting_ends
        ));
    }

    let participation = proposal
        .yes
        .checked_add(proposal.no)
        .and_then(|sum| sum.checked_add(proposal.abstain))
        .ok_or_else(|| "vote totals would overflow".to_string())?;
    let quorum_met = participation >= proposal.quorum;

    if quorum_met && proposal.yes > proposal.no {
        proposal.status = STATUS_QUEUED.to_string();
        proposal.timelock_ends = add_ms(now, cfg.timelock_ms)?;
        proposal.grace_ends = add_ms(proposal.timelock_ends, cfg.grace_ms)?;
        proposal.save(id)?;

        events::emit_fields(
            "proposal_queued",
            &[
                ("id", &id.to_string()),
                ("yes", &proposal.yes.to_string()),
                ("no", &proposal.no.to_string()),
                ("abstain", &proposal.abstain.to_string()),
                ("quorum", &proposal.quorum.to_string()),
                ("timelock_ends", &proposal.timelock_ends.to_string()),
                ("grace_ends", &proposal.grace_ends.to_string()),
            ],
        )?;

        return ok(&format!(
            "proposal {id} queued, executable from {} to {}",
            proposal.timelock_ends, proposal.grace_ends
        ));
    }

    proposal.status = STATUS_DEFEATED.to_string();
    proposal.save(id)?;

    events::emit_fields(
        "proposal_defeated",
        &[
            ("id", &id.to_string()),
            ("reason", if quorum_met { "votes" } else { "quorum" }),
            ("yes", &proposal.yes.to_string()),
            ("no", &proposal.no.to_string()),
            ("abstain", &proposal.abstain.to_string()),
            ("quorum", &proposal.quorum.to_string()),
            ("participation", &participation.to_string()),
        ],
    )?;

    ok(&format!(
        "proposal {id} defeated; the deposit stays in the treasury"
    ))
}

fn execute(call: &Call) -> Reply {
    require_initialized()?;
    let id = call.arg_u128(0)?;
    let mut proposal = Proposal::load(id)?;

    if proposal.status != STATUS_QUEUED {
        return error(&format!(
            "proposal {id} is {}, not queued",
            proposal.status
        ));
    }
    let now = now_ms()?;
    if now < proposal.timelock_ends {
        return error(&format!(
            "the timelock holds this proposal until {}",
            proposal.timelock_ends
        ));
    }
    if now > proposal.grace_ends {
        return error(&format!(
            "the execution window closed at {}: call expire",
            proposal.grace_ends
        ));
    }

    let treasury = storage::get_u128("treasury")?;
    let outflow = proposal
        .amount
        .checked_add(proposal.deposit)
        .ok_or_else(|| "payout would overflow".to_string())?;
    if treasury < outflow {
        return error(&format!(
            "the treasury holds {treasury} atomic RTM, the proposal needs {outflow} including the deposit refund"
        ));
    }

    // Writing first is safe: a refused transfer below returns an error and the
    // chain undoes every write of this call, status included.
    proposal.status = STATUS_EXECUTED.to_string();
    proposal.save(id)?;
    storage::set_u128("treasury", treasury - outflow)?;

    pay(&proposal.recipient, proposal.amount);
    if proposal.deposit > 0 {
        pay(&proposal.proposer, proposal.deposit);
    }

    events::emit_fields(
        "proposal_executed",
        &[
            ("id", &id.to_string()),
            ("recipient", &proposal.recipient),
            ("amount", &proposal.amount.to_string()),
            ("deposit_returned", &proposal.deposit.to_string()),
            ("treasury", &(treasury - outflow).to_string()),
        ],
    )?;

    ok(&format!(
        "proposal {id} executed: {} atomic RTM to {}",
        proposal.amount, proposal.recipient
    ))
}

fn cancel(call: &Call) -> Reply {
    require_initialized()?;
    let id = call.arg_u128(0)?;
    let mut proposal = Proposal::load(id)?;

    if proposal.status != STATUS_ACTIVE {
        return error(&format!(
            "proposal {id} is {}, not active",
            proposal.status
        ));
    }
    if call.caller() != proposal.proposer {
        return error("only the proposal creator can cancel it");
    }
    let now = now_ms()?;
    if now >= proposal.voting_ends {
        return error("voting has ended: call finalize instead");
    }

    proposal.status = STATUS_CANCELLED.to_string();
    proposal.save(id)?;

    events::emit_fields(
        "proposal_cancelled",
        &[
            ("id", &id.to_string()),
            ("proposer", &proposal.proposer),
            ("deposit_kept", &proposal.deposit.to_string()),
        ],
    )?;

    ok(&format!("proposal {id} cancelled; the deposit stays in the treasury"))
}

fn expire(call: &Call) -> Reply {
    require_initialized()?;
    let id = call.arg_u128(0)?;
    let mut proposal = Proposal::load(id)?;

    if proposal.status != STATUS_QUEUED {
        return error(&format!(
            "proposal {id} is {}, not queued",
            proposal.status
        ));
    }
    let now = now_ms()?;
    if now <= proposal.grace_ends {
        return error(&format!(
            "the execution window is still open until {}",
            proposal.grace_ends
        ));
    }

    proposal.status = STATUS_EXPIRED.to_string();
    proposal.save(id)?;

    events::emit_fields(
        "proposal_expired",
        &[
            ("id", &id.to_string()),
            ("deposit_kept", &proposal.deposit.to_string()),
        ],
    )?;

    ok(&format!("proposal {id} expired; the deposit stays in the treasury"))
}

/// Move RTM that arrived without `deposit` into the treasury.
///
/// Anyone may call it. It only ever credits the surplus above `total_staked +
/// treasury`, so it can never touch staked money.
fn skim(_call: &Call) -> Reply {
    require_initialized()?;
    let this = env::contract_id()?;
    let balance = call::rtm_balance_of(&this)?;
    let staked = storage::get_u128("total_staked")?;
    let treasury = storage::get_u128("treasury")?;

    let surplus = skim_amount(balance, staked, treasury)?;
    if surplus == 0 {
        return error("nothing to skim: the balance matches the accounting");
    }
    let treasury_next = storage::add_u128("treasury", surplus)?;

    events::emit_fields(
        "skimmed",
        &[
            ("amount", &surplus.to_string()),
            ("treasury", &treasury_next.to_string()),
        ],
    )?;

    ok(&format!("{surplus} atomic RTM moved to the treasury"))
}

fn skim_amount(balance: u128, staked: u128, treasury: u128) -> Result<u128, Error> {
    let accounted = staked
        .checked_add(treasury)
        .ok_or_else(|| "accounting would overflow".to_string())?;
    if balance < accounted {
        return Err(format!(
            "the balance {balance} is below the accounted {accounted}, refusing to skim"
        ));
    }
    Ok(balance - accounted)
}

// ---------------------------------------------------------------------------
// reads
// ---------------------------------------------------------------------------

fn read_config() -> Reply {
    require_initialized()?;
    let cfg = Config::load()?;
    let total = storage::get_u128("total_staked")?;
    let treasury = storage::get_u128("treasury")?;
    let count = storage::get_u128("proposal_count")?;
    ok(&format!(
        "{}|{}|{}|{}|{}|{}|{}|{}|{}|{}",
        cfg.min_stake,
        cfg.propose_threshold,
        cfg.quorum_bps,
        cfg.voting_period_ms,
        cfg.timelock_ms,
        cfg.grace_ms,
        cfg.deposit,
        total,
        treasury,
        count
    ))
}

fn read_stats() -> Reply {
    require_initialized()?;
    let total = storage::get_u128("total_staked")?;
    let treasury = storage::get_u128("treasury")?;
    let count = storage::get_u128("proposal_count")?;
    ok(&format!("{total}|{treasury}|{count}"))
}

fn read_proposal(call: &Call) -> Reply {
    require_initialized()?;
    let id = call.arg_u128(0)?;
    ok(&Proposal::load(id)?.encode())
}

fn read_description(call: &Call) -> Reply {
    require_initialized()?;
    let id = call.arg_u128(0)?;
    ok(&storage::get_or(&description_key(id), "")?)
}

fn read_staked(call: &Call) -> Reply {
    require_initialized()?;
    let who = call.arg(0)?;
    ok(&storage::get_u128(&stake_key(who))?.to_string())
}

fn read_power(call: &Call) -> Reply {
    require_initialized()?;
    let who = call.arg(0)?;
    ok(&storage::get_u128(&power_key(who))?.to_string())
}

fn read_delegate(call: &Call) -> Reply {
    require_initialized()?;
    let who = call.arg(0)?;
    ok(&storage::get_or(&delegate_key(who), "")?)
}

fn read_lock(call: &Call) -> Reply {
    require_initialized()?;
    let who = call.arg(0)?;
    ok(&effective_lock(who)?.to_string())
}

fn read_vote(call: &Call) -> Reply {
    require_initialized()?;
    let id = call.arg_u128(0)?;
    let who = call.arg(1)?;
    ok(&storage::get_or(&vote_key(id, who), "")?)
}

fn read_treasury() -> Reply {
    require_initialized()?;
    ok(&storage::get_u128("treasury")?.to_string())
}

// ---------------------------------------------------------------------------
// parameters
// ---------------------------------------------------------------------------

struct Config {
    min_stake: u128,
    propose_threshold: u128,
    quorum_bps: u128,
    voting_period_ms: u128,
    timelock_ms: u128,
    grace_ms: u128,
    deposit: u128,
}

impl Config {
    fn load() -> Result<Self, Error> {
        require_initialized()?;
        Ok(Self {
            min_stake: storage::get_u128("min_stake")?,
            propose_threshold: storage::get_u128("propose_threshold")?,
            quorum_bps: storage::get_u128("quorum_bps")?,
            voting_period_ms: storage::get_u128("voting_period_ms")?,
            timelock_ms: storage::get_u128("timelock_ms")?,
            grace_ms: storage::get_u128("grace_ms")?,
            deposit: storage::get_u128("deposit")?,
        })
    }
}

// ---------------------------------------------------------------------------
// proposals in storage
// ---------------------------------------------------------------------------

/// One proposal, encoded as `proposer|recipient|amount|deposit|status|created_ms|
/// voting_ends|timelock_ends|grace_ends|quorum|yes|no|abstain`.
///
/// A fixed order with fixed types, so a field cannot smuggle a separator into
/// another one. The description lives under its own key.
struct Proposal {
    proposer: String,
    recipient: String,
    amount: u128,
    deposit: u128,
    status: String,
    created_ms: u128,
    voting_ends: u128,
    timelock_ends: u128,
    grace_ends: u128,
    quorum: u128,
    yes: u128,
    no: u128,
    abstain: u128,
}

impl Proposal {
    fn load(id: u128) -> Result<Self, Error> {
        let raw = storage::get(&proposal_key(id))?
            .ok_or_else(|| format!("proposal {id} does not exist"))?;
        Self::parse(&raw).map_err(|detail| format!("proposal {id} is corrupt: {detail}"))
    }

    fn parse(raw: &str) -> Result<Self, Error> {
        let parts: Vec<&str> = raw.split('|').collect();
        if parts.len() != 13 {
            return Err(format!("expected 13 fields, found {}", parts.len()));
        }
        Ok(Self {
            proposer: parts[0].to_string(),
            recipient: parts[1].to_string(),
            amount: parse_u128(parts[2], "amount")?,
            deposit: parse_u128(parts[3], "deposit")?,
            status: parts[4].to_string(),
            created_ms: parse_u128(parts[5], "created_ms")?,
            voting_ends: parse_u128(parts[6], "voting_ends")?,
            timelock_ends: parse_u128(parts[7], "timelock_ends")?,
            grace_ends: parse_u128(parts[8], "grace_ends")?,
            quorum: parse_u128(parts[9], "quorum")?,
            yes: parse_u128(parts[10], "yes")?,
            no: parse_u128(parts[11], "no")?,
            abstain: parse_u128(parts[12], "abstain")?,
        })
    }

    fn encode(&self) -> String {
        format!(
            "{}|{}|{}|{}|{}|{}|{}|{}|{}|{}|{}|{}|{}",
            self.proposer,
            self.recipient,
            self.amount,
            self.deposit,
            self.status,
            self.created_ms,
            self.voting_ends,
            self.timelock_ends,
            self.grace_ends,
            self.quorum,
            self.yes,
            self.no,
            self.abstain
        )
    }

    fn save(&self, id: u128) -> Result<(), Error> {
        storage::set(&proposal_key(id), &self.encode())
    }
}

fn parse_u128(raw: &str, field: &str) -> Result<u128, Error> {
    raw.parse::<u128>()
        .map_err(|_| format!("field {field} is not a number: '{raw}'"))
}

// ---------------------------------------------------------------------------
// keys
// ---------------------------------------------------------------------------

fn stake_key(address: &str) -> String {
    format!("stake:{address}")
}

fn power_key(address: &str) -> String {
    format!("power:{address}")
}

fn delegate_key(address: &str) -> String {
    format!("delegate:{address}")
}

fn lock_key(address: &str) -> String {
    format!("lock:{address}")
}

fn vote_key(id: u128, address: &str) -> String {
    format!("vote:{id}:{address}")
}

fn weight_key(id: u128, address: &str) -> String {
    format!("vote_weight:{id}:{address}")
}

fn proposal_key(id: u128) -> String {
    format!("proposal:{id}")
}

fn description_key(id: u128) -> String {
    format!("proposal:{id}:desc")
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/// The address that casts this account's voting power: its delegatee when it
/// has one, otherwise the account itself. One hop, never resolved further.
fn recipient(address: &str) -> Result<String, Error> {
    storage::get_or(&delegate_key(address), address)
}

/// The moment this account's stake becomes free. If the power sits with a
/// delegatee, the delegatee's lock counts too, so a vote cast with this stake
/// cannot be undone by moving the stake away.
fn effective_lock(address: &str) -> Result<u128, Error> {
    let own = storage::get_u128(&lock_key(address))?;
    let to = recipient(address)?;
    if to == address {
        return Ok(own);
    }
    let other = storage::get_u128(&lock_key(&to))?;
    Ok(own.max(other))
}

fn now_ms() -> Result<u128, Error> {
    let ms = env::block_time_ms();
    if ms < 0 {
        return Err(format!("block time is negative: {ms}"));
    }
    Ok(ms as u128)
}

fn add_ms(now: u128, delta: u128) -> Result<u128, Error> {
    now.checked_add(delta)
        .ok_or_else(|| "deadline would overflow".to_string())
}

fn mul_div_ceil(value: u128, numerator: u128, denominator: u128) -> Result<u128, Error> {
    if denominator == 0 {
        return Err("division by zero".to_string());
    }
    let product = value
        .checked_mul(numerator)
        .ok_or_else(|| "quorum would overflow".to_string())?;
    let quotient = product / denominator;
    if product % denominator == 0 {
        Ok(quotient)
    } else {
        quotient
            .checked_add(1)
            .ok_or_else(|| "quorum would overflow".to_string())
    }
}

/// Send RTM and treat a refusal by the ledger as a failure of this call.
///
/// `send_rtm` answers with a reply, so a `{"error":...}` there would otherwise
/// look like success while no money moved. A refusal traps instead of returning
/// an error reply: an error reply only undoes the call when a *user* made it,
/// while a contract calling us would keep the writes that ran before `pay`.
fn pay(to: &str, amount: u128) {
    if amount == 0 {
        return;
    }
    match call::send_rtm(to, amount) {
        Ok(reply) if !call::is_error_reply(&reply) => {}
        Ok(reply) => retium_contract::fail(&format!(
            "the RTM transfer to {to} was refused: {reply}"
        )),
        Err(reason) => retium_contract::fail(&format!(
            "the RTM transfer to {to} failed: {reason}"
        )),
    }
}

/// Shape only: the contract cannot compute blake3, so the checksum is the
/// wallet's job.
fn looks_like_address(value: &str) -> bool {
    if value.len() != ADDRESS_LEN || !value.starts_with("rete") {
        return false;
    }
    value[4..]
        .bytes()
        .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

// ---------------------------------------------------------------------------
// tests, run against the in-memory chain stand-in
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use retium_contract::test_host;

    const T0: u128 = 1_800_000_000_000;
    const MIN_STAKE: u128 = 1_000;
    const PROPOSE_THRESHOLD: u128 = 5_000;
    const QUORUM_BPS: u128 = 2_000; // 20%
    const VOTING: u128 = ONE_DAY_MS;
    const TIMELOCK: u128 = 2 * ONE_DAY_MS;
    const GRACE: u128 = 7 * ONE_DAY_MS;
    const DEPOSIT: u128 = 100;

    fn addr(c: char) -> String {
        format!("rete{}", c.to_string().repeat(ADDRESS_LEN - 4))
    }

    fn call_json(action: &str, caller: &str, args: &str, value: &str) -> Call {
        Call::from_json(&format!(
            r#"{{"action":"{action}","caller":"{caller}","args":{args},"value":"{value}"}}"#
        ))
        .unwrap()
    }

    fn run(action: &str, caller: &str, args: &str) -> Reply {
        handle(call_json(action, caller, args, "0"))
    }

    fn data(reply: Reply) -> String {
        let raw = reply.expect("call should have succeeded");
        let start = raw.find("\"data\":\"").expect("data field") + 8;
        let rest = &raw[start..];
        let end = rest.rfind('"').expect("closing quote");
        rest[..end].to_string()
    }

    fn number(reply: Reply) -> u128 {
        let raw = data(reply);
        raw.parse()
            .unwrap_or_else(|_| panic!("not a number: {raw:?}"))
    }

    /// `stats` answers `total_staked|treasury|proposal_count`.
    fn stats(who: &str) -> (u128, u128, u128) {
        let raw = data(run("stats", who, "[]"));
        let parts: Vec<&str> = raw.split('|').collect();
        assert_eq!(parts.len(), 3, "{raw}");
        (
            parts[0].parse().unwrap(),
            parts[1].parse().unwrap(),
            parts[2].parse().unwrap(),
        )
    }

    fn at(ms: u128) {
        test_host::set_time_ms(ms as i64);
    }

    fn setup() -> &'static str {
        test_host::reset();
        test_host::set_call_reply(call::RTM, "transfer", r#"{"ok":true}"#);
        at(T0);
        let args = format!(
            r#"["{MIN_STAKE}","{PROPOSE_THRESHOLD}","{QUORUM_BPS}","{VOTING}","{TIMELOCK}","{GRACE}","{DEPOSIT}"]"#
        );
        let reply = run("init", INITIALIZER, &args);
        assert!(reply.is_ok(), "init failed: {reply:?}");
        INITIALIZER
    }

    fn stake(who: &str, amount: u128) -> Reply {
        handle(call_json(
            "stake",
            who,
            &format!(r#"["{amount}"]"#),
            &amount.to_string(),
        ))
    }

    fn unstake(who: &str, amount: u128) -> Reply {
        run("unstake", who, &format!(r#"["{amount}"]"#))
    }

    fn propose(who: &str, recipient: &str, amount: u128, description: &str) -> Reply {
        handle(call_json(
            "propose",
            who,
            &format!(r#"["{recipient}","{amount}","{description}"]"#),
            &DEPOSIT.to_string(),
        ))
    }

    fn vote(who: &str, id: u128, choice: &str) -> Reply {
        run("vote", who, &format!(r#"["{id}","{choice}"]"#))
    }

    fn proposal_status(id: u128) -> String {
        Proposal::load(id).unwrap().status
    }

    // ---- address shape ------------------------------------------------

    #[test]
    fn address_shape_accepts_valid() {
        assert!(looks_like_address(&addr('a')));
        assert!(looks_like_address(&addr('0')));
        assert!(looks_like_address(INITIALIZER));
    }

    #[test]
    fn address_shape_rejects_bad_input() {
        assert!(!looks_like_address(""));
        assert!(!looks_like_address("rete-alice"));
        assert!(!looks_like_address(&addr('A')));
        assert!(!looks_like_address(&addr('g')));
        assert!(!looks_like_address(&format!("{}x", addr('a'))));
        assert!(!looks_like_address(&addr('a')[1..]));
        assert!(!looks_like_address(&format!("xxxx{}", "a".repeat(68))));
        assert!(!looks_like_address("rete_dao"));
    }

    // ---- arithmetic ---------------------------------------------------

    #[test]
    fn quorum_rounds_up_and_refuses_overflow() {
        assert_eq!(mul_div_ceil(1_000, 2_000, 10_000), Ok(200));
        assert_eq!(mul_div_ceil(999, 2_000, 10_000), Ok(200)); // 199.8 -> 200
        assert_eq!(mul_div_ceil(1, 1, 10_000), Ok(1));
        assert_eq!(mul_div_ceil(0, 2_000, 10_000), Ok(0));
        assert!(mul_div_ceil(1, 1, 0).is_err());
        assert!(mul_div_ceil(u128::MAX, 2, 1).is_err());
    }

    #[test]
    fn skim_only_takes_the_surplus() {
        assert_eq!(skim_amount(1_500, 1_000, 400), Ok(100));
        assert_eq!(skim_amount(1_000, 1_000, 0), Ok(0));
        assert!(skim_amount(999, 1_000, 0).is_err());
        assert!(skim_amount(u128::MAX, u128::MAX, 1).is_err());
    }

    // ---- init ---------------------------------------------------------

    #[test]
    fn only_the_deployer_initializes_and_only_once() {
        test_host::reset();
        at(T0);
        let args = format!(
            r#"["{MIN_STAKE}","{PROPOSE_THRESHOLD}","{QUORUM_BPS}","{VOTING}","{TIMELOCK}","{GRACE}","{DEPOSIT}"]"#
        );
        let wrong = run("init", &addr('a'), &args).unwrap_err();
        assert!(wrong.contains("only the deployer"), "{wrong}");
        assert!(run("init", INITIALIZER, &args).is_ok());
        let again = run("init", INITIALIZER, &args).unwrap_err();
        assert!(again.contains("already initialized"), "{again}");
    }

    #[test]
    fn init_rejects_unusable_parameters() {
        let cases: [(&str, &str); 8] = [
            ("0", "min_stake"),
            ("999", "propose_threshold"), // below min_stake
            ("0", "quorum"),
            ("10001", "quorum"),
            ("1000", "voting"),
            ("999999999999", "voting"),
            ("999999999999", "timelock"),
            ("1000", "grace"),
        ];
        for (value, expected) in cases {
            test_host::reset();
            at(T0);
            // One parameter is replaced by `value`; the position identifies it.
            let args = match expected {
                "min_stake" => format!(
                    r#"["{value}","{PROPOSE_THRESHOLD}","{QUORUM_BPS}","{VOTING}","{TIMELOCK}","{GRACE}","{DEPOSIT}"]"#
                ),
                "propose_threshold" => format!(
                    r#"["{MIN_STAKE}","{value}","{QUORUM_BPS}","{VOTING}","{TIMELOCK}","{GRACE}","{DEPOSIT}"]"#
                ),
                "quorum" => format!(
                    r#"["{MIN_STAKE}","{PROPOSE_THRESHOLD}","{value}","{VOTING}","{TIMELOCK}","{GRACE}","{DEPOSIT}"]"#
                ),
                "voting" => format!(
                    r#"["{MIN_STAKE}","{PROPOSE_THRESHOLD}","{QUORUM_BPS}","{value}","{TIMELOCK}","{GRACE}","{DEPOSIT}"]"#
                ),
                "timelock" => format!(
                    r#"["{MIN_STAKE}","{PROPOSE_THRESHOLD}","{QUORUM_BPS}","{VOTING}","{value}","{GRACE}","{DEPOSIT}"]"#
                ),
                _ => format!(
                    r#"["{MIN_STAKE}","{PROPOSE_THRESHOLD}","{QUORUM_BPS}","{VOTING}","{TIMELOCK}","{value}","{DEPOSIT}"]"#
                ),
            };
            let reply = run("init", INITIALIZER, &args);
            assert!(reply.is_err(), "{expected}={value} should be refused");
        }
    }

    #[test]
    fn nothing_works_before_init() {
        test_host::reset();
        at(T0);
        let a = addr('a');
        for action in [
            "deposit", "stake", "unstake", "delegate", "propose", "vote", "finalize", "execute",
            "cancel", "expire", "config", "stats", "treasury_balance",
        ] {
            let reply = run(action, &a, r#"["1","yes","x"]"#);
            assert!(reply.is_err(), "{action} ran before init");
        }
    }

    // ---- money guard --------------------------------------------------

    #[test]
    fn rtm_is_only_accepted_where_the_contract_uses_it() {
        setup();
        for action in [
            "init",
            "unstake",
            "delegate",
            "vote",
            "finalize",
            "execute",
            "cancel",
            "expire",
            "config",
            "stats",
            "proposal",
        ] {
            let reply = handle(call_json(action, INITIALIZER, r#"["1","yes"]"#, "1"));
            assert_eq!(
                reply.unwrap_err(),
                "attach RTM only with stake, propose or deposit",
                "action {action}"
            );
        }
    }

    // ---- staking and power --------------------------------------------

    #[test]
    fn staking_builds_power_and_delegation_moves_it() {
        setup();
        let a = addr('a');
        let b = addr('b');

        assert!(stake(&a, MIN_STAKE - 1).is_err());
        assert!(stake(&a, MIN_STAKE).is_ok());
        assert_eq!(number(run("staked_of", &a, &format!(r#"["{a}"]"#))), MIN_STAKE);
        assert_eq!(number(run("power_of", &a, &format!(r#"["{a}"]"#))), MIN_STAKE);
        assert_eq!(stats(&a).0, MIN_STAKE);

        // A stake call must carry exactly the amount it claims.
        let short = handle(call_json("stake", &a, r#"["100"]"#, "99"));
        assert!(short.unwrap_err().contains("attach exactly 100"));

        assert!(stake(&a, 4_000).is_ok());
        assert_eq!(number(run("power_of", &a, &format!(r#"["{a}"]"#))), 5_000);

        assert!(run("delegate", &a, &format!(r#"["{b}"]"#)).is_ok());
        assert_eq!(number(run("power_of", &a, &format!(r#"["{a}"]"#))), 0);
        assert_eq!(number(run("power_of", &a, &format!(r#"["{b}"]"#))), 5_000);
        assert_eq!(data(run("delegate_of", &a, &format!(r#"["{a}"]"#))), b);

        // b can propose with the aggregate power; a cannot vote at all.
        assert!(propose(&b, &addr('f'), 10, "delegated power").is_ok());
        let no_power = vote(&a, 1, "yes").unwrap_err();
        assert!(no_power.contains("has no voting power"), "{no_power}");

        // Undelegating gives it back.
        assert!(run("delegate", &a, &format!(r#"["{a}"]"#)).is_ok());
        assert_eq!(number(run("power_of", &a, &format!(r#"["{a}"]"#))), 5_000);
        assert_eq!(data(run("delegate_of", &a, &format!(r#"["{a}"]"#))), "");
    }

    #[test]
    fn delegate_must_be_a_plausible_address() {
        setup();
        let a = addr('a');
        stake(&a, MIN_STAKE).unwrap();
        let bad = run("delegate", &a, r#"["rete-bob"]"#).unwrap_err();
        assert!(bad.contains("not a valid Retium address"), "{bad}");
        let same = run("delegate", &a, &format!(r#"["{a}"]"#)).unwrap_err();
        assert!(same.contains("already delegating"), "{same}");
    }

    #[test]
    fn unstake_returns_the_rtm_and_keeps_the_minimum() {
        setup();
        let a = addr('a');
        stake(&a, 5_000).unwrap();

        // Leaving less than the minimum behind is refused.
        let dust = unstake(&a, 4_500).unwrap_err();
        assert!(dust.contains("below the minimum"), "{dust}");
        assert!(unstake(&a, 6_000).unwrap_err().contains("exceeds"));

        assert!(unstake(&a, 5_000).is_ok());
        assert_eq!(number(run("staked_of", &a, &format!(r#"["{a}"]"#))), 0);
        assert_eq!(number(run("power_of", &a, &format!(r#"["{a}"]"#))), 0);
        assert_eq!(stats(&a).0, 0);

        // The RTM actually left: one transfer to the staker, for the amount.
        let calls = test_host::calls();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].contract, call::RTM);
        assert_eq!(calls[0].method, "transfer");
        assert_eq!(calls[0].args, vec![a.clone(), "5000".to_string()]);
    }

    #[test]
    #[should_panic(expected = "was refused")]
    fn a_refused_rtm_transfer_traps_the_call() {
        setup();
        let a = addr('a');
        stake(&a, 5_000).unwrap();
        test_host::set_call_reply(
            call::RTM,
            "transfer",
            r#"{"ok":false,"error":"Insufficient balance"}"#,
        );
        // A trap, not an error reply: a contract calling us would keep the
        // storage writes that ran before the payment otherwise.
        let _ = unstake(&a, 1_000);
    }

    // ---- voting, quorum, timelock -------------------------------------

    #[test]
    fn proposal_needs_power_address_and_deposit() {
        setup();
        let a = addr('a');
        let poor = addr('b');
        stake(&a, 5_000).unwrap();
        stake(&poor, 4_000).unwrap();

        let weak = propose(&poor, &addr('f'), 10, "hi").unwrap_err();
        assert!(weak.contains("below the proposal threshold"), "{weak}");

        let bad_addr = propose(&a, "rete-bob", 10, "hi").unwrap_err();
        assert!(bad_addr.contains("not a valid Retium address"), "{bad_addr}");

        let no_desc = propose(&a, &addr('f'), 10, "").unwrap_err();
        assert!(no_desc.contains("description"), "{no_desc}");

        let long = "x".repeat(MAX_DESCRIPTION_BYTES + 1);
        assert!(propose(&a, &addr('f'), 10, &long).is_err());

        let no_value = run(
            "propose",
            &a,
            &format!(r#"["{}","10","hi"]"#, addr('f')),
        )
        .unwrap_err();
        assert!(no_value.contains("proposal deposit"), "{no_value}");

        assert!(propose(&a, &addr('f'), 10, "hi").is_ok());
        assert_eq!(number(run("treasury_balance", &a, "[]")), DEPOSIT);
        assert_eq!(proposal_status(1), STATUS_ACTIVE);
    }

    #[test]
    fn voting_is_once_per_proposal_and_closes_on_the_deadline() {
        setup();
        let a = addr('a');
        let b = addr('b');
        stake(&a, 5_000).unwrap();
        stake(&b, 5_000).unwrap();
        propose(&a, &addr('f'), 10, "hi").unwrap();

        assert!(vote(&a, 1, "maybe").is_err());
        assert!(vote(&addr('c'), 1, "yes").unwrap_err().contains("no voting power"));
        assert!(vote(&a, 1, "yes").is_ok());
        let twice = vote(&a, 1, "no").unwrap_err();
        assert!(twice.contains("already voted"), "{twice}");

        at(T0 + VOTING);
        let late = vote(&b, 1, "no").unwrap_err();
        assert!(late.contains("has ended"), "{late}");
    }

    #[test]
    fn a_live_vote_locks_the_stake_behind_it() {
        setup();
        let a = addr('a');
        let b = addr('b');
        stake(&a, 5_000).unwrap();
        stake(&b, 5_000).unwrap();
        propose(&a, &addr('f'), 10, "hi").unwrap();
        vote(&a, 1, "yes").unwrap();

        assert_eq!(
            number(run("lock_of", &a, &format!(r#"["{a}"]"#))),
            T0 + VOTING
        );
        let locked = unstake(&a, 1_000).unwrap_err();
        assert!(locked.contains("locked until"), "{locked}");
        let moved = run("delegate", &a, &format!(r#"["{b}"]"#)).unwrap_err();
        assert!(moved.contains("locked until"), "{moved}");

        // b did not vote, so b's stake is free.
        assert!(unstake(&b, 1_000).is_ok());

        at(T0 + VOTING);
        assert!(unstake(&a, 1_000).is_ok());
    }

    #[test]
    fn a_delegators_stake_is_locked_by_its_delegates_vote() {
        // The double-counting hole: A delegates to B, B votes with A's stake,
        // then A undelegates and votes the same stake again.
        setup();
        let a = addr('a');
        let b = addr('b');
        let c = addr('c');
        stake(&a, 10_000).unwrap();
        stake(&b, 1_000).unwrap();
        run("delegate", &a, &format!(r#"["{b}"]"#)).unwrap();
        assert_eq!(number(run("power_of", &b, &format!(r#"["{b}"]"#))), 11_000);

        propose(&b, &addr('f'), 10, "hi").unwrap();
        vote(&b, 1, "yes").unwrap();

        // A's stake is inside the vote B cast, so it cannot move or be moved.
        let unstake_err = unstake(&a, 1_000).unwrap_err();
        assert!(unstake_err.contains("locked until"), "{unstake_err}");
        let undelegate = run("delegate", &a, &format!(r#"["{a}"]"#)).unwrap_err();
        assert!(undelegate.contains("locked until"), "{undelegate}");
        // Nor may new power be sent to a delegatee with a live vote.
        stake(&c, 1_000).unwrap();
        let to_voter = run("delegate", &c, &format!(r#"["{b}"]"#)).unwrap_err();
        assert!(to_voter.contains("live vote"), "{to_voter}");
    }

    #[test]
    fn quorum_and_majority_decide_the_outcome() {
        setup();
        let a = addr('a');
        let b = addr('b');
        stake(&a, 5_000).unwrap();
        stake(&b, 5_000).unwrap(); // total 10_000, quorum 20% = 2_000
        propose(&a, &addr('f'), 10, "hi").unwrap();

        let early = run("finalize", &a, r#"["1"]"#).unwrap_err();
        assert!(early.contains("still open"), "{early}");

        vote(&a, 1, "yes").unwrap();
        at(T0 + VOTING);
        assert!(run("finalize", &b, r#"["1"]"#).is_ok());
        assert_eq!(proposal_status(1), STATUS_QUEUED);

        let p = Proposal::load(1).unwrap();
        assert_eq!(p.timelock_ends, T0 + VOTING + TIMELOCK);
        assert_eq!(p.grace_ends, T0 + VOTING + TIMELOCK + GRACE);
        assert_eq!(p.quorum, 2_000);
    }

    #[test]
    fn without_quorum_the_proposal_is_defeated_and_the_deposit_stays() {
        setup();
        let a = addr('a');
        let b = addr('b');
        stake(&a, 5_000).unwrap();
        stake(&b, 5_000).unwrap();
        propose(&a, &addr('f'), 10, "hi").unwrap();
        vote(&a, 1, "abstain").unwrap();

        // Both stakes are 5_000 and quorum is 2_000, so one abstain is enough
        // participation but there is no yes vote to pass it.
        at(T0 + VOTING);
        let reply = run("finalize", &b, r#"["1"]"#).unwrap();
        assert!(reply.contains("defeated"));
        assert_eq!(proposal_status(1), STATUS_DEFEATED);
        assert_eq!(number(run("treasury_balance", &a, "[]")), DEPOSIT);

        let again = run("finalize", &b, r#"["1"]"#).unwrap_err();
        assert!(again.contains("not active"), "{again}");
    }

    #[test]
    fn a_yes_and_no_tie_is_defeated() {
        setup();
        let a = addr('a');
        let b = addr('b');
        stake(&a, 5_000).unwrap();
        stake(&b, 5_000).unwrap();
        propose(&a, &addr('f'), 10, "hi").unwrap();
        vote(&a, 1, "yes").unwrap();
        vote(&b, 1, "no").unwrap();
        at(T0 + VOTING);
        run("finalize", &a, r#"["1"]"#).unwrap();
        assert_eq!(proposal_status(1), STATUS_DEFEATED);
    }

    #[test]
    fn low_participation_is_defeated_even_with_only_yes_votes() {
        setup();
        let a = addr('a');
        let b = addr('b');
        stake(&a, 5_000).unwrap();
        stake(&b, 95_000).unwrap(); // total 100_000, quorum 20% = 20_000
        propose(&a, &addr('f'), 10, "hi").unwrap();
        vote(&a, 1, "yes").unwrap(); // 5_000 < 20_000
        at(T0 + VOTING);
        run("finalize", &a, r#"["1"]"#).unwrap();
        assert_eq!(proposal_status(1), STATUS_DEFEATED);
    }

    #[test]
    fn execution_respects_the_timelock_and_the_grace_window() {
        setup();
        let a = addr('a');
        let b = addr('b');
        let treasury_source = addr('c');
        stake(&a, 5_000).unwrap();
        stake(&b, 5_000).unwrap();
        handle(call_json("deposit", &treasury_source, "[]", "5000")).unwrap();
        propose(&a, &addr('f'), 1_000, "pay").unwrap();
        vote(&a, 1, "yes").unwrap();
        vote(&b, 1, "yes").unwrap();
        at(T0 + VOTING);
        run("finalize", &a, r#"["1"]"#).unwrap();
        assert_eq!(proposal_status(1), STATUS_QUEUED);

        let too_early = run("execute", &a, r#"["1"]"#).unwrap_err();
        assert!(too_early.contains("timelock"), "{too_early}");

        at(T0 + VOTING + TIMELOCK);
        assert!(run("execute", &b, r#"["1"]"#).is_ok());
        assert_eq!(proposal_status(1), STATUS_EXECUTED);
        // 5_100 in, 1_000 out to the recipient, 100 back to the proposer.
        assert_eq!(number(run("treasury_balance", &a, "[]")), 4_000);

        let calls = test_host::calls();
        assert_eq!(calls[0].args, vec![addr('f'), "1000".to_string()]);
        assert_eq!(calls[1].args, vec![a.clone(), "100".to_string()]);

        let twice = run("execute", &b, r#"["1"]"#).unwrap_err();
        assert!(twice.contains("not queued"), "{twice}");
    }

    #[test]
    fn execution_after_the_window_is_refused_and_expire_closes_it() {
        setup();
        let a = addr('a');
        stake(&a, 5_000).unwrap();
        handle(call_json("deposit", &a, "[]", "5000")).unwrap();
        propose(&a, &addr('f'), 1_000, "pay").unwrap();
        vote(&a, 1, "yes").unwrap();
        at(T0 + VOTING);
        run("finalize", &a, r#"["1"]"#).unwrap();

        let early = run("expire", &a, r#"["1"]"#).unwrap_err();
        assert!(early.contains("still open"), "{early}");

        at(T0 + VOTING + TIMELOCK + GRACE + 1);
        let late = run("execute", &a, r#"["1"]"#).unwrap_err();
        assert!(late.contains("window closed"), "{late}");
        assert!(run("expire", &a, r#"["1"]"#).is_ok());
        assert_eq!(proposal_status(1), STATUS_EXPIRED);
        assert_eq!(number(run("treasury_balance", &a, "[]")), 5_100);
    }

    #[test]
    fn the_treasury_must_cover_the_payment() {
        setup();
        let a = addr('a');
        stake(&a, 5_000).unwrap();
        handle(call_json("deposit", &a, "[]", "500")).unwrap();
        propose(&a, &addr('f'), 1_000, "too much").unwrap();
        vote(&a, 1, "yes").unwrap();
        at(T0 + VOTING);
        run("finalize", &a, r#"["1"]"#).unwrap();
        at(T0 + VOTING + TIMELOCK);
        let short = run("execute", &a, r#"["1"]"#).unwrap_err();
        assert!(short.contains("the treasury holds"), "{short}");
        // 500 deposited plus the 100 deposit, nothing paid out.
        assert_eq!(number(run("treasury_balance", &a, "[]")), 600);
    }

    #[test]
    fn only_the_proposer_cancels_and_only_before_the_deadline() {
        setup();
        let a = addr('a');
        let b = addr('b');
        stake(&a, 5_000).unwrap();
        stake(&b, 5_000).unwrap();
        propose(&a, &addr('f'), 10, "hi").unwrap();

        let other = run("cancel", &b, r#"["1"]"#).unwrap_err();
        assert!(other.contains("only the proposal creator"), "{other}");
        assert!(run("cancel", &a, r#"["1"]"#).is_ok());
        assert_eq!(proposal_status(1), STATUS_CANCELLED);
        assert_eq!(number(run("treasury_balance", &a, "[]")), DEPOSIT);

        at(T0 + VOTING);
        let late = run("cancel", &a, r#"["1"]"#).unwrap_err();
        assert!(late.contains("not active"), "{late}");
    }

    #[test]
    fn governance_can_never_spend_staked_rtm() {
        setup();
        let a = addr('a');
        stake(&a, 10_000).unwrap();
        // No treasury at all, and the only balance is the stake.
        propose(&a, &addr('f'), 1_000, "steal").unwrap();
        vote(&a, 1, "yes").unwrap();
        at(T0 + VOTING);
        run("finalize", &a, r#"["1"]"#).unwrap();
        at(T0 + VOTING + TIMELOCK);
        let reply = run("execute", &a, r#"["1"]"#).unwrap_err();
        assert!(reply.contains("the treasury holds"), "{reply}");
        assert_eq!(stats(&a).0, 10_000);
    }

    #[test]
    fn storage_round_trip_of_a_proposal() {
        let encoded = "retea|reteb|1|2|active|3|4|5|6|7|8|9|10";
        let parsed = Proposal::parse(encoded).unwrap();
        assert_eq!(parsed.encode(), encoded);
        assert_eq!(parsed.amount, 1);
        assert_eq!(parsed.abstain, 10);
        assert!(Proposal::parse("too|few|fields").is_err());
        assert!(Proposal::parse("a|b|x|2|active|3|4|5|6|7|8|9|10").is_err());
    }

    #[test]
    fn unknown_action_is_refused() {
        setup();
        assert!(run("steal", &addr('a'), "[]").is_err());
    }

    #[test]
    fn config_is_readable_and_ordered() {
        setup();
        let raw = data(run("config", &addr('a'), "[]"));
        let parts: Vec<&str> = raw.split('|').collect();
        assert_eq!(parts.len(), 10, "{raw}");
        assert_eq!(parts[0], MIN_STAKE.to_string());
        assert_eq!(parts[1], PROPOSE_THRESHOLD.to_string());
        assert_eq!(parts[2], QUORUM_BPS.to_string());
        assert_eq!(parts[3], VOTING.to_string());
        assert_eq!(parts[4], TIMELOCK.to_string());
        assert_eq!(parts[5], GRACE.to_string());
        assert_eq!(parts[6], DEPOSIT.to_string());
        assert_eq!(parts[9], "0");
    }
}
