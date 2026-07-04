# Plan — ship

Ship is human-gated control policy with a small mechanical spine underneath it: a
skill (`skills/ship/SKILL.md`) that assembles evidence and holds the gate, and three
`spine ship` subcommands that make the parts a crash must never smear — the corridor
and the bookings — deterministic and testable. The decomposition builds the pure
cores first (record model, corridor state machine), wires them into the CLI edge
next, and lands the skill last so it narrates over commands that already exist.

## Pinned interpretation — the corridor is one mechanical command

The design requires the corridor to run "without further prompts", to never take "a
second autonomous swing at prod", and to be tested against "a scripted fixture
deploy target with injectable outcomes — the real plugin CLI never enters the
suite". All three properties are enforced by construction when the corridor is a
single CLI invocation rather than skill prose: `spine ship corridor` takes the
binding's `{deploy, rollback, smoke}` command strings, drives a pure decision core
(`src/corridor.js`) that has no retry transitions at all, and prints the concluded
outcome as JSON. The skill's post-gate autonomy re-grant is exactly one invocation
of this command; the evidence legs stay session-inline per the design. `spine ship
book` (named by the design) is the other mechanical half: all commit-2 file
mutations in one guarded command, so flips and Ledger can never land on a
non-deployed outcome by hand-editing mistake.

## Pinned formats and shapes (contract-level, shared across tasks)

- **Record layout** — `docs/ships/ship-<N>.md` is narrative plus one fenced `yaml`
  block under the exact heading `## Ship record`, fields per the `ship-record`
  contract. `src/ship.js` locates the block by that heading (the existing
  `yamlBlockAfter`/`render` machinery pattern) so parse → mutate → render preserves
  every narrative byte.
- **CLI surface** — `spine ship status` (healing + pin helper: count, next N,
  previous ship_sha, latest record summary with `interrupted` = approval present
  and outcome absent); `spine ship corridor [corridor.json|-]` (input
  `{deploy, rollback, smoke?}`, output `{outcome, rollback_verified?,
  health_signal, steps}`, exit 0 on any concluded outcome, exit 1 only on invalid
  input); `spine ship book <N> [outcome.json|-]` (input `{outcome,
  rollback_verified?}`, extra fields ignored so corridor output pipes straight in).
- **Corridor step names** — `deploy`, `smoke`, `rollback`, `smoke-verify`. After
  *any* rollback (smoke-fail path or deploy-fail path), when a smoke suite exists,
  one `smoke-verify` run sets `rollback_verified` — the design names the re-run on
  the smoke-fail path and leaves an unverified restoration after deploy-fail the
  same blind spot, so verification follows every rollback. No smoke suite means
  `health_signal` false, no rollback on a successful deploy (nothing can trigger
  it), and no `rollback_verified` ever.
- **Ledger ship line** — `appendShip` in `src/ledger.js`, bullet format
  `- <date> | ship-<N> | <outcome> | features: <comma-joined ids>` plus
  ` | rollback_verified: <true|false>` exactly when defined; inserted newest-first
  under `## Run history` like `appendRun`.
- **Booking choreography (skill-side)** — commit 1 `ship-<N>: book evidence +
  approval` (record without outcome + plugin.json version set to `0.<N>.0`), lands
  before any prod-touching command; commit 2 `ship-<N>: book <outcome>` (exactly
  the files `spine ship book` wrote); tag `loop/ship/<N>` last, deployed only.
- **Book guard-then-write** — every guard runs before the first write; a refusal
  exits 1 with all three artifacts (record, design.md, ledger.md) byte-unchanged.
  On `deployed`, the Ledger is re-rendered from the flipped graph first, then the
  ship bullet is inserted into the rendered text.

## Wiring story

t1 (record core) and t2 (corridor core) are pure and parallel. t3 (`ship status`)
puts the record core on the CLI; t4 (`appendShip`) is the Ledger primitive; t5
(`ship book`) composes t1+t4 behind guards; t6 (`ship corridor`) puts t2 on the CLI
with the fixture deploy target the design demands for corridor tests. t7 is the
static marketplace manifest the recorded deploy binding consumes. t8 and t9 author
the skill over the finished CLI surface (t8: entry gates, healing scan, evidence
package, red-blocks-hard, approval + freshness; t9: corridor invocation, the two
bookings, failure posture, tag). t10 routes the front door's ship proposal and jump
to the skill by name. `bin/spine.js` is shared by t3 → t5 → t6, chained;
`skills/ship/SKILL.md` is shared by t8 → t9, chained. No task needs `m`.

## Tasks

