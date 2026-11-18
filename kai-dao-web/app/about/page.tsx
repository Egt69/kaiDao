import type { Metadata } from "next";
import Link from "next/link";
import { Panel } from "@/components/ui";

export const metadata: Metadata = {
  title: "About — KaiDAO",
  description:
    "How to use KaiDAO, the rules fixed in its contract, and the terms that apply on the Retium public testnet.",
};

const RULES: { name: string; value: string; meaning: string }[] = [
  {
    name: "Minimum stake",
    value: "1 RTM",
    meaning:
      "The smallest amount an address may keep staked. A partial unstake must leave this much or nothing.",
  },
  {
    name: "Proposal threshold",
    value: "5 RTM",
    meaning: "Voting power needed to open a proposal. Stake delegated to you counts.",
  },
  {
    name: "Quorum",
    value: "20% (2000 bps)",
    meaning:
      "Share of the total stake when the proposal was created. It is rounded up and frozen at creation.",
  },
  {
    name: "Voting period",
    value: "3 days",
    meaning: "Voting closes after this time and the result can then be finalized.",
  },
  {
    name: "Timelock",
    value: "2 days",
    meaning: "A passing proposal cannot pay out until this time after finalization.",
  },
  {
    name: "Grace window",
    value: "7 days",
    meaning: "The window after the timelock in which the payment may still be executed.",
  },
  {
    name: "Proposal deposit",
    value: "1 RTM",
    meaning:
      "Paid when proposing. Refunded on execution; kept by the treasury on cancel, defeat or expiry.",
  },
];

