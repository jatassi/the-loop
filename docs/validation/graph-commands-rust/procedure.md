# Validation procedure — graph-commands-rust

Judge-only validation against target `rust-replatform` on worktree
`integrate--graph-commands-rust` (merged, in order: `loop/graph-commands-rust`,
`loop/graph-commands-rust--graph-model-emit`, `loop/graph-commands-rust--graph-validator`,
`loop/graph-commands-rust--graph-commands`, `loop/graph-commands-rust--status-command`,
`loop/graph-commands-rust--oracle-graph-live`). Two textual merge conflicts in
`cli/src/lib.rs`/`cli/src/main.rs` (the `status-command` branch's `Command`
enum + `ExitCode`-returning `Cli::run` vs. the `graph-commands` branch's
`Commands` enum + process-exiting `CommandResult::apply`) were composed: kept
`ExitCode`-returning dispatch, added a non-diverging `CommandResult::into_exit_code`
alongside the existing `apply`, unified the enum as `Command` with all four
variants (`Check`/`List`/`SetStatus`/`Status`). Both branches' pre-existing
test suites ride the merged tree unmodified and pass. This repo has not run
json-cutover, so `docs/feature-graph.md` (not `.json`) is still this repo's own
graph — criteria 1-3 were exercised against a disposable fixture JSON file, not
this repo's own graph.

## Bring-up

```bash
cargo build --release
```

Produces `target/release/the-loop`. This repo's own `docs/feature-graph.md`
(YAML) is unaffected by this feature — the Rust binary's fixture graphs are
disposable JSON files under a temp dir.

## Exercise

### Criteria 1 & 2 — canonical emit, schema, hand-edit content preservation

Wrote a temp fixture with shuffled key order and odd whitespace:

```json
{
  "features": [
    {
      "notes": ["hand edit"],
      "status":   "designed",
      "title": "Alpha feature",
      "id": "alpha",
      "acceptance": ["one criterion"],
      "depends_on": [],
      "section": "walking skeleton (v1.0)"
    }
  ],
  "design_version": 3
}
```

```bash
./target/release/the-loop check "$TMPD/graph.json"
# observed: "ERROR round-trip: emit(parse(text)) != text" / "FAIL 1 features —
# 0 error(s), 0 warning(s)", exit 1 — correct per design.md: check enforces the
# file already be canonical; only a write normalizes it.

./target/release/the-loop set-status alpha designed "$TMPD/graph.json"
```

Observed rewritten file, byte-canonical (`xxd` tail confirms trailing `}\n`,
2-space indent throughout):

```json
{
  "design_version": 3,
  "features": [
    {
      "id": "alpha",
      "section": "walking skeleton (v1.0)",
      "title": "Alpha feature",
      "status": "designed",
      "depends_on": [],
      "acceptance": [
        "one criterion"
      ],
      "notes": [
        "hand edit"
      ]
    }
  ]
}
```

Content is JSON-equal to the hand-edit (all seven fields present with
unchanged values); key order now matches the design doc's schema block
exactly (`design_version`, `features[].{id, section, title, status,
depends_on, acceptance, notes}`); `section` carries the former YAML
milestone-comment grouping through untouched.

Corroborating `cargo test --workspace` (55 lib + 3 process, all green),
including `graph::tests::parse_emit_round_trip_shuffled_keys_is_content_equal_and_byte_canonical`,
`graph::tests::feature_key_order_on_emit_matches_design_doc`,
`graph::tests::absent_section_notes_depends_on_parse_clean_and_stay_absent_on_emit`,
`commands::tests::set_status_flips_one_feature_rewrites_canonically_prints_record`,
`commands::tests::check_round_trip_criterion_emit_parse_equals_text`.

### Criterion 3 — check's refusal catalog, exit 0/1

Corroborating `cargo test --workspace` (`validate::tests::*`, all green):
`bad_status_rejects_in_flight_and_unknown`, `missing_id_reports_title_as_where`,
`duplicate_id_is_an_error`, `malformed_id_rejects_non_slug_forms`,
`self_and_dangling_dependencies_are_errors`,
`dependency_cycle_reports_dfs_path_joined_by_arrow`,
`missing_acceptance_on_non_proposed_but_proposed_exempt`,
`unknown_key_names_each_offending_top_level_and_per_feature_key`,
`malformed_json_returns_named_error_never_panics`,
`valid_graph_yields_ok_with_zero_errors`; `commands::tests::check_valid_canonical_prints_ok_and_exits_zero`,
`commands::tests::check_invalid_exits_one_with_fail_naming_each_offense`,
`commands::tests::check_malformed_json_exits_one_with_fail_naming_offense`.
`cli/tests/cli_process.rs::process_check_list_set_status_against_temp_graph`
spawns the real binary process (not an in-process call) and asserts the same.

### Criterion 4 — oracle parity

```bash
npm run oracle:rust
# observed: "oracle [rust]: 14 pass, 0 fail, 34 pending" — the 14 are exactly
# the graph-command cases: status (human + --json, happy + refusal), list
# (happy + refusal), check (happy + 3 refusal shapes), set-status (happy + 2
# refusal shapes), plus --version.
```

`test/oracle/pending.json` diff against target removes `status`, `list`,
`check`, `set-status` from the allowlist (only those four; the other 34
pending commands are untouched, out of this feature's scope).

## Expected observations (all met)

| Check | Expected | Observed |
| --- | --- | --- |
| Hand-edit round-trip | content JSON-equal, bytes canonical after a write | confirmed on shuffled-key/odd-whitespace fixture |
| Schema key order | `design_version`, `features[].{id,section,title,status,depends_on,acceptance,notes}` | confirmed |
| `section` field | carries YAML milestone-comment grouping | confirmed present and passed through |
| `check` valid graph | exit 0, `OK` | confirmed (unit + process tests) |
| `check` each offense | exit 1, offense named | confirmed (unit + process tests, full catalog) |
| Oracle status/list/check/set-status | stdout JSON-equal, exit-equal to JS CLI | 14/14 pass, 0 fail |

## Full-suite / lint gate

```bash
cargo build --workspace   # ok
cargo test --workspace    # 55 + 3 process + 0 doc = 58 pass, 0 fail
cargo clippy --workspace --all-targets   # clean (workspace lints: rust warnings=deny,
                                          # clippy all/pedantic/nursery/cargo=deny)
npm test                  # 355 pass, 0 fail
npm run lint              # clean
npm run oracle:rust       # 49 pass (14 live graph-command cases + 35 pre-existing), 0 fail
```

## Teardown

Temp fixture directory removed (`rm -rf "$TMPD"`) after the criteria-1/2/3
exercise. No fixture-repo (`bin/create-sample-repo.js`) bring-up was needed —
this repo's own tree already carries `docs/architecture.md` and the graph
commands were exercised directly against disposable JSON fixtures per the
design doc's "fixtures carry both formats via the parity-oracle's paired
generator" note; the oracle run above already drives the CLI from the outside
via its own fixture-repo generator internally.

## Integrity

- No `eslint-disable` in the diff; the diff's sole `#[allow(...)]` change is a
  *removal* of a prior placeholder allow (`_json_spine_placeholder`,
  `dead_code`), not an addition — confirmed via
  `git diff rust-replatform...HEAD | grep -n "eslint-disable\|#\[allow("`.
- No workspace lint-config edits (`Cargo.toml` `[workspace.lints]` unchanged
  by this feature's diff).
- No deleted or weakened tests; test counts grew (Rust: 0 → 58; oracle:
  4 pending commands → 0 pending, 14 live passing cases) and each new test
  exercises real behavior (process-spawn tests included, not only in-process
  unit tests).
