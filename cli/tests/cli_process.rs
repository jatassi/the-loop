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

/// The manual-install remedy every `upgrade` refusal names, verbatim (unix).
#[cfg(all(not(feature = "upgrade"), not(windows)))]
const INSTALL_ONE_LINER: &str = "curl -LsSf https://github.com/jatassi/the-loop/releases/latest/download/the-loop-installer.sh | sh";
/// The manual-install remedy every `upgrade` refusal names, verbatim (Windows).
#[cfg(all(not(feature = "upgrade"), windows))]
const INSTALL_ONE_LINER: &str = r#"powershell -c "irm https://github.com/jatassi/the-loop/releases/latest/download/the-loop-installer.ps1 | iex""#;

/// Criterion 3: a build without the `upgrade` feature still parses the
/// subcommand, then refuses — nonzero, stdout empty, remedy named on stderr.
#[cfg(not(feature = "upgrade"))]
#[test]
fn upgrade_without_the_feature_refuses_naming_the_install_one_liner() {
    let output = bin()
        .arg("upgrade")
        .output()
        .expect("spawn the-loop upgrade");
    assert!(
        !output.status.success(),
        "a feature-less build must exit nonzero"
    );
    assert!(
        output.stdout.is_empty(),
        "stdout must stay empty; got {:?}",
        String::from_utf8_lossy(&output.stdout)
    );
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        stderr.contains(INSTALL_ONE_LINER),
        "stderr must name the platform install one-liner; got {stderr:?}"
    );
}

/// The feature-on command body, exercised against a `file://` "release": an
/// isolated copy of the built binary plus a hand-written installer script served
/// through the one real seam, `THE_LOOP_DOWNLOAD_URL`.
#[cfg(all(feature = "upgrade", unix))]
mod upgrade_with_feature {
    use std::fs;
    use std::os::unix::fs::PermissionsExt;
    use std::path::{Path, PathBuf};
    use std::process::Command;

    use super::temp_dir;

    /// The manual-install remedy every `upgrade` refusal names, verbatim.
    const INSTALL_ONE_LINER: &str = "curl -LsSf https://github.com/jatassi/the-loop/releases/latest/download/the-loop-installer.sh | sh";

    /// The five archive names a real release publishes — one per target in
    /// `dist-workspace.toml`. The fixture publishes all of them so it never has
    /// to restate `upgrade`'s own platform→archive mapping: whichever one this
    /// host asks for is there.
    const EVERY_TARGET_ARCHIVE: [&str; 5] = [
        "the-loop-aarch64-apple-darwin.tar.xz",
        "the-loop-x86_64-apple-darwin.tar.xz",
        "the-loop-aarch64-unknown-linux-musl.tar.xz",
        "the-loop-x86_64-unknown-linux-musl.tar.xz",
        "the-loop-x86_64-pc-windows-msvc.zip",
    ];

    /// Bytes every fixture archive carries, and their sha256 — the published
    /// FIPS 180-4 vector for `"abc"`, so the sidecar's hash is independent of
    /// anything this crate computes.
    const ARCHIVE_BYTES: &[u8] = b"abc";
    const ARCHIVE_SHA256: &str = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

    /// An isolated install root: `opt/` holds the running binary, `dl/` is the
    /// download directory reached over `file://`, `config/` holds the receipt.
    struct Fixture {
        root: PathBuf,
        exe: PathBuf,
    }

    fn write_executable(path: &Path, body: &str) {
        fs::write(path, body).expect("write script");
        fs::set_permissions(path, fs::Permissions::from_mode(0o755)).expect("chmod");
    }

    impl Fixture {
        /// Copy the built binary into an isolated `opt/` so the installer under
        /// test may replace it without touching `target/`.
        fn new() -> Self {
            let root = temp_dir();
            for sub in ["opt", "dl", "config", "home"] {
                fs::create_dir_all(root.join(sub)).expect("fixture subdir");
            }
            let exe = root.join("opt").join("the-loop");
            fs::copy(env!("CARGO_BIN_EXE_the-loop"), &exe).expect("copy built binary");
            Self { root, exe }
        }

        fn write_receipt(&self, body: &str) {
            let dir = self.root.join("config").join("the-loop");
            fs::create_dir_all(&dir).expect("receipt dir");
            fs::write(dir.join("the-loop-receipt.json"), body).expect("write receipt");
        }

        /// Place the installer the command will fetch over `file://`.
        fn write_installer(&self, body: &str) {
            write_executable(&self.root.join("dl").join("the-loop-installer.sh"), body);
        }

        /// Publish `bytes` under every released archive name, each beside a
        /// `<archive>.sha256` sidecar claiming `sidecar_hash` — a sound release
        /// when the two agree, a corrupt one when they do not.
        fn publish_archives(&self, bytes: &[u8], sidecar_hash: &str) {
            let dl = self.root.join("dl");
            for archive in EVERY_TARGET_ARCHIVE {
                fs::write(dl.join(archive), bytes).expect("write fixture archive");
                fs::write(
                    dl.join(format!("{archive}.sha256")),
                    format!("{sidecar_hash} *{archive}\n"),
                )
                .expect("write fixture sidecar");
            }
        }

