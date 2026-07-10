//! Plan subcommands: `plan parse`, `plan check`, `plan task`.
//!
//! Thin I/O layer over [`crate::plan`] and the feature-graph model. Default plan
//! path is `docs/plans/<id>/plan.json`; default graph path is
//! [`super::graph::DEFAULT_GRAPH`]. Exit codes and stdout shapes match the JS CLI
//! (`plugin/bin/cli-commands.js`), with camelCase `designVersion` on `plan parse`
//! and `snake_case` `design_version` on `plan task`.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::{Value, json};

use super::graph::{CommandResult, DEFAULT_GRAPH};
use crate::graph::parse as parse_graph;
use crate::plan::{
    Plan, ResolvedTask, Task, TaskAcceptance, emit, parse, plan_path, resolve_task, validate,
};
use crate::validate::Issue;

/// Resolve the plan path: optional positional, else `docs/plans/<id>/plan.json`.
#[must_use]
pub fn resolve_plan_path(feature_id: &str, path: Option<PathBuf>) -> PathBuf {
    path.unwrap_or_else(|| PathBuf::from(plan_path(feature_id)))
}

/// Resolve the graph path for plan check/task: optional positional, else default.
#[must_use]
pub fn resolve_plan_graph_path(path: Option<PathBuf>) -> PathBuf {
    path.unwrap_or_else(|| PathBuf::from(DEFAULT_GRAPH))
}

/// `the-loop plan parse <feature-id> [path]` — parsed plan as JSON.
#[must_use]
pub fn plan_parse(feature_id: &str, path: Option<PathBuf>) -> CommandResult {
    let path = resolve_plan_path(feature_id, path);
    let text = match fs::read_to_string(&path) {
        Ok(t) => t,
        Err(err) => return CommandResult::refuse(read_error(&path, &err)),
    };
    let plan = match parse(&text) {
        Ok(p) => p,
        Err(err) => return CommandResult::refuse(err.to_string()),
    };
    let payload = ParseOutput::from_plan(&plan);
    match to_pretty_json(&payload) {
        Ok(s) => CommandResult::ok(s),
        Err(err) => CommandResult::refuse(err),
    }
}

/// `the-loop plan check <feature-id> [plan] [graph]` — validate + round-trip; OK/FAIL.
#[must_use]
pub fn plan_check(
    feature_id: &str,
    plan_file: Option<PathBuf>,
    graph_file: Option<PathBuf>,
) -> CommandResult {
    let plan_path = resolve_plan_path(feature_id, plan_file);
    let text = match fs::read_to_string(&plan_path) {
        Ok(t) => t,
        Err(err) => return CommandResult::refuse(read_error(&plan_path, &err)),
    };

    let model = match parse(&text) {
        Ok(p) => p,
        Err(err) => {
            let mut stdout = String::new();
            push_issue_line(
                &mut stdout,
                "ERROR",
                "malformed-json",
                &err.to_string(),
                None,
            );
            // feature-mismatch still checked after a failed parse? JS never gets here.
            push_plan_summary(&mut stdout, false, feature_id, 0, 1, 0);
            return CommandResult::fail_stdout(stdout);
        }
    };

    let graph_path = resolve_plan_graph_path(graph_file);
    let graph_text = match fs::read_to_string(&graph_path) {
        Ok(t) => t,
        Err(err) => return CommandResult::refuse(read_error(&graph_path, &err)),
    };
    let design = match parse_graph(&graph_text) {
        Ok(g) => g,
        Err(err) => return CommandResult::refuse(err.to_string()),
    };

    let mut result = validate(&model, &design);
    if model.feature != feature_id {
        result.errors.push(Issue {
            code: "feature-mismatch".to_owned(),
            message: format!(
                "plan declares feature \"{}\" but was checked as \"{feature_id}\"",
                model.feature
            ),
            r#where: None,
        });
        result.ok = false;
    }

    let did_round_trip = emit(&model) == text;

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

    let good = result.ok && result.errors.is_empty() && did_round_trip;
    push_plan_summary(
        &mut stdout,
        good,
        feature_id,
        model.tasks.len(),
        result.errors.len(),
        result.warnings.len(),
    );

    if good {
        CommandResult::ok(stdout)
    } else {
        CommandResult::fail_stdout(stdout)
    }
}

