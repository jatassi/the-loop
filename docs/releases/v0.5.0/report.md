# Release v0.5.0 — 2026-07-11

- **Tag:** `v0.5.0` (bump commit `caf9643`, the released tip)
- **Features shipped:** using-the-loop-skill
- **Also released:** default `validate` model binding flipped to agent-routed
  `opus` (was `grok/grok-4.5`) in `cli/config/model-bindings.json`, with this
  repo's project layer carrying the same binding since before the release.
- **Outcome:** deployed — the plugin now bundles `using-the-loop`, the
  progressive-disclosure root that orients ordinary dev sessions in consumer
  projects (tier-0 description always injected, tier-1 body on trigger, tier-2 =
  CLI live oracle + the project's own artifacts). Marketplace update
  0.4.13 → 0.5.0 healthy; binaries published by the tag-triggered cargo-dist
  workflow and `the-loop 0.5.0` verified installed from the release (isolated
  install and the PATH binary both). Validation procedure replayed at the
  pinned tip: fixture CLI exercise green, feature suite 6/6, fixtures torn down
  (plus two orphaned probe dirs swept).
- **Operational notes:** the known cli unit-test flake surfaced once during
  verify-ready (`worktree` process test, temp-fixture `index.lock` race) and
  passed on re-run — same diagnose-intake candidate noted at v0.4.13. The
  minor-version bump marks the first post-replatform feature release.
- **Rollback:** previous tag `v0.4.13`; plugin rollback per runbook.
