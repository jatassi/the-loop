//! Process-level checks for the `the-loop` binary (stdout-is-JSON contract).

use std::process::Command;

fn bin() -> Command {
    Command::new(env!("CARGO_BIN_EXE_the-loop"))
}

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
