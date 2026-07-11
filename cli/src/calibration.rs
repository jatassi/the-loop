//! Deterministic aggregation over the calibration record corpus
//! (`docs/calibration/runs/*.json`) that regenerates `docs/calibration/index.md`
//! wholesale: a bounded `## Digest` section (≤ 40 lines, fixed table set, top-5
//! lists, medians) followed by `## Runs`, one line per record.
//!
//! Pure port of `plugin/src/calibration-summarize.js`. The one deliberate format
//! difference is the input envelope — the JS renderer extracts a fenced yaml
//! block from `*.md`; this module parses plain JSON files that hold the same
//! `{run, features}` record shape. Every digest line, sort key, number format,
//! and literal separator (em dash, middle dot, multiplication sign) is
//! byte-identical to the JS renderer on the same records.

use std::collections::BTreeMap;

use serde_json::Value;

/// Task size classes, smallest → largest; a feature's size class is its largest task's.
const SIZE_ORDER: &[&str] = &["xs", "s", "m", "l", "xl"];
/// Outcome vocabulary, in the fixed order run-line and reason summaries present them.
const OUTCOME_ORDER: &[&str] = &["validated", "blocked", "stalled", "unreached"];

/// One on-disk record: relative path (for error messages and sort tiebreak) plus raw JSON text.
#[derive(Debug, Clone)]
pub struct RawRecord {
    /// Relative path such as `docs/calibration/runs/2026-07-01-1.json`.
    pub file: String,
    /// Raw file contents (must be JSON: `{ "run": {...}, "features": [...] }`).
    pub text: String,
}

/// Render the whole `docs/calibration/index.md` from a record corpus.
///
/// Same records in any input order yield a byte-identical string (stable sorts
/// keyed on each record's `prepared_at`, then its file path; no generated
/// timestamps).
///
/// # Errors
///
/// Returns an error naming the offending file when any record's text is not
/// valid JSON, or parses but has no object-valued `run` mapping. Every record
/// is parsed before any output string is built.
pub fn render_index(records: &[RawRecord]) -> Result<String, String> {
    let ordered = order_records(records)?;
    let runs: Vec<&Value> = ordered.iter().map(|p| &p.doc["run"]).collect();
    let features: Vec<&Value> = ordered.iter().flat_map(|p| features_of(&p.doc)).collect();
    let run_lines: Vec<String> = ordered.iter().map(|p| run_line(&p.doc)).collect();
    let mut lines: Vec<String> = vec!["# Calibration memory".to_owned(), String::new()];
    lines.extend(digest_lines(&features, &runs));
    lines.push(String::new());
    lines.push("## Runs".to_owned());
    lines.push(String::new());
    if run_lines.is_empty() {
        lines.push("_No runs recorded._".to_owned());
    } else {
        lines.extend(run_lines);
    }
    lines.push(String::new());
    Ok(lines.join("\n"))
}

struct ParsedRecord {
    file: String,
    doc: Value,
}

