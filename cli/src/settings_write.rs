//! Surgical write of one `"the-loop".<family>` entry into a settings-file text.
//!
//! Whole-entry replacement for that family; every other byte of the file survives
//! verbatim (unrelated top-level keys, nested structure, sibling families, formatting).
//! Pure — no filesystem; the hooks-set CLI does I/O.

use serde::Serialize;
use serde_json::Value;
use std::error::Error;
use std::fmt;

const LOOP_KEY: &str = "the-loop";
const DEFAULT_INDENT: &str = "  ";

/// Error from a surgical settings write (parse / shape / scan failure).
///
/// On any error the original document is left untouched: callers receive no
/// replacement text.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SettingsWriteError {
    message: String,
}

impl SettingsWriteError {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl fmt::Display for SettingsWriteError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

impl Error for SettingsWriteError {}

/// One object member located in source text (byte indices into the original).
#[derive(Debug, Clone)]
struct Member {
    key: String,
    key_start: usize,
    value_start: usize,
    value_end: usize,
    /// Index just past the value (end of this member, before optional comma).
    end: usize,
}

/// Top-level members of a `{...}` object span.
#[derive(Debug, Clone)]
struct ObjectSpan {
    open_brace: usize,
    close_brace: usize,
    members: Vec<Member>,
}

/// Set `"the-loop".<family>` on a settings document by whole-entry replacement.
///
/// - `text == None` (missing file) yields a fresh two-space-indented document
///   with a trailing newline.
/// - Otherwise the write is byte-surgical: only the targeted family value (or a
///   newly inserted `"the-loop"` / family member) changes; every other byte is
///   preserved.
///
/// # Errors
///
/// Returns [`SettingsWriteError`] when `text` is unparseable JSON, the root is
/// not a plain object, or `"the-loop"` is present but not a plain object. No
/// replacement text is produced on error.
pub fn write_settings_entry(
    text: Option<&str>,
    family: &str,
    value: &Value,
) -> Result<String, SettingsWriteError> {
    let Some(text) = text else {
        return Ok(fresh_document(family, value));
    };

    let parsed = parse_settings_text(text)?;
    assert_plain_object_root(&parsed)?;
    assert_the_loop_shape(&parsed)?;

    let root = list_object_members(text, object_start_at(text, 0)?)?;
    let indent_unit = infer_indent_unit(text, &root.members);
    let loop_member = root.members.iter().find(|m| m.key == LOOP_KEY);

    let Some(loop_member) = loop_member else {
        let loop_value = Value::Object(serde_json::Map::from_iter([(
            family.to_owned(),
            value.clone(),
        )]));
        return insert_member(text, &root, LOOP_KEY, &loop_value, &indent_unit, "");
    };

    let loop_obj = list_object_members(text, loop_member.value_start)?;
    if let Some(family_member) = loop_obj.members.iter().find(|m| m.key == family) {
        return replace_member_value(text, family_member, value, &indent_unit);
    }

    let parent_key_indent = line_indent_at(text, loop_member.key_start);
    insert_member(
        text,
        &loop_obj,
        family,
        value,
        &indent_unit,
        &parent_key_indent,
    )
}

fn fresh_document(family: &str, value: &Value) -> String {
    let mut family_map = serde_json::Map::new();
    family_map.insert(family.to_owned(), value.clone());
    let mut root = serde_json::Map::new();
    root.insert(LOOP_KEY.to_owned(), Value::Object(family_map));
    // serde_json::to_string_pretty uses two-space indent, matching
    // JSON.stringify(…, null, 2). Always succeeds for Value.
    let body =
        serde_json::to_string_pretty(&Value::Object(root)).unwrap_or_else(|_| "{}".to_owned());
    format!("{body}\n")
}

fn parse_settings_text(text: &str) -> Result<Value, SettingsWriteError> {
    serde_json::from_str(text).map_err(|error| {
        SettingsWriteError::new(format!("unparseable JSON in settings text: {error}"))
    })
}

fn assert_plain_object_root(parsed: &Value) -> Result<(), SettingsWriteError> {
    if parsed.is_object() {
        Ok(())
    } else {
        Err(SettingsWriteError::new(format!(
            "settings text must be a JSON object (got {})",
            describe_type(parsed)
        )))
    }
}

fn assert_the_loop_shape(parsed: &Value) -> Result<(), SettingsWriteError> {
    let Some(loop_val) = parsed.get(LOOP_KEY) else {
        return Ok(());
    };
    if loop_val.is_object() {
        Ok(())
    } else {
        Err(SettingsWriteError::new(format!(
            "\"{LOOP_KEY}\" must be a plain object (got {})",
            describe_type(loop_val)
        )))
    }
}

const fn describe_type(v: &Value) -> &'static str {
    match v {
        Value::Null => "null",
        Value::Bool(_) => "boolean",
        Value::Number(_) => "number",
        Value::String(_) => "string",
        Value::Array(_) => "array",
        Value::Object(_) => "object",
    }
}

