//! Graph subcommands: `check`, `list`, `set-status`.
//!
//! Thin I/O layer over [`crate::graph`] and [`crate::validate`]. Default graph path
//! is [`DEFAULT_GRAPH`]; an optional positional path is honored. Refusals use the
//! JS `spine:` stderr prefix; success JSON is 2-space pretty with a trailing newline.

use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::process::ExitCode;

use serde::Serialize;
use serde_json::{Value, json};

use crate::graph::{Acceptance, Feature, FeatureGraph, emit, parse};
use crate::validate::{Issue, STATUS, validate};

/// Default feature-graph path (Rust binary view; ADR-0051).
pub const DEFAULT_GRAPH: &str = "docs/feature-graph.json";

/// Outcome of a graph command: what to write and which exit code to use.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommandResult {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
}

impl CommandResult {
    #[must_use]
    const fn ok(stdout: String) -> Self {
        Self {
            exit_code: 0,
            stdout,
            stderr: String::new(),
        }
    }

    #[must_use]
    fn refuse(msg: impl Into<String>) -> Self {
        Self {
            exit_code: 1,
            stdout: String::new(),
            stderr: format!("spine: {}\n", msg.into()),
        }
    }

    #[must_use]
    const fn fail_stdout(stdout: String) -> Self {
        Self {
            exit_code: 1,
            stdout,
            stderr: String::new(),
        }
    }

    /// Write stdout/stderr and return the process exit code (does not exit).
    #[must_use]
    pub fn into_exit_code(self) -> ExitCode {
        let mut out = io::stdout().lock();
        let _ = out.write_all(self.stdout.as_bytes());
        let _ = out.flush();
        let mut err = io::stderr().lock();
        let _ = err.write_all(self.stderr.as_bytes());
        let _ = err.flush();
        if self.exit_code == 0 {
            ExitCode::SUCCESS
        } else {
            ExitCode::FAILURE
        }
    }
}

/// Resolve the graph path: optional positional, else [`DEFAULT_GRAPH`].
#[must_use]
pub fn resolve_graph_path(path: Option<PathBuf>) -> PathBuf {
    path.unwrap_or_else(|| PathBuf::from(DEFAULT_GRAPH))
}

/// `the-loop check [path]` — validate + round-trip; OK/FAIL summary; exit 0/1.
#[must_use]
pub fn check(path: &Path) -> CommandResult {
    let text = match fs::read_to_string(path) {
        Ok(t) => t,
        Err(err) => return CommandResult::refuse(read_error(path, &err)),
    };

    let graph = match parse(&text) {
        Ok(g) => g,
        Err(err) => {
            let mut stdout = String::new();
            push_issue_line(
                &mut stdout,
                "ERROR",
                "malformed-json",
                &err.to_string(),
                None,
            );
            push_summary(&mut stdout, false, 0, 1, 0);
            return CommandResult::fail_stdout(stdout);
        }
    };

    let result = validate(&graph);
    let did_round_trip = emit(&graph) == text;

    let mut stdout = String::new();
    for warning in &result.warnings {
        print_issue(&mut stdout, "warn ", warning);
    }
    for error in &result.errors {
        print_issue(&mut stdout, "ERROR", error);
    }
    if !did_round_trip {
        stdout.push_str("  ERROR round-trip: emit(parse(text)) != text\n");
    }

    let good = result.ok && did_round_trip;
    push_summary(
        &mut stdout,
        good,
        graph.features.len(),
        result.errors.len(),
        result.warnings.len(),
    );

    if good {
        CommandResult::ok(stdout)
    } else {
        CommandResult::fail_stdout(stdout)
    }
}

