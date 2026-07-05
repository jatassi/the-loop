# ledger-title-preservation — historical

**Status:** shipped (2026-07-04, the first self-hosted feature through the real
workflow); **superseded by ADR-0037** — the committed Ledger it patched no longer
exists.

It fixed the v1 `renderLedger` dropping `docs/ledger/ledger.md`'s leading title line
(content before the first `## ` heading). In v2 the ledger is rendered to stdout on
demand from the graph (`the-loop ledger`) and never written to disk, so the preserved-
sections machinery this feature patched was deleted wholesale. Kept in the graph as
shipped history.
