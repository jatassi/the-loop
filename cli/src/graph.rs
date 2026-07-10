//! Feature-graph JSON model with canonical parse/emit.
//!
//! This is the serde spine every graph command and later Rust vertical parses and
//! emits through. Validation (unknown-key refusal, status enum, edges, cycles) is
//! a later task — this module only shapes the model, applies field defaults, and
//! captures unknown keys so the validator can name them.

use std::collections::BTreeMap;
use std::fmt;

use serde_json::Value;

/// Parsed `docs/feature-graph.json` document.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FeatureGraph {
    /// Top-level `design_version`. Missing → [`Value::Null`].
    pub design_version: Value,
    pub features: Vec<Feature>,
    /// Unknown top-level keys preserved for the validator (not re-emitted).
    pub unknown: BTreeMap<String, Value>,
}

/// One feature record in the graph.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Feature {
    pub id: String,
    /// Optional grouping that replaces the YAML-era `# ── milestone ──` comments.
    pub section: Option<String>,
    pub title: String,
    pub status: String,
    /// Edge list. Absent in JSON becomes `[]` here; emit omits the key when the
    /// field was absent on parse (see [`Feature::depends_on_present`]).
    pub depends_on: Vec<String>,
    /// Whether the input object carried a `depends_on` key (even if `[]`).
    pub depends_on_present: bool,
    pub acceptance: Option<Acceptance>,
    pub notes: Option<Vec<String>>,
    /// Unknown per-feature keys preserved for the validator (not re-emitted).
    pub unknown: BTreeMap<String, Value>,
}

/// Feature acceptance: a single string or a list of strings.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Acceptance {
    Text(String),
    List(Vec<String>),
}

/// Named parse failure — never a panic.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ParseError {
    /// Input was not valid JSON (or not a JSON object at the root / feature slot).
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

/// Parse a feature-graph JSON document into the model.
///
/// Semantic problems (bad status, unknown keys, missing fields) are left for
/// the validator; this only builds the model shape.
///
/// # Errors
///
/// Returns [`ParseError::MalformedJson`] when the input is not valid JSON, the
/// root is not an object, `features` is not an array, a feature slot is not an
/// object, or a known array/string field has the wrong JSON type.
pub fn parse(text: &str) -> Result<FeatureGraph, ParseError> {
    let value: Value = serde_json::from_str(text).map_err(|err| ParseError::MalformedJson {
        message: err.to_string(),
    })?;
    parse_value(value)
}

fn parse_value(value: Value) -> Result<FeatureGraph, ParseError> {
    let Value::Object(obj) = value else {
        return Err(ParseError::MalformedJson {
            message: "feature graph root must be a JSON object".to_owned(),
        });
    };

    let mut design_version = Value::Null;
    let mut features = Vec::new();
    let mut unknown = BTreeMap::new();

    for (key, val) in obj {
        match key.as_str() {
            "design_version" => {
                design_version = val;
            }
            "features" => {
                features = parse_features(val)?;
            }
            _ => {
                unknown.insert(key, val);
            }
        }
    }

    Ok(FeatureGraph {
        design_version,
        features,
        unknown,
    })
}

fn parse_features(value: Value) -> Result<Vec<Feature>, ParseError> {
    let Value::Array(items) = value else {
        return Err(ParseError::MalformedJson {
            message: "features must be a JSON array".to_owned(),
        });
    };
    items.into_iter().map(parse_feature).collect()
}

