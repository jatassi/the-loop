//! `executors-list [dir]` — print the parsed executor-playbook registry as JSON.
//!
//! Mirrors the JS CLI: an absent dir is an empty registry (exit 0); a missing
//! optional dir argument uses the compiled-in default registry; a malformed or
//! duplicate-id playbook exits 1 naming the file with empty stdout.

use std::fs;
use std::path::Path;

use crate::default_executor_registry;
use crate::executors::{PlaybookEntry, Registry, parse_executors};
use crate::io::{fail, out};

/// Run `executors-list`, writing the registry to stdout or refusing via [`fail`].
pub fn run(dir: Option<&str>) {
    match load_registry(dir) {
        Ok(registry) => out(&registry),
        Err(msg) => fail(&msg),
    }
}

/// Load the registry for `dir`, or the compiled-in default when `dir` is `None`.
///
/// # Errors
///
/// Returns an error string naming the offending file when a playbook is
/// malformed or two playbooks claim the same id. An absent directory is not an
/// error — it yields an empty registry.
pub fn load_registry(dir: Option<&str>) -> Result<Registry, String> {
    dir.map_or_else(default_executor_registry, |d| {
        read_registry_dir(Path::new(d))
    })
}

/// Every `*.md` file in `dir`, parsed into a registry keyed by id.
///
/// An absent dir is an empty registry, never an error (a delegation-off repo
/// need not ship `config/executors/`).
fn read_registry_dir(dir: &Path) -> Result<Registry, String> {
    if !dir.exists() {
        return Ok(Registry::new());
    }

    let mut owned: Vec<(String, String)> = Vec::new();
    let read_dir = fs::read_dir(dir).map_err(|err| {
        format!(
            "could not read executors directory {}: {err}",
            dir.display()
        )
    })?;

    for entry in read_dir {
        let entry = entry.map_err(|err| {
            format!(
                "could not read executors directory {}: {err}",
                dir.display()
            )
        })?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let text = fs::read_to_string(&path)
            .map_err(|err| format!("could not read playbook {}: {err}", path.display()))?;
        // Match JS `path.join(dir, f)` for error-message paths.
        let file = path_for_error(dir, &path);
        owned.push((file, text));
    }

    // Stable order so duplicate-id errors name files deterministically.
    owned.sort_by(|a, b| a.0.cmp(&b.0));

    let entries: Vec<PlaybookEntry<'_>> = owned
        .iter()
        .map(|(file, text)| PlaybookEntry {
            file: file.as_str(),
            text: text.as_str(),
        })
        .collect();

    parse_executors(&entries)
}

