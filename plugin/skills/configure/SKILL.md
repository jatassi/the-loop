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
holds the recorded bindings (validation procedure, release runbook, operations toolkit) —
project truth with narrative weight that Design and onboard own. Configure *reports* the
recorded side (present / absent / opted-out) but never writes it.

## 1 · Print the resolved table — always first, and the whole no-op pass

Run the inventory and show it before anything else:

!`the-loop hooks-list`

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

   `the-loop hooks-set <family> <layer> <json-value>`

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
- **worktreeSetup** — `{ "command": "npm ci", "timeout": 600000 }`. The project-supplied
  shell command that `the-loop worktree-create` runs in a freshly checked-out worktree
  to provision it. Detect from the repo (lockfiles and package manifests below), recommend
  a command, and confirm-or-adjust like every other family. The inferred destination
  layer is **project** (install commands are project truth); the standard per-answer
  override applies.

### worktreeSetup detection

Scan the repo root for stack evidence and recommend a command. **First match wins
within JS** (ni-style lockfile precedence). Leave the family unbound when nothing is
classifiable or the only match is venv-ambiguous.

| evidence | recommended command |
|---|---|
| `bun.lockb` or `bun.lock` | `bun install` |
| `pnpm-lock.yaml` | `pnpm install --frozen-lockfile` |
| `yarn.lock` | `yarn install --frozen-lockfile` |
| `package-lock.json` | `npm ci` |
| `package.json`, no lockfile | `npm install` |
| `Cargo.toml` | `cargo fetch` |
| `uv.lock` | `uv sync` |
| `poetry.lock` | `poetry install` |
| `go.mod` | `go mod download` |
| bare `requirements.txt` | leave unbound (venv-ambiguous — no safe recommendation) |
| nothing classifiable | leave unbound |

**Polyglot rule.** When more than one non-JS stack (or a JS stack plus another) is
detected, recommend **one command per detected stack**, joined with ` && ` in the table
order above. Example: a repo with both `package-lock.json` and `Cargo.toml` recommends
`npm ci && cargo fetch`. Rows that leave the family unbound never contribute a command
to the join.

## 3 · Notification — the loop's binding versus the harness-native knobs

The loop's own `notification` binding is what its surfaces consult when relaying run
boundaries and gates — set it through `hooks-set` like any other family. The harness
also ships its own notification knobs that partly cover the same ground —
`preferredNotifChannel`, push-notification settings, and `Notification` hooks. Those are
the human's own harness settings; point them at those knobs, and write them
**only at the human's request** — never fold them into a confirmed loop binding yourself.

## 4 · Artifact stores — the capture gate

Capture an artifact-store answer per docs grouping, `local` as the default. A nondefault
value takes the shape `{ "system": "notion | confluence | linear | jira | …",
…locator fields }`, and binds that surface as **sole truth** for its grouping — the loop
reads and writes it through a documented adapter, not local `docs/`.

The `local` default is a plain capture — confirm it and persist like any other family. A
**nondefault** binding is a swap, and swaps go through the gate below. Never fold these
steps into a single silent write.

1. **Surface the trade-offs, then get explicit acceptance.** Before proceeding, state in
   plain prose what binding this surface forfeits versus the in-repo default — e.g.
   `features → Linear` gives up git-versioned history, offline greppability, and
   atomic-with-code commits. Acceptance is the gate: do not proceed until the human
   explicitly accepts the trade-offs. If they decline, leave the grouping `local`.
2. **Run a reachability probe before any write.** Whatever the shape implies — MCP server
   connected, CLI on PATH, the target path readable/writable. On a failed probe, surface
   it and offer **fix-now** (the human repairs auth/connectivity, then re-probe) or
   **bind-anyway** (record the binding knowing it is currently unreachable). Never a
   silent write on failure, and never a hard block — the human always chooses.
3. **Write the adapter doc and the settings pointer.** Write `docs/adapters/<surface>.md`
   describing how an agent reaches the surface (shape, auth/workspace, the concrete
   read/mutate calls), then persist the settings pointer under `"the-loop".artifactStores`
   with `hooks-set` on confirmation, exactly like every other family.
4. **Migrate truth in — after offering a backup.** Where the surface replaces an existing
   local artifact, push the current local truth into the bound surface via its documented
   access and verify the round-trip. Before the local artifact is retired, **offer a
   backup**: a pre-swap git tag marking the last local-truth commit (the default), or a
   stamped copy if the human prefers one. Only once the backup is placed and the human
   confirms is the local file retired; the migration import is human-confirmed like every
   configure write.

Each captured nondefault binding resolves back through `hooks-list`, and its adapter doc
is the contract the run's launch leg follows to reach the surface.
