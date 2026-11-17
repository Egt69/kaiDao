import react from "eslint-plugin-react";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * The security half of the guard, on top of scripts/check-dangerous-patterns.mjs.
 *
 * ESLint reads the syntax tree, so it cannot be fooled by a comment, a string
 * split in two, or a member reached with brackets. The regex script stays
 * because it also covers .mjs and .html files, and because its own tests pin
 * every rule to a fixture.
 *
 * Only the escape hatches this dApp must never use are enabled. A general
 * style/lint pass is a separate decision: turning on a whole preset here would
 * mix formatting opinions into a security gate.
 */
export default tseslint.config(
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "out/**",
      "next-env.d.ts",
      // Deliberately unsafe and deliberately safe files used by the scanner's
      // own tests. Linting them would defeat their purpose.
      "tests/fixtures/**",
    ],
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: "module",
      },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { react },
    rules: {
      // React's raw-HTML escape hatch: chain text must stay a JSX child.
      "react/no-danger": "error",
      // A script URL runs when followed, including javascript: in JSX.
      "react/jsx-no-script-url": "error",
      // A new tab that keeps window.opener can navigate this page.
      "react/jsx-no-target-blank": [
        "error",
        { allowReferrer: false, warnOnSpreadAttributes: true },
      ],
      // String-to-code compilation, in all four spellings.
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-script-url": "error",
    },
  },
);
