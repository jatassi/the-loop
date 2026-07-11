//! Pure execution-context core (ADR-0036/0038): scope gating, git-derived task
//! state, markdown section extraction, and order-preserving assembly.
//!
//! Ports `plugin/src/prepare-execution-context.js` (`checkScope`, `builtTaskIds`,
//! `assembleExecutionContext`, `featureEntry`, branch/prefix helpers) and
//! `sectionAfter` from `plugin/src/replace-fenced-block.js`. Every input is a
//! function argument — no filesystem, process, or clock.

use std::collections::{HashMap, HashSet};

use serde::Serialize;
use serde_json::Value;

use crate::graph::{Acceptance, Feature, FeatureGraph};
use crate::validate::Issue;

/// Statuses that satisfy a `depends_on` edge (work behind it is landed).
fn is_done(status: &str) -> bool {
    status == "validated" || status == "shipped"
}

/// The feature's branch name.
#[must_use]
pub fn feature_branch(feature_id: &str) -> String {
    format!("loop/{feature_id}")
}

/// A task's branch within a feature.
#[must_use]
pub fn task_branch(feature_id: &str, task_id: &str) -> String {
    format!("loop/{feature_id}--{task_id}")
}

/// Commit-subject prefix that marks a task's landing commit.
#[must_use]
pub fn task_commit_prefix(feature_id: &str, task_id: &str) -> String {
    format!("{feature_id}/{task_id}: ")
}

/// Proposed-specific vs generic not-designed wording (mirrors JS `notDesignedMessage`).
fn not_designed_message(status: &str) -> String {
    if status == "proposed" {
        "feature is proposed, not designed — it must be designed first".to_owned()
    } else {
        format!("feature is {status}, not designed — nothing to run")
    }
}

/// Result of gating a requested scope against the graph.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScopeCheck {
    pub ok: bool,
    pub errors: Vec<Issue>,
}

/// Gate a requested scope: every id known, still `designed`, and every dependency
/// either already landed (`validated` | `shipped`) or in the same scope.
#[must_use]
pub fn check_scope(model: &FeatureGraph, scope: &[String]) -> ScopeCheck {
    let mut errors = Vec::new();
    let by_id: HashMap<&str, &Feature> =
        model.features.iter().map(|f| (f.id.as_str(), f)).collect();
    let in_scope: HashSet<&str> = scope.iter().map(String::as_str).collect();

    for id in scope {
        let Some(node) = by_id.get(id.as_str()) else {
            errors.push(Issue {
                code: "unknown-feature".to_owned(),
                message: format!("scope names unknown feature \"{id}\""),
                r#where: Some(id.clone()),
            });
            continue;
        };
        if node.status != "designed" {
            errors.push(Issue {
                code: "not-designed".to_owned(),
                message: not_designed_message(&node.status),
                r#where: Some(id.clone()),
            });
        }
        for dep in &node.depends_on {
            let dep_node = by_id.get(dep.as_str());
            let satisfied =
                dep_node.is_some_and(|d| is_done(&d.status) || in_scope.contains(dep.as_str()));
            if !satisfied {
                errors.push(Issue {
                    code: "unsatisfied-dependency".to_owned(),
                    message: format!("depends on \"{dep}\", which is neither landed nor in scope"),
                    r#where: Some(id.clone()),
                });
            }
        }
    }

    ScopeCheck {
        ok: errors.is_empty(),
        errors,
    }
}

/// Plan fragment the assembler threads into each feature entry: `{designVersion, tasks}`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct PlanFragment {
    #[serde(rename = "designVersion")]
    pub design_version: Value,
    pub tasks: Vec<Value>,
}

/// Which of a plan's tasks already landed, derived from branch-head subjects alone:
/// a task is built iff its branch head subject starts with `<feature>/<task>: `.
#[must_use]
pub fn built_task_ids<S: std::hash::BuildHasher>(
    feature_id: &str,
    plan: Option<&PlanFragment>,
    branch_heads: &HashMap<String, String, S>,
) -> Vec<String> {
    let Some(plan) = plan else {
        return Vec::new();
    };
    plan.tasks
        .iter()
        .filter_map(|task| {
            let id = task.get("id")?.as_str().filter(|s| !s.is_empty())?;
            let branch = task_branch(feature_id, id);
            let head = branch_heads.get(&branch).map_or("", String::as_str);
            if head.starts_with(&task_commit_prefix(feature_id, id)) {
                Some(id.to_owned())
            } else {
                None
            }
        })
        .collect()
}

