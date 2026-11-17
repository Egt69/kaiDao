import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RULES, scanRepository, scanSource } from "../scripts/check-dangerous-patterns.mjs";

/**
 * A guard that is silently broken is worse than no guard, because it buys
 * false confidence. So the scanner is tested against two fixtures: one file
 * that breaks every rule on purpose, and one that does the same work safely.
 * Both live under tests/, which the scanner skips when it walks the app.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, "fixtures");

async function fixture(name) {
  return readFile(path.join(FIXTURES, name), "utf8");
}

test("the dangerous fixture trips every rule the scanner declares", async () => {
  const text = await fixture("dangerous/unsafe.tsx");
  const findings = scanSource("unsafe.tsx", text);
  const hit = new Set(findings.map((finding) => finding.rule));

  for (const rule of RULES) {
    assert.ok(
      hit.has(rule.id),
      `rule ${rule.id} caught nothing in the dangerous fixture, so it is dead weight (found: ${[...hit].sort().join(", ")})`,
    );
  }

  // Every rule is also reported with a line that exists and a reason to show.
  for (const finding of findings) {
    assert.ok(finding.line >= 1, `${finding.rule} has no line`);
    assert.equal(typeof finding.why, "string");
    assert.ok(finding.why.length > 10, `${finding.rule} has no explanation`);
  }

  assert.equal(RULES.length, 16, "a rule was removed or renamed without updating this test");
});

test("the clean fixture, which does the same work safely, reports nothing", async () => {
  const text = await fixture("clean/safe.tsx");
  const findings = scanSource("safe.tsx", text);

  assert.deepEqual(
    findings.map((finding) => `${finding.line} ${finding.rule}  ${finding.text}`),
    [],
    "a safe construct was flagged, so the guard would block correct code",
  );
});

test("the scanner walks a directory and keeps relative paths", async () => {
  const findings = await scanRepository(FIXTURES);

  assert.ok(findings.length > 0, "scanRepository found nothing in the fixtures");
  assert.ok(
    findings.every((finding) => !path.isAbsolute(finding.file)),
    "report paths must be relative so CI output is short",
  );
  assert.ok(
    findings.some((finding) => finding.file === "dangerous/unsafe.tsx"),
    `expected dangerous/unsafe.tsx in ${[...new Set(findings.map((f) => f.file))].join(", ")}`,
  );
  assert.ok(
    findings.every((finding) => finding.file !== "clean/safe.tsx"),
    "the clean fixture was reported",
  );
});

test("an exception needs a reason, and only silences the rule it names", () => {
  const ignored = scanSource(
    "sample.tsx",
    "const a = eval(source); // safety-check: ignore no-eval \u2014 source is data, never called",
  );
  assert.deepEqual(ignored, []);

  const noReason = scanSource(
    "sample.tsx",
    "const a = eval(source); // safety-check: ignore no-eval",
  );
  assert.deepEqual(
    noReason.map((finding) => finding.rule).sort(),
    ["ignore-marker-without-reason", "no-eval"],
    "an exception without a reason must still fail",
  );

  const wrongRule = scanSource(
    "sample.tsx",
    "<div dangerouslySetInnerHTML={x} /> // safety-check: ignore no-eval \u2014 unrelated rule",
  );
  assert.deepEqual(
    wrongRule.map((finding) => finding.rule),
    ["no-dangerously-set-inner-html"],
    "an exception must not silence a different rule",
  );
});

test("prose in a comment is not code", () => {
  const text = [
    "// Never use eval(value) or dangerouslySetInnerHTML here.",
    "/* innerHTML = text would re-parse markup; srcDoc loads a document. */",
    'const copy = "innerHTML stays a string";',
    "const { innerHTML } = element.dataset;",
    "if (name === 'eval') report(name);",
    "<p>{description}</p>",
  ].join("\n");

  assert.deepEqual(scanSource("sample.tsx", text), []);
});

test("rel on a different element does not excuse a bare target=_blank", () => {
  const text = [
    '<a href={safeUrl(href)} target="_blank" rel="noopener noreferrer">fine</a>',
    "<a",
    "  href={safeUrl(href)}",
    '  target="_blank"',
    ">",
    "  bare, no rel in its own tag",
    "</a>",
  ].join("\n");

  assert.deepEqual(
    scanSource("sample.tsx", text).map((finding) => `${finding.line} ${finding.rule}`),
    ["4 no-target-blank-without-noopener"],
  );
});

test("the shipped app has no raw-HTML, eval or unsafe URL escape hatch", async () => {
  const findings = await scanRepository();

  assert.deepEqual(
    findings.map((finding) => `${finding.file}:${finding.line} ${finding.rule}`),
    [],
    "a proposal description, event field or chain address could become executable markup or a script URL",
  );
});