fn parse_feature(value: Value) -> Result<Feature, ParseError> {
    let Value::Object(obj) = value else {
        return Err(ParseError::MalformedJson {
            message: "each feature must be a JSON object".to_owned(),
        });
    };

    let mut id = String::new();
    let mut section = None;
    let mut title = String::new();
    let mut status = String::new();
    let mut depends_on = Vec::new();
    let mut depends_on_present = false;
    let mut acceptance = None;
    let mut notes = None;
    let mut unknown = BTreeMap::new();

    for (key, val) in obj {
        match key.as_str() {
            "id" => {
                if let Some(s) = val.as_str() {
                    s.clone_into(&mut id);
                }
                // Non-string id: leave default ""; validator names the offense.
            }
            "section" => {
                if let Some(s) = val.as_str() {
                    section = Some(s.to_owned());
                }
                // null / wrong type → absent; validator does not require section.
            }
            "title" => {
                if let Some(s) = val.as_str() {
                    s.clone_into(&mut title);
                }
            }
            "status" => {
                if let Some(s) = val.as_str() {
                    s.clone_into(&mut status);
                }
            }
            "depends_on" => {
                depends_on_present = true;
                depends_on = parse_string_array(val, "depends_on")?;
            }
            "acceptance" => {
                acceptance = Some(parse_acceptance(val)?);
            }
            "notes" => {
                notes = Some(parse_string_array(val, "notes")?);
            }
            _ => {
                unknown.insert(key, val);
            }
        }
    }

    Ok(Feature {
        id,
        section,
        title,
        status,
        depends_on,
        depends_on_present,
        acceptance,
        notes,
        unknown,
    })
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

fn parse_acceptance(value: Value) -> Result<Acceptance, ParseError> {
    match value {
        Value::String(s) => Ok(Acceptance::Text(s)),
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
            Ok(Acceptance::List(out))
        }
        other => Err(ParseError::MalformedJson {
            message: format!("acceptance must be a string or array of strings (got {other})"),
        }),
    }
}

/// Emit the graph as canonical JSON.
///
/// Design-doc key order, 2-space indent, LF, trailing newline. Unknown keys are
/// not written (they live on the model for the validator). Absent optionals stay
/// absent — no null churn. Key order is written by hand: without `serde_json`'s
/// `preserve_order` feature, `Map` alphabetizes keys.
#[must_use]
pub fn emit(graph: &FeatureGraph) -> String {
    let mut out = String::new();
    out.push_str("{\n");
    out.push_str("  \"design_version\": ");
    out.push_str(&compact_json(&graph.design_version));
    out.push_str(",\n");
    out.push_str("  \"features\": ");
    if graph.features.is_empty() {
        out.push_str("[]\n");
    } else {
        out.push_str("[\n");
        for (i, feature) in graph.features.iter().enumerate() {
            write_feature(&mut out, feature, 2);
            if i + 1 < graph.features.len() {
                out.push(',');
            }
            out.push('\n');
        }
        out.push_str("  ]\n");
    }
    out.push_str("}\n");
    out
}

