const js = require("@eslint/js");
const globals = require("globals");

/**
 * Flat ESLint config for the CommonJS Node backend.
 * Built on eslint:recommended plus a couple of project conventions:
 * server code should not log to the console (use a logger / explicit
 * disable on the few legitimate startup + error paths), and unused
 * identifiers prefixed with "_" are intentional throwaways.
 */
module.exports = [
  {
    ignores: ["node_modules/**", "storage/**"],
  },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
    rules: {
      "no-console": "error",
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
    },
  },
];
