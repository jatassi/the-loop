# fix-test-fixture-tempdir-collision — concurrent worktree tests collide on one temp fixture directory, so `git init` races itself

**Date:** 2026-07-22 · **Affects:** run-commands-rust, worktree-setup · **Class:** race
(time-resolution collision) · **Cause established by:** reproduced
**Environment:** macOS (Darwin 27.0.0, aarch64-apple-darwin), Rust test harness
(threads in one process), git from Xcode-beta (`/Applications/Xcode-beta.app/…/git-core/templates`)
· **Determinism:** intermittent — ~4% of full `cargo test` runs at default thread
count; 22/25 (88%) at `--test-threads=13` · **Regressed since:** `5b1b41b`
(run-commands-rust), the commit that introduced the fixture helper — never worked,
the flake was simply rare enough to read as noise

## Steps to reproduce

From the repo root:

```sh
for i in $(seq 1 25); do
  cargo test --manifest-path cli/Cargo.toml --lib commands::worktree -- --test-threads=13
done
```

Raising the thread count above the 13 worktree tests' natural parallelism widens the
collision window; the same failure occurs at default thread count roughly once per 25
full-suite runs, which is how it reached three consecutive releases as "the known flake".

## Expected result

25/25 runs green. Each test gets its own temp git fixture, per the helper's evident
intent (`tempfile_dir` names by pid and timestamp precisely so concurrent tests do not
share a directory).

## Actual result

22 of 25 runs failed. Two signatures, both from the same assert at
`cli/src/commands/worktree.rs:439`:

```
thread 'commands::worktree::tests::process_bound_failure_tears_down_and_keeps_branch' panicked at cli/src/commands/worktree.rs:439:9:
git init -q -b main failed: fatal: cannot copy '/Applications/Xcode-beta.app/Contents/Developer/usr/share/git-core/templates/hooks/pre-commit.sample' to '/private/var/folders/…/T/the-loop-wt-fixture-69095-1784779625583537000/.git/hooks/pre-commit.sample': File exists
```

```
thread 'commands::worktree::tests::process_setup_timeout_wording_and_teardown' panicked at cli/src/commands/worktree.rs:439:9:
git init -q -b main failed: error: could not lock config file /private/var/folders/…/T/the-loop-wt-fixture-70458-1784779626703233000/.git/config: File exists
```

Which template file or lock loses the race varies run to run (`pre-commit.sample`,
`sendemail-validate.sample`, `update.sample`, `info/exclude`, `description`,
`.git/config`, …), and the failing test varies too — 8 of the 13 worktree tests were
observed failing across the 25 runs. That surface variability is what made the flake
look environmental rather than structural.

## Root cause(s)

**Trigger:** two test threads call `tempfile_dir` within the same microsecond.

**Underlying cause 1 — the fixture name is not unique.**
`cli/src/commands/worktree.rs:423-431` builds the directory name as
`the-loop-{label}-{pid}-{nanos}`, taking `nanos` from
`SystemTime::now().duration_since(UNIX_EPOCH).as_nanos()` (`:424-426`). All 13 worktree
tests run as threads in a single process, so `pid` is constant across them, leaving the
timestamp as the sole discriminator — and **on macOS `SystemTime::now()` has microsecond,
not nanosecond, resolution.** Measured directly on this machine: 20 sequential calls
returned only 4 distinct values, and every value satisfied `nanos % 1000 == 0`. Under
thread contention, 4000 generated names collapsed to 1451 unique — a **64% collision
rate**. The name promises uniqueness the clock cannot supply.

**Underlying cause 2 — the collision is swallowed instead of surfaced.**
`cli/src/commands/worktree.rs:429` uses `fs::create_dir_all`, which succeeds silently
when the directory already exists. So the losing thread does not learn it collided; it
proceeds to run `git init` inside a directory another thread is already initialising.
Two concurrent `git init` in one directory is what produces both signatures — one copies
a template file the other already copied (`File exists`), or one takes `.git/config`'s
lock the other wants. Had this been `fs::create_dir`, the collision would have failed
loudly and truthfully at the fixture on day one.