/// Parse every record and order them deterministically: `prepared_at` ascending,
/// file path as the tiebreak. Parsing all up front means a single malformed
/// record fails before any string is built.
fn order_records(records: &[RawRecord]) -> Result<Vec<ParsedRecord>, String> {
    let mut parsed: Vec<ParsedRecord> = records
        .iter()
        .map(|r| {
            Ok(ParsedRecord {
                file: r.file.clone(),
                doc: parse_record(&r.file, &r.text)?,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    parsed.sort_by(|a, b| {
        let pa = string_field(&a.doc["run"], "prepared_at").unwrap_or("");
        let pb = string_field(&b.doc["run"], "prepared_at").unwrap_or("");
        pa.cmp(pb).then_with(|| a.file.cmp(&b.file))
    });
    Ok(parsed)
}

/// Parse one record's JSON payload. Unparseable text, or a payload with no
/// `run` object/mapping, is a malformed record — the error names the file.
fn parse_record(file: &str, text: &str) -> Result<Value, String> {
    let doc: Value = serde_json::from_str(text)
        .map_err(|error| format!("calibration record {file} has unparseable JSON: {error}"))?;
    match doc.get("run") {
        Some(Value::Object(_)) => Ok(doc),
        _ => Err(format!(
            "calibration record {file} is missing its run block"
        )),
    }
}

/// Median of a numeric list; `None` for an empty list (rendered as an em dash).
fn median(nums: &[f64]) -> Option<f64> {
    if nums.is_empty() {
        return None;
    }
    let mut s = nums.to_vec();
    s.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let mid = s.len() / 2;
    if s.len() % 2 == 1 {
        Some(s[mid])
    } else {
        Some(f64::midpoint(s[mid - 1], s[mid]))
    }
}

/// A number for a cell: integers bare, fractions to one decimal, null as an em dash.
fn fmt_num(n: Option<f64>) -> String {
    n.map_or_else(
        || "—".to_owned(),
        |n| {
            let v = if is_safe_integer_f64(n) {
                n
            } else {
                (n * 10.0).round() / 10.0
            };
            // Matches JS `String(Number)` for these values (`5.0` → `"5"`, `2.4` → `"2.4"`).
            format!("{v}")
        },
    )
}

/// `Number.isSafeInteger` over an `f64` already extracted from JSON.
fn is_safe_integer_f64(n: f64) -> bool {
    const MAX_SAFE: f64 = 9_007_199_254_740_991.0; // 2^53 − 1
    n.is_finite() && n.fract() == 0.0 && n.abs() <= MAX_SAFE
}

fn sum_agents(agents: Option<&Value>) -> f64 {
    let Some(Value::Object(map)) = agents else {
        return 0.0;
    };
    map.values().filter_map(as_number).sum()
}

/// A feature's size class: the largest size among its planned task contracts.
fn feature_size(feature: &Value) -> Option<&str> {
    let mut best: Option<&str> = None;
    let tasks = feature
        .get("tasks")
        .and_then(Value::as_array)
        .map_or(&[][..], Vec::as_slice);
    for task in tasks {
        let Some(size) = string_field(task, "size") else {
            continue;
        };
        let rank = SIZE_ORDER.iter().position(|&s| s == size);
        let Some(rank) = rank else {
            continue;
        };
        let best_rank = best.and_then(|b| SIZE_ORDER.iter().position(|&s| s == b));
        if best_rank.is_none_or(|br| rank > br) {
            best = Some(size);
        }
    }
    best
}

/// A feature's planned footprint size: the union of its task footprints, deduplicated.
fn planned_files(feature: &Value) -> usize {
    let mut set = std::collections::BTreeSet::new();
    let tasks = feature
        .get("tasks")
        .and_then(Value::as_array)
        .map_or(&[][..], Vec::as_slice);
    for task in tasks {
        let footprint = task
            .get("footprint")
            .and_then(Value::as_array)
            .map_or(&[][..], Vec::as_slice);
        for file in footprint {
            if let Some(s) = file.as_str() {
                set.insert(s);
            }
        }
    }
    set.len()
}

/// Per-workflow-path table: fixed rows for both paths, each with count, median
/// total agents, and median duration.
fn workflow_path_rows(features: &[&Value]) -> Vec<String> {
    let mut rows = Vec::new();
    for p in ["small", "standard"] {
        let group: Vec<&&Value> = features
            .iter()
            .filter(|f| string_field(f, "workflow_path") == Some(p))
            .collect();
        let agents: Vec<f64> = group.iter().map(|f| sum_agents(f.get("agents"))).collect();
        let durations: Vec<f64> = group
            .iter()
            .filter_map(|f| {
                f.get("actual")
                    .and_then(|a| a.get("duration_minutes"))
                    .and_then(as_number)
            })
            .collect();
        rows.push(format!(
            "| {p} | {} | {} | {} |",
            group.len(),
            fmt_num(median(&agents)),
            fmt_num(median(&durations))
        ));
    }
    rows
}

fn reslice_line(features: &[&Value]) -> String {
    let resliced = features
        .iter()
        .filter(|f| !matches!(f.get("reslice"), None | Some(Value::Null)))
        .count();
    let total = features.len();
    #[allow(
        clippy::cast_precision_loss,
        clippy::cast_possible_truncation,
        reason = "percent rate over corpus sizes well below f64 mantissa; Math.round → i64"
    )]
    let rate = if total > 0 {
        ((resliced as f64 / total as f64) * 100.0).round() as i64
    } else {
        0
    };
    format!("{resliced} of {total} feature(s) re-sliced ({rate}%).")
}

/// Planned-vs-actual footprint accuracy by size class, over features that reached
/// a git-enriched actual (validated). Rows only for size classes present — at most five.
fn footprint_rows(features: &[&Value]) -> Vec<String> {
    let with_actual: Vec<&&Value> = features
        .iter()
        .filter(|f| {
            f.get("actual")
                .and_then(|a| a.get("files_touched"))
                .and_then(as_number)
                .is_some()
        })
        .collect();
    let mut rows = Vec::new();
    for size in SIZE_ORDER {
        let group: Vec<&&&Value> = with_actual
            .iter()
            .filter(|f| feature_size(f) == Some(*size))
            .collect();
        if group.is_empty() {
            continue;
        }
        let planned: Vec<f64> = group
            .iter()
            .map(|f| {
                #[allow(
                    clippy::cast_precision_loss,
                    reason = "planned file counts are small integers"
                )]
                {
                    planned_files(f) as f64
                }
            })
            .collect();
        let actual: Vec<f64> = group
            .iter()
            .filter_map(|f| {
                f.get("actual")
                    .and_then(|a| a.get("files_touched"))
                    .and_then(as_number)
            })
            .collect();
        rows.push(format!(
            "| {size} | {} | {} | {} |",
            group.len(),
            fmt_num(median(&planned)),
            fmt_num(median(&actual))
        ));
    }
    rows
}