fn skip_ws(text: &str, mut i: usize) -> usize {
    let bytes = text.as_bytes();
    while i < bytes.len() && matches!(bytes[i], b' ' | b'\t' | b'\n' | b'\r') {
        i += 1;
    }
    i
}

fn object_start_at(text: &str, from: usize) -> Result<usize, SettingsWriteError> {
    let i = skip_ws(text, from);
    let bytes = text.as_bytes();
    if i >= bytes.len() || bytes[i] != b'{' {
        return Err(SettingsWriteError::new(format!(
            "expected '{{' at index {i} in settings text"
        )));
    }
    Ok(i)
}

fn scan_string(text: &str, i: usize) -> Result<usize, SettingsWriteError> {
    // `i` is at the opening quote. ASCII delimiters are single-byte; UTF-8
    // continuation bytes never collide with `"` / `\`, so byte-stepping is safe.
    let bytes = text.as_bytes();
    let mut j = i + 1;
    while j < bytes.len() {
        match bytes[j] {
            b'\\' => {
                j += 2;
                if j > bytes.len() {
                    return Err(SettingsWriteError::new(
                        "unterminated string in settings text",
                    ));
                }
            }
            b'"' => return Ok(j + 1),
            _ => j += 1,
        }
    }
    Err(SettingsWriteError::new(
        "unterminated string in settings text",
    ))
}

fn scan_value(text: &str, i: usize) -> Result<usize, SettingsWriteError> {
    let bytes = text.as_bytes();
    if i >= bytes.len() {
        return Err(SettingsWriteError::new(format!(
            "unexpected end of settings text at index {i}"
        )));
    }
    match bytes[i] {
        b'"' => scan_string(text, i),
        b'{' | b'[' => scan_container(text, i),
        b't' | b'f' | b'n' => scan_literal(text, i),
        b'-' | b'0'..=b'9' => Ok(scan_number(text, i)),
        c => Err(SettingsWriteError::new(format!(
            "unexpected character {} in settings text at index {i}",
            (c as char).escape_default()
        ))),
    }
}

fn scan_literal(text: &str, i: usize) -> Result<usize, SettingsWriteError> {
    let rest = &text[i..];
    if rest.starts_with("true") {
        Ok(i + 4)
    } else if rest.starts_with("false") {
        Ok(i + 5)
    } else if rest.starts_with("null") {
        Ok(i + 4)
    } else {
        Err(SettingsWriteError::new(format!(
            "invalid literal in settings text at index {i}"
        )))
    }
}

fn scan_number(text: &str, i: usize) -> usize {
    let bytes = text.as_bytes();
    let mut j = i;
    if j < bytes.len() && bytes[j] == b'-' {
        j += 1;
    }
    while j < bytes.len() && matches!(bytes[j], b'0'..=b'9' | b'.' | b'e' | b'E' | b'+' | b'-') {
        j += 1;
    }
    j
}

fn scan_container(text: &str, i: usize) -> Result<usize, SettingsWriteError> {
    let bytes = text.as_bytes();
    let mut depth = 1_usize;
    let mut j = i + 1;
    while j < bytes.len() && depth > 0 {
        match bytes[j] {
            b'"' => {
                j = scan_string(text, j)?;
            }
            b'{' | b'[' => {
                depth += 1;
                j += 1;
            }
            b'}' | b']' => {
                depth -= 1;
                j += 1;
            }
            _ => j += 1,
        }
    }
    if depth > 0 {
        return Err(SettingsWriteError::new(
            "unclosed container in settings text",
        ));
    }
    Ok(j)
}

