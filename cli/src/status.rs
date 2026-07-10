//! `status` — human summary and `--json` machine orientation.
//!
//! A faithful port of the JS reference (`plugin/src/status-summary.js` and
//! `plugin/src/propose-next-action.js`): the human render is byte-for-byte the
//! markdown shape (with the header naming the graph file the Rust binary read),
//! and `--json` mirrors `machineOrientation` branch for branch — detectState's
//! three modes, position counts, the eligible set, and the frozen `propose`
//! precedence. The proposal semantics are frozen (they anchor `/begin`): this
//! module mirrors them, it does not redesign them.

use std::collections::{HashMap, HashSet, VecDeque};
use std::fs;
use std::path::Path;
use std::process::ExitCode;

use serde::Serialize;
use serde_json::Value;

use crate::graph::{Feature, FeatureGraph, parse};
use crate::validate::{Issue, STATUS, validate};

/// The graph file the Rust binary reads (its view; the JS CLI keeps the `.md`).
const GRAPH: &str = "docs/feature-graph.json";
/// The system design doc whose presence separates `partial` from `unconfigured`.
const DESIGN: &str = "docs/architecture.md";
/// Directory scanned for `*.md` briefs (moves onboarding's resume point only).
const BRIEFS_DIR: &str = "docs/briefs";

/// Statuses that satisfy a `depends_on` edge — the work behind it is done.
fn is_done(status: &str) -> bool {
    status == "validated" || status == "shipped"
}

/// Configuration mode of a repo (ADR-0017): `unconfigured` has nothing to resume,
/// `partial` has a design but no graph, `configured` has a graph.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct State {
    pub mode: &'static str,
    pub has_design: bool,
    pub has_graph: bool,
    pub has_brief: bool,
}

/// Inspect a repo root: does it have a graph, a design, a brief — and thus which
/// mode is it in? Graph presence is keyed to the JSON graph path (the Rust view).
#[must_use]
pub fn detect_state(root: &Path) -> State {
    let has_design = root.join(DESIGN).exists();
    let has_graph = root.join(GRAPH).exists();
    let has_brief = fs::read_dir(root.join(BRIEFS_DIR)).is_ok_and(|entries| {
        entries
            .filter_map(Result::ok)
            .any(|e| e.path().extension().is_some_and(|ext| ext == "md"))
    });
    let mode = if has_graph {
        "configured"
    } else if has_design {
        "partial"
    } else {
        "unconfigured"
    };
    State {
        mode,
        has_design,
        has_graph,
        has_brief,
    }
}

/// The dependency-ready eligible set: features still `designed` whose every
/// `depends_on` edge is satisfied.
#[must_use]
pub fn eligible_set_ids(features: &[Feature]) -> Vec<String> {
    let by_id: HashMap<&str, &Feature> = features.iter().map(|f| (f.id.as_str(), f)).collect();
    let satisfied = |id: &str| by_id.get(id).is_some_and(|dep| is_done(&dep.status));
    features
        .iter()
        .filter(|f| f.status == "designed" && f.depends_on.iter().all(|d| satisfied(d)))
        .map(|f| f.id.clone())
        .collect()
}

/// The ids of features with an exact status, in graph order.
fn ids_with_status(features: &[Feature], status: &str) -> Vec<String> {
    features
        .iter()
        .filter(|f| f.status == status)
        .map(|f| f.id.clone())
        .collect()
}

