//! Plan JSON model (`docs/plans/<id>/plan.json`) with canonical parse/emit and
//! validation against a feature graph.
//!
//! Ports `plugin/src/plan.js` (`parsePlan`, `validatePlan`, `resolveTask`) onto a
//! pure-JSON artifact. Covers indexes are **0-based** into the feature's acceptance
//! list — a deliberate departure from the legacy JS `plan.md` 1-based scheme.

use std::collections::{HashMap, HashSet};
use std::fmt;

use serde_json::Value;

use crate::graph::{Acceptance, Feature, FeatureGraph};
use crate::validate::{Issue, ValidateResult};

/// Size classes a persisted task may carry.
pub const TASK_SIZES: &[&str] = &["xs", "s", "m"];

/// Judgment-level classes a task may be stamped with.
pub const JUDGMENT_LEVELS: &[&str] = &["rote", "standard", "complex"];

/// Default plan path for a feature id (Rust binary view; ADR-0051).
#[must_use]
pub fn plan_path(feature_id: &str) -> String {
    format!("docs/plans/{feature_id}/plan.json")
}

/// Parsed `docs/plans/<id>/plan.json` document.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Plan {
    pub feature: String,
    /// Top-level `design_version`. Missing → [`Value::Null`].
    pub design_version: Value,
    pub tasks: Vec<Task>,
    /// Unknown top-level keys preserved for callers (not re-emitted).
    pub unknown: std::collections::BTreeMap<String, Value>,
}

/// One task-contract record in the plan.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Task {
    pub id: String,
    pub title: String,
    /// 0-based indexes into the feature's acceptance criteria (JSON numbers).
    pub covers: Vec<Value>,
    pub acceptance: Option<TaskAcceptance>,
    pub footprint: Vec<String>,
    pub size: String,
    pub judgment_level: Option<String>,
    pub depends_on: Vec<String>,
    pub wiring: Option<String>,
    /// Unknown per-task keys preserved (not re-emitted).
    pub unknown: std::collections::BTreeMap<String, Value>,
}

/// Task acceptance: a single string or a list of strings.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TaskAcceptance {
    Text(String),
    List(Vec<String>),
}

/// Named parse failure — never a panic.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ParseError {
    /// Input was not valid JSON (or not a JSON object at the root / task slot).
    MalformedJson { message: String },
}

impl fmt::Display for ParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::MalformedJson { message } => write!(f, "malformed JSON: {message}"),
        }
    }
}

impl std::error::Error for ParseError {}

/// Parse a plan JSON document into the model.
///
/// Semantic problems are left for [`validate`]; this only builds the model shape.
///
/// # Errors
///
/// Returns [`ParseError::MalformedJson`] when the input is not valid JSON, the
/// root is not an object, `tasks` is not an array, a task slot is not an object,
/// or a known array/string field has the wrong JSON type.
pub fn parse(text: &str) -> Result<Plan, ParseError> {
    let value: Value = serde_json::from_str(text).map_err(|err| ParseError::MalformedJson {
        message: err.to_string(),
    })?;
    parse_value(value)
}

fn parse_value(value: Value) -> Result<Plan, ParseError> {
    let Value::Object(obj) = value else {
        return Err(ParseError::MalformedJson {
            message: "plan root must be a JSON object".to_owned(),
        });
    };

    let mut feature = String::new();
    let mut design_version = Value::Null;
    let mut tasks = Vec::new();
    let mut unknown = std::collections::BTreeMap::new();

    for (key, val) in obj {
        match key.as_str() {
            "feature" => {
                if let Some(s) = val.as_str() {
                    s.clone_into(&mut feature);
                }
            }
            "design_version" => {
                design_version = val;
            }
            "tasks" => {
                tasks = parse_tasks(val)?;
            }
            _ => {
                unknown.insert(key, val);
            }
        }
    }

    Ok(Plan {
        feature,
        design_version,
        tasks,
        unknown,
    })
}

fn parse_tasks(value: Value) -> Result<Vec<Task>, ParseError> {
    let Value::Array(items) = value else {
        return Err(ParseError::MalformedJson {
            message: "tasks must be a JSON array".to_owned(),
        });
    };
    items.into_iter().map(parse_task).collect()
}