export default function AboutPage() {
  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-white/[0.09] bg-gradient-to-r from-white/[0.05] to-transparent p-5 sm:p-6">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-kai">
          Guide &amp; terms
        </p>
        <h1 className="mt-1.5 text-3xl font-semibold tracking-tight">About KaiDAO</h1>
        <p className="mt-1 max-w-3xl text-sm text-zinc-400">
          Everything below describes what this app and its contract actually do on the Retium public
          testnet. The contract is immutable; the rules on this page reflect the code deployed at
          the address at the bottom.
        </p>
      </header>

      <Panel title="What KaiDAO is" description="A stake-weighted DAO, not a token or an exchange.">
        <div className="space-y-2 text-sm text-zinc-300">
          <p>
            RTM that you stake is the governance token. There is no separate governance token and no
            token to buy: you attach real RTM to a contract call and that stake gives you voting
            power.
          </p>
          <p>
            The contract holds two buckets that never mix.{" "}
            <b className="text-zinc-100">Staked RTM</b> belongs to stakers and only{" "}
            <span className="mono">unstake</span> returns it. The{" "}
            <b className="text-zinc-100">treasury</b> belongs to the DAO and only an executed
            proposal pays it out. After every action, the contract balance equals stake plus
            treasury.
          </p>
          <p>
            There is no admin key, no pause switch, no upgrade path and no way to change a parameter
            after <span className="mono">init</span>. The code and its settings are frozen.
          </p>
        </div>
      </Panel>

      <Panel title="Before you start" description="What you need and what it costs.">
        <ul className="list-disc space-y-2 pl-5 text-sm text-zinc-300">
          <li>
            A Retium wallet (web wallet or browser extension) set to <b>chain id 3</b>, the public
            testnet. This app refuses any other chain and will ask you to switch.
          </li>
          <li>
            A little test RTM for gas. Reads are free and need no key. Every write is a signed
            transaction with a flat fee based on contract weight; this contract is weight 5. Gas is
            charged even when the contract refuses the call.
          </li>
          <li>
            Your own keys. This site never asks for a seed phrase, key file or developer API key,
            and it never stores one. All signing happens in your wallet on your device.
          </li>
          <li>
            Testnet coins only. RTM and RTD here have no value, cannot be sold and cannot be moved
            to mainnet. The testnet is reset from time to time, which clears balances, contracts and
            history.
          </li>
        </ul>
      </Panel>

      <Panel title="How to use it" description="The buttons named here are the ones in this app.">
        <ol className="list-decimal space-y-3 pl-5 text-sm text-zinc-300">
          <li>
            <b className="text-zinc-100">Connect your wallet.</b> Use &ldquo;Connect wallet&rdquo;
            in the top right. The app checks the chain id and the checksum of your address before
            any signature is requested.
          </li>
          <li>
            <b className="text-zinc-100">Stake.</b> Open{" "}
            <Link className="text-kai hover:text-kai-soft" href="/stake">
              Stake
            </Link>
            , enter an amount of at least 1 RTM and press <span className="mono">Stake</span>. The
            RTM attached to the call must equal the amount exactly. Your voting power appears on the
            same page.
          </li>
          <li>
            <b className="text-zinc-100">Delegate (optional).</b> In the same page, enter another
            Retium address and press <span className="mono">Delegate</span> to send your power
            there, or <span className="mono">Use mine</span> and then{" "}
            <span className="mono">Delegate</span> to take it back. Delegation is one hop only. It
            is refused while a live vote uses the stake on either side.
          </li>
          <li>
            <b className="text-zinc-100">Open a proposal.</b> Go to{" "}
            <Link className="text-kai hover:text-kai-soft" href="/proposals/new">
              New proposal
            </Link>
            . You need at least 5 RTM of power. Fill in the recipient address, an amount greater
            than zero and a description of 1 to 512 bytes, then attach exactly the 1 RTM deposit.
            The deposit goes to the treasury when the proposal is created.
          </li>
          <li>
            <b className="text-zinc-100">Vote.</b> Open a proposal from{" "}
            <Link className="text-kai hover:text-kai-soft" href="/proposals">
              Proposals
            </Link>{" "}
            and choose <span className="mono">yes</span>, <span className="mono">no</span> or{" "}
            <span className="mono">abstain</span>. One address may vote once per proposal, with the
            power it has at that moment. Your stake is locked until voting ends, so it cannot be
            moved and voted again elsewhere.
          </li>
          <li>
            <b className="text-zinc-100">Close and pay.</b> After the 3-day vote, anyone can press{" "}
            <span className="mono">Finalize result</span>. The proposal is queued only if
            participation reaches the quorum snapshot and yes beats no; otherwise it is defeated. A
            queued proposal can be paid with <span className="mono">Execute payment</span> between
            the end of the 2-day timelock and the end of the 7-day grace window. That sends the
            amount to the recipient and refunds the deposit to the proposer. Use{" "}
            <span className="mono">Cancel proposal</span> (proposer only, before the deadline) or{" "}
            <span className="mono">Mark expired</span> (anyone, after the window) to close the other
            paths. All three closing actions leave the deposit in the treasury.
          </li>
        </ol>
      </Panel>

      <Panel
        title="Rules fixed at initialization"
        description="The current on-chain configuration."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[11px] uppercase tracking-wide text-zinc-500">
                <th className="py-2 pr-4 font-medium">Rule</th>
                <th className="py-2 pr-4 font-medium">Value</th>
                <th className="py-2 font-medium">Meaning</th>
              </tr>
            </thead>
            <tbody>
              {RULES.map((rule) => (
                <tr key={rule.name} className="border-b border-white/[0.06] align-top">
                  <td className="py-2.5 pr-4 text-zinc-400">{rule.name}</td>
                  <td className="py-2.5 pr-4 font-medium text-zinc-100">{rule.value}</td>
                  <td className="py-2.5 text-zinc-400">{rule.meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="What this app cannot do">
        <ul className="list-disc space-y-2 pl-5 text-sm text-zinc-400">
          <li>Move your stake or the treasury without a signature from your wallet.</li>
          <li>Change a rule, pause the DAO or upgrade the contract; no such function exists.</li>
          <li>Spend staked RTM from governance. Only the treasury is spendable by a proposal.</li>
          <li>
            Verify the deployed binary itself. Run <span className="mono">retium verify</span> with
            the command below to do that yourself.
          </li>
          <li>
            Show votes older than the event pages it reads (bounded at 1,000 events); the proposal
            page says when that limit is reached.
          </li>
          <li>
            Call <span className="mono">skim</span>, which has no button here. Anyone can call it
            directly on the contract to move stray RTM into the treasury; it never touches stake.
          </li>
        </ul>
      </Panel>

      <Panel title="Terms of use">
        <ol className="list-decimal space-y-2.5 pl-5 text-sm text-zinc-400">
          <li>
            <b className="text-zinc-200">Testnet only.</b> RTM and RTD on this network have no
            monetary value. Nothing here is an offer, a sale, an investment or financial advice.
            Balances and history can be wiped by a testnet reset.
          </li>
          <li>
            <b className="text-zinc-200">You control your keys.</b> Keep your seed phrase and key
            file private and offline. This app cannot recover them, and no administrator can either.
            Anyone with your seed controls your account.
          </li>
          <li>
            <b className="text-zinc-200">You are responsible for what you sign.</b> The confirmation
            dialog shows the contract, method, arguments and amounts. Check the recipient, the
            amount and the code hash before approving. A signature is final authority on chain.
          </li>
          <li>
            <b className="text-zinc-200">Settlement is strict.</b> A transaction counts as done only
            when the node reports <span className="mono">HardFinal</span> with a successful result.
            A refused contract call still consumes gas, and nothing it attempted is kept.
          </li>
          <li>
            <b className="text-zinc-200">The rules are code, not promises.</b> Parameters cannot be
            changed after initialization, and the recipient, amount and description of a proposal
            are fixed when it is created. Read the contract before trusting it with funds.
          </li>
          <li>
            <b className="text-zinc-200">Deposits are at risk.</b> The proposal deposit is not
            returned if the proposal is cancelled, defeated or allowed to expire. Only execution
            refunds it.
          </li>
          <li>
            <b className="text-zinc-200">Address checks have limits.</b> The app recomputes the
            checksum before signing, but the contract can only check the shape of an address because
            it cannot compute the checksum on chain. Always verify the full address.
          </li>
          <li>
            <b className="text-zinc-200">Third-party services.</b> The RPC endpoint, explorer and
            wallet are separate services. This app is not their operator and does not custody funds.
            Reads go through this site&apos;s own server routes; writes go directly from your wallet
            to the chain.
          </li>
          <li>
            <b className="text-zinc-200">Privacy.</b> The app uses no cookies, no browser storage
            and no analytics. It holds no secret and asks for no personal information.
          </li>
          <li>
            <b className="text-zinc-200">Software as-is.</b> This is testnet tooling provided
            without warranty. It may contain bugs or be unavailable. These terms can change; the
            deployed contract cannot.
          </li>
        </ol>
      </Panel>

      <Panel
        title="Contract identity"
        description="Pinned by this build and shown before every signature."
      >
        <dl className="space-y-2 text-sm">
          <div className="flex flex-col gap-1">
            <dt className="text-[11px] uppercase tracking-wide text-zinc-500">Contract</dt>
            <dd className="mono break-all text-xs text-zinc-300">
              cd67349e35f885134d3b3969d9b7780716d9c38abfee155c16cc2a607ba2a931
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-[11px] uppercase tracking-wide text-zinc-500">Code hash</dt>
            <dd className="mono break-all text-xs text-zinc-300">
              8b63cfc5fed9fe6f18e38ee46e8d0babb71315aaf8b6957b8dd0cdc9238a6592
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-[11px] uppercase tracking-wide text-zinc-500">Type</dt>
            <dd className="text-xs text-zinc-300">stake_dao v1.0.0 · weight 5</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-[11px] uppercase tracking-wide text-zinc-500">
              Verify it yourself
            </dt>
            <dd className="mono break-all text-xs text-zinc-300">
              retium verify cd67349e35f885134d3b3969d9b7780716d9c38abfee155c16cc2a607ba2a931
              stake_dao.wasm
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-zinc-500">
          Source and build instructions:{" "}
          <span className="mono break-all">github.com/Egt69/kaiDao</span>.
        </p>
      </Panel>
    </div>
  );
}