/// The proposed features a stuck designed set is blocked behind, transitively.
///
/// Walk each stuck feature's unsatisfied `depends_on` edges (DONE deps aren't
/// blocking); a `proposed` dep is a terminal blocker, a `designed` dep keeps the
/// chain going. Visited-tracking makes this safe over a cycle (which yields no
/// proposed blocker — the `blocked` safety net's job).
#[must_use]
pub fn blocking_proposed_ids(features: &[Feature], stuck: &[String]) -> Vec<String> {
    let by_id: HashMap<&str, &Feature> = features.iter().map(|f| (f.id.as_str(), f)).collect();
    let satisfied = |id: &str| by_id.get(id).is_some_and(|dep| is_done(&dep.status));

    let mut blockers: Vec<String> = Vec::new();
    let mut seen_blockers: HashSet<String> = HashSet::new();
    let mut visited: HashSet<String> = HashSet::new();
    let mut queue: VecDeque<String> = stuck.iter().cloned().collect();

    while let Some(id) = queue.pop_front() {
        if !visited.insert(id.clone()) {
            continue;
        }
        let Some(node) = by_id.get(id.as_str()) else {
            continue;
        };
        for dep in &node.depends_on {
            if satisfied(dep) {
                continue;
            }
            match by_id.get(dep.as_str()) {
                // A dangling dep (validate()'s to report) is neither branch.
                None => {}
                Some(dep_node) if dep_node.status == "proposed" => {
                    if seen_blockers.insert(dep.clone()) {
                        blockers.push(dep.clone());
                    }
                }
                Some(_) => queue.push_back(dep.clone()),
            }
        }
    }
    blockers
}

/// The next-action proposal `/begin` opens with.
///
/// Precedence: the drainable eligible set; then, if designed work is stuck,
/// `design` naming the proposed dependencies that explain the stall; then
/// Release; then `design` again to drain a proposed-only backlog; then a fresh
/// intake. `blocked` is the true safety net — on a validate-clean graph, seeing
/// it means the graph needs repair.
#[must_use]
pub fn propose(features: &[Feature]) -> Proposal {
    let ready = eligible_set_ids(features);
    if !ready.is_empty() {
        let summary = format!("{} feature(s) are dependency-ready to advance", ready.len());
        return Proposal::new("advance-eligible-set", ready, summary);
    }
    let stuck = ids_with_status(features, "designed");
    if !stuck.is_empty() {
        let blocking = blocking_proposed_ids(features, &stuck);
        if !blocking.is_empty() {
            let summary = format!(
                "{} proposed feature(s) block the stuck designed set — design them first",
                blocking.len()
            );
            return Proposal::new("design", blocking, summary);
        }
        return Proposal::new(
            "blocked",
            stuck,
            "designed features exist but none are actionable — the graph needs repair".to_owned(),
        );
    }
    let validated = ids_with_status(features, "validated");
    if !validated.is_empty() {
        return Proposal::new(
            "release",
            validated,
            "everything buildable is validated — ready to release".to_owned(),
        );
    }
    let proposed = ids_with_status(features, "proposed");
    if !proposed.is_empty() {
        let summary = format!(
            "{} proposed feature(s) are the whole remaining backlog — design them next",
            proposed.len()
        );
        return Proposal::new("design", proposed, summary);
    }
    Proposal::new(
        "new-intake",
        Vec::new(),
        "everything is shipped — bring the next intake".to_owned(),
    )
}

/// One next-action proposal: `{ kind, features, summary }` — mirrors the JS shape.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Proposal {
    pub kind: String,
    pub features: Vec<String>,
    pub summary: String,
}

impl Proposal {
    fn new(kind: &str, features: Vec<String>, summary: String) -> Self {
        Self {
            kind: kind.to_owned(),
            features,
            summary,
        }
    }
}

/// Position: `{ designVersion, total, byStatus }` — the graph's headline counts.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Position {
    #[serde(rename = "designVersion")]
    pub design_version: Value,
    pub total: usize,
    #[serde(rename = "byStatus")]
    pub by_status: ByStatus,
}

/// The per-status tally, always the four durable statuses in JS order.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ByStatus {
    pub proposed: usize,
    pub designed: usize,
    pub validated: usize,
    pub shipped: usize,
}

fn count_by_status(graph: &FeatureGraph) -> Position {
    let mut by_status = ByStatus {
        proposed: 0,
        designed: 0,
        validated: 0,
        shipped: 0,
    };
    for f in &graph.features {
        match f.status.as_str() {
            "proposed" => by_status.proposed += 1,
            "designed" => by_status.designed += 1,
            "validated" => by_status.validated += 1,
            "shipped" => by_status.shipped += 1,
            _ => {}
        }
    }
    Position {
        design_version: graph.design_version.clone(),
        total: graph.features.len(),
        by_status,
    }
}

