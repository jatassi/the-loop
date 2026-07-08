// Lint gate for the-loop's own code (the self-hosting lint-gate binding): strictest
// presets as the floor, explicit adds on top, complexity budgets, architecture-as-lint.
// Suppressions follow the build-agent rule — a standing relaxation carries its
// justification here or it doesn't land.
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import importX from 'eslint-plugin-import-x';
import nodePlugin from 'eslint-plugin-n';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import unicorn from 'eslint-plugin-unicorn';
import globals from 'globals';

export default defineConfig([
  // eval/results + fixtures-cache hold materialized repo copies (linting them would
  // re-lint the whole codebase per fixture); oracle files execute inside a fixture
  // at <fixture>/eval-oracle/, so their relative imports only resolve there.
  globalIgnores(['node_modules', 'docs', 'eval/results', 'eval/fixtures-cache', 'eval/**/oracle']),
  {
    files: ['**/*.js'],
    extends: [
      js.configs.recommended,
      nodePlugin.configs['flat/recommended-module'],
      unicorn.configs.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2024,
      globals: globals.node,
    },
    plugins: {
      'import-x': importX,
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      // ── Structural budgets ─────────────────────────────────────
      'max-lines': ['error', { max: 350, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true }],
      'max-depth': ['error', 3],
      'max-params': ['error', 3],
      complexity: ['error', 10],
      'max-nested-callbacks': ['error', 2],

      // ── Architecture as lint: import direction is downward-only ─
      // bin (CLI surface) → src (library). src imports nothing above it.
      'import-x/no-restricted-paths': [
        'error',
        {
          zones: [
            { target: './src', from: './bin', message: 'src is the library layer; it must not reach up into the CLI surface.' },
            { target: './src', from: './test', message: 'src must not import test code.' },
            { target: './bin', from: './test', message: 'bin must not import test code.' },
          ],
        },
      ],
      'import-x/no-cycle': ['error', { maxDepth: 4 }],
      'import-x/no-duplicates': 'error',
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',

      // ── Code quality ───────────────────────────────────────────
      'no-console': 'error',
      'no-debugger': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      curly: ['error', 'all'],
      'no-else-return': ['error', { allowElseIf: false }],
      'no-lonely-if': 'error',
      'no-unneeded-ternary': 'error',
      'no-nested-ternary': 'error',
      'object-shorthand': 'error',
      'prefer-template': 'error',

      // Destructure-and-drop ({ _blocks, ...rest }) and _-prefixed placeholders are
      // the house omit idiom.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],

      // ── Unicorn overrides ──────────────────────────────────────
      // The codebase's JSDoc'd contracts use null deliberately ({doc, span} | null);
      // short names (doc, opts, idx) are the house idiom, not abbreviation drift.
      'unicorn/no-null': 'off',
      'unicorn/prevent-abbreviations': 'off',
      'unicorn/name-replacements': 'off',
    },
  },
  {
    // The CLI surface owns exit codes; process.exit at this boundary is the contract.
    files: ['bin/**/*.js'],
    rules: {
      'n/no-process-exit': 'off',
      'unicorn/no-process-exit': 'off',
    },
  },
  {
    // The eval harness is an operator-facing CLI surface like bin/: its product IS
    // console output (progress lines, comparison tables) and it owns its exit codes.
    files: ['eval/**/*.js'],
    rules: {
      'no-console': 'off',
      'n/no-process-exit': 'off',
      'unicorn/no-process-exit': 'off',
    },
  },
  {
    // Test files: a node:test body is one narrative — fixture + acts + asserts —
    // and callbacks nest one level deeper by construction (test(() => throws(() => …))).
    files: ['test/**/*.js'],
    rules: {
      'max-lines-per-function': 'off',
      'max-nested-callbacks': ['error', 3],
    },
  },
  {
    // Workflow scripts run inside a Claude Code Workflow (ADR-0029): no imports, no
    // filesystem — agent/parallel/pipeline/log/args/budget arrive as harness globals —
    // and the file's only export, `meta`, sits above a bare top-level `return`. Neither
    // shape parses on its own terms: a top-level `await` needs module scope, a top-level
    // `return` needs script/commonjs scope with `globalReturn`, and no sourceType grants
    // both at once (checked directly against espree — there is no parserOptions
    // combination that does). The harness resolves this by running the file's body as an
    // async function; test/execution-pipeline-harness.js mirrors that at runtime, and this processor
    // mirrors it at parse time only, so every other rule below still runs against the
    // real code, just shifted one function deeper (postprocess below un-shifts line
    // numbers by the one line the wrapper adds).
    files: ['workflows/**/*.js'],
    processor: {
      preprocess: (text) => [
        // `void meta` gives the neutralized binding a use, so the harness-mandated
        // export doesn't read as a dead local under this file's own lint pass.
        `(async () => {\n${text.replace(/^(\s*)export const meta\b(.*)$/m, '$1const meta$2 void meta;')}\n})();\n`,
      ],
      postprocess: (messagesList) => messagesList.flat().map((m) => ({
        ...m,
        line: m.line - 1,
        ...(m.endLine != null && { endLine: m.endLine - 1 }),
      })),
    },
    languageOptions: {
      globals: {
        agent: 'readonly', parallel: 'readonly', pipeline: 'readonly',
        log: 'readonly', args: 'readonly', budget: 'readonly',
      },
    },
    rules: {
      // The processor's wrapping makes the whole file look like one function's body to
      // this rule; the file's real budget is `max-lines` (350, from the shared block,
      // unchanged), and every genuine nested function below is still checked on its own.
      'max-lines-per-function': 'off',
      // The wrapper itself is an async IIFE by construction (see the processor above) —
      // this rule would ask us to "prefer" the very shape we can't parse without it.
      'unicorn/prefer-top-level-await': 'off',
    },
  },
]);
