"use client";

import { AddressChip } from "@/components/address-chip";
import { Amount } from "@/components/amount";
import { useAppConfig } from "@/components/app-config";
import { Failure, Field, Loading, Notice, Panel, Stat } from "@/components/ui";
import { overviewDtoSchema } from "@/lib/api-schemas";
import { useApi } from "@/lib/use-api";

export default function ParametersPage() {
  const app = useAppConfig();
  const overview = useApi("/api/dao/overview", overviewDtoSchema, { intervalMs: 15_000 });

  if (overview.loading && !overview.data) return <Loading what="the rules" />;
  if (!overview.data) {
    return <Failure message={overview.failure?.message ?? "The rules could not be read."} />;
  }

  const { config, contract, codeHashMatches, configProblem } = overview.data;

  if (config === null) {
    return (
      <div className="space-y-5">
        <h1 className="text-3xl font-semibold tracking-tight">Rules</h1>
        <Notice tone="warning">
          Not initialized yet: <span className="mono">{configProblem ?? "config was refused"}</span>
          .
        </Notice>
        <ContractIdentity
          id={contract.contractId}
          codeHash={contract.codeHash}
          matches={codeHashMatches}
          type={`${contract.type} ${contract.version}`}
        />
      </div>
    );
  }

  const quorumStake = (BigInt(config.totalStakedAtomic) * BigInt(config.quorumBps)) / 10_000n;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Rules</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Fixed at deploy. No owner, no pause, no upgrade.
        </p>
      </div>

      {!codeHashMatches ? (
        <Notice tone="danger">
          This contract&apos;s code hash is not the one this app was built for. Do not sign anything
          until you know why.
        </Notice>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Min stake" hint="to hold power">
          <Amount atomic={config.minStakeAtomic} />
        </Stat>
        <Stat label="To propose" hint="voting power">
          <Amount atomic={config.proposeThresholdAtomic} />
        </Stat>
        <Stat label="Deposit" hint="refunded on execute">
          <Amount atomic={config.depositAtomic} />
        </Stat>
        <Stat label="Quorum" hint="of stake at creation">
          {config.quorumBps / 100}%
        </Stat>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Voting">
          <div className="space-y-2.5">
            <Field label="Voting period">{duration(config.votingPeriodMs)}</Field>
            <Field label="Choices">yes, no, abstain</Field>
            <Field label="One vote per proposal">it locks your stake until the deadline</Field>
            <Field label="Outcome">quorum met and yes &gt; no queues it, else defeated</Field>
            <Field label="Quorum today">
              <Amount atomic={quorumStake.toString()} />
            </Field>
          </div>
        </Panel>

        <Panel title="Execution">
          <div className="space-y-2.5">
            <Field label="Timelock">{duration(config.timelockMs)}</Field>
            <Field label="Window">{duration(config.graceMs)} to execute</Field>
            <Field label="After the window">it can only expire</Field>
            <Field label="Who executes">anyone</Field>
            <Field label="Spendable">treasury only, never stake</Field>
          </div>
        </Panel>
      </div>

      <Panel title="Security">
        <ul className="space-y-2 text-sm text-zinc-300">
          {[
            [
              "No admin.",
              "There is no setter, pause or upgrade, so a stolen deployer key changes nothing.",
            ],
            [
              "No double voting.",
              "Voting locks the stake until the deadline; the lock follows the delegate.",
            ],
            ["Quorum is a snapshot.", "Moving stake mid-vote cannot lower the bar."],
            [
              "Time gates the money.",
              "Passed proposals wait out a timelock, then have a closed window.",
            ],
            [
              "Payments are atomic.",
              "A refused transfer aborts the call, so nothing is recorded unpaid.",
            ],
            [
              "Bounded inputs.",
              "Checked arithmetic, no loops over user data, 512-byte descriptions.",
            ],
          ].map(([title, text]) => (
            <li key={title} className="flex gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-kai" />
              <span>
                <span className="font-medium text-zinc-100">{title}</span>{" "}
                <span className="text-zinc-400">{text}</span>
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Trade-offs" description="Deliberate. Read before the treasury matters.">
        <ul className="space-y-2 text-sm text-zinc-400">
          {[
            "Voting power is read live, not snapshotted: stake that arrives during a vote can vote.",
            "The quorum denominator is a snapshot, so a large exit makes quorum harder to reach.",
            "A whale can stake just before a proposal; the vote lock and timelock only limit it.",
            "The contract checks address shape, not the checksum. This app checks the checksum of what you type.",
          ].map((text) => (
            <li key={text} className="flex gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-600" />
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <ContractIdentity
        id={contract.contractId}
        codeHash={contract.codeHash}
        matches={codeHashMatches}
        type={`${contract.type} ${contract.version} · weight ${contract.weight ?? "?"}`}
        deployer={contract.deployer}
        traits={contract.traits}
      />

      <p className="text-xs text-zinc-600">
        Check the binary yourself:{" "}
        <span className="mono break-all">retium verify {app.contractId} stake_dao.wasm</span>
      </p>
    </div>
  );
}

function ContractIdentity({
  id,
  codeHash,
  matches,
  type,
  deployer,
  traits,
}: {
  id: string;
  codeHash: string;
  matches: boolean;
  type: string;
  deployer?: string;
  traits?: string[];
}) {
  return (
    <Panel title="Contract">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Id">
          <span className="mono break-all text-xs">{id}</span>
        </Field>
        <Field label="Code hash">
          <span className="mono break-all text-xs">{codeHash}</span>
          <span
            className={`mt-1.5 inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] ${
              matches
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : "border-red-500/40 bg-red-500/10 text-red-300"
            }`}
          >
            {matches ? "verified" : "mismatch"}
          </span>
        </Field>
        <Field label="Type">{type}</Field>
        {deployer ? (
          <Field label="Deployer">
            <AddressChip address={deployer} short />
          </Field>
        ) : null}
        {traits && traits.length > 0 ? <Field label="Traits">{traits.join(", ")}</Field> : null}
      </div>
    </Panel>
  );
}

function duration(ms: number): string {
  if (ms === 0) return "none";
  if (ms % 86_400_000 === 0) {
    const d = ms / 86_400_000;
    return `${d} day${d === 1 ? "" : "s"}`;
  }
  if (ms % 3_600_000 === 0) {
    const h = ms / 3_600_000;
    return `${h} hour${h === 1 ? "" : "s"}`;
  }
  return `${Math.round(ms / 60_000)} minutes`;
}