Direct evidence of the shared path — iteration 11 of the repro, two threads, byte-identical
directory:

```
process_malformed_binding_refuses_before_create → …/the-loop-wt-fixture-75898-1784779630783371000
process_bound_failure_tears_down_and_keeps_branch → …/the-loop-wt-fixture-75898-1784779630783371000
```

Iterations 15 and 23 show the same identical-path pairing.

**Why no test or validation procedure caught it.** The defect is *in the test fixture
itself*, a layer nothing else tests. It is also probabilistic and self-clearing: a re-run
passes, so at v0.4.13, v0.5.0 and v0.5.1 it was recorded as a known flake and waved
through rather than diagnosed. `docs/validation/run-commands-rust/procedure.md` exercises
the worktree verbs through the release binary from the outside, where each invocation is a
separate process with a distinct pid — the one configuration in which the collision
cannot occur.

**Scope note:** this is a test-infrastructure defect only. Shipped `the-loop worktree-*`
behavior is not affected — `tempfile_dir` exists solely inside `#[cfg(test)]`.

**Latent second-order issue, same cause.** `spawn_in` (`:461`) and `:615` pass
`tempfile_dir("wt-home")` as the child process's `HOME`. Two tests colliding there share a
home directory, so one test's settings layer can be read by another. No failure has been
attributed to this yet, but it is the same unsound name and the fix closes it too.

## Evidence

1. **Resolution probe.** A standalone Rust binary calling
   `SystemTime::now().duration_since(UNIX_EPOCH).as_nanos()` in a tight loop: 20 calls →
   4 distinct values, all with `% 1000 == 0`, establishing microsecond granularity.
2. **Collision probe.** 8 threads × 500 name generations using the exact `tempfile_dir`
   format string: 4000 names, 1451 unique, 2549 collisions.
3. **Symptom repro.** 25 consecutive `--test-threads=13` runs: 22 failed, with two
   distinct git-level signatures and 8 distinct failing tests.
4. **Identical-path capture.** Three of the failing iterations printed the same fixture
   path from two different test threads (above), closing the loop between the name
   collision and the git failure.
5. **Historical corroboration.** The `docs/releases/v0.5.0/report.md` sighting names an
   `index.lock` race in the same test — a third signature of the same shared-directory
   cause.

Instrumentation was standalone (scratchpad only); nothing was added to the tree.

## Fix design

`cli/src/commands/worktree.rs`, `tempfile_dir` only — no call-site changes, signature
unchanged.

- **Make the name unique by construction.** Replace the timestamp component with a
  process-wide monotonic counter — a `static SEQ: AtomicU64` incremented with
  `fetch_add(1, Ordering::Relaxed)` — giving `the-loop-{label}-{pid}-{seq}`. `pid` keeps
  distinctness across concurrent `cargo test` processes; the counter makes in-process
  uniqueness guaranteed rather than probabilistic. Do not merely add more timestamp bits:
  the clock's resolution is the defect, so any clock-derived name stays probabilistic.
- **Refuse to share a directory.** Use `fs::create_dir` for the leaf (after
  `create_dir_all` on the parent, if needed) and let the fixture panic on `AlreadyExists`.
  This is the defense in depth that turns any future collision into an immediate, honest
  failure at the fixture instead of a confusing git error three calls later.

Constraint for the builder: the counter must be a single `static` shared by all labels —
per-label counters would let `wt-fixture` and `wt-home` re-collide.

## Regression

The fix's acceptance criteria pin:

1. A new unit test spawning N ≥ 8 threads that each call `tempfile_dir` many times
   asserts every returned path is distinct — this is the minimal repro, and it fails
   against today's implementation.
2. `cargo test --manifest-path cli/Cargo.toml --lib commands::worktree -- --test-threads=13`
   is green across 25 consecutive runs (today: 3/25).
3. `tempfile_dir` panics rather than returning a path that already exists.

## Validation procedure

`docs/validation/run-commands-rust/procedure.md` gains one exercise step: run the
worktree unit tests at `--test-threads=13` for 25 consecutive iterations and observe
25/25 green. Never a standalone validation procedure for the fix itself.
