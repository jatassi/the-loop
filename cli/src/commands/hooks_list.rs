//! `hooks-list` — full resolved hook inventory plus recorded-bindings status.
//!
//! Every non-synthetic `HOOK_INVENTORY` family across four layers (modelBindings
//! defaults from embedded bindings; other families from embedded hook-defaults),
//! applying the empty-object-is-unbound layer rule. Prints
//! `{ hooks, recordedBindings }`. Ports `buildHooksTable` + `hooksListCommand`.

use std::fs;
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

/// Run `hooks-list`, writing `{hooks, recordedBindings}` or refusing via [`fail`].
pub fn run() {
    match build_hooks_table() {
        Ok(hooks) => {
            let architecture_text = read_architecture_text();
            out(&json!({
                "hooks": hooks,
                "recordedBindings": recorded_bindings_status(&architecture_text),
            }));
        }
        Err(msg) => fail(&msg),
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
        assert_eq!(hooks["modelBindings"]["build.standard"]["model"], "sonnet");
        assert_eq!(
            hooks["modelBindings"]["build.standard"]["provenance"],
            "project"
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