fn parse_task(value: Value) -> Result<Task, ParseError> {
    let Value::Object(obj) = value else {
        return Err(ParseError::MalformedJson {
            message: "each task must be a JSON object".to_owned(),
        });
    };

    let mut id = String::new();
    let mut title = String::new();
    let mut covers = Vec::new();
    let mut acceptance = None;
    let mut footprint = Vec::new();
    let mut size = String::new();
    let mut judgment_level = None;
    let mut depends_on = Vec::new();
    let mut wiring = None;
    let mut unknown = std::collections::BTreeMap::new();

    for (key, val) in obj {
        match key.as_str() {
            "id" => {
                if let Some(s) = val.as_str() {
                    s.clone_into(&mut id);
                }
            }
            "title" => {
                if let Some(s) = val.as_str() {
                    s.clone_into(&mut title);
                }
            }
            "covers" => {
                covers = parse_covers(val)?;
            }
            "acceptance" => {
                acceptance = Some(parse_task_acceptance(val)?);
            }
            "footprint" => {
                footprint = parse_string_array(val, "footprint")?;
            }
            "size" => {
                if let Some(s) = val.as_str() {
                    s.clone_into(&mut size);
                }
            }
            "judgment_level" => {
                if let Some(s) = val.as_str() {
                    judgment_level = Some(s.to_owned());
                } else if !val.is_null() {
                    // Non-string non-null: keep as unknown for emit omission; validator
                    // will see judgment_level as absent (warn) unless we surface it.
                    // Match JS: non-matching type leaves the field unset; bad enum is
                    // only checked when a string is present. Store stringified form so
                    // bad-judgment-level can fire on non-enum strings only.
                    judgment_level = None;
                }
            }
            "depends_on" => {
                depends_on = parse_string_array(val, "depends_on")?;
            }
            "wiring" => {
                if let Some(s) = val.as_str() {
                    wiring = Some(s.to_owned());
                }
            }
            _ => {
                unknown.insert(key, val);
            }
        }
    }

    Ok(Task {
        id,
        title,
        covers,
        acceptance,
        footprint,
        size,
        judgment_level,
        depends_on,
        wiring,
        unknown,
    })
}

fn parse_covers(value: Value) -> Result<Vec<Value>, ParseError> {
    let Value::Array(items) = value else {
        return Err(ParseError::MalformedJson {
            message: "covers must be a JSON array".to_owned(),
        });
    };
    Ok(items)
}

fn parse_string_array(value: Value, field: &str) -> Result<Vec<String>, ParseError> {
    let Value::Array(items) = value else {
        return Err(ParseError::MalformedJson {
            message: format!("{field} must be a JSON array of strings"),
        });
    };
    let mut out = Vec::with_capacity(items.len());
    for item in items {
        match item {
            Value::String(s) => out.push(s),
            other => {
                return Err(ParseError::MalformedJson {
                    message: format!("{field} entries must be strings (got {other})"),
                });
            }
        }
    }
    Ok(out)
}

fn parse_task_acceptance(value: Value) -> Result<TaskAcceptance, ParseError> {
    match value {
        Value::String(s) => Ok(TaskAcceptance::Text(s)),
        Value::Array(items) => {
            let mut out = Vec::with_capacity(items.len());
            for item in items {
                match item {
                    Value::String(s) => out.push(s),
                    other => {
                        return Err(ParseError::MalformedJson {
                            message: format!("acceptance entries must be strings (got {other})"),
                        });
                    }
                }
            }
            Ok(TaskAcceptance::List(out))
        }
        other => Err(ParseError::MalformedJson {
            message: format!("acceptance must be a string or array of strings (got {other})"),
        }),
    }
}

/// Emit the plan as canonical JSON.
///
/// Design-doc key order, 2-space indent, LF, trailing newline. Unknown keys are
/// not written. Absent optionals stay absent.
#[must_use]
pub fn emit(plan: &Plan) -> String {
    let mut out = String::new();
    out.push_str("{\n");
    out.push_str("  \"feature\": ");
    out.push_str(&string_json(&plan.feature));
    out.push_str(",\n");
    out.push_str("  \"design_version\": ");
    out.push_str(&compact_json(&plan.design_version));
    out.push_str(",\n");
    out.push_str("  \"tasks\": ");
    if plan.tasks.is_empty() {
        out.push_str("[]\n");
    } else {
        out.push_str("[\n");
        for (i, task) in plan.tasks.iter().enumerate() {
            write_task(&mut out, task, 2);
            if i + 1 < plan.tasks.len() {
                out.push(',');
            }
            out.push('\n');
        }
        out.push_str("  ]\n");
    }
    out.push_str("}\n");
    out
}

