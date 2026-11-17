// Run with: npm test (node --test, using Node's own TypeScript stripping).

import assert from "node:assert/strict";
import test from "node:test";

const { parseRtm, formatRtm, formatRtmExact, U128_MAX } = await import("../lib/amount.ts");
const { isValidAddress, addressProblem } = await import("../lib/address.ts");
const {
  parseContractReply,
  parseConfig,
  parseStats,
  parseProposal,
  parseVote,
  parseDelegate,
  parseEventData,
  isChainAddress,
} = await import("../lib/contract.ts");

const OWNER = "rete4203660202c54aeea6d540c2063eb928a049201dbf50a50123b7ab7dd608c44da641";
const VOTER = "retec16d223f3b7d77836494c7321970166150d97117b4e361ec81e1e9becffa2de91504";
const RECIPIENT = "rete42cd3f397c31a83434aefde429582741544cf6d06ee01f7c6924d4561e00bc1e46ad";

test("amounts convert exactly and refuse what a human could misread", () => {
  const onePointFive = parseRtm("1.5");
  assert.ok(onePointFive.ok);
  assert.equal(onePointFive.atomic, 1500000000000000000n);
  assert.equal(onePointFive.atomic.toString(), "1500000000000000000");

  const smallest = parseRtm("0.000000000000000001");
  assert.ok(smallest.ok);
  assert.equal(smallest.atomic, 1n);

  for (const bad of ["", " ", "1,5", "1e21", "-1", "1.2.3", ".5", "1.", "abc"]) {
    assert.equal(parseRtm(bad).ok, false, `accepted ${JSON.stringify(bad)}`);
  }

  assert.equal(parseRtm("1.1234567890123456789").ok, false); // 19 decimals

  // The contract stores atomic units in a u128, so the largest RTM amount is
  // floor(u128 max / 10^18). One whole RTM above that does not fit.
  const maxWholeRtm = U128_MAX / 10n ** 18n;
  assert.ok(parseRtm(maxWholeRtm.toString()).ok);
  assert.equal(parseRtm((maxWholeRtm + 1n).toString()).ok, false);
});

test("formats trim for tables and keep full precision on demand", () => {
  assert.equal(formatRtm("1500000000000000000"), "1.5");
  assert.equal(formatRtm("100000000000000000"), "0.1");
  assert.equal(formatRtm("1"), "0");
  assert.equal(formatRtmExact("1"), "0.000000000000000001");
  assert.equal(formatRtmExact("100000000000000000"), "0.1");
});

test("addresses carry a checksum and a typo is caught", () => {
  for (const address of [OWNER, VOTER, RECIPIENT]) {
    assert.equal(addressProblem(address), null, address);
    assert.equal(isValidAddress(address), true);
  }

  assert.equal(addressProblem(OWNER.slice(0, -1) + "0"), "checksum");
  // Rust's `is_valid` checks the prefix before the hex body, and "RETE" is not
  // "rete", so an uppercased address fails as a prefix problem, not a checksum.
  assert.equal(addressProblem(OWNER.toUpperCase()), "prefix");
  assert.equal(addressProblem("rete" + "A".repeat(68)), "characters");
  assert.equal(addressProblem("rete_treasury"), "length");
  assert.equal(addressProblem("xxxx" + "a".repeat(68)), "prefix");
  assert.equal(addressProblem(""), "empty");
});

test("the query envelope's ok is not the contract's result", () => {
  // `parseContractReply` receives the *inner* string, i.e. envelope.output.
  // A refusal looks like this and must never be read as success:
  const innerRefusal = '{"ok":false,"error":"caller has no voting power"}';
  const refused = parseContractReply(innerRefusal);
  assert.equal(refused.kind, "refused");
  assert.equal(refused.error, "caller has no voting power");

  const good = parseContractReply(
    `{"ok":true,"data":"${OWNER}|${VOTER}|1|1|active|0|0|0|0|0|0|0|0"}`,
  );
  assert.equal(good.kind, "ok");

  assert.throws(() => parseContractReply("not json"));
  assert.throws(() => parseContractReply('{"ok":true}'));
  assert.throws(() => parseContractReply('{"ok":false}'));
});

