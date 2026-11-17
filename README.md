# KaiDAO

A stake-weighted DAO on the **Retium public testnet** (chain id 3): a Rust/WASM
contract plus the Next.js interface that reads it and asks a wallet to sign.

RTM is the governance token. Anyone can stake, voting power can be delegated one
hop, proposals need a quorum of the stake that existed when they were created,
and an approved payment waits out a timelock before it can be executed. There is
no admin key after `init`.

Testnet only. RTM and RTD here have no value.

## Deployed contract

| | |
|---|---|
| Contract | `cd67349e35f885134d3b3969d9b7780716d9c38abfee155c16cc2a607ba2a931` |
| Code hash | `8b63cfc5fed9fe6f18e38ee46e8d0babb71315aaf8b6957b8dd0cdc9238a6592` |
| Type / version | `stake_dao` v1.0.0, weight 5 |
| Parameters | min stake 1 RTM, threshold 5 RTM, quorum 2000 bps, voting 3 d, timelock 2 d, grace 7 d, deposit 1 RTM |

```bash
retium contract cd67349e35f885134d3b3969d9b7780716d9c38abfee155c16cc2a607ba2a931
```

## Layout

```
kai-dao-web/        the Next.js app: pages, API route handlers, wallet bridge
examples/StakeDao/  the contract: src/lib.rs, 28 unit tests, its own README
```

`kai-dao-web/README.md` explains the money and key handling; the contract's own
README lists every action, the status machine and the security trade-offs.

## Run the interface

```bash
cd kai-dao-web
npm install
cp .env.example .env.local     # every value in it is public
npm run dev                    # http://localhost:3000
```

Other commands: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.
`check:patterns` runs a zero-dependency scan for raw HTML, `eval` and unguarded
URLs; it is wired into `prebuild` and `pretest`.

## Build the contract

`retium-contract` is not published on crates.io, so `examples/StakeDao/Cargo.toml`
resolves it as `../../crates/retium-contract`. Build it inside a checkout of the
[Retium SDK](https://github.com/Retium-Org/retium-sdk):

```bash
git clone https://github.com/Retium-Org/retium-sdk
cp -r kaiDao/examples/StakeDao retium-sdk/examples/StakeDao
# add "examples/StakeDao" to `members` in retium-sdk/Cargo.toml
cd retium-sdk
rustup target add wasm32-unknown-unknown
cargo test -p stake_dao
cargo build --release --target wasm32-unknown-unknown -p stake_dao
retium verify cd67349e35f885134d3b3969d9b7780716d9c38abfee155c16cc2a607ba2a931 \
  target/wasm32-unknown-unknown/release/stake_dao.wasm
```

The last command must print `match`: it proves the chain runs exactly that file.

## How it handles money

1. No secret in the repo. Reads are free; every write is signed by the user's own
   wallet through `window.retium`.
2. The browser never calls the node directly; five server route handlers validate
   inputs and answers.
3. The contract holds two buckets that never mix: `total_staked` belongs to
   stakers and only `unstake` returns it, `treasury` belongs to the DAO and only
   an executed proposal pays it out. After every action
   `balance == total_staked + treasury`.
4. Votes lock the stake behind them, including stake delegated to a voter, so
   the same RTM cannot vote twice.
5. A refused RTM transfer traps the call, so a payment can never leave the books
   half-written.

## Endpoints

| | |
|---|---|
| RPC | https://rpc.retium.org |
| Explorer | https://retium.net |
| Wallet | https://wallet.retium.org |
| Testnet funds | https://retium.money |

Testnet tooling for the public Retium testnet.
