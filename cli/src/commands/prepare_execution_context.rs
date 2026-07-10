//! `prepare-execution-context` — the one-shot execution-context assembler (ADR-0036/0038).
//!
//! Gates (in order) the feature graph, the requested scope, the resolved
//! model-bindings/registry, and every per-feature plan; gathers each feature's
//! design doc, feature-branch plan, and git-derived task state; then prints the
//! execution context the workflow consumes. `--script-out` additionally writes a
//! per-run copy of the canonical workflow script with the meta description and the
//! `EMBEDDED_CONTEXT` literal spliced in — byte-identical to the JS CLI modulo the
//! stamped `preparedAt` and the sanctioned `cli` value. Ports
//! `prepareExecutionContextCommand` in `plugin/bin/cli-commands.js`.

use std::collections::HashMap;
use std::fs;
use std::io::{self, Write};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::{Map, Value, json};

use crate::commands::hooks_list::{build_hooks_table, compact_family_json};
use crate::commands::models_list::build_models_table;
use crate::context::{
    AssembleInput, ExecutionContext, FeatureEntry, FeatureInputs, FeatureMap, PlanFragment,
    assemble_execution_context, check_scope, feature_branch, section_after,
};
use crate::graph::{FeatureGraph, parse};
use crate::io::{fail, out, warn};
use crate::plan::{
    Task, TaskAcceptance, parse as parse_plan, plan_path, validate as validate_plan,
};
use crate::settings::HOOK_FAMILY_ORDER;
use crate::splice::{describe_run, splice_workflow_script};
use crate::validate::{Issue, validate};
use crate::{DEFAULT_WORKFLOW_SCRIPT, commands::graph::DEFAULT_GRAPH};

/// Architecture doc scanned for the `## Validation procedure` probe (cwd-relative).
const ARCHITECTURE_MD: &str = "docs/architecture.md";
/// Calibration index scanned for the `## Digest` section (cwd-relative).
const CALIBRATION_INDEX: &str = "docs/calibration/index.md";
/// The `cli` invocation every downstream worker shells to — the one sanctioned
/// content difference from the JS CLI (which emits `node "<plugin>/bin/the-loop.js"`).
const RUST_CLI: &str = "the-loop";

