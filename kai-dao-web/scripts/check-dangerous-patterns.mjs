/**
 * Fails when the app gains a way to turn blockchain data into executable
 * markup or a dangerous URL. Every string this app shows comes from the chain
 * or from a user: a proposal description, an event field, a contract type.
 * React escapes those when they are JSX children, so the only way to break
 * that guarantee is to reach for one of the escape hatches below.
 *
 * This is the cheap, dependency-free layer. It is deliberately paired with
 * ESLint in CI: the AST rules there cannot be fooled by comments or spelling,
 * and these regexes cover files ESLint does not parse (.mjs, .html) and plain
 * text that never becomes a call.
 *
 * Known limits, by design:
 * - It matches today's spellings. `el["in" + "nerHTML"] = x` is out of reach;
 *   `no-computed-dangerous-member` catches the literal bracket form only.
 * - Comments are stripped before matching and strings are left alone, so a
 *   line may hold at most one statement for the report to be exact.
 * - A deliberate exception needs a reason on the same line:
 *     // safety-check: ignore no-eval — the string is data, never called
 *   An exception without a reason is itself reported.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const APP_ROOT = path.resolve(HERE, "..");

/**
 * Directories that hold no shipped source. `tests/` and `scripts/` are
 * excluded on purpose: fixtures there must be allowed to contain the bad
 * patterns, and the scanner is tested by pointing it at those fixtures.
 */
const SKIP_DIRS = new Set(["node_modules", ".next", "out", "tests", "scripts", ".git"]);

/** A PNG can never contain these tokens anyway. */
const SOURCE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".html", ".htm"]);

const MARKER = /safety-check:\s*ignore\s+([a-z0-9,-]+)\s*(?:—|–|--)\s*(.{5,})/i;
const MARKER_LOOKS_LIKE = /safety-check:\s*ignore/i;

/**
 * The JSX or HTML opening tag that contains `at`, or null when the text does
 * not look like a tag. Attributes are usually one per line, so a line-based
 * check cannot see `rel=` next to `target=`; this finds the whole tag.
 * `>` inside `{…}` (an arrow function) and inside a string is ignored.
 */
