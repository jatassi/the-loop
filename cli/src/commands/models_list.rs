//! `models-list [defaults.json] [executors-dir]` — resolved role table with provenance.
//!
//! Four-layer merge under `"the-loop".modelBindings` (defaults < user < project <
//! local). Registry validation is a hard gate: errors exit 1 with empty stdout;
//! warnings go to stderr and never fail. Ports `buildModelsTable` /
//! `modelsListCommand` in `plugin/bin/cli-commands.js`.

use std::collections::BTreeMap;
use std::fs;
use std::io::{self, Write};
use std::path::Path;
use std::process;

use serde_json::Value;

use crate::commands::executors_list::load_registry;
use crate::executors::{RoleBinding, ValidationResult, validate_bindings};
use crate::io::{fail, out};
use crate::settings::{
    LayerSources, local_settings_path, project_settings_path, resolve_models, user_settings_path,
};
use crate::{DEFAULT_MODEL_BINDINGS_JSON, default_executor_registry};

/// Run `models-list`, writing the role table to stdout or refusing via exit 1.
pub fn run(defaults_file: Option<&str>, executors_dir: Option<&str>) {
    match build_models_table(defaults_file, executors_dir) {
        Ok((table, validation)) => {
            emit_validation_issues(&validation);
            if !validation.errors.is_empty() {
                // Match JS: error lines on stderr, exit 1, no stdout table.
                process::exit(1);
            }
            out(&table);
        }
        Err(msg) => fail(&msg),
    }
}

/// Resolve the role table and run registry validation (shared pure-ish core).
///
/// # Errors
///
/// Returns an error string when defaults cannot be read/parsed, a settings layer
/// is unparseable, or `resolve_models` rejects a malformed entry.
pub fn build_models_table(
    defaults_file: Option<&str>,
    executors_dir: Option<&str>,
) -> Result<(Value, ValidationResult), String> {
    let defaults = read_model_defaults(defaults_file)?;
    let user = read_layer(user_settings_path(), "modelBindings")?;
    let project = read_layer(project_settings_path(), "modelBindings")?;
    let local = read_layer(local_settings_path(), "modelBindings")?;

    let layers = LayerSources {
        defaults: Some(defaults),
        user: Some(user),
        project: Some(project),
        local: Some(local),
    };
    let table = resolve_models(&layers).map_err(|e| e.to_string())?;

    let registry = match executors_dir {
        Some(dir) => load_registry(Some(dir))?,
        None => default_executor_registry()?,
    };
    let bindings = role_bindings_from_table(&table);
    let validation = validate_bindings(&bindings, &registry);
    Ok((table, validation))
}

fn read_model_defaults(defaults_file: Option<&str>) -> Result<Value, String> {
    defaults_file.map_or_else(
        || {
            serde_json::from_str(DEFAULT_MODEL_BINDINGS_JSON)
                .map_err(|e| format!("unparseable embedded model-bindings defaults: {e}"))
        },
        read_defaults_file,
    )
}

fn read_defaults_file(file: &str) -> Result<Value, String> {
    let text = fs::read_to_string(file)
        .map_err(|e| format!("could not read defaults file {file}: {e}"))?;
    serde_json::from_str(&text).map_err(|e| format!("unparseable JSON in {file}: {e}"))
}

fn read_layer(path: impl AsRef<Path>, family: &str) -> Result<Value, String> {
    crate::settings::read_settings_layer(path, family).map_err(|e| e.to_string())
}

/// Convert a resolved role-table JSON object into the map `validate_bindings` expects.
fn role_bindings_from_table(table: &Value) -> BTreeMap<String, RoleBinding> {
    let mut map = BTreeMap::new();
    let Some(obj) = table.as_object() else {
        return map;
    };
    for (role, entry) in obj {
        let Some(entry_obj) = entry.as_object() else {
            continue;
        };
        let model = entry_obj
            .get("model")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_owned();
        let executor = entry_obj
            .get("executor")
            .and_then(Value::as_str)
            .map(str::to_owned);
        let effort = entry_obj
            .get("effort")
            .and_then(Value::as_str)
            .map(str::to_owned);
        map.insert(
            role.clone(),
            RoleBinding {
                model,
                executor,
                effort,
            },
        );
    }
    map
}

