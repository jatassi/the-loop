//! `hooks-list` — full resolved hook inventory plus recorded-bindings status.
//!
//! Every non-synthetic `HOOK_INVENTORY` family across four layers (modelBindings
//! defaults from embedded bindings; other families from embedded hook-defaults),
//! applying the empty-object-is-unbound layer rule. Prints
//! `{ hooks, recordedBindings }`, or with `--compact` one single-line JSON entry
//! per family (JS inventory order) plus a final `recordedBindings` line.
//! Ports `buildHooksTable` + `hooksListCommand`.

use std::fs;
use std::io::{self, Write};
use std::path::Path;

use serde_json::{Map, Value, json};

use crate::io::{fail, out, warn};
use crate::recorded_bindings::recorded_bindings_status;
use crate::settings::{
    HOOK_FAMILY_ORDER, LayerSources, family_layer, local_settings_path, project_settings_path,
    read_settings_layer, resolve_family, user_settings_path,
};
use crate::{DEFAULT_HOOK_DEFAULTS_JSON, DEFAULT_MODEL_BINDINGS_JSON};

/// Architecture doc path scanned for recorded bindings (cwd-relative).
const ARCHITECTURE_MD: &str = "docs/architecture.md";

/// Default model-bindings role insertion order (matches `model-bindings.json`).
/// Without `serde_json` `preserve_order`, resolved maps alphabetize; compact mode
/// re-emits roles in this JS-compatible order, then any extra roles sorted.
const MODEL_ROLE_ORDER: &[&str] = &[
    "plan",
    "build.rote",
    "build.standard",
    "build.complex",
    "drive",
    "validate",
    "record",
];

/// Binding entry key order matching JS `{ ...entry, provenance }` (gap last).
const BINDING_KEY_ORDER: &[&str] = &["model", "effort", "executor", "agent", "provenance", "gap"];

/// `artifactStores` fallback / defaults key order (then `provenance`).
const ARTIFACT_STORE_KEY_ORDER: &[&str] = &[
    "briefs",
    "designs",
    "features",
    "runbooks",
    "rcas",
    "calibration",
    "provenance",
];

/// Recorded-bindings status map order (matches JS `recordedBindingsStatus`).
const RECORDED_BINDING_ORDER: &[&str] =
    &["validationProcedure", "releaseRunbook", "operationsToolkit"];

/// Run `hooks-list`, writing `{hooks, recordedBindings}` (or compact lines) or refusing via [`fail`].
pub fn run(compact: bool) {
    match build_hooks_table() {
        Ok(hooks) => {
            let architecture_text = read_architecture_text();
            let recorded = recorded_bindings_status(&architecture_text);
            if compact {
                write_compact(&hooks, &recorded);
            } else {
                out(&json!({
                    "hooks": hooks,
                    "recordedBindings": recorded,
                }));
            }
        }
        Err(msg) => fail(&msg),
    }
}

/// One single-line JSON entry per family (inventory order) plus `recordedBindings`.
///
/// Line-for-line identical to the JS CLI: key order matches Node `JSON.stringify`
/// insertion order (provenance last; modelBindings roles in defaults-file order),
/// not `BTreeMap` alphabetical.
fn write_compact(hooks: &Value, recorded: &Value) {
    let mut stdout = io::stdout().lock();
    for &family in HOOK_FAMILY_ORDER {
        if family == "exampleBlock" {
            continue;
        }
        let Some(entry) = hooks.get(family) else {
            fail(&format!("hooks table missing family {family}"));
        };
        let json = compact_family_json(family, entry);
        writeln!(stdout, "{family}: {json}").expect("stdout write must succeed");
    }
    let recorded_json = compact_recorded_json(recorded);
    writeln!(stdout, "recordedBindings: {recorded_json}").expect("stdout write must succeed");
}

/// Compact one hook-family entry in JS `JSON.stringify` key order.
///
/// Shared with `prepare-execution-context`'s embedded-context serializer: the
/// `models` table is compacted as the `modelBindings` family, and every hook
/// family is compacted by name — so the `--script-out` embedded context is
/// byte-identical to the JS CLI's without a second ordering implementation.
pub fn compact_family_json(family: &str, entry: &Value) -> String {
    if family == "modelBindings" {
        return compact_model_bindings(entry);
    }
    if family == "artifactStores" {
        return compact_object_preferred(entry, ARTIFACT_STORE_KEY_ORDER);
    }
    compact_object_provenance_last(entry)
}

