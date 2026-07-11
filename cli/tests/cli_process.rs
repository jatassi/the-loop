//! Process-level checks for the `the-loop` binary (stdout-is-JSON contract).

use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

fn bin() -> Command {
    Command::new(env!("CARGO_BIN_EXE_the-loop"))
}

static TEMP_SEQ: AtomicU64 = AtomicU64::new(0);

fn temp_dir() -> PathBuf {
    let n = TEMP_SEQ.fetch_add(1, Ordering::Relaxed);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_nanos());
    let dir = std::env::temp_dir().join(format!(
        "the-loop-cli-process-{}-{}-{}",
        std::process::id(),
        nanos,
        n
    ));
    fs::create_dir_all(&dir).expect("temp dir");
    dir
}

const VALID_CANONICAL: &str = r#"{
  "design_version": 1,
  "features": [
    {
      "id": "alpha",
      "section": "fixture skeleton",
      "title": "Alpha feature",
      "status": "designed",
      "depends_on": [],
      "acceptance": [
        "alpha criterion one"
      ],
      "notes": [
        "alpha note"
      ]
    },
    {
      "id": "beta",
      "title": "Beta feature",
      "status": "proposed",
      "depends_on": [
        "alpha"
      ]
    }
  ]
}
"#;

#[test]
fn version_prints_crate_version_and_exits_zero() {
    let output = bin()
        .arg("--version")
        .output()
        .expect("failed to spawn the-loop");
    assert!(
        output.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(
        stdout.contains(env!("CARGO_PKG_VERSION")),
        "stdout should include crate version; got {stdout:?}"
    );
}

#[test]
fn unknown_subcommand_exits_nonzero_usage_on_stderr_empty_stdout() {
    let output = bin()
        .arg("not-a-real-command")
        .output()
        .expect("failed to spawn the-loop");
    assert!(
        !output.status.success(),
        "unknown subcommand must exit nonzero"
    );
    assert!(
        output.stdout.is_empty(),
        "stdout must be empty (JSON contract); got {:?}",
        String::from_utf8_lossy(&output.stdout)
    );
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        stderr.to_ascii_lowercase().contains("usage"),
        "stderr must include a usage line; got {stderr:?}"
    );
}

#[test]
fn process_check_list_set_status_against_temp_graph() {
    let dir = temp_dir();
    let graph_dir = dir.join("docs");
    fs::create_dir_all(&graph_dir).expect("docs");
    let graph_path = graph_dir.join("feature-graph.json");
    fs::write(&graph_path, VALID_CANONICAL).expect("write graph");

    // check (default path relative to cwd)
    let check = bin()
        .current_dir(&dir)
        .arg("check")
        .output()
        .expect("check");
    assert!(
        check.status.success(),
        "check stderr={} stdout={}",
        String::from_utf8_lossy(&check.stderr),
        String::from_utf8_lossy(&check.stdout)
    );
    let check_out = String::from_utf8_lossy(&check.stdout);
    assert!(
        check_out.contains("OK") && check_out.contains("2 features"),
        "got {check_out}"
    );

    // list
    let list = bin().current_dir(&dir).arg("list").output().expect("list");
    assert!(
        list.status.success(),
        "list stderr={}",
        String::from_utf8_lossy(&list.stderr)
    );
    let list_val: serde_json::Value =
        serde_json::from_slice(&list.stdout).expect("list JSON stdout");
    assert_eq!(list_val["designVersion"], 1);
    assert_eq!(list_val["features"][0]["section"], "fixture skeleton");
    assert!(
        list.stdout.ends_with(b"\n"),
        "list must end with trailing newline"
    );

    // set-status
    let set = bin()
        .current_dir(&dir)
        .args(["set-status", "alpha", "validated"])
        .output()
        .expect("set-status");
    assert!(
        set.status.success(),
        "set-status stderr={}",
        String::from_utf8_lossy(&set.stderr)
    );
    let node: serde_json::Value = serde_json::from_slice(&set.stdout).expect("set-status JSON");
    assert_eq!(node["status"], "validated");
    let written = fs::read_to_string(&graph_path).expect("rewritten");
    assert!(written.contains("\"status\": \"validated\""));

    // missing graph refusal
    let empty = temp_dir();
    let miss = bin()
        .current_dir(&empty)
        .arg("list")
        .output()
        .expect("list missing");
    assert_eq!(miss.status.code(), Some(1));
    assert!(miss.stdout.is_empty());
    assert!(!miss.stderr.is_empty());

    let _ = fs::remove_dir_all(&dir);
    let _ = fs::remove_dir_all(&empty);
}
