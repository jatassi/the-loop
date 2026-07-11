//! Executor playbook registry: fenced-JSON machine blocks and binding validation.
//!
//! Playbooks are Markdown with a single machine-parseable block under the exact
//! heading `## Machine block`. The Rust port reads a fenced **json** body (the JS
//! reference still parses yaml; design flips the fence language for this slice).
//! Pure — no filesystem, no process: callers read files and pass text in.
//!
//! Field checks and `validate_bindings` issue codes match
//! `plugin/src/executor-registry.js` so models-list / executors-list stay
//! JSON-equal on paired fixtures.

use std::collections::BTreeMap;
use std::path::Path;

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Exact heading the machine block must sit under (line-anchored).
pub const MACHINE_BLOCK_HEADING: &str = "## Machine block";

const WORKTREE_MODES: [&str; 2] = ["native", "driver-made"];
const ROUTING_SURFACE: [&str; 4] = ["build.rote", "build.standard", "build.complex", "validate"];
const OFF_RUBRIC_TIERS: [&str; 1] = ["build.complex"];

// Held as plain string constants (not format templates that embed the
// placeholders): keeps the literal `{model}` / `{prompt}` / `{worktree}` /
// `{ref}` text out of surrounding format strings the way the JS module does.
const MODEL_PROMPT_HINT: &str = "both {model} and {prompt} placeholders";
const WORKTREE_REF_HINT: &str = "{worktree} or {ref}";

/// Auth smoke-test command and the substring its output must contain.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AuthSmoke {
    /// Command to run for the auth check.
    pub run: String,
    /// Substring that must appear in the command's output when authenticated.
    pub expect: String,
}

/// One executor playbook's machine-block record, keyed by `id` in the registry.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExecutorRecord {
    /// Equals the playbook filename stem.
    pub id: String,
    /// CLI binary name/path.
    pub command: String,
    /// Executor model ids a binding may name (non-empty).
    pub models: Vec<String>,
    /// Worktree mode: `native` or `driver-made`.
    pub worktree: String,
    /// Invocation template carrying `{model}`, `{prompt}`, and `{worktree}` or `{ref}`.
    pub invocation: String,
    /// Version-check command.
    pub availability: String,
    /// Auth smoke-test pair.
    pub auth_smoke: AuthSmoke,
    /// Positive concurrency limit.
    pub concurrency: u64,
    /// Optional invocation fragment for effort; absent means no effort knob.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub effort_flag: Option<String>,
}

/// Registry of executor records keyed by id (sorted for stable iteration).
pub type Registry = BTreeMap<String, ExecutorRecord>;

/// One role's resolved model binding as seen by `validate_bindings`.
///
/// `provenance` is intentionally omitted — validation never consults it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RoleBinding {
    /// Model id the role binds.
    pub model: String,
    /// Executor id, or `None` / `Some("agent")` for the explicit default (unchecked).
    pub executor: Option<String>,
    /// Optional effort; warned when the executor has no `effort_flag`.
    pub effort: Option<String>,
}

/// A single validation issue (error or warning).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Issue {
    /// Stable machine code (`unregistered-executor`, `ignored-effort`, …).
    pub code: String,
    /// Human-readable detail naming the role and binding.
    pub message: String,
    /// Role id the issue names (`where` in the JS shape).
    #[serde(rename = "where")]
    pub where_role: String,
}

/// Accumulated binding-validation result; never throws — both lists may be non-empty.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize)]
pub struct ValidationResult {
    /// Hard failures (unregistered executor, model outside playbook).
    pub errors: Vec<Issue>,
    /// Non-fatal guards (routing surface, off-rubric tier, ignored effort).
    pub warnings: Vec<Issue>,
}

/// One playbook input for [`parse_executors`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlaybookEntry<'a> {
    /// Path used in error messages and checked against `id` (stem must match).
    pub file: &'a str,
    /// Full Markdown text of the playbook.
    pub text: &'a str,
}