/// Body after a full-line heading until the next `## ` heading (or end of text).
/// Leading and trailing newlines stripped. `None` when the heading is absent.
///
/// Mirrors `sectionAfter` in `plugin/src/replace-fenced-block.js`.
#[must_use]
pub fn section_after(text: &str, heading: &str) -> Option<String> {
    let body_start = find_heading_match_end(text, heading)?;
    let rest = &text[body_start..];
    let end = find_next_h2_offset(rest).map_or(text.len(), |i| body_start + i);
    let body = &text[body_start..end];
    Some(trim_newlines(body))
}

/// Locate a line-anchored heading (`^heading\s*$` multiline); return the byte
/// index at the end of the match. `$` ends before a newline (body may start
/// with `\n`, then stripped by [`trim_newlines`]).
fn find_heading_match_end(text: &str, heading: &str) -> Option<usize> {
    let mut search_from = 0;
    while search_from <= text.len() {
        let rest = &text[search_from..];
        let rel = rest.find(heading)?;
        let abs = search_from + rel;
        let at_line_start = abs == 0 || text.as_bytes().get(abs - 1) == Some(&b'\n');
        if !at_line_start {
            search_from = abs.saturating_add(1);
            continue;
        }

        let after_heading = abs + heading.len();
        let after = &text[after_heading..];
        let mut i = 0;
        let bytes = after.as_bytes();
        let mut ok = true;
        while i < bytes.len() {
            match bytes[i] {
                b' ' | b'\t' => i += 1,
                b'\n' => break, // `$` matches before LF; do not consume it
                b'\r' => {
                    // JS `\s` includes CR, so it is part of the match before `$`.
                    i += 1;
                }
                _ => {
                    ok = false;
                    break;
                }
            }
        }
        if ok {
            return Some(after_heading + i);
        }
        search_from = abs.saturating_add(1);
    }
    None
}

/// Offset of the next line-starting `## ` in `text` (`/^## /m`), or `None`.
fn find_next_h2_offset(text: &str) -> Option<usize> {
    if text.starts_with("## ") {
        return Some(0);
    }
    let bytes = text.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'\n' && i + 3 < bytes.len() && &bytes[i + 1..i + 4] == b"## " {
            return Some(i + 1);
        }
        i += 1;
    }
    None
}

/// Strip leading and trailing `\n` only (JS `replaceAll(/^\n+|\n+$/g, '')`).
fn trim_newlines(s: &str) -> String {
    let mut start = 0;
    let mut end = s.len();
    while start < end && s.as_bytes()[start] == b'\n' {
        start += 1;
    }
    while end > start && s.as_bytes()[end - 1] == b'\n' {
        end -= 1;
    }
    s[start..end].to_owned()
}

/// Per-feature gathered inputs (design doc, plan, branch-head subjects).
#[derive(Debug, Clone, Default)]
pub struct FeatureInputs {
    pub design_doc: Option<String>,
    pub plan: Option<PlanFragment>,
    pub branch_heads: HashMap<String, String>,
}

/// Arguments to [`assemble_execution_context`].
#[derive(Debug, Clone)]
pub struct AssembleInput<'a> {
    pub model: &'a FeatureGraph,
    pub scope: &'a [String],
    pub target: &'a str,
    /// Verbatim probe section text (may be null in JSON).
    pub probe: Option<&'a str>,
    pub models: Value,
    pub hooks: Value,
    pub inputs: HashMap<String, FeatureInputs>,
    pub prepared_at: &'a str,
    pub calibration: Option<&'a str>,
    pub cli: Option<&'a str>,
}

