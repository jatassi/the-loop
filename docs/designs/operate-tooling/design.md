# operate-tooling — recorded ops toolkit + operate skill + runbook-genre rename

**Status:** designed 2026-07-08 from `docs/briefs/operate-tooling.md` (Define
2026-07-05; landscape survey `docs/research/2026-07-05-operate-landscape-survey.md`).

Two deliverables and a folded-in rename. (1) The Design-time **recorded binding**:
a `## Operations toolkit` section in the target project's `docs/architecture.md`,
sibling to the validation and release bindings, recording how this project's
deployed instances are operated. (2) A thin runtime **`operate` skill** that routes
on-demand ops asks onto that recorded toolkit under loop-invariant guardrails. (3)
The **runbook-genre rename**: operational runbooks claim `docs/runbooks/` and the
unqualified word "runbook"; today's validation-sense runbooks become **validation
procedures** at `docs/validation/<feature-id>/procedure.md`.

The loop prescribes only the skeleton; the project supplies the recipe — the same
shape as Release, for the same reason. Nothing here is scheduled or autonomous:
ADR-0034's operating model stands (human-attended, on-demand), and Release keeps
its one-synchronous-gate posture — operate adds no second deploy path; deploys
route through the recorded toolkit/runbooks.

## The recorded binding: `## Operations toolkit`

One section in `docs/architecture.md`, under that exact heading, holding five
ingredients. A sketch at Design time, expected to accrete operational lore.
Whole-section `none` is a recorded opt-out (matching the validation binding's
pattern — legal for a project with no operated instance); each ingredient may
also individually record `none`.

Template (the skeleton the design-skill interview and the operate retrofit both
write; ordering fixed, phrasing free):

```markdown
## Operations toolkit

Deployment targets: <where instances run and how agents reach them>

Capabilities — each entry tagged read or mutate at recording time, so the agent
never judges safety at runtime:
- <capability> (read|mutate): <how an agent actually does it>
  # deploy, logs, DB, flags, … — whatever this project has

Observability: <the bound solution and how it apprises the human; each recorded
alert/apprisal path names the runbook it routes to; "the human notices" is legal>

Runbooks: <pointers to operational runbooks — default docs/runbooks/<topic>.md,
held loosely; a project keeping runbooks elsewhere just points>

Never do:
- <project-specific prohibitions, phrased as concrete commands/actions>

Consider mirroring never-do entries as `permissions.deny` rules or a PreToolUse
hook — permission rules are enforced by the harness, not the model. The section
suggests this; the operate skill never manages the rules.
```

The **read/mutate tag** is the survey's most ubiquitous tablestake (fixed per
action at registration, never decided by the model at runtime) and gives the
skill a crisp rule for which entries can be routed without pause.

### The design-skill interview additions

