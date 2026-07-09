---
status: accepted
date: 2026-07-08
---

# ADR-0049 · Configure: the phase-keyed hook inventory, a user-global settings layer, and the sanctioned plugin-config path re-rejected

**Context.** The `configure-step-full` backlog node reached Design (brief
2026-07-08, `docs/briefs/configure-step-full.md`). The intent, sharpened at
Define: after configuration, the-loop knows how to hook into what it needs at
every phase — and the intake forked into **configure** (a re-runnable
settings-layer knob-turner) and **onboard** (its superset: configure plus the
brownfield assess-and-fill of the recorded bindings a greenfield Design pass
would have written). ADR-0030 had left a migration note — "once real plugin
installation exists (configure-step-full territory), the sanctioned
`userConfig`/`pluginConfigs` path is the target" — and Define put that migration
in scope. Harness facts re-verified against the docs 2026-07-08:
`pluginConfigs` option types are a small scalar enum (string/number/boolean/
directory/file, `multiple` string arrays) — no nested objects, no arbitrary
JSON; values are set only through harness-driven UI (enable-time prompt, the
`/plugin` → Configure options action); there is **no programmatic write path**
for a running skill; and unknown top-level settings keys draw a `/doctor`
"unrecognized fields" warning while continuing to work. Resolved by grilling,
2026-07-08.

**Decision.**

- **A phase-keyed hook inventory.** The loop's integration points are an
  explicit, enumerated inventory — per phase, what must be bound, its home
  channel, and its unbound behavior. Two home channels, deliberately kept:
  machine config lives in **settings layers** under the namespaced `"the-loop"`
  key (interview skill, model bindings, test harness, lint commands, pre-commit
  posture, notification, artifact stores); project truth with narrative weight
  stays a **recorded binding in `docs/architecture.md`** (validation procedure,
  release runbook, operations toolkit — Design's artifacts, untouched here).
- **Fallback-or-block, declared per hook.** Every hook declares its unbound
  behavior: a visible provenance-stamped fallback where a sane default exists
  (models → session, interview → grilling, test harness → detected convention,
  notification → chat-only), blocked-with-named-gap where none does (deploy
  recipe). The consuming phase checks its hooks as a precondition — "can't run"
  stays distinct from "ran and failed."
- **A fourth settings layer: user-global.** The resolver order becomes plugin
  defaults < user (`~/.claude/settings.json`) < project (`.claude/settings.json`)
  < local (`.claude/settings.local.json`), whole-entry replacement per key,
  provenance gaining a `user` stamp. The interview infers each answer's natural
  home (personal prefs → user/local; project truth → project), says where it is
  writing, and takes a per-answer override.
- **The sanctioned plugin-config path is re-rejected, with fresh facts.** All
  bindings persist under the namespaced `"the-loop"` key. The `userConfig`/
  `pluginConfigs` mechanism cannot carry this feature: the type enum cannot hold
  a binding table without JSON-blob-in-a-string (the exact shape ADR-0030
  rejected), and a recommended-answer interview cannot write values the harness
  only accepts through its own UI prompts. The `/doctor` unrecognized-fields
  warning is accepted and documented as the cost. Revisit if the harness grows
  structured option types or a programmatic write path.
- **Capture precedes consumption.** The interview invites answers for every
  hook family even where no code reads the binding yet (artifact stores:
  designs → Confluence/Notion, features → Linear/Jira, local default
  everywhere). Capture-only here; the adapters are `ports-adapters-full`, whose
  dependency edge moves to `configure`.
- **Lint policy is real config, not metadata.** The lint hook binds commands
  only. The Design phase gains a lint-policy elicitation for target projects —
  recommending on the stricter side per stack — and lands the policy in the
  project's actual lint configuration, never as a parallel policy blob.

**Why.** The hook inventory makes the loop's last implicit dependencies
explicit and checkable, extending the posture that made model bindings work:
provenance-stamped resolution, visible fallbacks, never silent. One namespaced
key the interview can actually write beats a sanctioned mechanism it can't —
harness-native means the harness's files, not necessarily the harness's UI.
Splitting configure from onboard keeps the knob-turner independently
shippable while the adoption experience builds on it.

**Considered and rejected.** Migrating to `userConfig`/`pluginConfigs` now
(scalar-only types, no programmatic write — re-verified 2026-07-08); a hybrid
(scalar knobs in `userConfig`, tables in the namespaced key — two UXes and
split provenance for no consumer benefit); blob-in-string options (unwritable
by the interview, miserable to hand-edit); a configure-completeness hard gate
on the front door (hostile to incremental adoption — fallback-or-block per
hook covers it); machine config swallowing the recorded bindings (design
narrative doesn't belong in settings files); a separate `/loop-config` command
(the bare-verb skill family + a front-door jump is the established surface).