/// Run `prepare-execution-context`. Prints the execution context on stdout, or
/// refuses via [`fail`] (exit 1, empty stdout) on any gate failure.
pub fn run(
    features: Option<&str>,
    target: Option<&str>,
    script_out: Option<&str>,
    graph_path: Option<&str>,
) {
    let (Some(features), Some(target)) = (features, target) else {
        fail(
            "usage: the-loop prepare-execution-context --features <id,id,…> --target-branch <ref> [--script-out <path>] [--graph-path <path>]",
        );
    };
    let scope: Vec<String> = features
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
        .collect();
    let graph_file = graph_path.unwrap_or(DEFAULT_GRAPH);

    // ── Gate 1: graph validation (read + parse + schema) ──
    let graph_text = match fs::read_to_string(graph_file) {
        Ok(t) => t,
        Err(err) => fail(&format!("could not read {graph_file}: {err}")),
    };
    let model = match parse(&graph_text) {
        Ok(m) => m,
        Err(err) => fail(&format!(
            "the feature graph fails validation — fix {graph_file} first: {err}"
        )),
    };
    fail_on_issues(
        &validate(&model).errors,
        &format!("the feature graph fails validation — fix {graph_file} first"),
    );

    // ── Gate 2: scope gate ──
    fail_on_issues(
        &check_scope(&model, &scope).errors,
        "scope gate failed — nothing prepared",
    );

    // ── Gate 3: model-bindings / registry validation ──
    let (models, validation) = match build_models_table(None, None) {
        Ok(pair) => pair,
        Err(err) => fail(&err),
    };
    {
        let mut stderr = io::stderr().lock();
        for w in &validation.warnings {
            let _ = writeln!(stderr, "warn {}: {} ({})", w.code, w.message, w.where_role);
        }
    }
    if !validation.errors.is_empty() {
        let mut stderr = io::stderr().lock();
        for e in &validation.errors {
            let _ = writeln!(stderr, "error {}: {} ({})", e.code, e.message, e.where_role);
        }
        drop(stderr);
        fail("model bindings failed executor validation — nothing prepared");
    }

    let hooks = match build_hooks_table() {
        Ok(h) => h,
        Err(err) => fail(&err),
    };

    let probe = read_optional(ARCHITECTURE_MD)
        .and_then(|text| section_after(&text, "## Validation procedure"));
    if probe.is_none() {
        warn(&format!(
            "no \"## Validation procedure\" section in {ARCHITECTURE_MD} — validation runs without one"
        ));
    }

    // Wall-clock stamp once — the only legal clock read for this command.
    let prepared_at = iso8601_now();
    // No calibration history is the common case; missing file/section → None, no warn.
    let calibration =
        read_optional(CALIBRATION_INDEX).and_then(|text| section_after(&text, "## Digest"));

    // ── Gate 4: per-feature gathering (plans gated here) ──
    let mut inputs: HashMap<String, FeatureInputs> = HashMap::new();
    for id in &scope {
        inputs.insert(id.clone(), gather_feature_inputs(id, &model));
    }

    let ctx = assemble_execution_context(&AssembleInput {
        model: &model,
        scope: &scope,
        target,
        probe: probe.as_deref(),
        models,
        hooks,
        inputs,
        prepared_at: &prepared_at,
        calibration: calibration.as_deref(),
        cli: Some(RUST_CLI),
    });

    // Both splices must succeed before any byte is written; a shape-gate failure
    // exits 1 with nothing written, stdout included.
    if let Some(path) = script_out {
        write_spliced_workflow_script(path, &ctx);
    }
    out(&ctx);
}

/// Print each issue to stderr then refuse — the shared gate refusal.
fn fail_on_issues(errors: &[Issue], message: &str) {
    if errors.is_empty() {
        return;
    }
    {
        let mut stderr = io::stderr().lock();
        for e in errors {
            let where_ = e
                .r#where
                .as_deref()
                .map(|w| format!(" ({w})"))
                .unwrap_or_default();
            let _ = writeln!(stderr, "error {}: {}{}", e.code, e.message, where_);
        }
    }
    fail(message);
}

/// One feature's execution-context inputs: design doc, feature-branch plan, and
/// the head subjects of its branches (task state).
fn gather_feature_inputs(id: &str, model: &FeatureGraph) -> FeatureInputs {
    let doc_file = format!("docs/designs/{id}/design.md");
    let mut design_doc = read_optional(&doc_file);
    // A fix has no per-feature design doc — its slice is its bug doc instead.
    if design_doc.is_none() {
        design_doc = read_optional(&format!("docs/bugs/{id}.md"));
    }
    if design_doc.is_none() {
        warn(&format!("no per-feature design doc at {doc_file}"));
    }

    let branch_heads = read_branch_heads(id);
    let plan = read_plan_text(id, &branch_heads).map(|text| gate_plan(id, &text, model));
    FeatureInputs {
        design_doc,
        plan,
        branch_heads,
    }
}

/// The plan's durable home is the feature branch; a working-tree file is tolerated
/// with a warning; absence is simply "not planned yet".
fn read_plan_text(id: &str, branch_heads: &HashMap<String, String>) -> Option<String> {
    if branch_heads.contains_key(&feature_branch(id))
        && let Some(on_branch) =
            git_capture(&["show", &format!("{}:{}", feature_branch(id), plan_path(id))])
    {
        return Some(on_branch);
    }
    let path = plan_path(id);
    if !Path::new(&path).exists() {
        return None;
    }
    warn(&format!(
        "plan for {id} read from the working tree, not its branch — commit it to {}",
        feature_branch(id)
    ));
    fs::read_to_string(&path).ok()
}

