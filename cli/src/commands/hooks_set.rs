//! `hooks-set <family> <layer> <json-value>` — persist one `"the-loop".<family>`
//! entry into a named settings layer.
//!
//! Thin I/O shell over [`crate::write_settings_entry`]: validates family/layer,
//! parses the JSON value, resolves the layer file, creates parents when absent,
//! applies the surgical writer, and prints `{family, layer, file, value}`.
//! Mirrors `hooksSetCommand` / `hooksLayerPath` in `plugin/bin/hooks-commands.js`.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::Value;

use crate::io::{fail, out};
use crate::write_settings_entry;

/// Known settings-layer hook families (ADR-0049 inventory + worktreeSetup).
const HOOK_FAMILIES: &[&str] = &[
    "interview",
    "modelBindings",
    "testHarness",
    "lint",
    "precommit",
    "notification",
    "artifactStores",
    "worktreeSetup",
];

/// Writable settings layers.
const HOOK_LAYERS: &[&str] = &["user", "project", "local"];

/// Success payload printed on stdout (JSON).
#[derive(Debug, Serialize, PartialEq)]
struct HooksSetResult {
    family: String,
    layer: String,
    file: String,
    value: Value,
}

/// Run `hooks-set`, writing the family value to the layer file or refusing via [`fail`].
pub fn run(family: &str, layer: &str, json_value: &str) {
    if !HOOK_FAMILIES.contains(&family) {
        fail(&format!("unknown family: {family}"));
    }
    if !HOOK_LAYERS.contains(&layer) {
        fail(&format!("unknown layer: {layer}"));
    }

    let value: Value = match serde_json::from_str(json_value) {
        Ok(v) => v,
        Err(err) => fail(&format!("unparseable JSON value: {err}")),
    };

    let file = match layer_path(layer) {
        Ok(p) => p,
        Err(msg) => fail(&msg),
    };
    let file_display = file.to_string_lossy().into_owned();

    let existing = if file.exists() {
        match fs::read_to_string(&file) {
            Ok(text) => Some(text),
            Err(err) => fail(&format!("could not read {file_display}: {err}")),
        }
    } else {
        None
    };

    let next = match write_settings_entry(existing.as_deref(), family, &value) {
        Ok(text) => text,
        Err(err) => fail(&format!("{err} ({file_display})")),
    };

    if let Some(parent) = file.parent()
        && let Err(err) = fs::create_dir_all(parent)
    {
        fail(&format!(
            "could not create directory {}: {err}",
            parent.display()
        ));
    }
    if let Err(err) = fs::write(&file, &next) {
        fail(&format!("could not write {file_display}: {err}"));
    }

    out(&HooksSetResult {
        family: family.to_owned(),
        layer: layer.to_owned(),
        file: file_display,
        value,
    });
}