/// A validation issue as the `--json` machine orientation emits it: `where` is
/// omitted (not null) when absent, matching `JSON.stringify` dropping `undefined`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct IssueOut {
    pub code: String,
    pub message: String,
    #[serde(rename = "where", skip_serializing_if = "Option::is_none")]
    pub r#where: Option<String>,
}

impl From<&Issue> for IssueOut {
    fn from(issue: &Issue) -> Self {
        Self {
            code: issue.code.clone(),
            message: issue.message.clone(),
            r#where: issue.r#where.clone(),
        }
    }
}

/// The machine orientation `status --json` emits — mode, position, eligible set,
/// next-action proposal. Optional fields are skipped (never null) so each mode's
/// key set is exactly the JS object's.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Orientation {
    pub mode: &'static str,
    #[serde(rename = "hasDesign")]
    pub has_design: bool,
    #[serde(rename = "hasGraph")]
    pub has_graph: bool,
    #[serde(rename = "hasBrief")]
    pub has_brief: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub position: Option<Position>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub missing: Option<Vec<String>>,
    #[serde(rename = "eligibleSet", skip_serializing_if = "Option::is_none")]
    pub eligible_set: Option<Vec<String>>,
    #[serde(rename = "graphErrors", skip_serializing_if = "Option::is_none")]
    pub graph_errors: Option<Vec<IssueOut>>,
    pub proposal: Proposal,
}

impl Orientation {
    const fn base(state: &State, proposal: Proposal) -> Self {
        Self {
            mode: state.mode,
            has_design: state.has_design,
            has_graph: state.has_graph,
            has_brief: state.has_brief,
            position: None,
            missing: None,
            eligible_set: None,
            graph_errors: None,
            proposal,
        }
    }
}

/// A refusal — the graph exists (configured mode) but could not be parsed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Refusal {
    pub message: String,
}

/// Assemble the machine orientation for a repo root.
///
/// Never throws on an unconfigured or partial repo — those are answers, not
/// errors. In configured mode an unparseable graph is a [`Refusal`] (the only
/// error path).
///
/// # Errors
///
/// Returns [`Refusal`] when the graph file exists but cannot be read or parsed.
pub fn machine_orientation(root: &Path) -> Result<Orientation, Refusal> {
    let state = detect_state(root);
    match state.mode {
        "unconfigured" => {
            let summary = if state.has_brief {
                "a brief exists under docs/briefs/ but no design yet — resume onboarding at Design"
            } else {
                "no design and no graph — nothing to resume; route to onboarding (Define → Design)"
            };
            Ok(Orientation::base(
                &state,
                Proposal::new("onboard", Vec::new(), summary.to_owned()),
            ))
        }
        "partial" => {
            let summary = format!(
                "a system design exists but the feature graph ({GRAPH}) is missing — finish the interrupted Design or restore it from git history"
            );
            let mut orientation =
                Orientation::base(&state, Proposal::new("repair", Vec::new(), summary));
            orientation.missing = Some(vec![GRAPH.to_owned()]);
            Ok(orientation)
        }
        _ => configured_orientation(&state, root),
    }
}

fn configured_orientation(state: &State, root: &Path) -> Result<Orientation, Refusal> {
    let path = root.join(GRAPH);
    let text = fs::read_to_string(&path).map_err(|err| Refusal {
        message: format!("could not read {}: {err}", path.display()),
    })?;
    let graph = parse(&text).map_err(|err| Refusal {
        message: format!("{}: {err}", path.display()),
    })?;

    let position = count_by_status(&graph);
    let result = validate(&graph);
    if result.ok {
        let mut orientation = Orientation::base(state, propose(&graph.features));
        orientation.position = Some(position);
        orientation.eligible_set = Some(eligible_set_ids(&graph.features));
        Ok(orientation)
    } else {
        let summary = format!(
            "the feature graph fails validation ({} error(s)) — fix {GRAPH} before proposing work",
            result.errors.len()
        );
        let mut orientation =
            Orientation::base(state, Proposal::new("repair", Vec::new(), summary));
        orientation.position = Some(position);
        orientation.graph_errors = Some(result.errors.iter().map(IssueOut::from).collect());
        Ok(orientation)
    }
}

