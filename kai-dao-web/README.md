# KaiDAO web

A small, read-first UI for **KaiDAO**, the stake-weighted DAO at
`cd67349e35f885134d3b3969d9b7780716d9c38abfee155c16cc2a607ba2a931` on the
Retium public testnet.

Stake RTM to get voting power, delegate it one hop, open proposals that pay from
the treasury, vote, finalize, wait out the timelock and execute. The rules live in
the contract (`examples/StakeDao/src/lib.rs`); this app only reads them and asks
your wallet to sign.

Testnet only. RTM and RTD here have no value.

## Run it

```bash
cd kai-dao-web
npm install
cp .env.example .env.local     # values are already correct
npm run dev                    # http://localhost:3000
```

Other commands:

```bash
npm test                       # parser and validation tests, no network
npm run typecheck              # tsc --noEmit
npm run build                  # production build
```

## How it handles money and keys

The same approach as the sibling `dao-web` app, for the same reasons:

1. **No secret in the browser.** There is no API key, no seed and no key file
   anywhere in this repo. Reads are free; writes are signed by `window.retium`
   with the user's own keys.
2. **Reads go through this app's server.** The browser never calls
   `rpc.retium.org` directly. Five route handlers validate every input and every
   answer's shape before anything reaches the UI.
3. **An allowlisted contract interface.** `lib/dao.ts` names the ten read methods
   the contract implements and how many arguments each takes; anything else is
   refused locally. The chain publishes no ABI, so that list *is* the ABI.
4. **BigInt for every amount.** `lib/amount.ts` turns "1.5" into
   `1500000000000000000n` and never into a JavaScript number.
5. **The outer `ok` is not the answer.** `lib/contract.ts` is the only module
   that reads `output`, and it parses the contract's own `{"ok":…,"data"|"error"}`
   reply, so a refusal can never render as success.
6. **Done means HardFinal.** `components/tx-dialog.tsx` polls the transaction
   until the node reports `HardFinal` with a good result. A transaction id alone is
   "submitted", not "done".
7. **Address checksums before signing.** `lib/address.ts` recomputes the blake3
   checksum of every recipient and delegate address; a typo is refused before the
   wallet sees it.
8. **A nonce-based CSP.** `proxy.ts` sets a per-request Content-Security-Policy
   with `'strict-dynamic'`, no `unsafe-inline` for scripts, and the wallet bundle
   pinned by version and SRI hash.

## Pages

| Path | What it does |
|---|---|
| `/` | Totals, your position, the rules, the newest proposals, contract identity |
| `/stake` | Stake, unstake and delegate, with the contract's minimums checked first |
| `/proposals` | Every proposal with tallies, quorum progress and the next deadline |
| `/proposals/new` | Build a proposal: recipient, amount, description, attached deposit |
| `/proposals/[id]` | Full proposal, voters from the event log, vote / finalize / execute / cancel / expire |
| `/treasury` | Treasury and stake counters, deposits, recent movements |
| `/activity` | The contract's event log, newest first, with paging |
| `/parameters` | Every immutable parameter, the security model and its trade-offs |

## Configuration

All of `.env.local` is public.

| Variable | Meaning |
|---|---|
| `RETIUM_RPC_URL` | endpoint, `https://` only |
| `RETIUM_CHAIN_ID` | must be `3`; the app refuses to start otherwise |
| `RETIUM_CONTRACT_ID` | the KaiDAO contract id |
| `RETIUM_CONTRACT_CODE_HASH` | the sha of the wasm it was deployed from |
| `RETIUM_WALLET_SDK_VERSION` / `_INTEGRITY` | the pinned wallet bundle and its SRI hash |

The code hash is shown next to the contract on every page that can sign
something. If it does not match the build this app was made for, the UI says so
and asks you not to sign.

## What this app cannot do

* It cannot move stake or treasury RTM without your wallet.
* It cannot change a parameter: the contract has no setter and no admin.
* It cannot show a voter who is older than the event pages it reads (bounded at
  1,000 events); the page says when that happens.
* It cannot verify the contract's binary. Run
  `retium verify <contract id> stake_dao.wasm` yourself.

## Licence

Part of the Retium SDK workspace; testnet tooling for the public Retium testnet.
