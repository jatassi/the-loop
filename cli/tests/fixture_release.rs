//! Fixture-release integration tests (`cli-upgrade` feature).
//!
//! Gated behind the `upgrade` feature so the default `cargo test` invocation
//! stays free of loopback-network work; run with
//! `cargo test --package the-loop --features upgrade --test fixture_release`.
//!
//! This file self-tests the two halves of the fixture harness itself: the
//! loopback static server (`support::http_server`) and the fixture-release
//! builder (`support::fixture_release`) — the patched installer, the
//! current-platform archive, its `.sha256` sidecar, and the isolated install.
//! The `the-loop upgrade` exercise that consumes the harness lives in its own
//! test binary.
#![cfg(feature = "upgrade")]

mod support;

use std::fs;
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use support::fixture_release::{self, FixtureRelease};
use support::http_server;

static TEMP_SEQ: AtomicU64 = AtomicU64::new(0);

fn temp_dir(label: &str) -> PathBuf {
    let n = TEMP_SEQ.fetch_add(1, Ordering::Relaxed);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_nanos());
    let dir = std::env::temp_dir().join(format!(
        "the-loop-fixture-release-{label}-{}-{nanos}-{n}",
        std::process::id()
    ));
    fs::create_dir_all(&dir).expect("create temp dir");
    dir
}

#[test]
fn serves_existing_file_404s_missing_path_and_counts_both_requests() {
    let root = temp_dir("http-server-roundtrip");
    let file_bytes: &[u8] = b"loopback fixture round-trip payload\n";
    fs::write(root.join("hello.txt"), file_bytes).expect("write fixture file");

    let handle = http_server::serve(&root);
    assert_eq!(
        handle.request_count(),
        0,
        "no requests should have been served yet"
    );

    let body_file = root.join("hello.body");
    let existing = Command::new("curl")
        .args([
            "-s",
            "-D",
            "-",
            "-o",
            body_file.to_str().expect("utf8 temp path"),
            &format!("{}/hello.txt", handle.base_url()),
        ])
        .output()
        .expect("curl should run for the existing path");
    let existing_headers = String::from_utf8_lossy(&existing.stdout);
    assert!(
        existing_headers.starts_with("HTTP/1.1 200"),
        "GET of an existing path should answer 200; got headers {existing_headers:?}"
    );
    assert!(
        existing_headers
            .lines()
            .any(|line| line.eq_ignore_ascii_case(&format!(
                "content-length: {}",
                file_bytes.len()
            ))),
        "response should carry the exact Content-Length; got headers {existing_headers:?}"
    );
    let existing_body = fs::read(&body_file).expect("read fetched body");
    assert_eq!(
        existing_body, file_bytes,
        "GET of an existing path should round-trip the exact file bytes"
    );

    let missing_status = Command::new("curl")
        .args([
            "-s",
            "-o",
            "/dev/null",
            "-w",
            "%{http_code}",
            &format!("{}/missing.txt", handle.base_url()),
        ])
        .output()
        .expect("curl should run for the missing path");
    assert_eq!(
        missing_status.stdout, b"404",
        "GET of an absent path should answer 404"
    );

    assert_eq!(
        handle.request_count(),
        2,
        "request_count should reflect both requests served so far"
    );

    drop(handle);
    fs::remove_dir_all(&root).ok();
}

#[test]
fn stops_serving_when_handle_is_dropped() {
    let root = temp_dir("http-server-drop");
    let handle = http_server::serve(&root);

    let port: u16 = handle
        .base_url()
        .rsplit(':')
        .next()
        .and_then(|p| p.parse().ok())
        .expect("base_url should end in :<port>");

    assert!(
        TcpStream::connect(("127.0.0.1", port)).is_ok(),
        "the live server should accept a connection on port {port} while its handle is held"
    );

    drop(handle);

    // Assert on serving, not on rebindability. `TcpListener::bind` of the
    // just-freed ephemeral port competes with every other socket on the box —
    // sibling tests start their own servers and spawn curl clients, all drawing
    // from the same range — so EADDRINUSE there is a legitimate outcome that
    // says nothing about whether this handle leaked. Refused connections say
    // exactly what the test claims.
    let mut refused = false;
    for _ in 0..20 {
        if TcpStream::connect(("127.0.0.1", port)).is_err() {
            refused = true;
            break;
        }
        thread::sleep(Duration::from_millis(25));
    }
    assert!(
        refused,
        "port {port} should stop accepting connections once the handle is dropped"
    );

    fs::remove_dir_all(&root).ok();
}

/// The five cargo-dist archives the committed shell installer must know how to
/// select — one per target in `dist-workspace.toml`.
const EVERY_TARGET_ARCHIVE: [&str; 5] = [
    "the-loop-aarch64-apple-darwin.tar.xz",
    "the-loop-x86_64-apple-darwin.tar.xz",
    "the-loop-aarch64-unknown-linux-musl.tar.xz",
    "the-loop-x86_64-unknown-linux-musl.tar.xz",
    "the-loop-x86_64-pc-windows-msvc.zip",
];

