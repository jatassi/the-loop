# Brief — configure-step-full

## Intent

After configuration, the-loop knows how to hook into what it needs at every phase of
the flow. Today only model bindings have a real resolver; everything else the loop
needs — test commands, lint policy, runtime probes, deploy recipes, where artifacts
live, how to reach the human — is either inferred by convention, interviewed ad hoc
by Design, or simply absent. This intake makes the full hook inventory explicit,
interviewable, and persisted.

The interview revealed a fork the brief keeps whole:

- **Configure** — the settings-layer knob-turner (`/loop-config`): view, set, and
  change harness-native bindings (models, executors, test harness, notification,
  artifact stores, …) at any time.
- **Onboard** — a superset experience: configure *plus* populating the
  `docs/architecture.md` recorded bindings that Design would have written in a
  greenfield pass — the adoption path for existing codebases.

## Users

Jackson, and any human adopting the-loop on a project — greenfield or brownfield.

## Scope envelope

Feature-sized, but covering both halves of the fork in one brief; Design decides the
feature split (likely configure as a dependency of onboard, replacing the single
`configure-step-full` node — `ports-adapters-full`'s `depends_on` edge must follow
whatever node ends up owning binding capture).

**In:** the hook inventory and its semantics; the recommended-answer interview; the
layered persistence (including a new user-global layer); the brownfield
assess-and-fill flow; the migration to the harness's sanctioned plugin-config
mechanism; capturing artifact-store bindings.

**Out:** actually reading/writing external artifact stores (Confluence, Notion,
Linear, Jira …) — configure captures the binding; the adapters are
`ports-adapters-full` territory. Also out: changing Design's greenfield
recorded-binding interviews (they stay Design's).

## Decided

- **Binding-before-consumer posture.** The interview invites answers for every hook
  family, even where no code reads the binding yet. The binding's existence precedes
  its consumer.
- **Invocation: both surfaces.** A standalone `/loop-config` command, re-runnable
  anytime (show resolved bindings with provenance, change one, re-interview), *and*
  a configure leg in the front door's onboarding route.
- **Greenfield flow:** configure → Define → Design; Design keeps its recorded-binding
  interviews (validation runbook, release runbook, operations toolkit).
- **Brownfield flow:** configure → assess the repo's existing infrastructure
  (package.json scripts, CI config, deploy scripts, lint setup, hook systems…) and
  interview to fill the gaps — populating both settings bindings and the
  architecture.md recorded sections a greenfield Design pass would have written.
- **Layers: add user-global, infer scope.** Resolver order becomes plugin defaults <
  user-global (`~/.claude/settings.json`) < project (`.claude/settings.json`) < local
  (`.claude/settings.local.json`). The interview infers each binding's natural home
  (personal prefs → user/local; project truth → project), states where it's writing,
  and lets the human override the destination per answer.
- **Enforcement: fallback-or-block per hook.** Each hook declares its unbound
  behavior — visible fallback where a sane default exists (models → session, test
  harness → detected convention, interview → grilling, notification → chat-only),
  blocked-with-named-gap where none does (deploy recipe). The phase that needs the
  hook checks it as a precondition; "can't run" stays distinct from "ran and failed."
- **The hook inventory** (phase-keyed; Design may refine homes and fallbacks, the set
  and semantics are decided):
  - Define → interview skill (settings; fallback grilling).
  - Design → recorded-binding interviews stay Design's (architecture.md).
  - Plan/Build/Validate → model + effort + executor per role (settings; exists
    today) · **test harness**: commands + framework + conventions (settings,
    project scope; fallback: detected convention, visibly) · **linting**: lint
    commands + policy · **pre-commit hooks**: which hook system, and how agents
    honor it.
  - Validate → runtime probe = the validation runbook (architecture.md; unbound:
    recorded opt-out or blocked).
  - Release → release runbook (architecture.md; unbound: blocked — no guessed
    deploys).
  - Operate → operations toolkit (architecture.md, per the operate-tooling design).
  - Run boundary → **notification**: channel + when — how to reach the human (shell
    command, push mechanism, or chat-only) and which events warrant it (run end,
    blocked-only, gates). Fallback: chat-only.
  - Artifacts → **store binding per logical grouping** of docs/ artifacts (briefs,
    designs/architecture, feature graph/backlog, runbooks, RCAs, calibration …):
    default local for all, with named external systems allowed (designs → Confluence
    or Notion, features → Linear or Jira, …). Capture-only in this intake.
- **Test-harness binding content:** commands *and* framework identity *and*
  conventions (test layout, coverage expectations) — not just a command string.
- **Plugin-config migration: in scope.** Configure writes via the harness's
  sanctioned plugin-config mechanism (`userConfig`/`pluginConfigs`) where a real
  plugin installation exists, falling back to the namespaced `"the-loop"` settings
  key where it doesn't (this repo's symlink install). ADR-0030 rejected the
  sanctioned path *at the time* partly for enable-time-prompting UX and
  JSON-blob-in-a-string concerns — Design must re-verify the mechanism's current
  shape and resolve that tension.

## Deferred (named for Design)

- The feature split: one node or configure + onboard, and where the
  `ports-adapters-full` edge lands.
- Per-hook schemas and the config key layout under the namespaced key.
- Detection mechanics for the brownfield assess pass and for recommended answers
  (what's read, what's trusted, what's confirmed).
- How the front door knows configure has run / what "fully hooked" means for the
  status story (today's `detectState` is artifact-presence only).
- `/loop-config` command UX (naming included — the stub's name is not load-bearing).
- Whether linting policy captures the suppression/ratchet posture or just commands.

## Assumptions

- The harness tolerates the added user-global layer the same way it tolerates the
  project/local namespaced key (`additionalProperties: true` held as of ADR-0030;
  re-verify at Design).
- Prior art is already surveyed in-repo: the 2026-07-02 validate landscape survey's
  T1 (check commands defined by project config, validated as a precondition,
  BLOCKED ≠ FAIL) is the tablestakes pattern this feature adopts; no external
  product substitutes for an internal configure step.
- The operate-tooling design lands its `## Operations toolkit` recorded binding
  before or independently of this feature; this brief treats it as part of the
  inventory either way.

## Constraints

- Harness-native persistence only — settings layers and the sanctioned plugin-config
  mechanism; no parallel config system (ADR-0016/0030 posture).
- The existing model-binding resolver and its provenance semantics
  (`default | project | local | fallback`, extended with the user layer) are the
  pattern to extend, not replace.
- Recorded bindings remain design artifacts in `docs/architecture.md` — machine
  config never swallows design narrative.

## Done looks like

- On a fresh clone with no config, the front door's onboarding runs a configure leg
  before Define; every interview question carries a recommended answer.
- On an existing codebase, one onboard pass detects the repo's infrastructure,
  interviews only the gaps, and leaves both settings bindings and the
  architecture.md recorded sections populated or explicitly opted out.
- `/loop-config` run at any time shows every hook in the inventory with its resolved
  value, layer, and provenance, and can change any one of them.
- Every hook resolves at its consuming phase with visible provenance; an unbound
  hook either falls back visibly or blocks naming the gap, per its declared
  behavior — never silently.
- Bindings written on a real plugin installation land in the sanctioned
  plugin-config mechanism; on a symlink install they land in the namespaced
  settings key — both read back identically through one resolver.
- An artifact-store binding for each docs/ grouping is captured and readable, with
  local as the default everywhere.