/// The `designVersion` value rendered for the human header/total line, matching a
/// JS template literal: a number prints bare, a string prints its content.
fn render_design_version(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        Value::Null => "null".to_owned(),
        other => serde_json::to_string(other).unwrap_or_else(|_| "null".to_owned()),
    }
}

/// The human status summary: the deterministic markdown shape, header naming the
/// graph file that was read.
#[must_use]
pub fn render_status_summary(graph: &FeatureGraph, graph_path: &str) -> String {
    let features = &graph.features;
    let mut lines: Vec<String> = Vec::new();
    lines.push(format!("# Status — projected from {graph_path}"));
    lines.push(String::new());
    lines.push(format!(
        "Total: {} feature(s) at design_version {}",
        features.len(),
        render_design_version(&graph.design_version)
    ));
    lines.push(String::new());
    for status in STATUS {
        let count = features.iter().filter(|f| f.status == *status).count();
        lines.push(format!("- {status}: {count}"));
    }
    lines.push(String::new());
    let ready = eligible_set_ids(features);
    let next = if ready.is_empty() {
        "nothing dependency-ready.".to_owned()
    } else {
        ready
            .iter()
            .map(|id| format!("`{id}`"))
            .collect::<Vec<_>>()
            .join(", ")
    };
    lines.push(format!("**Next:** {next}"));
    lines.push(String::new());
    lines.push("| feature | status | title |".to_owned());
    lines.push("|---|---|---|".to_owned());
    for f in features {
        lines.push(format!("| {} | {} | {} |", f.id, f.status, f.title));
    }
    lines.push(String::new());
    lines.join("\n")
}

/// Serialize the orientation the way the JS `out()` helper does: 2-space pretty
/// JSON with a trailing newline.
fn orientation_json(orientation: &Orientation) -> String {
    let body = serde_json::to_string_pretty(orientation).unwrap_or_else(|_| "{}".to_owned());
    format!("{body}\n")
}

