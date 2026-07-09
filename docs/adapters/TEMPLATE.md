# Adapter doc template — `docs/adapters/<surface>.md`

> **This is a template, not a live binding.** Capture-gate writers copy this
> shape into a new file named for the bound surface (e.g.
> `docs/adapters/<surface>.md`). Leave bracketed placeholders and instructional
> prose only until a real capture fills them in. Do not treat this file as
> documenting any binding for this repo.

## When this file exists

- **One file per nondefault binding.** A captured, nondefault artifact-store
  binding is one settings pointer plus one adapter doc at
  `docs/adapters/<surface>.md`, where `<surface>` is the artifact key being
  bound (e.g. `features`). That file is the adapter: documentation is the
  adapter; the agent is the runtime.
- **A default (local) project has zero files** under `docs/adapters/`. This
  home is pay-per-swap — the directory (and every file in it) appears only when
  a project opts into a nondefault external surface. Local-default projects
  never invent adapter docs for the in-repo store.

At capture, the configure interview writes the real
`docs/adapters/<surface>.md` from this template, then migrates truth in. At
unbind, export restores the local artifact and this file is removed with the
settings pointer. The launch leg and other consumers read the live
`<surface>.md` — not this template.

---

Every live adapter doc must contain the four sections below, each under a
heading named exactly so a reader (or a future automated check) can find it by
name. Fill the placeholders; keep the section titles.

---

## What lives here

> **Required.** Which project truth this surface holds, and the truth rule.

Record:

- **Artifact / truth** — what project truth is stored on this surface (records,
  edges, acceptance prose, statuses, …). Name the in-repo default it replaces
  when bound (e.g. the local graph file for features).
- **Truth rule (bound = sole truth)** — when this binding is active, **this
  surface is the sole truth** for that artifact. No mirror of the same truth
  elsewhere; no status-only / structure-elsewhere split-brain. The local
  artifact ceases to be authoritative (and may be retired after a verified
  import). Partial homes fork project truth — do not document them.

Placeholder sketch (replace with capture-time facts):

```text
This surface holds <artifact> for this project: <what counts as a record>,
<what counts as an edge>, <where acceptance / status live>.

Truth rule: while bound, this surface is sole truth for <artifact>. There is
no parallel local authority and no split of fields across stores.
```

---

## Access

> **Required.** How an agent reaches the surface.

Record:

- **Shape** — descriptive vocabulary only (not an enforced enum): e.g. MCP
  server name, CLI, file path, Skill, subagent, harness built-in. Bare HTTP
  may be described as CLI-shaped access if that is how agents call it.
- **Auth / workspace context** — credentials, account, workspace/team/project
  identifiers, env vars, or other capture-time facts an agent needs before any
  call succeeds. Prefer "where configured" over secrets in the doc.
- **Concrete calls or commands** — the exact invocations used for each
  operation listed under **Operations** (tool names, CLI flags, paths, query
  shapes). Access prose is the contract.

Placeholder sketch:

```text
Shape: <MCP | CLI | path | Skill | subagent | harness built-in — name it>
Auth / workspace: <how the agent authenticates; which workspace/team/project>
Calls:
  - <operation name>: <exact command or tool invocation>
  - …
```

---

## Operations

> **Required.** List every operation the agent may perform against this
> surface. Tag each **read** or **mutate** at recording time.

Use a stable list. Each entry should name the operation, the tag, and (if not
obvious from **Access**) the call used. Tags are fixed at capture — do not
leave them implied.

Placeholder sketch:

```text
- <operation-name> (**read**): <what it returns; call if not already under Access>
- <operation-name> (**mutate**): <what it changes; call if not already under Access>
```

Guidance:

- **read** — materialize / inspect truth without changing the surface (e.g.
  snapshot source for a run).
- **mutate** — write status, create/update/delete records, rewire edges, or
  any other change that must land on the bound surface first (truth ahead of
  any ephemeral cache).

---

## Caveats & gotchas

> **Required.** Operational knowledge the agent and human need after capture.
> Distinct from capture-time **trade-offs** (those are conversational at the
> configure interview and need not be re-recorded here).

Record at least:

- Rate limits, auth quirks, field-mapping surprises, idempotency notes,
  workspace isolation, and anything that has burned operators before.
- **Unbind / export path (required)** — how to migrate truth **back out** of
  this surface when the binding is removed: export sole truth to the restored
  local artifact (e.g. write a final snapshot committed as
  `docs/feature-graph.md` for a features unbind), remove the settings pointer
  and this adapter doc, and leave subsequent runs resolving the local default
  with a visible fallback. Unbinding is a migration, not a settings toggle.

Placeholder sketch:

```text
- <rate limits, auth quirks, mapping surprises, …>

Unbind / export path:
1. Export current surface truth to <local artifact path> (verify round-trip
   as needed).
2. Commit the restored local artifact.
3. Remove the artifactStores pointer for <surface> and delete this file.
4. Subsequent runs use the in-repo default with a visible fallback line.
```

---

## Checklist for capture-gate writers

Before finishing a live `docs/adapters/<surface>.md`:

1. File name is `docs/adapters/<surface>.md` for this nondefault binding only.
2. All four section headings are present and filled (not left as template
   instructional text alone).
3. **What lives here** states sole-truth / no mirror / no split-brain.
4. **Access** covers shape, auth/workspace, and concrete calls.
5. **Operations** tags every entry **read** or **mutate**.
6. **Caveats & gotchas** includes the unbind/export path.
7. The doc describes *this project's* binding with capture-time facts — not a
   copy of this template's meta-prose, and not a fictional or foreign binding
   pasted as if live.
