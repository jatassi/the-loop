# onboard — configure's superset: the adoption path, greenfield and brownfield

**Status:** designed 2026-07-08 from `docs/briefs/configure-step-full.md` (ADR-0049;
replaces the `configure-step-full` backlog node together with `configure`).

Onboard is the experience that leaves a project fully hooked: configure's settings
pass *plus* the `docs/architecture.md` recorded bindings a greenfield Design pass
would have written. It is a `skills/onboard/SKILL.md` (bare-verb family) that the
front door's onboarding route runs; `/the-loop onboard` jumps straight to it.

## The two flows

The skill detects the scenario — no bespoke marker, just the tree:

- **Greenfield** (empty or near-empty repo, no loop artifacts): run the configure
  leg (environment and personal hooks — interview skill, models, notification,
  artifact stores), then hand off to Define → Design exactly as today. Design keeps
  its recorded-binding interviews and, for the settings-side project hooks that
  only exist once a stack is chosen (test harness, lint, pre-commit), Design
  captures them when it decides the stack — including the lint-policy elicitation
  (recommend stricter per stack, land it in the project's real lint config;
  ADR-0049).
- **Brownfield** (a repo with code but no loop artifacts): configure leg first,
  then **assess-and-fill** — detect the existing infrastructure and interview only
  the gaps:
  1. **Detect**: package.json scripts / task runners (test, lint), CI workflows
     (what CI runs is strong evidence for the verification bar), hook systems
     (husky, .pre-commit-config), deploy machinery (Dockerfiles, deploy scripts,
     release workflows), observability config.
  2. **Recommend-and-confirm**: propose the settings-side hooks (test harness,
     lint, pre-commit) from the evidence; the human confirms each write — detection
     is never trusted silently.
  3. **Fill the recorded bindings**: write the `## Validation procedure`,
     `## Release runbook`, and `## Operations toolkit` sections from evidence +
     interview, `none` as a recorded opt-out per section — the same lazy-retrofit
     pattern the operate skill uses when its section is missing. If
     `docs/architecture.md` doesn't exist yet, the sections are staged in a
     skeletal file whose narrative Design later completes; Design's binding
     interviews become confirm-or-fill wherever a section already exists.
  4. Hand off to Define → Design for the narrative and feature graph, grounded in
     the code that's there.

## Front door

`commands/the-loop.md`'s `onboard` route changes from "define skill, then design
skill" to "the onboard skill" (which runs configure, branches by scenario, and
hands off). `/the-loop onboard` and `/the-loop configure` join the jump list.
`src/propose-next-action.js` (`detectState`) is untouched — mode stays
artifact-derived; "fully hooked" is never a stored marker, it is what `hooks-list`
reports when asked (derive-don't-mark, the repo's standing posture).

## Interfaces touched

- `skills/onboard/SKILL.md` — new.
- `commands/the-loop.md` — onboard route text + jump list.
- `skills/design/SKILL.md` — binding interviews become confirm-or-fill when a
  section exists; gains the lint-policy elicitation and the stack-time capture of
  settings-side project hooks.
- Reads configure's resolver/CLI (`hooks-list`) — the dependency edge.

## Constraints

- Recorded-binding section headings and templates are the existing ones
  (`## Validation procedure` per the operate-tooling rename — if that feature
  hasn't landed first, the heading follows whatever the tree says at build time;
  the operate-tooling blast-radius sweep owns the rename).
- Assess-and-fill writes are all human-confirmed; no silent adoption of detected
  values.
- No graph surgery during onboarding: onboard produces settings + architecture.md
  sections; the feature graph remains Design's output.

## Acceptance (mirrors the graph)

- On a fresh empty repo, the front door's onboarding runs the configure leg before
  Define, every question carrying a recommended answer.
- On a brownfield fixture repo (code + tests + CI, no loop artifacts), one onboard
  pass detects the infrastructure, interviews only the gaps, and leaves both the
  settings-side hooks and the three recorded-binding sections populated or
  explicitly opted out.
- Design's binding interviews confirm-or-fill instead of re-asking when onboard
  already recorded a section.
