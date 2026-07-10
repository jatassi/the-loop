//! Workflow-script splicer: pure string rewrites for the per-run execution pipeline.
//!
//! Ports `plugin/src/splice-workflow-description.js` — `describeRun`, the
//! meta-line description splice, and the `EMBEDDED_CONTEXT` splice — without a
//! `regex` dependency. Shape gates are scanned by hand over `&str` so the
//! observable refusals and byte-identical rewrites match the JS core exactly.
//! Callers supply already-shaped description text and compact context JSON;
//! this module never opens files or launches a process.

/// Scope-derived description: in-scope feature ids in order, past 5 collapsed
/// to the first 5 plus `+<k> more`, then ` → <target>`.
///
/// Byte-equal to the JS `describeRun` on the same inputs (including the UTF-8
/// arrow).
#[must_use]
pub fn describe_run(scope: &[String], target: &str) -> String {
    if scope.len() > 5 {
        let head: Vec<&str> = scope[..5].iter().map(String::as_str).collect();
        format!("{}, +{} more → {target}", head.join(", "), scope.len() - 5)
    } else {
        let ids: Vec<&str> = scope.iter().map(String::as_str).collect();
        format!("{} → {target}", ids.join(", "))
    }
}

/// Splice `description` into the one-line `export const meta …;` declaration.
///
/// The value is JSON-stringified so quotes, backslashes, and `$` in a target
/// name stay quote-safe. Replaces only the `description: '…'` value; the rest
/// of the meta line and script stay byte-identical.
///
/// # Errors
///
/// Returns `Err` naming `description` when no one-line meta declaration is
/// found, or when that line lacks a single-quoted `description: '…'` value.
/// Never returns a partially-spliced script.
pub fn splice_run_description(script_text: &str, description: &str) -> Result<String, String> {
    let (meta_start, meta_line) = find_meta_line(script_text).ok_or_else(|| {
        "canonical workflow script's meta line does not carry the expected description: '…' shape — refusing to splice".to_owned()
    })?;
    let (value_start, value_end) = find_description_value(meta_line).ok_or_else(|| {
        "canonical workflow script's meta line does not carry the expected description: '…' shape — refusing to splice".to_owned()
    })?;

    let json = serde_json::to_string(description)
        .map_err(|err| format!("failed to JSON-stringify description: {err}"))?;
    let replacement = format!("description: {json}");

    let mut out = String::with_capacity(
        script_text.len() + replacement.len().saturating_sub(value_end - value_start),
    );
    out.push_str(&script_text[..meta_start + value_start]);
    out.push_str(&replacement);
    out.push_str(&script_text[meta_start + value_end..]);
    Ok(out)
}

/// Splice compact `context_json` into the `EMBEDDED_CONTEXT = null` target line.
///
/// The whole matched line (optional trailing `//` comment included) is replaced
/// with `const EMBEDDED_CONTEXT = <context_json>;` — the comment is dropped.
///
/// # Errors
///
/// Returns `Err` naming `EMBEDDED_CONTEXT` when the target line is missing or
/// already spliced (anything other than `null`). Never returns a partially-
/// spliced script.
pub fn splice_embedded_context(script_text: &str, context_json: &str) -> Result<String, String> {
    let (line_start, line) = find_embedded_context_line(script_text).ok_or_else(|| {
        "canonical workflow script does not carry the expected EMBEDDED_CONTEXT = null shape — refusing to splice"
            .to_owned()
    })?;

    let replacement = format!("const EMBEDDED_CONTEXT = {context_json};");
    let mut out =
        String::with_capacity(script_text.len() + replacement.len().saturating_sub(line.len()));
    out.push_str(&script_text[..line_start]);
    out.push_str(&replacement);
    out.push_str(&script_text[line_start + line.len()..]);
    Ok(out)
}

/// Chain both splices: description then embedded context.
///
/// Only the fully-spliced text is returned; either gate failing yields `Err`
/// with no partial result.
///
/// # Errors
///
/// Propagates the first of [`splice_run_description`] or
/// [`splice_embedded_context`]'s refusal.
pub fn splice_workflow_script(
    script_text: &str,
    description: &str,
    context_json: &str,
) -> Result<String, String> {
    let with_description = splice_run_description(script_text, description)?;
    splice_embedded_context(&with_description, context_json)
}

