# Friction mining — 2026-07-10

Sources: 12 Claude Code sessions in `~/.claude/projects/-Users-jatassi-Git-j45/`
(main transcripts + Agent-tool subagents + workflow agent transcripts/journals,
Jul 7–10 UTC), 31 grok executor sessions for j45 worktrees, and 93 grok executor
sessions for the-loop worktrees (rust-replatform era; eval fixtures excluded).
Nine parallel miners, findings deduplicated and verified against the code on
`main` (v0.4.10) before dispositioning.

Disposition key: **ALREADY FIXED** (verified in current code/docs) ·
**NOT OUR FAULT** (harness, environment, or project-specific — not the-loop's
design) · **FIX CANDIDATE** (open, actionable in the-loop).

---

## ALREADY FIXED (verified on main)

- **A1 · Bare agent-type names stalled runs at Plan.** Every regenerated
  pipeline script asked for `plan`/`build`/… while the plugin registers
  `the-loop:*`; hand-`sed`-patched twice in the walking-skeleton run.
  Fixed: `execution-pipeline.js:26-30` namespaces via `AGENT_NS`
  (`agentNamespace` overridable in the execution context).
- **A2 · Workflow args channel corrupted the execution context.** First
  `/begin` launch of the live-session run died in 5 ms on a JSON parse error.
  Fixed: `EMBEDDED_CONTEXT` spliced by `prepare-execution-context --script-out`
  (`execution-pipeline.js:13-18`); filed as fix-execution-context-args-transport.
- **A3 · Record agent blocked on bare `the-loop`.** Recurred three times in the
  live-session session (last at 02:39Z, where the record agent improvised a raw
  `git worktree add` — that run predates the v0.4.10 deploy). Fixed: the record
  spawn carries a `cli: ${CLI}` trailer (`execution-pipeline.js:552-556`) and
  the context carries the absolute CLI invocation. Filed as fix-record-prompt-cli.
- **A4 · Environment halt erased its feature from the run summary; drive
  `detail` said "see above".** Fixed (fix-environment-halt-accounting;
  drive.md:44-49 now demands self-contained `detail` and routes a cut-off
  executor to the retry lane). *Residual:* a whole-run wall-clock/turn
  termination still leaves an in-flight feature discoverable only via the
  journal — see F3b.
- **A5 · Drive preflight overreach.** Fixed in drive.md (prompt is the brief
  near-verbatim; no pre-handoff source reads). No recurrence observed.