/// Top-5 recurring block reasons, verbatim strings grouped by count (count desc,
/// then reason ascending for a stable tie order).
fn block_reason_lines(features: &[&Value]) -> Vec<String> {
    let mut counts: BTreeMap<String, usize> = BTreeMap::new();
    for f in features {
        let outcome = string_field(f, "outcome");
        if outcome != Some("blocked") && outcome != Some("stalled") {
            continue;
        }
        let Some(reason) = f.get("reason").and_then(Value::as_str) else {
            continue;
        };
        let r = reason.trim();
        if r.is_empty() {
            continue;
        }
        *counts.entry(r.to_owned()).or_insert(0) += 1;
    }
    let mut entries: Vec<(String, usize)> = counts.into_iter().collect();
    entries.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    entries
        .into_iter()
        .take(5)
        .map(|(r, c)| format!("- {c}× {r}"))
        .collect()
}

/// Loop-overhead vs build tokens for one run: build is the build role, everything
/// else (plan/drive/validate/…) is overhead.
fn overhead_build(run: &Value) -> (f64, f64) {
    let by = run
        .get("tokens")
        .and_then(|t| t.get("by_role"))
        .and_then(Value::as_object);
    let mut build = 0.0;
    let mut overhead = 0.0;
    if let Some(map) = by {
        for (role, val) in map {
            let n = as_number(val).unwrap_or(0.0);
            if role == "build" {
                build += n;
            } else {
                overhead += n;
            }
        }
    }
    (build, overhead)
}