fn path_for_error(dir: &Path, path: &Path) -> String {
    path.file_name().and_then(|n| n.to_str()).map_or_else(
        || path.display().to_string(),
        |name| dir.join(name).to_string_lossy().into_owned(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::process::Command;
    use std::sync::OnceLock;
    use std::time::{SystemTime, UNIX_EPOCH};

    use crate::DEFAULT_GROK_PLAYBOOK;
    use crate::DEFAULT_HOOK_DEFAULTS_JSON;
    use crate::DEFAULT_MODEL_BINDINGS_JSON;
    use crate::crate_version;
    use crate::executors::{PlaybookEntry, parse_executors};

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

    fn spawn(args: &[&str]) -> std::process::Output {
        Command::new(bin())
            .args(args)
            .output()
            .unwrap_or_else(|err| panic!("failed to spawn the-loop: {err}"))
    }

    fn spawn_in(cwd: &Path, args: &[&str]) -> std::process::Output {
        Command::new(bin())
            .current_dir(cwd)
            .args(args)
            .output()
            .unwrap_or_else(|err| panic!("failed to spawn the-loop: {err}"))
    }

    fn valid_playbook(id: &str) -> String {
        format!(
            r#"# {id}

## Machine block

```json
{{
  "id": "{id}",
  "command": "{id}",
  "models": ["model-a"],
  "worktree": "driver-made",
  "invocation": "{id} -m {{model}} --prompt-file {{prompt}} --cwd {{worktree}}",
  "availability": "{id} --version",
  "auth_smoke": {{
    "run": "{id} ping",
    "expect": "PONG"
  }},
  "concurrency": 1
}}
```
"#
        )
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

    #[test]
    fn default_registry_parses_and_contains_grok() {
        let registry = default_executor_registry().expect("compiled-in grok playbook must parse");
        assert!(
            registry.contains_key("grok"),
            "default registry must include grok; keys: {:?}",
            registry.keys().collect::<Vec<_>>()
        );
        assert_eq!(registry["grok"].command, "grok");
        assert!(
            registry["grok"].models.contains(&"grok-4.5".to_owned()),
            "models should mirror plugin playbook fields"
        );
    }

    #[test]
    fn compiled_in_defaults_are_non_empty_json_and_playbook() {
        assert!(
            DEFAULT_MODEL_BINDINGS_JSON.contains("build.rote"),
            "model-bindings defaults must be embedded"
        );
        assert!(
            DEFAULT_HOOK_DEFAULTS_JSON.contains("interview"),
            "hook-defaults must be embedded"
        );
        assert!(
            DEFAULT_GROK_PLAYBOOK.contains("## Machine block"),
            "grok playbook must include the machine-block heading"
        );
        assert!(
            DEFAULT_GROK_PLAYBOOK.contains("```json"),
            "embedded grok playbook must be json-fenced"
        );
        let _: serde_json::Value =
            serde_json::from_str(DEFAULT_MODEL_BINDINGS_JSON).expect("model-bindings JSON");
        let _: serde_json::Value =
            serde_json::from_str(DEFAULT_HOOK_DEFAULTS_JSON).expect("hook-defaults JSON");
    }

    #[test]
    fn load_registry_none_uses_compiled_in_default() {
        let registry = load_registry(None).expect("default path");
        assert!(registry.contains_key("grok"));
    }

    #[test]
    fn absent_dir_yields_empty_registry() {
        let missing =
            std::env::temp_dir().join(format!("the-loop-no-such-executors-{}", std::process::id()));
        assert!(!missing.exists());
        let registry = load_registry(Some(missing.to_str().expect("utf8 path")))
            .expect("absent dir is empty, not an error");
        assert!(registry.is_empty());
    }

    #[test]
    fn valid_dir_returns_registry_keyed_by_id() {
        let dir = tempfile_dir("valid-playbooks");
        fs::write(dir.join("alpha.md"), valid_playbook("alpha")).expect("write alpha");
        fs::write(dir.join("beta.md"), valid_playbook("beta")).expect("write beta");

        let registry =
            load_registry(Some(dir.to_str().expect("utf8"))).expect("valid playbooks should parse");
        let keys: Vec<_> = registry.keys().cloned().collect();
        assert_eq!(keys, vec!["alpha".to_owned(), "beta".to_owned()]);
        assert_eq!(registry["alpha"].command, "alpha");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn malformed_playbook_errors_naming_the_file() {
        let dir = tempfile_dir("malformed-playbooks");
        // Valid fence + JSON, but missing required "command" field.
        let bad = r#"# widget

## Machine block

```json
{
  "id": "widget",
  "models": ["m"],
  "worktree": "driver-made",
  "invocation": "widget -m {model} --prompt-file {prompt} --cwd {worktree}",
  "availability": "widget --version",
  "auth_smoke": { "run": "ping", "expect": "PONG" },
  "concurrency": 1
}
```
"#;
        fs::write(dir.join("widget.md"), bad).expect("write");

        let err = load_registry(Some(dir.to_str().expect("utf8"))).unwrap_err();
        assert!(
            err.contains("widget.md") && err.contains("command"),
            "malformed playbook must name the file and field; got {err}"
        );

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn duplicate_id_error_names_both_files() {
        // Flat dirs cannot host two same-stem files; the duplicate-id path is
        // still what parse_executors (and thus load_registry) returns when two
        // entries share an id — exercised here with the same entry shape the
        // command layer feeds the pure parser.
        let text = valid_playbook("grok");
        let err = parse_executors(&[
            PlaybookEntry {
                file: "config/executors/grok.md",
                text: &text,
            },
            PlaybookEntry {
                file: "archived/grok.md",
                text: &text,
            },
        ])
        .unwrap_err();
        assert!(
            err.contains("config/executors/grok.md") && err.contains("archived/grok.md"),
            "duplicate error must name both files; got {err}"
        );
    }

    #[test]
    fn process_absent_dir_exits_zero_empty_object() {
        ensure_bin();
        let missing = std::env::temp_dir().join(format!(
            "the-loop-process-no-executors-{}",
            std::process::id()
        ));
        assert!(!missing.exists());
        let output = spawn(&["executors-list", missing.to_str().expect("utf8")]);
        assert!(
            output.status.success(),
            "stderr: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        let stdout = String::from_utf8_lossy(&output.stdout);
        let value: serde_json::Value =
            serde_json::from_str(stdout.trim()).expect("stdout must be JSON object");
        assert_eq!(value, serde_json::json!({}));
    }

    #[test]
    fn process_valid_dir_prints_registry_keyed_by_id() {
        ensure_bin();
        let dir = tempfile_dir("process-valid");
        fs::write(dir.join("fixture-exec.md"), valid_playbook("fixture-exec")).expect("write");

        let output = spawn_in(&dir, &["executors-list", "."]);
        assert!(
            output.status.success(),
            "stderr: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        assert!(
            output.stderr.is_empty(),
            "happy path stderr should be empty; got {:?}",
            String::from_utf8_lossy(&output.stderr)
        );
        let value: serde_json::Value = serde_json::from_slice(&output.stdout).expect("JSON stdout");
        assert!(
            value.get("fixture-exec").is_some(),
            "registry must be keyed by id; got {value}"
        );
        assert_eq!(
            value["fixture-exec"]["command"],
            serde_json::json!("fixture-exec")
        );

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn process_malformed_exits_1_empty_stdout_names_file_on_stderr() {
        ensure_bin();
        let dir = tempfile_dir("process-malformed");
        let bad = r#"# widget

## Machine block

```json
{
  "id": "widget",
  "models": ["m"],
  "worktree": "driver-made",
  "invocation": "widget -m {model} --prompt-file {prompt} --cwd {worktree}",
  "availability": "widget --version",
  "auth_smoke": { "run": "ping", "expect": "PONG" },
  "concurrency": 1
}
```
"#;
        fs::write(dir.join("widget.md"), bad).expect("write");

        let output = spawn_in(&dir, &["executors-list", "."]);
        assert_eq!(
            output.status.code(),
            Some(1),
            "malformed must exit 1; stderr={}",
            String::from_utf8_lossy(&output.stderr)
        );
        assert!(
            output.stdout.is_empty(),
            "refusal must leave stdout empty; got {:?}",
            String::from_utf8_lossy(&output.stdout)
        );
        let stderr = String::from_utf8_lossy(&output.stderr);
        assert!(
            stderr.contains("widget.md"),
            "stderr must name the file; got {stderr}"
        );

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn process_duplicate_id_exits_1_empty_stdout_names_file_on_stderr() {
        ensure_bin();
        // Flat readdir cannot host two same-stem files (stem must equal id), so
        // the duplicate-id message is asserted via parse_executors below — the
        // same string `run` feeds to `fail`. The binary's exit-1 / empty-stdout
        // arm is the same for every parse_executors Err; hit it with id≠stem.
        let dir = tempfile_dir("process-duplicate");
        fs::write(dir.join("other.md"), valid_playbook("grok")).expect("write");

        let output = spawn_in(&dir, &["executors-list", "."]);
        assert_eq!(
            output.status.code(),
            Some(1),
            "parse refusal must exit 1; stderr={}",
            String::from_utf8_lossy(&output.stderr)
        );
        assert!(
            output.stdout.is_empty(),
            "refusal must leave stdout empty; got {:?}",
            String::from_utf8_lossy(&output.stdout)
        );
        let stderr = String::from_utf8_lossy(&output.stderr);
        assert!(
            stderr.contains("other.md"),
            "stderr must name the offending file; got {stderr}"
        );

        let text = valid_playbook("grok");
        let dup_err = parse_executors(&[
            PlaybookEntry {
                file: "playbooks/grok.md",
                text: &text,
            },
            PlaybookEntry {
                file: "extra/grok.md",
                text: &text,
            },
        ])
        .unwrap_err();
        assert!(
            dup_err.contains("playbooks/grok.md") && dup_err.contains("extra/grok.md"),
            "duplicate-id must name both files; got {dup_err}"
        );

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn process_no_dir_arg_prints_compiled_in_default_registry() {
        ensure_bin();
        let output = spawn(&["executors-list"]);
        assert!(
            output.status.success(),
            "stderr: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        let value: serde_json::Value = serde_json::from_slice(&output.stdout).expect("JSON");
        assert!(
            value.get("grok").is_some(),
            "default registry must include grok; got {value}"
        );
    }

    #[test]
    fn process_version_still_works() {
        ensure_bin();
        let output = spawn(&["--version"]);
        assert!(output.status.success());
        let stdout = String::from_utf8_lossy(&output.stdout);
        assert!(
            stdout.contains(crate_version()),
            "version output should include crate version; got {stdout:?}"
        );
    }

    /// Ensure the debug binary exists so unit-test process spawns work even when
    /// cargo did not set `CARGO_BIN_EXE_*` (lib unit tests).
    fn ensure_bin() {
        let path = bin();
        if path.exists() {
            return;
        }
        // Build the binary once if missing (first process test in a clean tree).
        let status = Command::new("cargo")
            .args(["build", "-p", "the-loop", "--quiet"])
            .current_dir(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(".."))
            .status()
            .expect("cargo build must start");
        assert!(status.success(), "cargo build -p the-loop failed");
        assert!(
            bin().exists(),
            "expected binary at {} after cargo build",
            bin().display()
        );
    }
}