/// `the-loop list [path]` — parsed model as `{"designVersion","features"}` JSON.
#[must_use]
pub fn list(path: &Path) -> CommandResult {
    let text = match fs::read_to_string(path) {
        Ok(t) => t,
        Err(err) => return CommandResult::refuse(read_error(path, &err)),
    };
    let graph = match parse(&text) {
        Ok(g) => g,
        Err(err) => return CommandResult::refuse(err.to_string()),
    };
    let payload = ListOutput::from_graph(&graph);
    match to_pretty_json(&payload) {
        Ok(s) => CommandResult::ok(s),
        Err(err) => CommandResult::refuse(err),
    }
}

/// `the-loop set-status <id> <status> [path]` — flip one feature, write canonically.
#[must_use]
pub fn set_status(path: &Path, feature_id: &str, status: &str) -> CommandResult {
    let text = match fs::read_to_string(path) {
        Ok(t) => t,
        Err(err) => return CommandResult::refuse(read_error(path, &err)),
    };
    let mut graph = match parse(&text) {
        Ok(g) => g,
        Err(err) => return CommandResult::refuse(err.to_string()),
    };

    let idx = graph.features.iter().position(|f| f.id == feature_id);
    let Some(idx) = idx else {
        return CommandResult::refuse(format!("unknown feature id: {feature_id}"));
    };
    if !STATUS.contains(&status) {
        let got = serde_json::to_string(status).unwrap_or_else(|_| format!("{status:?}"));
        return CommandResult::refuse(format!(
            "status must be one of {} (got {got})",
            STATUS.join("|")
        ));
    }

    status.clone_into(&mut graph.features[idx].status);
    let emitted = emit(&graph);
    if let Err(err) = fs::write(path, &emitted) {
        return CommandResult::refuse(format!("could not write {}: {err}", path.display()));
    }

    let payload = FeatureOut::from_feature(&graph.features[idx]);
    match to_pretty_json(&payload) {
        Ok(s) => CommandResult::ok(s),
        Err(err) => CommandResult::refuse(err),
    }
}

fn read_error(path: &Path, err: &io::Error) -> String {
    format!("could not read {}: {err}", path.display())
}

fn print_issue(out: &mut String, kind: &str, issue: &Issue) {
    push_issue_line(
        out,
        kind,
        &issue.code,
        &issue.message,
        issue.r#where.as_deref(),
    );
}

fn push_issue_line(out: &mut String, kind: &str, code: &str, message: &str, where_: Option<&str>) {
    out.push_str("  ");
    out.push_str(kind);
    out.push(' ');
    out.push_str(code);
    out.push_str(": ");
    out.push_str(message);
    if let Some(w) = where_ {
        out.push_str(" (");
        out.push_str(w);
        out.push(')');
    }
    out.push('\n');
}

fn push_summary(
    out: &mut String,
    good: bool,
    n_features: usize,
    n_errors: usize,
    n_warnings: usize,
) {
    // JS: `${good ? 'OK  ' : 'FAIL'} ${n} features — ${e} error(s), ${w} warning(s)\n`
    // OK carries two trailing spaces inside the token; FAIL has none — template adds one.
    if good {
        out.push_str("OK  ");
    } else {
        out.push_str("FAIL");
    }
    out.push(' ');
    out.push_str(&n_features.to_string());
    out.push_str(" features — ");
    out.push_str(&n_errors.to_string());
    out.push_str(" error(s), ");
    out.push_str(&n_warnings.to_string());
    out.push_str(" warning(s)\n");
}

fn to_pretty_json<T: Serialize>(value: &T) -> Result<String, String> {
    let body = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    Ok(format!("{body}\n"))
}

/// list / set-status JSON view of the graph (camelCase designVersion; no unknown keys).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ListOutput {
    design_version: Value,
    features: Vec<FeatureOut>,
}

impl ListOutput {
    fn from_graph(graph: &FeatureGraph) -> Self {
        Self {
            design_version: graph.design_version.clone(),
            features: graph
                .features
                .iter()
                .map(FeatureOut::from_feature)
                .collect(),
        }
    }
}

