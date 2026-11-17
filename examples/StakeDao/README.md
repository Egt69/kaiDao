# StakeDao — a conventional, stake-weighted DAO

A DAO shaped like the ones people mean when they say "DAO": anyone can join by
staking, voting power can be delegated, proposals need a quorum, and an approved
payment waits out a timelock before it can be executed.

RTM is the governance token. There is no separate token contract: staking moves
real RTM into this contract, and that stake stays locked while it is being used
to vote.

```bash
# unit tests (uses the in-memory chain stand-in)
cargo test -p stake_dao

# build the deployable module
cargo build --release --target wasm32-unknown-unknown -p stake_dao
```

## Parameters, fixed at `init`

`init` is callable once, by the address in `INITIALIZER`, and takes seven
numbers. Every one is immutable afterwards: there is no admin key, no setter and
no upgrade path.

| # | Argument | Meaning | Allowed |
|---|---|---|---|
| 0 | `min_stake` | smallest stake an address may hold | > 0 |
| 1 | `propose_threshold` | voting power needed to open a proposal | ≥ `min_stake` |
| 2 | `quorum_bps` | quorum as basis points of total stake at creation | 1..=10000 |
| 3 | `voting_period_ms` | how long voting stays open | 1 h ..= 30 d |
| 4 | `timelock_ms` | wait between passing and executing | 0 ..= 30 d |
| 5 | `grace_ms` | window to execute after the timelock | 1 h ..= 30 d |
| 6 | `deposit` | RTM a proposer must attach (atomic units) | any |

Suggested values for a small testnet DAO: `1000000000000000000` (1 RTM),
`5000000000000000000` (5 RTM), `2000` (20%), `259200000` (3 d), `172800000`
(2 d), `604800000` (7 d), `1000000000000000000` (1 RTM).

## Actions

| Action | Who | RTM attached | Notes |
|---|---|---|---|
| `init` | `INITIALIZER`, once | no | fixes the parameters |
| `deposit` | anyone | yes | credited to the treasury, no voting power |
| `stake(amount)` | anyone | exactly `amount` | voting power goes to the delegatee, else the staker |
| `unstake(amount)` | staker | no | refused while a live vote uses that stake |
| `delegate(address)` | anyone | no | one hop; pass your own address to undelegate |
| `propose(recipient, amount, description)` | power ≥ threshold | exactly `deposit` | description 1..512 bytes |
| `vote(id, yes\|no\|abstain)` | power > 0 | no | once per proposal, locks the stake until voting ends |
| `finalize(id)` | anyone | no | after the deadline: `queued` or `defeated` |
| `execute(id)` | anyone | no | inside the timelock window |
| `cancel(id)` | proposer | no | only while voting is open |
| `expire(id)` | anyone | no | a `queued` proposal whose window closed |

Reads: `config`, `stats`, `proposal(id)`, `proposal_description(id)`,
`staked_of(address)`, `power_of(address)`, `delegate_of(address)`,
`lock_of(address)`, `vote_of(id, address)`, `treasury_balance`.

## Status machine

```
active ──finalize: quorum and yes > no──► queued ──execute──► executed
  │                                          │
  │ finalize: no quorum or yes <= no         │ expire after the window
  ├──► defeated                               └──► expired
  │
  │ cancel by proposer before the deadline
  └──► cancelled
```

## Money handling

The contract holds two kinds of RTM and never mixes them:

* **staked** — owned by stakers, counted in `total_staked`, and returned only by
  `unstake`;
* **treasury** — owned by the DAO, counted in `treasury`, and paid out only by an
  executed proposal.

Governance can therefore never spend a staker's stake. `treasury_balance` is the
counter, not the raw account balance: `balance == total_staked + treasury` holds
after every action.

The proposal deposit is credited to the treasury when the proposal is created
and refunded from it when the proposal executes. A cancelled or defeated
proposal leaves the deposit in the treasury, so spam costs money.

## Security notes

1. **No admin after `init`.** Parameters are validated once and never change.
   There is no owner action, no pause switch and no upgrade.
2. **Votes cannot be counted twice.** A vote locks the voter's stake, and while
   that lock is live the address cannot unstake, receive new delegation or move
   its power elsewhere. The lock is also read through the delegate: if a
   delegatee votes, their delegators' stake is locked too, so it cannot be
   undelegated and voted again.
3. **Quorum is a snapshot** taken at creation (rounded up), so it cannot be
   lowered by moving stake during the vote.
4. **Timelock before money moves**, plus a grace window; after the window the
   proposal can only expire, never execute.
5. **Every transfer is checked.** A refused RTM transfer (`{"error":...}` reply)
   traps the call rather than returning an error reply, so the whole call is
   undone even when another contract made it — an error reply only undoes a
   user's call, and a contract caller would keep the writes that ran before the
   payment. Payouts are bounded by the `treasury` counter, which is itself
   bounded by the account balance.
6. **Checked arithmetic** everywhere, no loops over user data, no state outside
   storage, bounded strings.

Known trade-offs, deliberately chosen: no upgrade path; staked RTM is never
spendable by governance; delegation is one hop; a whale can still stake just
before a proposal (the timelock and the vote lock limit, but do not remove, that
advantage); addresses are checked for shape only, because a contract cannot
compute the blake3 checksum — verify the checksum in the wallet.

Three limits worth knowing before the treasury holds anything real:

* **Quorum is a snapshot, not an average.** A large staker who unstakes between
  the snapshot and the vote lowers the participation others can reach. At a 20%
  quorum that costs several times the stake of everyone else; at a 100% quorum a
  single atomic unit is enough to make a proposal unreachable. The fix would be
  a time-weighted or checkpointed denominator, which this chain does not expose
  to contracts.
* **Voting power is read live, not snapshotted at creation.** Stake that arrives
  during the vote can vote, and stake can leave once voting closes, before the
  timelock ends. The lock covers the voting window only.
* **`deposit = 0` removes the anti-spam cost** (gas still applies). Choose a
  deposit that is meaningful for the treasury you expect.

