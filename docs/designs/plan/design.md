# plan — Plan agent + workflow-path sizing

**Status:** designed (functional since v1; reshaped by the v2 taming — workflow
paths and contracts-only plans, ADR-0036/0038 — and not yet loop-validated in that
shape).

## What it is

The plan agent (agents/plan.md) turns one designed feature into runnable work. Its
first judgment is the **workflow path**:

- **small** — the whole feature fits one agent's context comfortably: return
  `{workflow_path: "small"}`, write nothing; one build agent takes the feature whole.
- **standard** — decompose into comfortably-small, file-disjoint task contracts,
  written to `docs/plans/<feature>/plan.md` **on the feature branch** (`loop/<id>`,
  committed `plan: <id>`; never merged to the target — the plan disappears when the
  feature's squash lands).
- **needs_refinement** — irreducible against its design doc: return re-slice
  options; a human decides at the boundary.

## Contract: task contract

```
{ id, title, covers: [1-based criterion index], acceptance,
  footprint: [path], size: xs|s|m, judgment_level: rote|standard|complex,
  depends_on: [task-id], wiring?: one sentence }
```

- Every feature criterion must be covered by some task (`the-loop plan check`).
- Overlapping footprints must be chained via `depends_on`; the inverse is the
  concurrency guarantee — unordered tasks are disjoint and run in parallel
  worktrees.
- `judgment_level` is about required judgment, not size; it selects the
  `build.<judgment_level>` model binding. `rote` additionally requires correctness
  fully captured by tests + lint.
- No `status`, no `report` fields: git carries task state (ADR-0034).

## Acceptance

- A feature decomposes into comfortably-small tasks, or is declared
  small-workflow-path whole; an irreducible feature needs re-slicing.
