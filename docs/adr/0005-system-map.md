---
status: superseded by ADR-0041
date: 2026-06-29
---

# ADR-0005 · System Map: per-module nodes, git-hash freshness, and a `realizes` cross-walk to the Design

**Context.** The System Map is the as-built twin of the Design artifact (intended vs. as-built; their divergence is [[drift]]). It must be cheap to keep fresh — comprehension is the expensive operation it exists to amortize — and must cross-walk to the Design so drift is computable, without assuming the as-built module structure matches the design's feature decomposition.

**Decision.**
- **Form:** `system-map.md` (→ `system-map/` past the same ~1k split), hybrid format, addressed by `id` through the same resolver as the Design (ADR-0004 generalizes to it).
- **Nodes = as-built modules/components.** Default granularity is **per-module/component, configurable** coarser (per-subsystem) or finer (per-file) by project complexity and taste. Each node carries: `id`, what it is, its real interfaces, the code paths it covers, a `realizes` reference, and a `fingerprint`.
- **Freshness = git content hash.** Each node's `fingerprint` is the git tree/blob hash of its code paths. At intake (and Plan time) the session recomputes and compares; a mismatch marks the node **stale** and triggers **scoped re-comprehension of just that node** — never a whole-codebase re-read.
- **Self-maintenance:** on the normal path the loop updates the touched node + fingerprint as it builds (same commit as the code), so the map moves with the code; outside/hand edits are caught by the next intake's fingerprint check.
- **Cross-walk = reference, not identity.** Each node's `realizes` lists the Design feature id(s) it implements (many-to-many). Drift for a feature = compare the as-built interfaces of the nodes that realize it against that feature's intended contracts. Forced id-equality is rejected because module-decomposition ≠ feature-decomposition at possibly-different granularities.

**Why git hashes.** Git already content-addresses every file; a stored per-node hash gives exact, cheap, localized staleness with zero new machinery (anti-NIH). Localized staleness is what makes brownfield comprehension "demand-driven, cached" rather than a full re-read.

**Considered and rejected.** A bespoke content-hash or mtime scheme (reinvents what git gives free; mtime is unreliable across clones); whole-map staleness (forces full re-comprehension on any change); an id-equality cross-walk (assumes as-built mirrors the design's decomposition).
