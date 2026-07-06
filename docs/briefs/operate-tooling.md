# Brief — operate-tooling: per-project ops toolkit + operate skill

## Intent

When something is wrong (or merely curious) in a non-local instance of a
loop-managed project, the human — assisted by an agent — needs to act: deploy,
read logs, query the database, flip feature flags. the-loop cannot prescribe what
that tooling is; project shapes vary too widely for anything beyond "you should
think about this." What it can do is make sure every project **records** its own
ops toolkit, and that an agent picking up an ops ask **routes onto the recorded
toolkit under invariant guardrails** instead of improvising against production.
Same shape as release, for the same reason: prescribe only the skeleton; the
project supplies the recipe.

## Users

Jackson (sole dogfooder today), as the operator of deployed instances of
loop-managed projects, with agents assisting. The uninitiated engineer remains
the audience for every name this feature touches.

## Scope envelope

- **In:** the Design-time binding interview additions and the recorded
  `## Operations toolkit` section; the thin `operate` runtime skill with its
  invariant guardrails; the lazy retrofit path; the-loop's own dogfood record;
  and the folded-in genre rename (operational runbooks claim `docs/runbooks/`
  and the unqualified term "runbook"; today's validation runbooks become
  **validation procedures**).
- **Out:** scheduled or autonomous operation of any kind; building or hosting
  observability infrastructure; incident-management/alerting features; the
  per-project toolkits themselves (each project records its own); enforcement
  mechanisms (guardrails are prescriptive routing — a direct human ask always
  trumps the skill's routing).
- **Later:** the survey's two "consider" items — harness enforcement backing the
  never-do list, and a one-line mutation preamble — are parked in Deferred for
  Design to take or leave.

## Decided

- **Shape = nudge + thin runtime skill.** Design records the binding; a runtime
  `operate` skill routes asks onto it. The runtime half exists because the
  durable operate-time value is routing + guardrails (AlphaMind's `operate-prod`
  evidence), and the guardrails are exactly the loop-invariant part — they
  belong in the plugin, not re-derived per project.
- **The binding = one `## Operations toolkit` section in architecture.md**,
  sibling to the existing recorded bindings, holding five ingredients:
  deployment target(s) and how agents reach them; per-capability toolkit entries
  (deploy, logs, DB, flags, …— how an agent actually does each, **each tagged
  read or mutate** — survey adoption: the field's most ubiquitous tablestake,
  fixed at recording time so the agent never judges safety at runtime); the
  bound observability solution and how it apprises the human; pointers to
  operational runbooks; and the project-specific never-do list. "None" is a recorded opt-out
  (matching the validation binding's pattern). The section is a sketch at Design
  time, expected to accrete operational lore.
- **Observability guidance = ask with a fitted recommendation; research on
  request only.** Design asks "how will you know something's wrong?" and
  proposes an answer fitted to the project's nature — "skip" is a legal
  recommendation for a toy. The agent's priors usually suffice; the survey
  port / web research runs only when the human asks for options. The loop never
  picks the stack. Survey adoption (Google SRE's alert↔playbook doctrine): when
  an apprisal path is recorded, nudge that each alert/channel name the runbook
  it routes to.
- **Action boundary = instance vs repo.** Four action classes: read-only ops
  (freely); mutating instance actions via the recorded toolkit (operate's
  domain — human in-session by construction, never-list constrains); repo
  changes (never operate's — a fix files a diagnose intake, keeping the RCA
  corpus fed); toolkit/runbook doc corrections (operate produces them itself —
  the self-correction duty, imported from AlphaMind). The boundary is
  prescriptive, not enforcement: the skill routes, it does not shackle.
- **Retrofit is lazy and self-serve.** Invoked in a project with no recorded
  toolkit, operate runs the same binding interview Design would have run,
  records the section, then proceeds with the ask. No graph surgery, no
  re-entering Design.
- **the-loop dogfoods it.** This repo records its own (near-trivial) section —
  deployed instance = the installed plugin, deploy = the marketplace chain,
  observability = the human notices — as first-consumer evidence.
- **The rename is folded in.** To an SRE-literate outsider "runbook" means the
  operational genre; the validation docs were the squatters. Operational
  runbooks take `docs/runbooks/<topic>.md` (default location, held loosely —
  the toolkit section's pointers are canonical, so projects with runbooks
  elsewhere just point). The validation genre becomes **validation procedure**:
  heading `## Validation procedure`, files `docs/validation/<feature-id>/procedure.md`,
  "runbook (validation sense)" kept as a historical dictionary alias per the
  naming standard. Blast radius sized: ~11 surface/code/test files, ~7
  architecture.md mentions, 5 existing directories — mechanical.
- **The skill is named `operate`** — completes the bare-verb skill family and
  passes the uninitiated-engineer test. The feature id stays `operate-tooling`.
- **Prior-art survey run at Define** (curiosity, low adoption expectation);
  findings and adopt/consider/reject calls recorded below before commit.

## Deferred

- **Section template.** The exact skeleton of `## Operations toolkit` (ordering,
  subheadings, how never-list entries are phrased) — Design's call.
- **Route-table shape.** How the operate skill's routing reads (AlphaMind uses a
  task→runbook table); Design decides the generic form.
- **Front-door mention.** Whether `/the-loop` surfaces a missing toolkit section
  as a proposed action. The skill-side retrofit is the load-bearing path; the
  front-door nudge is optional polish.
- **Rename execution plan.** File-by-file sequencing of the validation-procedure
  rename belongs to Plan.
- **Never-do enforcement backing (survey "consider").** Whether the toolkit
  section should suggest mirroring never-do items as `permissions.deny` rules or
  a PreToolUse hook — the field's verdict is that prose shapes but doesn't
  enforce; the cost is a second artifact to keep in sync, against the minimalism
  frame. Design decides.
- **Mutation preamble (survey "consider").** Whether operate states what it's
  about to run and why, in one line, before any mutating toolkit action
  (Vercel's scoped-plan shape). Near-zero cost; Design decides.
- **Operate-session backlink.** Whether a diagnose intake filed from operate
  links back to the operate session that raised it (Copilot's
  session-link-in-commit trick).

## Assumptions

- AlphaMind's `operate-prod` pattern (runbook routing, standing directives,
  never-list, self-correction duty) generalizes beyond its one project.
- ADR-0034's operating model stands: the loop is human-attended and on-demand;
  nothing here introduces scheduled or autonomous action.
- Design's binding interview can absorb a third recorded binding without
  restructuring.
- The rename blast radius is as sized above; no hidden coupling beyond the
  greppable references.

## Constraints

- The naming standard (ADR-0044): standard vocabulary only, self-describing
  names, historical aliases in the dictionary for renamed terms.
- Release's posture is untouched: one synchronous gate; operate adds no second
  deploy path — deploys route through the recorded toolkit/runbooks.
- `depends_on: [diagnose]` — the bug door must exist for the fix-files-an-intake
  boundary to route anywhere.
- Plugin form: skills/docs first; any code touched by the rename stays plain ESM
  JS, no build, node:test.

## Done looks like

1. A project going through Design gets the ops-toolkit and observability
   questions, with a recommendation fitted to the project's nature, and the
   answers land as a `## Operations toolkit` section (or a recorded opt-out).
2. Given an ops ask in a project with a recorded toolkit, operate routes onto
   the recorded entries/runbooks, reads before acting, and carries the invariant
   guardrails — instance actions via the toolkit allowed; repo changes exit to a
   diagnose intake; observed doc-drift corrected in-session.
3. Invoked where no section exists, operate runs the binding interview first,
   records the section, then handles the ask.
4. the-loop's own architecture.md carries its (near-trivial) section.
5. The skill text names no particular deployment target, observability product,
   or toolchain — prescription-light, measurably.
6. The rename landed: unqualified "runbook" means the operational genre
   everywhere; validation procedures live at `docs/validation/<feature-id>/procedure.md`
   under `## Validation procedure`; the historical alias is recorded; no loop
   surface still uses "runbook" in the validation sense.

## Prior art (survey)

Full cited report: `docs/research/2026-07-05-operate-landscape-survey.md`
(four-lane landscape survey — agentic SDLC tools, AIOps/incident copilots,
runbook-automation practice, ChatOps lineage — with a ~25-quote verification
pass). What it settled:

- **The shape is confirmed, not an outlier.** A prose/markdown ops surface is
  the converging agent-facing norm (Datadog `bits.md`, Resolve MD, prose-runbook
  ingestion everywhere); every verified shipped mechanism gates mutation behind
  a human; nobody hotfixes the repo in place. Our skeleton matches the field's
  stable middle.
- **Unclaimed ground we occupy:** recording the ops surface at *design time*
  inside the SDLC artifact; the design-time "how will you know it's broken?"
  question; read-the-runbook-before-acting; same-session drift correction; a
  per-project user-authored never-do list (unattested as a product feature
  anywhere in the field).
- **Adopted (2):** the read/mutate tag per toolkit entry (the survey's most
  ubiquitous tablestake, one word of cost per entry); the alert↔runbook binding
  nudge in the observability question (Google SRE doctrine). Both folded into
  Decided above.
- **Considered (2), parked in Deferred:** harness-enforcement backing for the
  never-do list ("permission rules are enforced by Claude Code, not by the
  model" — an argument native to our substrate); a one-line mutation preamble.
- **Rejected (3):** scheduled/autonomous operation (the field's marketing
  outruns its shipped gating; two vendors walked autonomy back); structured
  job/action registries (the pre-LLM lineage — LLM-era systems converged back
  to prose for agent-facing knowledge); a separate operate audit log (thirteen
  years of ChatOps treat the transcript as the audit trail).