/// Overhead-vs-build split: lifetime totals and the last-10 median of the per-run
/// overhead fraction, with the attribution caveat always surfaced.
fn token_split_lines(runs: &[&Value]) -> Vec<String> {
    if runs.is_empty() {
        return vec!["_No runs recorded._".to_owned()];
    }
    let mut tot_build = 0.0;
    let mut tot_over = 0.0;
    let mut fractions = Vec::new();
    for run in runs {
        let (build, overhead) = overhead_build(run);
        tot_build += build;
        tot_over += overhead;
        if build + overhead > 0.0 {
            fractions.push(overhead / (build + overhead));
        }
    }
    let life_tot = tot_build + tot_over;
    #[allow(
        clippy::cast_possible_truncation,
        reason = "percent is a small integer after Math.round"
    )]
    let life_over = if life_tot > 0.0 {
        ((tot_over / life_tot) * 100.0).round() as i64
    } else {
        0
    };
    let last_n = fractions.len().saturating_sub(10);
    let med = median(&fractions[last_n..]);
    #[allow(
        clippy::cast_possible_truncation,
        reason = "percent is a small integer after Math.round"
    )]
    let last_over = med.map(|m| (m * 100.0).round() as i64);
    let overlapped = runs
        .iter()
        .filter(|r| {
            r.get("tokens")
                .and_then(|t| t.get("attribution"))
                .and_then(Value::as_str)
                == Some("overlapped")
        })
        .count();
    let last_line = last_over.map_or_else(
        || "Last-10 median: — (no token data).".to_owned(),
        |lo| format!("Last-10 median: {lo}% overhead / {}% build.", 100 - lo),
    );
    vec![
        format!(
            "Lifetime: {life_over}% overhead / {}% build.",
            100 - life_over
        ),
        last_line,
        format!(
            "Attribution: {overlapped} of {} run(s) overlapped — the overhead/build split is approximate.",
            runs.len()
        ),
    ]
}

/// The bounded `## Digest` section as a line array (≤ 40 by construction).
fn digest_lines(features: &[&Value], runs: &[&Value]) -> Vec<String> {
    let fr = footprint_rows(features);
    let footprint: Vec<String> = if fr.is_empty() {
        vec!["_No validated features yet._".to_owned()]
    } else {
        let mut v = vec![
            "| size | features | median planned files | median actual files |".to_owned(),
            "| --- | --- | --- | --- |".to_owned(),
        ];
        v.extend(fr);
        v
    };
    let br = block_reason_lines(features);
    let reasons: Vec<String> = if br.is_empty() {
        vec!["_None recorded._".to_owned()]
    } else {
        br
    };
    let mut lines = vec![
        "## Digest".to_owned(),
        String::new(),
        format!(
            "_{} run(s), {} feature(s) recorded._",
            runs.len(),
            features.len()
        ),
        String::new(),
        "### Workflow paths".to_owned(),
        "| path | runs | median agents | median duration |".to_owned(),
        "| --- | --- | --- | --- |".to_owned(),
    ];
    lines.extend(workflow_path_rows(features));
    lines.push(String::new());
    lines.push("### Re-slices".to_owned());
    lines.push(reslice_line(features));
    lines.push(String::new());
    lines.push("### Footprint accuracy by size class".to_owned());
    lines.extend(footprint);
    lines.push(String::new());
    lines.push("### Top block reasons".to_owned());
    lines.extend(reasons);
    lines.push(String::new());
    lines.push("### Token split (overhead vs build)".to_owned());
    lines.extend(token_split_lines(runs));
    lines
}

fn summarize_outcomes(features: &[&Value]) -> String {
    let mut counts: BTreeMap<String, usize> = BTreeMap::new();
    for f in features {
        if let Some(o) = string_field(f, "outcome") {
            *counts.entry(o.to_owned()).or_insert(0) += 1;
        } else {
            // JS: counts[undefined] — string key "undefined" is not in OUTCOME_ORDER,
            // so it is dropped from the summary the same way missing outcomes are.
            *counts.entry(String::new()).or_insert(0) += 1;
        }
    }
    let parts: Vec<String> = OUTCOME_ORDER
        .iter()
        .filter_map(|o| counts.get(*o).map(|c| format!("{c} {o}")))
        .collect();
    if parts.is_empty() {
        "no features".to_owned()
    } else {
        parts.join(", ")
    }
}

fn token_summary(run: &Value) -> String {
    let tokens = run.get("tokens");
    let spent = tokens
        .and_then(|t| t.get("spent"))
        .and_then(as_number)
        .map_or_else(|| "0".to_owned(), |n| format!("{n}"));
    let attribution = tokens
        .and_then(|t| t.get("attribution"))
        .and_then(Value::as_str)
        .unwrap_or("unknown");
    format!("{spent} tokens · {attribution}")
}

