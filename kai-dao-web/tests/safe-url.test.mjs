import assert from "node:assert/strict";
import test from "node:test";

const { safeUrl } = await import("../lib/safe-url.ts");

/**
 * The gate that stands between chain text and a browser URL bar. Every case
 * below is a way a string has been used to run code or leave the site.
 */

test("internal routes pass unchanged", () => {
  for (const path of ["/", "/stake", "/proposals/12", "/proposals/new?x=1", "/a#b"]) {
    assert.equal(safeUrl(path), path);
  }
});

test("https URLs pass unchanged", () => {
  const url = "https://wallet.retium.org/connect/sdk/retium-sdk-1.5.0.js";
  assert.equal(safeUrl(url), url);
  assert.equal(safeUrl("  https://retium.net  "), "https://retium.net");
});

test("script, data and non-https schemes become a dead link", () => {
  const blocked = [
    // The gate under test exists to refuse these; naming them is the point.
    // eslint-disable-next-line no-script-url -- sample the gate must reject
    "javascript:alert(1)",
    // eslint-disable-next-line no-script-url -- same URL, different case
    "JavaScript:alert(1)",
    " javascript:alert(1)",
    "java\tscript:alert(1)",
    "java\nscript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "data:text/html;base64,PHNjcmlwdD4=",
    "vbscript:msgbox(1)",
    "http://retium.org",
    "file:///etc/passwd",
    "mailto:x@y.z",
  ];

  for (const value of blocked) {
    assert.equal(safeUrl(value), "#", `should refuse: ${JSON.stringify(value)}`);
  }
});

test("protocol-relative and backslash tricks stay on the dead link", () => {
  for (const value of ["//evil.example", "/\\evil.example", "\\/evil.example"]) {
    assert.equal(safeUrl(value), "#", `should refuse: ${JSON.stringify(value)}`);
  }
});

test("empty and missing values fail closed", () => {
  for (const value of ["", "   ", null, undefined]) {
    assert.equal(safeUrl(value), "#");
  }
});