fn write_task(out: &mut String, task: &Task, base_indent: usize) {
    let pad = "  ".repeat(base_indent);
    let inner = "  ".repeat(base_indent + 1);
    out.push_str(&pad);
    out.push_str("{\n");

    // Schema order: id, title, covers, acceptance, footprint, size,
    // judgment_level, depends_on, wiring.
    let mut fields: Vec<(&str, String)> = Vec::new();
    fields.push(("id", string_json(&task.id)));
    fields.push(("title", string_json(&task.title)));
    fields.push(("covers", pretty_value_array(&task.covers, base_indent + 1)));
    if let Some(acceptance) = &task.acceptance {
        fields.push((
            "acceptance",
            pretty_task_acceptance(acceptance, base_indent + 1),
        ));
    }
    fields.push((
        "footprint",
        pretty_string_array(&task.footprint, base_indent + 1),
    ));
    fields.push(("size", string_json(&task.size)));
    if let Some(level) = &task.judgment_level {
        fields.push(("judgment_level", string_json(level)));
    }
    fields.push((
        "depends_on",
        pretty_string_array(&task.depends_on, base_indent + 1),
    ));
    if let Some(wiring) = &task.wiring {
        fields.push(("wiring", string_json(wiring)));
    }

    for (i, (key, value)) in fields.iter().enumerate() {
        out.push_str(&inner);
        out.push('"');
        out.push_str(key);
        out.push_str("\": ");
        out.push_str(value);
        if i + 1 < fields.len() {
            out.push(',');
        }
        out.push('\n');
    }

    out.push_str(&pad);
    out.push('}');
}

fn pretty_task_acceptance(acceptance: &TaskAcceptance, indent_level: usize) -> String {
    match acceptance {
        TaskAcceptance::Text(s) => string_json(s),
        TaskAcceptance::List(items) => pretty_string_array(items, indent_level),
    }
}

fn pretty_string_array(items: &[String], indent_level: usize) -> String {
    if items.is_empty() {
        return "[]".to_owned();
    }
    let elem_pad = "  ".repeat(indent_level + 1);
    let close_pad = "  ".repeat(indent_level);
    let mut out = String::from("[\n");
    for (i, item) in items.iter().enumerate() {
        out.push_str(&elem_pad);
        out.push_str(&string_json(item));
        if i + 1 < items.len() {
            out.push(',');
        }
        out.push('\n');
    }
    out.push_str(&close_pad);
    out.push(']');
    out
}

fn pretty_value_array(items: &[Value], indent_level: usize) -> String {
    if items.is_empty() {
        return "[]".to_owned();
    }
    let elem_pad = "  ".repeat(indent_level + 1);
    let close_pad = "  ".repeat(indent_level);
    let mut out = String::from("[\n");
    for (i, item) in items.iter().enumerate() {
        out.push_str(&elem_pad);
        out.push_str(&compact_json(item));
        if i + 1 < items.len() {
            out.push(',');
        }
        out.push('\n');
    }
    out.push_str(&close_pad);
    out.push(']');
    out
}

fn string_json(s: &str) -> String {
    serde_json::to_string(s).unwrap_or_else(|_| "\"\"".to_owned())
}

fn compact_json(value: &Value) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "null".to_owned())
}

// ── validation ─────────────────────────────────────────────────────────────

/// Validate a plan against the design it was cut from.
///
/// Errors block; warnings inform (stale drift stamp, size ceiling, missing
/// judgment level). Covers indexes are 0-based: `0 <= k < criteria.length`.
#[must_use]
pub fn validate(plan: &Plan, design: &FeatureGraph) -> ValidateResult {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    check_plan_shape(plan, &mut errors);

    let feature = match_feature(plan, design, &mut errors, &mut warnings);
    let criteria = criteria_of(feature);

    let ids = collect_task_ids(&plan.tasks, &mut errors);

    let mut covered = HashSet::new();
    for task in &plan.tasks {
        if task.id.is_empty() {
            continue;
        }
        check_task_fields(task, &mut errors, &mut warnings);
        check_task_judgment_level(task, &mut errors, &mut warnings);
        check_task_covers(task, &criteria, &mut covered, &mut errors);
        check_task_edges(task, &ids, &mut errors);
    }

    check_coverage(feature, &plan.tasks, &criteria, &covered, &mut errors);

    if let Some(cycle) = find_task_cycle(&plan.tasks) {
        let path = cycle.join(" → ");
        let head = cycle.first().cloned();
        errors.push(issue(
            "task-dependency-cycle",
            format!("depends_on cycle: {path}"),
            head,
        ));
    }

    ValidateResult {
        ok: errors.is_empty(),
        errors,
        warnings,
    }
}