#[derive(Debug, Serialize)]
struct FeatureOut {
    id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    section: Option<String>,
    title: String,
    status: String,
    depends_on: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    acceptance: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    notes: Option<Vec<String>>,
}

impl FeatureOut {
    fn from_feature(feature: &Feature) -> Self {
        Self {
            id: feature.id.clone(),
            section: feature.section.clone(),
            title: feature.title.clone(),
            status: feature.status.clone(),
            // JS always surfaces depends_on (default []).
            depends_on: feature.depends_on.clone(),
            acceptance: feature.acceptance.as_ref().map(acceptance_json),
            notes: feature.notes.clone(),
        }
    }
}

fn acceptance_json(acceptance: &Acceptance) -> Value {
    match acceptance {
        Acceptance::Text(s) => Value::String(s.clone()),
        Acceptance::List(items) => json!(items),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static TEMP_SEQ: AtomicU64 = AtomicU64::new(0);

    fn temp_dir() -> PathBuf {
        let n = TEMP_SEQ.fetch_add(1, Ordering::Relaxed);
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |d| d.as_nanos());
        let dir = std::env::temp_dir().join(format!(
            "the-loop-graph-cmd-{}-{}-{}",
            std::process::id(),
            nanos,
            n
        ));
        fs::create_dir_all(&dir).expect("temp dir");
        dir
    }

    fn write_graph(dir: &Path, name: &str, text: &str) -> PathBuf {
        let path = dir.join(name);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("parent");
        }
        fs::write(&path, text).expect("write graph");
        path
    }

    /// Canonical valid two-feature graph (emit(parse) == text).
    const VALID_CANONICAL: &str = r#"{
  "design_version": 1,
  "features": [
    {
      "id": "alpha",
      "section": "fixture skeleton",
      "title": "Alpha feature",
      "status": "designed",
      "depends_on": [],
      "acceptance": [
        "alpha criterion one",
        "alpha criterion two"
      ],
      "notes": [
        "alpha design note"
      ]
    },
    {
      "id": "beta",
      "title": "Beta feature",
      "status": "proposed",
      "depends_on": [
        "alpha"
      ]
    }
  ]
}
"#;

    /// Content-equal hand-edit: shuffled keys, 4-space indent, no trailing newline.
    const VALID_SHUFFLED: &str = r#"{
    "features": [
        {
            "notes": [
                "alpha design note"
            ],
            "acceptance": [
                "alpha criterion one",
                "alpha criterion two"
            ],
            "depends_on": [],
            "status": "designed",
            "title": "Alpha feature",
            "section": "fixture skeleton",
            "id": "alpha"
        },
        {
            "status": "proposed",
            "depends_on": [
                "alpha"
            ],
            "title": "Beta feature",
            "id": "beta"
        }
    ],
    "design_version": 1
}"#;

    const INVALID_DANGLING: &str = r#"{
  "design_version": 1,
  "features": [
    {
      "id": "alpha",
      "title": "Alpha",
      "status": "designed",
      "depends_on": [
        "ghost"
      ],
      "acceptance": "ok"
    },
    {
      "id": "beta",
      "title": "Beta",
      "status": "proposed"
    }
  ]
}
"#;

    // ── check ──────────────────────────────────────────────────────────────

    #[test]
    fn check_valid_canonical_prints_ok_and_exits_zero() {
        let dir = temp_dir();
        let path = write_graph(&dir, "docs/feature-graph.json", VALID_CANONICAL);
        let result = check(&path);
        assert_eq!(result.exit_code, 0, "stderr={}", result.stderr);
        assert!(result.stderr.is_empty());
        assert!(
            result.stdout.starts_with("OK  ") || result.stdout.contains("OK  "),
            "expected OK summary; got {}",
            result.stdout
        );
        assert!(
            result.stdout.contains("2 features")
                && result.stdout.contains("0 error(s)")
                && result.stdout.contains("0 warning(s)"),
            "got {}",
            result.stdout
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn check_invalid_exits_one_with_fail_naming_each_offense() {
        let dir = temp_dir();
        let path = write_graph(&dir, "graph.json", INVALID_DANGLING);
        let result = check(&path);
        assert_eq!(result.exit_code, 1);
        assert!(
            result.stdout.contains("ERROR dangling-dependency"),
            "must name dangling-dependency; got {}",
            result.stdout
        );
        assert!(
            result.stdout.contains("ghost"),
            "must name the unknown dep; got {}",
            result.stdout
        );
        assert!(
            result.stdout.contains("FAIL") && result.stdout.contains("2 features"),
            "FAIL summary; got {}",
            result.stdout
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn check_malformed_json_exits_one_with_fail_naming_offense() {
        let dir = temp_dir();
        let path = write_graph(&dir, "bad.json", "{not json");
        let result = check(&path);
        assert_eq!(result.exit_code, 1);
        assert!(
            result.stdout.contains("ERROR")
                && result.stdout.to_ascii_lowercase().contains("malformed"),
            "must name malformed JSON; got {}",
            result.stdout
        );
        assert!(
            result.stdout.contains("FAIL"),
            "FAIL summary required; got {}",
            result.stdout
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn check_round_trip_criterion_emit_parse_equals_text() {
        // Shuffled valid content fails byte round-trip even though validate is ok.
        let dir = temp_dir();
        let path = write_graph(&dir, "shuffled.json", VALID_SHUFFLED);
        let result = check(&path);
        assert_eq!(result.exit_code, 1, "non-canonical must fail round-trip");
        assert!(
            result.stdout.contains("round-trip") && result.stdout.contains("emit(parse(text))"),
            "must name the emit(parse(text)) criterion; got {}",
            result.stdout
        );
        assert!(result.stdout.contains("FAIL"));
        // Canonical form of the same content passes.
        let path2 = write_graph(&dir, "canonical.json", VALID_CANONICAL);
        let ok = check(&path2);
        assert_eq!(ok.exit_code, 0, "canonical must pass: {}", ok.stdout);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn check_default_path_is_docs_feature_graph_json() {
        assert_eq!(DEFAULT_GRAPH, "docs/feature-graph.json");
        assert_eq!(
            resolve_graph_path(None),
            PathBuf::from("docs/feature-graph.json")
        );
        let custom = PathBuf::from("alt/graph.json");
        assert_eq!(resolve_graph_path(Some(custom.clone())), custom);
    }

    #[test]
    fn check_honors_optional_positional_path() {
        let dir = temp_dir();
        let path = write_graph(&dir, "elsewhere/graph.json", VALID_CANONICAL);
        // Not under docs/ — must still succeed when path is supplied.
        let result = check(&path);
        assert_eq!(result.exit_code, 0, "{}", result.stdout);
        let _ = fs::remove_dir_all(&dir);
    }

    // ── list ───────────────────────────────────────────────────────────────

    #[test]
    fn list_prints_design_version_and_features_as_pretty_json() {
        let dir = temp_dir();
        let path = write_graph(&dir, "g.json", VALID_CANONICAL);
        let result = list(&path);
        assert_eq!(result.exit_code, 0, "stderr={}", result.stderr);
        assert!(result.stdout.ends_with('\n'), "trailing newline required");
        assert!(
            !result.stdout.ends_with("\n\n"),
            "exactly one trailing newline"
        );
        let value: Value =
            serde_json::from_str(result.stdout.trim_end()).expect("list stdout must be JSON");
        assert_eq!(value["designVersion"], json!(1));
        assert!(value.get("design_version").is_none(), "camelCase key only");
        let features = value["features"].as_array().expect("features array");
        assert_eq!(features.len(), 2);
        assert_eq!(features[0]["id"], "alpha");
        assert_eq!(features[0]["section"], "fixture skeleton");
        assert_eq!(features[0]["notes"], json!(["alpha design note"]));
        assert_eq!(features[1]["id"], "beta");
        assert!(features[1].get("section").is_none());
        assert!(features[1].get("notes").is_none());
        // 2-space indent
        assert!(
            result.stdout.contains("\n  \"designVersion\"")
                || result.stdout.contains("\n  \"features\""),
            "2-space indent expected; got {}",
            result.stdout
        );
        let _ = fs::remove_dir_all(&dir);
    }

    // ── set-status ─────────────────────────────────────────────────────────

    #[test]
    fn set_status_flips_one_feature_rewrites_canonically_prints_record() {
        let dir = temp_dir();
        let path = write_graph(&dir, "g.json", VALID_CANONICAL);
        let before = fs::read(&path).expect("read before");
        let result = set_status(&path, "alpha", "validated");
        assert_eq!(result.exit_code, 0, "stderr={}", result.stderr);
        let node: Value =
            serde_json::from_str(result.stdout.trim_end()).expect("printed record JSON");
        assert_eq!(node["id"], "alpha");
        assert_eq!(node["status"], "validated");
        assert_eq!(node["section"], "fixture skeleton");

        let after = fs::read_to_string(&path).expect("read after");
        assert_ne!(after.as_bytes(), before.as_slice());
        assert!(after.ends_with('\n'));
        // Canonical emit of mutated graph.
        let graph = parse(&after).expect("rewritten file parses");
        assert_eq!(graph.features[0].status, "validated");
        assert_eq!(
            after,
            emit(&graph),
            "file must be byte-canonical after write"
        );
        // Other feature untouched.
        assert_eq!(graph.features[1].status, "proposed");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn set_status_unknown_id_exits_one_stderr_file_unchanged() {
        let dir = temp_dir();
        let path = write_graph(&dir, "g.json", VALID_CANONICAL);
        let before = fs::read(&path).expect("before");
        let result = set_status(&path, "ghost", "validated");
        assert_eq!(result.exit_code, 1);
        assert!(result.stdout.is_empty(), "stdout must be empty");
        assert!(
            result.stderr.contains("unknown feature id") && result.stderr.contains("ghost"),
            "stderr={}",
            result.stderr
        );
        assert_eq!(fs::read(&path).expect("after"), before);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn set_status_out_of_enum_exits_one_stderr_file_unchanged() {
        let dir = temp_dir();
        let path = write_graph(&dir, "g.json", VALID_CANONICAL);
        let before = fs::read(&path).expect("before");
        let result = set_status(&path, "alpha", "building");
        assert_eq!(result.exit_code, 1);
        assert!(result.stdout.is_empty());
        assert!(
            result.stderr.contains("status must be one of")
                && result.stderr.contains("building")
                && result
                    .stderr
                    .contains("proposed|designed|validated|shipped"),
            "stderr={}",
            result.stderr
        );
        assert_eq!(fs::read(&path).expect("after"), before);
        let _ = fs::remove_dir_all(&dir);
    }

    // ── missing graph file ─────────────────────────────────────────────────

    #[test]
    fn missing_graph_file_is_stderr_refusal_exit_1_empty_stdout_on_all_three() {
        let dir = temp_dir();
        let missing = dir.join("docs/feature-graph.json");
        assert!(!missing.exists());

        for (name, result) in [
            ("check", check(&missing)),
            ("list", list(&missing)),
            ("set-status", set_status(&missing, "alpha", "validated")),
        ] {
            assert_eq!(result.exit_code, 1, "{name} exit");
            assert!(
                result.stdout.is_empty(),
                "{name} stdout must be empty; got {:?}",
                result.stdout
            );
            assert!(
                !result.stderr.is_empty() && result.stderr.starts_with("spine:"),
                "{name} stderr refusal; got {:?}",
                result.stderr
            );
        }
        let _ = fs::remove_dir_all(&dir);
    }
}
