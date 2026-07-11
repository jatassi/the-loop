//! Feature-graph validator — pure model-in, issues-out gate.
//!
//! Ports the refusal catalog from `plugin/src/feature-schema.js` onto the Rust
//! [`FeatureGraph`] model. Validation inspects the already-parsed model only;
//! it never re-reads text or takes a path. Callers (`check`, `set-status`,
//! `status --json` repair) land in later tasks.

use std::collections::{HashMap, HashSet};

use serde_json::Value;

use crate::graph::{Acceptance, Feature, FeatureGraph};

/// Durable lifecycle statuses (ADR-0034/0045). In-flight states are git-derived.
pub const STATUS: &[&str] = &["proposed", "designed", "validated", "shipped"];

/// One validation issue. Mirrors the JS `{ code, message, where? }` shape.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Issue {
    pub code: String,
    pub message: String,
    /// The id (or title when id is missing) the issue concerns, when applicable.
    /// Mirrors JS `Issue.where`.
    pub r#where: Option<String>,
}

/// Result of validating a feature graph. Mirrors JS `{ ok, errors, warnings }`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidateResult {
    pub ok: bool,
    pub errors: Vec<Issue>,
    pub warnings: Vec<Issue>,
}

/// Validate a parsed feature graph. Pure: inspects the model only.
#[must_use]
pub fn validate(graph: &FeatureGraph) -> ValidateResult {
    let mut errors = Vec::new();
    let warnings = Vec::new();

    check_unknown_top_level(graph, &mut errors);
    check_doc_shape(graph, &mut errors);

    let ids = collect_ids(&graph.features, &mut errors);

    for feature in &graph.features {
        check_unknown_feature_keys(feature, &mut errors);
        if feature.id.is_empty() {
            continue;
        }
        check_feature_fields(feature, &mut errors);
        check_feature_edges(feature, &ids, &mut errors);
    }

    if let Some(cycle) = find_cycle(&graph.features) {
        let path = cycle.join(" → ");
        let head = cycle.first().cloned();
        errors.push(issue(
            "dependency-cycle",
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

fn issue(code: &str, message: impl Into<String>, r#where: Option<String>) -> Issue {
    Issue {
        code: code.to_owned(),
        message: message.into(),
        r#where,
    }
}

fn check_unknown_top_level(graph: &FeatureGraph, errors: &mut Vec<Issue>) {
    for key in graph.unknown.keys() {
        errors.push(issue("unknown-key", format!("unknown key \"{key}\""), None));
    }
}

fn check_unknown_feature_keys(feature: &Feature, errors: &mut Vec<Issue>) {
    let where_ = where_for(feature);
    for key in feature.unknown.keys() {
        errors.push(issue(
            "unknown-key",
            format!("unknown key \"{key}\""),
            where_.clone(),
        ));
    }
}

fn check_doc_shape(graph: &FeatureGraph, errors: &mut Vec<Issue>) {
    // JS: Number.isSafeInteger(model.designVersion). No missing-feature-graph here —
    // the Rust model has no YAML fence concept.
    if !is_safe_integer(&graph.design_version) {
        let got =
            serde_json::to_string(&graph.design_version).unwrap_or_else(|_| "null".to_owned());
        errors.push(issue(
            "bad-doc-design-version",
            format!("top-level design_version must be an integer (got {got})"),
            None,
        ));
    }
}

/// Gather string ids, reporting missing / malformed / duplicate.
fn collect_ids(features: &[Feature], errors: &mut Vec<Issue>) -> HashSet<String> {
    let mut ids = HashSet::new();
    for feature in features {
        if feature.id.is_empty() {
            let title = if feature.title.is_empty() {
                None
            } else {
                Some(feature.title.clone())
            };
            errors.push(issue("missing-id", "feature is missing a string id", title));
            continue;
        }
        if !is_valid_id(&feature.id) {
            errors.push(issue(
                "malformed-id",
                "feature id must be a lowercase slug matching ^[a-z0-9][a-z0-9-]*$",
                Some(feature.id.clone()),
            ));
        }
        if ids.contains(&feature.id) {
            errors.push(issue(
                "duplicate-id",
                "duplicate feature id",
                Some(feature.id.clone()),
            ));
        }
        ids.insert(feature.id.clone());
    }
    ids
}

fn check_feature_fields(feature: &Feature, errors: &mut Vec<Issue>) {
    let where_ = Some(feature.id.clone());
    if feature.title.is_empty() {
        errors.push(issue(
            "missing-title",
            "feature has no title",
            where_.clone(),
        ));
    }
    if !STATUS.contains(&feature.status.as_str()) {
        let got = serde_json::to_string(&Value::String(feature.status.clone()))
            .unwrap_or_else(|_| format!("{:?}", feature.status));
        errors.push(issue(
            "bad-status",
            format!("status must be one of {} (got {got})", STATUS.join("|")),
            where_.clone(),
        ));
    }
    // proposed is exempt — acceptance is Design's output, not intake's.
    if feature.status != "proposed" && !has_acceptance(feature.acceptance.as_ref()) {
        errors.push(issue(
            "missing-acceptance",
            "feature has no acceptance criterion",
            where_,
        ));
    }
}

fn check_feature_edges(feature: &Feature, ids: &HashSet<String>, errors: &mut Vec<Issue>) {
    let where_ = Some(feature.id.clone());
    for dep in &feature.depends_on {
        if dep == &feature.id {
            errors.push(issue(
                "self-dependency",
                "feature depends on itself",
                where_.clone(),
            ));
        } else if !ids.contains(dep) {
            errors.push(issue(
                "dangling-dependency",
                format!("depends_on unknown feature \"{dep}\""),
                where_.clone(),
            ));
        }
    }
}

fn has_acceptance(acceptance: Option<&Acceptance>) -> bool {
    match acceptance {
        Some(Acceptance::Text(s)) => !s.trim().is_empty(),
        Some(Acceptance::List(items)) => {
            !items.is_empty() && items.iter().all(|s| !s.trim().is_empty())
        }
        None => false,
    }
}

/// Ids become git refs and paths — lowercase slug, no leading hyphen.
fn is_valid_id(id: &str) -> bool {
    let mut chars = id.chars();
    match chars.next() {
        Some(c) if c.is_ascii_lowercase() || c.is_ascii_digit() => {}
        _ => return false,
    }
    chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

/// `Number.isSafeInteger` semantics over a JSON value.
fn is_safe_integer(value: &Value) -> bool {
    // 2^53 − 1 — exactly representable in f64.
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

fn where_for(feature: &Feature) -> Option<String> {
    if !feature.id.is_empty() {
        Some(feature.id.clone())
    } else if !feature.title.is_empty() {
        Some(feature.title.clone())
    } else {
        None
    }
}

const COLOUR_WHITE: u8 = 0;
const COLOUR_GREY: u8 = 1;
const COLOUR_BLACK: u8 = 2;

/// DFS colouring; returns the first cycle as an id path (`… → x → … → x`), or `None`.
fn find_cycle(features: &[Feature]) -> Option<Vec<String>> {
    let edges: HashMap<&str, &[String]> = features
        .iter()
        .filter(|f| !f.id.is_empty())
        .map(|f| (f.id.as_str(), f.depends_on.as_slice()))
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
            continue; // dangling — reported elsewhere
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

    fn feature(id: &str, title: &str, status: &str) -> Feature {
        Feature {
            id: id.to_owned(),
            section: None,
            title: title.to_owned(),
            status: status.to_owned(),
            depends_on: Vec::new(),
            depends_on_present: false,
            acceptance: None,
            notes: None,
            unknown: BTreeMap::new(),
        }
    }

    fn designed(id: &str, title: &str) -> Feature {
        let mut f = feature(id, title, "designed");
        f.acceptance = Some(Acceptance::Text("criterion".to_owned()));
        f
    }

    fn graph(features: Vec<Feature>) -> FeatureGraph {
        FeatureGraph {
            design_version: json!(1),
            features,
            unknown: BTreeMap::new(),
        }
    }

    fn codes(result: &ValidateResult) -> Vec<&str> {
        result.errors.iter().map(|e| e.code.as_str()).collect()
    }

    #[test]
    fn valid_graph_yields_ok_with_zero_errors() {
        let g = graph(vec![
            designed("alpha", "Alpha"),
            {
                let mut beta = feature("beta", "Beta", "proposed");
                beta.depends_on = vec!["alpha".to_owned()];
                beta.depends_on_present = true;
                beta
            },
            {
                let mut v = designed("validated-one", "Validated");
                v.status = "validated".to_owned();
                v
            },
            {
                let mut s = designed("shipped-one", "Shipped");
                s.status = "shipped".to_owned();
                s
            },
        ]);
        let result = validate(&g);
        assert!(result.ok, "expected ok, got errors: {:?}", result.errors);
        assert!(result.errors.is_empty());
        assert!(result.warnings.is_empty());
    }

    #[test]
    fn bad_doc_design_version_on_non_integer() {
        let mut g = graph(vec![designed("a", "A")]);
        g.design_version = json!("nope");
        let result = validate(&g);
        assert!(!result.ok);
        assert!(codes(&result).contains(&"bad-doc-design-version"));
        let err = result
            .errors
            .iter()
            .find(|e| e.code == "bad-doc-design-version")
            .expect("code present");
        assert!(
            err.message.contains("must be an integer") && err.message.contains("nope"),
            "message should name the offense: {}",
            err.message
        );

        g.design_version = Value::Null;
        let result = validate(&g);
        assert!(codes(&result).contains(&"bad-doc-design-version"));

        g.design_version = json!(1.5);
        let result = validate(&g);
        assert!(codes(&result).contains(&"bad-doc-design-version"));

        g.design_version = json!(1);
        let result = validate(&g);
        assert!(
            !codes(&result).contains(&"bad-doc-design-version"),
            "integer design_version must be accepted"
        );
    }

    #[test]
    fn missing_id_reports_title_as_where() {
        let mut f = designed("", "Orphan Title");
        f.id.clear();
        let result = validate(&graph(vec![f]));
        assert!(!result.ok);
        let err = result
            .errors
            .iter()
            .find(|e| e.code == "missing-id")
            .expect("missing-id");
        assert_eq!(err.message, "feature is missing a string id");
        assert_eq!(err.r#where.as_deref(), Some("Orphan Title"));
    }

    #[test]
    fn duplicate_id_is_an_error() {
        let result = validate(&graph(vec![designed("a", "A"), designed("a", "A2")]));
        assert!(!result.ok);
        let err = result
            .errors
            .iter()
            .find(|e| e.code == "duplicate-id")
            .expect("duplicate-id");
        assert_eq!(err.message, "duplicate feature id");
        assert_eq!(err.r#where.as_deref(), Some("a"));
    }

    #[test]
    fn malformed_id_rejects_non_slug_forms() {
        let evil = designed("evil; touch PWNED #", "E");
        let result = validate(&graph(vec![evil]));
        assert!(!result.ok);
        assert!(codes(&result).contains(&"malformed-id"));
        let err = result
            .errors
            .iter()
            .find(|e| e.code == "malformed-id")
            .unwrap();
        assert!(
            err.message.contains("^[a-z0-9][a-z0-9-]*$"),
            "{}",
            err.message
        );

        // Leading hyphen, uppercase, empty after non-empty check path, path sep.
        for bad in ["-leading", "Upper", "has_under", "has/slash", "has space"] {
            let result = validate(&graph(vec![designed(bad, "T")]));
            assert!(
                codes(&result).contains(&"malformed-id"),
                "expected malformed-id for {bad:?}"
            );
        }

        // Real slug forms stay clean.
        for good in ["a", "execution-pipeline2", "a1", "9lives", "a-b-c"] {
            let result = validate(&graph(vec![designed(good, "T")]));
            assert!(
                !codes(&result).contains(&"malformed-id"),
                "slug {good:?} must be valid; errors: {:?}",
                result.errors
            );
        }
    }

    #[test]
    fn missing_title_is_an_error() {
        let mut f = designed("a", "");
        f.title.clear();
        let result = validate(&graph(vec![f]));
        assert!(!result.ok);
        let err = result
            .errors
            .iter()
            .find(|e| e.code == "missing-title")
            .expect("missing-title");
        assert_eq!(err.message, "feature has no title");
        assert_eq!(err.r#where.as_deref(), Some("a"));
    }

    #[test]
    fn bad_status_rejects_in_flight_and_unknown() {
        let mut f = designed("a", "A");
        f.status = "building".to_owned();
        let result = validate(&graph(vec![f]));
        assert!(!result.ok);
        let err = result
            .errors
            .iter()
            .find(|e| e.code == "bad-status")
            .expect("bad-status");
        assert!(
            err.message.contains("proposed|designed|validated|shipped")
                && err.message.contains("building"),
            "{}",
            err.message
        );
    }

    #[test]
    fn missing_acceptance_on_non_proposed_but_proposed_exempt() {
        let proposed = feature("a", "A", "proposed");
        let result = validate(&graph(vec![proposed]));
        assert!(
            result.ok,
            "proposed without acceptance must pass: {:?}",
            result.errors
        );

        for status in ["designed", "validated", "shipped"] {
            let f = feature("a", "A", status);
            let result = validate(&graph(vec![f]));
            assert!(
                codes(&result).contains(&"missing-acceptance"),
                "{status} without acceptance must fail"
            );
            let err = result
                .errors
                .iter()
                .find(|e| e.code == "missing-acceptance")
                .unwrap();
            assert_eq!(err.message, "feature has no acceptance criterion");
        }

        // Empty / whitespace acceptance does not count.
        let mut empty_text = feature("a", "A", "designed");
        empty_text.acceptance = Some(Acceptance::Text("   ".to_owned()));
        assert!(codes(&validate(&graph(vec![empty_text]))).contains(&"missing-acceptance"));

        let mut empty_list = feature("a", "A", "designed");
        empty_list.acceptance = Some(Acceptance::List(vec![]));
        assert!(codes(&validate(&graph(vec![empty_list]))).contains(&"missing-acceptance"));

        let mut blank_entry = feature("a", "A", "designed");
        blank_entry.acceptance = Some(Acceptance::List(vec!["ok".to_owned(), "  ".to_owned()]));
        assert!(codes(&validate(&graph(vec![blank_entry]))).contains(&"missing-acceptance"));
    }

    #[test]
    fn self_and_dangling_dependencies_are_errors() {
        let mut f = designed("a", "A");
        f.depends_on = vec!["a".to_owned(), "ghost".to_owned()];
        f.depends_on_present = true;
        let result = validate(&graph(vec![f]));
        assert!(codes(&result).contains(&"self-dependency"));
        assert!(codes(&result).contains(&"dangling-dependency"));
        let dangling = result
            .errors
            .iter()
            .find(|e| e.code == "dangling-dependency")
            .unwrap();
        assert!(dangling.message.contains("ghost"), "{}", dangling.message);
    }

    #[test]
    fn dependency_cycle_reports_dfs_path_joined_by_arrow() {
        let mut a = designed("a", "A");
        a.depends_on = vec!["b".to_owned()];
        a.depends_on_present = true;
        let mut b = designed("b", "B");
        b.depends_on = vec!["a".to_owned()];
        b.depends_on_present = true;
        let result = validate(&graph(vec![a, b]));
        assert!(!result.ok);
        let err = result
            .errors
            .iter()
            .find(|e| e.code == "dependency-cycle")
            .expect("dependency-cycle");
        // Path closes the ring: a → b → a  (or b → a → b depending on visit order).
        assert!(
            err.message == "depends_on cycle: a → b → a"
                || err.message == "depends_on cycle: b → a → b",
            "cycle path must be full member path joined by \" → \"; got {}",
            err.message
        );
        assert!(err.r#where.as_deref() == Some("a") || err.r#where.as_deref() == Some("b"));

        // Three-node cycle.
        let mut a = designed("a", "A");
        a.depends_on = vec!["b".to_owned()];
        let mut b = designed("b", "B");
        b.depends_on = vec!["c".to_owned()];
        let mut c = designed("c", "C");
        c.depends_on = vec!["a".to_owned()];
        let result = validate(&graph(vec![a, b, c]));
        let err = result
            .errors
            .iter()
            .find(|e| e.code == "dependency-cycle")
            .expect("3-cycle");
        assert!(
            err.message.contains(" → "),
            "path must use arrow join: {}",
            err.message
        );
        // Full closed path has 4 tokens (n+1).
        let body = err.message.strip_prefix("depends_on cycle: ").unwrap();
        let parts: Vec<_> = body.split(" → ").collect();
        assert_eq!(parts.len(), 4, "closed cycle path length: {body}");
        assert_eq!(parts.first(), parts.last());
    }

    #[test]
    fn unknown_key_names_each_offending_top_level_and_per_feature_key() {
        let mut g = graph(vec![{
            let mut f = designed("alpha", "Alpha");
            f.unknown.insert("mystery".to_owned(), json!("typo"));
            f.unknown.insert("also_unknown".to_owned(), json!([1, 2]));
            f
        }]);
        g.unknown.insert("extra_top".to_owned(), json!(true));
        g.unknown
            .insert("typo_meta".to_owned(), json!({"nested": 1}));

        let result = validate(&g);
        assert!(!result.ok);
        let unknown: Vec<_> = result
            .errors
            .iter()
            .filter(|e| e.code == "unknown-key")
            .collect();
        assert_eq!(
            unknown.len(),
            4,
            "one issue per key; got {:?}",
            unknown.iter().map(|e| &e.message).collect::<Vec<_>>()
        );
        let messages: Vec<&str> = unknown.iter().map(|e| e.message.as_str()).collect();
        assert!(messages.iter().any(|m| m.contains("extra_top")));
        assert!(messages.iter().any(|m| m.contains("typo_meta")));
        assert!(messages.iter().any(|m| m.contains("mystery")));
        assert!(messages.iter().any(|m| m.contains("also_unknown")));

        // Per-feature unknown keys concern the feature id.
        let feature_unknown_count = unknown
            .iter()
            .filter(|e| e.r#where.as_deref() == Some("alpha"))
            .count();
        assert_eq!(feature_unknown_count, 2);
    }

    #[test]
    fn validate_inspects_model_only_never_text() {
        // Signature is &FeatureGraph — construct a model by hand with no parse/text path.
        let g = FeatureGraph {
            design_version: json!(1),
            features: vec![designed("solo", "Solo")],
            unknown: BTreeMap::new(),
        };
        let result = validate(&g);
        assert!(result.ok);
        // And a deliberately invalid model still validates purely from fields.
        let bad = FeatureGraph {
            design_version: json!(true),
            features: vec![feature("x", "X", "designed")],
            unknown: BTreeMap::new(),
        };
        let result = validate(&bad);
        assert!(codes(&result).contains(&"bad-doc-design-version"));
        assert!(codes(&result).contains(&"missing-acceptance"));
    }

    #[test]
    fn status_constant_matches_js_order() {
        assert_eq!(STATUS, &["proposed", "designed", "validated", "shipped"]);
    }
}
