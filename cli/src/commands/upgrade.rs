//! `upgrade` — replace this binary with the latest release.
//!
//! Deliberately thin: it owns no download-verification and no install-layout
//! logic. It reads the install receipt, fetches the release's own generated
//! installer, runs it, and post-checks the binary at the path this process was
//! launched from. Archive integrity and layout belong to the installer.
//!
//! The body is behind the default-off `upgrade` cargo feature, so an ordinary
//! `cargo build` produces a binary that parses the subcommand and refuses with
//! the manual-install one-liner. Release builds turn the feature on.
//!
//! stdout stays JSON-only: the installer's own output is forwarded to stderr, and
//! every refusal goes through [`crate::io::fail`].

/// Manual-install remedy named by every refusal (unix).
#[cfg(not(windows))]
const INSTALL_ONE_LINER: &str = "curl -LsSf https://github.com/jatassi/the-loop/releases/latest/download/the-loop-installer.sh | sh";

/// Manual-install remedy named by every refusal (Windows).
#[cfg(windows)]
const INSTALL_ONE_LINER: &str = r#"powershell -c "irm https://github.com/jatassi/the-loop/releases/latest/download/the-loop-installer.ps1 | iex""#;

/// `upgrade` — self-replace, or refuse and name the manual remedy.
///
/// Success prints `{from, to, updated}` via [`crate::io::out`]; every failure
/// exits 1 via [`crate::io::fail`] with stdout left empty.
pub fn run() {
    #[cfg(not(feature = "upgrade"))]
    crate::io::fail(&format!(
        "upgrade is not compiled into this build — install the latest release manually: {INSTALL_ONE_LINER}"
    ));
    #[cfg(feature = "upgrade")]
    enabled::run();
}

/// The real body, compiled only under the `upgrade` feature.
#[cfg(feature = "upgrade")]
mod enabled {
    use std::io::Write;
    use std::path::{Path, PathBuf};
    use std::process::{Command, Stdio};
    use std::time::{SystemTime, UNIX_EPOCH};
    use std::{env, fs, process};

    use serde::Serialize;

    use super::INSTALL_ONE_LINER;
    use crate::io::{fail, out};
    use crate::receipt;

    /// Release download directory used when the override variable is unset.
    const DEFAULT_DOWNLOAD_BASE: &str =
        "https://github.com/jatassi/the-loop/releases/latest/download";

    /// Installer file name inside the download directory (unix).
    #[cfg(not(windows))]
    const INSTALLER_FILENAME: &str = "the-loop-installer.sh";

    /// Installer file name inside the download directory (Windows).
    #[cfg(windows)]
    const INSTALLER_FILENAME: &str = "the-loop-installer.ps1";

    /// The download-base override both generated installers already honor.
    const DOWNLOAD_URL_VAR: &str = "THE_LOOP_DOWNLOAD_URL";

    /// Max characters of a child's own output quoted into a failure message.
    const OUTPUT_TAIL_CHARS: usize = 2000;

    /// Success payload — exactly these three keys.
    #[derive(Debug, Serialize)]
    struct UpgradeResult {
        from: String,
        to: String,
        updated: bool,
    }

    /// What a shelled-out step wrote; `stdout` is kept apart so the post-check
    /// can parse a version token out of it.
    struct StepOutput {
        stdout: String,
        combined: String,
    }

    /// Why a shelled-out step failed, plus everything that child wrote.
    struct StepFailure {
        reason: String,
        combined: String,
    }