/// Write validation warnings/errors to stderr in the JS CLI format
/// (`warn code: message (where)` / `error code: message (where)`).
fn emit_validation_issues(validation: &ValidationResult) {
    let mut stderr = io::stderr().lock();
    for w in &validation.warnings {
        let _ = writeln!(stderr, "warn {}: {} ({})", w.code, w.message, w.where_role);
    }
    for e in &validation.errors {
        let _ = writeln!(stderr, "error {}: {} ({})", e.code, e.message, e.where_role);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::process::Command;
    use std::sync::OnceLock;
    use std::time::{SystemTime, UNIX_EPOCH};

    use serde_json::json;

    use crate::DEFAULT_MODEL_BINDINGS_JSON;

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
        let path = bin();
        if path.exists() {
            return;
        }
        let status = Command::new("cargo")
            .args(["build", "-p", "the-loop", "--quiet"])
            .current_dir(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(".."))
            .status()
            .expect("cargo build must start");
        assert!(status.success(), "cargo build -p the-loop failed");
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

    fn write_settings(root: &Path, rel: &str, body: &str) {
        let path = root.join(rel);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("mkdir");
        }
        fs::write(&path, body).expect("write settings");
    }

    fn valid_playbook(id: &str, models: &[&str]) -> String {
        let models_json: Vec<String> = models.iter().map(|m| format!("\"{m}\"")).collect();
        format!(
            r#"# {id}

## Machine block

```json
{{
  "id": "{id}",
  "command": "{id}",
  "models": [{}],
  "worktree": "driver-made",
  "invocation": "{id} -m {{model}} --prompt-file {{prompt}} --cwd {{worktree}}",
  "availability": "{id} --version",
  "auth_smoke": {{ "run": "ping", "expect": "PONG" }},
  "concurrency": 1
}}
```
"#,
            models_json.join(", ")
        )
    }

    /// Criterion 1: four-layer resolve with per-role provenance (embedded defaults).
    #[test]
    fn build_models_table_merges_layers_with_provenance() {
        let _env = crate::env_lock();
        let project = tempfile_dir("models-project");
        let home = tempfile_dir("models-home");
        write_settings(
            &project,
            ".claude/settings.json",
            r#"{"the-loop":{"modelBindings":{"build.standard":{"model":"sonnet"}}}}"#,
        );
        // Empty user layer via isolated HOME.
        let _home_guard = HomeGuard::set(&home);

        let prev = std::env::current_dir().expect("cwd");
        std::env::set_current_dir(&project).expect("cd project");
        let result = build_models_table(None, None);
        std::env::set_current_dir(&prev).expect("restore cwd");

        let (table, validation) = result.expect("resolve must succeed");
        assert!(
            validation.errors.is_empty(),
            "default registry must accept default bindings; errors={:?}",
            validation.errors
        );
        assert_eq!(table["build.standard"]["model"], "sonnet");
        assert_eq!(table["build.standard"]["provenance"], "project");
        assert_eq!(table["plan"]["model"], "session");
        assert_eq!(table["plan"]["provenance"], "default");
        assert_eq!(table["build.rote"]["executor"], "grok");
        assert_eq!(table["build.rote"]["provenance"], "default");

        let _ = fs::remove_dir_all(&project);
        let _ = fs::remove_dir_all(&home);
    }

    /// Criterion: warnings to stderr without failing; errors exit 1 empty stdout.
    #[test]
    fn build_models_table_validate_errors_and_warnings() {
        let _env = crate::env_lock();
        let project = tempfile_dir("models-validate");
        let home = tempfile_dir("models-home2");
        let exec_dir = project.join("playbooks");
        fs::create_dir_all(&exec_dir).expect("playbooks");
        // Only model-a — default bindings name grok-4.5 / grok → unregistered.
        fs::write(
            exec_dir.join("widget.md"),
            valid_playbook("widget", &["model-a"]),
        )
        .expect("write");

        // No project/user modelBindings — only the defaults file under test applies.
        let _home_guard = HomeGuard::set(&home);
        let prev = std::env::current_dir().expect("cwd");
        std::env::set_current_dir(&project).expect("cd");

        // Explicit defaults that only bind the widget role on routing surface.
        let defaults_path = project.join("defaults.json");
        fs::write(
            &defaults_path,
            r#"{"build.rote":{"model":"model-a","executor":"widget"},"plan":{"model":"session"}}"#,
        )
        .expect("defaults");

        let (table, validation) = build_models_table(
            Some(defaults_path.to_str().unwrap()),
            Some(exec_dir.to_str().unwrap()),
        )
        .expect("resolve ok");

        assert_eq!(table["build.rote"]["executor"], "widget");
        assert!(
            validation.errors.is_empty(),
            "widget+model-a should be valid; {:?}",
            validation.errors
        );

        // Unregistered executor → hard error.
        let defaults_bad = project.join("defaults-bad.json");
        fs::write(
            &defaults_bad,
            r#"{"build.rote":{"model":"x","executor":"ghost"}}"#,
        )
        .expect("write");
        let (_t, bad) = build_models_table(
            Some(defaults_bad.to_str().unwrap()),
            Some(exec_dir.to_str().unwrap()),
        )
        .expect("resolve ok");
        assert!(
            bad.errors.iter().any(|e| e.code == "unregistered-executor"),
            "expected unregistered-executor; got {:?}",
            bad.errors
        );

        // Model outside playbook.
        let defaults_out = project.join("defaults-out.json");
        fs::write(
            &defaults_out,
            r#"{"build.rote":{"model":"not-in-list","executor":"widget"}}"#,
        )
        .expect("write");
        let (_t, out_of) = build_models_table(
            Some(defaults_out.to_str().unwrap()),
            Some(exec_dir.to_str().unwrap()),
        )
        .expect("resolve ok");
        std::env::set_current_dir(&prev).expect("restore");
        assert!(
            out_of
                .errors
                .iter()
                .any(|e| e.code == "model-outside-playbook"),
            "expected model-outside-playbook; got {:?}",
            out_of.errors
        );

        let _ = fs::remove_dir_all(&project);
        let _ = fs::remove_dir_all(&home);
    }

    #[test]
    fn process_happy_path_prints_role_table() {
        ensure_bin();
        let project = tempfile_dir("models-proc");
        let home = tempfile_dir("models-proc-home");
        write_settings(
            &project,
            ".claude/settings.json",
            r#"{"the-loop":{"modelBindings":{"build.standard":{"model":"sonnet"}}}}"#,
        );

        let output = Command::new(bin())
            .args(["models-list"])
            .current_dir(&project)
            .env("HOME", &home)
            .output()
            .expect("spawn");
        assert!(
            output.status.success(),
            "stderr: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        let value: Value = serde_json::from_slice(&output.stdout).expect("JSON stdout");
        assert_eq!(
            value["build.standard"],
            json!({"model": "sonnet", "provenance": "project"})
        );
        assert_eq!(value["plan"]["provenance"], "default");
        // Embedded defaults carry grok executor bindings.
        assert_eq!(value["validate"]["executor"], "grok");

        let _ = fs::remove_dir_all(&project);
        let _ = fs::remove_dir_all(&home);
    }

    #[test]
    fn process_malformed_bindings_exit_1_empty_stdout() {
        ensure_bin();
        let project = tempfile_dir("models-refuse");
        let home = tempfile_dir("models-refuse-home");
        // Bare string — not an object binding (oracle bareStringHome case).
        write_settings(
            &project,
            ".claude/settings.json",
            r#"{"the-loop":{"modelBindings":{"build.standard":"sonnet"}}}"#,
        );

        let output = Command::new(bin())
            .args(["models-list"])
            .current_dir(&project)
            .env("HOME", &home)
            .output()
            .expect("spawn");
        assert_eq!(
            output.status.code(),
            Some(1),
            "stderr={}",
            String::from_utf8_lossy(&output.stderr)
        );
        assert!(
            output.stdout.is_empty(),
            "refusal must leave stdout empty; got {:?}",
            String::from_utf8_lossy(&output.stdout)
        );
        assert!(
            !output.stderr.is_empty(),
            "stderr must be present on refusal"
        );

        let _ = fs::remove_dir_all(&project);
        let _ = fs::remove_dir_all(&home);
    }

    #[test]
    fn process_validation_errors_exit_1_empty_stdout() {
        ensure_bin();
        let project = tempfile_dir("models-val-err");
        let home = tempfile_dir("models-val-home");
        let exec_dir = project.join("playbooks");
        fs::create_dir_all(&exec_dir).expect("dir");
        fs::write(exec_dir.join("widget.md"), valid_playbook("widget", &["a"])).expect("pb");

        let defaults = project.join("defaults.json");
        fs::write(
            &defaults,
            r#"{"build.rote":{"model":"a","executor":"nope"}}"#,
        )
        .expect("defaults");

        let output = Command::new(bin())
            .args([
                "models-list",
                defaults.to_str().unwrap(),
                exec_dir.to_str().unwrap(),
            ])
            .current_dir(&project)
            .env("HOME", &home)
            .output()
            .expect("spawn");
        assert_eq!(output.status.code(), Some(1));
        assert!(
            output.stdout.is_empty(),
            "validation refusal must leave stdout empty"
        );
        let stderr = String::from_utf8_lossy(&output.stderr);
        assert!(
            stderr.contains("unregistered-executor") || stderr.contains("error"),
            "stderr must carry validation error; got {stderr}"
        );

        let _ = fs::remove_dir_all(&project);
        let _ = fs::remove_dir_all(&home);
    }

    #[test]
    fn embedded_defaults_parse() {
        let v: Value = serde_json::from_str(DEFAULT_MODEL_BINDINGS_JSON).expect("json");
        assert!(v.get("build.rote").is_some());
    }

    /// RAII HOME override for tests that read the user settings layer.
    struct HomeGuard {
        prev: Option<std::ffi::OsString>,
    }

    impl HomeGuard {
        fn set(path: &Path) -> Self {
            let prev = std::env::var_os("HOME");
            // SAFETY: test-only HOME override; restored on drop. Callers hold
            // `crate::env_lock()` so no other thread touches HOME meanwhile.
            unsafe {
                std::env::set_var("HOME", path);
            }
            Self { prev }
        }
    }

    impl Drop for HomeGuard {
        fn drop(&mut self) {
            // SAFETY: restore previous HOME for subsequent tests.
            unsafe {
                match &self.prev {
                    Some(v) => std::env::set_var("HOME", v),
                    None => std::env::remove_var("HOME"),
                }
            }
        }
    }
}