/// Run the `status` command, returning the process exit code.
///
/// `--json` treats `positional` as the repo root (default `.`); the human form
/// treats it as a graph file path (default the JSON graph). Refusals print to
/// stderr and exit 1 with empty stdout.
#[must_use]
pub fn run_status(json: bool, positional: Option<&str>) -> ExitCode {
    if json {
        let root = positional.unwrap_or(".");
        return match machine_orientation(Path::new(root)) {
            Ok(orientation) => {
                print!("{}", orientation_json(&orientation));
                ExitCode::SUCCESS
            }
            Err(refusal) => {
                eprintln!("the-loop: {}", refusal.message);
                ExitCode::FAILURE
            }
        };
    }

    let path = positional.unwrap_or(GRAPH);
    let text = match fs::read_to_string(path) {
        Ok(text) => text,
        Err(err) => {
            eprintln!("the-loop: could not read {path}: {err}");
            return ExitCode::FAILURE;
        }
    };
    match parse(&text) {
        Ok(graph) => {
            print!("{}", render_status_summary(&graph, path));
            ExitCode::SUCCESS
        }
        Err(err) => {
            eprintln!("the-loop: {path}: {err}");
            ExitCode::FAILURE
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::graph::{Acceptance, Feature};
    use serde_json::json;
    use std::collections::BTreeMap;
    use std::fs;

    fn feature(id: &str, status: &str, deps: &[&str]) -> Feature {
        Feature {
            id: id.to_owned(),
            section: None,
            title: format!("{id} title"),
            status: status.to_owned(),
            depends_on: deps.iter().map(|d| (*d).to_owned()).collect(),
            depends_on_present: !deps.is_empty(),
            acceptance: Some(Acceptance::Text("criterion".to_owned())),
            notes: None,
            unknown: BTreeMap::new(),
        }
    }

    fn graph(features: Vec<Feature>) -> FeatureGraph {
        FeatureGraph {
            design_version: json!(1),
            features,
            unknown: BTreeMap::new(),
        }
    }

    // ── propose precedence, branch by branch ────────────────────────────────

    #[test]
    fn propose_advance_eligible_set_when_a_designed_feature_is_ready() {
        let g = graph(vec![
            feature("alpha", "designed", &[]),
            feature("beta", "proposed", &["alpha"]),
        ]);
        let p = propose(&g.features);
        assert_eq!(p.kind, "advance-eligible-set");
        assert_eq!(p.features, vec!["alpha".to_owned()]);
        assert_eq!(p.summary, "1 feature(s) are dependency-ready to advance");
    }

    #[test]
    fn propose_design_when_stuck_designed_set_is_blocked_by_proposed_deps() {
        // gamma is designed but depends on a proposed dep; nothing is eligible.
        let g = graph(vec![
            feature("dep", "proposed", &[]),
            feature("gamma", "designed", &["dep"]),
        ]);
        let p = propose(&g.features);
        assert_eq!(p.kind, "design");
        assert_eq!(p.features, vec!["dep".to_owned()]);
        assert_eq!(
            p.summary,
            "1 proposed feature(s) block the stuck designed set — design them first"
        );
    }

    #[test]
    fn propose_design_reports_transitive_proposed_blocker() {
        // stuck → mid (designed) → root (proposed): the terminal proposed blocker.
        let g = graph(vec![
            feature("root", "proposed", &[]),
            feature("mid", "designed", &["root"]),
            feature("stuck", "designed", &["mid"]),
        ]);
        let p = propose(&g.features);
        assert_eq!(p.kind, "design");
        assert_eq!(p.features, vec!["root".to_owned()]);
    }

    #[test]
    fn propose_blocked_is_the_safety_net_for_a_designed_cycle() {
        // a↔b designed cycle: neither eligible, no proposed blocker bottoms it out.
        let g = graph(vec![
            feature("a", "designed", &["b"]),
            feature("b", "designed", &["a"]),
        ]);
        let p = propose(&g.features);
        assert_eq!(p.kind, "blocked");
        assert_eq!(
            p.summary,
            "designed features exist but none are actionable — the graph needs repair"
        );
        let mut ids = p.features;
        ids.sort();
        assert_eq!(ids, vec!["a".to_owned(), "b".to_owned()]);
    }

    #[test]
    fn propose_release_when_everything_buildable_is_validated() {
        let g = graph(vec![
            feature("a", "validated", &[]),
            feature("b", "shipped", &[]),
        ]);
        let p = propose(&g.features);
        assert_eq!(p.kind, "release");
        assert_eq!(p.features, vec!["a".to_owned()]);
        assert_eq!(
            p.summary,
            "everything buildable is validated — ready to release"
        );
    }

    #[test]
    fn propose_design_drains_a_proposed_only_backlog() {
        let g = graph(vec![
            feature("a", "shipped", &[]),
            feature("b", "proposed", &[]),
            feature("c", "proposed", &[]),
        ]);
        let p = propose(&g.features);
        assert_eq!(p.kind, "design");
        assert_eq!(p.features, vec!["b".to_owned(), "c".to_owned()]);
        assert_eq!(
            p.summary,
            "2 proposed feature(s) are the whole remaining backlog — design them next"
        );
    }

    #[test]
    fn propose_new_intake_when_everything_is_shipped() {
        let g = graph(vec![
            feature("a", "shipped", &[]),
            feature("b", "shipped", &[]),
        ]);
        let p = propose(&g.features);
        assert_eq!(p.kind, "new-intake");
        assert!(p.features.is_empty());
        assert_eq!(p.summary, "everything is shipped — bring the next intake");
    }

    #[test]
    fn eligible_set_excludes_features_with_unsatisfied_deps() {
        let g = graph(vec![
            feature("done", "shipped", &[]),
            feature("ready", "designed", &["done"]),
            feature("waiting", "designed", &["pending"]),
            feature("pending", "designed", &[]),
        ]);
        // ready's dep is shipped; pending has no deps so it is ready too; waiting's
        // dep (pending) is designed, not done → not eligible.
        let mut ids = eligible_set_ids(&g.features);
        ids.sort();
        assert_eq!(ids, vec!["pending".to_owned(), "ready".to_owned()]);
    }

    // ── machine_orientation modes and repair branches ───────────────────────

    fn write(root: &Path, rel: &str, text: &str) {
        let full = root.join(rel);
        fs::create_dir_all(full.parent().unwrap()).unwrap();
        fs::write(full, text).unwrap();
    }

    const VALID_GRAPH: &str = r#"{
  "design_version": 1,
  "features": [
    { "id": "alpha", "title": "Alpha feature", "status": "designed", "depends_on": [], "acceptance": ["c1", "c2"] },
    { "id": "beta", "title": "Beta feature", "status": "proposed", "depends_on": ["alpha"] }
  ]
}
"#;

    #[test]
    fn orientation_unconfigured_empty_repo_routes_to_onboarding() {
        let dir = tempdir();
        let o = machine_orientation(dir.path()).expect("unconfigured is an answer, not an error");
        assert_eq!(o.mode, "unconfigured");
        assert!(!o.has_design && !o.has_graph && !o.has_brief);
        assert_eq!(o.proposal.kind, "onboard");
        assert_eq!(
            o.proposal.summary,
            "no design and no graph — nothing to resume; route to onboarding (Define → Design)"
        );
        assert!(o.position.is_none() && o.missing.is_none() && o.eligible_set.is_none());
    }

    #[test]
    fn orientation_unconfigured_with_brief_resumes_at_design() {
        let dir = tempdir();
        write(dir.path(), "docs/briefs/intake.md", "# a brief");
        let o = machine_orientation(dir.path()).unwrap();
        assert_eq!(o.mode, "unconfigured");
        assert!(o.has_brief);
        assert_eq!(
            o.proposal.summary,
            "a brief exists under docs/briefs/ but no design yet — resume onboarding at Design"
        );
    }

    #[test]
    fn orientation_partial_design_without_graph_proposes_repair() {
        let dir = tempdir();
        write(dir.path(), "docs/architecture.md", "# design");
        let o = machine_orientation(dir.path()).unwrap();
        assert_eq!(o.mode, "partial");
        assert!(o.has_design && !o.has_graph);
        assert_eq!(o.missing, Some(vec!["docs/feature-graph.json".to_owned()]));
        assert_eq!(o.proposal.kind, "repair");
        assert!(
            o.proposal
                .summary
                .contains("docs/feature-graph.json) is missing"),
            "{}",
            o.proposal.summary
        );
    }

    #[test]
    fn orientation_configured_valid_graph_proposes_advance() {
        let dir = tempdir();
        write(dir.path(), "docs/feature-graph.json", VALID_GRAPH);
        write(dir.path(), "docs/architecture.md", "# design");
        let o = machine_orientation(dir.path()).unwrap();
        assert_eq!(o.mode, "configured");
        assert!(o.has_graph && o.has_design && !o.has_brief);
        let position = o.position.expect("configured carries position");
        assert_eq!(position.design_version, json!(1));
        assert_eq!(position.total, 2);
        assert_eq!(position.by_status.proposed, 1);
        assert_eq!(position.by_status.designed, 1);
        assert_eq!(o.eligible_set, Some(vec!["alpha".to_owned()]));
        assert!(o.graph_errors.is_none());
        assert_eq!(o.proposal.kind, "advance-eligible-set");
    }

    #[test]
    fn orientation_configured_invalid_graph_proposes_repair_with_errors() {
        let dir = tempdir();
        // Valid JSON, invalid graph: bad status.
        write(
            dir.path(),
            "docs/feature-graph.json",
            r#"{ "design_version": 1, "features": [ { "id": "a", "title": "A", "status": "building" } ] }"#,
        );
        let o = machine_orientation(dir.path()).unwrap();
        assert_eq!(o.mode, "configured");
        assert_eq!(o.proposal.kind, "repair");
        assert!(o.position.is_some());
        assert!(o.eligible_set.is_none());
        let errors = o.graph_errors.expect("invalid graph carries graphErrors");
        assert!(errors.iter().any(|e| e.code == "bad-status"));
        assert!(
            o.proposal
                .summary
                .contains("fix docs/feature-graph.json before proposing work"),
            "{}",
            o.proposal.summary
        );
    }

    #[test]
    fn orientation_configured_unparseable_graph_is_a_refusal() {
        let dir = tempdir();
        write(dir.path(), "docs/feature-graph.json", "{ not json");
        let err = machine_orientation(dir.path())
            .expect_err("a malformed graph in configured mode must refuse");
        assert!(!err.message.is_empty());
    }

    #[test]
    fn orientation_repair_branch_omits_where_when_absent_but_keeps_it_when_present() {
        // A dangling dep issue carries a where; serialize and confirm shape.
        let dir = tempdir();
        write(
            dir.path(),
            "docs/feature-graph.json",
            r#"{ "design_version": 1, "features": [ { "id": "a", "title": "A", "status": "designed", "acceptance": "c", "depends_on": ["ghost"] } ] }"#,
        );
        let o = machine_orientation(dir.path()).unwrap();
        let json = serde_json::to_value(&o).unwrap();
        let errors = json["graphErrors"].as_array().unwrap();
        let dangling = errors
            .iter()
            .find(|e| e["code"] == "dangling-dependency")
            .unwrap();
        assert_eq!(dangling["where"], json!("a"));
    }

    #[test]
    fn orientation_json_key_set_matches_js_per_mode() {
        let dir = tempdir();
        write(dir.path(), "docs/feature-graph.json", VALID_GRAPH);
        let o = machine_orientation(dir.path()).unwrap();
        let json = serde_json::to_value(&o).unwrap();
        let keys: HashSet<&str> = json
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect();
        let expected: HashSet<&str> = [
            "mode",
            "hasDesign",
            "hasGraph",
            "hasBrief",
            "position",
            "eligibleSet",
            "proposal",
        ]
        .into_iter()
        .collect();
        assert_eq!(
            keys, expected,
            "configured mode key set must match JS exactly"
        );
        // No null churn from skipped optionals.
        assert!(!json.as_object().unwrap().values().any(Value::is_null));
    }

    // ── human summary byte shape ────────────────────────────────────────────

    #[test]
    fn render_summary_matches_the_status_summary_byte_shape() {
        let g = parse(VALID_GRAPH).unwrap();
        let out = render_status_summary(&g, "docs/feature-graph.json");
        let expected = concat!(
            "# Status — projected from docs/feature-graph.json\n",
            "\n",
            "Total: 2 feature(s) at design_version 1\n",
            "\n",
            "- proposed: 1\n",
            "- designed: 1\n",
            "- validated: 0\n",
            "- shipped: 0\n",
            "\n",
            "**Next:** `alpha`\n",
            "\n",
            "| feature | status | title |\n",
            "|---|---|---|\n",
            "| alpha | designed | Alpha feature |\n",
            "| beta | proposed | Beta feature |\n",
        );
        assert_eq!(out, expected);
    }

    #[test]
    fn render_summary_header_names_the_path_that_was_read() {
        let g = parse(VALID_GRAPH).unwrap();
        let out = render_status_summary(&g, "some/other/graph.json");
        assert!(
            out.starts_with("# Status — projected from some/other/graph.json\n"),
            "{out}"
        );
    }

    #[test]
    fn render_summary_next_line_reads_nothing_when_no_feature_is_ready() {
        let g = graph(vec![feature("a", "proposed", &[])]);
        let out = render_status_summary(&g, "g.json");
        assert!(
            out.contains("**Next:** nothing dependency-ready.\n"),
            "{out}"
        );
    }

    #[test]
    fn run_status_human_missing_graph_file_refuses() {
        let dir = tempdir();
        let missing = dir.path().join("docs/feature-graph.json");
        let code = run_status(false, missing.to_str());
        assert_eq!(code, ExitCode::FAILURE);
    }

    // Minimal temp-dir helper (no external dev-dependency): a unique dir under the
    // OS temp root, removed on drop.
    struct TempDir {
        path: std::path::PathBuf,
    }

    impl TempDir {
        fn path(&self) -> &Path {
            &self.path
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    fn tempdir() -> TempDir {
        use std::sync::atomic::{AtomicU32, Ordering};
        static COUNTER: AtomicU32 = AtomicU32::new(0);
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        let pid = std::process::id();
        let path = std::env::temp_dir().join(format!("the-loop-status-test-{pid}-{n}"));
        fs::create_dir_all(&path).unwrap();
        TempDir { path }
    }
}
