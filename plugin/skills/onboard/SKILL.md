---
name: onboard
description: Onboard a project into the-loop — run the configure leg, detect greenfield vs brownfield from the tree, and hand off to Define then Design so the project lands fully hooked. Use when adopting the loop on a new or existing repo, or when /begin routes to onboard.
---

# Onboard — configure's superset: the adoption path

Onboard is the experience that leaves a project fully hooked: configure's settings pass
*plus* the `docs/architecture.md` recorded bindings the project needs to run
autonomously. It runs the configure leg, branches by scenario, and hands off to Define →
Design. `/begin onboard` jumps straight here.

"Fully hooked" is never a stored marker — it is what `hooks-list` reports when asked.
Onboard produces settings and `docs/architecture.md` sections; the feature graph stays
Design's output. No graph surgery happens here.

## 1 · Detect the scenario — from the tree, no bespoke marker

Read the working tree to decide which flow this is. There is no bespoke onboarding
marker and nothing is stored to remember the choice: the scenario is derived fresh from
what the tree holds each pass.

- **Greenfield** — an empty or near-empty repo with no loop artifacts (no
  `docs/architecture.md`, no `docs/feature-graph.md`, little or no source). Run the
  greenfield route below.
- **Brownfield** — a repo that already carries code and tests but no loop artifacts. Run
  the configure leg, then assess-and-fill the existing infrastructure and the recorded
  bindings before handing off. Run the brownfield route below.

## 2 · Greenfield route — configure leg, then Define → Design

On a fresh repo the order is fixed: **the configure leg runs first, before any handoff
to Define.**

1. **Run the configure leg.** Invoke the `configure` skill — it prints the resolved hook
   inventory with `node "${CLAUDE_PLUGIN_ROOT}/bin/the-loop.js" hooks-list` and interviews
   for the environment and personal hooks (interview skill, models, notification,
   artifact stores). This is a recommended-answer interview: **every configure question
   carries a recommended answer**, so the human can accept the default with a nod and
   only deliberate where they disagree. Nothing is written to a settings layer without
   the human's confirmation.
2. **Hand off to Define.** Once the configure leg settles, run the `define` skill:
   brain-dump → brief. Only after the configure leg is done does Define begin.
3. **Hand off to Design.** With the brief in hand, run the `design` skill for the system
   narrative, the feature graph, and the per-feature design docs. If a brief already
   exists, resume directly at Design.

Design keeps its recorded-binding interviews. The settings-side project hooks that only
exist once a stack is chosen (test harness, lint, pre-commit) are captured by Design when
it decides the stack — including the lint-policy elicitation, recommending stricter per
stack and landing it in the project's real lint config.

The through-line: on a fresh empty repo, onboarding runs the configure leg before Define,
every configure question carrying a recommended answer, and the project comes out the far
side fully hooked.

## 3 · Brownfield route — configure leg, then assess-and-fill

A brownfield repo already carries evidence of how it is built, tested, and shipped.
Onboarding must not re-ask what the tree already answers. Run the configure leg first
(exactly as the greenfield route does — the environment and personal hooks, every question
carrying a recommended answer), then **assess-and-fill**: read the existing infrastructure,
interview only the gaps, and record the bindings — every write human-confirmed.

### 3.1 · Detect the existing infrastructure

Survey the tree for the five evidence classes before asking anything. Whatever the tree
already answers is not a question:

- **Task runners** — `package.json` scripts (and equivalents: `Makefile`, `justfile`,
  `pyproject.toml`, `Cargo.toml`), especially the `test`, `lint`, and build targets.
- **CI workflows** — `.github/workflows/*`, `.gitlab-ci.yml`, and the like. What CI runs
  is strong evidence for the verification bar; read the steps.
- **Hook systems** — `husky`, `.husky/`, `.pre-commit-config.yaml`, `lefthook`, or git
  hooks already wired.
- **Deploy machinery** — `Dockerfile`(s), deploy scripts, release workflows, publish
  targets, infrastructure manifests.
- **Observability config** — logging, metrics, tracing, or error-reporting setup.

Interview **only the gaps** the detection leaves open. Where the evidence is decisive,
carry it forward as the recommended answer rather than posing an open question.

### 3.2 · Recommend-and-confirm the settings-side hooks

Propose the settings-side project hooks — **test harness, lint, pre-commit** — from the
evidence gathered in 3.1, then confirm each write with the human. Detection is never
trusted silently: a `package.json` `test` script is a *recommendation* for the test
harness hook, not an adoption; a discovered `.pre-commit-config.yaml` or `husky` install
is a recommendation for the pre-commit hook; the lint target (and its strictness) is a
recommendation for the lint hook. **Every write is human-confirmed** — the human accepts,
adjusts, or declines each proposed hook before it lands in a settings layer. Confirm the
resolved inventory afterward with
`node "${CLAUDE_PLUGIN_ROOT}/bin/the-loop.js" hooks-list`.

### 3.3 · Fill the three recorded-binding sections

Write the recorded bindings into `docs/architecture.md` under the exact section headings
the tree uses today — `## Validation procedure`, `## Release runbook`, and
`## Operations toolkit` — from evidence plus interview. Detected commands (the CI test
step, the deploy chain, the observability wiring) are the recommended fill; the human
confirms each. `none` is a legal per-section opt-out: a section may be recorded as `none`
when the project genuinely has no such binding, and that opt-out is itself recorded rather
than left blank.

If `docs/architecture.md` does not yet exist, **stage a skeletal file** carrying just these
three sections (plus their fills or `none` opt-outs). Its surrounding narrative — the
system story, boundaries, and cross-feature contracts — is left for Design to complete; the
skeleton reserves the headings so Design's binding interviews become confirm-or-fill
wherever a section already exists rather than re-asking.

### 3.4 · Hand off to Define then Design, grounded in the existing code

With the hooks confirmed and the bindings recorded, hand off — **Define first, then
Design** — grounded in the code that's there. Define turns the existing system and its
intended direction into a brief; Design writes the system narrative and the feature graph
over the real code, quoting real interfaces rather than imagined shapes and completing any
architecture.md skeleton this route staged.

Onboarding does **no graph surgery**: it produces settings and `docs/architecture.md`
sections only. The feature graph stays Design's output.