    /// Steps in order: locate this binary, sweep a stale aside, read the receipt,
    /// download the installer, rename aside (Windows), run the installer,
    /// post-check, report.
    pub fn run() {
        // Captured exactly once. Every later step uses this path — never one
        // recomputed from the receipt, which describes a layout `upgrade` does
        // not own.
        let exe = match env::current_exe() {
            Ok(path) => path,
            Err(err) => fail(&format!("upgrade failed at locate-running-binary: {err}")),
        };

        sweep_stale_aside(&exe);

        let installed_version = match receipt::load() {
            Ok(receipt) => receipt.version,
            Err(err) => fail(&format!(
                "{err} — this binary was not installed by a release installer, so upgrade has no installer to re-run; install the latest release manually: {INSTALL_ONE_LINER}"
            )),
        };

        let work = match make_work_dir() {
            Ok(dir) => dir,
            Err(err) => fail(&format!("upgrade failed at create-work-dir: {err}")),
        };

        let base = download_base();
        let installer = work.join(INSTALLER_FILENAME);
        if let Err(failure) = download(&format!("{base}/{INSTALLER_FILENAME}"), &installer) {
            abort(&work, &exe, None, "download-installer", &failure);
        }

        let aside = rename_aside(&exe, &work);

        match run_installer(&installer, &base) {
            Ok(output) => forward(&output.combined),
            Err(failure) => {
                forward(&failure.combined);
                abort(&work, &exe, aside.as_deref(), "run-installer", &failure);
            }
        }

        let checked = match post_check(&exe) {
            Ok(output) => output,
            Err(failure) => abort(&work, &exe, aside.as_deref(), "post-check", &failure),
        };
        let Some(new_version) = version_token(&checked.stdout) else {
            let failure = StepFailure {
                reason: format!("no version token in `{} --version` output", exe.display()),
                combined: checked.combined,
            };
            abort(&work, &exe, aside.as_deref(), "post-check", &failure);
        };

        let updated = installed_version != new_version;
        let _ = fs::remove_dir_all(&work);
        out(&UpgradeResult {
            from: installed_version,
            to: new_version.to_owned(),
            updated,
        });
    }

    /// Exit 1 naming the failing step and the tail of that step's own output,
    /// after putting any renamed-aside binary back and removing the work dir.
    fn abort(
        work: &Path,
        exe: &Path,
        aside: Option<&Path>,
        step: &str,
        failure: &StepFailure,
    ) -> ! {
        restore_aside(exe, aside);
        let _ = fs::remove_dir_all(work);
        let tail = tail_chars(&failure.combined, OUTPUT_TAIL_CHARS);
        if tail.trim().is_empty() {
            fail(&format!("upgrade failed at {step}: {}", failure.reason));
        }
        fail(&format!(
            "upgrade failed at {step}: {}\n{tail}",
            failure.reason
        ));
    }

    /// Never leave a renamed-aside binary without one at the captured path.
    fn restore_aside(exe: &Path, aside: Option<&Path>) {
        let Some(saved) = aside else { return };
        if !exe.exists() && saved.exists() {
            let _ = fs::rename(saved, exe);
        }
    }

    /// A successful Windows swap leaves `<exe>.old` behind — the old image is
    /// still mapped by this very process — so the next run sweeps it.
    #[cfg(windows)]
    fn sweep_stale_aside(exe: &Path) {
        let _ = fs::remove_file(aside_path(exe));
    }

    /// Unix never renames aside, so there is never a stale one to sweep.
    #[cfg(not(windows))]
    const fn sweep_stale_aside(_exe: &Path) {}

    /// Windows can rename a mapped image but cannot overwrite one, so move the
    /// running binary out of the installer's way. A failure here has renamed
    /// nothing, so it aborts directly.
    #[cfg(windows)]
    fn rename_aside(exe: &Path, work: &Path) -> Option<PathBuf> {
        let aside = aside_path(exe);
        if let Err(err) = fs::rename(exe, &aside) {
            let _ = fs::remove_dir_all(work);
            fail(&format!("upgrade failed at rename-aside: {err}"));
        }
        Some(aside)
    }

    /// Unix installers replace a running binary by unlink-then-create, which is
    /// safe while it runs — nothing to move.
    #[cfg(not(windows))]
    const fn rename_aside(_exe: &Path, _work: &Path) -> Option<PathBuf> {
        None
    }