/// A plan that reaches the execution context must validate against the graph.
fn gate_plan(id: &str, plan_text: &str, model: &FeatureGraph) -> PlanFragment {
    let plan = match parse_plan(plan_text) {
        Ok(p) => p,
        Err(err) => fail(&format!("plan for {id} is malformed: {err}")),
    };
    let result = validate_plan(&plan, model);
    for w in &result.warnings {
        let where_ = w
            .r#where
            .as_deref()
            .map(|s| format!(" ({s})"))
            .unwrap_or_default();
        warn(&format!("plan {id}: {} — {}{}", w.code, w.message, where_));
    }
    fail_on_issues(
        &result.errors,
        &format!("plan for {id} fails validation — nothing prepared"),
    );
    PlanFragment {
        design_version: plan.design_version,
        tasks: plan.tasks.iter().map(task_to_value).collect(),
    }
}

/// Build a task's JSON value in JS `normalizeTask` key order (`id`, `title`,
/// `covers`, `acceptance?`, `footprint`, `size`, `depends_on`, `judgment_level?`,
/// `wiring?`).
fn task_to_value(task: &Task) -> Value {
    let mut map = Map::new();
    map.insert("id".to_owned(), json!(task.id));
    map.insert("title".to_owned(), json!(task.title));
    map.insert("covers".to_owned(), Value::Array(task.covers.clone()));
    if let Some(acceptance) = &task.acceptance {
        map.insert("acceptance".to_owned(), acceptance_value(acceptance));
    }
    map.insert("footprint".to_owned(), json!(task.footprint));
    map.insert("size".to_owned(), json!(task.size));
    map.insert("depends_on".to_owned(), json!(task.depends_on));
    if let Some(level) = &task.judgment_level {
        map.insert("judgment_level".to_owned(), json!(level));
    }
    if let Some(wiring) = &task.wiring {
        map.insert("wiring".to_owned(), json!(wiring));
    }
    Value::Object(map)
}

fn acceptance_value(acceptance: &TaskAcceptance) -> Value {
    match acceptance {
        TaskAcceptance::Text(s) => Value::String(s.clone()),
        TaskAcceptance::List(items) => json!(items),
    }
}

/// Head subjects of every branch belonging to a feature: `loop/<id>` and `loop/<id>--*`.
fn read_branch_heads(id: &str) -> HashMap<String, String> {
    let feature = feature_branch(id);
    let refspec = format!("refs/heads/{feature}");
    let task_pattern = format!("refs/heads/{feature}--*");
    let raw = git_capture(&[
        "for-each-ref",
        &refspec,
        &task_pattern,
        "--format=%(refname:short)\t%(subject)",
    ])
    .unwrap_or_default();

    let mut heads = HashMap::new();
    for line in raw.lines().filter(|l| !l.is_empty()) {
        // JS: `const [name, ...subject] = line.split('\t'); heads[name] = subject.join('\t')`.
        match line.split_once('\t') {
            Some((name, subject)) => heads.insert(name.to_owned(), subject.to_owned()),
            None => heads.insert(line.to_owned(), String::new()),
        };
    }
    heads
}