fn compact_model_bindings(entry: &Value) -> String {
    let Some(map) = entry.as_object() else {
        return compact_json_value(entry);
    };
    let mut roles: Vec<&str> = Vec::new();
    for &role in MODEL_ROLE_ORDER {
        if map.contains_key(role) {
            roles.push(role);
        }
    }
    let mut extras: Vec<&str> = map
        .keys()
        .filter(|k| !MODEL_ROLE_ORDER.contains(&k.as_str()))
        .map(String::as_str)
        .collect();
    extras.sort_unstable();
    roles.extend(extras);

    let mut parts = Vec::with_capacity(roles.len());
    for role in roles {
        let binding = map.get(role).expect("key present");
        parts.push(format!(
            "{}:{}",
            compact_json_value(&Value::String(role.to_owned())),
            compact_object_preferred(binding, BINDING_KEY_ORDER)
        ));
    }
    format!("{{{}}}", parts.join(","))
}

fn compact_recorded_json(recorded: &Value) -> String {
    let Some(map) = recorded.as_object() else {
        return compact_json_value(recorded);
    };
    let mut parts = Vec::new();
    for &key in RECORDED_BINDING_ORDER {
        if let Some(status) = map.get(key) {
            parts.push(format!(
                "{}:{}",
                compact_json_value(&Value::String(key.to_owned())),
                compact_object_preferred(status, &["status", "gap"])
            ));
        }
    }
    for (key, status) in map {
        if RECORDED_BINDING_ORDER.contains(&key.as_str()) {
            continue;
        }
        parts.push(format!(
            "{}:{}",
            compact_json_value(&Value::String(key.clone())),
            compact_object_preferred(status, &["status", "gap"])
        ));
    }
    format!("{{{}}}", parts.join(","))
}

/// Object keys in `preferred` order when present, then remaining keys alpha,
/// with no special provenance handling beyond the preferred list.
fn compact_object_preferred(value: &Value, preferred: &[&str]) -> String {
    let Some(map) = value.as_object() else {
        return compact_json_value(value);
    };
    let mut keys: Vec<&str> = Vec::new();
    for &k in preferred {
        if map.contains_key(k) {
            keys.push(k);
        }
    }
    let mut rest: Vec<&str> = map
        .keys()
        .filter(|k| !preferred.contains(&k.as_str()))
        .map(String::as_str)
        .collect();
    rest.sort_unstable();
    keys.extend(rest);
    emit_object(map, &keys)
}

/// Single-entry family shape: content keys alphabetical, then `provenance`, then `gap`
/// — matches JS `{ ...entry, provenance }` for the common one-field entries, and puts
/// stamp fields last when more content keys appear.
fn compact_object_provenance_last(value: &Value) -> String {
    let Some(map) = value.as_object() else {
        return compact_json_value(value);
    };
    let mut content: Vec<&str> = map
        .keys()
        .filter(|k| k.as_str() != "provenance" && k.as_str() != "gap")
        .map(String::as_str)
        .collect();
    content.sort_unstable();
    let mut keys = content;
    if map.contains_key("provenance") {
        keys.push("provenance");
    }
    if map.contains_key("gap") {
        keys.push("gap");
    }
    emit_object(map, &keys)
}

fn emit_object(map: &Map<String, Value>, keys: &[&str]) -> String {
    let mut parts = Vec::with_capacity(keys.len());
    for &key in keys {
        let Some(v) = map.get(key) else {
            continue;
        };
        parts.push(format!(
            "{}:{}",
            compact_json_value(&Value::String(key.to_owned())),
            compact_json_value(v)
        ));
    }
    format!("{{{}}}", parts.join(","))
}

fn compact_json_value(value: &Value) -> String {
    match value {
        Value::Null => "null".to_owned(),
        Value::Bool(true) => "true".to_owned(),
        Value::Bool(false) => "false".to_owned(),
        Value::Number(n) => n.to_string(),
        Value::String(s) => serde_json::to_string(s).unwrap_or_else(|_| "\"\"".to_owned()),
        Value::Array(items) => {
            let parts: Vec<String> = items.iter().map(compact_json_value).collect();
            format!("[{}]", parts.join(","))
        }
        Value::Object(map) => {
            // Nested generic objects: alpha keys (rare in hook inventory values).
            let mut keys: Vec<&str> = map.keys().map(String::as_str).collect();
            keys.sort_unstable();
            emit_object(map, &keys)
        }
    }
}

