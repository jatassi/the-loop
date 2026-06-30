---
status: accepted
date: 2026-06-29
---

# ADR-0021 · All loop-produced documents live in a named directory under docs/

**Context.** Early artifacts landed at the repo root (`design.md`, `ledger.md`, `DICTIONARY.md`) while ADRs lived in `docs/adr/`. The layout was inconsistent, and single-file artifacts had no home that anticipated growth.

**Decision.** **Every document the loop produces lives in a named directory under `docs/`, even when it is currently a single file.** For this repo:

```
docs/
├── adr/          (ADRs)
├── decisions/    (design decisions — the sharpened brief)
├── design/       (design.md)
├── dictionary/   (DICTIONARY.md)
├── intent/       (design intent)
└── ledger/       (ledger.md)
```

Future artifacts follow suit: `docs/system-map/`, `docs/research/`, `docs/escalations/`, `docs/calibration/`.

**Why.** Uniform structure (one rule, no exceptions) and — crucially — **forward-compatibility with the split layout (ADR-0003)**: the named directory *is* where a single-file artifact's split files land when it grows past ~1k lines (`docs/design/design.md` → `docs/design/design.md` + `docs/design/features.yaml`). A single file in its own directory isn't redundant; it's the directory pre-created for its own future.

**Refines.** The bare-filename locations stated in ADR-0003 (`design.md`), ADR-0005 (`system-map.md`), ADR-0006 (`ledger.md`), and ADR-0009 (`escalations/`) — each now lives under `docs/<name>/`.

**Considered and rejected.** Root-level single files (inconsistent with `docs/adr/`; no split home); a flat `docs/` with loose files (the split layout would then sprawl into the `docs/` root).