test("config, stats and proposal parse real replies", () => {
  const config = parseConfig(
    "1000000000000000000|5000000000000000000|2000|259200000|172800000|604800000|1000000000000000000|5000000000000000000|1000000000000000000|1",
  );
  assert.equal(config.minStakeAtomic, 1000000000000000000n);
  assert.equal(config.proposeThresholdAtomic, 5000000000000000000n);
  assert.equal(config.quorumBps, 2000);
  assert.equal(config.votingPeriodMs, 259200000);
  assert.equal(config.timelockMs, 172800000);
  assert.equal(config.graceMs, 604800000);
  assert.equal(config.depositAtomic, 1000000000000000000n);
  assert.equal(config.totalStakedAtomic, 5000000000000000000n);
  assert.equal(config.treasuryAtomic, 1000000000000000000n);
  assert.equal(config.proposalCount, 1);

  const stats = parseStats("5000000000000000000|1000000000000000000|1");
  assert.equal(stats.totalStakedAtomic, 5000000000000000000n);
  assert.equal(stats.proposalCount, 1);

  const proposal = parseProposal(
    1,
    `${OWNER}|${RECIPIENT}|10000000000000000|1000000000000000000|active|1794843876000|1795019555983|0|0|1000000000000000000|5000000000000000000|0|0`,
  );
  assert.equal(proposal.amountAtomic, 10000000000000000n);
  assert.equal(proposal.depositAtomic, 1000000000000000000n);
  assert.equal(proposal.status, "active");
  assert.equal(proposal.quorumAtomic, 1000000000000000000n);
  assert.equal(proposal.yesAtomic, 5000000000000000000n);
  assert.equal(proposal.abstainAtomic, 0n);

  assert.throws(() => parseConfig("1|2|0|3|4|5|6|7|8|9")); // quorum out of range
  assert.throws(() => parseConfig("1|2|2000|3|4|5|6|7|8")); // 9 fields
  assert.throws(() => parseProposal(1, `${OWNER}|${RECIPIENT}|1|1|weird|0|0|0|0|0|0|0|0`));
  assert.throws(() => parseProposal(1, `${OWNER}|${RECIPIENT}|1|1|active|0|0|0|0|0|0|0`));
});

test("votes and delegation distinguish 'none' from a refusal", () => {
  assert.equal(parseVote("yes"), "yes");
  assert.equal(parseVote("no"), "no");
  assert.equal(parseVote("abstain"), "abstain");
  assert.equal(parseVote(""), null);
  assert.throws(() => parseVote("maybe"));

  assert.equal(parseDelegate(""), null);
  assert.equal(parseDelegate(VOTER), VOTER);
  assert.throws(() => parseDelegate("not an address"));
});

test("chain addresses are shape-checked without a checksum", () => {
  assert.equal(isChainAddress(OWNER), true);
  // A contract cannot compute blake3, so the checksum is not validated here.
  assert.equal(isChainAddress(OWNER.slice(0, -1) + "0"), true);
  assert.equal(isChainAddress("rete" + "a".repeat(64)), false);
});

test("events parse and unknown ones stay visible instead of crashing", () => {
  const staked = parseEventData(
    "staked",
    JSON.stringify({
      staker: OWNER,
      amount: "1000000000000000000",
      power_to: OWNER,
      staked: "1000000000000000000",
      total_staked: "5000000000000000000",
    }),
  );
  assert.equal(staked.type, "staked");
  assert.equal(staked.amountAtomic, 1000000000000000000n);
  assert.equal(staked.totalStakedAtomic, 5000000000000000000n);

  const vote = parseEventData(
    "vote_cast",
    JSON.stringify({
      id: "1",
      voter: VOTER,
      choice: "yes",
      weight: "5000000000000000000",
      yes: "5000000000000000000",
      no: "0",
      abstain: "0",
    }),
  );
  assert.equal(vote.type, "vote_cast");
  assert.equal(vote.id, 1);
  assert.equal(vote.weightAtomic, 5000000000000000000n);

  const executed = parseEventData(
    "proposal_executed",
    JSON.stringify({
      id: "1",
      recipient: RECIPIENT,
      amount: "10000000000000000",
      deposit_returned: "1000000000000000000",
      treasury: "0",
    }),
  );
  assert.equal(executed.type, "proposal_executed");
  assert.equal(executed.depositReturnedAtomic, 1000000000000000000n);

  const refused = parseEventData(
    "proposal_defeated",
    JSON.stringify({
      id: "2",
      reason: "quorum",
      yes: "0",
      no: "0",
      abstain: "0",
      quorum: "1000",
      participation: "0",
    }),
  );
  assert.equal(refused.type, "proposal_defeated");
  assert.equal(refused.reason, "quorum");

  const unknown = parseEventData("something_new", '{"a":1}');
  assert.equal(unknown.type, "unknown");

  // A known event with a missing field must not be guessed at.
  assert.throws(() => parseEventData("staked", JSON.stringify({ staker: OWNER })));
});
