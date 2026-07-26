//! End-to-end `the-loop upgrade` exercise against a live fixture release.
//!
//! Gated behind the `upgrade` feature so the default `cargo test` invocation
//! stays free of loopback-network work; run with
//! `cargo test --package the-loop --features upgrade --test upgrade_fixture`.
//!
//! Every case here drives the real installed binary — never a mock, never a
//! test-only flag. `support::fixture_release` builds a live fixture release
//! (a patched installer, a current-platform archive, its `.sha256` sidecar,
//! served over `support::http_server`'s loopback) and installs an older build
//! through it; each test then shells out to `<installed path> upgrade` under
//! the exact isolation environment the fixture installer ran under, and reads
//! back its exit status, stdout, stderr and the binary left on disk.
#![cfg(feature = "upgrade")]

mod support;

use std::path::{Path, PathBuf};
use std::process::Command;

use support::fixture_release::{FixtureRelease, InstallRun};

/// The version published as the "older" installed build in every case here.
/// Arbitrary and distinct from both the crate's real version and every
/// fixture "newer" version used below, so a mixed-up `from`/`to` shows up as
/// a wrong string rather than an accidental pass.
const OLDER_VERSION: &str = "1.0.0-fixture-older";

/// Install the compiled `the-loop` test binary as [`OLDER_VERSION`] through a
/// fresh [`FixtureRelease`] and return it installed, plus the run that
/// installed it (its returned path and isolation env are what every
/// `upgrade` invocation below reuses).
fn install_older_build(label: &str) -> (FixtureRelease, InstallRun) {
    let mut release = FixtureRelease::new(label);
    release.publish(Path::new(env!("CARGO_BIN_EXE_the-loop")), OLDER_VERSION);

    let run = release.install();
    assert!(
        run.output.status.success(),
        "fixture installer should install the older build; stderr was {:?}",
        String::from_utf8_lossy(&run.output.stderr)
    );
    assert!(
        run.binary.is_file(),
        "the older build should be installed at {}",
        run.binary.display()
    );

    (release, run)
}

/// Run `<installed path> upgrade` under `env`, capturing its output.
fn run_upgrade(
    binary: &Path,
    env: &std::collections::BTreeMap<String, String>,
) -> std::process::Output {
    Command::new(binary)
        .arg("upgrade")
        .envs(env)
        .output()
        .unwrap_or_else(|err| panic!("run {} upgrade: {err}", binary.display()))
}

/// `<binary>.old` — where the Windows leg renames the running binary aside.
/// Nothing may ever be left there once `upgrade` has exited.
fn aside_path(binary: &Path) -> PathBuf {
    let mut path = binary.as_os_str().to_os_string();
    path.push(".old");
    PathBuf::from(path)
}