/// Resolve one task into the task brief a build agent is handed.
///
/// # Errors
///
/// Returns an error string when `task_id` is not in the plan (mirrors JS throw).
pub fn resolve_task(
    plan: &Plan,
    design: &FeatureGraph,
    task_id: &str,
) -> Result<ResolvedTask, String> {
    let task = plan
        .tasks
        .iter()
        .find(|t| t.id == task_id)
        .ok_or_else(|| format!("unknown task id: {}/{task_id}", plan.feature))?;
    let feature = design.features.iter().find(|f| f.id == plan.feature);
    let criteria = criteria_of(feature);
    let covers_criteria: Vec<String> = task
        .covers
        .iter()
        .filter_map(|k| cover_index(k).and_then(|i| criteria.get(i).cloned()))
        .collect();
    Ok(ResolvedTask {
        feature: plan.feature.clone(),
        design_version: plan.design_version.clone(),
        task: task.clone(),
        covers_criteria,
    })
}

/// Output of [`resolve_task`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedTask {
    pub feature: String,
    pub design_version: Value,
    pub task: Task,
    pub covers_criteria: Vec<String>,
}

fn issue(code: &str, message: impl Into<String>, r#where: Option<String>) -> Issue {
    Issue {
        code: code.to_owned(),
        message: message.into(),
        r#where,
    }
}

fn check_plan_shape(plan: &Plan, errors: &mut Vec<Issue>) {
    // No missing-tasks-block: pure JSON has no YAML fence concept.
    if !is_safe_integer(&plan.design_version) {
        let got = serde_json::to_string(&plan.design_version).unwrap_or_else(|_| "null".to_owned());
        errors.push(issue(
            "bad-plan-design-version",
            format!("design_version must be an integer (got {got})"),
            None,
        ));
    }
}

fn match_feature<'a>(
    plan: &Plan,
    design: &'a FeatureGraph,
    errors: &mut Vec<Issue>,
    warnings: &mut Vec<Issue>,
) -> Option<&'a Feature> {
    let feature = design.features.iter().find(|f| f.id == plan.feature);
    if feature.is_none() {
        errors.push(issue(
            "unknown-feature",
            format!("plan targets unknown feature \"{}\"", plan.feature),
            None,
        ));
        return None;
    }
    if is_safe_integer(&plan.design_version)
        && design_versions_differ(&plan.design_version, &design.design_version)
    {
        let plan_v = serde_json::to_string(&plan.design_version).unwrap_or_else(|_| "?".to_owned());
        let design_v =
            serde_json::to_string(&design.design_version).unwrap_or_else(|_| "?".to_owned());
        warnings.push(issue(
            "stale-plan",
            format!(
                "plan was cut from design_version {plan_v}; the design is at {design_v} — re-check before building"
            ),
            Some(plan.feature.clone()),
        ));
    }
    feature
}

fn design_versions_differ(plan_v: &Value, design_v: &Value) -> bool {
    // JS: plan.designVersion !== design.designVersion (numeric when both integers).
    match (as_i64(plan_v), as_i64(design_v)) {
        (Some(a), Some(b)) => a != b,
        _ => plan_v != design_v,
    }
}

fn as_i64(value: &Value) -> Option<i64> {
    match value {
        Value::Number(n) => n
            .as_i64()
            .or_else(|| n.as_u64().and_then(|u| i64::try_from(u).ok())),
        _ => None,
    }
}

fn criteria_of(feature: Option<&Feature>) -> Vec<String> {
    let Some(feature) = feature else {
        return Vec::new();
    };
    match feature.acceptance.as_ref() {
        Some(Acceptance::Text(s)) => vec![s.clone()],
        Some(Acceptance::List(items)) => items.clone(),
        None => Vec::new(),
    }
}

fn collect_task_ids(tasks: &[Task], errors: &mut Vec<Issue>) -> HashSet<String> {
    let mut ids = HashSet::new();
    for task in tasks {
        if task.id.is_empty() {
            let where_ = if task.title.is_empty() {
                None
            } else {
                Some(task.title.clone())
            };
            errors.push(issue(
                "missing-task-id",
                "task is missing a string id",
                where_,
            ));
            continue;
        }
        if ids.contains(&task.id) {
            errors.push(issue(
                "duplicate-task-id",
                "duplicate task id",
                Some(task.id.clone()),
            ));
        }
        ids.insert(task.id.clone());
    }
    ids
}

fn check_task_fields(task: &Task, errors: &mut Vec<Issue>, warnings: &mut Vec<Issue>) {
    let where_ = Some(task.id.clone());
    if task.title.is_empty() {
        errors.push(issue(
            "missing-task-title",
            "task has no title",
            where_.clone(),
        ));
    }
    if !has_task_acceptance(task.acceptance.as_ref()) {
        errors.push(issue(
            "missing-task-acceptance",
            "task has no acceptance criterion of its own",
            where_.clone(),
        ));
    }
    if !TASK_SIZES.contains(&task.size.as_str()) {
        let got = serde_json::to_string(&Value::String(task.size.clone()))
            .unwrap_or_else(|_| format!("{:?}", task.size));
        errors.push(issue(
            "bad-size",
            format!(
                "size must be one of {} — anything larger splits or bounces (got {got})",
                TASK_SIZES.join("|")
            ),
            where_.clone(),
        ));
    } else if task.size == "m" {
        warnings.push(issue(
            "size-at-ceiling",
            "task sits at the comfort ceiling — the wiring note must justify why it cannot split",
            where_.clone(),
        ));
    }
    if task.footprint.is_empty() {
        errors.push(issue(
            "missing-footprint",
            "task declares no expected file footprint",
            where_,
        ));
    }
}