/// Resolve the settings file for a layer.
///
/// - `user` → `$HOME/.claude/settings.json` (HOME override for tests/oracle)
/// - `project` → cwd-relative `.claude/settings.json`
/// - `local` → cwd-relative `.claude/settings.local.json`
fn layer_path(layer: &str) -> Result<PathBuf, String> {
    match layer {
        "user" => {
            let home = std::env::var("HOME").map_err(|_| "HOME is not set".to_owned())?;
            Ok(PathBuf::from(home).join(".claude").join("settings.json"))
        }
        "project" => Ok(Path::new(".claude").join("settings.json")),
        "local" => Ok(Path::new(".claude").join("settings.local.json")),
        _ => Err(format!("unknown layer: {layer}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
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
        assert!(
            bin().exists(),
            "expected binary at {} after cargo build",
            bin().display()
        );
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

    fn spawn_in(cwd: &Path, args: &[&str]) -> std::process::Output {
        Command::new(bin())
            .current_dir(cwd)
            .args(args)
            .output()
            .unwrap_or_else(|err| panic!("failed to spawn the-loop: {err}"))
    }

    fn spawn_in_env(cwd: &Path, args: &[&str], home: &Path) -> std::process::Output {
        Command::new(bin())
            .current_dir(cwd)
            .env("HOME", home)
            .args(args)
            .output()
            .unwrap_or_else(|err| panic!("failed to spawn the-loop: {err}"))
    }

    #[test]
    fn layer_path_project_and_local_are_cwd_relative() {
        let project = layer_path("project").expect("project");
        assert_eq!(project, Path::new(".claude").join("settings.json"));
        let local = layer_path("local").expect("local");
        assert_eq!(local, Path::new(".claude").join("settings.local.json"));
    }

    #[test]
    fn known_families_and_layers_cover_the_eight_and_three() {
        assert_eq!(HOOK_FAMILIES.len(), 8);
        for f in [
            "interview",
            "modelBindings",
            "testHarness",
            "lint",
            "precommit",
            "notification",
            "artifactStores",
            "worktreeSetup",
        ] {
            assert!(HOOK_FAMILIES.contains(&f), "missing family {f}");
        }
        assert_eq!(HOOK_LAYERS, &["user", "project", "local"]);
    }

    #[test]
    fn process_accepts_worktree_setup_family() {
        ensure_bin();
        let root = tempfile_dir("hooks-set-worktree");
        let output = spawn_in(
            &root,
            &[
                "hooks-set",
                "worktreeSetup",
                "project",
                r#"{"command":"npm ci"}"#,
            ],
        );
        assert!(
            output.status.success(),
            "stderr: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        let body: Value = serde_json::from_slice(&output.stdout).expect("JSON stdout");
        assert_eq!(body["family"], "worktreeSetup");
        assert_eq!(body["value"], serde_json::json!({"command": "npm ci"}));
        let written = fs::read_to_string(root.join(".claude").join("settings.json"))
            .expect("settings written");
        let parsed: Value = serde_json::from_str(&written).expect("parse written");
        assert_eq!(
            parsed["the-loop"]["worktreeSetup"],
            serde_json::json!({"command": "npm ci"})
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn process_creates_project_settings_and_prints_payload() {
        ensure_bin();
        let root = tempfile_dir("hooks-set-create");
        let output = spawn_in(
            &root,
            &[
                "hooks-set",
                "testHarness",
                "project",
                r#"{"command":"npm test"}"#,
            ],
        );
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

        let body: Value = serde_json::from_slice(&output.stdout).expect("JSON stdout");
        assert_eq!(body["family"], "testHarness");
        assert_eq!(body["layer"], "project");
        assert_eq!(
            body["file"].as_str().expect("file string"),
            Path::new(".claude")
                .join("settings.json")
                .to_string_lossy()
                .as_ref()
        );
        assert_eq!(body["value"], serde_json::json!({"command": "npm test"}));

        let written = fs::read_to_string(root.join(".claude").join("settings.json"))
            .expect("settings written");
        let parsed: Value = serde_json::from_str(&written).expect("parse written");
        assert_eq!(
            parsed["the-loop"]["testHarness"],
            serde_json::json!({"command": "npm test"})
        );

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn process_writes_local_and_user_layers() {
        ensure_bin();
        let root = tempfile_dir("hooks-set-layers");
        let home = tempfile_dir("hooks-set-user-home");

        let local_out = spawn_in(
            &root,
            &[
                "hooks-set",
                "lint",
                "local",
                r#"{"command":"npm run lint"}"#,
            ],
        );
        assert!(
            local_out.status.success(),
            "stderr: {}",
            String::from_utf8_lossy(&local_out.stderr)
        );
        let local_parsed: Value = serde_json::from_str(
            &fs::read_to_string(root.join(".claude").join("settings.local.json"))
                .expect("local file"),
        )
        .expect("parse local");
        assert_eq!(
            local_parsed["the-loop"]["lint"],
            serde_json::json!({"command": "npm run lint"})
        );

        let user_out = spawn_in_env(
            &root,
            &[
                "hooks-set",
                "notification",
                "user",
                r#"{"channel":"desktop"}"#,
            ],
            &home,
        );
        assert!(
            user_out.status.success(),
            "stderr: {}",
            String::from_utf8_lossy(&user_out.stderr)
        );
        let user_parsed: Value = serde_json::from_str(
            &fs::read_to_string(home.join(".claude").join("settings.json")).expect("user file"),
        )
        .expect("parse user");
        assert_eq!(
            user_parsed["the-loop"]["notification"],
            serde_json::json!({"channel": "desktop"})
        );

        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&home);
    }

    /// Integration: unrelated keys in an on-disk settings file byte-survive the write.
    #[test]
    fn process_unrelated_keys_byte_survive_on_disk_write() {
        ensure_bin();
        // Exact substrings from the JS / oracle fixture (quirky formatting).
        let permissions = "\"permissions\": {\n    \"allow\": [\"Bash\"]\n  }";
        let env = "\"env\": {\n    \"FOO\": \"bar\"\n  }";
        let sibling =
            "\"modelBindings\": {\n      \"build\": {\n        \"model\": \"opus\"\n      }\n    }";
        let sibling_lint = "\"lint\": {\n      \"command\": \"old-lint\"\n    }";
        let existing = format!(
            "{{\n  {permissions},\n  {env},\n  \"the-loop\": {{\n    {sibling},\n    {sibling_lint}\n  }}\n}}\n"
        );

        let root = tempfile_dir("hooks-set-survive");
        let settings = root.join(".claude").join("settings.json");
        fs::create_dir_all(settings.parent().expect("parent")).expect("mkdir");
        fs::write(&settings, &existing).expect("seed settings");

        let output = spawn_in(
            &root,
            &[
                "hooks-set",
                "testHarness",
                "project",
                r#"{"command":"npm test"}"#,
            ],
        );
        assert!(
            output.status.success(),
            "stderr: {}",
            String::from_utf8_lossy(&output.stderr)
        );

        let after = fs::read_to_string(&settings).expect("read after write");
        for s in [permissions, env, sibling, sibling_lint] {
            assert!(
                after.contains(s),
                "unrelated substring must survive byte-for-byte:\n  missing: {s}\n  after:\n{after}"
            );
        }
        let parsed: Value = serde_json::from_str(&after).expect("parse after");
        assert_eq!(
            parsed["the-loop"]["testHarness"],
            serde_json::json!({"command": "npm test"})
        );
        assert_eq!(
            parsed["the-loop"]["modelBindings"],
            serde_json::json!({"build": {"model": "opus"}})
        );
        assert_eq!(
            parsed["the-loop"]["lint"],
            serde_json::json!({"command": "old-lint"})
        );
        assert_eq!(
            parsed["permissions"],
            serde_json::json!({"allow": ["Bash"]})
        );
        assert_eq!(parsed["env"], serde_json::json!({"FOO": "bar"}));

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn process_unknown_family_exits_1_writes_nothing() {
        ensure_bin();
        let root = tempfile_dir("hooks-set-bad-family");
        let settings = root.join(".claude").join("settings.json");
        fs::create_dir_all(settings.parent().expect("parent")).expect("mkdir");
        let seeded = "{\n  \"keep\": true\n}\n";
        fs::write(&settings, seeded).expect("seed");

        let output = spawn_in(&root, &["hooks-set", "notAFamily", "project", "{}"]);
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
        let stderr = String::from_utf8_lossy(&output.stderr);
        assert!(
            stderr.to_ascii_lowercase().contains("unknown family") && stderr.contains("notAFamily"),
            "stderr must name unknown family; got {stderr}"
        );
        assert_eq!(
            fs::read_to_string(&settings).expect("read"),
            seeded,
            "settings must be unwritten on refusal"
        );

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn process_unknown_layer_exits_1_writes_nothing() {
        ensure_bin();
        let root = tempfile_dir("hooks-set-bad-layer");
        let settings = root.join(".claude").join("settings.json");
        fs::create_dir_all(settings.parent().expect("parent")).expect("mkdir");
        let seeded = "{\n  \"keep\": true\n}\n";
        fs::write(&settings, seeded).expect("seed");

        let output = spawn_in(&root, &["hooks-set", "lint", "staging", "{}"]);
        assert_eq!(output.status.code(), Some(1));
        assert!(output.stdout.is_empty());
        let stderr = String::from_utf8_lossy(&output.stderr);
        assert!(
            stderr.to_ascii_lowercase().contains("unknown layer") && stderr.contains("staging"),
            "stderr must name unknown layer; got {stderr}"
        );
        assert_eq!(fs::read_to_string(&settings).expect("read"), seeded);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn process_unparseable_json_exits_1_writes_nothing() {
        ensure_bin();
        let root = tempfile_dir("hooks-set-bad-json");
        let settings = root.join(".claude").join("settings.json");
        fs::create_dir_all(settings.parent().expect("parent")).expect("mkdir");
        let seeded = "{\n  \"keep\": true\n}\n";
        fs::write(&settings, seeded).expect("seed");

        let output = spawn_in(&root, &["hooks-set", "lint", "project", "{ not json"]);
        assert_eq!(output.status.code(), Some(1));
        assert!(output.stdout.is_empty());
        let stderr = String::from_utf8_lossy(&output.stderr);
        assert!(
            stderr.to_ascii_lowercase().contains("unparseable"),
            "stderr must mention unparseable JSON; got {stderr}"
        );
        assert_eq!(fs::read_to_string(&settings).expect("read"), seeded);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn process_too_few_args_exits_1_writes_nothing() {
        ensure_bin();
        let root = tempfile_dir("hooks-set-few-args");
        let settings = root.join(".claude").join("settings.json");
        fs::create_dir_all(settings.parent().expect("parent")).expect("mkdir");
        let seeded = "{\n  \"keep\": true\n}\n";
        fs::write(&settings, seeded).expect("seed");

        let output = spawn_in(&root, &["hooks-set", "lint", "project"]);
        assert_eq!(
            output.status.code(),
            Some(1),
            "too few args must exit 1; stderr={}",
            String::from_utf8_lossy(&output.stderr)
        );
        assert!(!output.stderr.is_empty(), "refusal must write stderr");
        assert_eq!(fs::read_to_string(&settings).expect("read"), seeded);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn process_unknown_family_on_empty_tree_writes_no_settings_file() {
        ensure_bin();
        let root = tempfile_dir("hooks-set-empty-refuse");
        let settings = root.join(".claude").join("settings.json");
        assert!(!settings.exists());

        let output = spawn_in(&root, &["hooks-set", "notAFamily", "project", "{}"]);
        assert_eq!(output.status.code(), Some(1));
        assert!(!output.stderr.is_empty());
        assert!(
            !settings.exists(),
            "refusal on empty tree must not create settings file"
        );

        let _ = fs::remove_dir_all(&root);
    }
}