/// Parse one executor playbook's fenced-json machine block.
///
/// # Errors
///
/// Returns an error string naming `file` when the heading/fence is missing,
/// the JSON is malformed, or any field check fails (including `id` ≠ filename stem).
pub fn parse_executor(text: &str, file: &str) -> Result<ExecutorRecord, String> {
    let inner = json_block_after(text).ok_or_else(|| {
        format!("{file}: no fenced json block found under \"{MACHINE_BLOCK_HEADING}\"")
    })?;

    let value: Value = serde_json::from_str(inner)
        .map_err(|err| format!("{file}: malformed json machine block ({err})"))?;

    let obj = value
        .as_object()
        .ok_or_else(|| format!("{file}: machine block must be a JSON object (got {value})"))?;

    let stem = filename_stem(file);
    let id = require_string(obj.get("id"), "id", file)?;
    if id != stem {
        return Err(format!(
            "{file}: \"id\" must equal the filename stem \"{stem}\" (got {})",
            Value::String(id)
        ));
    }

    let command = require_string(obj.get("command"), "command", file)?;
    let models = check_models(obj.get("models"), file)?;
    let worktree = check_worktree(obj.get("worktree"), file)?;
    let invocation = check_invocation(obj.get("invocation"), file)?;
    let availability = require_string(obj.get("availability"), "availability", file)?;
    let auth_smoke = check_auth_smoke(obj.get("auth_smoke"), file)?;
    let concurrency = check_concurrency(obj.get("concurrency"), file)?;
    let effort_flag = check_effort_flag(obj.get("effort_flag"), file)?;

    Ok(ExecutorRecord {
        id,
        command,
        models,
        worktree,
        invocation,
        availability,
        auth_smoke,
        concurrency,
        effort_flag,
    })
}