/// Resolve every non-synthetic inventory family across the four settings layers.
///
/// # Errors
///
/// Returns an error string when a settings layer is unparseable or a family
/// resolve fails (malformed modelBindings entry, etc.).
pub fn build_hooks_table() -> Result<Value, String> {
    let model_defaults: Value = serde_json::from_str(DEFAULT_MODEL_BINDINGS_JSON)
        .map_err(|e| format!("unparseable embedded model-bindings defaults: {e}"))?;
    let hook_defaults: Value = serde_json::from_str(DEFAULT_HOOK_DEFAULTS_JSON)
        .map_err(|e| format!("unparseable embedded hook-defaults: {e}"))?;

    let user_file = user_settings_path();
    let project_file = project_settings_path();
    let local_file = local_settings_path();

    let mut hooks = Map::new();
    for &family in HOOK_FAMILY_ORDER {
        if family == "exampleBlock" {
            continue; // synthetic — not a settings key
        }
        let defaults = if family == "modelBindings" {
            Some(model_defaults.clone())
        } else {
            hook_defaults.get(family).cloned()
        };

        let user_raw = read_settings_layer(&user_file, family).map_err(|e| e.to_string())?;
        let project_raw = read_settings_layer(&project_file, family).map_err(|e| e.to_string())?;
        let local_raw = read_settings_layer(&local_file, family).map_err(|e| e.to_string())?;

        let layers = LayerSources {
            defaults,
            user: family_layer(family, user_raw),
            project: family_layer(family, project_raw),
            local: family_layer(family, local_raw),
        };
        let resolved = resolve_family(family, &layers).map_err(|e| e.to_string())?;
        hooks.insert(family.to_owned(), resolved);
    }
    Ok(Value::Object(hooks))
}

