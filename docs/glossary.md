# the-loop — Glossary

The ubiquitous language for **the-loop**: the genuinely novel, load-bearing terms —
pinned so agents use them consistently instead of inventing synonyms. Trimmed to the
ratchet by the 2026-07-04 taming pass (ADR-0037): 91 entries → the set below;
everything else reverted to standard industry vocabulary.

## How this file works (schema v2)

Each entry is:

```
### Canonical Term
**aliases:** <comma list or —> · **status:** active
Prose definition — precise enough to check usage against.
*Not to be confused with:* [[Other Term]] — why they differ.   (optional)
*See:* ADR-00x / doc §y                                          (optional provenance)
```

**Rules (the naming standard, ADR-0044 — sharpening ADR-0037's ratchet):**
- **The outsider bar.** A name passes when an engineer who has never seen the-loop,
  shown the name plus only its grammatical role (a CLI subcommand, a status value,
  a file path), correctly infers what the named thing is for. This governs every
  name below the brand tier — terms, files, CLI verbs, statuses, identifiers — not
  just glossary entries.
- **Brand tier.** `the-loop` itself is the one allowed non-descriptive name.
  Nothing beneath it may lean on metaphor or brand.
- **Prefer standard industry terms.** Before adding any entry, ask: *does a
  standard industry term already name this?* If yes, use that term and add nothing
  — a model already knows what "blocked", "queue", or "test plan" mean, and every
  invented word forfeits that prior. When no standard term exists, compose a
  self-explanatory name from standard words. **Coined proper nouns are banned** —
  the documented-exception escape hatch is closed.
- **Name blind.** Generate candidate names from a jargon-free purpose line plus the
  family's sibling names — never by mutating an existing name, which anchors.
- **Plain speech.** Loop-authored surfaces (skills, prompts, CLI and status output)
  phrase things in plain SDLC English; a compliant noun doesn't license dense
  prose.
- **Use canonical terms verbatim.** A renamed term keeps its old name as a
  `(historical)` alias so records stay legible.
- Entries are fetched on demand — never assume an agent has read the whole file.

---

### the-loop
**aliases:** the loop · **status:** active
The system itself: an augmentation layer of native harness primitives (skills,
subagents, commands, a Workflow) that moves an idea through the full SDLC. Owned and
composable, not a standalone framework. Packaged as a Claude Code plugin, operating
on a [[target repository]].

### target repository
**aliases:** target repo (historical) · **status:** active
The repository the loop operates on and writes its artifacts into. Under
self-hosting (the-loop building itself) the target repository *is* the plugin repo
— one checkout carries both roles, directory-disjoint.

### execution pipeline
**aliases:** the engine, inner loop (historical) · **status:** active
The autonomous Plan → Build → Validate pass a Workflow runs once per run over the
scoped [[feature graph]], concurrent where dependencies allow, ending in a
[[run summary]]. Human judgment is front-loaded (Define/Design) and returns at run
boundaries. *See:* ADR-0034/0038.

### feature graph
**aliases:** the graph · **status:** active
The durable state machine (`docs/feature-graph.md`): feature records with the four
durable statuses — `proposed | designed | validated | shipped` — plus dependency
edges and acceptance criteria (optional only at `proposed`, the backlog stage).
Everything in-flight is derived from git at run start, never stored. *See:*
ADR-0034/0037/0045.

### the-loop CLI
**aliases:** spine (historical) · **status:** active
The one CLI over the loop (`bin/the-loop.js`): `status` (human summary by default,
`--json` for the machine orientation), feature-graph/plan parsing and checking,
status flips, the [[execution context]] assembler, worktree lifecycle, model/executor
resolution.

### execution context
**aliases:** the snapshot, launch snapshot (historical) · **status:** active
The single JSON `the-loop prepare-execution-context` assembles and gates —
per-feature design docs, plans read from feature branches, git-derived task state,
the model table, the validation-runbook binding — consumed by the Workflow as
`args`. The orchestrator pushes each worker's task brief out of it; workers fetch
nothing to start. *See:* ADR-0036.

### feature design doc
**aliases:** slice · **status:** active
`docs/designs/<id>/design.md` — one self-contained design doc per feature, written
for the stateless agent who wasn't in the room. It IS the context slice plan and
validate agents receive. *See:* ADR-0037.

### plan artifact
**aliases:** plan · **status:** active
`docs/plans/<id>/plan.md` — a feature's [[task contract]] list plus short wiring
notes, living **on the feature branch only**: committed by the plan agent, never
merged, gone when the feature's squash-merge lands. Carries no task status — git
does. *See:* ADR-0037.

### task contract
**aliases:** — · **status:** active
One task's complete spec inside a [[plan artifact]]: id, title, covered feature
criteria, its own acceptance, footprint (expected files — the concurrency and
overlap-ordering basis), size (xs|s|m), [[judgment level]], dependencies,
wiring note. The task brief a build agent's prompt carries.

### judgment level
**aliases:** decision-density tier (historical) · **status:** active
A task's routing stamp — `rote | standard | complex` — measuring how much the task
leaves the builder to *decide*, not its size. Selects the `build.<judgment_level>`
[[model binding]]; `rote` additionally requires correctness fully captured by the
task's tests + lint. *See:* ADR-0030.

### workflow path
**aliases:** lane (historical) · **status:** active
The pipeline shape a feature gets, chosen by the plan agent's sizing judgment:
**small** (whole feature = one build agent + one validate; no plan artifact),
**standard** (decomposition into task contracts), **bypass** (trivial maintenance
never enters the loop — a human or session just commits). *See:* ADR-0038.

### eligible set
**aliases:** frontier (historical) · **status:** active
The dependency-ready set: features still `designed` whose dependencies are all
`validated|shipped` — what the next-action proposal offers to run.

### runbook
**aliases:** probe pack (historical) · **status:** active
`docs/runbooks/<id>/runbook.md` — the pinned bring-up / exercise / expected-observations /
teardown steps a validator recorded while exercising a feature end-to-end. Replayed
only at Release (its one replay point); the seed of Operate. *See:* ADR-0035/0039.

### run summary
**aliases:** BoundaryResult (historical) · **status:** active
The execution pipeline's return value: `{completed, blocked, stalled, halted?, budget}`.
`blocked` entries are questions for the human at the boundary (reason + options);
`stalled` entries are agent/infra errors with nothing recorded (re-run retries);
`halted` means the run itself stopped (budget or environment). *See:* ADR-0034/0038.

### blocker type
**aliases:** feature-shaped / environment-shaped, block typing (historical) · **status:** active
The one distinction every failure return carries: **feature-shaped** — the work
itself needs a human decision (defective contract, failed criterion, semantic
conflict) → a `blocked` entry; **environment-shaped** — something around the work is
broken (tooling, auth) → the run halts. *See:* ADR-0029 lineage, ADR-0034.

### target branch
**aliases:** integration target (historical) · **status:** active
The ref validated features merge into — named explicitly at every run
(`--target-branch` is required): the branch development is on, unless the design
narrative names another. Validators publish to it by fast-forward from a dedicated
integration worktree, serialized. *See:* ADR-0026/0038.

### test-gated merge policy
**aliases:** compose-and-prove (historical) · **status:** active
The one merge posture at every merge point (sibling merge, integration merge,
publish-rebase): the merging agent may resolve a textual conflict only when it can
state both sides' intents and write a resolution serving both, proven by the merged
suite — both branches' tests ride the merged tree — going green. Can't compose it,
or tests stay red → semantic conflict → `blocked` naming the paths. Judgment does
the resolving; tests do the deciding. *See:* ADR-0042.

### model binding
**aliases:** — · **status:** active
`{ <role>: {model | "session", effort?, executor?} }` — the per-role model table
(plugin defaults < project < local), resolved with provenance by `the-loop
models-list`. `"session"` is an explicit inherit, distinct from the logged unbound
fallback. *See:* ADR-0030.

### executor playbook
**aliases:** — · **status:** active
`docs/executors/<id>.md` — a delegated CLI executor's registration: one machine
block (id, models, invocation template, availability) plus operational lore. The
[[drive]] consults it; `the-loop models-list` validates `executor` bindings against
it. *See:* ADR-0031/0040.

### drive
**aliases:** drive agent, driver (historical) · **status:** active
The thin build-path variant (agents/drive.md) that runs a delegated executor's CLI
inside the task worktree and verifies its work at the same bar as any build task —
the executor's self-report counts for nothing. *See:* ADR-0040.

### brief
**aliases:** Brief (historical) · **status:** active
Define's output (`docs/briefs/brief.md`): the sharpened statement of intent —
Decided / Deferred / Done-looks-like — sharp enough to design against.

### fix
**aliases:** fix node (historical) · **status:** active
An ordinary feature record born at a diagnose intake — id `fix-<slug>`,
regression-shaped acceptance, context slice at `docs/bugs/<bug-short-description>.md`
instead of `docs/designs/<id>/design.md` — and **transient**: pruned from the
[[feature graph]] in the release commit while its bug doc and release record remain.
Its regression check folds into the affected feature's [[runbook]], never a
standalone runbook. Passed the ratchet because no standard term ("hotfix", "bugfix")
names the transient-record-over-permanent-bug-doc lifecycle. *See:* ADR-0043.