function tagAround(text, at) {
  let start = -1;

  // Backwards to the `<` that opens this tag. `=>` and `>=` are not the end
  // of a tag, so their `>` must not stop the walk.
  for (let i = at - 1; i >= 0; i -= 1) {
    const char = text[i];
    if (char === "<") {
      start = i;
      break;
    }
    if (char === ">" && text[i - 1] !== "=" && text[i + 1] !== "=") return null;
  }

  if (start === -1) return null;

  // Forwards to its `>`, ignoring any inside a string or a `{…}` expression.
  let depth = 0;
  let quote = null;

  for (let i = start + 1; i < text.length; i += 1) {
    const char = text[i];

    if (quote !== null) {
      if (char === "\\") {
        i += 1;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      continue;
    }
    if (depth !== 0) continue;
    if (char === ">") return text.slice(start, i + 1);
  }

  return null;
}

export const RULES = [
  {
    id: "no-dangerously-set-inner-html",
    pattern: /dangerouslySetInnerHTML/g,
    why: "React's raw-HTML escape hatch. Chain text must stay a JSX child.",
  },
  {
    id: "no-inner-html-assignment",
    pattern: /\.(?:inner|outer)HTML\s*=/g,
    why: "Assigning HTML re-parses text as markup. Use textContent or JSX.",
  },
  {
    id: "no-computed-dangerous-member",
    pattern: /\[\s*["'`](?:innerHTML|outerHTML|eval|Function|write|writeln)["'`]\s*\]/g,
    why: "A bracket string hides the same member from a plain search.",
  },
  {
    id: "no-insert-adjacent-html",
    pattern: /insertAdjacentHTML\s*\(/g,
    why: "Parses a string as markup in place.",
  },
  {
    id: "no-document-write",
    pattern: /\bdocument\s*\.\s*writ(?:e|eln)\s*\(/g,
    why: "Writes markup into the document.",
  },
  {
    id: "no-contextual-fragment",
    pattern: /createContextualFragment\s*\(/g,
    why: "Turns a string into DOM nodes, which is the same as innerHTML.",
  },
  {
    id: "no-eval",
    pattern: /\beval\s*\(/g,
    why: "Evaluates a string as JavaScript.",
  },
  {
    id: "no-new-function",
    pattern: /\bnew\s+(?:[A-Za-z_$][\w$]*\.)*Function\s*\(/g,
    why: "Compiles a string into a function, same risk as eval.",
  },
  {
    id: "no-function-constructor-call",
    pattern: /(?<!new\s)(?<![\w$.])Function\s*\(/g,
    why: "Function(text) without `new` compiles a string too.",
  },
  {
    id: "no-implied-eval",
    pattern: /\bset(?:Timeout|Interval)\s*\(\s*["'`]/g,
    why: "A string first argument is compiled and run. Pass a function.",
  },
  {
    id: "no-implicit-string-timer",
    check: (line) => /\bset(?:Timeout|Interval)\s*\(\s*(?!function\b|async\b)[A-Za-z_$]/.test(line),
    why: "A variable can hold a string, and a timer runs strings. Write an arrow.",
  },
  {
    id: "no-script-url",
    check: (line) => /java\s*script\s*:/i.test(line),
    why: "A script URL runs code when followed.",
  },
  {
    id: "no-data-html-url",
    check: (line) => /data\s*:\s*text\/html/i.test(line),
    why: "A data URL can carry a whole HTML document, script included.",
  },
  {
    id: "no-srcdoc",
    check: (line) => /\bsrcDoc\s*=|\bsrcdoc\s*=/i.test(line),
    why: "srcDoc renders a string as a document, scripts may run inside.",
  },
  {
    id: "no-target-blank-without-noopener",
    check: (line, context) => {
      const target = /target\s*=\s*["']_blank["']/i.exec(line);
      if (target === null) return false;

      // Formatters put each JSX attribute on its own line, so look at the
      // whole tag. When the tag cannot be found, fail closed and report:
      // `rel={expr}` also fails closed, because it cannot be read statically.
      const text = context?.text ?? line;
      const at = (context?.offset ?? 0) + target.index;
      const tag = tagAround(text, at);
      if (tag === null) return true;

      const rel = tag.match(/\brel\s*=\s*["']([^"']*)["']/i);
      if (rel === null) return true;

      const tokens = rel[1].toLowerCase().split(/\s+/);
      return !(tokens.includes("noopener") && tokens.includes("noreferrer"));
    },
    why: 'target="_blank" without noopener noreferrer hands the opener over.',
  },
  {
    id: "no-unsafe-dynamic-href",
    check: (line) => {
      const opener = /\b(?:href|src)=\{\s*/g;
      let found = false;
      let match;

      while ((match = opener.exec(line)) !== null) {
        const rest = line.slice(opener.lastIndex);
        // A literal cannot change scheme at runtime.
        if (rest.startsWith('"') || rest.startsWith("'")) continue;
        if (rest.includes("safeUrl(")) continue;
        found = true;
      }

      return found;
    },
    why: "Every dynamic href or src goes through safeUrl(): https or a local path, nothing else.",
  },
];

/**
 * Removes comments so a sentence in prose cannot fail the build, while
 * leaving strings alone so `"https://…"` is not mistaken for a comment.
 */
function stripComments(text) {
  const out = [];
  let inBlock = false;

  for (const raw of text.split(/\r?\n/)) {
    let line = "";
    let quote = null;
    let index = 0;

    while (index < raw.length) {
      const char = raw[index];
      const next = raw[index + 1];

      if (inBlock) {
        if (char === "*" && next === "/") {
          inBlock = false;
          index += 2;
          continue;
        }
        index += 1;
        continue;
      }

      if (quote !== null) {
        line += char;
        if (char === "\\") {
          line += next ?? "";
          index += 2;
          continue;
        }
        if (char === quote) quote = null;
        index += 1;
        continue;
      }

      if (char === '"' || char === "'" || char === "`") {
        quote = char;
        line += char;
        index += 1;
        continue;
      }

      if (char === "/" && next === "/") break;
      if (char === "/" && next === "*") {
        inBlock = true;
        index += 2;
        continue;
      }

      line += char;
      index += 1;
    }

    out.push(line);
  }

  return out;
}

/** One file, one pass: every rule, on the line it matched. */
export function scanSource(file, text) {
  const findings = [];
  const rawLines = text.split(/\r?\n/);
  const codeLines = stripComments(text);
  const codeText = codeLines.join("\n");
  const lineOffsets = [];
  let cursor = 0;

  for (const line of codeLines) {
    lineOffsets.push(cursor);
    cursor += line.length + 1;
  }

  for (let index = 0; index < rawLines.length; index += 1) {
    const raw = rawLines[index];
    const code = codeLines[index] ?? "";
    const marker = raw.match(MARKER);
    const ignored = marker ? marker[1].split(",").map((id) => id.trim()) : [];

    if (marker === null && MARKER_LOOKS_LIKE.test(raw)) {
      findings.push({
        file,
        line: index + 1,
        rule: "ignore-marker-without-reason",
        why: "An exception needs a reason: // safety-check: ignore <rule> — <why>",
        text: raw.trim().slice(0, 160),
      });
    }

    for (const rule of RULES) {
      if (ignored.includes(rule.id) || ignored.includes("all")) continue;

      let hit;
      if (rule.pattern) {
        rule.pattern.lastIndex = 0;
        hit = rule.pattern.test(code);
        rule.pattern.lastIndex = 0;
      } else {
        hit = rule.check(code, { text: codeText, offset: lineOffsets[index] ?? 0, index });
      }

      if (!hit) continue;

      findings.push({
        file,
        line: index + 1,
        rule: rule.id,
        why: rule.why,
        text: raw.trim().slice(0, 160),
      });
    }
  }

  return findings;
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      files.push(...(await walk(full)));
      continue;
    }

    if (!entry.isFile()) continue;
    if (!SOURCE_EXT.has(path.extname(entry.name).toLowerCase())) continue;
    files.push(full);
  }

  return files;
}

/** Walks a directory tree and reports findings with paths relative to `root`. */
export async function scanRepository(root = APP_ROOT) {
  const files = await walk(root);
  const findings = [];

  for (const file of files) {
    const text = await readFile(file, "utf8");
    findings.push(...scanSource(path.relative(root, file).split(path.sep).join("/"), text));
  }

  return findings;
}

const invokedDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const findings = await scanRepository();

  if (findings.length === 0) {
    console.log(`ok: no raw-HTML, eval or unsafe URL pattern in ${path.basename(APP_ROOT)}`);
  } else {
    for (const finding of findings) {
      console.error(`${finding.file}:${finding.line}  ${finding.rule}`);
      console.error(`    ${finding.why}`);
      console.error(`    ${finding.text}`);
    }
    console.error(`\n${findings.length} finding(s). Chain text must never become code.`);
    process.exitCode = 1;
  }
}