/// `the-loop plan task <feature-id> <task-id> [plan] [graph]` — one task brief as JSON.
#[must_use]
pub fn plan_task(
    feature_id: &str,
    task_id: &str,
    plan_file: Option<PathBuf>,
    graph_file: Option<PathBuf>,
) -> CommandResult {
    let plan_path = resolve_plan_path(feature_id, plan_file);
    let text = match fs::read_to_string(&plan_path) {
        Ok(t) => t,
        Err(err) => return CommandResult::refuse(read_error(&plan_path, &err)),
    };
    let plan = match parse(&text) {
        Ok(p) => p,
        Err(err) => return CommandResult::refuse(err.to_string()),
    };
    if plan.feature != feature_id {
        return CommandResult::refuse(format!(
            "plan declares feature \"{}\", not \"{feature_id}\"",
            plan.feature
        ));
    }

    let graph_path = resolve_plan_graph_path(graph_file);
    let graph_text = match fs::read_to_string(&graph_path) {
        Ok(t) => t,
        Err(err) => return CommandResult::refuse(read_error(&graph_path, &err)),
    };
    let design = match parse_graph(&graph_text) {
        Ok(g) => g,
        Err(err) => return CommandResult::refuse(err.to_string()),
    };

    let brief = match resolve_task(&plan, &design, task_id) {
        Ok(b) => b,
        Err(err) => return CommandResult::refuse(err),
    };
    let payload = TaskOutput::from_resolved(&brief);
    match to_pretty_json(&payload) {
        Ok(s) => CommandResult::ok(s),
        Err(err) => CommandResult::refuse(err),
    }
}

fn read_error(path: &Path, err: &std::io::Error) -> String {
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

fn push_plan_summary(
    out: &mut String,
    good: bool,
    feature_id: &str,
    n_tasks: usize,
    n_errors: usize,
    n_warnings: usize,
) {
    // JS: `${good ? 'OK  ' : 'FAIL'} plan ${featureId}: ${n} task(s) — …`
    if good {
        out.push_str("OK  ");
    } else {
        out.push_str("FAIL");
    }
    out.push_str(" plan ");
    out.push_str(feature_id);
    out.push_str(": ");
    out.push_str(&n_tasks.to_string());
    out.push_str(" task(s) — ");
    out.push_str(&n_errors.to_string());
    out.push_str(" error(s), ");
    out.push_str(&n_warnings.to_string());
    out.push_str(" warning(s)\n");
}

fn to_pretty_json<T: Serialize>(value: &T) -> Result<String, String> {
    let body = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    Ok(format!("{body}\n"))
}

/// `plan parse` stdout: camelCase `designVersion` (matches JS `clean(parsePlan)`).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ParseOutput {
    feature: String,
    design_version: Value,
    tasks: Vec<TaskOut>,
}

impl ParseOutput {
    fn from_plan(plan: &Plan) -> Self {
        Self {
            feature: plan.feature.clone(),
            design_version: plan.design_version.clone(),
            tasks: plan.tasks.iter().map(TaskOut::from_task).collect(),
        }
    }
}

/// `plan task` stdout: `snake_case` `design_version` (matches JS `resolveTask`).
#[derive(Debug, Serialize)]
struct TaskOutput {
    feature: String,
    design_version: Value,
    task: TaskOut,
    covers_criteria: Vec<String>,
}

impl TaskOutput {
    fn from_resolved(brief: &ResolvedTask) -> Self {
        Self {
            feature: brief.feature.clone(),
            design_version: brief.design_version.clone(),
            task: TaskOut::from_task(&brief.task),
            covers_criteria: brief.covers_criteria.clone(),
        }
    }
}

/// Shared task view for parse/task stdout (mirrors JS `normalizeTask`).
#[derive(Debug, Serialize)]
struct TaskOut {
    id: String,
    title: String,
    covers: Vec<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    acceptance: Option<Value>,
    footprint: Vec<String>,
    size: String,
    depends_on: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    judgment_level: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    wiring: Option<String>,
}