    /// `<exe>.old`, beside the binary itself.
    #[cfg(windows)]
    fn aside_path(exe: &Path) -> PathBuf {
        let mut path = exe.as_os_str().to_os_string();
        path.push(".old");
        PathBuf::from(path)
    }

    /// Scratch directory for the downloaded installer; removed on every exit path.
    fn make_work_dir() -> std::io::Result<PathBuf> {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |elapsed| elapsed.as_nanos());
        let dir = env::temp_dir().join(format!("the-loop-upgrade-{}-{nanos}", process::id()));
        fs::create_dir_all(&dir)?;
        Ok(dir)
    }

    /// The override download base, trailing slash trimmed, when it is set.
    fn env_download_base() -> Option<String> {
        let value = env::var(DOWNLOAD_URL_VAR).ok()?;
        let trimmed = value.trim().trim_end_matches('/');
        if trimmed.is_empty() {
            return None;
        }
        Some(trimmed.to_owned())
    }

    /// Where both the installer and (through the installer) the archive come from.
    fn download_base() -> String {
        env_download_base().unwrap_or_else(|| DEFAULT_DOWNLOAD_BASE.to_owned())
    }

    /// Fetch the installer with the same tool the documented one-liner requires.
    #[cfg(not(windows))]
    fn download(url: &str, dest: &Path) -> Result<StepOutput, StepFailure> {
        run_capture(
            Command::new("curl")
                .arg("-LsSf")
                .arg(url)
                .arg("-o")
                .arg(dest),
        )
    }

    /// Fetch the installer with the same tool the documented one-liner requires.
    #[cfg(windows)]
    fn download(url: &str, dest: &Path) -> Result<StepOutput, StepFailure> {
        run_capture(
            Command::new("powershell")
                .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command"])
                .arg(format!(
                    "Invoke-WebRequest -Uri '{url}' -OutFile '{}'",
                    dest.display()
                )),
        )
    }

    /// Run the downloaded installer, passing the download-base override through so
    /// the installer takes its archive from wherever it came from itself.
    fn run_installer(installer: &Path, base: &str) -> Result<StepOutput, StepFailure> {
        let mut command = installer_command(installer);
        if env_download_base().is_some() {
            command.env(DOWNLOAD_URL_VAR, base);
        }
        run_capture(&mut command)
    }

    /// `sh <installer>` — the shell installer is a POSIX script.
    #[cfg(not(windows))]
    fn installer_command(installer: &Path) -> Command {
        let mut command = Command::new("sh");
        command.arg(installer);
        command
    }

    /// `powershell -File <installer>` — the generated installer is a `.ps1`.
    #[cfg(windows)]
    fn installer_command(installer: &Path) -> Command {
        let mut command = Command::new("powershell");
        command
            .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"])
            .arg(installer);
        command
    }

    /// The freshly installed binary must run at the captured path before success
    /// is reported.
    fn post_check(exe: &Path) -> Result<StepOutput, StepFailure> {
        run_capture(Command::new(exe).arg("--version"))
    }

    /// Spawn a child with stdin closed, capturing both of its streams.
    fn run_capture(command: &mut Command) -> Result<StepOutput, StepFailure> {
        let output = match command.stdin(Stdio::null()).output() {
            Ok(output) => output,
            Err(err) => {
                return Err(StepFailure {
                    reason: format!("could not run {}: {err}", command.get_program().display()),
                    combined: String::new(),
                });
            }
        };
        let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
        let stderr = String::from_utf8_lossy(&output.stderr);
        let combined = format!("{stdout}{stderr}");
        if output.status.success() {
            return Ok(StepOutput { stdout, combined });
        }
        let reason = output.status.code().map_or_else(
            || "terminated by signal".to_owned(),
            |code| format!("exit code {code}"),
        );
        Err(StepFailure { reason, combined })
    }

    /// Everything the installer printed goes to stderr — stdout stays JSON-only.
    fn forward(text: &str) {
        if text.is_empty() {
            return;
        }
        let mut stderr = std::io::stderr().lock();
        let _ = write!(stderr, "{text}");
    }

    /// Last `max_chars` characters of `text` (the whole string when shorter).
    fn tail_chars(text: &str, max_chars: usize) -> String {
        let total = text.chars().count();
        if total <= max_chars {
            return text.to_owned();
        }
        text.chars().skip(total - max_chars).collect()
    }

    /// Last whitespace-separated token of the first non-blank line — clap's
    /// `--version` prints `the-loop <version>`.
    fn version_token(stdout: &str) -> Option<&str> {
        stdout
            .lines()
            .find(|line| !line.trim().is_empty())?
            .split_whitespace()
            .next_back()
    }

    #[cfg(test)]
    mod tests {
        use super::{tail_chars, version_token};

        #[test]
        fn version_token_reads_the_clap_version_line() {
            assert_eq!(version_token("the-loop 0.6.0\n"), Some("0.6.0"));
            assert_eq!(version_token("\n\nthe-loop 1.2.3\nnoise\n"), Some("1.2.3"));
            assert_eq!(version_token("   \n"), None);
            assert_eq!(version_token(""), None);
        }

        #[test]
        fn tail_chars_keeps_only_the_end_of_a_long_output() {
            assert_eq!(tail_chars("short", 2000), "short");
            let long = "x".repeat(2500);
            let tail = tail_chars(&long, 2000);
            assert_eq!(tail.chars().count(), 2000);
        }
    }
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::Path;

    /// Lines between a `[header]` line and the next section header.
    fn section<'a>(toml: &'a str, header: &str) -> Option<Vec<&'a str>> {
        let mut lines = toml.lines().skip_while(|line| line.trim() != header);
        lines.next()?;
        Some(
            lines
                .take_while(|line| !line.trim_start().starts_with('['))
                .collect(),
        )
    }

    /// Table keys in declaration order (blank and comment lines skipped).
    fn table_keys(lines: &[&str]) -> Vec<String> {
        lines
            .iter()
            .map(|line| line.trim())
            .filter(|line| !line.is_empty() && !line.starts_with('#'))
            .filter_map(|line| line.split_once('=').map(|(key, _)| key.trim().to_owned()))
            .collect()
    }

    /// Criterion 2: the crate declares a default-off `upgrade` feature, still
    /// depends on exactly clap + serde + `serde_json`, and the committed cargo-dist
    /// config turns the feature on for release builds.
    #[test]
    fn cargo_and_dist_config_declare_a_default_off_upgrade_feature() {
        let crate_dir = Path::new(env!("CARGO_MANIFEST_DIR"));

        let manifest = fs::read_to_string(crate_dir.join("Cargo.toml")).expect("read Cargo.toml");
        let features = section(&manifest, "[features]").expect("Cargo.toml needs [features]");
        assert_eq!(
            table_keys(&features),
            vec!["upgrade".to_owned()],
            "[features] must declare `upgrade` and nothing else (no `default` key ⇒ default off)"
        );
        assert!(
            features.iter().any(|line| line.trim() == "upgrade = []"),
            "`upgrade` must enable no other feature; got {features:?}"
        );

        let dependencies =
            section(&manifest, "[dependencies]").expect("Cargo.toml needs [dependencies]");
        assert_eq!(
            table_keys(&dependencies),
            vec![
                "clap".to_owned(),
                "serde".to_owned(),
                "serde_json".to_owned()
            ],
            "upgrade must add zero dependencies"
        );

        let dist = fs::read_to_string(crate_dir.join("..").join("dist-workspace.toml"))
            .expect("read dist-workspace.toml");
        let dist_section = section(&dist, "[dist]").expect("dist-workspace.toml needs [dist]");
        assert!(
            dist_section
                .iter()
                .any(|line| line.trim() == r#"features = ["upgrade"]"#),
            "[dist] must carry features = [\"upgrade\"] so release builds compile it in; got {dist_section:?}"
        );
    }
}