/// Parse many playbooks into a registry keyed by id.
///
/// # Errors
///
/// Returns the first parse error from any entry, or a duplicate-id error naming
/// both files when two playbooks claim the same `id`.
pub fn parse_executors(entries: &[PlaybookEntry<'_>]) -> Result<Registry, String> {
    let mut registry = Registry::new();
    let mut file_of: BTreeMap<String, String> = BTreeMap::new();

    for entry in entries {
        let record = parse_executor(entry.text, entry.file)?;
        if let Some(prior) = file_of.get(&record.id) {
            return Err(format!(
                "duplicate executor id \"{}\" in {prior} and {}",
                record.id, entry.file
            ));
        }
        file_of.insert(record.id.clone(), entry.file.to_owned());
        registry.insert(record.id.clone(), record);
    }

    Ok(registry)
}

/// Validate a resolved role table's `executor` bindings against the registry.
///
/// An executor of `"agent"` or absent is the explicit default and is never
/// checked. Errors and warnings both accumulate across every role; this never fails
/// with `Err` — inspect [`ValidationResult`].
#[must_use]
pub fn validate_bindings(
    table: &BTreeMap<String, RoleBinding>,
    registry: &Registry,
) -> ValidationResult {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    for (role, binding) in table {
        let Some(executor) = binding.executor.as_deref() else {
            continue;
        };
        if executor == "agent" {
            continue;
        }

        if !ROUTING_SURFACE.contains(&role.as_str()) {
            warnings.push(Issue {
                code: "no-routing-surface".to_owned(),
                message: format!(
                    "role \"{role}\" binds executor \"{executor}\" but sits outside the routing surface (build.rote, build.standard, build.complex, validate); executor is never consulted there"
                ),
                where_role: role.clone(),
            });
        } else if OFF_RUBRIC_TIERS.contains(&role.as_str()) {
            warnings.push(Issue {
                code: "off-rubric-tier".to_owned(),
                message: format!(
                    "role \"{role}\" binds executor \"{executor}\" on a tier with no recorded eval evidence behind delegation; the workflow routes it anyway"
                ),
                where_role: role.clone(),
            });
        }

        let Some(executor_record) = registry.get(executor) else {
            errors.push(Issue {
                code: "unregistered-executor".to_owned(),
                message: format!(
                    "role \"{role}\" binds executor \"{executor}\", which names no registered executor"
                ),
                where_role: role.clone(),
            });
            continue;
        };

        if !executor_record.models.iter().any(|m| m == &binding.model) {
            errors.push(Issue {
                code: "model-outside-playbook".to_owned(),
                message: format!(
                    "role \"{role}\" binds model \"{}\" via executor \"{executor}\", outside that playbook's models list",
                    binding.model
                ),
                where_role: role.clone(),
            });
        }

        if binding.effort.is_some() && executor_record.effort_flag.is_none() {
            let effort = binding.effort.as_deref().unwrap_or("");
            warnings.push(Issue {
                code: "ignored-effort".to_owned(),
                message: format!(
                    "role \"{role}\" sets effort \"{effort}\" on executor \"{executor}\", which carries no effort_flag; the effort is ignored"
                ),
                where_role: role.clone(),
            });
        }
    }

    ValidationResult { errors, warnings }
}

/// Find the first ` ```json ` fenced block after a line-anchored `## Machine block`.
///
/// Mirrors `yamlBlockAfter` in `plugin/src/replace-fenced-block.js`, with the fence
/// language switched to json per the config-commands-rust design.
fn json_block_after(text: &str) -> Option<&str> {
    let heading_line_end = find_heading_line_end(text, MACHINE_BLOCK_HEADING)?;
    let after_heading = &text[heading_line_end..];

    // ```json[^\n]*\n — same shape as the JS yaml fence scan.
    let open_rel = after_heading.find("```json")?;
    let after_open = &after_heading[open_rel + "```json".len()..];
    let nl_rel = after_open.find('\n')?;
    let inner_start = heading_line_end + open_rel + "```json".len() + nl_rel + 1;

    let close_rel = text[inner_start..].find("\n```")?;
    let inner_end = inner_start + close_rel;
    Some(&text[inner_start..inner_end])
}

/// Locate a full-line heading match; returns the byte index just past that line.
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
            // Include the trailing newline when present so the fence scan starts
            // on the next line (matches JS `head.index + head[0].length` after
            // a `$`-anchored match that does not consume the newline — wait:
            // JS `^...$` with `m` matches without consuming `\n`, so lastIndex
            // is at end of heading line content. Finding ```json from there is
            // fine either way. Advance past optional `\r`/`\n` for cleanliness.
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

fn filename_stem(file: &str) -> &str {
    Path::new(file)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(file)
}

fn require_string(value: Option<&Value>, field: &str, file: &str) -> Result<String, String> {
    match value {
        Some(Value::String(s)) => Ok(s.clone()),
        other => Err(format!(
            "{file}: \"{field}\" must be a string (got {})",
            display_json(other)
        )),
    }
}

fn check_models(value: Option<&Value>, file: &str) -> Result<Vec<String>, String> {
    let Some(Value::Array(items)) = value else {
        return Err(format!(
            "{file}: \"models\" must be a non-empty string array (got {})",
            display_json(value)
        ));
    };
    if items.is_empty() {
        return Err(format!(
            "{file}: \"models\" must be a non-empty string array (got [])"
        ));
    }
    let mut models = Vec::with_capacity(items.len());
    for item in items {
        let Some(s) = item.as_str() else {
            return Err(format!(
                "{file}: \"models\" must be a non-empty string array (got {})",
                display_json(value)
            ));
        };
        models.push(s.to_owned());
    }
    Ok(models)
}

fn check_worktree(value: Option<&Value>, file: &str) -> Result<String, String> {
    let worktree = match value {
        Some(Value::String(s)) => s.as_str(),
        other => {
            return Err(format!(
                "{file}: \"worktree\" must be one of {} (got {})",
                WORKTREE_MODES.join("|"),
                display_json(other)
            ));
        }
    };
    if !WORKTREE_MODES.contains(&worktree) {
        return Err(format!(
            "{file}: \"worktree\" must be one of {} (got {})",
            WORKTREE_MODES.join("|"),
            Value::String(worktree.to_owned())
        ));
    }
    Ok(worktree.to_owned())
}

fn check_invocation(value: Option<&Value>, file: &str) -> Result<String, String> {
    let invocation = require_string(value, "invocation", file)?;
    if !invocation.contains("{model}") || !invocation.contains("{prompt}") {
        return Err(format!(
            "{file}: \"invocation\" must contain {MODEL_PROMPT_HINT} (got {})",
            Value::String(invocation)
        ));
    }
    if !invocation.contains("{worktree}") && !invocation.contains("{ref}") {
        return Err(format!(
            "{file}: \"invocation\" must contain {WORKTREE_REF_HINT} (got {})",
            Value::String(invocation)
        ));
    }
    Ok(invocation)
}

fn check_auth_smoke(value: Option<&Value>, file: &str) -> Result<AuthSmoke, String> {
    let Some(Value::Object(map)) = value else {
        return Err(format!(
            "{file}: \"auth_smoke\" must be a {{ run, expect }} map of strings (got {})",
            display_json(value)
        ));
    };
    let run = match map.get("run") {
        Some(Value::String(s)) => s.clone(),
        _ => {
            return Err(format!(
                "{file}: \"auth_smoke\" must be a {{ run, expect }} map of strings (got {})",
                display_json(value)
            ));
        }
    };
    let expect = match map.get("expect") {
        Some(Value::String(s)) => s.clone(),
        _ => {
            return Err(format!(
                "{file}: \"auth_smoke\" must be a {{ run, expect }} map of strings (got {})",
                display_json(value)
            ));
        }
    };
    Ok(AuthSmoke { run, expect })
}

fn check_concurrency(value: Option<&Value>, file: &str) -> Result<u64, String> {
    let Some(v) = value else {
        return Err(format!(
            "{file}: \"concurrency\" must be a positive integer (got null)"
        ));
    };
    // JSON numbers are f64 in serde_json; accept only finite positive integers
    // (mirrors JS Number.isSafeInteger(n) && n >= 1).
    let ok = match v {
        Value::Number(n) => n
            .as_u64()
            .filter(|&u| u >= 1)
            .or_else(|| {
                n.as_i64()
                    .filter(|&i| i >= 1)
                    .and_then(|i| u64::try_from(i).ok())
            })
            .or_else(|| {
                n.as_f64().and_then(|f| {
                    if f.is_finite() && f >= 1.0 && f.fract() == 0.0 && f <= f64::from(u32::MAX) {
                        #[allow(
                            clippy::cast_possible_truncation,
                            clippy::cast_sign_loss,
                            reason = "f is a finite non-negative integer already range-checked above"
                        )]
                        Some(f as u64)
                    } else {
                        None
                    }
                })
            }),
        _ => None,
    };
    ok.ok_or_else(|| format!("{file}: \"concurrency\" must be a positive integer (got {v})"))
}