`skills/design/SKILL.md` gains the third recorded binding: the interview asks the
ops-toolkit questions and **"how will you know something's wrong?"**, proposing an
answer fitted to the project's nature — "skip" is a legal recommendation for a
toy. The agent's priors usually suffice; web research runs only when the human
asks for options. The loop never picks the observability stack. When an apprisal
path is recorded, nudge that each alert/channel name the runbook it routes to
(Google SRE's alert↔playbook doctrine). The skill's artifact list grows from "two
recorded bindings" to three.

## The operate skill

`skills/operate/SKILL.md` — completes the bare-verb skill family (define, design,
diagnose, release, operate). Thin: the durable value is routing + guardrails, and
the guardrails are exactly the loop-invariant part, so they live in the plugin and
are never re-derived per project.

**Route-table shape (deferred item, resolved):** no separate registry. The
toolkit's capability entries and runbook pointers ARE the route table —
command-is-documentation, the ChatOps lesson. The skill reads the section and
matches the ask against it.

Flow:

1. **Read the recorded section.** Absent → the **lazy retrofit**: run the same
   binding interview Design would have run, record the section, then proceed with
   the original ask. No graph surgery, no re-entering Design.
2. **Classify the ask** against the action boundary (below) and route it onto the
   matching capability entries / runbook pointers.
3. **Read any routed runbook fully before acting** — never act from the ask alone
   when a runbook is pointed at.
4. **Mutation preamble:** before any mutating toolkit action, state in one line
   what is about to run and why. Only entries tagged `mutate` may mutate; the
   never-do list constrains everything.
5. **Self-correction duty:** toolkit/runbook doc drift observed against instance
   reality is corrected in the same session.

**The action boundary — instance vs repo, four classes:**

| class | rule |
|---|---|
| read-only ops | freely, via recorded `read` entries |
| mutating instance actions | operate's domain — via recorded `mutate` entries only; human in-session by construction; never-do list constrains; preamble precedes |
| repo changes | never operate's — a fix files a **diagnose intake naming the originating operate session** (the backlink: link or date+summary, so the RCA doc inherits the operational evidence trail) |
| toolkit/runbook doc corrections | operate produces them itself — the self-correction duty, the one repo write carved out of "repo changes never" |

The boundary is **prescriptive routing, not enforcement** — a direct human ask
always trumps the skill's routing. No audit machinery: the session transcript is
the audit trail (thirteen years of ChatOps precedent).

**Prescription-light bar:** the skill text names no particular deployment target,
observability product, or vendor toolchain — measurably (greps clean for product
names).

**Front door (deferred item, resolved):** no `/begin` change. The skill-side
retrofit is the load-bearing path; `src/propose-next-action.js` is untouched.

## The rename

To an SRE-literate outsider, "runbook" means the operational genre; the validation
docs were the squatters (naming law, ADR-0044). Mapping:

- **Heading**: `## Validation runbook` → `## Validation procedure` in
  `docs/architecture.md`. `## Release runbook` stays — it already names the
  operational genre.
- **Files**: `docs/runbooks/<id>/runbook.md` → `docs/validation/<id>/procedure.md`,
  content-identical moves. **Re-list the set from the live tree at build time —
  never trust a frozen count.** Every `docs/runbooks/<id>/runbook.md` present when
  the rename builds is a validation-sense record and must move; features validating
  concurrently (or after this design was written) keep adding more — as of 2026-07-09
  the set is eleven, not the seven this doc first enumerated (the added four:
  begin-front-door-rename, plugin-dir-restructure, configure, role-agent-binding).
  `docs/runbooks/<topic>.md` is thereby freed for operational runbooks.
- **Glossary**: the `runbook` entry is redefined to the operational genre; a new
  `validation procedure` entry carries `runbook (validation sense)` as a
  historical alias and inherits the pre-sweep alias already on today's `runbook`
  entry.

Blast radius (enumerated 2026-07-08 from the live tree — the heading string is a
**data+code pair** and must land atomically):

- `bin/cli-commands.js:188` — `sectionAfter(…, '## Validation runbook')`, the one
  code read of the heading, plus its warn text on 189.
- `bin/create-sample-repo.js` — seeds fixture repos with both headings (line 52)
  and validation-runbook comments.
- Tests seeding/asserting the heading: `test/cli.test.js:90`,
  `test/parse-feature-graph.test.js:71,83`, `test/proposed-status.test.js:34`,
  `test/prepare-execution-context-script-out.test.js:77`; path/vocabulary
  assertions in `test/design-docs-and-runbooks.test.js` (path constants, the
  swept-term list) and `test/skills-and-command-sweep.test.js:114,134`.
- Prose/agent surfaces in the validation sense: `agents/validate.md:31-33` (writes
  the procedure file), `skills/release/SKILL.md` (replays them — its replay path
  becomes `docs/validation/<id>/procedure.md`), `skills/design/SKILL.md` (binding
  heading), `skills/diagnose/SKILL.md:99` (the `## Runbook` capture field —
  becomes the affected feature's validation procedure),
  `workflows/execution-pipeline.js:179` (log line),
  `src/prepare-execution-context.js:85` + `src/replace-fenced-block.js:52-55`
  (comments), `README.md:31,49`, `docs/architecture.md` (artifact table + contract
  list + validation section), living `docs/designs/*/design.md` mentions, and
  feature-graph acceptance strings (living surface — swept, per the rename-sweep
  precedent).
- **Excluded, byte-untouched**: historical records (`docs/adr/`,
  `docs/research/`, `docs/briefs/`, `docs/releases/`, `docs/bugs/`) and the
  **pinned eval corpus** (`eval/` — fixtures/oracles replay historical repo
  states in their tip's vocabulary; sweeping them would break replay).

Sweep bar, inherited from rename-sweep: every living surface updated; the
validation sense of "runbook" greps to zero outside the exclusions; `npm test`
and `npm run check` green on the landed tree. File-by-file sequencing is Plan's.
The runbook file move-set is re-derived by listing `docs/runbooks/` at build time
(dynamic, not the count this doc first enumerated) — this is the criterion the
first two build attempts missed (14 validation-sense records live as of 2026-07-09,
incl. configure/, role-agent-binding/, calibration-capture/, onboard/,
ports-adapters-full/).

**Mandatory completeness regression test (both prior attempts passed a green suite
while incomplete — this closes that gap).** Plan MUST include a test that, at test
time, dynamically re-lists `docs/runbooks/*/runbook.md` and **fails unless the set
is empty**, and greps the living surfaces (everything outside the historical-record
and `eval/` exclusions — including `plugin/skills/`, `plugin/agents/`, living
`docs/designs/*/design.md`, `README.md`, and the feature graph) and **fails on any
remaining validation-sense `runbook`/`docs/runbooks` reference**. The test re-lists
and re-greps rather than pinning a frozen file list, so a future stray old-path
record or unswept surface fails it. This test is part of the sweep task's footprint;
a green `npm test` then genuinely evidences the rename's completeness.

## Dogfood

This repo's own section is recorded in `docs/architecture.md` at this design
(first-consumer evidence, near-trivial by design): deployed instance = the
installed plugin, deploy/rollback = the Release runbook's recorded chains,
observability = the human notices.

## Deferred-item resolutions (from the brief)

- Section template → this doc's skeleton. Route table → the entries are the
  registry. Front-door mention → skipped (minimalism; retrofit is load-bearing).
- Never-do enforcement backing → a suggestion line in the template; the skill
  never manages permission rules (human call, 2026-07-08).
- Mutation preamble → adopted. Operate-session backlink → adopted as a nudge.
- Rename execution plan → Plan's.

## Constraints for builder and validator

- Plugin form: skills/docs first; code touched by the rename stays plain ESM JS,
  no build step, `node:test`.
- `depends_on: [diagnose]` — the fix-files-an-intake boundary needs the bug door.
- Release posture untouched: one synchronous gate, no second deploy path.
- Naming law (ADR-0044): standard vocabulary, historical aliases for renamed
  terms, historical records never rewritten.
