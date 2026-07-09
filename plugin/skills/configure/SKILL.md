---
name: configure
description: Review and set the-loop's configuration — the resolved hook inventory (interview skill, test harness, lint, pre-commit, notification, artifact stores, model bindings) and persist answers to a settings layer. Use when the user wants to configure or change the loop's settings, see what's currently bound, or /begin routes to configure.
---

# Configure — the hook inventory and the recommended-answer interview

The settings knob-turner. It shows every hook in the inventory with its resolved
value, layer, and provenance; interviews for anything the human wants to set or
change, one recommended answer per question; and persists each answer to a settings
layer under the namespaced `"the-loop"` key. Re-runnable at any time — a no-op pass
just prints the resolved table and stops.

Two channels hold configuration. Settings layers hold machine config; configure owns
that side and persists to it only on the human's confirmation. `docs/architecture.md`
holds the recorded bindings (validation runbook, release runbook, operations toolkit) —
project truth with narrative weight that Design and onboard own. Configure *reports* the
recorded side (present / absent / opted-out) but never writes it.

## 1 · Print the resolved table — always first, and the whole no-op pass

Run the inventory and show it before anything else:

!`node "${CLAUDE_PLUGIN_ROOT}/bin/the-loop.js" hooks-list`

Relay it in plain prose: every settings family with its resolved value, the layer it
came from, and its provenance (`default | user | project | local | fallback`), plus the
recorded bindings' `present | absent | opted-out` status. An unbound fallback family
shows its visible fallback line; an unbound block family shows the named gap.

If the human only wanted to see where things stand, this is the whole run — stop here.
Otherwise ask what they want to set or change, and interview only those.

## 2 · Interview — detect, recommend, confirm

Recommended-answer posture throughout. For each hook the human wants to touch:

1. **Detect** from the repo — read `package.json` scripts, lockfiles, CI workflows,
   lint configs, and `husky` / `.pre-commit-config` — and produce a *recommendation
   only*. Detection never writes anything.
2. **Recommend** the detected answer, and name its **inferred destination layer**:
   a personal preference infers `user` (or `local` for this-checkout-only); project
   truth the whole team should share infers `project`. State the inferred layer with
   every recommendation, and offer a **per-answer override** — the human can send any
   answer to a different layer than the one inferred.
3. **Confirm.** Nothing is written until the human confirms. Persist a confirmed answer
   with one surgical write per family — unrelated keys in the target settings file
   survive untouched:

   `node "${CLAUDE_PLUGIN_ROOT}/bin/the-loop.js" hooks-set <family> <layer> <json-value>`

   Write **only on confirmation**, one family at a time. After the writes, re-run
   `hooks-list` so the human sees each new value with its updated layer and provenance.

The settings families and the shape each takes:

- **interview** — `{ "skill": "grilling" }`. The interview skill Define and other
  interviewing surfaces load.
- **testHarness** — `{ "commands": { "test": "npm test" }, "framework": "…",
  "notes": "…" }`. Commands plus free-text conventions.
- **lint** — `{ "commands": ["npm run check"] }`. Commands only; the policy itself lives
  in the project's real lint config.
- **precommit** — `{ "system": "none | husky | pre-commit | …",
  "posture": "run-before-commit | rely-on-hook" }`.
- **notification** — `{ "channel": "chat | push | <shell command>",
  "events": ["run-end", "blocked", "gate"] }` (see the note below).
- **artifactStores** — one value per docs grouping (`briefs`, `designs`, `features`,
  `runbooks`, `rcas`, `calibration`), each `local` by default (see the note below).
- **modelBindings** — the per-role model table (unchanged; roles are its entries).

## 3 · Notification — the loop's binding versus the harness-native knobs

The loop's own `notification` binding is what its surfaces consult when relaying run
boundaries and gates — set it through `hooks-set` like any other family. The harness
also ships its own notification knobs that partly cover the same ground —
`preferredNotifChannel`, push-notification settings, and `Notification` hooks. Those are
the human's own harness settings; point them at those knobs, and write them
**only at the human's request** — never fold them into a confirmed loop binding yourself.

## 4 · Artifact stores — capture-only

Capture an artifact-store answer per docs grouping, `local` as the default. A non-local
value takes the shape `{ "system": "notion | confluence | linear | jira | …",
…locator fields }`. These bindings are **capture-only**: the loop still reads and writes
local `docs/` for every phase until the ports-and-adapters work lands the adapters. Record
the human's intent now; it resolves back through `hooks-list` for whoever wires the
adapter later.