```yaml
feature: ship
design_version: 7
tasks:
  - id: t1
    title: Ship-record core — parse, apply-outcome, interrupted and record-set helpers (src/ship.js)
    status: built
    covers: [2, 4]
    acceptance:
      - "src/ship.js exports parseShipRecord(text) returning a model with the ship-record contract's fields (ship, ship_sha, design_version, features, evidence, approval, and outcome / rollback_verified when present) read from the first fenced yaml block under the exact heading `## Ship record`, retaining the yaml Document and span in model._blocks so src/render.js round-trips — render(text, parseShipRecord(text)) equals text byte-for-byte, proven by a test whose record fixture carries narrative prose above and below the block"
      - "an exported applyOutcome(model, {outcome, rollback_verified}) mutates both the JS model and the retained document so render persists exactly the new outcome (and rollback_verified only when given); it throws with the model untouched on an outcome outside deployed|rolled-back|deploy-failed or when the record already carries an outcome — each refusal proven by a test"
      - "an exported helper returns true exactly when a record carries approval and no outcome (interrupted mid-corridor) and false for both other shapes (no approval; outcome present) — proven by tests over all three"
      - "an exported record-set helper, given an array of parsed records in any order, returns the count, the highest-N record as latest (null when none), next = highest N + 1 (1 when none), and previous_ship_sha = the latest record's ship_sha (null when none) — proven by tests for zero, one, and several unordered records"
      - "src/ship.js imports no node:fs or node:child_process (pure over in-memory models); npm test and npm run check pass"
    injects: [ship-record]
    standards: [docs/standards/pure-core-thin-cli.md, docs/standards/derived-and-hybrid-artifacts.md]
    footprint: [src/ship.js, test/ship.test.js]
    size: s
    tier: standard
    depends_on: []
    report:
      result: built
      footprint_actual:
        - src/ship.js
        - test/ship.test.js
      diff_actual:
        files: 2
        insertions: 226
        deletions: 0
      deviations: []
      summary: "src/ship.js now exports the ship-record core: parseShipRecord(text) locates the first fenced yaml block under the exact heading '## Ship record' via the existing yamlBlockAfter helper, normalizes the contract's fields (ship, ship_sha, design_version, features, evidence, approval, outcome/rollback_verified when present), and retains the yaml Document + span in model._blocks so render(text, parseShipRecord(text)) is byte-identical, proven against a fixture carrying narrative prose above and below the block. applyOutcome(model, {outcome, rollback_verified}) mutates both the JS model and the retained document (doc.setIn) so render persists exactly the new outcome, with rollback_verified only written when supplied; it throws with the model untouched for an outcome outside deployed|rolled-back|deploy-failed and for a record that already carries an outcome, each proven by its own test. isInterrupted(record) returns true exactly when a record carries approval and no outcome, false when approval is absent and when an outcome is already present, proven over all three shapes. summarizeShips(records) returns {count, latest, next, previous_ship_sha} from an array of parsed records in any order, proven for zero, one, and several unordered records. The module imports only 'yaml' and the local blocks.js helper (no node:fs/node:child_process); npm test (164 passing, including the 9 new ship.js tests) and npm run check (25 features, 12 contracts, 0 errors/warnings) both pass."

  - id: t2
    title: Corridor decision core — retry-free state machine (src/corridor.js)
    status: built
    covers: [2]
    acceptance:
      - "src/corridor.js exports a pure API (no node:fs, node:child_process, or shell use) the bin edge can drive one step at a time: given the binding {deploy, rollback, smoke?} and the results so far, it yields either the next step to execute — one of the pinned step names deploy | smoke | rollback | smoke-verify, each carrying its command string — or a conclusion {outcome, rollback_verified?, health_signal}; proven by unit tests that drive it with injected pass/fail results and never execute real commands"
      - "transition table, one test each: deploy ok + smoke ok concludes deployed; deploy ok + smoke fail yields rollback then smoke-verify; smoke-verify ok concludes rolled-back with rollback_verified true; smoke-verify fail concludes rolled-back with rollback_verified false; deploy fail yields rollback (still invoked) then smoke-verify when a smoke command exists, concluding deploy-failed with rollback_verified from that verify"
      - "no-smoke degradation: with smoke absent, deploy ok concludes deployed with health_signal false and no rollback step is ever yielded; deploy fail yields rollback then concludes deploy-failed with no rollback_verified field"
      - "no retry transitions exist: a test enumerating every pass/fail combination of the four steps asserts each step name is yielded at most once per corridor run, in every sequence"
      - "npm test and npm run check pass"
    injects: [ship-record]
    standards: [docs/standards/pure-core-thin-cli.md]
    footprint: [src/corridor.js, test/corridor.test.js]
    size: s
    tier: standard
    depends_on: []
    report:
      result: built
      footprint_actual:
        - src/corridor.js
        - test/corridor.test.js
      diff_actual:
        files: 2
        insertions: 189
        deletions: 0
      deviations: []
      summary: "src/corridor.js exports nextCorridorStep(binding, results), a pure retry-free state machine driven one step at a time: given the deploy-target binding {deploy, rollback, smoke?} and the ordered {step, ok} results observed so far, it returns either the next step to run — one of the pinned names deploy | smoke | rollback | smoke-verify, each carrying its command string from the binding — or a conclusion {outcome, rollback_verified?, health_signal}. Every named transition is covered one test each: deploy ok + smoke ok concludes deployed; deploy ok + smoke fail yields rollback then smoke-verify, with smoke-verify ok/fail each concluding rolled-back with rollback_verified true/false; deploy fail yields rollback (still invoked) then smoke-verify when a smoke command exists, concluding deploy-failed with rollback_verified taken from that verify. The no-smoke degradation is covered by two tests: deploy ok with no smoke command concludes deployed with health_signal false and never yields a rollback step; deploy fail with no smoke command yields rollback then concludes deploy-failed with no rollback_verified field at all (asserted via 'in'). A ninth test enumerates all 16 pass/fail combinations of the four steps, driving the corridor to conclusion for each and asserting no step name repeats — proving there are no retry transitions; I confirmed this test's teeth by temporarily renaming the smoke-verify step's name to 'smoke' and watching it fail before reverting. The module imports nothing from node:fs, node:child_process, or any shell mechanism — it only shuffles strings and booleans. npm test (173 passing, including the 9 new corridor tests) and npm run check (25 features, 12 contracts, 0 errors/warnings on my footprint) both pass; a pre-existing eslint max-lines violation in .claude/worktrees/executor-delegation/bin/spine.js (a separate, untracked git worktree outside this repo's tracked files and outside my footprint) is unaffected by this change."

  - id: t3
    title: spine ship status — healing and pin helper on the CLI edge
    status: built
    covers: [4]
    acceptance:
      - "node bin/spine.js ship status prints JSON {ships, next, previous_ship_sha, latest}: ships counts docs/ships/ship-*.md records, next is highest N + 1 (1 when the directory is absent or empty), previous_ship_sha is the highest-N record's ship_sha (null when none), latest is null or {ship, ship_sha, outcome (null when absent), interrupted} with interrupted true exactly when the record carries approval and no outcome — proven by subprocess CLI tests (test/spine-cli.test.js conventions: throwaway fixture dirs, execFileSync) covering no ships directory, a concluded latest record, an approved-no-outcome latest record (interrupted true), and an unapproved record (interrupted false)"
      - "bin/spine.js gains the ship subcommand in its dispatch and usage line; filesystem reads stay at the bin edge and all parsing/decisions come from src/ship.js; a record file with no `## Ship record` yaml block exits 1 naming the file"
      - "npm test and npm run check pass"
    injects: [ship-record]
    standards: [docs/standards/pure-core-thin-cli.md]
    footprint: [bin/spine.js, test/ship-cli.test.js]
    size: s
    tier: standard
    depends_on: [t1]
    report:
      result: built
      footprint_actual:
        - bin/spine.js
        - bin/ship.js
        - test/ship-cli.test.js
      diff_actual:
        files: 3
        insertions: 219
        deletions: 14
      deviations:
        - bin/spine.js sat at 349 of its 350-line eslint max-lines budget before this task (a recurring planning signal already flagged in docs/plans/surfacing.md for this shared file); the 'ship status' logic (fs reads over docs/ships/, plus the decisions from src/ship.js) was split into a new file, bin/ship.js, so bin/spine.js's own addition is just the dispatch case + import (still 'the bin edge' per the pure-core-thin-cli standard, just a second file within bin/). This is an undeclared footprint excursion beyond the task's [bin/spine.js, test/ship-cli.test.js] lease; it was the smallest change that let the subcommand land without a lint-suppression.
        - to make room for even that minimal addition (net +2 lines), modelsCommand's single-call-site readDefaults() helper was inlined back into modelsCommand (mechanical, behavior-preserving merge saving the two wrapper lines; complexity rose from 2 to 4, still well under the max-10 budget) — verified against the full existing 'models' test suite, all passing unchanged.
        - "bin/spine.js's new 'ship' case is written on one physical line (case 'ship': { shipCommand(rest); break; }) rather than the file's usual 4-line brace form every other case uses, a deliberate, disclosed style deviation to stay inside the line budget rather than touch any more pre-existing code."
      summary: "bin/spine.js gains a 'ship' case in its dispatch switch and a 'ship status' entry in its usage line, delegating to a new bin/ship.js (fs reads stay at this bin edge; all parsing/decisions — parseShipRecord, summarizeShips, isInterrupted — come from src/ship.js, per the pure-core-thin-cli standard). `node bin/spine.js ship status` reads every docs/ships/ship-<N>.md file, parses each via parseShipRecord, and exits 1 naming the file when a record carries no \"## Ship record\" block. It prints {ships, next, previous_ship_sha, latest}: ships is summarizeShips' count, next and previous_ship_sha come straight from summarizeShips, and latest is null or a projection {ship, ship_sha, outcome (null when absent), interrupted} with interrupted computed by isInterrupted(latest). Six subprocess CLI tests in test/ship-cli.test.js (fixture-dir + execFileSync, watched red before the implementation landed and green after) cover: no docs/ships directory (ships 0, next 1, previous_ship_sha null, latest null); two records with the highest-N one concluded (ships/next/previous_ship_sha/latest all correct, outcome present, interrupted false); a single approved-no-outcome record (interrupted true, outcome null); a single record with neither approval nor outcome (interrupted false, outcome null); a malformed record with no \"## Ship record\" block (exit 1, stderr names the file); and the usage string naming 'ship status'. Full suite (179 tests, up from 173) and npm run check (design check + repo-wide eslint) both pass with zero errors or warnings."

  - id: t4
    title: appendShip — the Ledger's ship history line (src/ledger.js)
    status: built
    covers: [2]
    acceptance:
      - "src/ledger.js exports appendShip(priorText, entry) inserting exactly one bullet as the first content under the `## Run history` heading (same insertion semantics as the existing appendRun; it throws with priorText unmodified when the heading is absent) — bullet format pinned as `- <date> | ship-<N> | <outcome> | features: <comma-joined ids>`, with ` | rollback_verified: <true|false>` appended exactly when entry.rollback_verified is defined; missing date, ship number, or outcome throws — proven by unit tests including a Ledger whose Run history already holds bullets (the new bullet lands first and every other byte is unchanged)"
      - "appendShip is pure: the date arrives as an argument and the function reads no clock or filesystem; npm test and npm run check pass"
    injects: []
    standards: [docs/standards/pure-core-thin-cli.md]
    footprint: [src/ledger.js, test/ledger.test.js]
    size: xs
    tier: rote
    depends_on: []
    report:
      result: built
      footprint_actual:
        - src/ledger.js
        - test/ledger.test.js
      diff_actual:
        files: 2
        insertions: 74
        deletions: 1
      deviations: []
      summary: "src/ledger.js now exports appendShip(priorText, entry), mirroring appendRun's insertion semantics: it inserts exactly one bullet as the first content after the \"## Run history\" heading, throwing with priorText untouched when the heading is absent. The bullet is pinned as `- <date> | ship-<N> | <outcome> | features: <comma-joined ids>` with ` | rollback_verified: <true|false>` appended exactly when entry.rollback_verified is defined (checked via `!== undefined` so an explicit `false` still renders, proven by a dedicated assertion), and it throws when date, ship, or outcome is missing. Three new tests in test/ledger.test.js prove this: one drives a Ledger whose Run history already holds a bullet through both a deployed booking (features joined, no rollback_verified field) and a rolled-back booking (rollback_verified: false present) and asserts the new bullet lands first with every other byte unchanged; one asserts throws for each of date/ship/outcome missing; one asserts throws (and priorText left untouched) when the heading is absent. appendShip is pure by construction — the date arrives as entry.date and the function touches no clock or filesystem, matching the pure-core-thin-cli standard already governing the rest of src/ledger.js. Full suite (182 tests, up from 179) and npm run check (25 features, 12 contracts, 0 errors/warnings) both pass; scoped eslint on src/ledger.js and test/ledger.test.js is clean."

  - id: t5
    title: spine ship book — guarded commit-2 mechanics (record outcome, flips, Ledger)
    status: built
    covers: [2]
    acceptance:
      - "node bin/spine.js ship book <N> [outcome.json|-] reads {outcome, rollback_verified?} JSON (file, dash, or omitted arg = stdin; unknown extra fields ignored so ship corridor output pipes in unchanged) and writes commit-2 file state: the outcome lands in docs/ships/ship-<N>.md via parse, applyOutcome, render (narrative bytes outside the block untouched); on deployed it additionally flips every feature listed in the record from validated to shipped in docs/design/design.md and re-renders docs/ledger/ledger.md from the flipped graph; on every outcome it inserts one appendShip bullet (date = today UTC, supplied at the bin edge) as the newest Run-history line — proven by subprocess CLI tests on fixtures carrying a design.md with validated features and a Ledger with a Run history section, for a deployed booking (record + flips + render + bullet), a rolled-back booking with rollback_verified false (record + bullet, statuses untouched), and a deploy-failed booking"
      - "every guard runs before the first write and each refusal exits 1 with docs/ships/ship-<N>.md, docs/design/design.md, and docs/ledger/ledger.md all byte-unchanged: no record for N; a record without approval; a record already carrying an outcome; an outcome outside deployed|rolled-back|deploy-failed; a deployed booking where any listed feature is unknown to the graph or not currently validated — each proven by a CLI test asserting the three files' bytes after the failure"
      - "the command never runs git and prints the updated record's structured block as JSON; npm test and npm run check pass"
    injects: [ship-record]
    standards: [docs/standards/pure-core-thin-cli.md, docs/standards/derived-and-hybrid-artifacts.md]
    footprint: [bin/spine.js, test/ship-cli.test.js]
    size: s
    tier: standard
    depends_on: [t1, t3, t4]
    report:
      result: built
      footprint_actual:
        - bin/ship.js
        - test/ship-cli.test.js
      diff_actual:
        files: 2
        insertions: 344
        deletions: 9
      deviations:
        - "Footprint excursion: the task's declared footprint was [bin/spine.js, test/ship-cli.test.js], but bin/spine.js was untouched (t3 already wired its 'ship' dispatch case to shipCommand(rest), so no change to it was needed for 'book') and bin/ship.js was touched instead (undeclared) to hold the new command's logic — bin/spine.js sits exactly at its 350-line eslint max-lines ceiling (confirmed before starting: 350/350 significant lines), the same recurring planning signal t3's own completion report already flagged, so any code addition there was infeasible without removing an equal number of existing lines. bin/ship.js already exists (t3's own analogous excursion) and is the natural extension point."
        - The task footprint declared test/ship-cli.test.js only; that file itself grew to 359 significant lines against the same 350-line ceiling (applies file-wide, including test/**). Rather than split ship-book tests into a new file, the five guard tests were refactored to share two small helpers (snapshot/assertUnchanged) that assert byte-unchanged files, bringing the file back under budget without moving any test out of its declared file.
      summary: "bin/ship.js gains a 'book' branch in shipCommand's dispatch: `node bin/spine.js ship book <N> [outcome.json|-]` reads the ship-<N>.md record and an {outcome, rollback_verified?} JSON (file, '-', or stdin; unknown extra fields like a corridor's health_signal/steps are simply never destructured), and writes commit-2 file state. Every guard runs before any write — no record for N, a record without approval, a record already carrying an outcome, an outcome outside deployed|rolled-back|deploy-failed, and (deployed only) any listed feature unknown to the graph or not currently validated — each refusal exits 1 via the existing fail() helper (or a thrown Error from src/ship.js's applyOutcome, caught by bin/spine.js's top-level catch) with docs/ships/ship-<N>.md, docs/design/design.md, and docs/ledger/ledger.md all byte-unchanged, proven by five CLI tests snapshotting all three files before and asserting them unchanged after. On success, the outcome lands in the record via parseShipRecord -> applyOutcome -> render (narrative bytes outside the '## Ship record' block untouched); on 'deployed' it additionally flips every listed feature from validated to shipped in design.md via setStatus and re-renders docs/ledger/ledger.md from the flipped graph via renderLedger; every outcome (deployed, rolled-back, deploy-failed alike) inserts exactly one appendShip bullet as the newest Run-history line, with today's UTC date computed at the bin edge and rollback_verified included only when the input supplied it. Three CLI tests prove the three outcome legs on fixtures carrying a validated-features design.md and a Run-history Ledger: deployed (record + both feature flips + Ledger re-render, including the sibling 'gamma' feature's status: building left untouched, + bullet + the printed JSON record), rolled-back with rollback_verified: false (record + bullet, design.md byte-identical), and deploy-failed (record + bullet with no rollback_verified field). The command imports no node:child_process and calls no git anywhere. Full suite (190 tests, up from 182) and npm run check (25 features, 12 contracts, 0 errors/warnings; eslint clean including test/ship-cli.test.js's now-359-then-recompacted line count) both pass."

  - id: t6
    title: spine ship corridor + the scripted fixture deploy target
    status: built
    covers: [2]
    acceptance:
      - "node bin/spine.js ship corridor [corridor.json|-] reads {deploy, rollback, smoke?} shell-command strings (file, dash, or omitted arg = stdin), executes the corridor at the bin edge by driving src/corridor.js one yielded step at a time (exit 0 = step ok), and prints JSON {outcome, rollback_verified?, health_signal, steps: [{step, command, ok}]} matching the core's conclusion; it exits 0 whenever an outcome concluded (deployed, rolled-back, and deploy-failed alike) and exits 1 running nothing when deploy or rollback is missing from the input"
      - "test/fixtures/deploy-target.js is a scripted fixture deploy target with injectable outcomes: tests control each step's pass/fail (env var or control file), every invocation appends its step name to a journal file so order is assertable, and neither the fixture nor any corridor CLI test invokes any claude command — the real plugin CLI never enters the suite"
      - "subprocess CLI tests prove, with journal order asserted each time: all green concludes deployed (journal deploy, smoke); smoke fail + rollback ok + verify ok concludes rolled-back with rollback_verified true (journal deploy, smoke, rollback, smoke); smoke fail + rollback + verify fail concludes rolled-back with rollback_verified false present in the JSON; deploy fail shows rollback still invoked and concludes deploy-failed; input without smoke concludes deployed with health_signal false (journal deploy only); in every case deploy and rollback each appear at most once in the journal"
      - "npm test and npm run check pass"
    injects: [ship-record]
    standards: [docs/standards/pure-core-thin-cli.md]
    footprint: [bin/spine.js, test/fixtures/deploy-target.js, test/corridor-cli.test.js]
    size: s
    tier: standard
    depends_on: [t2, t5]
    report:
      result: built
      footprint_actual:
        - bin/ship.js
        - test/corridor-cli.test.js
        - test/fixtures/deploy-target.js
      diff_actual:
        files: 3
        insertions: 214
        deletions: 1
      deviations:
        - "Footprint excursion: the task's declared footprint was [bin/spine.js, test/fixtures/deploy-target.js, test/corridor-cli.test.js], but bin/spine.js was untouched (its 'ship' case already delegates every subcommand to shipCommand(rest), unchanged since t3) and bin/ship.js was touched instead (undeclared) to hold the new 'corridor' branch's logic — bin/spine.js sits exactly at its 350-line eslint max-lines ceiling, the same recurring planning signal t3's and t5's own completion reports already flagged, so any code addition there was infeasible without removing an equal number of existing lines. bin/ship.js (t3's own analogous excursion) is the natural extension point and had ample room."
        - "test/fixtures/deploy-target.js could not use process.exit() (unicorn/no-process-exit and n/no-process-exit fire on any .js file outside bin/**, and this fixture lives under test/): it sets process.exitCode instead, structured so no code runs after the assignment — behaviorally identical (0 = step ok, 1 = fail) but a deviation from the most obvious first draft, worth naming since it's a pattern not yet used elsewhere in the fixture-script family (bin/probe-fixture.js is itself under bin/, where process.exit is the sanctioned idiom)."
      summary: "bin/ship.js gains a 'corridor' branch in shipCommand's dispatch: `node bin/spine.js ship corridor [corridor.json|-]` reads a {deploy, rollback, smoke?} JSON (file, '-', or stdin), guards that deploy and rollback are both present before running anything (exit 1, nothing executed, otherwise), then drives src/corridor.js's nextCorridorStep one yielded step at a time — running each step's shell command via execSync (stdio ignored; a zero exit is 'ok', any other exit or a throw is not) and feeding the {step, ok} result back in — until the core returns a conclusion, at which point it prints {outcome, rollback_verified?, health_signal, steps: [{step, command, ok}]} and exits 0 (the process's natural exit code) on every concluded outcome alike. test/fixtures/deploy-target.js is the scripted deploy-target fixture the corridor's shell-command strings all point to: every invocation appends its step name (argv[2]) to JOURNAL_FILE (env var) before resolving its own pass/fail from CONTROL_FILE (env var, optional JSON keyed by step name — a bare boolean covers every invocation of that step, an array is indexed by invocation count so smoke's two runs, pre-rollback check and post-rollback verify, can be told apart and made to disagree); no CONTROL_FILE, or a step missing from it, defaults to ok. Because node --test sweeps every .js file under test/ recursively (verified directly: an experimental canary file placed at test/fixtures/ was picked up and its exit code counted as a test result), the fixture's no-argv case is a deliberate no-op (mirrors test/workflow-shim.js's own 'bare discovery is a no-op pass' shape) rather than a usage error, so it never breaks npm test on its own. Neither the fixture nor the corridor CLI test invokes any claude command anywhere. Six subprocess CLI tests in test/corridor-cli.test.js (execFileSync against bin/spine.js, journal + control-file fixtures torn down per test) prove, with journal order asserted via deepEqual every time: all green concludes deployed (journal [deploy, smoke]); smoke fail + rollback ok + verify ok concludes rolled-back with rollback_verified true (journal [deploy, smoke, rollback, smoke]); smoke fail + rollback ok + verify fail concludes rolled-back with rollback_verified false present in the JSON (same journal shape); deploy fail (no smoke in the binding) shows rollback still invoked and concludes deploy-failed (journal [deploy, rollback]); a binding without smoke concludes deployed with health_signal false (journal [deploy] only); and a binding missing deploy or rollback exits 1 with the journal left empty (nothing run). Each deepEqual against the exact expected journal array proves deploy and rollback appear at most once. I confirmed the tests' teeth by temporarily forcing rollback_verified to true unconditionally in bin/ship.js's output and watching the verify-fail test go red before reverting. Full suite (197 tests, up from 190 — 6 new CLI tests plus the fixture's own bare-sweep pass entry) and npm run check (25 features, 12 contracts, 0 errors/warnings; eslint scoped to bin/ship.js, test/corridor-cli.test.js, and test/fixtures/deploy-target.js is clean) both pass."

  - id: t7
    title: Marketplace manifest — the static marketplace-on-main seed
    status: built
    covers: [2]
    acceptance:
      - "the file .claude-plugin/marketplace.json exists, parses as JSON, and declares this repo as a single-plugin marketplace: an owner block plus a plugins array with exactly one entry whose name matches .claude-plugin/plugin.json's name (the-loop) and whose source is the string ./ — the static, written-once manifest the recorded marketplace-on-main deploy binding in docs/ports/ports.md consumes; no other file changes"
    injects: []
    standards: []
    footprint: [.claude-plugin/marketplace.json]
    size: xs
    tier: standard
    depends_on: []
    report:
      result: built
      footprint_actual:
        - .claude-plugin/marketplace.json
      diff_actual:
        files: 1
        insertions: 13
        deletions: 0
      deviations: []
      summary: "Added .claude-plugin/marketplace.json declaring this repo as a single-plugin marketplace: a top-level name (\"the-loop\"), an owner block ({name: \"Jackson Atassi\", email: \"jackson.atassi@outlook.com\"}), and a plugins array with exactly one entry ({name: \"the-loop\", source: \"./\"}) whose name matches .claude-plugin/plugin.json's name and whose source is the literal string './' — the static, written-once manifest the marketplace-on-main deploy binding (docs/ports/ports.md) consumes. Verified the file parses as JSON and the owner/plugins shape via a scripted assertion (not committed, per the criterion's 'no other file changes'); npm test (197/197) and npm run check both pass clean, confirming no regression."

  - id: t8
    title: Ship skill, first half — entry gates, healing scan, evidence package, approval + freshness
    status: built
    covers: [1, 3, 4]
    acceptance:
      - "skills/ship/SKILL.md exists with frontmatter (name: ship; a description naming its triggers: the front door's ship proposal and the /the-loop ship jump) and is self-contained per the loop-surfaces standard — no ADR or internal-doc references and no session context assumed; paths to the repo artifacts it operates on (docs/ships/, docs/probes/, docs/ports/ports.md, docs/validations/, docs/design/design.md) and spine invocations in the plugin-root form (node \"$CLAUDE_PLUGIN_ROOT/bin/spine.js\" ship …) are the only external references"
      - "the entry protocol runs in pinned order, each step an explicit stop rule: (1) healing scan — run ship status first, and when the latest record is interrupted (approval, no outcome) stop before any assembly, present it as interrupted-mid-corridor with verify-prod-by-hand instructions, and state the corridor is never auto-resumed; (2) clean-tree gate on the integration target; (3) frontier gate — every feature with status validated ships together, whole-frontier only, and an empty validated set means nothing to ship, stop"
      - "evidence assembly is pinned to ship_sha = the target tip at assembly, with N and previous_ship_sha taken from ship status and the diff range previous_ship_sha..ship_sha (repo root for ship-1); the four legs run inline in the session: integration check — replay every pack in docs/probes/ oldest-first per the runtime-probe binding recorded in docs/ports/ports.md, one bring-up then all packs then teardown, masked volatile fields re-derived fresh, a failed step retried twice with consistent red = red and red-then-green = flaky-counted-passing with an advisory; security review — the security-review binding recorded in docs/ports/ports.md run over the diff range, findings carried verbatim and severity-ranked, explicitly inform-only; changelog — the range's squash commits as skeleton with booking/bookkeeping commits excluded, session prose per frontier feature; waivers — every waiver recorded in docs/validations/<id>.md for frontier features, listed verbatim"
      - "the red-blocks-hard rule appears as written: a consistently red integration check stops the ship before any approval is solicited — no record written, no gate, no in-loop override; the remedy is a bug-shaped intake, not a ship"
      - "the approval gate presents the full package plus the deploy-target binding excerpted verbatim from docs/ports/ports.md, surfaces a missing smoke suite before approval (no smoke = no mechanical health signal = auto-rollback off for this ship, never silent), and records approval as {approver: git user.name, date} bound to ship_sha; the freshness rule appears as written: immediately before booking, a tip that moved past ship_sha beyond this ship's own bookings voids the evidence — say so and reassemble from the new tip, never a stale deploy"
    injects: [ship-record]
    standards: [docs/standards/loop-surfaces.md]
    footprint: [skills/ship/SKILL.md]
    size: s
    tier: complex
    depends_on: [t3]
    report:
      result: built
      footprint_actual:
        - skills/ship/SKILL.md
      diff_actual:
        files: 1
        insertions: 135
        deletions: 0
      deviations: []
      summary: "skills/ship/SKILL.md now realizes the first half of the Ship skill as a self-contained loop surface: frontmatter (name: ship; a front-loaded description naming both triggers — the front door's ship proposal and the /the-loop ship jump), no ADR or internal-doc references, no session context assumed, and only the allowed external references (the repo artifact paths docs/ships/, docs/probes/, docs/ports/ports.md, docs/validations/, docs/design/design.md, plus spine invocations in plugin-root form). The entry protocol runs three pinned gates in order, each a hard stop: (1) a healing scan that runs `ship status` first and, when latest.interrupted is true, stops before any assembly, presents the ship as interrupted-mid-corridor naming the record, gives verify-production-by-hand instructions, and states the corridor is never auto-resumed; (2) a clean-tree gate on the integration target; (3) a frontier gate over every validated feature in design.md's feature graph, whole-frontier only, with an empty set meaning nothing to ship, stop. Evidence assembly pins ship_sha to the target tip at assembly, takes N and previous_ship_sha from `ship status`, and sets the diff range previous_ship_sha..ship_sha (repo root for ship-1); the four legs run inline — integration check (every pack in docs/probes/ oldest-first via the runtime-probe binding excerpted from ports.md, one bring-up then all packs then one teardown, masked volatile fields re-derived fresh, a failed step retried twice with consistent red = red and red-then-green = flaky-counted-passing plus an advisory), security review (the security-review binding over the diff range, findings verbatim and severity-ranked, inform-only), changelog (the range's squash commits as skeleton with booking/bookkeeping excluded, session prose per frontier feature), and live waivers (verbatim from docs/validations/<id>.md per frontier feature). The red-blocks-hard rule appears as written: a consistently red integration check stops the ship before any approval is solicited — no record, no gate, no in-loop override, remedy is a bug-shaped intake, not a ship. The approval gate presents the full package plus the deploy-target binding excerpted verbatim from ports.md, surfaces a missing smoke suite before approval (no smoke = no mechanical health signal = auto-rollback off for this ship, never silent), and records approval as {approver: git user.name, date} bound to ship_sha; the freshness rule appears as written — immediately before booking, a tip that moved past ship_sha beyond this ship's own bookings voids the evidence, say so and reassemble from the new tip, never a stale deploy. This is a prose surface with no executable behavior to unit-test (the constitution bars testing documentation); each of the five acceptance criteria was verified by reading the written rules against it, and npm test (197 passing) plus npm run check (25 features, 12 contracts, 0 errors/warnings) both stay green with the file added, confirming no regression."

  - id: t9
    title: Ship skill, second half — the two bookings, the corridor invocation, failure posture, tag
    status: built
    covers: [2]
    acceptance:
      - "the skill's booking section pins commit 1: author docs/ships/ship-<N>.md as narrative plus the `## Ship record` yaml block per the ship-record contract carrying evidence and approval and no outcome, set .claude-plugin/plugin.json's version to 0.<N>.0 in the same commit, message ship-<N>: book evidence + approval — landed before any prod-touching command"
      - "the corridor is exactly one invocation of spine ship corridor carrying the deploy-target binding's {deploy, rollback, smoke} command strings (smoke omitted when the binding records none), with no prompts between approval and outcome and no other prod-touching command anywhere in the skill"
      - "outcome booking hands the corridor's JSON to spine ship book <N> and commits precisely the files that command wrote as commit 2, message ship-<N>: book <outcome> — the skill adds no hand edits, and it states that flips and the Ledger render happen on deployed only while every outcome gets one Run-history line"
      - "the failure posture appears as written: rollback_verified false is the loudest line and a full stop — no second autonomous swing at prod, no retry of any corridor step, and a deploy-failed outcome still books commit 2"
      - "the tag rule appears as written: git tag loop/ship/<N> after commit 2, deployed outcomes only, refs-last; the skill stays self-contained per the loop-surfaces standard and keeps the self-hosting binding's specifics in docs/ports/ports.md (excerpted at run time), never hardcoded"
    injects: [ship-record]
    standards: [docs/standards/loop-surfaces.md]
    footprint: [skills/ship/SKILL.md]
    size: s
    tier: standard
    depends_on: [t5, t6, t8]
    report:
      result: built
      footprint_actual:
        - skills/ship/SKILL.md
      diff_actual:
        files: 1
        insertions: 64
        deletions: 0
      deviations: []
      summary: "skills/ship/SKILL.md now carries the second half of the Ship skill, sections 6-10 appended after the freshness gate (section 5) that t8 already closed with 'ship books its pre-deploy record and enters the deploy corridor.' Section 6 pins commit 1: author docs/ships/ship-<N>.md (narrative plus the `## Ship record` yaml block per the ship-record contract carrying evidence and approval and no `outcome` key) and set .claude-plugin/plugin.json's version to 0.<N>.0 in the same commit, message `ship-<N>: book evidence + approval`, stated as landing before any prod-touching command. Section 7 pins the corridor to exactly one invocation of `node \"$CLAUDE_PLUGIN_ROOT/bin/spine.js\" ship corridor -`, its input built from the deploy-target binding excerpted verbatim from docs/ports/ports.md at run time (never hardcoded) as {deploy, rollback, smoke}, omitting smoke when the binding records none; it is named the only prod-touching command anywhere in the skill, with no prompts between approval and the concluded outcome. Section 8 hands that JSON verbatim to `spine ship book <N> -`, states every outcome (deployed/rolled-back/deploy-failed) gets exactly one Run-history bullet while the feature-status flip and the full Ledger re-render happen on deployed only, and commits precisely the files that command wrote (no hand edits) as commit 2, message `ship-<N>: book <outcome>`. Section 9 states the failure posture as written: a `rollback_verified: false` conclusion is the loudest line and a full stop, no second autonomous swing at prod and no retry of any corridor step, and a deploy-failed outcome still books commit 2 before Ship hands the human the same verify-by-hand instruction as an interrupted ship. Section 10 states the tag rule as written: `git tag loop/ship/<N>` after commit 2, deployed outcomes only, refs-last. No ADR or internal-doc references were added (grep confirms zero), the deploy-target binding's specifics stay excerpted from docs/ports/ports.md rather than hardcoded, and the file remains self-contained per the loop-surfaces standard. This is a prose surface with no executable behavior to unit-test (the constitution bars testing documentation); each of the five acceptance criteria was verified by reading the written rules against it, and npm test (197 passing) plus npm run check (25 features, 12 contracts, 0 errors/warnings) both stay green with the addition, confirming no regression."

  - id: t10
    title: Front door — route the ship proposal and jump to the ship skill by name
    status: pending
    covers: [1]
    acceptance:
      - "commands/the-loop.md's explicit-jumps line routes ship to the ship skill by name, matching how the frame and design jumps name their skills, replacing the bare Ship"
      - "the active-mode proposal branch states that accepting a ship proposal routes to the ship skill (mirroring the resolve-parked-to-adjust wording); no other routing or behavior in the file changes"
    injects: []
    standards: [docs/standards/loop-surfaces.md]
    footprint: [commands/the-loop.md]
    size: xs
    tier: standard
    depends_on: []
```