/// One feature entry in the execution context.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct FeatureEntry {
    pub id: String,
    pub title: String,
    pub acceptance: Vec<String>,
    pub depends_on: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<Vec<String>>,
    #[serde(rename = "designDoc")]
    pub design_doc: Option<String>,
    pub branch: String,
    #[serde(rename = "branchHead")]
    pub branch_head: Option<String>,
    pub plan: Option<PlanFragment>,
    #[serde(rename = "builtTasks")]
    pub built_tasks: Vec<String>,
}

/// Order-preserving feature map: serializes as a JSON object in insertion order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FeatureMap(pub Vec<(String, FeatureEntry)>);

impl Serialize for FeatureMap {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeMap;
        let mut map = serializer.serialize_map(Some(self.0.len()))?;
        for (key, value) in &self.0 {
            map.serialize_entry(key, value)?;
        }
        map.end()
    }
}

/// The assembled execution context (workflow `args`).
///
/// Top-level key order matches JS: `target, scope, probe, models, hooks,
/// features, preparedAt`, then `calibration` and `cli` only when present.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ExecutionContext {
    pub target: String,
    pub scope: Vec<String>,
    pub probe: Option<String>,
    pub models: Value,
    pub hooks: Value,
    pub features: FeatureMap,
    #[serde(rename = "preparedAt")]
    pub prepared_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub calibration: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cli: Option<String>,
}

/// Shape the one execution context the workflow consumes as `args`.
#[must_use]
pub fn assemble_execution_context(input: &AssembleInput<'_>) -> ExecutionContext {
    let by_id: HashMap<&str, &Feature> = input
        .model
        .features
        .iter()
        .map(|f| (f.id.as_str(), f))
        .collect();

    let mut features = Vec::with_capacity(input.scope.len());
    for id in input.scope {
        let node = by_id.get(id.as_str()).copied();
        let gathered = input.inputs.get(id.as_str());
        let entry = feature_entry(node, gathered);
        features.push((id.clone(), entry));
    }

    // JS: `...(calibration && { calibration })` / `...(cli && { cli })` — empty
    // string is falsy and omits the key.
    let calibration = input
        .calibration
        .filter(|s| !s.is_empty())
        .map(str::to_owned);
    let cli = input.cli.filter(|s| !s.is_empty()).map(str::to_owned);

    ExecutionContext {
        target: input.target.to_owned(),
        scope: input.scope.to_vec(),
        probe: input.probe.map(str::to_owned),
        models: input.models.clone(),
        hooks: input.hooks.clone(),
        features: FeatureMap(features),
        prepared_at: input.prepared_at.to_owned(),
        calibration,
        cli,
    }
}

fn feature_entry(node: Option<&Feature>, inputs: Option<&FeatureInputs>) -> FeatureEntry {
    let default_inputs = FeatureInputs::default();
    let inputs = inputs.unwrap_or(&default_inputs);
    let design_doc = inputs.design_doc.clone();
    let plan = inputs.plan.clone();
    let branch_heads = &inputs.branch_heads;

    // Callers only assemble known scope ids; a missing node is a programming error
    // upstream of this pure core. Use empty placeholders so the type stays infallible.
    let (id, title, acceptance, depends_on, notes) = node.map_or_else(
        || (String::new(), String::new(), Vec::new(), Vec::new(), None),
        |n| {
            (
                n.id.clone(),
                n.title.clone(),
                normalize_acceptance(n.acceptance.as_ref()),
                n.depends_on.clone(),
                n.notes.clone(),
            )
        },
    );

    let branch = feature_branch(&id);
    let branch_head = branch_heads.get(&branch).cloned();
    let built_tasks = built_task_ids(&id, plan.as_ref(), branch_heads);

    FeatureEntry {
        id,
        title,
        acceptance,
        depends_on,
        notes,
        design_doc,
        branch,
        branch_head,
        plan,
        built_tasks,
    }
}