/// Physical line matching `/^export const meta\b.*;$/m` — starts with
/// `export const meta` at a word boundary, ends with `;`.
fn find_meta_line(script_text: &str) -> Option<(usize, &str)> {
    for_each_physical_line(script_text, |start, line| {
        if is_meta_line(line) {
            Some((start, line))
        } else {
            None
        }
    })
}

fn is_meta_line(line: &str) -> bool {
    const PREFIX: &str = "export const meta";
    if !line.starts_with(PREFIX) || !line.ends_with(';') {
        return false;
    }
    // `\b` after `meta`: next char (if any) must not be a word character.
    line[PREFIX.len()..]
        .chars()
        .next()
        .is_none_or(|c| !is_word_char(c))
}

/// Within a meta line, the first `/description: '(?:[^'\\]|\\.)*'/` match.
/// Returns byte offsets into `meta_line` of the full `description: '…'` span.
fn find_description_value(meta_line: &str) -> Option<(usize, usize)> {
    const MARKER: &str = "description: '";
    let value_start = meta_line.find(MARKER)?;
    let mut i = value_start + MARKER.len();
    while i < meta_line.len() {
        let c = meta_line[i..].chars().next()?;
        i += c.len_utf8();
        if c == '\\' {
            let escaped = meta_line[i..].chars().next()?;
            i += escaped.len_utf8();
        } else if c == '\'' {
            return Some((value_start, i));
        }
    }
    None
}

/// Physical line matching `/^const EMBEDDED_CONTEXT = null;(?:\s*\/\/.*)?$/m`.
fn find_embedded_context_line(script_text: &str) -> Option<(usize, &str)> {
    for_each_physical_line(script_text, |start, line| {
        if is_embedded_context_line(line) {
            Some((start, line))
        } else {
            None
        }
    })
}

fn is_embedded_context_line(line: &str) -> bool {
    const TARGET: &str = "const EMBEDDED_CONTEXT = null;";
    if !line.starts_with(TARGET) {
        return false;
    }
    let rest = &line[TARGET.len()..];
    if rest.is_empty() {
        return true;
    }
    // `(?:\s*\/\/.*)?` — if anything remains it must be `\s*//…`.
    rest.trim_start_matches(char::is_whitespace)
        .starts_with("//")
}

/// JS `\w` character class: ASCII alphanumeric or `_`.
const fn is_word_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

