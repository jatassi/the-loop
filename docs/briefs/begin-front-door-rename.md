# Brief · begin-front-door-rename

## Intent

Rename the front door from `/the-loop` to `/begin`, and move it from the last
surviving `plugin/commands/` file into `plugin/skills/` like every other surface.
Two motivations, both the human's: kill the `/the-loop:the-loop` namespace stutter
(the plugin is named `the-loop`, so its front-door command doubles the name), and
land on a verb with the right semantic — you type `/begin` to begin a working
session, and the loop tells you where things stand and what's next.

## Users

Jackson — currently the only user. No external users; backward compatibility is
explicitly not a concern.

## Scope envelope

Task-sized. In scope:

- `plugin/commands/the-loop.md` → `plugin/skills/begin/SKILL.md` (rename **and**
  command→skill conversion; `plugin/commands/` retires entirely).
- Sweep of live surfaces and living docs that say `/the-loop`.
- A superseding note against ADR-0002 (which decided the `/the-loop` entry verb).

Out of scope:

- The plugin name (`"the-loop"` in plugin.json) — it is the product's identity and
  the namespace prefix on every skill; renaming it churns everything for no gain.
- The CLI binary `bin/the-loop.js` — machine surface, never typed by the human at
  the front door.
- Historical records (ADRs other than the 0002 note, release records, research/RCA
  docs) — they describe what was true when written; git is the archive.
- Any behavior change to the front door's content beyond frontmatter shape.

## Decided

- **New name is `begin`** — session-opener semantic ("begin a working session"),
  plus it removes the `/the-loop:the-loop` doubling. Fully-qualified form becomes
  `/the-loop:begin`.
- **Convert to a skill, not just rename the command.** Verified against current
  Claude Code docs: custom commands have been merged into skills — same slash
  invocation, and the `` !`<command>` `` dynamic-context preamble (the load-bearing
  `status --json` orientation injection) works identically in SKILL.md. The
  original reason to be a command no longer exists, and the front door is the only
  file left in `plugin/commands/`, so the conversion deletes a directory-level
  special case.
- **Front door stays model-invocable** — it already is today (it appears in the
  model's skill list); no `disable-model-invocation` frontmatter.
- **Reference sweep covers live surfaces only**: the four skill descriptions that
  say "when /the-loop routes to …" (define, design, diagnose, release),
  `configure-step-full.md`, the execution-pipeline skill's "Launched by /the-loop"
  description, and the living docs `architecture.md`, `glossary.md`,
  `feature-graph.md`. Historical records stay verbatim.
- **ADR-0002 gets a superseding note** — it explicitly decides "Entry surface = one
  stateful verb, `/the-loop`", so the rename and the command→skill merge that
  dissolved the constraint are recorded against it.
- **Clean cut, no alias/stub** for `/the-loop` — single user, no compat burden, and
  a tombstone skill is residue the minimalism frame refuses.

## Deferred

- **Form of the ADR-0002 note** — amendment block on 0002 itself vs. a new
  mini-ADR. Either is acceptable; Design/Build picks.
- **Exact SKILL.md frontmatter wording** — the description should carry the
  session-opener framing ("/begin states where the project stands…"); precise
  phrasing is authoring-time work under the write-skills pass.

## Assumptions

- `/begin` collides with no built-in command or bundled skill — verified true in
  the current environment (2026-07-08); assumed to stay true.
- No *programmatic* invocation of the command name exists (hooks, workflow
  scripts, tests, plugin manifest). The capture-time sweep found only prose
  references, but the builder re-verifies before landing.
- The installed Claude Code version supports `!` dynamic-context injection in
  SKILL.md (the commands→skills merge is live in the docs; the plugin already
  relies on current-version skill behavior elsewhere).

## Constraints

- Loop surface authoring rules apply: the skill must stay self-contained (no
  ADR/internal-doc references in its body) and gets a write-skills pass before
  landing.
- Content of the front door is otherwise frozen — this intake changes name, form
  factor, and references, not behavior.

## Done looks like

- Typing `/begin` invokes the front door: the orientation preamble executes and
  the machine-truth status JSON is injected before the instructions, exactly as
  `/the-loop` behaves today.
- `/the-loop` no longer resolves; `plugin/commands/` no longer exists.
- A repo-wide search for `/the-loop` (as a slash invocation) hits only historical
  records — no live skill description, surface body, or living doc.
- The front door still appears in the model's skill list (model-invocable).
- ADR-0002's decision trail records the rename.