/// Marker cargo-dist bakes into the receipt template of every installer it
/// generates; it pins the generator version the harness patches against.
const PROVIDER_MARKER: &str = r#""provider":{"source":"cargo-dist","version":"0.32.0"}"#;

#[test]
fn committed_installer_templates_are_cargo_dist_generated_and_carry_no_checksums() {
    let shell = fs::read_to_string(fixture_release::installer_template_path(
        "the-loop-installer.sh",
    ))
    .expect("the committed shell installer template should be readable");
    let powershell = fs::read_to_string(fixture_release::installer_template_path(
        "the-loop-installer.ps1",
    ))
    .expect("the committed PowerShell installer template should be readable");

    for template in [&shell, &powershell] {
        assert!(
            template.contains(PROVIDER_MARKER),
            "committed installer should be cargo-dist 0.32.0 generated output carrying {PROVIDER_MARKER}"
        );
    }

    for archive in EVERY_TARGET_ARCHIVE {
        assert!(
            shell.contains(&format!("\n        \"{archive}\")\n")),
            "committed shell installer should carry a case arm for every target archive; {archive} is missing"
        );
    }
    assert!(
        powershell.contains(r#""artifact_name" = "the-loop-x86_64-pc-windows-msvc.zip""#),
        "committed PowerShell installer should carry the Windows arm cargo-dist generates for it"
    );

    assert!(
        !shell.contains("_checksum_style=\"sha256\""),
        "the committed template must ship no checksum lines — the harness patches them in per published archive"
    );
    assert!(
        shell.contains("verify_checksum") && shell.contains("checksum mismatch"),
        "the committed shell installer should still carry the verification it performs once a checksum is patched in"
    );
    assert!(
        !powershell.to_lowercase().contains("checksum"),
        "pinned cargo-dist 0.32.0 fact: the PowerShell installer performs no checksum verification at all"
    );
}

#[test]
fn publish_writes_the_archive_its_sidecar_and_a_checksum_patched_installer() {
    let mut release = FixtureRelease::new("publish");
    let stub = release.newer_stub("9.9.9");
    release.publish(&stub, "9.9.9");

    let archive = release.archive_path().to_path_buf();
    assert_eq!(
        archive.file_name().and_then(|name| name.to_str()),
        Some(fixture_release::archive_name().as_str()),
        "the archive should be named for the current cargo-dist target"
    );
    assert_eq!(
        archive.parent(),
        Some(release.root()),
        "the archive should be published into the served fixture root"
    );

    let entries = archive_entries(&archive);
    #[cfg(unix)]
    {
        let top = format!("the-loop-{}", fixture_release::current_target_triple());
        let tops: std::collections::BTreeSet<&str> = entries
            .iter()
            .filter_map(|entry| entry.split('/').next())
            .collect();
        assert_eq!(
            tops,
            std::collections::BTreeSet::from([top.as_str()]),
            "the unix archive should hold exactly one top-level directory, matching tar --strip-components 1; got {entries:?}"
        );
        assert!(
            entries
                .iter()
                .any(|entry| entry == &format!("{top}/the-loop")),
            "the unix archive's top-level directory should contain the-loop; got {entries:?}"
        );
    }
    #[cfg(windows)]
    assert!(
        entries.iter().any(|entry| entry == "the-loop.exe"),
        "the Windows archive should be flat with the-loop.exe at its root (Expand-Archive does not strip); got {entries:?}"
    );

    let sidecar = fs::read_to_string(release.sidecar_path()).expect("sidecar should be written");
    assert_eq!(
        sidecar.trim_end(),
        format!(
            "{} *{}",
            release.published_sha256(),
            fixture_release::archive_name()
        ),
        "the sidecar should carry the `<hash> *<archive name>` form cargo-dist publishes"
    );
    assert_eq!(
        release.sidecar_path().file_name().and_then(|n| n.to_str()),
        Some(format!("{}.sha256", fixture_release::archive_name()).as_str()),
        "the sidecar should sit beside the archive as <archive>.sha256"
    );

    let installer = fs::read_to_string(release.installer_path())
        .expect("the patched installer should be written into the fixture root");
    assert!(
        installer.contains("9.9.9"),
        "the patched installer should carry the published version"
    );
    #[cfg(unix)]
    {
        assert!(
            installer.contains("APP_VERSION=\"9.9.9\""),
            "the patched shell installer's version should be rewritten to the published version"
        );
        assert!(
            installer.contains(r#""version":"9.9.9""#),
            "the patched installer's receipt template should carry the published version"
        );
        let arm = current_arm_body(&installer, &fixture_release::archive_name());
        assert!(
            arm.contains("_checksum_style=\"sha256\""),
            "the current target's arm should select sha256 verification; arm was {arm:?}"
        );
        assert!(
            arm.contains(&format!(
                "_checksum_value=\"{}\"",
                release.published_sha256()
            )),
            "the current target's arm should carry the published archive's hash; arm was {arm:?}"
        );
    }
    #[cfg(windows)]
    assert!(
        installer.contains("$app_version = '9.9.9'"),
        "the patched PowerShell installer's version should be rewritten to the published version"
    );
}

#[test]
#[should_panic(expected = "no case arm")]
fn patching_a_shell_installer_without_the_current_target_arm_panics() {
    let template = "#!/bin/sh\nAPP_VERSION=\"0.0.1\"\ncase \"$_artifact_name\" in \n        *)\n            err \"nope\"\n            ;;\nesac\n";
    let _patched = fixture_release::patch_shell_installer(
        template,
        "9.9.9",
        "the-loop-nonexistent-target.tar.xz",
        "0000000000000000000000000000000000000000000000000000000000000000",
    );
}

#[test]
fn newer_stub_prints_the_requested_version_and_exits_zero() {
    let release = FixtureRelease::new("stub");
    let stub = release.newer_stub("42.0.1");

    assert_eq!(
        stub.file_name().and_then(|name| name.to_str()),
        Some(fixture_release::binary_file_name()),
        "the stub should be named like the installed binary"
    );

    let output = Command::new(&stub)
        .arg("--version")
        .output()
        .expect("the compiled stub should run");
    assert!(
        output.status.success(),
        "the stub should exit 0 for --version; stderr was {:?}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert_eq!(
        String::from_utf8_lossy(&output.stdout).trim_end(),
        "the-loop 42.0.1",
        "the stub should print `the-loop <version>`"
    );
}

#[test]
fn install_runs_the_fixture_installer_under_an_isolated_env_it_returns() {
    let mut release = FixtureRelease::new("install-env");
    let stub = release.newer_stub("7.7.7");
    release.publish(&stub, "7.7.7");

    let run = release.install();
    assert!(
        run.output.status.success(),
        "the fixture installer should succeed; stderr was {:?}",
        String::from_utf8_lossy(&run.output.stderr)
    );
    assert!(
        release.request_count() > 0,
        "the installer should have fetched the archive from the fixture server"
    );

    let root = release.root();
    let expect = |key: &str, value: &Path| {
        assert_eq!(
            run.env.get(key).map(String::as_str),
            value.to_str(),
            "{key} should be redirected under the fixture root"
        );
    };
    assert_eq!(
        run.env.get("THE_LOOP_DOWNLOAD_URL").map(String::as_str),
        Some(release.base_url()),
        "THE_LOOP_DOWNLOAD_URL should point at the fixture server"
    );
    expect("THE_LOOP_INSTALL_DIR", &root.join("opt"));
    assert_eq!(
        run.env.get("THE_LOOP_NO_MODIFY_PATH").map(String::as_str),
        Some("1"),
        "THE_LOOP_NO_MODIFY_PATH should keep the installer off any shell profile"
    );
    expect("XDG_CONFIG_HOME", &root.join("config"));
    expect("HOME", &root.join("home"));
    expect("CARGO_HOME", &root.join("cargo"));
    #[cfg(windows)]
    expect("LOCALAPPDATA", &root.join("localappdata"));

    for key in ["HOME", "CARGO_HOME"] {
        if let Ok(real) = std::env::var(key) {
            assert_ne!(
                run.env.get(key).map(String::as_str),
                Some(real.as_str()),
                "{key} must never be the developer's real one"
            );
        }
    }

    assert_eq!(
        run.binary,
        root.join("opt")
            .join("bin")
            .join(fixture_release::binary_file_name()),
        "install should return the installed binary's path"
    );
    assert!(
        run.binary.is_file(),
        "the installer should have placed a binary at the returned path"
    );
}

#[test]
fn corrupt_archive_leaves_the_sidecar_and_the_patched_checksum_at_the_good_hash() {
    let mut release = FixtureRelease::new("corrupt");
    let stub = release.newer_stub("3.2.1");
    release.publish(&stub, "3.2.1");

    let good_bytes = fs::read(release.archive_path()).expect("read published archive");
    let good_sidecar = fs::read_to_string(release.sidecar_path()).expect("read sidecar");
    let good_installer = fs::read_to_string(release.installer_path()).expect("read installer");
    let good_hash = release.published_sha256().to_string();

    release.corrupt_archive();

    assert_ne!(
        fs::read(release.archive_path()).expect("read corrupted archive"),
        good_bytes,
        "corrupt_archive should mutate the archive's bytes"
    );
    assert_eq!(
        fs::read_to_string(release.sidecar_path()).expect("read sidecar"),
        good_sidecar,
        "corrupt_archive should leave the sidecar at the good hash"
    );
    assert_eq!(
        fs::read_to_string(release.installer_path()).expect("read installer"),
        good_installer,
        "corrupt_archive should leave the patched installer untouched"
    );
    assert!(
        good_sidecar.contains(&good_hash),
        "the sidecar should still name the good hash {good_hash}"
    );
}

#[test]
fn installing_the_published_test_binary_lands_a_receipt_and_a_runnable_binary() {
    let mut release = FixtureRelease::new("self-test");
    release.publish(Path::new(env!("CARGO_BIN_EXE_the-loop")), "9.8.7");

    let run = release.install();
    assert!(
        run.output.status.success(),
        "installing the published test binary should succeed; stderr was {:?}",
        String::from_utf8_lossy(&run.output.stderr)
    );

    let receipt_path = release.receipt_path();
    assert_eq!(
        receipt_path,
        release
            .root()
            .join("config")
            .join("the-loop")
            .join("the-loop-receipt.json"),
        "the receipt should land under the isolated XDG_CONFIG_HOME"
    );
    let receipt: serde_json::Value = serde_json::from_str(
        &fs::read_to_string(&receipt_path).expect("receipt should be written"),
    )
    .expect("receipt should be JSON");
    assert_eq!(
        receipt.get("version").and_then(serde_json::Value::as_str),
        Some("9.8.7"),
        "the receipt's version should be the published version"
    );

    let installed = Command::new(&run.binary)
        .arg("--version")
        .output()
        .expect("the installed binary should run");
    assert!(
        installed.status.success(),
        "the installed binary should run; stderr was {:?}",
        String::from_utf8_lossy(&installed.stderr)
    );
}

#[test]
fn installing_a_corrupt_archive_fails_and_names_the_checksum_mismatch_on_unix() {
    let mut release = FixtureRelease::new("self-test-corrupt");
    release.publish(Path::new(env!("CARGO_BIN_EXE_the-loop")), "9.8.7");
    release.corrupt_archive();

    let run = release.install();
    assert!(
        !run.output.status.success(),
        "installing a corrupt archive should exit nonzero; stdout was {:?}",
        String::from_utf8_lossy(&run.output.stdout)
    );
    let stderr = String::from_utf8_lossy(&run.output.stderr);
    #[cfg(unix)]
    assert!(
        stderr.contains("checksum mismatch"),
        "the shell installer should refuse with a checksum mismatch; stderr was {stderr:?}"
    );
    #[cfg(windows)]
    assert!(
        !stderr.is_empty(),
        "the PowerShell installer should name its failure on stderr"
    );
}

#[test]
fn every_fixture_root_lives_under_the_system_temp_dir_and_is_removed_on_drop() {
    let release = FixtureRelease::new("teardown");
    let root = release.root().to_path_buf();

    assert!(
        root.starts_with(std::env::temp_dir()),
        "fixture root {} should live under the system temp dir {}",
        root.display(),
        std::env::temp_dir().display()
    );
    assert!(root.is_dir(), "fixture root should exist while in use");

    drop(release);

    assert!(
        !root.exists(),
        "fixture root {} should be gone once the fixture is dropped",
        root.display()
    );
}

/// Names of the entries inside a published archive, read with the same tool
/// family the installer unpacks with.
#[cfg(unix)]
fn archive_entries(archive: &Path) -> Vec<String> {
    let output = Command::new("tar")
        .arg("-tf")
        .arg(archive)
        .output()
        .expect("tar should list the published archive");
    assert!(
        output.status.success(),
        "tar -tf failed: {:?}",
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(|line| line.trim_end_matches('/').to_string())
        .filter(|line| !line.is_empty())
        .collect()
}

#[cfg(windows)]
fn archive_entries(archive: &Path) -> Vec<String> {
    let script = format!(
        "Add-Type -AssemblyName System.IO.Compression.FileSystem; \
         [IO.Compression.ZipFile]::OpenRead('{}').Entries | ForEach-Object {{ $_.FullName }}",
        archive.display()
    );
    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", &script])
        .output()
        .expect("powershell should list the published archive");
    assert!(
        output.status.success(),
        "listing the zip failed: {:?}",
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(|line| line.trim().replace('\\', "/"))
        .filter(|line| !line.is_empty())
        .collect()
}

/// The body of the patched shell installer's case arm for `archive_name`.
#[cfg(unix)]
fn current_arm_body(installer: &str, archive_name: &str) -> String {
    let header = format!("\n        \"{archive_name}\")\n");
    let start = installer
        .find(&header)
        .expect("patched installer should keep the current target's case arm")
        + header.len();
    let end = installer[start..]
        .find("\n            ;;")
        .expect("the case arm should terminate")
        + start;
    installer[start..end].to_string()
}