fn list_object_members(text: &str, open_brace: usize) -> Result<ObjectSpan, SettingsWriteError> {
    let bytes = text.as_bytes();
    if open_brace >= bytes.len() || bytes[open_brace] != b'{' {
        return Err(SettingsWriteError::new(format!(
            "expected object at index {open_brace}"
        )));
    }
    let mut members = Vec::new();
    let mut i = skip_ws(text, open_brace + 1);
    if i < bytes.len() && bytes[i] == b'}' {
        return Ok(ObjectSpan {
            open_brace,
            close_brace: i,
            members,
        });
    }
    while i < bytes.len() {
        let member = read_next_member(text, i)?;
        let end = member.end;
        members.push(member);
        i = skip_ws(text, end);
        if i < bytes.len() && bytes[i] == b',' {
            i += 1;
            continue;
        }
        if i < bytes.len() && bytes[i] == b'}' {
            return Ok(ObjectSpan {
                open_brace,
                close_brace: i,
                members,
            });
        }
        return Err(SettingsWriteError::new(format!(
            "expected ',' or '}}' at index {i}"
        )));
    }
    Err(SettingsWriteError::new(
        "unterminated object in settings text",
    ))
}

fn read_next_member(text: &str, from: usize) -> Result<Member, SettingsWriteError> {
    let bytes = text.as_bytes();
    let mut i = skip_ws(text, from);
    if i >= bytes.len() || bytes[i] != b'"' {
        return Err(SettingsWriteError::new(format!(
            "expected object key string at index {i}"
        )));
    }
    let key_start = i;
    let key_end = scan_string(text, i)?;
    let key: String = serde_json::from_str(&text[key_start..key_end])
        .map_err(|error| SettingsWriteError::new(format!("invalid object key string: {error}")))?;
    i = skip_ws(text, key_end);
    if i >= bytes.len() || bytes[i] != b':' {
        return Err(SettingsWriteError::new(format!(
            "expected ':' after key at index {i}"
        )));
    }
    i = skip_ws(text, i + 1);
    let value_start = i;
    let value_end = scan_value(text, i)?;
    Ok(Member {
        key,
        key_start,
        value_start,
        value_end,
        end: value_end,
    })
}

/// Whitespace indent (spaces/tabs) of the line containing `pos`.
fn line_indent_at(text: &str, pos: usize) -> String {
    let line_start = text[..pos].rfind('\n').map_or(0, |n| n + 1);
    let bytes = text.as_bytes();
    let mut i = line_start;
    while i < pos && (bytes[i] == b' ' || bytes[i] == b'\t') {
        i += 1;
    }
    text[line_start..i].to_owned()
}

/// Indent unit for pretty-printing new values: first root member's line indent
/// when present; default to two spaces.
fn infer_indent_unit(text: &str, root_members: &[Member]) -> String {
    let Some(first) = root_members.first() else {
        return DEFAULT_INDENT.to_owned();
    };
    let ind = line_indent_at(text, first.key_start);
    if ind.is_empty() {
        return DEFAULT_INDENT.to_owned();
    }
    if ind.contains('\t') {
        return "\t".to_owned();
    }
    ind
}

fn format_value(
    value: &Value,
    indent_unit: &str,
    continuation_indent: &str,
) -> Result<String, SettingsWriteError> {
    let raw = pretty_json(value, indent_unit)?;
    if !raw.contains('\n') {
        return Ok(raw);
    }
    let mut lines = raw.split('\n');
    let first = lines.next().unwrap_or("");
    let rest: Vec<String> = lines
        .map(|line| format!("{continuation_indent}{line}"))
        .collect();
    Ok(format!("{first}\n{}", rest.join("\n")))
}

fn pretty_json(value: &Value, indent_unit: &str) -> Result<String, SettingsWriteError> {
    // Compact for null/bool/number/string and empty containers; otherwise
    // pretty with the caller's indent unit (spaces of that width, or a tab).
    if matches!(
        value,
        Value::Null | Value::Bool(_) | Value::Number(_) | Value::String(_)
    ) {
        return serde_json::to_string(value).map_err(|error| {
            SettingsWriteError::new(format!("failed to serialize value: {error}"))
        });
    }
    if value.as_array().is_some_and(Vec::is_empty)
        || value.as_object().is_some_and(serde_json::Map::is_empty)
    {
        return serde_json::to_string(value).map_err(|error| {
            SettingsWriteError::new(format!("failed to serialize value: {error}"))
        });
    }

    let indent_bytes = if indent_unit.contains('\t') {
        b"\t".as_slice()
    } else {
        // Mirror JSON.stringify's numeric indent: length of the unit string.
        // Cap to a reasonable stack buffer; unusual indents fall back to spaces
        // of that length via an owned buffer.
        indent_unit.as_bytes()
    };

    let mut buf = Vec::new();
    let formatter = serde_json::ser::PrettyFormatter::with_indent(indent_bytes);
    let mut ser = serde_json::Serializer::with_formatter(&mut buf, formatter);
    value
        .serialize(&mut ser)
        .map_err(|error| SettingsWriteError::new(format!("failed to serialize value: {error}")))?;
    String::from_utf8(buf).map_err(|error| {
        SettingsWriteError::new(format!("serialized value was not UTF-8: {error}"))
    })
}