- **A6 · Executors over-claiming green.** grok reported `npm run check` clean
  when it was red (binary-distribution), missed a criterion (role-agent-binding),
  swept a rename incompletely (operate-tooling). The drive bar caught all three
  and issued corrective re-drives — drive.md §3 ("the executor's word counts for
  nothing") working as designed. No change needed; F4 removes the biggest
  systematic cause (lint omitted from the brief's command list).

## NOT OUR FAULT

- **N1 · Cross-session Workflow resume starts cold.** `resumeFromRunId` only
  finds journals in the current session's directory; the walking-skeleton
  resume silently began re-running Plan until the human caught it and copied
  the prior session's `journal.jsonl` across. This is a Claude Code harness
  limitation (resume is documented same-session-only). Loop-side mitigation
  already exists (relaunch legs + clean-tree re-checks); optionally document
  the journal-copy trick in the begin skill's relaunch leg.
- **N2 · Builder flagged harness system-reminder blocks as prompt injection.**
  Ambient `<system-reminder>`/MCP text appended to a Read of design.md; the
  agent correctly ignored it but spent tokens on a security note. Harness
  behavior, not loop content. (Cheap pre-empt possible — one line in the agent
  prompts — but not loop-caused.)
- **N3 · `linear-server` MCP fails `auth_required` on 100% of grok executor
  sessions** (123/123 across both repos; zero tools loaded, no brief needed
  Linear). The executor's MCP config is project/user config, not the-loop.
  Recommend dropping linear-server from headless executor config or injecting
  an Authorization header.
- **N4 · No rustup/cross toolchains in the executor env** — cargo-dist's
  5-target matrix verified via `cargo dist plan` + host build instead of real
  cross-builds. Host toolchain gap (CI does the real matrix). Optionally phrase
  such criteria as "config produces the correct plan".
- **N5 · Bun's `.bun` store layout** cost reader/verifier agents 3–4 probe
  commands per package when checking pinned-library claims. Bun's hoisting,
  not the-loop; worth one line of guidance if F5's reader pass is codified.
- **N6 · Webkit e2e suite intermittently crashes the shared dev server**
  (exercise-library judge re-ran to separate flake from regression). j45
  product/test-infra bug.

## FIX CANDIDATES

Ranked by frequency × cost observed.

- **F1 · Worktree dependency provisioning (majors × 3 miners, ~20+ agents).**
  `worktree-create` symlinks only the root `node_modules`
  (`cli-commands.js:381-388`): dead when the target branch has no root install
  yet (all seven walking-skeleton builders paid a cold ~6-min `bun install`),
  useless for monorepo per-package nested `node_modules` (every build/validate/
  drive agent in the auth/liquid-glass/exercise-library runs lost its first
  `bun run check` or first commit to module-resolution failure, then diagnosed
  and ran `bun install` itself; one nearly lost the symlink to `git stash -u`).
  Side effects: the symlink shares one physical store across concurrent
  worktrees (a dependency add mutates siblings), and dir-only `.gitignore`
  rules don't match the symlink, so every committing agent re-reasons about not
  staging it.
  *Direction:* a configurable worktree-setup hook (configure's hook families
  fit) that runs the project's install command on create; or at minimum state
  "run the install command before first commit" once in every brief; ignore or
  materialize the symlink properly.
- **F2 · Plan slicing vs whole-project commit gates (major, 2 independent
  observations).** plan.md blesses "registration-shaped sharing … fine left
  unordered, the merge point resolves it" — but a repo whose pre-commit hook
  typechecks the whole project (j45) makes the intermediate commit impossible:
  exercise-library/domain-schema was told to merge `ExerciseRpcs` into
  `J45Rpcs` before the handler task existed; the agent refused `--no-verify`,
  the feature blocked, the human re-split the plan, and a full grok build
  session was discarded. Three backlog features would hit the same trap.
  *Direction:* plan.md landing constraint — every task's commit must pass the
  project's own commit gate standalone; a shared-hub edit that the gate
  validates against its implementation chains via `depends_on` to land with it;
  the earlier task's brief states the "leave unmerged" invariant explicitly.
- **F3 · Drive/executor lifecycle robustness (majors, dominant failure mode of
  the last two days).**
  - **a. Default 120s Bash timeout kills healthy executors.** 8 grok sessions
    across 6 the-loop tasks died at 101–115s mid-read and were relaunched cold
    with byte-identical briefs (corpus-context burned 3 attempts). drive.md's
    "generous timeout" is too vague — name a number (e.g. `timeout: 600000`)
    and default to background + single long wait for anything that compiles or
    runs suites.
  - **b. Drive turn ends while the executor is still writing.** The drive
    parked on its exit monitor, got cut by structured-output enforcement, and
    returned `blocked` while grok kept editing — a complete 263-line diff sat
    uncommitted and the run needed a human relaunch (the fresh drive did adopt
    the worktree). Make adoption explicit: on relaunch, a drive that finds an
    intact worktree with a finished executor verifies and commits instead of
    rebuilding; bound the wait so the drive returns a retryable state before
    enforcement cuts it.
  - **c. Transient executor API 5xx → `agent returned null` stall, no retry.**
    One grok "Server error mid-response" stalled the whole live-session run;
    the real cause lived only in run logs. `spawn()` already carries
    `error.message` for thrown errors (`execution-pipeline.js:132`), but the
    null path (line 137) stays uninformative and unretried. Retry the spawn
    once on null/transient errors; enrich the note.
  - **d. Drive relaunches quiet-but-working executors.** Byte-identical briefs
    re-sent 2 min apart (exercises-repo-migration) and duplicate judges started
    7 s apart (integrate--exercise-library) — quiet exploration or a
    backgrounded suite misread as a hang. Add a "confirm actually stalled
    (check process/output file) before relaunching" step.
- **F4 · Brief's verification block must enumerate the full build bar (major,
  ≥3 re-drive rounds).** Drive-composed briefs listed `bun run check/test/
  test:e2e` but omitted `bun run lint`; executors declared done, the drive's
  own bar failed, and a retry round followed — every e2e-flavored task hit it.
  drive.md should require the brief's "verification — run all of these"
  code-block to be exactly the build-bar command list (tests, lint, typecheck/
  format), ordered, exit-0. Corollary papercuts to fold in: a footprint-scoped
  format command (repo-wide `bun run format` exits 2 on unrelated files; bare
  `prettier` isn't on PATH), and a note that long suites will be auto-
  backgrounded — poll the output file, don't relaunch.
- **F5 · Codify the design-phase fresh-context reader/buildability pass
  (major).** The human had to improvise it at the commit gate (design skill
  only *suggests* it, SKILL.md:92) and four cold readers caught 11 real defects
  the phase would have shipped: an AC not testable inside its feature's
  dependency closure, seed data that can't honestly satisfy pinned literals, a
  snippet violating the repo's lint rule, retry-semantics ambiguity. Two more
  escapes from the same phase surfaced downstream at high cost: a cross-feature
  contradiction ("auth/glass suites pass **unchanged**" while a sibling feature
  moves the authed home route) that blocked the final task of a 123-min run and
  forced a mid-run design+plan amendment; and a missing `/register` post-auth
  route found only by the last task's browser e2e. Make the reader pass a
  required standard-path step with explicit checks: every AC testable within
  the feature's dependency closure; cross-feature AC consistency ("X passes
  unchanged" is a red flag when a sibling changes X's preconditions); route/nav
  completeness; platform-API reality (an AC mandating
  `HTMLCanvasElement.getContext` instrumentation was physically unsatisfiable —
  the API only exists on `OffscreenCanvas`); named invariants that must
  *survive* a removal-shaped change (the `--radius` token deletion that zeroed
  every corner radius app-wide).
- **F6 · Plan-contract completeness for parallel slices (medium).** Three
  recurring shapes: (1) unpinned wire contracts — client and server tasks each
  mocked the other from guesses (`{user}` envelope vs bare `User`; missing rpc
  error unions), consistent-with-themselves until real e2e; pin exact envelopes
  and error unions as shared facts in the contracts. (2) No task owns a spec
  the feature invalidates — the walking-skeleton `server-info.spec.ts` broke
  when auth replaced the app root, builders correctly refused (out of
  footprint), and the known regression rode to Validate and blocked the
  feature; when a feature supersedes a surface, some task's footprint must own
  reconciling its specs (plan-library repeated this: the gate task's lease
  excluded the five specs it was told to keep green). (3) Declare shared wiring
  files (`server.ts`-style registration hubs) as expected conflict hotspots or
  give them a per-feature registration seam — they conflicted on essentially
  every assembly. Also: build.md could say a criterion's test must exercise the
  criterion's observable behavior *as stated* (the `bun run dev` test asserted
  :5173 but never :3000/healthz, so Build went green while the AC was unmet —
  a full pipeline pass wasted).
- **F7 · Acceptance criteria an executor cannot exercise (medium).** "In a
  live session against the installed plugin, /begin renders…" fail-closed a
  grok judge (`claude -p` → "Not logged in"; no installed-plugin session), one
  wasted validate round, reversed on re-drive. Design/plan should mark such
  criteria validator-deferrable to the release health check (or phrase them
  against a drivable probe).
- **F8 · `worktree-remove` from inside the target worktree (minor).**
  `cli-commands.js:393-398` has no cwd guard; it deleted the shell's cwd and
  the chained `prepare-execution-context` failed on `git worktree prune`
  ("Unable to read current working directory"). Refuse when cwd is under the
  target, or chdir to the repo root first.
- **F9 · Stale `integrate--*` branches on re-runs (minor).** Fail path
  deliberately preserves integration branches; the re-run's validators each
  had to *discover* the leftover branch was based on stale main and reset it
  (`worktree-create` happily reuses an existing branch). Make it a documented
  validate step: treat any pre-existing `integrate--<feature>` as untrusted and
  rebuild from the target tip.
- **F10 · Validator-made repairs stranded on FAIL (minor).** The
  walking-skeleton validator fixed a real lockfile/peer-dep break, then failed
  the feature — the fix lived only on the unmerged integration branch and the
  human carried it forward by hand. Current validate.md is judge-shaped but
  doesn't say it: add "make no fixes; a repair you needed becomes a finding
  (with the diff) for the next pass."
- **F11 · Papercuts.**
  - `/begin` re-runs `the-loop status` (and full graph reads) although the
    orientation JSON is already embedded — say "the embedded orientation *is*
    the status output; don't re-run it."
  - Design-route wording doesn't cover "explicit design jump while an eligible
    set exists" — the agent detoured through orient/propose and the user
    interrupted; let an explicit jump route directly.
  - `hooks-list` output needs two paged reads to see model bindings *and*
    artifact stores — add a compact mode or put orientation-critical bindings
    first.
  - Missing `## Validation procedure` in architecture.md only warns at prepare
    time; onboard/configure should scaffold the section, and validate verdicts
    should state when they ran without one (validatePrompt already says "skip
    the runtime leg and say so").
  - Small-path features carry no `judgment_level` → silent `build.standard`
    routing; have plan set it explicitly (the fallback logs, but only in run
    logs).
  - No-suppression lint policy vs confirmed upstream false positives
    (`unicorn/throw-new-error` on Effect's `Schema.TaggedError`) forced an
    obfuscating alias workaround — define a narrow, justified escape hatch
    (rule-scoped config exception, not inline disable).
  - Probe/verify wrappers used GNU `timeout` (absent on macOS; silently
    no-op'd) — portable timeout guidance in the probe conventions.

---

Counts: 9 miners · ~12 Claude sessions, ~45 loop subagent/workflow transcripts,
124 grok sessions swept (34 deep-read) · 38 raw findings → 6 already fixed,
6 not-our-fault, 11 fix candidates (4 major clusters, 3 medium, 3 minor,
1 papercut bundle) · excluded as previously addressed: all 7 baseline items,
none recurring post-fix.