/// Always an array — a scalar acceptance value becomes a one-element array.
fn normalize_acceptance(acceptance: Option<&Acceptance>) -> Vec<String> {
    match acceptance {
        Some(Acceptance::List(items)) => items.clone(),
        Some(Acceptance::Text(text)) => vec![text.clone()],
        // JS `[undefined]` → JSON null element; typed model has no null acceptance.
        None => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::collections::BTreeMap;

    use crate::graph::{Acceptance, Feature, FeatureGraph};

    fn feature(id: &str, status: &str, depends_on: &[&str], acceptance: &str) -> Feature {
        Feature {
            id: id.to_owned(),
            section: None,
            title: id.to_owned(),
            status: status.to_owned(),
            depends_on: depends_on.iter().map(|s| (*s).to_owned()).collect(),
            depends_on_present: true,
            acceptance: Some(Acceptance::Text(acceptance.to_owned())),
            notes: None,
            unknown: BTreeMap::new(),
        }
    }

    fn model(features: Vec<Feature>) -> FeatureGraph {
        FeatureGraph {
            design_version: json!(1),
            features,
            unknown: BTreeMap::new(),
        }
    }

    fn scope(ids: &[&str]) -> Vec<String> {
        ids.iter().map(|s| (*s).to_owned()).collect()
    }

    fn sample_model() -> FeatureGraph {
        model(vec![
            feature("landed", "validated", &[], "landed works"),
            feature("shipped-dep", "shipped", &[], "shipped-dep works"),
            feature(
                "ready",
                "designed",
                &["landed", "shipped-dep"],
                "ready works",
            ),
            feature("chained", "designed", &["ready"], "chained works"),
            feature("orphan", "designed", &["landed", "chained"], "orphan works"),
        ])
    }

    // ── branch / prefix naming ──

    #[test]
    fn feature_task_branch_and_commit_prefix_pin_git_naming() {
        assert_eq!(feature_branch("widget"), "loop/widget");
        assert_eq!(task_branch("widget", "t1"), "loop/widget--t1");
        assert_eq!(task_commit_prefix("widget", "t1"), "widget/t1: ");
    }

    // ── check_scope ──

    #[test]
    fn scope_of_designed_features_with_landed_deps_passes() {
        let result = check_scope(&sample_model(), &scope(&["ready"]));
        assert!(result.ok);
        assert!(result.errors.is_empty());
    }

    #[test]
    fn unknown_not_designed_and_unsatisfied_each_refuse_with_their_code() {
        let result = check_scope(&sample_model(), &scope(&["ghost", "landed", "orphan"]));
        assert!(!result.ok);
        let codes: Vec<(&str, Option<&str>)> = result
            .errors
            .iter()
            .map(|e| (e.code.as_str(), e.r#where.as_deref()))
            .collect();
        assert_eq!(
            codes,
            vec![
                ("unknown-feature", Some("ghost")),
                ("not-designed", Some("landed")),
                ("unsatisfied-dependency", Some("orphan")),
            ]
        );
        assert_eq!(
            result.errors[1].message,
            "feature is validated, not designed — nothing to run"
        );
    }

    #[test]
    fn dependency_satisfied_by_being_in_same_scope() {
        assert!(check_scope(&sample_model(), &scope(&["ready", "chained"])).ok);
        assert!(!check_scope(&sample_model(), &scope(&["chained"])).ok);
    }

    #[test]
    fn dependency_satisfied_by_validated_and_shipped_alike() {
        assert!(check_scope(&sample_model(), &scope(&["ready"])).ok);
    }

    #[test]
    fn proposed_feature_refused_with_must_be_designed_first_wording() {
        let m = model(vec![feature("backlog-item", "proposed", &[], "x")]);
        let result = check_scope(&m, &scope(&["backlog-item"]));
        assert!(!result.ok);
        assert_eq!(result.errors.len(), 1);
        assert_eq!(result.errors[0].code, "not-designed");
        assert_eq!(
            result.errors[0].message,
            "feature is proposed, not designed — it must be designed first"
        );
        assert_eq!(result.errors[0].r#where.as_deref(), Some("backlog-item"));
    }

    // ── built_task_ids ──

    #[test]
    fn task_built_iff_branch_head_subject_carries_commit_prefix() {
        let plan = PlanFragment {
            design_version: json!(1),
            tasks: vec![
                json!({"id": "t1"}),
                json!({"id": "t2"}),
                json!({"id": "t3"}),
            ],
        };
        let mut heads = HashMap::new();
        heads.insert(
            "loop/widget--t1".to_owned(),
            "widget/t1: land the render pipeline".to_owned(),
        );
        heads.insert(
            "loop/widget--t2".to_owned(),
            "wip: crashed before committing the task".to_owned(),
        );
        // t3 has no branch at all
        assert_eq!(built_task_ids("widget", Some(&plan), &heads), vec!["t1"]);
    }

    #[test]
    fn no_plan_means_no_built_tasks() {
        let mut heads = HashMap::new();
        heads.insert("loop/widget--t1".to_owned(), "widget/t1: x".to_owned());
        assert!(built_task_ids("widget", None, &heads).is_empty());
    }

    #[test]
    fn bare_branch_with_wrong_subject_counts_as_unbuilt() {
        let plan = PlanFragment {
            design_version: json!(1),
            tasks: vec![json!({"id": "t1"})],
        };
        let mut heads = HashMap::new();
        heads.insert(
            "loop/widget--t1".to_owned(),
            "wrong/prefix: not the task commit".to_owned(),
        );
        assert!(built_task_ids("widget", Some(&plan), &heads).is_empty());
    }

    // ── section_after ──

    const DESIGN: &str = r"# Design

## Validation procedure

Run `node bin/app.js ping` and expect `pong` on stdout.
A second probe line.

## Release runbook

Tag the release.
";

    #[test]
    fn section_after_excerpts_prose_under_heading_up_to_next_h2() {
        assert_eq!(
            section_after(DESIGN, "## Validation procedure").as_deref(),
            Some("Run `node bin/app.js ping` and expect `pong` on stdout.\nA second probe line.")
        );
    }

    #[test]
    fn section_after_returns_none_for_absent_heading() {
        assert_eq!(section_after(DESIGN, "## Rollback drill"), None);
    }

    #[test]
    fn section_after_on_last_section_runs_to_end_of_text() {
        assert_eq!(
            section_after(DESIGN, "## Release runbook").as_deref(),
            Some("Tag the release.")
        );
    }

    // ── assemble_execution_context ──

    fn execution_context_input() -> (FeatureGraph, Vec<String>, HashMap<String, FeatureInputs>) {
        let graph = model(vec![
            {
                let mut f = feature("a", "designed", &[], "a works");
                f.notes = Some(vec!["a note".to_owned()]);
                f
            },
            {
                let mut f = feature("b", "designed", &["a"], "b works");
                f.acceptance = Some(Acceptance::List(vec!["b1".to_owned(), "b2".to_owned()]));
                f
            },
        ]);
        let scope_ids = scope(&["a", "b"]);
        let mut inputs = HashMap::new();
        let mut a_heads = HashMap::new();
        a_heads.insert("loop/a".to_owned(), "a/t1: landed".to_owned());
        a_heads.insert("loop/a--t1".to_owned(), "a/t1: landed".to_owned());
        inputs.insert(
            "a".to_owned(),
            FeatureInputs {
                design_doc: Some("# a".to_owned()),
                plan: Some(PlanFragment {
                    design_version: json!(1),
                    tasks: vec![json!({"id": "t1"})],
                }),
                branch_heads: a_heads,
            },
        );
        // b has no gathered inputs — every per-feature field must default
        (graph, scope_ids, inputs)
    }

    /// Assert JSON object keys appear in `expected` order on the wire.
    /// `serde_json::Value` reorders without `preserve_order`; the compact
    /// [`Serialize`] path is what workflow-splice consumes.
    fn assert_wire_key_order(value: &impl Serialize, expected: &[&str]) {
        let wire = serde_json::to_string(value).expect("serialize");
        let mut search_from = 0;
        for key in expected {
            let needle = format!("\"{key}\":");
            let rel = wire[search_from..]
                .find(&needle)
                .unwrap_or_else(|| panic!("key {key:?} not in wire order in {wire}"));
            search_from += rel + needle.len();
        }
    }

    #[test]
    fn assemble_shapes_workflow_args_with_per_feature_entries() {
        let (graph, scope_ids, inputs) = execution_context_input();
        let ctx = assemble_execution_context(&AssembleInput {
            model: &graph,
            scope: &scope_ids,
            target: "main",
            probe: Some("run the probe"),
            models: json!({"plan": {"model": "session", "provenance": "default"}}),
            hooks: json!({"interview": {"value": {"enabled": true}, "provenance": "default"}}),
            inputs,
            prepared_at: "2026-04-01T12:00:00.000Z",
            calibration: None,
            cli: Some("node /plugin/bin/the-loop.js"),
        });

        assert_wire_key_order(
            &ctx,
            &[
                "target",
                "scope",
                "probe",
                "models",
                "hooks",
                "features",
                "preparedAt",
                "cli",
            ],
        );

        assert_eq!(ctx.target, "main");
        assert_eq!(ctx.scope, vec!["a", "b"]);
        assert_eq!(ctx.probe.as_deref(), Some("run the probe"));
        assert_eq!(ctx.prepared_at, "2026-04-01T12:00:00.000Z");
        assert_eq!(ctx.cli.as_deref(), Some("node /plugin/bin/the-loop.js"));

        let a = &ctx.features.0[0].1;
        assert_eq!(a.id, "a");
        assert_eq!(a.title, "a");
        assert_eq!(a.acceptance, vec!["a works"]);
        assert_eq!(a.depends_on, Vec::<String>::new());
        assert_eq!(a.notes, Some(vec!["a note".to_owned()]));
        assert_eq!(a.design_doc.as_deref(), Some("# a"));
        assert_eq!(a.branch, "loop/a");
        assert_eq!(a.branch_head.as_deref(), Some("a/t1: landed"));
        assert_eq!(
            a.plan.as_ref().map(|p| p.design_version.clone()),
            Some(json!(1))
        );
        assert_eq!(a.built_tasks, vec!["t1"]);

        assert_wire_key_order(
            a,
            &[
                "id",
                "title",
                "acceptance",
                "depends_on",
                "notes",
                "designDoc",
                "branch",
                "branchHead",
                "plan",
                "builtTasks",
            ],
        );

        let b = &ctx.features.0[1].1;
        assert_eq!(b.acceptance, vec!["b1", "b2"]);
        assert!(b.notes.is_none());
        assert!(b.design_doc.is_none());
        assert!(b.branch_head.is_none());
        assert!(b.plan.is_none());
        assert!(b.built_tasks.is_empty());

        let b_wire = serde_json::to_string(b).expect("b");
        assert!(!b_wire.contains("\"notes\""), "absent notes stay absent");
        assert_wire_key_order(
            b,
            &[
                "id",
                "title",
                "acceptance",
                "depends_on",
                "designDoc",
                "branch",
                "branchHead",
                "plan",
                "builtTasks",
            ],
        );
    }

    #[test]
    fn assemble_omits_cli_key_when_none_given() {
        let (graph, scope_ids, inputs) = execution_context_input();
        let ctx = assemble_execution_context(&AssembleInput {
            model: &graph,
            scope: &scope_ids,
            target: "main",
            probe: Some("run the probe"),
            models: json!({}),
            hooks: json!({}),
            inputs,
            prepared_at: "2026-04-01T12:00:00.000Z",
            calibration: None,
            cli: None,
        });
        let value = serde_json::to_value(&ctx).expect("serialize");
        assert!(!value.as_object().expect("object").contains_key("cli"));
    }

    #[test]
    fn assemble_includes_calibration_and_prepared_at_when_calibration_non_empty() {
        let (graph, scope_ids, inputs) = execution_context_input();
        let calibration = "digest body from the calibration index";
        let prepared_at = "2026-05-15T09:30:00.000Z";
        let ctx = assemble_execution_context(&AssembleInput {
            model: &graph,
            scope: &scope_ids,
            target: "main",
            probe: Some("run the probe"),
            models: json!({}),
            hooks: json!({}),
            inputs,
            prepared_at,
            calibration: Some(calibration),
            cli: Some("node /plugin/bin/the-loop.js"),
        });
        assert_eq!(ctx.calibration.as_deref(), Some(calibration));
        assert_eq!(ctx.prepared_at, prepared_at);

        assert_wire_key_order(
            &ctx,
            &[
                "target",
                "scope",
                "probe",
                "models",
                "hooks",
                "features",
                "preparedAt",
                "calibration",
                "cli",
            ],
        );
    }

    #[test]
    fn assemble_omits_calibration_when_null_or_empty() {
        let (graph, scope_ids, inputs) = execution_context_input();
        let ctx = assemble_execution_context(&AssembleInput {
            model: &graph,
            scope: &scope_ids,
            target: "main",
            probe: Some("run the probe"),
            models: json!({"plan": 1}),
            hooks: json!({"interview": 1}),
            inputs,
            prepared_at: "2026-04-01T12:00:00.000Z",
            calibration: None,
            cli: Some("node /plugin/bin/the-loop.js"),
        });
        let wire = serde_json::to_string(&ctx).expect("serialize");
        assert!(!wire.contains("\"calibration\""), "calibration key omitted");
        assert_wire_key_order(
            &ctx,
            &[
                "target",
                "scope",
                "probe",
                "models",
                "hooks",
                "features",
                "preparedAt",
                "cli",
            ],
        );

        let (graph2, scope2, inputs2) = execution_context_input();
        let empty = assemble_execution_context(&AssembleInput {
            model: &graph2,
            scope: &scope2,
            target: "main",
            probe: Some("run the probe"),
            models: json!({}),
            hooks: json!({}),
            inputs: inputs2,
            prepared_at: "2026-04-01T12:00:00.000Z",
            calibration: Some(""),
            cli: None,
        });
        let w2 = serde_json::to_string(&empty).expect("serialize");
        assert!(!w2.contains("\"calibration\""), "empty calibration omitted");
    }

    #[test]
    fn assemble_passes_hooks_and_models_through_verbatim() {
        let (graph, scope_ids, inputs) = execution_context_input();
        let hooks = json!({
            "interview": {"value": {"enabled": true}, "provenance": "default"},
            "modelBindings": {"plan": {"model": "session", "provenance": "default"}},
            "testHarness": {"value": "detected-convention", "provenance": "project"},
        });
        let models = json!({"plan": {"model": "session", "provenance": "default"}});
        let ctx = assemble_execution_context(&AssembleInput {
            model: &graph,
            scope: &scope_ids,
            target: "main",
            probe: Some("run the probe"),
            models: models.clone(),
            hooks: hooks.clone(),
            inputs,
            prepared_at: "2026-04-01T12:00:00.000Z",
            calibration: None,
            cli: None,
        });
        assert_eq!(ctx.hooks, hooks);
        assert_eq!(ctx.models, models);
    }

    #[test]
    fn features_object_preserves_scope_insertion_order() {
        let (graph, scope_ids, inputs) = execution_context_input();
        let ctx = assemble_execution_context(&AssembleInput {
            model: &graph,
            scope: &scope_ids,
            target: "main",
            probe: None,
            models: json!({}),
            hooks: json!({}),
            inputs,
            prepared_at: "t",
            calibration: None,
            cli: None,
        });
        let feature_ids: Vec<&str> = ctx.features.0.iter().map(|(k, _)| k.as_str()).collect();
        assert_eq!(feature_ids, vec!["a", "b"]);
        let value = serde_json::to_value(&ctx.features).expect("serialize");
        let keys: Vec<&str> = value
            .as_object()
            .expect("object")
            .keys()
            .map(String::as_str)
            .collect();
        // Without preserve_order, serde_json::Value reorders; the FeatureMap
        // serializer emits in insertion order into the serializer directly —
        // re-parse via to_string to check wire order.
        let wire = serde_json::to_string(&ctx.features).expect("wire");
        let a_pos = wire.find("\"a\"").expect("a");
        let b_pos = wire.find("\"b\"").expect("b");
        assert!(
            a_pos < b_pos,
            "features wire order must follow scope: {wire}"
        );
        // Value object key order is not load-bearing once reparsed without
        // preserve_order; presence is.
        assert!(keys.contains(&"a") && keys.contains(&"b"));
    }
}