/// Run git with literal argv (never a shell) and capture stdout on success.
/// Any failure (non-zero exit, spawn error) yields `None` — the optional-read shape
/// the gathering paths tolerate (`gitShowOptional`, empty `for-each-ref`).
fn git_capture(args: &[&str]) -> Option<String> {
    let output = std::process::Command::new("git").args(args).output().ok()?;
    if output.status.success() {
        Some(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        None
    }
}

/// Read a cwd-relative file, `None` when it does not exist or cannot be read.
fn read_optional(path: &str) -> Option<String> {
    fs::read_to_string(path).ok()
}

/// The canonical workflow script spliced for this run, meta description and
/// `EMBEDDED_CONTEXT` both replaced — refused (nothing written) if either gate fails.
fn write_spliced_workflow_script(path: &str, ctx: &ExecutionContext) {
    let description = describe_run(&ctx.scope, &ctx.target);
    let context_json = compact_execution_context(ctx);
    match splice_workflow_script(DEFAULT_WORKFLOW_SCRIPT, &description, &context_json) {
        Ok(spliced) => {
            if let Err(err) = fs::write(path, spliced) {
                fail(&format!("could not write {path}: {err}"));
            }
        }
        Err(err) => fail(&err),
    }
}

// ── byte-exact compact serialization (JS `JSON.stringify` key order) ──────────

/// Compact the execution context byte-identically to JS `JSON.stringify` — the
/// literal the `EMBEDDED_CONTEXT` splice embeds. `serde_json::Value` alphabetizes
/// object keys, so `models`, `hooks`, `features`, and each plan task are emitted
/// through explicit key orders rather than the default serializer.
fn compact_execution_context(ctx: &ExecutionContext) -> String {
    let mut parts = vec![
        format!("\"target\":{}", json_string(&ctx.target)),
        format!("\"scope\":{}", json_string_array(&ctx.scope)),
        format!("\"probe\":{}", optional_json_string(ctx.probe.as_deref())),
        format!(
            "\"models\":{}",
            compact_family_json("modelBindings", &ctx.models)
        ),
        format!("\"hooks\":{}", compact_hooks(&ctx.hooks)),
        format!("\"features\":{}", compact_features(&ctx.features)),
        format!("\"preparedAt\":{}", json_string(&ctx.prepared_at)),
    ];
    if let Some(calibration) = &ctx.calibration {
        parts.push(format!("\"calibration\":{}", json_string(calibration)));
    }
    if let Some(cli) = &ctx.cli {
        parts.push(format!("\"cli\":{}", json_string(cli)));
    }
    format!("{{{}}}", parts.join(","))
}

/// Hooks table in inventory order, each family through [`compact_family_json`].
fn compact_hooks(hooks: &Value) -> String {
    let parts: Vec<String> = HOOK_FAMILY_ORDER
        .iter()
        .filter(|&&family| family != "exampleBlock")
        .map(|&family| {
            let entry = hooks.get(family).cloned().unwrap_or(Value::Null);
            format!(
                "{}:{}",
                json_string(family),
                compact_family_json(family, &entry)
            )
        })
        .collect();
    format!("{{{}}}", parts.join(","))
}

/// Features object in scope insertion order.
fn compact_features(features: &FeatureMap) -> String {
    let parts: Vec<String> = features
        .0
        .iter()
        .map(|(id, entry)| format!("{}:{}", json_string(id), compact_feature_entry(entry)))
        .collect();
    format!("{{{}}}", parts.join(","))
}

/// One feature entry in JS `featureEntry` key order.
fn compact_feature_entry(entry: &FeatureEntry) -> String {
    let mut parts = vec![
        format!("\"id\":{}", json_string(&entry.id)),
        format!("\"title\":{}", json_string(&entry.title)),
        format!("\"acceptance\":{}", json_string_array(&entry.acceptance)),
        format!("\"depends_on\":{}", json_string_array(&entry.depends_on)),
    ];
    if let Some(notes) = &entry.notes {
        parts.push(format!("\"notes\":{}", json_string_array(notes)));
    }
    parts.push(format!(
        "\"designDoc\":{}",
        optional_json_string(entry.design_doc.as_deref())
    ));
    parts.push(format!("\"branch\":{}", json_string(&entry.branch)));
    parts.push(format!(
        "\"branchHead\":{}",
        optional_json_string(entry.branch_head.as_deref())
    ));
    parts.push(format!("\"plan\":{}", compact_plan(entry.plan.as_ref())));
    parts.push(format!(
        "\"builtTasks\":{}",
        json_string_array(&entry.built_tasks)
    ));
    format!("{{{}}}", parts.join(","))
}

/// Plan fragment `{designVersion, tasks}` or `null`.
fn compact_plan(plan: Option<&PlanFragment>) -> String {
    let Some(plan) = plan else {
        return "null".to_owned();
    };
    let design_version =
        serde_json::to_string(&plan.design_version).unwrap_or_else(|_| "null".to_owned());
    let tasks: Vec<String> = plan.tasks.iter().map(compact_task).collect();
    format!(
        "{{\"designVersion\":{design_version},\"tasks\":[{}]}}",
        tasks.join(",")
    )
}

/// One plan task in `normalizeTask` key order; every field value is a scalar or a
/// flat array, so the default compact serializer preserves it byte-for-byte.
fn compact_task(task: &Value) -> String {
    const ORDER: &[&str] = &[
        "id",
        "title",
        "covers",
        "acceptance",
        "footprint",
        "size",
        "depends_on",
        "judgment_level",
        "wiring",
    ];
    let Some(map) = task.as_object() else {
        return serde_json::to_string(task).unwrap_or_else(|_| "null".to_owned());
    };
    let parts: Vec<String> = ORDER
        .iter()
        .filter_map(|&key| {
            let value = map.get(key)?;
            let encoded = serde_json::to_string(value).unwrap_or_else(|_| "null".to_owned());
            Some(format!("{}:{encoded}", json_string(key)))
        })
        .collect();
    format!("{{{}}}", parts.join(","))
}

fn json_string(s: &str) -> String {
    serde_json::to_string(s).unwrap_or_else(|_| "\"\"".to_owned())
}

fn json_string_array(items: &[String]) -> String {
    let parts: Vec<String> = items.iter().map(|s| json_string(s)).collect();
    format!("[{}]", parts.join(","))
}

fn optional_json_string(value: Option<&str>) -> String {
    value.map_or_else(|| "null".to_owned(), json_string)
}

// ── ISO-8601 wall-clock stamp ─────────────────────────────────────────────────

/// UTC ISO-8601 stamp with millisecond precision (`YYYY-MM-DDTHH:MM:SS.mmmZ`) —
/// byte-shape-identical to JS `new Date().toISOString()`. The command's only clock read.
fn iso8601_now() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = now.as_secs();
    let millis = now.subsec_millis();
    let days = i64::try_from(secs / 86_400).unwrap_or(0);
    let tod = secs % 86_400;
    let (hour, minute, second) = (tod / 3600, (tod % 3600) / 60, tod % 60);
    let (year, month, day) = civil_from_days(days);
    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{millis:03}Z")
}

