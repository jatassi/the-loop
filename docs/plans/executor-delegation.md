# Plan — executor-delegation

Delegated executors: rote tasks driven through registered CLI executors by a
verifying Claude driver. Executors register by playbook (`executors/<id>.md`, a
machine block under narrative lore); parsing and binding-validation are pure in
`src/executors.js`; `spine executors` prints the registry and `spine models`
validates `via` bindings against it (hard-fail on unregistered executor or
off-playbook model, warn-never-fail on the three guard cases); the workflow routes
a via-bound `build.<tier>` task to a new `drive` agent that cuts an isolated
worktree, runs the executor CLI headless, verifies inside the worktree, squash-folds
exactly one driver-authored commit, and books exactly as a build agent would with
driven-via provenance; the launch leg pre-flights every distinct via before
anything runs. v1 ships the grok playbook only; delegation stays off by default —
the binding table is the only switch.

## Decomposition — core, playbook, CLI, protocol, driver, routing, pre-flight, probe

Three seams, kept file-disjoint:

**The registry seam (t1→t2→t4, t3).** The pure module first: t1 parses one
playbook's machine block (hard error naming file and field), t2 adds binding
validation against a parsed registry (the two hard-fail rules and the three
warn-never-fail guards) plus the barrel export. t3 authors the grok playbook —
its machine block is pinned verbatim below, so t3 needs no code dependency; the
shipped playbook's parse-cleanliness is proven by t4's test against the real
`executors/` dir. t4 wires both CLI surfaces (`spine executors`, the `spine
models` validation pass) at the bin edge, depending on t2 (the functions it
calls) and t3 (the shipped registry its real-dir test asserts on).

**The agent seam (t5→t6).** t5 extracts build.md §2 (branch protocol incl. crash
healing) and §5 (booking) near-verbatim into one shared protocol doc both agents
reference; t6 authors `agents/drive.md` on top of it — the driver's own
choreography (prompt file, worktree, headless run, in-worktree verification,
squash-fold, failure typing, disposal, booking) is drive's alone and stays in
drive.md. t6 chains on t5 because drive.md references the protocol doc's pinned
sections.

**The routing seam (t7, t8, t9).** t7 gives the workflow script the drive route —
a `build.<tier>` binding carrying `via` (≠ agent) spawns agentType `drive` with
the pinned prompt lines, dual-model label, silent `drive.<via>` lookup, and one
pinned log line — proven under the workflow shim in a new test file (no overlap
with the four existing inner-loop test files). t8 gives the launch leg the
pre-flight (availability + auth smoke per distinct via, stop-on-failure) and the
unconditional fifth symlink (`drive`); it chains on t4 because the pre-flight
reads the registry through `spine executors`. t9 is the first-build probe the
design demands: exercise grok's unobserved `--worktree`/`--worktree-ref` on a
throwaway repo and record the evidence — it claims criterion 1 because the
worktree mode is criterion 1's isolation mechanism, and the record is the
evidence behind the shipped `driver-made` choice (native mode remains a
follow-up playbook amendment, not this feature).

