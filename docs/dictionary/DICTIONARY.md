# the-loop — Project Dictionary

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

**Rules:**
- **Prefer standard industry terms.** Before adding any entry, ask: *does a standard
  industry term already name this?* If yes, use that term and add nothing — a model
  already knows what "blocked", "queue", or "test plan" mean, and every invented word
  forfeits that prior. A made-up term is a documented exception that must name what
  the standard term fails to capture. (ADR-0037's ratchet.)
- **Use canonical terms verbatim**; register a new proper noun here only when it
  clears the ratchet.
- Entries are fetched on demand — never assume an agent has read the whole file.

---

### the-loop
**aliases:** the loop · **status:** active
The system itself: an augmentation layer of native harness primitives (skills,
subagents, commands, a Workflow) that moves an idea through the full SDLC. Owned and
composable, not a standalone framework. Packaged as a Claude Code plugin, operating
on a [[target repo]].

### target repo
**aliases:** — · **status:** active
The repository the loop operates on and writes its artifacts into. Under
self-hosting (the-loop building itself) the target repo *is* the plugin repo — one
checkout carries both roles, directory-disjoint.

### inner loop
**aliases:** the engine · **status:** active
The autonomous Plan → Build → Validate pass a Workflow runs once per launch over the
scoped [[feature graph]], concurrent where dependencies allow, ending in a
[[BoundaryResult]]. Human judgment is front-loaded (Frame/Design) and returns at run
boundaries. *See:* ADR-0034/0038.

### feature graph
**aliases:** the graph · **status:** active
The durable state machine (`docs/design/graph.md`): feature nodes with the three
durable statuses — `designed | validated | shipped` — plus dependency edges and
acceptance criteria. Everything in-flight is derived from git at launch, never
stored. *See:* ADR-0034/0037.

### the-loop CLI
**aliases:** spine (historical) · **status:** active
The one CLI over the loop (`bin/the-loop.js`): orientation, graph/plan parsing and
checking, status flips, the [[launch snapshot]] assembler, worktree lifecycle, the
on-demand status story (`the-loop ledger`), model/executor resolution.

### launch snapshot
**aliases:** the snapshot · **status:** active
The single JSON `the-loop launch` assembles and gates — per-feature design docs, plans
read from feature branches, git-derived task state, the model table, the probe
binding — consumed by the Workflow as `args`. The orchestrator pushes each worker's
kernel out of it; workers fetch nothing to start. *See:* ADR-0036.

### feature design doc
**aliases:** slice · **status:** active
`docs/design/features/<id>.md` — one self-contained design doc per feature, written
for the stateless agent who wasn't in the room. It IS the context slice plan and
validate agents receive. *See:* ADR-0037.

### plan artifact
**aliases:** plan · **status:** active
`docs/plans/<id>.md` — a feature's [[task contract]] list plus short wiring notes,
living **on the feature branch only**: committed by the plan agent, never merged,
gone when the feature's squash-merge lands. Carries no task status — git does.
*See:* ADR-0037.

### task contract
**aliases:** — · **status:** active
One task's complete spec inside a [[plan artifact]]: id, title, covered feature
criteria, its own acceptance, footprint (expected files — the concurrency and
overlap-ordering basis), size (xs|s|m), [[decision-density tier]], dependencies,
wiring note. The kernel a build agent's prompt carries.

### decision-density tier
**aliases:** tier · **status:** active
A task's routing stamp — `rote | standard | complex` — measuring how much the task
leaves the builder to *decide*, not its size. Selects the `build.<tier>`
[[model binding]]; `rote` additionally requires correctness fully captured by the
task's tests + lint. *See:* ADR-0030.

### lane
**aliases:** — · **status:** active
The pipeline shape a feature gets, chosen by the plan agent's sizing judgment:
**small** (whole feature = one build agent + one validate; no plan artifact),
**standard** (decomposition into task contracts), **bypass** (trivial maintenance
never enters the loop — a human or session just commits). *See:* ADR-0038.

### frontier
**aliases:** — · **status:** active
The dependency-ready set: features still `designed` whose dependencies are all
`validated|shipped`. What `advance-frontier` proposes to run.

### probe pack
**aliases:** — · **status:** active
`docs/probes/<id>.md` — the pinned bring-up / exercise / expected-observations /
teardown steps a validator recorded while exercising a feature end-to-end. Replayed
only at Ship (its one replay point); the seed of Operate. *See:* ADR-0035/0039.

### BoundaryResult
**aliases:** — · **status:** active
The inner loop's return value: `{completed, blocked, stalled, halted?, budget}`.
`blocked` entries are questions for the human at the boundary (reason + options);
`stalled` entries are agent/infra errors with nothing recorded (re-run retries);
`halted` means the run itself stopped (budget or environment). *See:* ADR-0034/0038.

### block typing
**aliases:** feature-shaped / environment-shaped · **status:** active
The one distinction every failure return carries: **feature-shaped** — the work
itself needs a human decision (defective contract, failed criterion, semantic
conflict) → a `blocked` entry; **environment-shaped** — something around the work is
broken (tooling, auth) → the run halts. *See:* ADR-0029 lineage, ADR-0034.

### integration target
**aliases:** target · **status:** active
The ref validated features merge into — named explicitly at every launch
(`--target` is required): the branch development is on, unless the design
narrative names another. Validators publish to it by fast-forward from a
dedicated integration worktree, serialized. *See:* ADR-0026/0038.

### compose-and-prove
**aliases:** — · **status:** active
The one merge posture at every merge point (sibling merge, integration merge,
publish-rebase): the merging agent may resolve a textual conflict only when it can
state both sides' intents and write a resolution serving both, proven by the merged
suite — both branches' tests ride the merged tree — going green. Can't compose it,
or tests stay red → semantic conflict → `blocked` naming the paths. Judgment does
the resolving; tests do the deciding. *See:* ADR-0042.

### model binding
**aliases:** — · **status:** active
`{ <role>: {model | "session", effort?, via?} }` — the per-role model table
(plugin defaults < project < local), resolved with provenance by `the-loop models`.
`"session"` is an explicit inherit, distinct from the logged unbound fallback.
*See:* ADR-0030.

### executor playbook
**aliases:** — · **status:** active
`executors/<id>.md` — a delegated CLI executor's registration: one machine block
(id, models, invocation template, availability) plus operational lore. The
[[driver]] consults it; `the-loop models` validates `via` bindings against it.
*See:* ADR-0031/0040.

### driver
**aliases:** drive agent · **status:** active
The thin build-path variant (agents/drive.md) that runs a delegated executor's CLI
inside the task worktree and verifies its work at the same bar as any build task —
the executor's self-report counts for nothing. *See:* ADR-0040.

### Brief
**aliases:** — · **status:** active
Frame's output (`docs/briefs/brief.md`): the sharpened statement of intent —
Decided / Deferred / Done-looks-like — sharp enough to design against.

### fix node
**aliases:** — · **status:** active
An ordinary feature node born at a diagnose intake — id `fix-<slug>`,
regression-shaped acceptance, context slice at `docs/rca/fix-<slug>.md` instead of
`features/` — and **transient**: pruned from the [[feature graph]] in the ship
commit while its RCA doc and the ship record remain. Its regression probe folds
into the affected feature's [[probe pack]], never a standalone pack. Passed the
ratchet because no standard term ("hotfix", "bugfix") names the
transient-node-over-permanent-RCA lifecycle. *See:* ADR-0043.