fn check_task_judgment_level(task: &Task, errors: &mut Vec<Issue>, warnings: &mut Vec<Issue>) {
    let where_ = Some(task.id.clone());
    match &task.judgment_level {
        None => {
            warnings.push(issue(
                "missing-judgment-level",
                "task has no judgment_level — routes to build.standard downstream",
                where_,
            ));
        }
        Some(level) if !JUDGMENT_LEVELS.contains(&level.as_str()) => {
            let got = serde_json::to_string(&Value::String(level.clone()))
                .unwrap_or_else(|_| format!("{level:?}"));
            errors.push(issue(
                "bad-judgment-level",
                format!(
                    "judgment_level must be one of {} (got {got})",
                    JUDGMENT_LEVELS.join("|")
                ),
                where_,
            ));
        }
        Some(_) => {}
    }
}

fn check_task_covers(
    task: &Task,
    criteria: &[String],
    covered: &mut HashSet<usize>,
    errors: &mut Vec<Issue>,
) {
    let where_ = Some(task.id.clone());
    if task.covers.is_empty() {
        errors.push(issue(
            "task-covers-nothing",
            "task claims no feature acceptance criterion",
            where_.clone(),
        ));
    }
    for k in &task.covers {
        if let Some(idx) = cover_index(k)
            && idx < criteria.len()
        {
            covered.insert(idx);
            continue;
        }
        let k_disp = serde_json::to_string(k).unwrap_or_else(|_| format!("{k}"));
        // Strip quotes for bare numbers so the message matches JS JSON.stringify of a number.
        let k_disp = k_disp.trim_matches('"');
        errors.push(issue(
            "bad-covers-ref",
            format!(
                "covers references criterion #{k_disp} but the feature has {}",
                criteria.len()
            ),
            where_.clone(),
        ));
    }
}

fn check_task_edges(task: &Task, ids: &HashSet<String>, errors: &mut Vec<Issue>) {
    let where_ = Some(task.id.clone());
    for dep in &task.depends_on {
        if dep == &task.id {
            errors.push(issue(
                "self-dependency",
                "task depends on itself",
                where_.clone(),
            ));
        } else if !ids.contains(dep) {
            errors.push(issue(
                "dangling-task-dependency",
                format!("depends_on unknown task \"{dep}\""),
                where_.clone(),
            ));
        }
    }
}

fn check_coverage(
    feature: Option<&Feature>,
    tasks: &[Task],
    criteria: &[String],
    covered: &HashSet<usize>,
    errors: &mut Vec<Issue>,
) {
    let Some(feature) = feature else {
        return;
    };
    if tasks.is_empty() {
        return;
    }
    // 0-based: every criterion index must be claimed.
    for (k, criterion) in criteria.iter().enumerate() {
        if !covered.contains(&k) {
            errors.push(issue(
                "uncovered-criterion",
                format!(
                    "feature acceptance criterion #{k} is claimed by no task (\"{criterion}\")"
                ),
                Some(feature.id.clone()),
            ));
        }
    }
}

fn has_task_acceptance(acceptance: Option<&TaskAcceptance>) -> bool {
    match acceptance {
        Some(TaskAcceptance::Text(s)) => !s.trim().is_empty(),
        Some(TaskAcceptance::List(items)) => {
            !items.is_empty() && items.iter().all(|s| !s.trim().is_empty())
        }
        None => false,
    }
}

/// 0-based cover index from a JSON number, when it is a safe non-negative integer.
fn cover_index(value: &Value) -> Option<usize> {
    if !is_safe_integer(value) {
        return None;
    }
    match value {
        Value::Number(n) => n.as_u64().map_or_else(
            || {
                n.as_i64().and_then(|i| {
                    if i >= 0 {
                        usize::try_from(i).ok()
                    } else {
                        None
                    }
                })
            },
            |u| usize::try_from(u).ok(),
        ),
        _ => None,
    }
}