/// One `## Runs` line per record — every scalar is record data, never re-derived.
fn run_line(doc: &Value) -> String {
    let run = doc.get("run").unwrap_or(&Value::Null);
    let feats = features_of(doc);
    let outcomes = summarize_outcomes(&feats);
    let scope = match run.get("scope") {
        Some(Value::Array(arr)) => arr
            .iter()
            .map(json_scalar_display)
            .collect::<Vec<_>>()
            .join(", "),
        _ => String::new(),
    };
    let halted = match run.get("halted") {
        None | Some(Value::Null | Value::Bool(false)) => String::new(),
        Some(Value::String(s)) if s.is_empty() => String::new(),
        Some(Value::Number(n)) if n.as_f64() == Some(0.0) => String::new(),
        Some(Value::String(s)) => format!(" · halted: {s}"),
        Some(v) => format!(" · halted: {}", json_scalar_display(v)),
    };
    let prepared_at = match run.get("prepared_at") {
        Some(Value::Null) | None => "(no timestamp)".to_owned(),
        Some(v) => json_scalar_display(v),
    };
    let target = match run.get("target") {
        Some(Value::Null) | None => "?".to_owned(),
        Some(v) => json_scalar_display(v),
    };
    format!(
        "- {prepared_at} · target {target} · [{scope}] · {outcomes} · {}{halted}",
        token_summary(run)
    )
}

fn features_of(doc: &Value) -> Vec<&Value> {
    doc.get("features")
        .and_then(Value::as_array)
        .map(|a| a.iter().collect())
        .unwrap_or_default()
}

fn as_number(v: &Value) -> Option<f64> {
    match v {
        Value::Number(n) => n.as_f64(),
        _ => None,
    }
}

fn string_field<'a>(v: &'a Value, key: &str) -> Option<&'a str> {
    v.get(key).and_then(Value::as_str)
}