/// Walk physical lines (split on `\n`; a trailing `\r` is stripped for matching
/// only and is not part of the returned line slice when present — real fixtures
/// use `\n` alone). `f` receives the byte offset of the line content and the
/// line without its terminator; the first `Some` is returned.
fn for_each_physical_line<'a, F, T>(text: &'a str, mut f: F) -> Option<T>
where
    F: FnMut(usize, &'a str) -> Option<T>,
{
    let mut offset = 0usize;
    while offset <= text.len() {
        let rest = &text[offset..];
        let (line, step) = if let Some(rel) = rest.find('\n') {
            let raw = &rest[..rel];
            let line = raw.strip_suffix('\r').unwrap_or(raw);
            (line, rel + 1)
        } else {
            if rest.is_empty() && offset > 0 {
                // Final empty segment after a trailing newline — not a physical line.
                break;
            }
            let line = rest.strip_suffix('\r').unwrap_or(rest);
            (line, rest.len())
        };
        if let Some(hit) = f(offset, line) {
            return Some(hit);
        }
        if step == 0 {
            break;
        }
        offset += step;
        if offset == text.len() {
            // Text ended on a newline: no further line.
            break;
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    const CANONICAL: &str = "export const meta = { name: 'execution-pipeline', description: 'One autonomous pass over the scoped feature graph', whenToUse: 'x', phases: [{ title: 'Plan' }] };\nconst rest = 1;\n";

    const WITH_EMBEDDED_TARGET: &str = "\
export const meta = { name: 'execution-pipeline', description: 'static' };\n\
const EMBEDDED_CONTEXT = null; // spliced to a literal by prepare-execution-context --script-out\n\
const executionContext = EMBEDDED_CONTEXT ?? args;\n\
";

    #[test]
    fn describe_run_joins_scope_ids_and_target() {
        assert_eq!(
            describe_run(&["alpha".into(), "beta".into()], "main"),
            "alpha, beta → main"
        );
        assert_eq!(
            describe_run(&["solo".into()], "release/1.0"),
            "solo → release/1.0"
        );
    }

    #[test]
    fn describe_run_collapses_past_five() {
        let scope = ["a", "b", "c", "d", "e", "f", "g"].map(str::to_owned);
        assert_eq!(
            describe_run(&scope, "main"),
            "a, b, c, d, e, +2 more → main"
        );
    }

    #[test]
    fn splice_run_description_replaces_only_description_value() {
        let spliced =
            splice_run_description(CANONICAL, "alpha, beta → main").expect("canonical meta");
        assert!(spliced.contains(r#"description: "alpha, beta → main""#));
        assert!(spliced.contains("name: 'execution-pipeline'"));
        assert!(spliced.contains("whenToUse: 'x'"));
        assert!(spliced.contains("phases: [{ title: 'Plan' }]"));
        assert!(spliced.ends_with("\nconst rest = 1;\n"));
        assert_eq!(
            spliced
                .lines()
                .filter(|l| l.starts_with("export const meta"))
                .count(),
            1
        );
        // Meta stays one physical line (no extra newlines).
        assert_eq!(
            spliced.matches('\n').count(),
            CANONICAL.matches('\n').count()
        );
    }

    #[test]
    fn splice_run_description_is_quote_safe() {
        let description = r#"weird's target "branch" \with\ backslashes → main"#;
        let spliced = splice_run_description(CANONICAL, description).expect("quote-safe");
        let expected_json = serde_json::to_string(description).unwrap();
        assert!(spliced.contains(&format!("description: {expected_json}")));
        assert_eq!(
            spliced.matches('\n').count(),
            CANONICAL.matches('\n').count()
        );
        // Round-trip: the JSON-stringified value parses back to the original.
        let meta = spliced.lines().next().unwrap();
        let marker = "description: ";
        let start = meta.find(marker).unwrap() + marker.len();
        // Value is a JSON string literal starting at `start`.
        let parsed: String = serde_json::from_str(meta[start..].split_once(',').unwrap().0)
            .expect("description JSON");
        assert_eq!(parsed, description);
    }

    #[test]
    fn splice_run_description_refuses_bad_meta_shapes() {
        let multi_line = "export const meta = {\n  name: 'x',\n  description: 'y',\n};\n";
        let err = splice_run_description(multi_line, "z").unwrap_err();
        assert!(
            err.contains("description"),
            "multi-line meta err should name description: {err}"
        );

        let double_quoted = "export const meta = { name: 'x', description: \"y\" };\n";
        let err = splice_run_description(double_quoted, "z").unwrap_err();
        assert!(
            err.contains("description"),
            "double-quoted err should name description: {err}"
        );

        let no_description = "export const meta = { name: 'x' };\n";
        let err = splice_run_description(no_description, "z").unwrap_err();
        assert!(
            err.contains("description"),
            "missing field err should name description: {err}"
        );
    }

    #[test]
    fn splice_embedded_context_replaces_null_with_json_literal() {
        let ctx =
            r#"{"scope":["widget"],"target":"main","features":{"widget":{"designDoc":"plain"}}}"#;
        let spliced = splice_embedded_context(WITH_EMBEDDED_TARGET, ctx).expect("embedded");
        assert!(spliced.contains(&format!("const EMBEDDED_CONTEXT = {ctx};")));
        assert!(spliced.contains("const executionContext = EMBEDDED_CONTEXT ?? args;"));
        assert!(!spliced.contains("const EMBEDDED_CONTEXT = null"));
        // Trailing comment dropped; newline count preserved (line still ends with \n).
        assert_eq!(
            spliced.matches('\n').count(),
            WITH_EMBEDDED_TARGET.matches('\n').count()
        );
    }

    #[test]
    fn splice_embedded_context_is_lossless_for_escaped_quotes() {
        // design-doc prose carrying nested \" (e.g. data-audio=\"on\").
        let ctx = r#"{"scope":["live-session"],"features":{"live-session":{"designDoc":"Accepts data-audio=\\\"on\\\" for audio."}}}"#;
        let spliced = splice_embedded_context(WITH_EMBEDDED_TARGET, ctx).expect("nested quotes");
        assert!(spliced.contains(ctx));
        assert_eq!(
            spliced.matches('\n').count(),
            WITH_EMBEDDED_TARGET.matches('\n').count()
        );
    }

    #[test]
    fn splice_embedded_context_refuses_missing_or_already_spliced() {
        let no_target = "export const meta = { name: 'x', description: 'y' };\nconst rest = 1;\n";
        let err = splice_embedded_context(no_target, "{}").unwrap_err();
        assert!(
            err.contains("EMBEDDED_CONTEXT"),
            "missing target err should name EMBEDDED_CONTEXT: {err}"
        );

        let already = "const EMBEDDED_CONTEXT = {\"a\":1};\n";
        let err = splice_embedded_context(already, "{}").unwrap_err();
        assert!(
            err.contains("EMBEDDED_CONTEXT"),
            "already-spliced err should name EMBEDDED_CONTEXT: {err}"
        );
    }

    #[test]
    fn real_canonical_script_both_splices_match_direct_substitution() {
        let script = crate::DEFAULT_WORKFLOW_SCRIPT;
        let original_meta = "export const meta = { name: 'execution-pipeline', description: 'One autonomous pass over the scoped feature graph: Plan → Build → Validate per feature, concurrent where dependencies allow, ending in a run summary', whenToUse: 'Launched by /begin with the `the-loop prepare-execution-context` execution context as args — never invoked bare', phases: [{ title: 'Plan' }, { title: 'Build' }, { title: 'Validate' }, { title: 'Record' }] };";
        let original_emb = "const EMBEDDED_CONTEXT = null; // spliced to a literal by prepare-execution-context --script-out";
        assert!(
            script.contains(original_meta),
            "compiled-in script must carry the real meta line"
        );
        assert!(
            script.contains(original_emb),
            "compiled-in script must carry the real EMBEDDED_CONTEXT target"
        );

        let scope = ["a", "b", "c", "d", "e", "f", "g"].map(str::to_owned);
        let description = describe_run(&scope, "main");
        let context_json = r#"{"scope":["alpha"],"target":"main","a":1,"features":{"alpha":{"designDoc":"x \"y\" \\ $1"}}}"#;

        let desc_json = serde_json::to_string(&description).unwrap();
        let old_value = "description: 'One autonomous pass over the scoped feature graph: Plan → Build → Validate per feature, concurrent where dependencies allow, ending in a run summary'";
        let spliced_meta =
            original_meta.replacen(old_value, &format!("description: {desc_json}"), 1);
        let spliced_emb = format!("const EMBEDDED_CONTEXT = {context_json};");
        let expected = script.replacen(original_meta, &spliced_meta, 1).replacen(
            original_emb,
            &spliced_emb,
            1,
        );

        let got = splice_workflow_script(script, &description, context_json)
            .expect("canonical script must splice");
        assert_eq!(got, expected);

        // Also assert the combinator equals sequential pure splices.
        let sequential = splice_embedded_context(
            &splice_run_description(script, &description).unwrap(),
            context_json,
        )
        .unwrap();
        assert_eq!(got, sequential);
    }

    #[test]
    fn splice_workflow_script_both_succeed() {
        let description = "alpha → main";
        let ctx = r#"{"a":1}"#;
        let got = splice_workflow_script(WITH_EMBEDDED_TARGET, description, ctx).expect("both");
        let expected_json = serde_json::to_string(description).unwrap();
        assert!(got.contains(&format!("description: {expected_json}")));
        assert!(got.contains(&format!("const EMBEDDED_CONTEXT = {ctx};")));
        assert!(!got.contains("const EMBEDDED_CONTEXT = null"));
    }

    #[test]
    fn splice_workflow_script_refuses_partial_when_embedded_fails() {
        // Description gate succeeds on CANONICAL; embedded gate fails (no target).
        let err = splice_workflow_script(CANONICAL, "alpha → main", r#"{"a":1}"#).unwrap_err();
        assert!(
            err.contains("EMBEDDED_CONTEXT"),
            "embedded failure should surface: {err}"
        );
        // Combinator must not hand back a description-only partial — Err only.
        // (If it returned Ok with a partial, the assert above would not run on Err.)
    }
}
