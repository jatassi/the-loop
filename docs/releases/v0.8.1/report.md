# Release v0.8.1

- **Date:** 2026-07-26
- **Tag:** `v0.8.1` (`0c89f40`)
- **Outcome:** deployed — healthy
- **Rollback pointer:** `v0.8.0` (`1bc108a`)

Cut as a **patch** release at the human's call. The single feature is prose-only:
`git diff v0.8.0..main -- cli/ .github/` is empty, so the binary is behaviourally
identical to v0.8.0 and only its version string moves. cargo-dist still republishes all
five target archives, because the tag must match the crate version.

## Features released

- `agent-surface-trim` — Audit and targeted trim of agent-facing surfaces against the
  five context-engineering shifts (human-attended session).

No `fix-*` nodes in this release, so nothing was pruned from the graph.

## Ready checks

All at the pinned tip, re-run after the version bump:

| check | result |
|---|---|
| `npm test` | 179 pass / 0 fail |
| `npm run check` | `OK 49 features — 0 error(s)`; eslint silent |
| `cargo test` | 258 lib + 6 process pass / 0 fail |
| `cargo clippy --all-targets` | silent |
| `cargo fmt --check` | clean |
| `cargo test --features upgrade --test upgrade_fixture` (local) | 4 pass / 0 fail |
| `upgrade-windows` at the released tip | run `30220898833` — success |
| `Release` (cargo-dist) at `v0.8.1` | run `30220947036` — success |

Node test count fell 235 → 179. That is the feature, not a regression: the trim deleted
17 test files (−1558 lines) whose assertions pinned prose it removed, and added
`test/shipped-surface-self-containment.test.js` (+69) to guard the ADR-citation ban as a
policy invariant instead of a prose pin. Diff against `v0.8.0`: 39 files, +1074 / −1757.

## The AC5 waiver — the one thing to remember about this release

`agent-surface-trim` shipped with **one acceptance criterion undischarged**, waived
explicitly at the human gate.

AC5 reads: *given the trimmed surfaces on main, when `begin-version-handshake` is run
through the pipeline end-to-end, then plan, build, and validate all complete with
parseable reports and no block attributable to the trim.* That run did not happen —
`begin-version-handshake` is still `designed` at this cut. The validating commit
`ccda1b2` had recorded the intent to hold the record at `validated` until it ran; the
human lifted that hold at the gate and elected to ship.

**What the waiver costs.** Every check that *did* run against this feature is static —
greps and reading. AC5 was the only criterion designed to test the trim's premise
dynamically, by putting unattended agents through the trimmed surfaces and seeing
whether they still complete. So the residual risk is specific: a surface trimmed one
sentence too far, invisible to static review, surfacing as a plan/build/validate block
on the next unattended run.

**The standing check.** `begin-version-handshake` is the next eligible feature and its
pipeline run remains the discharge. The waiver defers AC5; it does not cancel it. On that
run, judge any plan/build/validate block against the trim before against the feature, and
append the outcome to `docs/validation/agent-surface-trim/procedure.md` §AC5.

`docs/validation/agent-surface-trim/procedure.md` was itself written at release time,
because the attended session waived the independent validate leg (the adjudication was
done with the human in-session). It records AC1 as attested-with-inventory-confirmed,
AC2/AC3/AC4/AC6 as replayed and passing, and AC5 as waived.

## Deploy

The marketplace chain ran verbatim from the runbook; `claude plugin update` reported
`0.8.0 → 0.8.1` at user scope. The health check exited 0 (installed version matches
`plugin/.claude-plugin/plugin.json`, plugin enabled, `details` resolves).

The binary leg published all five target archives, sha256 checksums, and both installers
as GitHub Release `v0.8.1`. Verified through the private-repo path (`gh release download`
+ a local `THE_LOOP_DOWNLOAD_URL` server, keeping the installer's own checksum
verification in the path); the installed binary reported `the-loop 0.8.1`. A clean
interactive shell resolves exactly one `the-loop` → `~/.cargo/bin/the-loop` → `0.8.1`, in
both zsh and bash.

## The PATH leak did not recur

Four releases running (v0.7.0, v0.8.0, and twice more on 2026-07-26) the verification
install left a stale `. "<throwaway>/env"` line in shell profiles, shadowing
`~/.cargo/bin`. `7d227cc` added the `THE_LOOP_NO_MODIFY_PATH=1` requirement to the
runbook before this release, and **it held**: `~/.zshrc`, `~/.profile`, and `~/.bashrc`
were checksummed before and after the verification install and all three were
byte-identical, with `grep -rl claude-501` over all four profile locations empty at the
end. First clean release on this axis.

Runbook correction folded in from this run: `THE_LOOP_INSTALL_DIR` names the install
*root* and the installer appends `bin` itself, so the runbook's `<throwaway>/bin` example
actually installed to `<throwaway>/bin/bin/the-loop`. Fixed in
`docs/architecture.md`.

## Known issue, not blocking — `the-loop list` drops `execution`

Surfaced while replaying AC6. The `execution` marker is on the record in
`docs/feature-graph.json`, but `the-loop list` reports it as absent:

```
docs/feature-graph.json → ['interactive']
the-loop list           → [None]
```

Root cause: `FeatureOut` in `cli/src/commands/graph.rs:268` has no `execution` field, so
the JSON projection behind `list` and `set-status`'s confirmation echo omits it — while
`emit`, the durable write path, handles it correctly (`graph.rs:304`, round-trip test at
`graph.rs:685`).

Scope, established empirically rather than assumed:

- **The durable graph is safe.** Running `set-status` on an unrelated feature in a scratch
  copy left the marker intact — verified before this release's own
  `set-status agent-surface-trim shipped`, which likewise preserved it.
- **`status --json` is correct** — `interactiveReady` reads the parsed struct, not the
  projection.
- **Bound stores are safe** — snapshots are materialized from the adapter and subcommands
  run against them via `--graph-path`, so no round-trip passes through the projection.
- **What breaks is a reader.** `list` is documented as "the parsed feature graph as JSON"
  and silently misreports one field. Observed live: at this release's gate, `list` showed
  no marker on `agent-surface-trim` and the raw file had to be opened to find it.

Pre-existing — it shipped with `interactive-feature-type` in v0.8.0, a producer-side miss
of the same shape `713f576` already caught once on this field. Nothing in the v0.8.1 diff
touches it. Wants a fix feature; not yet recorded in the graph.