fn replace_member_value(
    text: &str,
    member: &Member,
    value: &Value,
    indent_unit: &str,
) -> Result<String, SettingsWriteError> {
    let key_indent = line_indent_at(text, member.key_start);
    let formatted = format_value(value, indent_unit, &key_indent)?;
    Ok(format!(
        "{}{}{}",
        &text[..member.value_start],
        formatted,
        &text[member.value_end..]
    ))
}

fn insert_member(
    text: &str,
    obj: &ObjectSpan,
    key: &str,
    value: &Value,
    indent_unit: &str,
    parent_key_indent: &str,
) -> Result<String, SettingsWriteError> {
    let key_indent = member_key_indent(text, obj, parent_key_indent, indent_unit);
    let key_json = serde_json::to_string(key)
        .map_err(|error| SettingsWriteError::new(format!("failed to serialize key: {error}")))?;
    let formatted = format_value(value, indent_unit, &key_indent)?;
    let member_line = format!("{key_indent}{key_json}: {formatted}");

    if obj.members.is_empty() {
        return Ok(format!(
            "{}\n{member_line}\n{parent_key_indent}{}",
            &text[..=obj.open_brace],
            &text[obj.close_brace..]
        ));
    }
    let last = obj.members.last().expect("non-empty members checked above");
    Ok(format!(
        "{},\n{member_line}{}",
        &text[..last.end],
        &text[last.end..]
    ))
}