        /// `<exe> upgrade` with HOME, the receipt dir, and the download base all
        /// redirected under the fixture root.
        fn upgrade(&self) -> Command {
            let mut cmd = Command::new(&self.exe);
            cmd.arg("upgrade")
                .env("HOME", self.root.join("home"))
                .env("XDG_CONFIG_HOME", self.root.join("config"))
                .env_remove("LOCALAPPDATA")
                .env("THE_LOOP_INSTALL_DIR", self.root.join("opt"))
                .env(
                    "THE_LOOP_DOWNLOAD_URL",
                    format!("file://{}", self.root.join("dl").display()),
                );
            cmd
        }

        /// The path the Windows leg would rename aside; must never be orphaned.
        fn aside(&self) -> PathBuf {
            self.root.join("opt").join("the-loop.old")
        }

        /// True when a working binary is present at the captured path.
        fn exe_runs(&self) -> bool {
            Command::new(&self.exe)
                .arg("--version")
                .output()
                .is_ok_and(|out| out.status.success())
        }

        fn cleanup(self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    /// Criterion 4: no receipt, and an unusable receipt, both refuse with the
    /// manual-install remedy — and the download is never attempted (a `curl`
    /// shim earlier on PATH would leave a marker if it ran).
    #[test]
    fn missing_or_unparseable_receipt_refuses_before_any_download() {
        let fixture = Fixture::new();
        fixture.write_installer("#!/bin/sh\necho should-never-run\n");

        let shim_dir = fixture.root.join("shim");
        fs::create_dir_all(&shim_dir).expect("shim dir");
        let marker = fixture.root.join("curl-was-called");
        write_executable(
            &shim_dir.join("curl"),
            &format!("#!/bin/sh\n: > '{}'\nexit 1\n", marker.display()),
        );
        let shimmed_path = format!(
            "{}:{}",
            shim_dir.display(),
            std::env::var("PATH").unwrap_or_default()
        );

        for receipt in [None, Some("{ not json")] {
            if let Some(body) = receipt {
                fixture.write_receipt(body);
            }
            let output = fixture
                .upgrade()
                .env("PATH", &shimmed_path)
                .output()
                .expect("spawn upgrade");
            let stderr = String::from_utf8_lossy(&output.stderr);
            assert!(
                !output.status.success(),
                "receipt {receipt:?} must refuse; stderr {stderr:?}"
            );
            assert!(
                output.stdout.is_empty(),
                "stdout must stay empty; got {:?}",
                String::from_utf8_lossy(&output.stdout)
            );
            assert!(
                stderr.contains(INSTALL_ONE_LINER),
                "receipt {receipt:?}: stderr must name the install one-liner; got {stderr:?}"
            );
            assert!(
                !marker.exists(),
                "receipt {receipt:?}: no download may be attempted before the receipt check"
            );
            assert!(
                !fixture.aside().exists(),
                "receipt {receipt:?}: nothing may be renamed aside"
            );
            assert!(
                fixture.exe_runs(),
                "receipt {receipt:?}: the installed binary must be left untouched"
            );
        }

        fixture.cleanup();
    }

    /// Criterion 5: the happy path fetches the installer from the download base,
    /// runs it, post-checks the binary at the captured path, and prints exactly
    /// `{from, to, updated}` — with the installer's own stdout on stderr.
    #[test]
    fn happy_path_swaps_the_binary_and_prints_from_to_updated() {
        let fixture = Fixture::new();
        fixture.write_receipt(r#"{"version":"0.0.1","binaries":["the-loop"]}"#);
        fixture.publish_archives(ARCHIVE_BYTES, ARCHIVE_SHA256);
        // Stands in for the release installer: unlink-then-write is how a real
        // installer replaces a running binary on unix.
        fixture.write_installer(concat!(
            "#!/bin/sh\n",
            "echo \"fixture-installer: installing to $THE_LOOP_INSTALL_DIR\"\n",
            "dest=\"$THE_LOOP_INSTALL_DIR/the-loop\"\n",
            "rm -f \"$dest\"\n",
            "printf '#!/bin/sh\\necho \"the-loop 9.9.9\"\\n' > \"$dest\"\n",
            "chmod +x \"$dest\"\n",
        ));

        let output = fixture.upgrade().output().expect("spawn upgrade");
        let stderr = String::from_utf8_lossy(&output.stderr);
        assert!(
            output.status.success(),
            "upgrade must succeed; stderr {stderr:?}"
        );

        let payload: serde_json::Value =
            serde_json::from_slice(&output.stdout).expect("stdout must be JSON only");
        let object = payload.as_object().expect("payload must be an object");
        let mut keys: Vec<&str> = object.keys().map(String::as_str).collect();
        keys.sort_unstable();
        assert_eq!(
            keys,
            ["from", "to", "updated"],
            "payload keys must be exact"
        );
        assert_eq!(payload["from"], "0.0.1", "from is the pre-install receipt");
        assert_eq!(payload["to"], "9.9.9", "to is the post-check version token");
        assert_eq!(payload["updated"], true);

        assert!(
            stderr.contains("fixture-installer: installing to"),
            "the installer's stdout must be forwarded to stderr; got {stderr:?}"
        );
        assert!(
            !fixture.aside().exists() || fixture.exe.exists(),
            "a renamed-aside exe must never be left without a binary at the captured path"
        );

        fixture.cleanup();
    }

    /// Criterion 6: a failing installer exits nonzero naming the step and the
    /// tail of the installer's output, leaves the installed binary runnable, and
    /// keeps stdout empty.
    #[test]
    fn failing_installer_names_the_step_and_leaves_the_binary_runnable() {
        let fixture = Fixture::new();
        fixture.write_receipt(r#"{"version":"0.0.1","binaries":["the-loop"]}"#);
        fixture.publish_archives(ARCHIVE_BYTES, ARCHIVE_SHA256);
        fixture.write_installer(concat!(
            "#!/bin/sh\n",
            "echo 'fixture-installer: the archive would not unpack'\n",
            "exit 1\n",
        ));

        let output = fixture.upgrade().output().expect("spawn upgrade");
        assert!(
            !output.status.success(),
            "a failing installer must exit nonzero"
        );
        assert!(
            output.stdout.is_empty(),
            "stdout must stay empty; got {:?}",
            String::from_utf8_lossy(&output.stdout)
        );
        let stderr = String::from_utf8_lossy(&output.stderr);
        assert!(
            stderr.contains("run-installer"),
            "stderr must name the failing step; got {stderr:?}"
        );
        assert!(
            stderr.contains("the archive would not unpack"),
            "stderr must carry the installer's own output tail; got {stderr:?}"
        );
        assert!(
            !fixture.aside().exists(),
            "the rename-aside must be restored, never orphaned"
        );
        assert!(
            fixture.exe_runs(),
            "the previously installed binary must still run"
        );

        fixture.cleanup();
    }

    /// The archive is verified against its published sidecar *before* any step
    /// that could displace the installed binary: the installer — the step that
    /// would unpack over it, and on Windows the step the rename-aside clears the
    /// way for — never runs at all when the two disagree.
    #[test]
    fn corrupt_archive_is_refused_before_the_installer_is_ever_run() {
        let fixture = Fixture::new();
        fixture.write_receipt(r#"{"version":"0.0.1","binaries":["the-loop"]}"#);
        // Sidecar keeps the good hash; the archive bytes do not match it.
        fixture.publish_archives(b"corrupted archive bytes", ARCHIVE_SHA256);

        let ran = fixture.root.join("installer-was-run");
        fixture.write_installer(&format!(
            "#!/bin/sh\n: > '{}'\necho 'fixture-installer: unpacked'\n",
            ran.display()
        ));

        let output = fixture.upgrade().output().expect("spawn upgrade");
        let stderr = String::from_utf8_lossy(&output.stderr);
        assert!(
            !output.status.success(),
            "a corrupt archive must exit nonzero; stderr {stderr:?}"
        );
        assert!(
            output.stdout.is_empty(),
            "stdout must stay empty; got {:?}",
            String::from_utf8_lossy(&output.stdout)
        );
        assert!(
            stderr.contains("checksum mismatch"),
            "stderr must name the checksum failure; got {stderr:?}"
        );
        assert!(
            !ran.exists(),
            "the installer must never run against an archive that failed verification"
        );
        assert!(
            !fixture.aside().exists(),
            "nothing may be renamed aside before verification has passed"
        );
        assert!(
            fixture.exe_runs(),
            "the previously installed binary must still run"
        );

        fixture.cleanup();
    }

    /// Criterion 6: an unreachable download base fails at the download step with
    /// no swap and no orphaned aside.
    #[test]
    fn unreachable_download_base_fails_at_the_download_step() {
        let fixture = Fixture::new();
        fixture.write_receipt(r#"{"version":"0.0.1","binaries":["the-loop"]}"#);
        // No installer written: the `file://` fetch has nothing to fetch.

        let output = fixture.upgrade().output().expect("spawn upgrade");
        assert!(!output.status.success(), "a failed fetch must exit nonzero");
        assert!(output.stdout.is_empty(), "stdout must stay empty");
        let stderr = String::from_utf8_lossy(&output.stderr);
        assert!(
            stderr.contains("download-installer"),
            "stderr must name the failing step; got {stderr:?}"
        );
        assert!(!fixture.aside().exists(), "nothing may be renamed aside");
        assert!(fixture.exe_runs(), "the installed binary must still run");

        fixture.cleanup();
    }
}