Coverage: criterion 1 (driven execution end-to-end) composes t5 + t6 + t7 + t9;
criterion 2 (failure typing) is t6's own section; criterion 3 (resolver + registry
CLI) is t1 + t2 + t3 + t4; criterion 4 (pre-flight + drive-time environment halt)
is t8 + t7 (the halt path rides the workflow's existing environment-block
conversion, asserted by t7's shim test).

## Plan-time probe resolved — protocol-doc placement

The design left placement of the shared protocol doc to Plan, pending whether the
harness scans `agents/` subdirectories as agent definitions. That fact is
unverifiable mid-session (agent registration is read once at session start, and
this repo installs agents by per-file symlink into `.claude/agents/`, so the
plugin's `agents/` dir is never scanned directly today). Settled by avoidance:
the protocol doc lives at `protocols/branch-and-booking.md` — a top-level plugin
directory nothing scans as definitions, referenced by absolute plugin path the
same way `skills/craft/constitution.md` already is. The question is moot at this
placement, permanently.

## Size-ceiling justification

**t6 (`m`)** — one self-contained agent definition (`agents/drive.md`), the
densest prose task in the plan: choreography, verification gate, failure typing,
and booking must live in one file a fresh agent reads end-to-end, so it cannot
split across tasks without leaving a half-written agent surface on the branch.
Every judgment call is pre-made below (paths, commands, typing table, menu shape,
provenance line); the size is prose volume, not open decisions — which is also
why it is the plan's one `complex` task: composing battle-tested agent prose from
these decisions still takes real judgment.

## Audit note

The fresh-context audit was skipped: no other feature depends on this one, it
touches no interface contracts, and this session carries no agent-spawn surface.
Compensation: the conventions below pin every cross-task agreement point.

## Pinned conventions (cross-task contract — do not improvise)

**Playbook format.** One file per executor at `executors/<id>.md` in the plugin
root. Narrative operational lore surrounds one fenced `yaml` block under the
exact heading `## Machine block` (found via the same line-anchored
heading-then-fence rule as the escalation record — `yamlBlockAfter` in
`src/blocks.js`). Registration is the file's presence in the directory. Machine
block fields:

- `id` — string, required; must equal the filename stem.
- `command` — string, required (the CLI binary).
- `models` — non-empty string array, required (the executor model ids a binding
  may name).
- `worktree` — required enum: `native | driver-made`.
- `invocation` — string, required: a template containing the `{model}` and
  `{prompt}` placeholders and at least one of `{worktree}` / `{ref}`.
- `availability` — string, required (a version-check command).
- `auth_smoke` — required map `{ run: string, expect: string }`.
- `concurrency` — required positive integer.
- `effort_flag` — optional string (an invocation fragment); absent means the
  executor takes no effort knob.

**`src/executors.js` surface** (pure — no filesystem, no process; fs stays at the
bin edge). `parseExecutor(text, file)` → the machine-block record above
(`effort_flag` present only when the block carries it); any defect — missing
heading or fenced block, missing/mistyped required field, out-of-enum `worktree`,
empty `models`, `invocation` missing a required placeholder, `auth_smoke` without
`run`/`expect`, non-positive `concurrency`, `id` ≠ filename stem — throws an
`Error` whose message names the file and the offending field. A playbook file is
never leniently skipped: present means it must parse. `parseExecutors(entries)`
takes `[{file, text}, …]` and returns the registry `{ <id>: record }`, throwing
on a duplicate id naming both files. `validateBindings(table, registry)` takes a
resolved model table (`{ role: { model, effort?, via?, provenance } }`) and a
registry, returns `{ errors, warnings }` of issue objects `{ code, message,
where }` (`where` = the role id), never throws:

- `via` absent or the literal `agent` → no issue of any kind (the explicit
  default; never validated against the registry).
- error `unregistered-executor` — `via` (≠ agent) names no registry id.
- error `model-outside-playbook` — `via` registered, binding `model` not in the
  playbook's `models` list (`session` included: an executor binding needs an
  explicit executor model).
- warning `no-routing-surface` — `via` (≠ agent) on any role outside the routing
  surface set `{build.rote, build.standard, build.complex}` (the only roles whose
  spawn consults `via`).
- warning `off-rubric-tier` — `via` (≠ agent) on `build.standard` or
  `build.complex` (the provisional delegation rubric is rote-only; the workflow
  routes it anyway — the table is the authority).
- warning `ignored-effort` — a binding carrying `effort` whose `via` (≠ agent)
  resolves to a registered executor with no `effort_flag`.

Errors and warnings both accumulate across all roles. Barrel: `src/index.js`
re-exports `parseExecutor`, `parseExecutors`, `validateBindings`.

**CLI.** `spine executors [dir]` — dir defaults to `<plugin-root>/executors`
(plugin root resolved from `bin/spine.js`'s own location, as `models` already
does); reads every `*.md`, prints the registry keyed by id as JSON to stdout; a
malformed playbook exits 1 via the CLI's `fail()` naming file and field; an
absent dir prints `{}`. `spine models [defaults.json] [executors-dir]` — after
resolving the table, load the registry from `executors-dir` (same default) and
run `validateBindings`: warnings print to **stderr**, one line each, formatted
`warn <code>: <message> (<where>)`, table still prints to stdout, exit 0; any
error prints every error line to stderr, prints no table, exits 1. The usage
string gains both forms.

**Grok machine block** (t3 writes it, t4's real-dir test asserts on it) —
verbatim:

    id: grok
    command: grok
    models: [grok-build, grok-composer-2.5-fast]
    worktree: driver-made
    invocation: grok -m {model} --prompt-file {prompt} --cwd {worktree} --always-approve --no-subagents --max-turns 500 --output-format plain
    availability: grok --version
    auth_smoke:
      run: grok -p "say PONG" --max-turns 1
      expect: PONG
    concurrency: 2

No `effort_flag`. Lore items (each a short narrative paragraph or bullet, written
self-contained — no references to any other project's documents): grok commits
last, so truncation manifests as stopped-without-committing and zero commits
always means truncation; the CLI default model is Composer, so `-m` is always
passed explicitly; the `search_replace` tool flakes on large/repetitive files (a
mechanical-defect signature, retryable); ≥3 concurrent jobs trip a 429 team rate
limit (hence concurrency 2); a benign `AuthorizationRequired` log line appears
even when auth is fine (not a failure signature); `grok models` misreports auth —
only the smoke prompt is trusted; the CLI auto-discovers a CLAUDE.md in the repo
it runs in; grok over-deletes behavioral tests the moment judgment is required
(the judgment-defect signature the driver's diff review exists to catch);
`--effort` parses (low…max) but is unobserved on these models, so no
`effort_flag`; `--check` exists and stays unused (a self-verification loop is
still a self-report); `--worktree`/`--worktree-ref` exist but are unobserved —
worktrees stay driver-made pending the native-mode probe record.

**Workflow routing** (t7). Route condition: the task's resolved
`build.<tier ?? 'standard'>` binding carries `via` and it is not `agent`. Then:

- agentType is `drive`; schema stays `BUILD_SCHEMA`; `phase` stays the feature id.
- driver binding: a silent own-property check of the table for `drive.<via>`
  first — found means use it with **no** log line ever; otherwise the ordinary
  `roleBinding('drive')` (whose unbound fallback logs the existing pinned line).
  Spawn model/effort opts come from the **driver** binding via the existing
  `modelOpts`; the executor model never rides a spawn opt.
- prompt (exactly four lines):
  `feature: <feature-id>` / `task: <task-id>` / `executor: <via>` /
  `executor-model: <binding.model>`.
- label: `[<driver-binding.model>] drive:<feature-id>/<task-id> via <via>/<binding.model>`.
- one pinned log line per routed task:
  `model-selection — task <feature-id>/<task-id> routed via <via>/<binding.model>, driver <driver-binding.model>`.
- `via: agent` or no `via` → the ordinary build spawn, byte-identical to today.
- a drive return of `blocked` + `kind: environment` halts the run through the
  existing spawn choke point (no new workflow code should be needed for it —
  assert it under the shim regardless).

**Drive file paths** (t6; both under the gitignored `.claude/worktrees/`, so no
clean-tree gate ever sees them): worktree at
`.claude/worktrees/drive-<feature-id>-<task-id>` — cut detached at the feature
branch tip (`git worktree add --detach <path> loop/<feature-id>`); prompt file at
`.claude/worktrees/drive-<feature-id>-<task-id>.prompt.md` — beside the worktree,
never inside it. On retry: dispose the failed worktree fully, re-cut fresh at the
same path. Disposal on every exit path: `git worktree remove --force` plus
deleting the prompt file; park evidence is quoted into the escalation record,
never left as debris.

**Drive prompt-file content** (t6): the task-contract slice (`spine plan task`
output), the build constitution's text, each selected standard's text, then an
imperative footer — one test per acceptance criterion, implement to green, run
the scoped tests and lint, commit everything as **one** commit with the exact
message `<feature-id>/<task-id>: <title>` — plus any executor-specific prompt
advice the playbook's lore names. The contract rides the prompt; no side channel
is assumed.

**Drive verification gate** (t6, inside the worktree, before anything folds):
the executor's commit exists; per-criterion tests are present and green; lint is
clean; the diff is reviewed for unintended files and deleted or weakened
behavioral tests; the footprint is checked against the contract. Zero executor
commits beyond the worktree's base is **truncation always**, even if the tree
verifies green — an uncommitted run never reached its own finale; the driver
never commits the debris.

**Failure typing** (t6): *truncation* (no commit / finale unreached) and
*mechanical defect* (commit present, checks red, no integrity rule violated —
the executor's own tests red, lint red, a lore-named flaky signature) share
**one retry total per task** in a fresh worktree; *judgment defect* (commit
present and the diff violates an integrity rule — deleted/weakened behavioral
test, a lint suppression, footprint excursion, unintended files, any gaming
move) parks immediately, no retry; a second failure of any type parks with both
runs' evidence quoted. Drive-time CLI/auth/hard-API failure is
environment-shaped: return blocked `kind: environment`, book nothing. Park
records stamp `phase: build`, `kind: feature`, `branch: loop/<feature-id>`, and
a kind-stamped menu of `{resolution, option}` entries, recommended first:
`{resolution: retry, option: rebind <feature-id>/<task-id> to a Claude build
tier (a config pre-step) and retry}` then `{resolution: re-plan, option:
re-spec the task}` — wording may be sharpened to the actual failure, the
resolution stamps may not.

**Fold + booking** (t6 via t5's protocol doc): after the gate passes, from the
main checkout on `loop/<feature-id>`, squash-merge the worktree HEAD and author
the standard `<feature-id>/<task-id>: <title>` commit (the prompt told the
executor to commit that message — belt; the driver authors it itself — braces; N
executor commits collapse to one). Then book exactly as a build agent: fold the
completion report via `spine plan report <feature-id> <task-id> -`, flip
`building` + ledger on the feature's first task, one booking commit on the
integration target. Every driven report's `summary` opens with
`Driven via <executor>/<model> — ` (every driven report, so a clean run never
mints a fake deviation); a retried-then-clean run records the first attempt and
its type in `deviations`. Return shapes are exactly build.md's three shapes —
duplicated in drive.md, not shared.

**Protocol doc** (t5): `protocols/branch-and-booking.md`, exactly two pinned
section headings — `## Branch protocol` (build.md §2's content: clean-tree gate,
integration-target rule, create/rebase `loop/<feature-id>`, crash-healing commit
search, the leave-as-found rule) and `## Booking protocol` (build.md §5's
content: the spine-error rule, the Built path, the feature-shaped park path with
the escalation-record template, the environment-shaped nothing-booked rule) —
near-verbatim, reworded only where build-specific step cross-references
("step 3", "step 5") would dangle, and parameterized agent-neutrally: the
escalation template's `phase:` reads "the phase that parks (build, for both the
build and drive agents)". `agents/build.md` keeps its section numbering; §2 and
§5 bodies become short directives to read and follow the protocol doc's matching
section at `$CLAUDE_PLUGIN_ROOT/protocols/branch-and-booking.md`, retaining any
build-only residue those sections carried. build.md's §1/§3/§4 and return shapes
stay untouched.

**Launch-leg pre-flight** (t8): after args assembly, before launch. The distinct
via set = every `via` value across the resolved `models` table other than
`agent`/absent — computable before Plan stamps tiers; over-checking is harmless.
Empty set → skip. Otherwise read the registry
(`node "$CLAUDE_PLUGIN_ROOT/bin/spine.js" executors`), and for each via: run its
`availability` command, then its `auth_smoke.run`, asserting the output contains
`auth_smoke.expect`. Any failure stops the launch exactly like the dirty-tree
gate — told to the human, nothing runs. The smoke re-runs at every launch
(cached auth state is state the stateless loop doesn't keep). The
agent-resolution step gains `drive` unconditionally: five symlinks.

## Tasks

```yaml
feature: executor-delegation
design_version: 6
tasks:
  - id: t1
    title: Playbook parser — src/executors.js parses one executor playbook's machine block, hard-erroring with file and field
    status: built
    covers: [3]
    acceptance:
      - src/executors.js exports parseExecutor(text, file) returning the machine-block record ({id, command, models, worktree, invocation, availability, auth_smoke {run, expect}, concurrency, effort_flag only when present}) from a playbook whose fenced yaml sits under the exact heading "## Machine block" amid narrative prose, proven by a test parsing a realistic fixture playbook
      - every malformed-playbook case throws an Error naming the file and the offending field, each proven by a test — missing heading or fenced block, missing or mistyped required field, worktree outside native|driver-made, empty or non-array models, invocation missing {model} or {prompt} or lacking both {worktree} and {ref}, auth_smoke without run or expect, non-positive-integer concurrency, and id not equal to the filename stem
      - parseExecutors([{file, text}, …]) returns the registry keyed by id and throws naming both files on a duplicate id, proven by tests
    injects: []
    standards: [docs/standards/pure-core-thin-cli.md]
    footprint: [src/executors.js, test/executors.test.js]
    size: s
    tier: standard
    depends_on: []
    report:
      result: built
      footprint_actual:
        - src/executors.js
        - test/executors.test.js
      diff_actual:
        files: 2
        insertions: 269
        deletions: 0
      deviations: []
      summary: "src/executors.js now exports parseExecutor(text, file) and parseExecutors(entries): parseExecutor locates the fenced yaml block under the exact heading \"## Machine block\" (via blocks.js's yamlBlockAfter), parses it, and returns the machine-block record {id, command, models, worktree, invocation, availability, auth_smoke {run, expect}, concurrency, effort_flag only when present} — proven against a realistic grok-shaped fixture playbook with narrative prose around the block. Every malformed-playbook case throws an Error naming the file and the offending field: missing heading or fenced block, missing/mistyped required field, worktree outside native|driver-made, empty/non-array models, invocation missing {model}/{prompt} or lacking both {worktree} and {ref}, auth_smoke without run/expect, non-positive-integer concurrency, and id not equal to the filename stem — each is its own test in test/executors.test.js (12 tests total), and each was confirmed to actually exercise its check by temporarily disabling the corresponding validation and watching only that test fail. parseExecutors(entries) folds many {file, text} pairs into a registry keyed by id and throws naming both files on a duplicate id. The module stays pure per docs/standards/pure-core-thin-cli.md (no fs, no process); node:path is used only for pure filename-stem extraction. Full repo test suite (133 tests) and eslint both stay green."
  - id: t2
    title: Binding validation — validateBindings hard-fails unregistered via and off-playbook model, warns on the three guard cases
    status: built
    covers: [3]
    acceptance:
      - validateBindings(table, registry) returns {errors, warnings} of {code, message, where} issues and never throws — a via naming no registry id yields error unregistered-executor and a registered via with a binding model outside the playbook's models list (the literal session included) yields error model-outside-playbook, each naming the role in where, proven by tests
      - the three guards warn and never error, each proven by a test — no-routing-surface for a via on any role outside build.rote/build.standard/build.complex, off-rubric-tier for a via on build.standard or build.complex, ignored-effort for an effort on a via-binding whose executor carries no effort_flag — and a via of the literal agent (or no via) anywhere yields no issue of any kind
      - src/index.js re-exports parseExecutor, parseExecutors, and validateBindings from src/executors.js
    injects: []
    standards: [docs/standards/pure-core-thin-cli.md]
    footprint: [src/executors.js, test/executors.test.js, src/index.js]
    size: s
    tier: standard
    depends_on: [t1]
    report:
      result: built
      footprint_actual:
        - src/executors.js
        - src/index.js
        - test/executors.test.js
      diff_actual:
        files: 3
        insertions: 146
        deletions: 1
      deviations: []
      summary: "src/executors.js now exports validateBindings(table, registry), which walks the resolved model table's roles and, for every binding whose via is present and not the literal agent, accumulates issues into { errors, warnings } and never throws. Two hard errors: unregistered-executor when via names no id in the registry, and model-outside-playbook when a registered via's binding model (session included) is absent from that executor's models list — each names the offending role in where, proven by dedicated tests (the second covers both the session case and an arbitrary out-of-playbook model in one test, following the file's established grouping idiom). Three warnings, none of which ever raise an error: no-routing-surface for a via on any role outside the {build.rote, build.standard, build.complex} set, off-rubric-tier for a via specifically on build.standard or build.complex, and ignored-effort for a binding's effort field when its via resolves to a registered executor carrying no effort_flag; a via of agent or an absent via short-circuits before any check runs, proven by a test covering an off-rubric-tier role, an unbound role, and an effort-carrying role simultaneously, asserting zero issues of either kind. Each of the six new tests was confirmed to actually exercise its own check by temporarily disabling that check in isolation and watching only the corresponding test go red, then restoring. src/index.js re-exports parseExecutor, parseExecutors, and validateBindings from src/executors.js (a barrel re-export, left untested per the constitution's list of things never to test). The module stays pure per docs/standards/pure-core-thin-cli.md — no fs, no process. Full repo test suite (139 tests), eslint over the whole tree, and `node bin/spine.js check` (25 features, 11 contracts, 0 errors/warnings) are all green."
  - id: t3
    title: Grok playbook — executors/grok.md with the pinned machine block and the dogfood lore, self-contained
    status: built
    covers: [3]
    acceptance:
      - executors/grok.md carries the plan's pinned grok machine block verbatim as one fenced yaml block under the exact heading "## Machine block" — id grok, command grok, models [grok-build, grok-composer-2.5-fast], worktree driver-made, the pinned invocation template, availability grok --version, auth_smoke run grok -p "say PONG" --max-turns 1 with expect PONG, concurrency 2, and no effort_flag
      - the surrounding narrative lore states every pinned item — commits-last/zero-commits-means-truncation, explicit -m because the CLI defaults to Composer, search_replace flakes on large/repetitive files, 429 at three or more concurrent jobs, the benign AuthorizationRequired log line, grok models misreporting auth, CLAUDE.md auto-discovery, over-deletion of behavioral tests when judgment is required, --effort parsing but unobserved (why no effort_flag), --check deliberately unused, and --worktree/--worktree-ref existing but unobserved (driver-made pending the probe)
      - the file is self-contained — grep finds no "ADR" reference and no reference to any other project's documents
    injects: []
    standards: [docs/standards/loop-surfaces.md]
    footprint: [executors/grok.md]
    size: s
    tier: standard
    depends_on: []
    report:
      result: built
      footprint_actual:
        - executors/grok.md
      diff_actual:
        files: 1
        insertions: 73
        deletions: 0
      deviations: []
      summary: "executors/grok.md now exists, self-contained, with the plan's pinned grok machine block carried verbatim as one fenced yaml block under the exact heading \"## Machine block\" (id grok, command grok, models [grok-build, grok-composer-2.5-fast], worktree driver-made, the pinned invocation template with {model}/{prompt}/{worktree} placeholders, availability grok --version, auth_smoke run grok -p \"say PONG\" --max-turns 1 with expect PONG, concurrency 2, no effort_flag) — confirmed by running the already-shipped parseExecutor against the file, which returns exactly that record. The surrounding narrative lore states every pinned item as its own bullet: grok commits only once a task finishes, so zero commits after a run is always truncation; -m is always passed explicitly because the CLI defaults to Composer; search_replace flakes on large/repetitive files (a mechanical-defect signature); three or more concurrent jobs trip a 429; a benign AuthorizationRequired log line can appear with auth fine; grok models misreports auth so only the smoke check is trusted; grok auto-discovers CLAUDE.md; grok over-deletes behavioral tests when judgment is required (a judgment defect, never a retry); --effort parses but its effect is unobserved on these models (why no effort_flag is set); --check exists and is deliberately unused because self-checking is still a self-report; and --worktree/--worktree-ref exist but are unobserved, so worktree mode stays driver-made pending the probe. The file is self-contained: grep finds zero hits for \"ADR\" and zero hits for any other project's name or document (AlphaMind, dogfood, sonnet, cursor, xai, the-loop). Full repo test suite (139 tests), eslint, and `node bin/spine.js check` (25 features, 11 contracts, 0 errors/warnings) all stay green — this task added no code, so nothing in the existing suite was expected to move."
  - id: t4
    title: CLI wiring — spine executors prints the registry; spine models validates bindings against it
    status: built
    covers: [3]
    acceptance:
      - spine executors prints the parsed registry keyed by id as JSON — against the real plugin executors/ dir a subprocess test asserts grok appears with worktree driver-made and the pinned models list; with an explicit dir argument it reads a fixture dir; a malformed fixture playbook exits 1 with stderr naming file and field; an absent dir prints {}
      - spine models with a fixture settings layer whose via names an unregistered executor, or whose model sits outside the named playbook's list, exits 1 with every error on stderr and no table on stdout; each of the three warn cases (no-routing-surface, off-rubric-tier, ignored-effort) prints one stderr line in the pinned warn format (warn, then the code, message, and role) while the resolved table still prints to stdout and the exit stays 0 — all proven by subprocess tests using fixture settings and executors dirs
      - the usage string names both command forms (executors [dir]; models [defaults.json] [executors-dir])
    injects: []
    standards: [docs/standards/pure-core-thin-cli.md]
    footprint: [bin/spine.js, test/executors-cli.test.js]
    size: s
    tier: standard
    depends_on: [t2, t3]
    report:
      result: built
      footprint_actual:
        - bin/spine.js
        - test/executors-cli.test.js
      diff_actual:
        files: 2
        insertions: 203
        deletions: 9
      deviations:
        - "test/spine-cli.test.js's pre-existing test \"spine models merges an overridden defaults file with project < local settings overrides ... carrying a bound via through untouched\" (from the model-selection feature, predating executor-delegation) now fails: its fixture binds drive via \"my-executor\", which spine models now hard-validates against the real executors/ registry (grok only) since this task wires validateBindings into the CLI unconditionally, per the plan's pinned convention. \"my-executor\" was never a registered executor id, so unregistered-executor now fires where it previously went unchecked. This file is outside t4's footprint (bin/spine.js, test/executors-cli.test.js only), so it was left red rather than edited; full suite: 148 tests, 147 pass, 1 fail (this one)."
      summary: "bin/spine.js gains two CLI surfaces per the plan's pinned CLI convention. `spine executors [dir]` (dir default: <plugin-root>/executors, resolved from bin/spine.js's own location like `models` already does) reads every *.md file in the directory, parses it via src/executors.js's parseExecutors, and prints the registry keyed by id as JSON — proven by a subprocess test against the real plugin executors/ dir (grok appears with worktree driver-made and models [grok-build, grok-composer-2.5-fast]), a subprocess test with an explicit fixture dir argument, a subprocess test where a malformed fixture playbook exits 1 with stderr naming the file and the offending field (bubbling through the existing top-level try/catch's fail()), and a subprocess test where a nonexistent dir prints `{}`. `spine models [defaults.json] [executors-dir]` now resolves the model table as before, then loads the executor registry from executors-dir (same default) and runs validateBindings against it: any error (unregistered-executor, model-outside-playbook) writes every error line to stderr and exits 1 printing no table — proven by a subprocess test whose fixture settings layer trips both error codes at once; each of the three warn cases (no-routing-surface, off-rubric-tier, ignored-effort) writes exactly one stderr line in the pinned format `warn <code>: <message> (<where>)` while the table still prints to stdout and the exit stays 0 — proven by three subprocess tests, one per code, each isolating exactly that warning via its fixture. The usage string (both the switch's default case and the top-of-file doc comment) now names both forms: `executors [dir]` and `models [defaults.json] [executors-dir]`, proven by a subprocess test matching both literal substrings. All 9 new tests were watched red (before the CLI code existed) then green. The module stays within docs/standards/pure-core-thin-cli.md: all new fs work (readRegistry's readdirSync/readFileSync/existsSync) lives at the bin edge, calling straight into src/executors.js's pure parseExecutors/validateBindings. Full repo test suite: 148 tests, 147 pass (the one pre-existing failure is the deviation above, outside this task's footprint); eslint is clean over the whole tree; `node bin/spine.js check` (25 features, 11 contracts, 0 errors/warnings) and `node bin/spine.js plan check executor-delegation` (0 errors, 1 pre-existing size-at-ceiling warning on t6, already justified in the plan narrative) both stay green."
  - id: t5
    title: Shared protocol doc — build.md §2 and §5 extract near-verbatim into protocols/branch-and-booking.md
    status: pending
    covers: [1]
    acceptance:
      - protocols/branch-and-booking.md exists with exactly the two pinned section headings "## Branch protocol" and "## Booking protocol", carrying build.md's current §2 (clean-tree gate, integration-target rule, branch create/rebase, crash-healing commit search, leave-as-found rule) and §5 (spine-error rule, Built path, feature-shaped park path with the escalation template, environment-shaped nothing-booked rule) near-verbatim, agent-neutrally parameterized so no build-only step cross-reference dangles and the escalation template's phase reads as the parking phase (build, for both agents)
      - agents/build.md keeps its section numbering and its §1/§3/§4 and return shapes byte-for-byte in intent, while §2 and §5 bodies become short directives to read and follow the matching protocol-doc section at $CLAUDE_PLUGIN_ROOT/protocols/branch-and-booking.md, and no remaining build.md sentence references prose that moved out
      - both files stay self-contained — grep for "ADR" yields no hits in either
    injects: []
    standards: [docs/standards/loop-surfaces.md]
    footprint: [protocols/branch-and-booking.md, agents/build.md]
    size: s
    tier: standard
    depends_on: []
  - id: t6
    title: The drive agent — agents/drive.md, playbook-parameterized choreography, verification gate, failure typing, booking
    status: pending
    covers: [1, 2]
    acceptance:
      - agents/drive.md exists (frontmatter name drive; tools Read, Grep, Glob, Bash, Write, Edit) and spells the full choreography in order — resolve the task slice and craft baseline, follow the shared protocol doc's branch protocol including crash healing, demand-read the playbook at $CLAUDE_PLUGIN_ROOT/executors/<executor>.md from the prompt's executor line, assemble the prompt file with the pinned content at the pinned .claude/worktrees/drive-<feature-id>-<task-id>.prompt.md path beside (never inside) the worktree, cut the worktree per the playbook's worktree mode (driver-made means git worktree add --detach at the feature-branch tip; native means the invocation's {ref} route), run the CLI headless per the invocation template with every placeholder substituted, verify inside the worktree (commit exists, per-criterion tests present and green, lint clean, diff reviewed for unintended files and deleted or weakened behavioral tests, footprint against the contract), squash-fold the worktree HEAD onto loop/<feature-id> authoring the standard <feature-id>/<task-id> commit message itself, and dispose worktree plus prompt file on every exit path
      - the failure-typing section states the pinned table exactly — zero executor commits is truncation always even on a green tree; a commit whose diff violates an integrity rule (deleted or weakened behavioral test, suppression, footprint excursion, unintended files, any gaming move) is a judgment defect parking immediately with no retry; red checks without an integrity violation (executor's own tests red, lint red, a lore-named flaky signature) are a mechanical defect; truncation and mechanical share one retry total per task in a fresh worktree; the second failure of any type parks with both runs' evidence quoted into the escalation record and the kind-stamped menu ({resolution retry, rebind-to-a-Claude-tier config pre-step} first, {resolution re-plan, re-spec the task} second); drive-time CLI/auth/hard-API failure returns blocked kind environment and books nothing
      - the booking section follows the shared protocol doc exactly as build does, plus the drive deltas — every driven completion report's summary opens "Driven via <executor>/<model> — ", a retried-then-clean run records the first attempt and its type in deviations, park records stamp phase build, and the three return shapes match build.md's shapes
      - the file is self-contained — grep for "ADR" yields no hits, and no grok-specific operational fact lives in the agent (executor knowledge arrives only by demand-reading the playbook)
    injects: []
    standards: [docs/standards/loop-surfaces.md]
    footprint: [agents/drive.md]
    size: m
    tier: complex
    depends_on: [t5]
  - id: t7
    title: Workflow routing — a via-bound build tier spawns drive with the pinned prompt, label, silent sub-role lookup, and log line
    status: pending
    covers: [1, 4]
    acceptance:
      - under the workflow shim, a pending task whose resolved build.<tier> binding carries a via other than agent spawns agentType drive with schema-carrying opts unchanged from build's (BUILD_SCHEMA, phase = feature id), a prompt of exactly the four pinned lines (feature, task, executor, executor-model), and the pinned label [<driver-model>] drive:<fid>/<tid> via <via>/<model>
      - driver-model resolution is proven both ways — a drive.<via> table binding is used silently (no fallback or routing log names it as fallen back), and absent that, roleBinding('drive') resolves with its ordinary logged session fallback when unbound — and the executor model never appears in the spawn's model opt (the driver binding's model/effort ride via the existing opts rule)
      - exactly one pinned log line per routed task ("model-selection — task <fid>/<tid> routed via <via>/<model>, driver <driver-model>") appears, and a binding with via agent or no via spawns the ordinary build agentType with today's prompt and label unchanged
      - a scripted drive return of result blocked with kind environment ends the run halted with reason environment-blocked, proven under the shim
    injects: []
    standards: []
    footprint: [workflows/inner-loop.js, test/inner-loop-drive.test.js]
    size: s
    tier: standard
    depends_on: []
  - id: t8
    title: Launch-leg pre-flight — availability and auth smoke per distinct via before launch; drive joins agent resolution
    status: pending
    covers: [4]
    acceptance:
      - commands/the-loop.md's launch leg gains a pre-flight step between args assembly and launch that computes the distinct via set from the resolved models table (every via other than agent or absent; empty set skips), reads the registry via node "$CLAUDE_PLUGIN_ROOT/bin/spine.js" executors, and for each via runs the playbook's availability command then its auth_smoke run asserting the output contains expect — any failure stops the launch like the dirty-tree gate, told to the human with nothing run, and the step states the smoke re-runs at every launch
      - the agent-resolution step lists drive as a fifth agent type to confirm and symlink unconditionally, alongside plan, build, derive, validate
      - the file stays self-contained — grep for "ADR" yields no hits
    injects: []
    standards: [docs/standards/loop-surfaces.md]
    footprint: [commands/the-loop.md]
    size: s
    tier: standard
    depends_on: [t4]
  - id: t9
    title: Probe — grok native worktree flags (--worktree/--worktree-ref) on a throwaway repo
    status: pending
    covers: [1]
    acceptance:
      - a probe record exists at docs/research/2026-07-03-grok-native-worktree.md stating the question (do grok's --worktree/--worktree-ref flags produce a usable isolated worktree run?), the exact commands run against a throwaway git repo outside this checkout, and either the observed behavior with captured evidence or the concrete reason no observation is possible in this environment (CLI absent, unauthenticated, or the flags failing) — never a guess presented as an observation
      - the record states the standing consequence either way — the shipped playbook stays worktree driver-made, and flipping to native mode is a follow-up playbook amendment gated on this record being clean
    injects: []
    standards: []
    footprint: [docs/research/2026-07-03-grok-native-worktree.md]
    size: s
    tier: standard
    depends_on: []
```