/// `--version` output of `binary`, trimmed.
fn version_of(binary: &Path) -> String {
    let output = Command::new(binary)
        .arg("--version")
        .output()
        .unwrap_or_else(|err| panic!("run {} --version: {err}", binary.display()));
    assert!(
        output.status.success(),
        "{} --version should exit 0; stderr was {:?}",
        binary.display(),
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8_lossy(&output.stdout).trim().to_string()
}

#[test]
fn happy_swap_replaces_the_installed_binary_and_reports_from_to_updated() {
    let (mut release, run) = install_older_build("upgrade-happy");
    let installed_path = run.binary;
    let env = run.env;

    let newer = release.newer_stub("99.0.0");
    release.publish(&newer, "99.0.0");

    let output = run_upgrade(&installed_path, &env);
    assert!(
        output.status.success(),
        "upgrade should exit 0 on a happy swap; stderr was {:?}",
        String::from_utf8_lossy(&output.stderr)
    );

    let stdout = String::from_utf8_lossy(&output.stdout);
    let payload: serde_json::Value = serde_json::from_str(&stdout).unwrap_or_else(|err| {
        panic!("upgrade stdout should be JSON: {err}; stdout was {stdout:?}")
    });
    assert_eq!(
        payload.get("from").and_then(serde_json::Value::as_str),
        Some(OLDER_VERSION),
        "`from` should name the previously installed version; payload was {payload}"
    );
    assert_eq!(
        payload.get("to").and_then(serde_json::Value::as_str),
        Some("99.0.0"),
        "`to` should name the newly installed version; payload was {payload}"
    );
    assert_eq!(
        payload.get("updated").and_then(serde_json::Value::as_bool),
        Some(true),
        "`updated` should be true when the version actually changed; payload was {payload}"
    );

    assert!(
        version_of(&installed_path).contains("99.0.0"),
        "the installed binary should now report the fixture's newer version"
    );
}

#[test]
fn corrupt_archive_leaves_the_older_binary_in_place_and_names_the_failure_on_stderr() {
    let (mut release, run) = install_older_build("upgrade-corrupt");
    let installed_path = run.binary;
    let env = run.env;
    // The installed binary's own `--version` output is fixed at compile time
    // (the real crate version), independent of the fixture-release label the
    // receipt records — capture it before the swap attempt so "still reports
    // the older version" means "unchanged by the failed upgrade", not a
    // literal match against the fixture's receipt version string.
    let version_before = version_of(&installed_path);

    let newer = release.newer_stub("50.0.0");
    release.publish(&newer, "50.0.0");
    release.corrupt_archive();

    let output = run_upgrade(&installed_path, &env);
    assert!(
        !output.status.success(),
        "upgrade should exit nonzero against a corrupt archive; stdout was {:?}",
        String::from_utf8_lossy(&output.stdout)
    );

    assert!(
        installed_path.is_file(),
        "the previously installed binary should still be at {}",
        installed_path.display()
    );
    assert_eq!(
        version_of(&installed_path),
        version_before,
        "the previously installed binary should still run and still report the older version"
    );

    let aside = aside_path(&installed_path);
    assert!(
        !aside.exists(),
        "a refused upgrade should leave no renamed-aside orphan at {}",
        aside.display()
    );

    // One contract on both platforms: `upgrade` verifies the archive against
    // its published sidecar itself, so the refusal reads the same whether or
    // not the platform's generated installer also verifies (the PowerShell one
    // does not).
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        stderr.contains("checksum mismatch"),
        "stderr should name the checksum-verification failure; stderr was {stderr:?}"
    );
}

#[test]
fn missing_receipt_refuses_before_fetching_or_swapping_anything() {
    let (release, run) = install_older_build("upgrade-missing-receipt");
    let installed_path = run.binary;

    let requests_before = release.request_count();

    let empty_config = std::env::temp_dir().join(format!(
        "the-loop-upgrade-missing-receipt-config-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |d| d.as_nanos())
    ));
    std::fs::create_dir_all(&empty_config).expect("create empty XDG_CONFIG_HOME dir");

    let mut env = run.env;
    env.insert(
        "XDG_CONFIG_HOME".to_string(),
        empty_config
            .to_str()
            .expect("temp path should be utf-8")
            .to_string(),
    );

    let output = run_upgrade(&installed_path, &env);
    assert!(
        !output.status.success(),
        "upgrade should exit nonzero with no install receipt present; stdout was {:?}",
        String::from_utf8_lossy(&output.stdout)
    );
    assert!(
        output.stdout.is_empty(),
        "stdout should stay empty on refusal; got {:?}",
        String::from_utf8_lossy(&output.stdout)
    );

    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        stderr.contains("install the latest release manually")
            && (stderr.contains("curl") || stderr.contains("irm")),
        "stderr should carry the manual-install one-liner; stderr was {stderr:?}"
    );

    assert_eq!(
        release.request_count(),
        requests_before,
        "no request should have reached the fixture server: nothing was fetched"
    );

    std::fs::remove_dir_all(&empty_config).ok();
}
