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
    status: pending
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

  - id: t3
    title: spine ship status — healing and pin helper on the CLI edge
    status: pending
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

  - id: t4
    title: appendShip — the Ledger's ship history line (src/ledger.js)
    status: pending
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

  - id: t5
    title: spine ship book — guarded commit-2 mechanics (record outcome, flips, Ledger)
    status: pending
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

  - id: t6
    title: spine ship corridor + the scripted fixture deploy target
    status: pending
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

  - id: t7
    title: Marketplace manifest — the static marketplace-on-main seed
    status: pending
    covers: [2]
    acceptance:
      - "the file .claude-plugin/marketplace.json exists, parses as JSON, and declares this repo as a single-plugin marketplace: an owner block plus a plugins array with exactly one entry whose name matches .claude-plugin/plugin.json's name (the-loop) and whose source is the string ./ — the static, written-once manifest the recorded marketplace-on-main deploy binding in docs/ports/ports.md consumes; no other file changes"
    injects: []
    standards: []
    footprint: [.claude-plugin/marketplace.json]
    size: xs
    tier: standard
    depends_on: []

  - id: t8
    title: Ship skill, first half — entry gates, healing scan, evidence package, approval + freshness
    status: pending
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

  - id: t9
    title: Ship skill, second half — the two bookings, the corridor invocation, failure posture, tag
    status: pending
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