fn write_feature(out: &mut String, feature: &Feature, base_indent: usize) {
    let pad = "  ".repeat(base_indent);
    let inner = "  ".repeat(base_indent + 1);
    out.push_str(&pad);
    out.push_str("{\n");

    // Design-doc order: id, section, title, status, depends_on, acceptance, notes.
    let mut fields: Vec<(&str, String)> = Vec::new();
    fields.push(("id", string_json(&feature.id)));
    if let Some(section) = &feature.section {
        fields.push(("section", string_json(section)));
    }
    fields.push(("title", string_json(&feature.title)));
    fields.push(("status", string_json(&feature.status)));
    if feature.depends_on_present {
        fields.push((
            "depends_on",
            pretty_string_array(&feature.depends_on, base_indent + 1),
        ));
    }
    if let Some(acceptance) = &feature.acceptance {
        fields.push(("acceptance", pretty_acceptance(acceptance, base_indent + 1)));
    }
    if let Some(notes) = &feature.notes {
        fields.push(("notes", pretty_string_array(notes, base_indent + 1)));
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

fn pretty_acceptance(acceptance: &Acceptance, indent_level: usize) -> String {
    match acceptance {
        Acceptance::Text(s) => string_json(s),
        Acceptance::List(items) => pretty_string_array(items, indent_level),
    }
}

/// Pretty-print a string array at `indent_level` (number of 2-space steps for the
/// `[` line's content indent of elements). Empty → `[]` on one line.
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

fn string_json(s: &str) -> String {
    // serde_json handles escaping.
    serde_json::to_string(s).unwrap_or_else(|_| "\"\"".to_owned())
}

fn compact_json(value: &Value) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "null".to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// Shuffled keys, 4-space indent, no trailing newline — a realistic hand-edit.
    const SHUFFLED_HAND_EDIT: &str = r#"{
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

    /// Design-doc key order, 2-space indent, LF, trailing newline.
    const CANONICAL: &str = r#"{
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

    #[test]
    fn parse_emit_round_trip_shuffled_keys_is_content_equal_and_byte_canonical() {
        let graph = parse(SHUFFLED_HAND_EDIT).expect("hand-edit must parse");
        let emitted = emit(&graph);

        // Byte-canonical: exact design-doc key order, 2-space indent, trailing newline.
        assert_eq!(
            emitted, CANONICAL,
            "emit must be byte-canonical\n--- got ---\n{emitted}\n--- expected ---\n{CANONICAL}"
        );
        assert!(
            emitted.ends_with('\n'),
            "canonical emit must end with a trailing newline"
        );
        assert!(
            !emitted.ends_with("\n\n"),
            "canonical emit must not have extra trailing blank lines"
        );
        assert!(
            !emitted.contains('\r'),
            "canonical emit must use LF only, not CRLF"
        );

        // Content JSON-equal to the hand-edit (key order / whitespace ignored).
        let hand: Value =
            serde_json::from_str(SHUFFLED_HAND_EDIT).expect("hand-edit is valid JSON");
        let out: Value = serde_json::from_str(&emitted).expect("emit is valid JSON");
        assert_eq!(out, hand, "emit content must be JSON-equal to the input");
    }

    #[test]
    fn absent_section_notes_depends_on_parse_clean_and_stay_absent_on_emit() {
        let input = r#"{
  "design_version": 2,
  "features": [
    {
      "id": "solo",
      "title": "Solo feature",
      "status": "proposed",
      "acceptance": "one criterion"
    }
  ]
}
"#;
        let graph = parse(input).expect("minimal feature must parse");
        assert_eq!(graph.features.len(), 1);
        let f = &graph.features[0];
        assert_eq!(f.section, None);
        assert_eq!(f.notes, None);
        assert!(
            !f.depends_on_present,
            "depends_on must record absence when the key is missing"
        );
        assert_eq!(
            f.depends_on,
            Vec::<String>::new(),
            "depends_on defaults to [] in the model when absent"
        );

        let emitted = emit(&graph);
        assert!(
            !emitted.contains("\"section\""),
            "absent section must not appear on emit: {emitted}"
        );
        assert!(
            !emitted.contains("\"notes\""),
            "absent notes must not appear on emit: {emitted}"
        );
        assert!(
            !emitted.contains("\"depends_on\""),
            "absent depends_on must not appear on emit (no null/empty churn): {emitted}"
        );
        assert!(
            !emitted.contains("null"),
            "emit must not introduce null churn: {emitted}"
        );

        // Re-parse the emit: still absent, still defaults to [] in the model.
        let again = parse(&emitted).expect("canonical emit must re-parse");
        assert!(!again.features[0].depends_on_present);
        assert_eq!(again.features[0].depends_on, Vec::<String>::new());
        assert_eq!(again.features[0].section, None);
        assert_eq!(again.features[0].notes, None);
    }

    #[test]
    fn empty_depends_on_array_stays_present_on_emit() {
        let input = r#"{
  "design_version": 1,
  "features": [
    {
      "id": "alpha",
      "title": "Alpha",
      "status": "proposed",
      "depends_on": []
    }
  ]
}
"#;
        let graph = parse(input).expect("parse");
        assert!(graph.features[0].depends_on_present);
        assert_eq!(graph.features[0].depends_on, Vec::<String>::new());
        let emitted = emit(&graph);
        assert!(
            emitted.contains("\"depends_on\": []") || emitted.contains("\"depends_on\":[]"),
            "present empty depends_on must re-emit as []: {emitted}"
        );
        // Pretty form uses the space after colon from serde_json.
        assert!(emitted.contains("\"depends_on\": []"), "{emitted}");
    }

    #[test]
    fn unknown_top_level_and_per_feature_keys_are_captured_not_dropped_or_panic() {
        let input = r#"{
  "design_version": 1,
  "extra_top": true,
  "typo_meta": {"nested": 1},
  "features": [
    {
      "id": "alpha",
      "title": "Alpha",
      "status": "proposed",
      "mystery": "hand-edit typo",
      "also_unknown": [1, 2]
    }
  ]
}
"#;
        let graph = parse(input).expect("unknown keys must not make parse panic or fail");
        assert_eq!(
            graph.unknown.get("extra_top"),
            Some(&Value::Bool(true)),
            "top-level unknown must be captured"
        );
        assert_eq!(
            graph.unknown.get("typo_meta"),
            Some(&json!({"nested": 1})),
            "top-level unknown object must be captured intact"
        );
        assert_eq!(graph.unknown.len(), 2);

        let f = &graph.features[0];
        assert_eq!(
            f.unknown.get("mystery"),
            Some(&Value::String("hand-edit typo".to_owned()))
        );
        assert_eq!(f.unknown.get("also_unknown"), Some(&json!([1, 2])));
        assert_eq!(f.unknown.len(), 2);

        // Canonical emit must not re-emit unknown keys (validator owns naming them).
        let emitted = emit(&graph);
        assert!(
            !emitted.contains("extra_top")
                && !emitted.contains("typo_meta")
                && !emitted.contains("mystery")
                && !emitted.contains("also_unknown"),
            "unknown keys must not be re-emitted: {emitted}"
        );
    }

    #[test]
    fn malformed_json_returns_named_error_never_panics() {
        let cases = [
            "",
            "{",
            "{not json}",
            "null",
            "[]",
            "\"string\"",
            "{\n  \"design_version\": 1,\n  \"features\": {}\n}",
            "{\n  \"design_version\": 1,\n  \"features\": [null]\n}",
        ];
        for input in cases {
            let result = std::panic::catch_unwind(|| parse(input));
            let result = result.expect("parse must never panic");
            let err = result.expect_err("malformed input must be Err");
            match &err {
                ParseError::MalformedJson { message } => {
                    assert!(
                        !message.is_empty(),
                        "MalformedJson must carry a non-empty message for {input:?}"
                    );
                }
            }
            // Display names the error class.
            let rendered = err.to_string();
            assert!(
                rendered.contains("malformed JSON"),
                "Display must name the error; got {rendered:?}"
            );
        }
    }

    #[test]
    fn acceptance_string_and_list_forms_round_trip() {
        let as_string = r#"{
  "design_version": 1,
  "features": [
    {
      "id": "a",
      "title": "A",
      "status": "proposed",
      "acceptance": "single line"
    }
  ]
}
"#;
        let graph = parse(as_string).expect("string acceptance");
        assert_eq!(
            graph.features[0].acceptance,
            Some(Acceptance::Text("single line".to_owned()))
        );
        let emitted = emit(&graph);
        let reparsed: Value = serde_json::from_str(&emitted).unwrap();
        assert_eq!(
            reparsed["features"][0]["acceptance"],
            Value::String("single line".to_owned())
        );

        let as_list = r#"{
  "design_version": 1,
  "features": [
    {
      "id": "a",
      "title": "A",
      "status": "designed",
      "acceptance": ["one", "two"]
    }
  ]
}
"#;
        let graph = parse(as_list).expect("list acceptance");
        assert_eq!(
            graph.features[0].acceptance,
            Some(Acceptance::List(vec!["one".to_owned(), "two".to_owned()]))
        );
        let emitted = emit(&graph);
        assert!(emitted.contains("\"acceptance\": ["), "{emitted}");
    }

    #[test]
    fn feature_key_order_on_emit_matches_design_doc() {
        // All optional fields present — order must be id, section, title, status,
        // depends_on, acceptance, notes (and top-level design_version, features).
        let input = r#"{
  "features": [
    {
      "notes": ["n"],
      "acceptance": ["a"],
      "depends_on": ["x"],
      "status": "shipped",
      "title": "T",
      "section": "S",
      "id": "i"
    }
  ],
  "design_version": 9
}"#;
        let emitted = emit(&parse(input).unwrap());
        let id = emitted.find("\"id\"").unwrap();
        let section = emitted.find("\"section\"").unwrap();
        let title = emitted.find("\"title\"").unwrap();
        let status = emitted.find("\"status\"").unwrap();
        let depends_on = emitted.find("\"depends_on\"").unwrap();
        let acceptance = emitted.find("\"acceptance\"").unwrap();
        let notes = emitted.find("\"notes\"").unwrap();
        assert!(
            id < section
                && section < title
                && title < status
                && status < depends_on
                && depends_on < acceptance
                && acceptance < notes,
            "per-feature key order broken in:\n{emitted}"
        );
        let dv = emitted.find("\"design_version\"").unwrap();
        let features = emitted.find("\"features\"").unwrap();
        assert!(dv < features, "top-level key order broken in:\n{emitted}");
    }
}