fn member_key_indent(
    text: &str,
    obj: &ObjectSpan,
    parent_key_indent: &str,
    indent_unit: &str,
) -> String {
    if let Some(first) = obj.members.first() {
        return line_indent_at(text, first.key_start);
    }
    format!("{parent_key_indent}{indent_unit}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn null_input_yields_fresh_two_space_document_with_trailing_newline() {
        let value = json!({ "commands": { "test": "npm test" } });
        let out = write_settings_entry(None, "testHarness", &value).expect("null write");
        assert!(
            out.ends_with('\n'),
            "fresh document must end with a trailing newline"
        );
        assert_eq!(
            out,
            "{\n  \"the-loop\": {\n    \"testHarness\": {\n      \"commands\": {\n        \"test\": \"npm test\"\n      }\n    }\n  }\n}\n"
        );
        let parsed: Value = serde_json::from_str(out.trim_end()).expect("parse");
        assert_eq!(parsed["the-loop"]["testHarness"], value);
        assert_eq!(parsed.as_object().map(serde_json::Map::len), Some(1));
        assert_eq!(
            parsed["the-loop"].as_object().map(serde_json::Map::len),
            Some(1)
        );
    }

    #[test]
    fn unrelated_top_level_keys_survive_byte_for_byte() {
        let unrelated = r#""someOtherTool": { "unrelated": true }"#;
        let text = format!(
            "{{\n  {unrelated},\n  \"the-loop\": {{\n    \"modelBindings\": {{ \"build\": {{ \"model\": \"opus\" }} }}\n  }}\n}}\n"
        );
        let value = json!({ "commands": { "test": "npm test" } });
        let out = write_settings_entry(Some(&text), "testHarness", &value).expect("write");
        assert!(
            out.contains(unrelated),
            "unrelated top-level key substring must be untouched"
        );
        let parsed: Value = serde_json::from_str(&out).expect("parse");
        assert_eq!(parsed["the-loop"]["testHarness"], value);
        assert_eq!(
            parsed["the-loop"]["modelBindings"],
            json!({ "build": { "model": "opus" } })
        );
        assert!(out.contains(r#""modelBindings": { "build": { "model": "opus" } }"#));
    }

    #[test]
    fn deeply_nested_unrelated_structure_survives_as_exact_substring() {
        let nested = r#""deep": {
    "arr": [1, { "k": "v", "n": [true, false, null] }],
    "obj": { "x": { "y": "z" } }
  }"#;
        let text = format!(
            "{{\n  {nested},\n  \"the-loop\": {{\n    \"interview\": {{ \"skill\": \"grilling\" }}\n  }}\n}}\n"
        );
        let value = json!({ "commands": ["npm run check"] });
        let out = write_settings_entry(Some(&text), "lint", &value).expect("write");
        assert!(
            out.contains(nested),
            "nested unrelated structure must be byte-identical"
        );
        let parsed: Value = serde_json::from_str(&out).expect("parse");
        assert_eq!(parsed["the-loop"]["lint"], value);
        assert_eq!(
            parsed["the-loop"]["interview"],
            json!({ "skill": "grilling" })
        );
    }

    #[test]
    fn sibling_families_survive_verbatim_on_insert_and_overwrite() {
        let model_bindings = r#""modelBindings": {
      "build": { "model": "opus" },
      "drive": { "model": "sonnet" }
    }"#;
        let interview = r#""interview": { "skill": "grilling" }"#;
        let text =
            format!("{{\n  \"the-loop\": {{\n    {model_bindings},\n    {interview}\n  }}\n}}\n");

        let with_third = write_settings_entry(
            Some(&text),
            "testHarness",
            &json!({ "framework": "node:test" }),
        )
        .expect("insert third family");
        assert!(with_third.contains(model_bindings));
        assert!(with_third.contains(interview));
        assert_eq!(
            serde_json::from_str::<Value>(&with_third).expect("parse")["the-loop"]["testHarness"],
            json!({ "framework": "node:test" })
        );

        let overwritten =
            write_settings_entry(Some(&text), "interview", &json!({ "skill": "custom" }))
                .expect("overwrite interview");
        assert!(overwritten.contains(model_bindings));
        assert!(!overwritten.contains(r#""skill": "grilling""#));
        let parsed: Value = serde_json::from_str(&overwritten).expect("parse");
        assert_eq!(
            parsed["the-loop"]["interview"],
            json!({ "skill": "custom" })
        );
        assert_eq!(
            parsed["the-loop"]["modelBindings"],
            json!({
                "build": { "model": "opus" },
                "drive": { "model": "sonnet" },
            })
        );
    }

    #[test]
    fn replace_keeps_every_byte_outside_the_family_value() {
        let text = "{\n  \"permissions\": { \"allow\": [\"Bash\"] },\n  \"the-loop\": {\n    \"lint\": { \"commands\": [\"old\"] },\n    \"interview\": { \"skill\": \"grilling\" }\n  }\n}\n";
        let value = json!({ "commands": ["new"] });
        let out = write_settings_entry(Some(text), "lint", &value).expect("replace");

        // Locate lint value spans and assert prefix/suffix byte-equality.
        let before = list_object_members(text, object_start_at(text, 0).unwrap()).unwrap();
        let loop_m = before.members.iter().find(|m| m.key == LOOP_KEY).unwrap();
        let loop_obj = list_object_members(text, loop_m.value_start).unwrap();
        let lint = loop_obj.members.iter().find(|m| m.key == "lint").unwrap();

        assert_eq!(&out[..lint.value_start], &text[..lint.value_start]);
        // After the value, the original tail (sibling families, braces, etc.)
        // must be an exact suffix of the output relative to the splice.
        let original_tail = &text[lint.value_end..];
        assert!(
            out.ends_with(original_tail),
            "bytes after the replaced value must be identical;\nout={out:?}\ntail={original_tail:?}"
        );
        assert!(out.contains(r#""interview": { "skill": "grilling" }"#));
        assert!(out.contains(r#""permissions": { "allow": ["Bash"] }"#));
    }

    #[test]
    fn insert_family_preserves_bytes_before_and_after_splice() {
        let text = "{\n  \"the-loop\": {\n    \"modelBindings\": { \"build\": { \"model\": \"haiku\" } }\n  }\n}\n";
        let sibling = r#""modelBindings": { "build": { "model": "haiku" } }"#;
        let value = json!({ "system": "none" });
        let out = write_settings_entry(Some(text), "precommit", &value).expect("insert");
        assert!(
            out.contains(sibling),
            "existing the-loop sibling must survive"
        );
        let parsed: Value = serde_json::from_str(&out).expect("parse");
        assert_eq!(parsed["the-loop"]["precommit"], value);
        assert_eq!(
            parsed["the-loop"]["modelBindings"],
            json!({ "build": { "model": "haiku" } })
        );

        // Splice is after the last sibling's value: prefix up to that point +
        // ",\n" + new member; the original text from last.member_end onward is
        // the exact suffix after the inserted member line.
        let root = list_object_members(text, object_start_at(text, 0).unwrap()).unwrap();
        let loop_m = root.members.iter().find(|m| m.key == LOOP_KEY).unwrap();
        let loop_obj = list_object_members(text, loop_m.value_start).unwrap();
        let last = loop_obj.members.last().unwrap();
        assert_eq!(&out[..last.end], &text[..last.end]);
        assert!(out[last.end..].starts_with(",\n"));
        assert!(out.ends_with(&text[last.end..]));
    }

    #[test]
    fn missing_the_loop_key_inserts_and_preserves_preexisting_content() {
        let no_loop = "{\n  \"permissions\": {\n    \"allow\": [\"Bash\"]\n  }\n}\n";
        let permissions = "\"permissions\": {\n    \"allow\": [\"Bash\"]\n  }";
        let value = json!({ "commands": ["npm run lint"] });
        let out = write_settings_entry(Some(no_loop), "lint", &value).expect("add loop");
        assert!(
            out.contains(permissions),
            "pre-existing top-level content must survive"
        );
        assert_eq!(
            serde_json::from_str::<Value>(&out).expect("parse")["the-loop"]["lint"],
            value
        );
    }

    #[test]
    fn tab_and_unusual_indentation_are_preserved_outside_the_write() {
        // Tab-indented document: indent unit becomes a single tab.
        let text = "{\n\t\"the-loop\": {\n\t\t\"lint\": { \"commands\": [\"old\"] }\n\t}\n}\n";
        let value = json!({ "commands": ["new"] });
        let out = write_settings_entry(Some(text), "lint", &value).expect("tab replace");
        assert!(out.contains("\t\"the-loop\""));
        // Continuation lines of a multi-line value use the key's tab indent.
        let parsed: Value = serde_json::from_str(&out).expect("parse");
        assert_eq!(parsed["the-loop"]["lint"], value);

        // Four-space unusual indent: unit inferred from first root key.
        let four = "{\n    \"other\": true,\n    \"the-loop\": {\n        \"a\": 1\n    }\n}\n";
        let out4 = write_settings_entry(Some(four), "b", &json!(2)).expect("four-space insert");
        assert!(out4.contains("    \"other\": true"));
        assert!(out4.contains("        \"a\": 1"));
        assert_eq!(
            serde_json::from_str::<Value>(&out4).expect("parse")["the-loop"]["b"],
            json!(2)
        );
    }

    #[test]
    fn unparseable_json_is_an_error_with_no_text() {
        let err = write_settings_entry(Some("{ not valid json"), "testHarness", &json!({}))
            .expect_err("must fail");
        let msg = err.to_string();
        assert!(
            msg.to_ascii_lowercase().contains("unparseable"),
            "message={msg}"
        );
        assert!(msg.to_ascii_lowercase().contains("json"), "message={msg}");
    }

    #[test]
    fn non_object_root_is_an_error() {
        let err = write_settings_entry(Some("[1,2,3]"), "testHarness", &json!({}))
            .expect_err("array root");
        assert!(
            err.to_string().to_ascii_lowercase().contains("object"),
            "message={err}"
        );

        let err = write_settings_entry(Some("\"str\""), "testHarness", &json!({}))
            .expect_err("string root");
        assert!(
            err.to_string().to_ascii_lowercase().contains("object"),
            "message={err}"
        );
    }

    #[test]
    fn non_object_the_loop_is_an_error() {
        let err =
            write_settings_entry(Some(r#"{ "the-loop": "nope" }"#), "testHarness", &json!({}))
                .expect_err("string the-loop");
        assert!(err.to_string().contains("the-loop"), "message={err}");

        let err = write_settings_entry(Some(r#"{ "the-loop": [] }"#), "testHarness", &json!({}))
            .expect_err("array the-loop");
        assert!(err.to_string().contains("the-loop"), "message={err}");
    }

    #[test]
    fn empty_root_object_inserts_the_loop_cleanly() {
        let out = write_settings_entry(Some("{}"), "lint", &json!({ "commands": [] }))
            .expect("empty root");
        let parsed: Value = serde_json::from_str(&out).expect("parse");
        assert_eq!(parsed["the-loop"]["lint"], json!({ "commands": [] }));
        assert!(out.starts_with("{\n"));
    }
}
