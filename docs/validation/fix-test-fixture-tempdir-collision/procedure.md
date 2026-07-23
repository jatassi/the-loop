# Validation procedure — fix-test-fixture-tempdir-collision

The defect lives entirely in the `#[cfg(test)]` test fixture (`tempfile_dir` in
`cli/src/commands/worktree.rs`); shipped `the-loop worktree-*` behavior is unaffected.
Per the feature design, the fix has no standalone external-CLI surface — every
criterion's observable behavior is a `cargo test` outcome. This procedure is replayed
at release.

## Bring-up

From the integration worktree root:

```sh
cargo build --manifest-path cli/Cargo.toml --release   # worktree tests exec the release binary
```

## Exercise

1. **Criterion 1 & 3 & 4 — the three new fixture tests pass, and they bite.**
   ```sh
   cargo test --manifest-path cli/Cargo.toml --lib commands::worktree::tests::tempfile_dir
   ```
   Then temporarily revert `tempfile_dir` to the clock-derived (`SystemTime::now().as_nanos()`
   + `create_dir_all`) implementation and re-run the same filter to confirm the three
   tests fail against the old code; restore afterward with `git checkout`.

2. **Criterion 2 — 25 consecutive green runs at 13 threads (baseline 3/25).**
   ```sh
   pass=0; fail=0
   for i in $(seq 1 25); do
     if cargo test --manifest-path cli/Cargo.toml --lib commands::worktree \
          -- --test-threads=13 >/dev/null 2>&1; then pass=$((pass+1));
     else fail=$((fail+1)); echo "run $i FAILED"; fi
   done
   echo "PASS=$pass FAIL=$fail"
   ```

3. **Full suite + lint.**
   ```sh
   cargo test --manifest-path cli/Cargo.toml
   cargo clippy --manifest-path cli/Cargo.toml --all-targets -- -D warnings
   ```

## Expected observations

- `tempfile_dir_paths_are_unique_under_contention` (8 threads x 250), 
  `tempfile_dir_panics_when_target_already_exists`, and
  `tempfile_dir_uses_single_process_wide_counter_across_labels` all pass.
- Against the reverted clock-based implementation, all three fail
  (uniqueness assert: 1966/2000 distinct; panic test: no panic; counter test: seq
  looks like a timestamp) — proving they exercise the new surface.
- `PASS=25 FAIL=0`.
- Full suite: 235 lib + 3 integration tests pass, 0 failed. Clippy clean.

## Teardown

The fixture tests remove their own temp dirs. No external fixture repo is provisioned.
Restore `cli/src/commands/worktree.rs` via `git checkout` if the bite-check revert was
applied.