fn read_architecture_text() -> String {
    let path = Path::new(ARCHITECTURE_MD);
    if path.exists() {
        fs::read_to_string(path).unwrap_or_else(|err| {
            fail(&format!("could not read {ARCHITECTURE_MD}: {err}"));
        })
    } else {
        warn(&format!(
            "no {ARCHITECTURE_MD} — recorded bindings treated as absent"
        ));
        String::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::process::Command;
    use std::sync::OnceLock;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn bin() -> PathBuf {
        static BIN: OnceLock<PathBuf> = OnceLock::new();
        BIN.get_or_init(|| {
            if let Ok(p) = std::env::var("CARGO_BIN_EXE_the-loop") {
                return PathBuf::from(p);
            }
            let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
            path.push("../target/debug/the-loop");
            if path.exists() {
                return path;
            }
            let mut release = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
            release.push("../target/release/the-loop");
            release
        })
        .clone()
    }

    fn ensure_bin() {
        if bin().exists() {
            return;
        }
        let status = Command::new("cargo")
            .args(["build", "-p", "the-loop", "--quiet"])
            .current_dir(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(".."))
            .status()
            .expect("cargo build");
        assert!(status.success());
    }

    fn tempfile_dir(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |d| d.as_nanos());
        let dir =
            std::env::temp_dir().join(format!("the-loop-{label}-{}-{nanos}", std::process::id()));
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    fn write(root: &Path, rel: &str, body: &str) {
        let path = root.join(rel);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("mkdir");
        }
        fs::write(&path, body).expect("write");
    }

    struct HomeGuard {
        prev: Option<std::ffi::OsString>,
    }

    impl HomeGuard {
        fn set(path: &Path) -> Self {
            let prev = std::env::var_os("HOME");
            unsafe {
                std::env::set_var("HOME", path);
            }
            Self { prev }
        }
    }

    impl Drop for HomeGuard {
        fn drop(&mut self) {
            unsafe {
                match &self.prev {
                    Some(v) => std::env::set_var("HOME", v),
                    None => std::env::remove_var("HOME"),
                }
            }
        }
    }

    /// Criterion: every non-synthetic family resolved; empty-object unbound rule.
    #[test]
    fn build_hooks_table_resolves_all_real_families() {
        let _env = crate::env_lock();
        let project = tempfile_dir("hooks-build");
        let home = tempfile_dir("hooks-home");
        write(
            &project,
            ".claude/settings.json",
            r#"{"the-loop":{
              "modelBindings":{"build.standard":{"model":"sonnet"}},
              "testHarness":{"command":"npm test"}
            }}"#,
        );
        let _home = HomeGuard::set(&home);
        let prev = std::env::current_dir().expect("cwd");
        std::env::set_current_dir(&project).expect("cd");
        let hooks = build_hooks_table().expect("ok");
        std::env::set_current_dir(&prev).expect("restore");

        for family in [
            "interview",
            "modelBindings",
            "testHarness",
            "lint",
            "precommit",
            "notification",
            "artifactStores",
            "worktreeSetup",
        ] {
            assert!(
                hooks.get(family).is_some(),
                "missing family {family} in {hooks}"
            );
        }
        assert!(hooks.get("exampleBlock").is_none());

        assert_eq!(hooks["interview"]["skill"], "grilling");
        assert_eq!(hooks["interview"]["provenance"], "default");
        assert_eq!(hooks["testHarness"]["command"], "npm test");
        assert_eq!(hooks["testHarness"]["provenance"], "project");
        // lint unbound in defaults + layers → inventory fallback
        assert_eq!(hooks["lint"]["value"], "detected-convention");
        assert_eq!(hooks["lint"]["provenance"], "fallback");
        // worktreeSetup unbound → inventory fallback
        assert_eq!(hooks["worktreeSetup"]["provisioning"], "none");
        assert_eq!(hooks["worktreeSetup"]["provenance"], "fallback");
        assert_eq!(hooks["modelBindings"]["build.standard"]["model"], "sonnet");
        assert_eq!(
            hooks["modelBindings"]["build.standard"]["provenance"],
            "project"
        );

        let _ = fs::remove_dir_all(&project);
        let _ = fs::remove_dir_all(&home);
    }

    #[test]
    fn compact_family_json_puts_provenance_last_and_roles_in_defaults_order() {
        let interview = json!({ "provenance": "default", "skill": "grilling" });
        assert_eq!(
            compact_family_json("interview", &interview),
            r#"{"skill":"grilling","provenance":"default"}"#
        );
        let worktree = json!({ "provenance": "fallback", "provisioning": "none" });
        assert_eq!(
            compact_family_json("worktreeSetup", &worktree),
            r#"{"provisioning":"none","provenance":"fallback"}"#
        );
        let stores = json!({
            "calibration": "local",
            "briefs": "local",
            "provenance": "default",
            "designs": "local",
            "features": "local",
            "runbooks": "local",
            "rcas": "local",
        });
        assert_eq!(
            compact_family_json("artifactStores", &stores),
            r#"{"briefs":"local","designs":"local","features":"local","runbooks":"local","rcas":"local","calibration":"local","provenance":"default"}"#
        );
        let models = json!({
            "record": { "model": "haiku", "provenance": "default" },
            "plan": { "model": "session", "provenance": "default" },
            "build.rote": { "executor": "grok", "model": "grok-4.5", "provenance": "default" },
        });
        assert_eq!(
            compact_family_json("modelBindings", &models),
            r#"{"plan":{"model":"session","provenance":"default"},"build.rote":{"model":"grok-4.5","executor":"grok","provenance":"default"},"record":{"model":"haiku","provenance":"default"}}"#
        );
    }

    #[test]
    fn process_compact_prints_one_line_per_family_then_recorded_bindings() {
        ensure_bin();
        let project = tempfile_dir("hooks-compact");
        let home = tempfile_dir("hooks-compact-home");
        write(
            &project,
            ".claude/settings.json",
            r#"{"the-loop":{
              "modelBindings":{"build.standard":{"model":"sonnet"}},
              "testHarness":{"command":"npm test"}
            }}"#,
        );
        write(
            &project,
            "docs/architecture.md",
            r"# Fixture — Architecture

## Validation procedure

Run `npm test` and expect all green.

## Release runbook

Tag the repo and push main; there is no deploy target.
",
        );

        let output = Command::new(bin())
            .args(["hooks-list", "--compact"])
            .current_dir(&project)
            .env("HOME", &home)
            .output()
            .expect("spawn");
        assert!(
            output.status.success(),
            "stderr: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        let stdout = String::from_utf8_lossy(&output.stdout);
        let lines: Vec<&str> = stdout.lines().collect();
        assert_eq!(
            lines.len(),
            9,
            "8 families + recordedBindings; got {} lines:\n{stdout}",
            lines.len()
        );
        assert!(lines[0].starts_with("interview: "));
        assert!(lines[1].starts_with("modelBindings: "));
        assert!(lines[2].starts_with("testHarness: "));
        assert!(lines[3].starts_with("lint: "));
        assert!(lines[4].starts_with("precommit: "));
        assert!(lines[5].starts_with("notification: "));
        assert!(lines[6].starts_with("artifactStores: "));
        assert!(lines[7].starts_with("worktreeSetup: "));
        assert!(lines[8].starts_with("recordedBindings: "));
        assert!(
            lines[7].contains(r#""provisioning":"none""#)
                && lines[7].contains(r#""provenance":"fallback""#),
            "worktreeSetup fallback in compact; got {}",
            lines[7]
        );
        // provenance must follow content keys (not BTreeMap alpha)
        assert!(
            lines[0].ends_with(r#""provenance":"default"}"#)
                || lines[0].contains(r#""skill":"grilling","provenance":"default""#),
            "interview compact key order; got {}",
            lines[0]
        );

        let _ = fs::remove_dir_all(&project);
        let _ = fs::remove_dir_all(&home);
    }

    #[test]
    fn process_happy_path_prints_hooks_and_recorded_bindings() {
        ensure_bin();
        let project = tempfile_dir("hooks-proc");
        let home = tempfile_dir("hooks-proc-home");
        write(
            &project,
            ".claude/settings.json",
            r#"{"the-loop":{
              "modelBindings":{"build.standard":{"model":"sonnet"}},
              "testHarness":{"command":"npm test"}
            }}"#,
        );
        write(
            &project,
            "docs/architecture.md",
            r"# Fixture — Architecture

## Validation procedure

Run `npm test` and expect all green.

## Release runbook

Tag the repo and push main; there is no deploy target.
",
        );

        let output = Command::new(bin())
            .args(["hooks-list"])
            .current_dir(&project)
            .env("HOME", &home)
            .output()
            .expect("spawn");
        assert!(
            output.status.success(),
            "stderr: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        let value: Value = serde_json::from_slice(&output.stdout).expect("JSON");
        assert_eq!(
            value["hooks"]["testHarness"],
            json!({"command": "npm test", "provenance": "project"})
        );
        assert_eq!(
            value["hooks"]["lint"],
            json!({"value": "detected-convention", "provenance": "fallback"})
        );
        assert_eq!(
            value["recordedBindings"]["validationProcedure"],
            json!({"status": "present", "gap": null})
        );
        assert_eq!(
            value["recordedBindings"]["releaseRunbook"],
            json!({"status": "present", "gap": null})
        );
        assert_eq!(
            value["recordedBindings"]["operationsToolkit"],
            json!({
                "status": "absent",
                "gap": "lazy retrofit (operate-tooling)"
            })
        );

        let _ = fs::remove_dir_all(&project);
        let _ = fs::remove_dir_all(&home);
    }

    #[test]
    fn process_missing_architecture_warns_and_treats_absent() {
        ensure_bin();
        let project = tempfile_dir("hooks-no-arch");
        let home = tempfile_dir("hooks-no-arch-home");
        // No docs/architecture.md

        let output = Command::new(bin())
            .args(["hooks-list"])
            .current_dir(&project)
            .env("HOME", &home)
            .output()
            .expect("spawn");
        assert!(
            output.status.success(),
            "stderr: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        let stderr = String::from_utf8_lossy(&output.stderr);
        assert!(
            stderr.contains("docs/architecture.md") && stderr.contains("warn"),
            "must warn about missing architecture.md; got {stderr}"
        );
        let value: Value = serde_json::from_slice(&output.stdout).expect("JSON");
        assert_eq!(
            value["recordedBindings"]["validationProcedure"]["status"],
            "absent"
        );
        assert_eq!(
            value["recordedBindings"]["operationsToolkit"]["gap"],
            "lazy retrofit (operate-tooling)"
        );

        let _ = fs::remove_dir_all(&project);
        let _ = fs::remove_dir_all(&home);
    }

    #[test]
    fn process_malformed_model_bindings_exit_1_empty_stdout() {
        ensure_bin();
        let project = tempfile_dir("hooks-refuse");
        let home = tempfile_dir("hooks-refuse-home");
        write(
            &project,
            ".claude/settings.json",
            r#"{"the-loop":{"modelBindings":{"build.standard":"sonnet"}}}"#,
        );

        let output = Command::new(bin())
            .args(["hooks-list"])
            .current_dir(&project)
            .env("HOME", &home)
            .output()
            .expect("spawn");
        assert_eq!(output.status.code(), Some(1));
        assert!(output.stdout.is_empty());
        assert!(!output.stderr.is_empty());

        let _ = fs::remove_dir_all(&project);
        let _ = fs::remove_dir_all(&home);
    }
}