impl TaskOut {
    fn from_task(task: &Task) -> Self {
        Self {
            id: task.id.clone(),
            title: task.title.clone(),
            covers: task.covers.clone(),
            acceptance: task.acceptance.as_ref().map(task_acceptance_json),
            footprint: task.footprint.clone(),
            size: task.size.clone(),
            depends_on: task.depends_on.clone(),
            judgment_level: task.judgment_level.clone(),
            wiring: task.wiring.clone(),
        }
    }
}

fn task_acceptance_json(acceptance: &TaskAcceptance) -> Value {
    match acceptance {
        TaskAcceptance::Text(s) => Value::String(s.clone()),
        TaskAcceptance::List(items) => json!(items),
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
            "the-loop-plan-cmd-{}-{}-{}",
            std::process::id(),
            nanos,
            n
        ));
        fs::create_dir_all(&dir).expect("temp dir");
        dir
    }

    fn write(dir: &Path, rel: &str, text: &str) -> PathBuf {
        let path = dir.join(rel);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("parent");
        }
        fs::write(&path, text).expect("write");
        path
    }

    const PLAN: &str = r#"{
  "feature": "alpha",
  "design_version": 1,
  "tasks": [
    {
      "id": "alpha-core",
      "title": "Implement alpha core",
      "covers": [
        0,
        1
      ],
      "acceptance": "alpha core satisfies both feature criteria",
      "footprint": [
        "src/alpha.js",
        "test/alpha.test.js"
      ],
      "size": "s",
      "judgment_level": "standard",
      "depends_on": [],
      "wiring": "foundational module the rest of the feature hangs on"
    }
  ]
}
"#;

    const GRAPH: &str = r#"{
  "design_version": 1,
  "features": [
    {
      "id": "alpha",
      "title": "Alpha feature",
      "status": "designed",
      "depends_on": [],
      "acceptance": [
        "alpha criterion one",
        "alpha criterion two"
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

    #[test]
    fn plan_parse_prints_feature_design_version_tasks() {
        let dir = temp_dir();
        let path = write(&dir, "docs/plans/alpha/plan.json", PLAN);
        let result = plan_parse("alpha", Some(path));
        assert_eq!(result.exit_code, 0, "stderr={}", result.stderr);
        let value: Value = serde_json::from_str(result.stdout.trim_end()).unwrap();
        assert_eq!(value["feature"], "alpha");
        assert_eq!(value["designVersion"], json!(1));
        assert!(value.get("design_version").is_none());
        assert_eq!(value["tasks"][0]["id"], "alpha-core");
        assert_eq!(value["tasks"][0]["covers"], json!([0, 1]));
        assert_eq!(value["tasks"][0]["judgment_level"], "standard");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn plan_parse_missing_file_is_stderr_refusal() {
        let dir = temp_dir();
        let missing = dir.join("docs/plans/ghost/plan.json");
        let result = plan_parse("ghost", Some(missing));
        assert_eq!(result.exit_code, 1);
        assert!(result.stdout.is_empty());
        assert!(result.stderr.starts_with("spine:"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn plan_check_happy_path_ok() {
        let dir = temp_dir();
        let plan = write(&dir, "docs/plans/alpha/plan.json", PLAN);
        let graph = write(&dir, "docs/feature-graph.json", GRAPH);
        let result = plan_check("alpha", Some(plan), Some(graph));
        assert_eq!(result.exit_code, 0, "stdout={}", result.stdout);
        // JS template: `${'OK  '} plan …` yields three spaces between OK and plan.
        assert!(
            result.stdout.contains("OK   plan alpha: 1 task(s)"),
            "{}",
            result.stdout
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn plan_check_feature_mismatch_fails() {
        let dir = temp_dir();
        let plan = write(&dir, "docs/plans/alpha/plan.json", PLAN);
        let graph = write(&dir, "docs/feature-graph.json", GRAPH);
        let result = plan_check("beta", Some(plan), Some(graph));
        assert_eq!(result.exit_code, 1);
        assert!(
            result.stdout.contains("FAIL plan beta: 1 task(s)"),
            "{}",
            result.stdout
        );
        assert!(
            result.stdout.contains("feature-mismatch"),
            "{}",
            result.stdout
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn plan_check_bad_covers_ref_fails() {
        let dir = temp_dir();
        let bad = PLAN.replace(
            "\"covers\": [\n        0,\n        1\n      ]",
            "\"covers\": [\n        9\n      ]",
        );
        let plan = write(&dir, "docs/plans/alpha/plan.json", &bad);
        let graph = write(&dir, "docs/feature-graph.json", GRAPH);
        let result = plan_check("alpha", Some(plan), Some(graph));
        assert_eq!(result.exit_code, 1);
        assert!(
            result.stdout.contains("bad-covers-ref"),
            "{}",
            result.stdout
        );
        assert!(
            result.stdout.contains("FAIL plan alpha"),
            "{}",
            result.stdout
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn plan_check_bad_judgment_level_fails() {
        let dir = temp_dir();
        let bad = PLAN.replace("\"standard\"", "\"urgent\"");
        let plan = write(&dir, "docs/plans/alpha/plan.json", &bad);
        let graph = write(&dir, "docs/feature-graph.json", GRAPH);
        let result = plan_check("alpha", Some(plan), Some(graph));
        assert_eq!(result.exit_code, 1);
        assert!(
            result.stdout.contains("bad-judgment-level"),
            "{}",
            result.stdout
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn plan_check_task_dependency_cycle_fails() {
        let dir = temp_dir();
        let cyclic = r#"{
  "feature": "alpha",
  "design_version": 1,
  "tasks": [
    {
      "id": "a",
      "title": "A",
      "covers": [0],
      "acceptance": "a",
      "footprint": ["a.js"],
      "size": "s",
      "judgment_level": "standard",
      "depends_on": ["b"]
    },
    {
      "id": "b",
      "title": "B",
      "covers": [1],
      "acceptance": "b",
      "footprint": ["b.js"],
      "size": "s",
      "judgment_level": "standard",
      "depends_on": ["a"]
    }
  ]
}
"#;
        let plan = write(&dir, "docs/plans/alpha/plan.json", cyclic);
        let graph = write(&dir, "docs/feature-graph.json", GRAPH);
        let result = plan_check("alpha", Some(plan), Some(graph));
        assert_eq!(result.exit_code, 1);
        assert!(
            result.stdout.contains("task-dependency-cycle"),
            "{}",
            result.stdout
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn plan_task_prints_brief_with_snake_case_design_version() {
        let dir = temp_dir();
        let plan = write(&dir, "docs/plans/alpha/plan.json", PLAN);
        let graph = write(&dir, "docs/feature-graph.json", GRAPH);
        let result = plan_task("alpha", "alpha-core", Some(plan), Some(graph));
        assert_eq!(result.exit_code, 0, "stderr={}", result.stderr);
        let value: Value = serde_json::from_str(result.stdout.trim_end()).unwrap();
        assert_eq!(value["feature"], "alpha");
        assert_eq!(value["design_version"], json!(1));
        assert!(value.get("designVersion").is_none());
        assert_eq!(value["task"]["id"], "alpha-core");
        assert_eq!(
            value["covers_criteria"],
            json!(["alpha criterion one", "alpha criterion two"])
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn plan_task_unknown_id_is_stderr_refusal() {
        let dir = temp_dir();
        let plan = write(&dir, "docs/plans/alpha/plan.json", PLAN);
        let graph = write(&dir, "docs/feature-graph.json", GRAPH);
        let result = plan_task("alpha", "no-such-task", Some(plan), Some(graph));
        assert_eq!(result.exit_code, 1);
        assert!(result.stdout.is_empty());
        assert!(
            result.stderr.contains("unknown task id") && result.stderr.contains("no-such-task"),
            "{}",
            result.stderr
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn default_plan_path_is_docs_plans_id_plan_json() {
        assert_eq!(
            resolve_plan_path("alpha", None),
            PathBuf::from("docs/plans/alpha/plan.json")
        );
        assert_eq!(
            resolve_plan_graph_path(None),
            PathBuf::from("docs/feature-graph.json")
        );
    }
}
