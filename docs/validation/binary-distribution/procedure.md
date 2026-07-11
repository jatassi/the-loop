# Validation procedure — binary-distribution

Judge-only validation against target `rust-replatform` on worktree
`integrate--binary-distribution` (merged `loop/binary-distribution`, no
conflicts — clean `--no-ff` merge). No source edits, commits, or hook status
flips by the judging executor; the driving agent performed the merge, the
mechanical gate, and the landing steps.

## Bring-up

From repo root (this worktree):

```bash
which dist || brew install cargo-dist   # 0.32.0, matching dist-workspace.toml's pin
```

`cargo-dist` was not preinstalled in this environment; installed via Homebrew
(`0.32.0`) to match the pinned `cargo-dist-version` in `dist-workspace.toml`
before exercising criteria 1 and 2. Also inspected:

- `git diff rust-replatform --stat` (7 files, +884/-0, all additive: workflow,
  `Cargo.toml` dist profile, README install section, `dist-workspace.toml`,
  begin-skill posture line, two new test files)
- Integrity scan for `eslint-disable` / lint-config edits / deleted or
  weakened tests in the diff — none found; diff is additive only

## Exercise

### Criterion 1 — cargo-dist config, five targets + installers + checksums, no committed blobs

```bash
node --test test/binary-distribution.test.js
```

- `criterion 1: cargo-dist plan covers five targets, both installers, and
  sha256 checksums` — `cargo dist plan --output-format=json` lists archives
  and sha256 coverage for `aarch64-apple-darwin`, `x86_64-apple-darwin`,
  `x86_64-unknown-linux-musl`, `aarch64-unknown-linux-musl`,
  `x86_64-pc-windows-msvc`, plus `the-loop-installer.sh` /
  `the-loop-installer.ps1`; `cargo dist generate --check` confirms
  `.github/workflows/release.yml` matches the generator (not hand-edited,
  drift-free); workflow is tag-triggered. PASS.
- `criterion 1: no compiled release artifact is committed to the git tree` —
  `git ls-files` scanned for compiled-blob extensions and bare binary names;
  none found; `target/distrib/` confirmed gitignored via `git check-ignore`.
  PASS.

### Criterion 2 — installer places the-loop on PATH, checksum-verified, no JS runtime

Same test file, `criterion 2: shell installer places the-loop on PATH with
checksum verification and no JS runtime`:

- Ran real `cargo dist build` (host target), producing real archives and
  `the-loop-installer.sh` under `target/distrib/`.
- Confirmed the installer embeds `_checksum_style="sha256"` and that the
  embedded checksum for the host archive matches `shasum -a 256` of the actual
  archive bytes.
- Served `target/distrib/` over HTTP via a separate `python3 -m http.server`
  process (avoids same-process event-loop blocking under `spawnSync`).
- Ran the generated shell installer with `PATH` stripped of every JS-runtime
  directory (`node`/`nodejs`/`npm`/`npx`/`bun`/`deno` all absent; probed and
  asserted absent before use) and `THE_LOOP_DOWNLOAD_URL` pointed at the local
  HTTP server. Installer exited 0, reported a successful install, placed
  `the-loop` at `<install-dir>/bin/the-loop`.
- Ran `the-loop --version` from the installed binary (still on the
  JS-runtime-free PATH) — exit 0, output matched `the-loop <semver>`.
- Negative path: served a corrupted archive (same installer, tampered archive
  bytes) — installer exited nonzero, stderr/stdout reported a checksum
  mismatch, and no binary was left installed. Confirms verification happens
  *before* use, not just at download.

PASS — both the happy path and the checksum-rejection path were exercised
against real built artifacts, not config-string assertions.

### Criterion 3 — install one-liner recorded at missing-binary surfaces

`criterion 3: README install section and begin skill carry the install
one-liner`:

- `README.md` has a `## Install` section containing the exact one-liner
  `curl -LsSf https://github.com/jatassi/the-loop/releases/latest/download/the-loop-installer.sh | sh`.
- `plugin/skills/begin/SKILL.md` carries the same one-liner as the
  missing-binary remedy, names the command-not-found / missing-binary posture
  explicitly, and still invokes the Node CLI directly in this slice (verified
  by regex against `node "${CLAUDE_PLUGIN_ROOT}/bin/the-loop.js"`).

PASS.

## Full suite + lint + Rust dev gate

```bash
npm test
# 345 pass / 0 fail (includes the 4 binary-distribution tests above)

npm run lint
# eslint . — clean, no output

cargo fmt --check
# exit 0

cargo test --workspace
# 2 process tests pass (unrelated cli surface, unaffected by this feature)

cargo clippy --workspace --all-targets
# Finished clean, no warnings
```

## Expected observations (all met)

| Check | Expected | Observed |
| --- | --- | --- |
| Five targets in dist plan | present, archive + sha256 each | confirmed |
| Both installers in plan | `the-loop-installer.sh` + `.ps1` | confirmed |
| Generated workflow matches generator | `dist generate --check` clean | confirmed |
| No compiled blob committed | `git ls-files` clean of blobs | confirmed |
| `target/distrib` gitignored | `git check-ignore` exit 0 | confirmed |
| Real installer, no JS runtime on PATH | `the-loop --version` succeeds | confirmed |
| Checksum verified before use | corrupted archive rejected, no binary left | confirmed |
| README + begin carry one-liner | exact string present in both | confirmed |
| begin names missing-binary posture | command-not-found language present | confirmed |
| Full JS suite | green | 345/345 |
| Lint | clean | clean |
| Rust fmt/clippy/test | clean | clean |

## Teardown

`cargo dist build` and the installer exercise create real temp install roots
under the OS tmp dir (`the-loop-install-*`, `the-loop-corrupt-*`,
`the-loop-install-bad-*`) and an HTTP server subprocess; the test file's own
`finally` blocks close the server and `rm -rf` those temp roots — confirmed no
leftover `the-loop-install-*`/`the-loop-corrupt-*` directories remained after
the run. `target/distrib/` build output is gitignored, left in place (not a
fixture-repo temp directory, no `rm -rf` teardown owed for it). Worktree `git
status --porcelain` confirmed empty (no tracked-tree drift) both before and
after the judging pass.

## Integrity

- Diff is additive only (7 files, +884/-0); no deletions, no weakened
  assertions.
- No `eslint-disable` in any form; no edit to `eslint.config.js` or any lint
  configuration.
- Both new test files (`test/binary-distribution.test.js`,
  `test/binary-distribution-helpers.js`) exercise real subprocess behavior
  (`cargo dist build`, a real HTTP server, a real shell installer, a real
  checksum mismatch) rather than asserting on static strings alone — confirmed
  by reading the assertions and re-running them locally.
