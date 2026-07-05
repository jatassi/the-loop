# system-map — System Map artifact

**Status:** designed (v1 intent carried forward; re-examine against ADR-0036 before
building).

The *as-built* reality artifact, complementing the design's *intended* contract:
per-module nodes with **git-hash fingerprints** for scoped freshness detection, and
a `realizes` cross-walk to design features (divergence = drift). Built features
update their map node + fingerprint in the same commit; stale nodes are detected
mechanically.

Design-time re-examination owed: v2's per-feature design docs already carry much of
the brownfield-context role this artifact was scoped for — build only what the
brownfield-comprehension feature demonstrably needs, and keep nodes fetchable in
slices (no whole-map reads).

## Acceptance

- Built features update their map node + fingerprint in the same commit; stale
  nodes are detected.
