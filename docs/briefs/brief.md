# Brief — repo-wide naming redesign

## Intent

Every name in the-loop should tell an engineer who has never seen the project what
the named thing is for — from the name alone. Today the repo speaks in coined jargon
(`spine`, `BoundaryResult`, `inner loop`) that only its designer can decode, and that
vocabulary leaks into every agent response during dogfooding. This pass redesigns the
entire name system from a clean slate and pins a durable naming standard so the
jargon never regrows.

## Users

Jackson (sole dogfooder today); the uninitiated engineer is the design audience —
every name is judged through their eyes.

## Scope envelope

- **In:** every name below the brand tier, across the whole repo — CLI verbs, skill/
  agent/command names, dictionary terms, artifact and doc filenames, statuses, lanes,
  branch prefixes, feature ids, `src/`/`test/` module filenames, and every code
  identifier that carries a taxonomy term. Prose is rewritten wherever it touches a
  renamed term or itself coins jargon. The name inventory is taken from the repo
  state at the sweep's branch point, not from this Brief's date — features landing
  in between (e.g., diagnose: its skill, `fix node`, `fix-<slug>`, `docs/rca/`,
  "bug door" vocabulary) are automatically in scope.
- **Out:** the product name `the-loop` (brand tier — the one allowed non-descriptive
  name); historical records (ADRs, ship records, RCAs, research records, founding
  design docs) stay as-written; purely local code naming that carries no taxonomy
  term; general copy-editing of prose beyond the term-driven and jargon-driven
  rewrites.
- **Later:** nothing deliberately parked — this is a single sweeping pass.

## Decided

- **Deliverable = durable naming standard + repo-wide renames applying it.** A sweep
  without a rule decays; the pressure that produced the jargon (agents coining terms)
  is constant.
- **Clean-slate redesign, not spot-fixing.** Every name below the brand tier is
  re-derived from the taxonomy regardless of current quality — no grandfathering.
  Names are designed as coherent families (verb sets, artifact patterns, status
  progressions), not one-at-a-time. Churn is accepted as the cost of coherence.
- **Acceptance process: blind-outsider candidates, human final approval.** Fresh
  no-context agents — shown a name (or candidate) plus only its grammatical role —
  generate and filter candidate names; Jackson reviews each and gives final approval
  before any rename executes.
- **Authoring rule: compose from standard vocabulary.** Prefer the standard industry
  term when one exists; when none does, compose a self-explanatory name from standard
  words. Coined proper nouns are banned below the brand tier — this deliberately
  closes ADR-0037's documented-exception escape hatch.
- **Brand tier is explicit in the standard.** The product name may be metaphorical;
  everything beneath it must self-describe. `the-loop` stays.
- **History stays honest.** ADRs, ship records, RCAs, and the founding design docs
  keep their original vocabulary. The dictionary bridges: every renamed term keeps
  its old name as a `(historical)` alias, so old records resolve in one lookup.
- **Plain-speech clause, bounded.** The standard gains a second clause: loop-authored
  surfaces (skills, agent prompts, CLI/ledger output) phrase things in plain SDLC
  English. The sweep rewrites prose only where it touches renamed terms or coins
  jargon — not a general copy-edit.
- **Taxonomy terms propagate fully through code.** Module filenames are audited as
  navigational surfaces; every identifier carrying a taxonomy term is renamed
  mechanically. Old terms grep to zero on living surfaces. Local non-taxonomy naming
  is untouched.

## Deferred

- **Where the standard lives** (dictionary rules section, craft baseline, both) —
  Design decides placement.
- **Blind-outsider quiz mechanics** — how many fresh agents per name, what context
  format ("a CLI subcommand", "a file at docs/design/"), candidate-generation vs
  candidate-judging split — Design specifies the method.
- **Family grouping** — which families exist (verbs, artifacts, phases, statuses,
  roles) and their candidate patterns — the audit's first output, shaped in Design.
- **Feature decomposition** — whether standard + audit + sweep is one feature or
  several, and lane sizing — Design/Plan's call.

## Assumptions

- Sole user, no external consumers: plugin namespace internals, skill names, CLI
  verbs, and muscle memory can all change freely; no migration or deprecation period.
- No prior-art product to adopt: this is an internal rename, not a build-vs-buy
  question. Established naming guidance (standard-vocabulary preference, ubiquitous
  language practice) informs the standard but nothing external is being integrated.
- The existing dictionary alias mechanism (schema v2) is sufficient as the
  old-term bridge; no new tooling needed for the historical mapping.
- Nothing is in flight on the loop's own graph when the sweep executes — renaming
  feature ids and branch conventions collides with live runs, so the sweep runs
  against a quiet graph.

## Constraints

- All work isolated in a worktree branched off the `taming` tip — the main checkout
  is never touched.
- `npm run check` and the full test suite stay green through the sweep.
- Loop-surface authoring rules still bind: skills/commands stay self-contained, no
  ADR or internal-doc references on user-facing surfaces.
- Renamed dictionary entries must still clear the standard-terms ratchet — this pass
  sharpens the ratchet, it does not suspend it.

## Done looks like

- A durable naming standard exists on a living surface and contains: the brand-tier
  exemption, the standard-vocabulary authoring rule, the coined-proper-noun ban, the
  blind-outsider acceptance test, and the plain-speech clause.
- A complete name inventory below the brand tier exists, grouped into families, with
  every name re-derived through blind-outsider candidates and every final name
  human-approved.
- Old terms return zero matches on living surfaces; every renamed term carries a
  `(historical)` dictionary alias; historical records are untouched.
- A fresh no-context agent, shown each final name plus its grammatical role,
  correctly infers the named thing's purpose — across the whole inventory.
- The suite is green and the loop still runs end-to-end (orient → launch) under the
  new vocabulary.