fn check_effort_flag(value: Option<&Value>, file: &str) -> Result<Option<String>, String> {
    match value {
        None | Some(Value::Null) => {
            // Absent key: optional. Null is not a string — treat like JS
            // `typeof null === "object"` failure when present-as-null? JS only
            // sees undefined for missing YAML keys. For JSON, missing key → None;
            // explicit null fails the string check when "present".
            if value == Some(&Value::Null) {
                return Err(format!(
                    "{file}: \"effort_flag\" must be a string when present (got null)"
                ));
            }
            Ok(None)
        }
        Some(Value::String(s)) => Ok(Some(s.clone())),
        Some(other) => Err(format!(
            "{file}: \"effort_flag\" must be a string when present (got {other})"
        )),
    }
}

fn display_json(value: Option<&Value>) -> String {
    value.map_or_else(|| "null".to_owned(), ToString::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;

    // Plain string constants: the machine block's invocation syntax uses literal
    // `{model}` / `{prompt}` / `{worktree}` placeholders.
    fn grok_text() -> String {
        [
            "# grok",
            "",
            "Narrative lore about the grok CLI executor: it commits last, so truncation always",
            "manifests as stopped-without-committing; the CLI default model is Composer, so",
            "-m is always passed explicitly.",
            "",
            "## Machine block",
            "",
            "```json",
            r#"{
  "id": "grok",
  "command": "grok",
  "models": ["grok-build", "grok-composer-2.5-fast"],
  "worktree": "driver-made",
  "invocation": "grok -m {model} --prompt-file {prompt} --cwd {worktree} --always-approve --no-subagents --max-turns 500 --output-format plain",
  "availability": "grok --version",
  "auth_smoke": {
    "run": "grok -p \"say PONG\" --max-turns 1",
    "expect": "PONG"
  },
  "concurrency": 2
}"#,
            "```",
            "",
            "More narrative lore below the block: a benign AuthorizationRequired log line",
            "appears even when auth is fine.",
            "",
        ]
        .join("\n")
    }

    fn patch_json_field(text: &str, from: &str, to: &str) -> String {
        text.replacen(from, to, 1)
    }

    #[test]
    fn parse_executor_reads_realistic_playbook_machine_block() {
        let record = parse_executor(&grok_text(), "docs/executors/grok.md")
            .expect("valid playbook should parse");
        assert_eq!(
            record,
            ExecutorRecord {
                id: "grok".to_owned(),
                command: "grok".to_owned(),
                models: vec![
                    "grok-build".to_owned(),
                    "grok-composer-2.5-fast".to_owned(),
                ],
                worktree: "driver-made".to_owned(),
                invocation: "grok -m {model} --prompt-file {prompt} --cwd {worktree} --always-approve --no-subagents --max-turns 500 --output-format plain".to_owned(),
                availability: "grok --version".to_owned(),
                auth_smoke: AuthSmoke {
                    run: "grok -p \"say PONG\" --max-turns 1".to_owned(),
                    expect: "PONG".to_owned(),
                },
                concurrency: 2,
                effort_flag: None,
            }
        );
    }

    #[test]
    fn effort_flag_rides_record_only_when_playbook_carries_it() {
        let with_effort = patch_json_field(
            &grok_text(),
            r#""concurrency": 2"#,
            r#""concurrency": 2,
  "effort_flag": "--effort {effort}""#,
        );
        let record = parse_executor(&with_effort, "docs/executors/grok.md")
            .expect("playbook with effort_flag should parse");
        assert_eq!(record.effort_flag.as_deref(), Some("--effort {effort}"));
    }

    #[test]
    fn missing_heading_or_fence_errors_naming_the_file() {
        let no_heading = "# grok\n\nJust prose, no heading at all.\n";
        let err = parse_executor(no_heading, "docs/executors/grok.md").unwrap_err();
        assert!(
            err.contains("executors/grok.md"),
            "error must name the file; got {err}"
        );

        let no_fence = "# grok\n\n## Machine block\n\nNo fenced block under the heading.\n";
        let err = parse_executor(no_fence, "docs/executors/grok.md").unwrap_err();
        assert!(
            err.contains("executors/grok.md"),
            "error must name the file; got {err}"
        );
    }

    #[test]
    fn missing_or_mistyped_required_field_errors_naming_file_and_field() {
        let no_command = patch_json_field(
            &grok_text(),
            r#"  "command": "grok",
"#,
            "",
        );
        let err = parse_executor(&no_command, "docs/executors/grok.md").unwrap_err();
        assert!(
            err.contains("executors/grok.md") && err.contains("\"command\""),
            "got {err}"
        );

        let bad_availability = patch_json_field(
            &grok_text(),
            r#""availability": "grok --version""#,
            r#""availability": 42"#,
        );
        let err = parse_executor(&bad_availability, "docs/executors/grok.md").unwrap_err();
        assert!(
            err.contains("executors/grok.md") && err.contains("\"availability\""),
            "got {err}"
        );
    }

    #[test]
    fn worktree_outside_native_or_driver_made_errors() {
        let bad = patch_json_field(
            &grok_text(),
            r#""worktree": "driver-made""#,
            r#""worktree": "sandboxed""#,
        );
        let err = parse_executor(&bad, "docs/executors/grok.md").unwrap_err();
        assert!(
            err.contains("executors/grok.md") && err.contains("\"worktree\""),
            "got {err}"
        );
    }

    #[test]
    fn empty_or_non_array_models_errors() {
        let empty = patch_json_field(
            &grok_text(),
            r#""models": ["grok-build", "grok-composer-2.5-fast"]"#,
            r#""models": []"#,
        );
        let err = parse_executor(&empty, "docs/executors/grok.md").unwrap_err();
        assert!(
            err.contains("executors/grok.md") && err.contains("\"models\""),
            "got {err}"
        );

        let not_array = patch_json_field(
            &grok_text(),
            r#""models": ["grok-build", "grok-composer-2.5-fast"]"#,
            r#""models": "grok-build""#,
        );
        let err = parse_executor(&not_array, "docs/executors/grok.md").unwrap_err();
        assert!(
            err.contains("executors/grok.md") && err.contains("\"models\""),
            "got {err}"
        );
    }

    #[test]
    fn invocation_missing_placeholders_errors() {
        let no_model = patch_json_field(&grok_text(), "-m {model} ", "");
        let err = parse_executor(&no_model, "docs/executors/grok.md").unwrap_err();
        assert!(
            err.contains("executors/grok.md") && err.contains("\"invocation\""),
            "got {err}"
        );

        let no_prompt = patch_json_field(&grok_text(), "--prompt-file {prompt} ", "");
        let err = parse_executor(&no_prompt, "docs/executors/grok.md").unwrap_err();
        assert!(
            err.contains("executors/grok.md") && err.contains("\"invocation\""),
            "got {err}"
        );

        let no_place = patch_json_field(&grok_text(), "--cwd {worktree} ", "");
        let err = parse_executor(&no_place, "docs/executors/grok.md").unwrap_err();
        assert!(
            err.contains("executors/grok.md") && err.contains("\"invocation\""),
            "got {err}"
        );
    }

    #[test]
    fn auth_smoke_without_run_or_expect_errors() {
        // Replace the whole auth_smoke object so the surrounding JSON stays valid.
        let no_run = patch_json_field(
            &grok_text(),
            r#""auth_smoke": {
    "run": "grok -p \"say PONG\" --max-turns 1",
    "expect": "PONG"
  }"#,
            r#""auth_smoke": {
    "expect": "PONG"
  }"#,
        );
        let err = parse_executor(&no_run, "docs/executors/grok.md").unwrap_err();
        assert!(
            err.contains("executors/grok.md") && err.contains("\"auth_smoke\""),
            "got {err}"
        );

        let no_expect = patch_json_field(
            &grok_text(),
            r#""auth_smoke": {
    "run": "grok -p \"say PONG\" --max-turns 1",
    "expect": "PONG"
  }"#,
            r#""auth_smoke": {
    "run": "grok -p \"say PONG\" --max-turns 1"
  }"#,
        );
        let err = parse_executor(&no_expect, "docs/executors/grok.md").unwrap_err();
        assert!(
            err.contains("executors/grok.md") && err.contains("\"auth_smoke\""),
            "got {err}"
        );
    }

    #[test]
    fn non_positive_integer_concurrency_errors() {
        let zero = patch_json_field(&grok_text(), r#""concurrency": 2"#, r#""concurrency": 0"#);
        let err = parse_executor(&zero, "docs/executors/grok.md").unwrap_err();
        assert!(
            err.contains("executors/grok.md") && err.contains("\"concurrency\""),
            "got {err}"
        );

        let fractional =
            patch_json_field(&grok_text(), r#""concurrency": 2"#, r#""concurrency": 1.5"#);
        let err = parse_executor(&fractional, "docs/executors/grok.md").unwrap_err();
        assert!(
            err.contains("executors/grok.md") && err.contains("\"concurrency\""),
            "got {err}"
        );
    }

    #[test]
    fn id_not_equal_filename_stem_errors() {
        let err = parse_executor(&grok_text(), "docs/executors/other.md").unwrap_err();
        assert!(
            err.contains("executors/other.md") && err.contains("\"id\""),
            "got {err}"
        );
    }

    #[test]
    fn parse_executors_returns_registry_keyed_by_id() {
        let other_text = grok_text().replace("grok", "other");
        let registry = parse_executors(&[
            PlaybookEntry {
                file: "docs/executors/grok.md",
                text: &grok_text(),
            },
            PlaybookEntry {
                file: "docs/executors/other.md",
                text: &other_text,
            },
        ])
        .expect("two distinct playbooks should parse");
        let keys: Vec<_> = registry.keys().cloned().collect();
        assert_eq!(keys, vec!["grok".to_owned(), "other".to_owned()]);
        assert_eq!(registry["grok"].command, "grok");
        assert_eq!(registry["other"].command, "other");
    }

    #[test]
    fn parse_executors_duplicate_id_names_both_files() {
        let entries = [
            PlaybookEntry {
                file: "docs/executors/grok.md",
                text: &grok_text(),
            },
            PlaybookEntry {
                file: "archived/grok.md",
                text: &grok_text(),
            },
        ];
        let err = parse_executors(&entries).unwrap_err();
        assert!(
            err.contains("executors/grok.md") && err.contains("archived/grok.md"),
            "got {err}"
        );
    }

    fn registry() -> Registry {
        let mut reg = Registry::new();
        let record =
            parse_executor(&grok_text(), "docs/executors/grok.md").expect("fixture playbook");
        reg.insert(record.id.clone(), record);
        reg
    }

    fn binding(model: &str, executor: Option<&str>, effort: Option<&str>) -> RoleBinding {
        RoleBinding {
            model: model.to_owned(),
            executor: executor.map(str::to_owned),
            effort: effort.map(str::to_owned),
        }
    }

    #[test]
    fn validate_bindings_errors_unregistered_executor() {
        let mut table = BTreeMap::new();
        table.insert(
            "build.rote".to_owned(),
            binding("session", Some("ghost"), None),
        );
        let result = validate_bindings(&table, &registry());
        assert_eq!(result.errors.len(), 1);
        assert_eq!(result.errors[0].code, "unregistered-executor");
        assert_eq!(result.errors[0].where_role, "build.rote");
        assert!(result.warnings.is_empty());
    }

    #[test]
    fn validate_bindings_errors_model_outside_playbook() {
        let mut table = BTreeMap::new();
        table.insert(
            "build.rote".to_owned(),
            binding("session", Some("grok"), None),
        );
        table.insert(
            "design.reader".to_owned(),
            binding("grok-mini", Some("grok"), None),
        );
        let result = validate_bindings(&table, &registry());
        let mut codes: Vec<_> = result
            .errors
            .iter()
            .map(|i| (i.code.as_str(), i.where_role.as_str()))
            .collect();
        codes.sort_by(|a, b| a.1.cmp(b.1));
        assert_eq!(
            codes,
            vec![
                ("model-outside-playbook", "build.rote"),
                ("model-outside-playbook", "design.reader"),
            ]
        );
    }

    #[test]
    fn validate_bindings_warns_no_routing_surface() {
        let mut table = BTreeMap::new();
        table.insert(
            "design.reader".to_owned(),
            binding("grok-build", Some("grok"), None),
        );
        let result = validate_bindings(&table, &registry());
        assert!(result.errors.is_empty());
        assert_eq!(result.warnings.len(), 1);
        assert_eq!(result.warnings[0].code, "no-routing-surface");
        assert_eq!(result.warnings[0].where_role, "design.reader");
    }

    #[test]
    fn validate_bindings_warns_off_rubric_tier_only_for_build_complex() {
        let mut table = BTreeMap::new();
        table.insert(
            "build.standard".to_owned(),
            binding("grok-build", Some("grok"), None),
        );
        table.insert(
            "build.complex".to_owned(),
            binding("grok-build", Some("grok"), None),
        );
        table.insert(
            "validate".to_owned(),
            binding("grok-build", Some("grok"), None),
        );
        let result = validate_bindings(&table, &registry());
        assert!(result.errors.is_empty());
        let codes: Vec<_> = result
            .warnings
            .iter()
            .map(|i| (i.code.as_str(), i.where_role.as_str()))
            .collect();
        assert_eq!(codes, vec![("off-rubric-tier", "build.complex")]);
    }

    #[test]
    fn validate_bindings_warns_ignored_effort() {
        let mut table = BTreeMap::new();
        table.insert(
            "build.rote".to_owned(),
            binding("grok-build", Some("grok"), Some("high")),
        );
        let result = validate_bindings(&table, &registry());
        assert!(result.errors.is_empty());
        assert_eq!(result.warnings.len(), 1);
        assert_eq!(result.warnings[0].code, "ignored-effort");
        assert_eq!(result.warnings[0].where_role, "build.rote");
    }

    #[test]
    fn validate_bindings_skips_agent_and_absent_executor() {
        let mut table = BTreeMap::new();
        table.insert(
            "build.rote".to_owned(),
            binding("session", Some("agent"), None),
        );
        table.insert("build.standard".to_owned(), binding("session", None, None));
        table.insert(
            "design.reader".to_owned(),
            binding("session", Some("agent"), Some("high")),
        );
        let result = validate_bindings(&table, &registry());
        assert_eq!(result, ValidationResult::default());
    }

    #[test]
    fn malformed_json_block_errors_naming_the_file() {
        let bad = grok_text().replace(
            r#""concurrency": 2"#,
            r#""concurrency": 2,"#, // trailing comma → invalid JSON
        );
        // Ensure we still have a fence; make truly invalid JSON.
        let bad = bad.replace(
            r#"{
  "id": "grok","#,
            r#"{
  "id": "grok"
  "command": "grok","#,
        );
        let err = parse_executor(&bad, "docs/executors/grok.md").unwrap_err();
        assert!(
            err.contains("executors/grok.md"),
            "malformed json must name the file; got {err}"
        );
    }
}