/// `Number.isSafeInteger` semantics over a JSON value.
fn is_safe_integer(value: &Value) -> bool {
    const MAX_SAFE_U: u64 = (1_u64 << 53) - 1;
    const MAX_SAFE_F: f64 = 9_007_199_254_740_991.0;
    match value {
        Value::Number(n) => n.as_i64().map_or_else(
            || {
                n.as_u64().map_or_else(
                    || {
                        n.as_f64().is_some_and(|f| {
                            f.is_finite() && f.fract() == 0.0 && f.abs() <= MAX_SAFE_F
                        })
                    },
                    |u| u <= MAX_SAFE_U,
                )
            },
            |i| i.unsigned_abs() <= MAX_SAFE_U,
        ),
        _ => false,
    }
}

const COLOUR_WHITE: u8 = 0;
const COLOUR_GREY: u8 = 1;
const COLOUR_BLACK: u8 = 2;

/// DFS colouring over task `depends_on` edges; same algorithm as graph validation.
fn find_task_cycle(tasks: &[Task]) -> Option<Vec<String>> {
    let edges: HashMap<&str, &[String]> = tasks
        .iter()
        .filter(|t| !t.id.is_empty())
        .map(|t| (t.id.as_str(), t.depends_on.as_slice()))
        .collect();

    let mut colour: HashMap<&str, u8> = HashMap::new();
    let mut stack: Vec<&str> = Vec::new();
    let mut cycle: Option<Vec<String>> = None;

    for id in edges.keys() {
        if colour.get(id).copied().unwrap_or(COLOUR_WHITE) == COLOUR_WHITE {
            visit_cycle(id, &edges, &mut colour, &mut stack, &mut cycle);
        }
        if cycle.is_some() {
            break;
        }
    }
    cycle
}