/// Display a JSON scalar the way JS template-string interpolation does for
/// strings/numbers/bools (strings bare, not JSON-quoted).
fn json_scalar_display(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Number(n) => n.to_string(),
        Value::Bool(b) => b.to_string(),
        Value::Null => "null".to_owned(),
        other => other.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const RECORD_A_TEXT: &str = r#"{
  "run": {
    "prepared_at": "2026-07-01T10:00:00Z",
    "target": "main",
    "scope": ["f-a"],
    "tokens": { "spent": 100000, "by_role": { "plan": 20000, "build": 70000, "validate": 10000 }, "attribution": "serial" },
    "halted": null
  },
  "features": [
    {
      "id": "f-a", "workflow_path": "standard", "outcome": "validated",
      "reason": null, "reslice": null,
      "agents": { "plan": 1, "build": 3, "drive": 0, "validate": 1 },
      "tasks": [{ "id": "t1", "size": "s", "judgment_level": "standard", "footprint": ["a.js", "a.test.js"] }],
      "actual": { "files_touched": 3, "insertions": 50, "deletions": 5, "commits": 2, "duration_minutes": 20 }
    }
  ]
}"#;

    const RECORD_B_TEXT: &str = r#"{
  "run": {
    "prepared_at": "2026-07-02T09:00:00Z",
    "target": "main",
    "scope": ["f-b"],
    "tokens": { "spent": 10000, "by_role": { "plan": 5000, "build": 5000 }, "attribution": "overlapped" },
    "halted": null
  },
  "features": [
    {
      "id": "f-b", "workflow_path": "small", "outcome": "blocked",
      "reason": "dep conflict on parser", "reslice": "t1 split into two",
      "agents": { "plan": 1, "build": 1 },
      "tasks": [{ "id": "t1", "size": "s", "judgment_level": "standard", "footprint": ["b.js"] }],
      "actual": null
    }
  ]
}"#;

    fn record_a() -> RawRecord {
        RawRecord {
            file: "docs/calibration/runs/2026-07-01-1.json".to_owned(),
            text: RECORD_A_TEXT.to_owned(),
        }
    }

    fn record_b() -> RawRecord {
        RawRecord {
            file: "docs/calibration/runs/2026-07-02-1.json".to_owned(),
            text: RECORD_B_TEXT.to_owned(),
        }
    }

    fn digest_section(index: &str) -> Vec<&str> {
        let lines: Vec<&str> = index.lines().collect();
        let start = lines
            .iter()
            .position(|l| *l == "## Digest")
            .expect("Digest");
        let end = lines.iter().position(|l| *l == "## Runs").expect("Runs");
        lines[start..end].to_vec()
    }

    #[test]
    fn render_index_order_independent_digest_bound_and_run_lines() {
        let ab = render_index(&[record_a(), record_b()]).expect("ab");
        let ba = render_index(&[record_b(), record_a()]).expect("ba");
        assert_eq!(ab, ba, "same corpus in any order must be byte-identical");

        let digest = digest_section(&ab);
        assert!(
            digest.len() <= 40,
            "digest section must stay within 40 lines, got {}",
            digest.len()
        );

        let all: Vec<&str> = ab.lines().collect();
        let runs_at = all.iter().position(|l| *l == "## Runs").expect("## Runs");
        let run_lines: Vec<&str> = all[runs_at..]
            .iter()
            .copied()
            .filter(|l| l.starts_with("- "))
            .collect();
        assert_eq!(run_lines.len(), 2, "one Runs line per record");
        assert_eq!(
            run_lines[0],
            "- 2026-07-01T10:00:00Z · target main · [f-a] · 1 validated · 100000 tokens · serial"
        );
        assert_eq!(
            run_lines[1],
            "- 2026-07-02T09:00:00Z · target main · [f-b] · 1 blocked · 10000 tokens · overlapped"
        );
    }

    #[test]
    fn render_index_digest_math_digit_for_digit() {
        let index = render_index(&[record_a(), record_b()]).expect("render");
        let digest = digest_section(&index).join("\n");
        assert!(
            digest.contains("| small | 1 | 2 | — |"),
            "small path row missing; digest:\n{digest}"
        );
        assert!(
            digest.contains("| standard | 1 | 5 | 20 |"),
            "standard path row missing; digest:\n{digest}"
        );
        assert!(digest.contains("1 of 2 feature(s) re-sliced (50%)."));
        assert!(
            digest.contains("| s | 1 | 2 | 3 |"),
            "size s footprint row missing; digest:\n{digest}"
        );
        assert!(digest.contains("- 1× dep conflict on parser"));
        assert!(digest.contains("Lifetime: 32% overhead / 68% build."));
        assert!(digest.contains("Last-10 median: 40% overhead / 60% build."));
        assert!(digest.contains("Attribution: 1 of 2 run(s) overlapped"));
    }

    #[test]
    fn unparseable_json_errors_naming_file_before_any_output() {
        let bad_file = "docs/calibration/runs/2026-07-02-1.json";
        let bad = RawRecord {
            file: bad_file.to_owned(),
            text: "{ \"run\": [this is not valid\n".to_owned(),
        };
        // Bad second — prove the good record being processed first does not leak output.
        let err = render_index(&[record_a(), bad]).expect_err("must refuse");
        assert!(
            err.contains(bad_file),
            "error must name the offending file; got {err}"
        );
    }

    #[test]
    fn missing_run_mapping_errors_naming_file() {
        let no_run = RawRecord {
            file: "docs/calibration/runs/no-run.json".to_owned(),
            text: r#"{"not_run": {}}"#.to_owned(),
        };
        let err = render_index(&[no_run]).expect_err("no run key");
        assert!(err.contains("docs/calibration/runs/no-run.json"));

        let string_run = RawRecord {
            file: "docs/calibration/runs/string-run.json".to_owned(),
            text: r#"{"run": "a string, not an object"}"#.to_owned(),
        };
        let err = render_index(&[string_run]).expect_err("string run");
        assert!(err.contains("docs/calibration/runs/string-run.json"));
    }

    #[test]
    fn fmt_num_em_dash_integer_and_one_decimal() {
        assert_eq!(fmt_num(None), "—");
        assert_eq!(fmt_num(Some(5.0)), "5");
        assert_eq!(fmt_num(Some(4.55)), "4.6");
        assert_eq!(fmt_num(Some(4.95)), "5");
    }
}
