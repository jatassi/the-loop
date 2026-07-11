//! `calibration-summarize` — regenerate `docs/calibration/index.md` from the
//! `docs/calibration/runs/*.json` record corpus (this repository only).
//!
//! Thin I/O shell over [`crate::calibration::render_index`]: list JSON records
//! (an absent runs directory is zero records, not an error), parse/render, then
//! write the index and print `{written, runs}`. A single malformed record fails
//! via [`crate::io::fail`] before any index is written — mirrors
//! `calibrationSummarizeCommand` in `plugin/bin/cli-commands.js` (JSON envelope
//! instead of markdown/yaml).

use std::fs;
use std::path::Path;

use serde::Serialize;

use crate::calibration::{self, RawRecord};
use crate::io::{fail, out};

/// Success payload printed on stdout (JSON).
#[derive(Debug, Serialize, PartialEq)]
struct CalibrationSummarizeResult {
    written: String,
    runs: usize,
}

/// Run `calibration-summarize`, writing `docs/calibration/index.md` or refusing
/// via [`fail`] (stdout empty, nothing written).
pub fn run() {
    let records = match load_records() {
        Ok(r) => r,
        Err(msg) => fail(&msg),
    };
    let runs = records.len();
    let index = match calibration::render_index(&records) {
        Ok(text) => text,
        Err(msg) => fail(&msg),
    };

    let index_path = Path::new("docs/calibration/index.md");
    if let Some(parent) = index_path.parent()
        && let Err(err) = fs::create_dir_all(parent)
    {
        fail(&format!(
            "could not create directory {}: {err}",
            parent.display()
        ));
    }
    if let Err(err) = fs::write(index_path, &index) {
        fail(&format!("could not write {}: {err}", index_path.display()));
    }

    out(&CalibrationSummarizeResult {
        written: "docs/calibration/index.md".to_owned(),
        runs,
    });
}

/// Read every `docs/calibration/runs/*.json` file. Absent directory → empty vec.
fn load_records() -> Result<Vec<RawRecord>, String> {
    let runs_dir = Path::new("docs/calibration/runs");
    if !runs_dir.exists() {
        return Ok(Vec::new());
    }
    let entries = fs::read_dir(runs_dir)
        .map_err(|err| format!("could not read {}: {err}", runs_dir.display()))?;
    let mut records = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|err| format!("could not read {}: {err}", runs_dir.display()))?;
        let path = entry.path();
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if !name.ends_with(".json") {
            continue;
        }
        if !path.is_file() {
            continue;
        }
        let file = path
            .to_str()
            .ok_or_else(|| format!("non-utf8 path under {}", runs_dir.display()))?
            .to_owned();
        let text =
            fs::read_to_string(&path).map_err(|err| format!("could not read {file}: {err}"))?;
        records.push(RawRecord { file, text });
    }
    Ok(records)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::process::Command;
    use std::sync::OnceLock;
    use std::time::{SystemTime, UNIX_EPOCH};

    use serde_json::Value;

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

    const RECORD_A: &str = r#"{
  "run": {
    "prepared_at": "2026-07-01T10:00:00Z",
    "target": "main",
    "scope": ["f-a"],
    "tokens": { "spent": 100000, "by_role": { "plan": 20000, "build": 70000, "validate": 10000 }, "attribution": "serial" },
    "halted": null
  },
  "features": [
    {
      "id": "f-a", "workflow_path": "standard", "outcome": "validated",
      "reason": null, "reslice": null,
      "agents": { "plan": 1, "build": 3, "drive": 0, "validate": 1 },
      "tasks": [{ "id": "t1", "size": "s", "judgment_level": "standard", "footprint": ["a.js", "a.test.js"] }],
      "actual": { "files_touched": 3, "insertions": 50, "deletions": 5, "commits": 2, "duration_minutes": 20 }
    }
  ]
}"#;

    const RECORD_B: &str = r#"{
  "run": {
    "prepared_at": "2026-07-02T09:00:00Z",
    "target": "main",
    "scope": ["f-b"],
    "tokens": { "spent": 10000, "by_role": { "plan": 5000, "build": 5000 }, "attribution": "overlapped" },
    "halted": null
  },
  "features": [
    {
      "id": "f-b", "workflow_path": "small", "outcome": "blocked",
      "reason": "dep conflict on parser", "reslice": "t1 split into two",
      "agents": { "plan": 1, "build": 1 },
      "tasks": [{ "id": "t1", "size": "s", "judgment_level": "standard", "footprint": ["b.js"] }],
      "actual": null
    }
  ]
}"#;

    fn seed_runs(root: &Path, files: &[(&str, &str)]) {
        let runs = root.join("docs/calibration/runs");
        fs::create_dir_all(&runs).expect("mkdir runs");
        for (name, text) in files {
            fs::write(runs.join(name), text).expect("write record");
        }
    }

    #[test]
    fn process_happy_path_writes_index_and_stdout() {
        ensure_bin();
        let root = tempfile_dir("calib-sum-happy");
        seed_runs(
            &root,
            &[
                ("2026-07-01-1.json", RECORD_A),
                ("2026-07-02-1.json", RECORD_B),
            ],
        );

        let output = spawn_in(&root, &["calibration-summarize"]);
        assert!(
            output.status.success(),
            "stderr: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        let body: Value = serde_json::from_slice(&output.stdout).expect("JSON stdout");
        assert_eq!(
            body,
            serde_json::json!({"written": "docs/calibration/index.md", "runs": 2})
        );

        let index = fs::read_to_string(root.join("docs/calibration/index.md")).expect("index");
        assert!(index.contains("## Digest"));
        assert!(index.contains("## Runs"));
        assert!(index.contains("| small | 1 | 2 | — |"));
        assert!(index.contains("| standard | 1 | 5 | 20 |"));
        assert!(index.contains("1 of 2 feature(s) re-sliced (50%)."));
        assert!(index.contains("| s | 1 | 2 | 3 |"));
        assert!(index.contains("- 1× dep conflict on parser"));
        assert!(index.contains("Lifetime: 32% overhead / 68% build."));
        assert!(index.contains("Last-10 median: 40% overhead / 60% build."));
        assert!(index.contains("Attribution: 1 of 2 run(s) overlapped"));

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn process_malformed_record_exits_1_writes_nothing() {
        ensure_bin();
        let root = tempfile_dir("calib-sum-bad");
        seed_runs(
            &root,
            &[
                ("2026-07-01-1.json", RECORD_A),
                ("2026-07-02-1.json", "{ \"run\": [this is not valid\n"),
            ],
        );

        let output = spawn_in(&root, &["calibration-summarize"]);
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
            !stderr.is_empty() && stderr.contains("2026-07-02-1.json"),
            "stderr must name the malformed file; got {stderr}"
        );
        assert!(
            !root.join("docs/calibration/index.md").exists(),
            "no index is written on failure"
        );

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn process_empty_corpus_writes_empty_digest() {
        ensure_bin();
        let root = tempfile_dir("calib-sum-empty");
        // No docs/calibration/runs at all.

        let output = spawn_in(&root, &["calibration-summarize"]);
        assert!(
            output.status.success(),
            "stderr: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        let body: Value = serde_json::from_slice(&output.stdout).expect("JSON stdout");
        assert_eq!(
            body,
            serde_json::json!({"written": "docs/calibration/index.md", "runs": 0})
        );
        let index = fs::read_to_string(root.join("docs/calibration/index.md")).expect("index");
        assert!(index.contains("## Digest"));
        assert!(index.contains("## Runs"));

        let _ = fs::remove_dir_all(&root);
    }
}