fn visit_cycle<'a>(
    id: &'a str,
    edges: &HashMap<&'a str, &'a [String]>,
    colour: &mut HashMap<&'a str, u8>,
    stack: &mut Vec<&'a str>,
    cycle: &mut Option<Vec<String>>,
) {
    colour.insert(id, COLOUR_GREY);
    stack.push(id);
    let deps = edges.get(id).copied().unwrap_or(&[]);
    for dep in deps {
        if !edges.contains_key(dep.as_str()) {
            continue;
        }
        let c = colour.get(dep.as_str()).copied().unwrap_or(COLOUR_WHITE);
        if c == COLOUR_GREY {
            let start = stack.iter().position(|&x| x == dep.as_str()).unwrap_or(0);
            let mut path: Vec<String> = stack[start..].iter().map(|s| (*s).to_owned()).collect();
            path.push(dep.clone());
            *cycle = Some(path);
            return;
        }
        if c == COLOUR_WHITE {
            visit_cycle(dep.as_str(), edges, colour, stack, cycle);
            if cycle.is_some() {
                return;
            }
        }
    }
    stack.pop();
    colour.insert(id, COLOUR_BLACK);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::graph::{Acceptance, Feature, FeatureGraph};
    use serde_json::json;
    use std::collections::BTreeMap;

    /// Canonical alpha plan matching oracle fixtures (0-based covers).
    const CANONICAL_PLAN: &str = r#"{
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

    const SHUFFLED_PLAN: &str = r#"{
    "tasks": [
        {
            "wiring": "foundational module the rest of the feature hangs on",
            "depends_on": [],
            "judgment_level": "standard",
            "size": "s",
            "footprint": ["src/alpha.js", "test/alpha.test.js"],
            "acceptance": "alpha core satisfies both feature criteria",
            "covers": [0, 1],
            "title": "Implement alpha core",
            "id": "alpha-core"
        }
    ],
    "design_version": 1,
    "feature": "alpha"
}"#;

    fn feature(id: &str, acceptance: Vec<&str>) -> Feature {
        Feature {
            id: id.to_owned(),
            section: None,
            title: id.to_owned(),
            status: "designed".to_owned(),
            depends_on: Vec::new(),
            depends_on_present: false,
            acceptance: Some(Acceptance::List(
                acceptance.into_iter().map(str::to_owned).collect(),
            )),
            notes: None,
            unknown: BTreeMap::new(),
        }
    }

    fn design() -> FeatureGraph {
        FeatureGraph {
            design_version: json!(1),
            features: vec![feature(
                "alpha",
                vec!["alpha criterion one", "alpha criterion two"],
            )],
            unknown: BTreeMap::new(),
        }
    }

    fn codes(result: &ValidateResult) -> Vec<&str> {
        result.errors.iter().map(|e| e.code.as_str()).collect()
    }

    #[test]
    fn parse_emit_round_trip_is_byte_canonical() {
        let plan = parse(SHUFFLED_PLAN).expect("shuffled must parse");
        let emitted = emit(&plan);
        assert_eq!(
            emitted, CANONICAL_PLAN,
            "emit must be byte-canonical\n--- got ---\n{emitted}\n--- expected ---\n{CANONICAL_PLAN}"
        );
        assert!(emitted.ends_with('\n'));
        assert!(!emitted.ends_with("\n\n"));
        assert!(!emitted.contains('\r'));

        let hand: Value = serde_json::from_str(SHUFFLED_PLAN).unwrap();
        let out: Value = serde_json::from_str(&emitted).unwrap();
        assert_eq!(out, hand, "content must be JSON-equal");
    }

    #[test]
    fn canonical_fixture_round_trips_byte_for_byte() {
        let plan = parse(CANONICAL_PLAN).expect("canonical parses");
        assert_eq!(emit(&plan), CANONICAL_PLAN);
    }

    #[test]
    fn task_key_order_on_emit_matches_schema() {
        let emitted = emit(&parse(SHUFFLED_PLAN).unwrap());
        let id = emitted.find("\"id\"").unwrap();
        let title = emitted.find("\"title\"").unwrap();
        let covers = emitted.find("\"covers\"").unwrap();
        let acceptance = emitted.find("\"acceptance\"").unwrap();
        let footprint = emitted.find("\"footprint\"").unwrap();
        let size = emitted.find("\"size\"").unwrap();
        let judgment = emitted.find("\"judgment_level\"").unwrap();
        let depends = emitted.find("\"depends_on\"").unwrap();
        let wiring = emitted.find("\"wiring\"").unwrap();
        assert!(
            id < title
                && title < covers
                && covers < acceptance
                && acceptance < footprint
                && footprint < size
                && size < judgment
                && judgment < depends
                && depends < wiring,
            "task key order broken in:\n{emitted}"
        );
        let feature = emitted.find("\"feature\"").unwrap();
        let dv = emitted.find("\"design_version\"").unwrap();
        let tasks = emitted.find("\"tasks\"").unwrap();
        assert!(
            feature < dv && dv < tasks,
            "top-level order broken:\n{emitted}"
        );
    }

    #[test]
    fn absent_optionals_stay_absent_on_emit() {
        let input = r#"{
  "feature": "solo",
  "design_version": 1,
  "tasks": [
    {
      "id": "t1",
      "title": "T",
      "covers": [0],
      "acceptance": "ok",
      "footprint": ["a.js"],
      "size": "xs",
      "depends_on": []
    }
  ]
}
"#;
        let plan = parse(input).expect("parse");
        assert_eq!(plan.tasks[0].judgment_level, None);
        assert_eq!(plan.tasks[0].wiring, None);
        let emitted = emit(&plan);
        assert!(
            !emitted.contains("judgment_level"),
            "absent judgment_level must not appear: {emitted}"
        );
        assert!(
            !emitted.contains("wiring"),
            "absent wiring must not appear: {emitted}"
        );
        assert!(!emitted.contains("null"), "no null churn: {emitted}");
    }

    #[test]
    fn unknown_keys_captured_not_re_emitted() {
        let input = r#"{
  "feature": "alpha",
  "design_version": 1,
  "extra": true,
  "tasks": [
    {
      "id": "t1",
      "title": "T",
      "covers": [0],
      "acceptance": "ok",
      "footprint": ["a.js"],
      "size": "s",
      "depends_on": [],
      "mystery": 1
    }
  ]
}
"#;
        let plan = parse(input).expect("parse");
        assert_eq!(plan.unknown.get("extra"), Some(&Value::Bool(true)));
        assert_eq!(plan.tasks[0].unknown.get("mystery"), Some(&json!(1)));
        let emitted = emit(&plan);
        assert!(!emitted.contains("extra") && !emitted.contains("mystery"));
    }

    #[test]
    fn malformed_json_returns_named_error() {
        for input in ["", "{", "null", "[]", r#"{"tasks":{}}"#] {
            let err = parse(input).expect_err("must fail");
            assert!(
                err.to_string().contains("malformed JSON"),
                "got {err} for {input:?}"
            );
        }
    }

    #[test]
    fn valid_plan_validates_ok_against_design() {
        let plan = parse(CANONICAL_PLAN).unwrap();
        let result = validate(&plan, &design());
        assert!(result.ok, "errors: {:?}", result.errors);
        assert!(result.errors.is_empty());
    }

    #[test]
    fn covers_are_zero_based_out_of_range_is_error() {
        let mut plan = parse(CANONICAL_PLAN).unwrap();
        // Legacy 1-based [1, 2] is out of range for a 2-criterion feature (0..2).
        plan.tasks[0].covers = vec![json!(1), json!(2)];
        let result = validate(&plan, &design());
        assert!(codes(&result).contains(&"bad-covers-ref"));
        // Index 2 alone is out of range.
        plan.tasks[0].covers = vec![json!(2)];
        let result = validate(&plan, &design());
        assert!(codes(&result).contains(&"bad-covers-ref"));
        let err = result
            .errors
            .iter()
            .find(|e| e.code == "bad-covers-ref")
            .unwrap();
        assert!(
            err.message.contains("#2") && err.message.contains("has 2"),
            "{}",
            err.message
        );
    }

    #[test]
    fn covers_zero_and_one_are_valid_for_two_criteria() {
        let plan = parse(CANONICAL_PLAN).unwrap();
        assert_eq!(plan.tasks[0].covers, vec![json!(0), json!(1)]);
        let result = validate(&plan, &design());
        assert!(
            !codes(&result).contains(&"bad-covers-ref"),
            "0-based covers must pass: {:?}",
            result.errors
        );
        assert!(!codes(&result).contains(&"uncovered-criterion"));
    }

    #[test]
    fn bad_judgment_level_is_an_error() {
        let mut plan = parse(CANONICAL_PLAN).unwrap();
        plan.tasks[0].judgment_level = Some("urgent".to_owned());
        let result = validate(&plan, &design());
        assert!(codes(&result).contains(&"bad-judgment-level"));
        let err = result
            .errors
            .iter()
            .find(|e| e.code == "bad-judgment-level")
            .unwrap();
        assert!(
            err.message.contains("rote|standard|complex") && err.message.contains("urgent"),
            "{}",
            err.message
        );
    }

    #[test]
    fn task_dependency_cycle_reports_dfs_path() {
        let mut plan = parse(CANONICAL_PLAN).unwrap();
        plan.tasks.push(Task {
            id: "alpha-wire".to_owned(),
            title: "Wire".to_owned(),
            covers: vec![json!(1)],
            acceptance: Some(TaskAcceptance::Text("wired".to_owned())),
            footprint: vec!["src/wire.js".to_owned()],
            size: "s".to_owned(),
            judgment_level: Some("standard".to_owned()),
            depends_on: vec!["alpha-core".to_owned()],
            wiring: None,
            unknown: BTreeMap::new(),
        });
        // Create a cycle: core → wire → core
        plan.tasks[0].depends_on = vec!["alpha-wire".to_owned()];
        // covers still cover 0 and 1 via the two tasks
        plan.tasks[0].covers = vec![json!(0)];
        let result = validate(&plan, &design());
        assert!(
            codes(&result).contains(&"task-dependency-cycle"),
            "errors: {:?}",
            result.errors
        );
        let err = result
            .errors
            .iter()
            .find(|e| e.code == "task-dependency-cycle")
            .unwrap();
        assert!(
            err.message.contains(" → "),
            "cycle path must use arrow join: {}",
            err.message
        );
    }

    #[test]
    fn resolve_task_uses_zero_based_covers_criteria() {
        let plan = parse(CANONICAL_PLAN).unwrap();
        let brief = resolve_task(&plan, &design(), "alpha-core").expect("resolve");
        assert_eq!(brief.feature, "alpha");
        assert_eq!(brief.design_version, json!(1));
        assert_eq!(brief.task.id, "alpha-core");
        assert_eq!(
            brief.covers_criteria,
            vec![
                "alpha criterion one".to_owned(),
                "alpha criterion two".to_owned()
            ]
        );
        // Single cover index 0 → first criterion only.
        let mut plan = plan;
        plan.tasks[0].covers = vec![json!(0)];
        let brief = resolve_task(&plan, &design(), "alpha-core").unwrap();
        assert_eq!(
            brief.covers_criteria,
            vec!["alpha criterion one".to_owned()]
        );
        // Index 1 → second criterion (NOT first — that would be 1-based semantics).
        plan.tasks[0].covers = vec![json!(1)];
        let brief = resolve_task(&plan, &design(), "alpha-core").unwrap();
        assert_eq!(
            brief.covers_criteria,
            vec!["alpha criterion two".to_owned()]
        );
    }

    #[test]
    fn resolve_task_unknown_id_errors() {
        let plan = parse(CANONICAL_PLAN).unwrap();
        let err = resolve_task(&plan, &design(), "ghost").unwrap_err();
        assert!(
            err.contains("unknown task id") && err.contains("alpha/ghost"),
            "{err}"
        );
    }

    #[test]
    fn plan_path_uses_json_suffix() {
        assert_eq!(plan_path("alpha"), "docs/plans/alpha/plan.json");
    }

    #[test]
    fn size_and_judgment_level_constants_match_js() {
        assert_eq!(TASK_SIZES, &["xs", "s", "m"]);
        assert_eq!(JUDGMENT_LEVELS, &["rote", "standard", "complex"]);
    }
}
