# Plan — model-selection

Per-role model/effort bindings at every spawn surface: a shipped defaults table
(`config/model-bindings.json`), one resolver (`spine models`) merging defaults <
project < local settings with per-role provenance, workflow plumbing that rides the
resolved table through `args.models` into every spawn's model/effort opts and label,
a decision-density `tier` stamped on every task contract and validated by
`spine plan check`, and the session-side surfaces (launch leg, plan agent, design
skill) consuming the same resolver. The engine may inherit the session model, but
never invisibly: an unbound role logs a fallback line relayed at the run boundary.

## Decomposition — probe, core, spine, plumbing, surfaces

**t1 — the probe.** The one harness fact the docs don't state: whether workflow
`agent()` spawn opts beat agent-definition frontmatter for `model`. The plumbing
passes spawn opts regardless (no plugin agent carries `model` frontmatter today), so
the probe gates nothing mechanically — but the design demands the gap be confirmed
or explicitly recorded as unobservable, first, before the plumbing lands on top of
the assumption.

**t2–t3 — resolver core, then CLI.** The pure merge/provenance core plus the shipped
default table land first (`src/models.js`, `config/model-bindings.json`), then one
task wires `spine models` into `bin/spine.js` — fs at the bin edge, purity in src,
matching the repo's split. Every other surface (workflow launch leg, plan agent,
design skill) consumes this one resolver; none re-derives the merge. The feature's
criterion 1 has two halves — the resolver resolving (t2/t3) and the resolver being
the *single source for every surface*, session-side surfaces invoking it themselves
(t7's audit spawn, t8) — which is why t7 and t8 also claim criterion 1: consuming
the one resolver is part of what "resolves every registered role" promises.

**t4 — tier in the plan spine.** `src/plan.js` learns the `tier` field: enum-checked
when present, a warning (never an error) when absent so plans cut before this
feature keep parsing — downstream routes an untiered task as `standard` with
fallback provenance. Warning-not-error is deliberate, not an oversight: the feature
grandfathers untiered plans by design ("defaults to standard with fallback
provenance"), and the missing-tier warning is still a gate for new plans — the plan
agent's own protocol forbids leaving a warning the narrative doesn't answer. The
machine-appended remediation round-marker is stamped `tier: standard` at append time
so a remediated plan stays warning-free.

**t5 — workflow plumbing.** `workflows/inner-loop.js` rides `args.models` into every
spawn: model/effort opts, model-prefixed labels, the pinned unbound-role fallback
log line, `build.<tier>` routing from task summaries, derive's hardcoded
`effort: 'low'` retired into the table, and the plan-return schema learning `tier`.

**t6–t8 — the consuming surfaces.** The launch leg assembles `args.models` and
relays fallback lines at the boundary; the plan agent stamps tier and resolves its
audit spawn's model; the design skill resolves its reader and alternative spawns.
Each surface is its own task — footprints stay disjoint.

t2→t3 chain on the resolver import; t2→t4 chain on the shared barrel
(`src/index.js` — single ordered owner pair, per the overlap rule); t5 orders after
the probe (t1); t6–t8 order after the CLI they cite (t3), t7 also after t4 (the
field its template stamps must be validated by the check it tells the agent to run).

## Size-ceiling justification

**t5 (`m`)** — the plumbing is one coherent seam through the script's single spawn
choke point (opts, labels, fallback logging, tier routing, schema): splitting it
would leave `workflows/inner-loop.js` internally inconsistent between tasks and cost
each builder a full re-read of the ~300-line script plus its four shim test files.
One pass is smaller than two half-passes. It stays inside the file's 350-line lint
budget — the binding lookup is a handful of small helpers, not a subsystem.

## Audit fold-in (fresh-context audit, 2026-07-03)

Four findings, all folded: the fallback-relay channel is now a pinned convention
(the t6 builder no longer guesses how log lines reach the session); `via`
pass-through gained explicit test acceptance in t2 and t3 (criterion 1 names
"executor"); the warning-not-error posture for `missing-tier` is justified above
and the remediation round-marker now gets a stamped tier (t4); t7/t8's grounding in
criterion 1's single-source clause is stated in the decomposition narrative.

## Pinned conventions (cross-task contract — do not improvise)

**Binding entry** (per the `model-binding` contract):
`{ model, effort?, via? }` — `model` is a Claude alias, a full model id, or the
literal `session` (deliberate inherit); `effort` is one of
`low|medium|high|xhigh|max` (absent inherits session effort); `via` is `agent`
(default, omitted in practice) or a registered executor id. Nothing in this feature
*acts* on `via`, but it is carried through the merge, the resolved table, and
`args` untouched — the executor-delegation feature consumes it later, so dropping
it in transit is a defect here.

**Resolved table** (what `spine models` prints and `args.models` carries):
`{ <role>: { model, effort?, via?, provenance } }` with `provenance` one of
`default|project|local`. The table contains only bound roles — the registry is open,
so "registered" means "bound in any layer". Looking up an unbound role yields the
fallback binding `{ model: "session", provenance: "fallback" }` — the resolver
expresses the fallback; consumers make it visible.

**Merge semantics.** Three layers, `defaults < project < local`, **whole-entry
replacement per role** — a role bound in a higher layer replaces the entire entry
(no field-level merge: a local `{ model: "haiku" }` over a default
`{ model: "opus", effort: "low" }` yields `{ model: "haiku" }`, effort gone).

**Config sources.** Defaults ship at `<plugin-root>/config/model-bindings.json`,
where plugin-root is resolved from `bin/spine.js`'s own file location (its parent
directory's parent), never from cwd. Project layer: `.claude/settings.json`, key
`"the-loop"` → `modelBindings`; local layer: `.claude/settings.local.json`, same
key — both read from cwd (agents run at the target-repo root). A missing settings
file or missing key is an empty layer, never an error; unparseable JSON in a
present file is an error naming the file.

**Shipped default table** (config/model-bindings.json — exact rows):
`plan → session` · `plan.audit → opus` · `build.rote → sonnet` ·
`build.standard → sonnet` · `build.complex → opus` · `drive → sonnet` ·
`derive → opus, effort low` · `validate → sonnet` · `design.reader → sonnet` ·
`design.alternative → opus`.

**Resolver surface** (`src/models.js`, named so t3 imports without guessing):
`EFFORTS` (the effort enum), `resolveModels({ defaults, project, local })` → the
resolved table (throws on a malformed entry — non-object, missing/non-string
`model`, out-of-enum `effort` — naming the role and the layer it came from), and
`bindingFor(table, role)` → the entry, or the session fallback for an unbound role.
Barrel-exported from `src/index.js`.

**CLI.** `spine models [defaults.json]` — the optional trailing arg overrides the
defaults-file path (the CLI's existing optional-file convention; tests use it for
deterministic fixtures). Prints the resolved table as JSON to stdout; resolver
errors exit 1 via the CLI's `fail()`. The usage string gains `models`. Surfaces
invoke it as `node "$CLAUDE_PLUGIN_ROOT/bin/spine.js" models`.

**Tier.** `tier: rote|standard|complex` on every task contract — decision-density,
not size: how much the task leaves the builder to decide. `rote` additionally
requires correctness fully captured by the task's tests + lint (the
delegation-eligibility rubric — provisional; when unsure between rote and standard,
choose standard). `src/plan.js` exports `TASK_TIERS`; `validatePlan` raises error
`bad-tier` on an out-of-enum value and warning `missing-tier` on absence (a plan cut
before this feature — downstream defaults it to `standard` with fallback
provenance). `normalizeTask` carries `tier` through when present (absent stays
absent, like `report`), so `resolveTask` and `spine plan task` slices include it.
`appendRemediation` stamps `tier: standard` on the round-marker it appends.

**Workflow role ids.** The plan spawn resolves role `plan`; build spawns resolve
`build.<tier>` with tier from the task summary, defaulting to `standard` when the
summary carries none; derive resolves `derive`; validate resolves `validate`.
`agentType` is unchanged by bindings — the role selects only the model/effort opts
and the label prefix.

**Spawn opts from a binding.** Bound with `model !== "session"`: pass
`model: <binding.model>`. Bound with `model === "session"`: pass no model opt (the
deliberate inherit). Either way pass `effort: <binding.effort>` exactly when the
binding carries one. Unbound (role missing from `args.models`, or `args.models`
absent entirely): pass neither, and `log()` the pinned fallback line. The script
never imports `src/models.js` (workflow scripts import nothing) — it re-implements
the lookup inline against the pinned table shape.

**Pinned log lines** (tests and the boundary relay match on these exactly):
- unbound role: `model-selection — role <role> unbound, session-model fallback`
- untiered task: `model-selection — task <feature>/<task-id> has no tier, routing build.standard`

**Fallback visibility channel.** The workflow's `log()` lines are the design's
chosen carrier for fallback visibility; they surface in the harness's live workflow
output (the `/workflows` surface and the Workflow tool's returned output), which
the session that launched the run can read alongside the BoundaryResult. t6's relay
step therefore instructs scanning the run's log output for lines prefixed
`model-selection — ` and stating them to the human verbatim. No BoundaryResult
field is added — the boundary-result contract is design-owned and unchanged by this
feature.

**Labels.** Every spawn label gains the prefix `[<resolved-model>] ` — the binding's
`model` string when bound (including the literal `session`), or `session` when
unbound. Examples: `[sonnet] build:alpha/t1`, `[opus] derive:alpha`,
`[session] plan:alpha`.

**Schema-as-template gotcha (load-bearing).** The harness silently drops any
structured-return field the spawn schema does not describe. `TASK_SUMMARY` in
`workflows/inner-loop.js` must therefore describe `tier` (a string property), or
the plan agent's stamped tiers never reach the script and every build routes
`build.standard` by accident. Task summaries everywhere become
`{ id, status, depends_on, size, tier }` — the plan agent's return (t7) and the
launch leg's `args.plans` reduction (t6) carry the same shape.

## Tasks

```yaml
feature: model-selection
design_version: 5
tasks:
  - id: t1
    title: Probe — do workflow agent() spawn opts beat agent-definition frontmatter for model?
    status: built
    covers: [2]
    acceptance:
      - a probe record exists at docs/research/2026-07-03-workflow-spawn-opts-precedence.md stating the question (workflow agent() opts vs agent frontmatter model precedence), every channel attempted with the exact commands run, and either the observed winner with captured evidence or the concrete reason no channel in this environment can observe it — never a guess presented as an observation
      - the record states the standing consequence for the plumbing either way — spawn opts are passed regardless, and no plugin agent file (agents/*.md) carries model frontmatter today, verified by grep and cited in the record
    injects: []
    standards: []
    footprint: [docs/research/2026-07-03-workflow-spawn-opts-precedence.md]
    size: s
    tier: standard
    depends_on: []
    report:
      result: built
      footprint_actual:
        - docs/research/2026-07-03-workflow-spawn-opts-precedence.md
      diff_actual:
        files: 1
        insertions: 178
        deletions: 0
      deviations: []
      summary: "docs/research/2026-07-03-workflow-spawn-opts-precedence.md exists, stating the precedence question (workflow agent() opts vs agent-definition frontmatter model), the tension in ADR-0030 that motivates it, and seven channels attempted with exact commands: this repo's own ADR/design record, the workflow harness's own source and test shim, a full-history grep confirming no plugin agent file has ever carried model frontmatter, the local Claude Code changelog cache, a live fetch of code.claude.com/docs (workflows, agent-sdk/typescript, sub-agents, llms-full.txt) turning up a generic (not workflow-agent()-scoped) subagent model-resolution order and confirming the docs never publish a field reference for the in-script agent() opts object, this Build agent's own tools: frontmatter (no Workflow/Agent tool, so it cannot itself spawn the conflicting pair the question needs), and live introspection of this very task's own workflow spawn transcript (no model opt sent, no frontmatter present, resolved to the launching session's model). The conclusion states plainly that no channel available in this environment can produce a workflow-agent()-specific empirical observation, names the concrete structural reason (the Build agent tool boundary), and cites the doc language found as a signal only, never as the answer. The standing-consequence section states both pinned facts: spawn opts are passed regardless of the unresolved precedence (the plumbing's contribution is supplying the opt, not adjudicating a conflict), and grep -n \"model\" agents/*.md returns no model: frontmatter anywhere today (only two unrelated prose hits in agents/plan.md), so the gap is real but currently inert."
  - id: t2
    title: Model-binding resolver core (src/models.js) + shipped default table (config/model-bindings.json)
    status: built
    covers: [1]
    acceptance:
      - config/model-bindings.json exists carrying exactly the ten pinned default rows (plan session · plan.audit opus · build.rote sonnet · build.standard sonnet · build.complex opus · drive sonnet · derive opus with effort low · validate sonnet · design.reader sonnet · design.alternative opus), each entry shaped per the model-binding contract
      - src/models.js exports EFFORTS, resolveModels, and bindingFor per the pinned resolver surface, re-exported from the src/index.js barrel; resolveModels merges defaults < project < local with whole-entry replacement per role and stamps provenance default|project|local on every resolved entry
      - resolveModels throws on a malformed entry (non-object, missing or non-string model, out-of-enum effort) with a message naming the role and the layer; bindingFor returns the bound entry, or for an unbound role the session fallback entry (model session, provenance fallback)
      - test/models.test.js proves the merge (a project row replacing a default row wholesale, a local row beating both), the provenance stamps, the unbound fallback, that a bound via rides the merge into the resolved entry untouched, and each malformed-entry rejection, all green under node --test; src/models.js touches no filesystem
    injects: [model-binding]
    standards: [docs/standards/pure-core-thin-cli.md]
    footprint: [config/model-bindings.json, src/models.js, src/index.js, test/models.test.js]
    size: s
    tier: standard
    depends_on: []
    report:
      result: built
      footprint_actual:
        - config/model-bindings.json
        - src/index.js
        - src/models.js
        - test/models.test.js
      diff_actual:
        files: 4
        insertions: 148
        deletions: 0
      deviations: []
      summary: "config/model-bindings.json now ships exactly the ten pinned default rows (plan session, plan.audit opus, build.rote sonnet, build.standard sonnet, build.complex opus, drive sonnet, derive opus/effort low, validate sonnet, design.reader sonnet, design.alternative opus), each shaped { model, effort? }. src/models.js exports EFFORTS (the five-value effort enum), resolveModels({ defaults, project, local }) which merges the three layers in that order with whole-entry replacement per role and stamps provenance default|project|local on every resolved entry, and bindingFor(table, role) which returns the bound entry or the session fallback ({ model: 'session', provenance: 'fallback' }) for an unbound role; all three are re-exported from src/index.js. resolveModels throws (TypeError for the missing/non-string-model case, Error for a non-object entry or an out-of-enum effort) naming the offending role and layer. test/models.test.js proves the shipped default table's exact shape, the three-layer merge with per-layer provenance (including a project row replacing a default wholesale and a local row beating both), bindingFor's bound/unbound behavior, a bound via field riding the merge into the resolved entry untouched, and each malformed-entry rejection (non-object, missing model, non-string model, out-of-enum effort) — 5 tests, all green under node --test. src/models.js imports nothing from node:fs, node:process, or any clock source; every test in the file passes in-memory JS objects only, never a file path, to resolveModels/bindingFor, so purity is exercised by construction rather than asserted separately. npm run check (spine plan/design check + eslint over the whole tree) is green."
  - id: t3
    title: spine models — the CLI resolver command over settings layers
    status: built
    covers: [1]
    acceptance:
      - spine models prints the resolved table as JSON, reading defaults from <plugin-root>/config/model-bindings.json resolved relative to bin/spine.js's own location (never cwd), the project layer from ./.claude/settings.json and the local layer from ./.claude/settings.local.json under the "the-loop" modelBindings key; a missing settings file or missing key is an empty layer and the command still succeeds
      - an optional trailing defaults-file argument overrides the defaults path; a resolver rejection or unparseable settings JSON exits 1 with the offending role/layer or file named on stderr, and the usage string names models
      - test/spine-cli.test.js exercises the command as a subprocess against fixture directories — defaults only, a project override winning wholesale, a local override beating project, per-role provenance visible in the printed JSON, and a via-bearing fixture row appearing in the printed table untouched — without asserting the full shipped default table byte-for-byte
    injects: [model-binding]
    standards: [docs/standards/pure-core-thin-cli.md]
    footprint: [bin/spine.js, test/spine-cli.test.js]
    size: s
    tier: standard
    depends_on: [t2]
    report:
      result: built
      footprint_actual:
        - bin/spine.js
        - test/spine-cli.test.js
      diff_actual:
        files: 2
        insertions: 113
        deletions: 1
      deviations: []
      summary: "bin/spine.js gains the `models [defaults.json]` command: it resolves PLUGIN_ROOT from bin/spine.js's own file location (never cwd), reads plugin defaults from <plugin-root>/config/model-bindings.json (or the optional trailing override path), reads the project layer from ./.claude/settings.json and the local layer from ./.claude/settings.local.json (both against cwd) under the \"the-loop\".modelBindings key, merges them via src/models.js's resolveModels, and prints the resolved table as JSON via the CLI's existing out() helper. A missing settings file, or a present one missing the modelBindings key, is an empty layer and the command still succeeds; unparseable JSON in a present settings file, a missing/unparseable defaults file, or a resolver rejection all propagate through the CLI's existing top-level try/catch into fail(), exiting 1 with the offending file or role/layer named on stderr (verified: 'unparseable JSON in .claude/settings.json: ...' and 'role \"build\" in the default layer is missing a string \"model\" (got undefined)'). The usage string gains 'models [defaults.json]'. test/spine-cli.test.js adds three tests exercising the command as a subprocess against fixture directories: one proving resolution happens relative to bin/spine.js's own location (an empty fixture cwd with no config/ or .claude/ still resolves the real shipped 'plan' role) and that missing settings succeed; one proving the full merge story against a defaults-file override — defaults-only, a project override winning wholesale (dropping the default's effort field), a local override beating project, per-role provenance visible in the printed JSON at every step, and a via-bearing row (drive) riding untouched through every merge; and one proving a malformed defaults entry and unparseable project-settings JSON each exit 1 with the role/layer or file named on stderr, and that the usage string names 'models'. All three tests were watched red (command unrecognized / assertions failing) before the implementation landed, then green after. Full suite (node --test, 116 tests) and npm run check (spine plan/design check + eslint over the whole tree) are green."
  - id: t4
    title: tier in the plan spine — parse, validate, and resolve the decision-density field
    status: pending
    covers: [4]
    acceptance:
      - src/plan.js exports TASK_TIERS (rote|standard|complex), normalizeTask carries tier through when present and leaves it absent otherwise, and resolveTask's task slice includes a stamped tier
      - spine plan check raises error bad-tier for an out-of-enum tier value and warning missing-tier for an absent tier (naming the task either way), so a plan cut before this feature still parses and checks with warnings only
      - appendRemediation stamps tier standard on the round-marker task it appends, so a remediated plan re-checks without a missing-tier warning
      - TASK_TIERS is re-exported from the src/index.js barrel; test/plan.test.js proves the enum error, the absence warning, the pass-through into resolveTask, the round-marker's stamped tier, and that a fully tiered plan checks clean, all green under node --test
    injects: [task-contract]
    standards: [docs/standards/pure-core-thin-cli.md]
    footprint: [src/plan.js, src/index.js, test/plan.test.js]
    size: s
    tier: standard
    depends_on: [t2]
  - id: t5
    title: Workflow plumbing — args.models into every spawn's opts and label, tier routing, visible fallback
    status: pending
    covers: [2, 3, 4]
    acceptance:
      - every spawn in workflows/inner-loop.js resolves its pinned role (plan · build.<tier> from the task summary, standard when untiered · derive · validate) against args.models and passes model/effort opts per the pinned spawn-opts rule, with derive's hardcoded effort low removed — under the shim, a models fixture binding derive to opus/low shows both opts on the derive spawn, and a session-bound role shows no model opt
      - every spawn label carries the pinned [<resolved-model>] prefix, session when unbound — asserted under the shim for a bound build spawn and an unbound plan spawn
      - an unbound role and an untiered task each log() their pinned model-selection line exactly, and a run with args.models absent entirely still completes with fallback lines instead of errors — asserted under the shim
      - build spawns route through build.<tier> bindings — a shim fixture binding build.complex and build.standard to different models shows a complex-tier task summary spawning with the complex model and an untiered summary with the standard model; TASK_SUMMARY's schema describes tier so a plan return's stamped tier survives schema validation
      - all four inner-loop shim test files pass green with their fixtures updated, and workflows/inner-loop.js stays within its 350-line lint budget (npm run check green)
    injects: [model-binding, task-contract]
    standards: []
    footprint: [workflows/inner-loop.js, test/inner-loop-happy.test.js, test/inner-loop-park.test.js, test/inner-loop-halt.test.js, test/inner-loop-remediation.test.js]
    size: m
    tier: complex
    depends_on: [t1]
  - id: t6
    title: Launch leg — assemble args.models, carry tier in args.plans, relay fallback lines at the boundary
    status: pending
    covers: [2, 3]
    acceptance:
      - commands/the-loop.md step 3 assembles a models field from node "$CLAUDE_PLUGIN_ROOT/bin/spine.js" models verbatim, and its plans reduction becomes { id, status, depends_on, size, tier }
      - the result-relay step instructs scanning the run's log output (the Workflow surface the session reads) for lines prefixed model-selection and stating them to the human verbatim alongside the BoundaryResult, so an unbound-role fallback is visible at the run boundary
      - the file stays self-contained (no ADR or internal-doc references), verified by grep for "ADR" yielding no hits
    injects: [model-binding]
    standards: [docs/standards/loop-surfaces.md]
    footprint: [commands/the-loop.md]
    size: s
    tier: standard
    depends_on: [t3]
  - id: t7
    title: Plan agent surface — stamp tier on every task, resolve the audit spawn's model
    status: pending
    covers: [1, 4]
    acceptance:
      - agents/plan.md's step-6 template includes tier with a self-contained decision-density rubric (rote|standard|complex; rote additionally requires correctness fully captured by the task's tests + lint; unsure means standard; tier is not size), and its step-9 planned return's task summaries gain tier
      - the fresh-context-audit step instructs resolving the plan.audit role via node "$CLAUDE_PLUGIN_ROOT/bin/spine.js" models before spawning and carrying the resolved model in the audit spawn's title/label
      - the file stays self-contained (no ADR or internal-doc references), verified by grep for "ADR" yielding no hits
    injects: [task-contract, model-binding]
    standards: [docs/standards/loop-surfaces.md]
    footprint: [agents/plan.md]
    size: s
    tier: standard
    depends_on: [t3, t4]
  - id: t8
    title: Design skill surface — reader and alternative spawns resolve their bound models
    status: pending
    covers: [1]
    acceptance:
      - skills/design/SKILL.md instructs resolving design.alternative (the design-it-twice alternates) and design.reader (the reader test) via node "$CLAUDE_PLUGIN_ROOT/bin/spine.js" models, spawning each subagent on its resolved model with the model carried in the spawn's title/label, and notes that session-side spawns take a model only (a bound effort does not apply there)
      - the file stays self-contained (no ADR or internal-doc references), verified by grep for "ADR" yielding no hits
    injects: [model-binding]
    standards: [docs/standards/loop-surfaces.md]
    footprint: [skills/design/SKILL.md]
    size: xs
    tier: standard
    depends_on: [t3]
```