/// Civil (year, month, day) from a count of days since the Unix epoch
/// (Howard Hinnant's `civil_from_days`). Valid across the full supported range.
const fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365; // [0, 399]
    let year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let day = doy - (153 * mp + 2) / 5 + 1; // [1, 31]
    let month = if mp < 10 { mp + 3 } else { mp - 9 }; // [1, 12]
    (if month <= 2 { year + 1 } else { year }, month, day)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn iso8601_now_has_millisecond_z_shape() {
        let stamp = iso8601_now();
        // YYYY-MM-DDTHH:MM:SS.mmmZ — the shape the oracle's PREPARED_AT_VALUE demands.
        let bytes = stamp.as_bytes();
        assert_eq!(stamp.len(), 24, "stamp {stamp:?} must be 24 chars");
        assert_eq!(bytes[4], b'-');
        assert_eq!(bytes[7], b'-');
        assert_eq!(bytes[10], b'T');
        assert_eq!(bytes[13], b':');
        assert_eq!(bytes[16], b':');
        assert_eq!(bytes[19], b'.');
        assert_eq!(bytes[23], b'Z');
        assert!(
            stamp[..4].chars().all(|c| c.is_ascii_digit()),
            "year digits in {stamp:?}"
        );
        assert!(
            stamp[20..23].chars().all(|c| c.is_ascii_digit()),
            "millisecond digits in {stamp:?}"
        );
    }

    #[test]
    fn civil_from_days_pins_known_epoch_dates() {
        assert_eq!(civil_from_days(0), (1970, 1, 1));
        assert_eq!(civil_from_days(18_993), (2022, 1, 1));
        // 2026-07-10 — a leap-adjacent recent date.
        assert_eq!(civil_from_days(20_644), (2026, 7, 10));
    }
}
