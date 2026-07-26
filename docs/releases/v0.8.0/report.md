# Release v0.8.0

- **Date:** 2026-07-26
- **Tag:** `v0.8.0` (`1bc108a`)
- **Outcome:** deployed — healthy
- **Rollback pointer:** `v0.7.0` (`4758549`)

## Features released

- `interactive-feature-type` — Execution-mode marker on feature records: human-attended
  features as first-class, excluded from autonomous runs.

No `fix-*` nodes in this release, so nothing was pruned from the graph.

## Ready checks

All at the pinned tip:

| check | result |
|---|---|
| `npm test` | 235 pass / 0 fail |
| `npm run check` | `OK 49 features — 0 error(s)`; eslint silent |
| `cargo test` | 258 lib + 6 process pass / 0 fail |
| `cargo clippy --all-targets` | silent |
| `cargo fmt --check` | clean |
| `cargo test --features upgrade --test upgrade_fixture` (local) | 4 pass / 0 fail |
| `upgrade-windows` workflow at the released tip | run `30218110393` — success |
| `Release` (cargo-dist) workflow at `v0.8.0` | run `30218111089` — success |

`docs/validation/interactive-feature-type/procedure.md` was replayed against the real
binary on a throwaway fixture. All six behavioural criteria (round-trip, enum,
the split, the false-repair trap, the two doors, the human render) plus criterion 9
(landing hygiene) reproduced the procedure's expected strings verbatim. Criteria 7–8
are prose-shaped: rather than re-running a fresh cold-read agent, the load-bearing
quoted invariants were confirmed present in the shipped skill files, backed by the
green `execution-mode-question.test.js` / `interactive-execution-skill.test.js` suites.

**Ready-check note:** `npm test` was red on the first run — the oracle's
`status — happy path --json` case failed against a `target/release/the-loop` built
before the feature's sources landed. The tip was never at fault; a rebuild turned the
suite green. This is the second consecutive release to hit the stale-binary trap
(see v0.7.0).

## Deploy

The marketplace chain ran verbatim from the runbook; `claude plugin update` reported
`0.7.0 → 0.8.0` at user scope. The health check exited 0 (installed version matches
`plugin/.claude-plugin/plugin.json`, plugin enabled, `details` resolves).

The binary leg published all five target archives, sha256 checksums, and both
installers as GitHub Release `v0.8.0`. Verified by installing from the real release
artifacts through the private-repo path (`gh release download` + local
`THE_LOOP_DOWNLOAD_URL` server, keeping the installer's own checksum verification in
the path); the installed binary reported `the-loop 0.8.0`.

## Operational lore — stale binaries on PATH, again

Verifying the binary leg surfaced a live defect the health check does not cover: the
`the-loop` that a shell actually resolved was **0.5.1**, four releases behind.

Two causes, both now fixed:

1. `~/.cargo/bin/the-loop` was still 0.7.0 — the marketplace chain deploys the *plugin*
   and never touches the binary, so the binary leg must install it deliberately.
2. A previous release's verification install had appended
   `. "…/scratchpad/instroot/env"` to `~/.zshrc` and `~/.profile`, putting a throwaway
   0.5.1 instroot **ahead of** `~/.cargo/bin` on PATH. The cargo-dist installer does
   this by default on every run, so each release verification leaves another stale
   shadow behind — this release's own verification run added one too.

Fix applied: the scratchpad `env` source lines were stripped from `~/.zshrc` and
`~/.profile` (backups at `~/.zshrc.bak-v0.8.0`, `~/.profile.bak-v0.8.0`; the
legitimate `. "$HOME/.cargo/env"` was left in place), and 0.8.0 was installed into the
real `$HOME/.cargo`. A clean interactive shell now resolves a single `the-loop` →
`~/.cargo/bin/the-loop` → `0.8.0`, with no shadowing.

**For the next release:** run the binary-leg verification install with a throwaway
`CARGO_HOME`, then delete the instroot *and* strip the `env` line the installer adds to
`~/.zshrc` and `~/.profile` — the installer writes those unconditionally. Finish by
installing the release into the real `$HOME/.cargo` and confirming
`env -i HOME=$HOME zsh -i -c 'which -a the-loop; the-loop --version'` shows exactly one
path at the new version. Note `zsh -l -c` is the wrong probe: it does not read
`.zshrc`, so it reports `command not found` even when an interactive shell is correct.

## Known issues, not blocking

Bare `ADR-NNNN` references remain in `plugin/agents/{record,validate,drive}.md` and
`plugin/skills/release/SKILL.md` — a shipped-surface self-containment defect. It is
pre-existing; this release's diff added none and in fact removed one. Worth a fix
feature.
