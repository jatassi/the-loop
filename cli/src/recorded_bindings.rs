//! Recorded-bindings status reader: present / absent / opted-out for
//! `docs/architecture.md` heading sections.
//!
//! Pure — takes architecture text as a string; no filesystem or process I/O.
//! Ports `plugin/src/recorded-bindings.js`.

use serde_json::{Value, json};

/// Heading lines scanned for each recorded binding key.
const HEADINGS: &[(&str, &str)] = &[
    ("validationProcedure", "## Validation procedure"),
    ("releaseRunbook", "## Release runbook"),
    ("operationsToolkit", "## Operations toolkit"),
];

/// Named-gap wording for absent block-family bindings (configure design inventory).
/// Validation has no declared named-gap phrase.
fn gap_for(key: &str) -> Option<&'static str> {
    match key {
        "releaseRunbook" => Some("blocked — no guessed deploys"),
        "operationsToolkit" => Some("lazy retrofit (operate-tooling)"),
        _ => None,
    }
}

/// Derive present / absent / opted-out for the three recorded bindings.
///
/// Whole-section body `none` (trimmed, case-insensitive) is a recorded opt-out.
/// Absent block-family bindings carry their named-gap wording; validation has none.
#[must_use]
pub fn recorded_bindings_status(architecture_text: &str) -> Value {
    let mut out = serde_json::Map::new();
    for &(key, heading) in HEADINGS {
        out.insert(key.to_owned(), status_of(architecture_text, key, heading));
    }
    Value::Object(out)
}

fn status_of(text: &str, key: &str, heading: &str) -> Value {
    match section_after(text, heading) {
        None => json!({
            "status": "absent",
            "gap": gap_for(key),
        }),
        Some(body) if body.trim().eq_ignore_ascii_case("none") => json!({
            "status": "opted-out",
            "gap": null,
        }),
        Some(_) => json!({
            "status": "present",
            "gap": null,
        }),
    }
}

/// Body after a full-line heading until the next `## ` heading (or end of text).
/// Outer blank lines trimmed. `None` when the heading is absent.
///
/// Mirrors `sectionAfter` in `plugin/src/replace-fenced-block.js`.
fn section_after(text: &str, heading: &str) -> Option<String> {
    let heading_line_end = find_heading_line_end(text, heading)?;
    let after = &text[heading_line_end..];
    let end = after
        .find("\n## ")
        .map(|i| heading_line_end + i)
        .or_else(|| {
            // Heading at start of remainder without leading newline: `## ` at index 0
            // only when the previous line ended and we advanced past `\n` — so a
            // next heading is always `\n## ` or the body is empty / prose.
            if after.starts_with("## ") {
                Some(heading_line_end)
            } else {
                None
            }
        })
        .unwrap_or(text.len());
    let body = text[heading_line_end..end].trim_matches(|c| c == '\n' || c == '\r');
    Some(body.to_owned())
}

/// Locate a full-line heading match; returns the byte index just past that line's newline.
fn find_heading_line_end(text: &str, heading: &str) -> Option<usize> {
    let mut search_from = 0;
    while search_from <= text.len() {
        let rest = &text[search_from..];
        let rel = rest.find(heading)?;
        let abs = search_from + rel;

        let at_line_start = abs == 0 || text.as_bytes().get(abs.wrapping_sub(1)) == Some(&b'\n');
        if !at_line_start {
            search_from = abs.saturating_add(1);
            continue;
        }

        let after = &text[abs + heading.len()..];
        let mut only_ws_to_eol = true;
        let mut line_body_end = abs + heading.len();
        for (i, ch) in after.char_indices() {
            if ch == '\n' {
                line_body_end = abs + heading.len() + i;
                break;
            }
            if ch == '\r' {
                line_body_end = abs + heading.len() + i;
                continue;
            }
            if ch != ' ' && ch != '\t' {
                only_ws_to_eol = false;
                break;
            }
            line_body_end = abs + heading.len() + i + ch.len_utf8();
        }

        if only_ws_to_eol {
            let mut end = line_body_end;
            if text.as_bytes().get(end) == Some(&b'\r') {
                end += 1;
            }
            if text.as_bytes().get(end) == Some(&b'\n') {
                end += 1;
            }
            return Some(end);
        }

        search_from = abs.saturating_add(1);
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r"# Fixture — Architecture

## Validation procedure

Run `npm test` and expect all green.

## Release runbook

Tag the repo and push main.

## Operations toolkit

";

    #[test]
    fn present_absent_and_opted_out_with_js_named_gaps() {
        // Criterion: recordedBindings derives present/absent/opted-out with JS gap strings.
        let status = recorded_bindings_status(SAMPLE);
        assert_eq!(
            status["validationProcedure"],
            json!({ "status": "present", "gap": null })
        );
        assert_eq!(
            status["releaseRunbook"],
            json!({ "status": "present", "gap": null })
        );
        // Empty section body is still "present" (heading exists with empty body).
        // operationsToolkit is present with empty body in SAMPLE — wait, empty body
        // after trim is "" which is not "none", so present.
        assert_eq!(
            status["operationsToolkit"],
            json!({ "status": "present", "gap": null })
        );

        let opted = "# Arch\n\n## Validation procedure\n\nnone\n\n## Release runbook\n\nNONE\n\n## Operations toolkit\n\nNone\n";
        let o = recorded_bindings_status(opted);
        assert_eq!(o["validationProcedure"]["status"], "opted-out");
        assert_eq!(o["releaseRunbook"]["status"], "opted-out");
        assert_eq!(o["operationsToolkit"]["status"], "opted-out");
        assert!(o["validationProcedure"]["gap"].is_null());

        let missing = recorded_bindings_status("# No headings\n");
        assert_eq!(
            missing["validationProcedure"],
            json!({ "status": "absent", "gap": null })
        );
        assert_eq!(
            missing["releaseRunbook"],
            json!({
                "status": "absent",
                "gap": "blocked — no guessed deploys"
            })
        );
        assert_eq!(
            missing["operationsToolkit"],
            json!({
                "status": "absent",
                "gap": "lazy retrofit (operate-tooling)"
            })
        );
    }

    #[test]
    fn empty_text_treats_all_bindings_as_absent() {
        // hooks-list missing architecture.md path feeds empty string.
        let status = recorded_bindings_status("");
        assert_eq!(status["validationProcedure"]["status"], "absent");
        assert_eq!(status["releaseRunbook"]["status"], "absent");
        assert_eq!(status["operationsToolkit"]["status"], "absent");
        assert_eq!(
            status["operationsToolkit"]["gap"],
            "lazy retrofit (operate-tooling)"
        );
    }
}
