//! `upgrade` — replace this binary with the latest release.
//!
//! Thin, with one exception: `upgrade` owns **archive verification**, and the
//! install *layout* remains the installer's. It reads the install receipt,
//! fetches the release's own generated installer, downloads the release archive
//! and its published `.sha256` sidecar, verifies the archive against that
//! sidecar, and only then runs the installer and post-checks the binary at the
//! path this process was launched from.
//!
//! Verification cannot be delegated, and it cannot be ordered later. Only one
//! of the two generated installers verifies anything — the shell installer
//! checks the archive's sha256 (and skips even that when `sha256sum` is
//! missing), while the generated PowerShell installer verifies nothing at all
//! and reports success after unpacking rubbish. Because the Windows leg has to
//! rename the running binary aside before the installer can write over it, an
//! unverified archive there destroys a working install. So the check happens
//! here, on every platform, ahead of the rename-aside — the first step that
//! displaces anything.
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

    /// App name every cargo-dist artifact name is built from.
    const APP_NAME: &str = "the-loop";

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
    /// download the installer, download the archive and its sidecar, verify the
    /// archive, rename aside (Windows), run the installer, post-check, report.
    ///
    /// Every step up to and including `verify-archive` leaves the installed
    /// binary exactly where it was; the rename-aside is the first one that does
    /// not, which is why nothing may be reordered across it.
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

        let Some(archive_name) = archive_name() else {
            let _ = fs::remove_dir_all(&work);
            fail(&format!(
                "upgrade failed at name-archive: no release archive is published for {}/{} — install the latest release manually: {INSTALL_ONE_LINER}",
                env::consts::OS,
                env::consts::ARCH
            ))
        };
        let archive = work.join(&archive_name);
        if let Err(failure) = download(&format!("{base}/{archive_name}"), &archive) {
            abort(&work, &exe, None, "download-archive", &failure);
        }
        let sidecar = work.join(format!("{archive_name}.sha256"));
        if let Err(failure) = download(&format!("{base}/{archive_name}.sha256"), &sidecar) {
            abort(&work, &exe, None, "download-checksum", &failure);
        }
        if let Err(failure) = verify_archive(&archive, &sidecar, &archive_name) {
            abort(&work, &exe, None, "verify-archive", &failure);
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

    /// The archive this platform's installer downloads, named exactly as
    /// cargo-dist publishes it (beside a `<name>.sha256` sidecar). `None` on a
    /// platform no release targets, which is a refusal rather than a guess.
    ///
    /// The linux arms name the musl archive even on a glibc host: musl is the
    /// only linux build the release makes, and the generated installer selects
    /// it there too.
    fn archive_name() -> Option<String> {
        let triple = match (env::consts::OS, env::consts::ARCH) {
            ("macos", "aarch64") => "aarch64-apple-darwin",
            ("macos", "x86_64") => "x86_64-apple-darwin",
            ("linux", "aarch64") => "aarch64-unknown-linux-musl",
            ("linux", "x86_64") => "x86_64-unknown-linux-musl",
            ("windows", _) => "x86_64-pc-windows-msvc",
            _ => return None,
        };
        let extension = if cfg!(windows) { "zip" } else { "tar.xz" };
        Some(format!("{APP_NAME}-{triple}.{extension}"))
    }

    /// Hash the downloaded archive and compare it with the hash its published
    /// sidecar carries. The failure text names both hashes, because the only
    /// useful next question is whether the mirror is stale or the download was
    /// truncated.
    fn verify_archive(
        archive: &Path,
        sidecar: &Path,
        archive_name: &str,
    ) -> Result<(), StepFailure> {
        let bytes = fs::read(archive).map_err(|err| StepFailure {
            reason: format!("could not read the downloaded {archive_name}: {err}"),
            combined: String::new(),
        })?;
        let published = fs::read_to_string(sidecar).map_err(|err| StepFailure {
            reason: format!("could not read {archive_name}.sha256: {err}"),
            combined: String::new(),
        })?;
        let expected = sidecar_hash(&published).ok_or_else(|| StepFailure {
            reason: format!(
                "{archive_name}.sha256 carries no sha256; it reads {:?}",
                tail_chars(published.trim(), 200)
            ),
            combined: String::new(),
        })?;

        let actual = sha256_hex(&bytes);
        if actual == expected {
            return Ok(());
        }
        Err(StepFailure {
            reason: format!(
                "checksum mismatch for {archive_name}: the published sidecar says {expected}, the downloaded archive hashes to {actual}"
            ),
            combined: String::new(),
        })
    }

    /// The hash out of a `<hash> *<file>` sidecar line, lowercased; `None`
    /// unless the first field really is 64 hex digits (an error page fetched in
    /// place of a sidecar must never read as a hash).
    fn sidecar_hash(sidecar: &str) -> Option<String> {
        let hash = sidecar.split_whitespace().next()?.to_ascii_lowercase();
        (hash.len() == 64 && hash.chars().all(|char| char.is_ascii_hexdigit())).then_some(hash)
    }

    /// Lowercase hex alphabet the digest is rendered through.
    const HEX_DIGITS: [u8; 16] = *b"0123456789abcdef";

    /// FIPS 180-4 sha-256 round constants.
    const SHA256_K: [u32; 64] = [
        0x428a_2f98, 0x7137_4491, 0xb5c0_fbcf, 0xe9b5_dba5, 0x3956_c25b, 0x59f1_11f1, 0x923f_82a4,
        0xab1c_5ed5, 0xd807_aa98, 0x1283_5b01, 0x2431_85be, 0x550c_7dc3, 0x72be_5d74, 0x80de_b1fe,
        0x9bdc_06a7, 0xc19b_f174, 0xe49b_69c1, 0xefbe_4786, 0x0fc1_9dc6, 0x240c_a1cc, 0x2de9_2c6f,
        0x4a74_84aa, 0x5cb0_a9dc, 0x76f9_88da, 0x983e_5152, 0xa831_c66d, 0xb003_27c8, 0xbf59_7fc7,
        0xc6e0_0bf3, 0xd5a7_9147, 0x06ca_6351, 0x1429_2967, 0x27b7_0a85, 0x2e1b_2138, 0x4d2c_6dfc,
        0x5338_0d13, 0x650a_7354, 0x766a_0abb, 0x81c2_c92e, 0x9272_2c85, 0xa2bf_e8a1, 0xa81a_664b,
        0xc24b_8b70, 0xc76c_51a3, 0xd192_e819, 0xd699_0624, 0xf40e_3585, 0x106a_a070, 0x19a4_c116,
        0x1e37_6c08, 0x2748_774c, 0x34b0_bcb5, 0x391c_0cb3, 0x4ed8_aa4a, 0x5b9c_ca4f, 0x682e_6ff3,
        0x748f_82ee, 0x78a5_636f, 0x84c8_7814, 0x8cc7_0208, 0x90be_fffa, 0xa450_6ceb, 0xbef9_a3f7,
        0xc671_78f2,
    ];

    /// FIPS 180-4 sha-256 initial hash value.
    const SHA256_INIT: [u32; 8] = [
        0x6a09_e667,
        0xbb67_ae85,
        0x3c6e_f372,
        0xa54f_f53a,
        0x510e_527f,
        0x9b05_688c,
        0x1f83_d9ab,
        0x5be0_cd19,
    ];

    /// Lowercase hex sha-256 of `bytes`, computed in-crate.
    ///
    /// Written out rather than pulled in: `upgrade` shipped with zero added
    /// dependencies and holds that bar, and the obvious alternative — shelling
    /// to `sha256sum` / `certutil` — reintroduces exactly the failure the shell
    /// installer already has, where a missing tool silently means "verified".
    fn sha256_hex(bytes: &[u8]) -> String {
        let mut state = SHA256_INIT;
        let mut chunks = bytes.chunks_exact(64);
        for chunk in &mut chunks {
            sha256_compress(&mut state, chunk);
        }

        // Padding: 0x80, zeroes, then the message length in bits as a big-endian
        // u64 — one final block, or two when the 9 mandatory bytes do not fit.
        let rest = chunks.remainder();
        let mut tail = [0_u8; 128];
        tail[..rest.len()].copy_from_slice(rest);
        tail[rest.len()] = 0x80;
        let tail_len = if rest.len() + 9 <= 64 { 64 } else { 128 };
        let bits = (bytes.len() as u64).wrapping_mul(8);
        tail[tail_len - 8..tail_len].copy_from_slice(&bits.to_be_bytes());
        for chunk in tail[..tail_len].chunks_exact(64) {
            sha256_compress(&mut state, chunk);
        }

        let mut hex = String::with_capacity(64);
        for byte in state.iter().flat_map(|word| word.to_be_bytes()) {
            hex.push(char::from(HEX_DIGITS[usize::from(byte >> 4_u32)]));
            hex.push(char::from(HEX_DIGITS[usize::from(byte & 0x0f)]));
        }
        hex
    }

    /// One 64-byte block through the FIPS 180-4 §6.2.2 compression function.
    ///
    /// `working` holds a..h at indices 0..8; rotating it right by one at the end
    /// of a round is the a→b→…→h shift, after which only the new a and e need
    /// writing.
    fn sha256_compress(state: &mut [u32; 8], block: &[u8]) {
        debug_assert_eq!(block.len(), 64, "sha256 compresses 64-byte blocks");
        let mut schedule = [0_u32; 64];
        for (word, bytes) in schedule.iter_mut().zip(block.chunks_exact(4)) {
            *word = u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]);
        }
        for index in 16..schedule.len() {
            let prev = schedule[index - 15];
            let far = schedule[index - 2];
            let sigma0 = prev.rotate_right(7) ^ prev.rotate_right(18) ^ (prev >> 3_u32);
            let sigma1 = far.rotate_right(17) ^ far.rotate_right(19) ^ (far >> 10_u32);
            schedule[index] = schedule[index - 16]
                .wrapping_add(sigma0)
                .wrapping_add(schedule[index - 7])
                .wrapping_add(sigma1);
        }

        let mut working = *state;
        for (word, round_key) in schedule.iter().zip(SHA256_K) {
            let sum1 = working[4].rotate_right(6)
                ^ working[4].rotate_right(11)
                ^ working[4].rotate_right(25);
            let choose = (working[4] & working[5]) ^ (!working[4] & working[6]);
            let temp1 = working[7]
                .wrapping_add(sum1)
                .wrapping_add(choose)
                .wrapping_add(round_key)
                .wrapping_add(*word);
            let sum0 = working[0].rotate_right(2)
                ^ working[0].rotate_right(13)
                ^ working[0].rotate_right(22);
            let majority = (working[0] & working[1])
                ^ (working[0] & working[2])
                ^ (working[1] & working[2]);
            let temp2 = sum0.wrapping_add(majority);
            working.rotate_right(1);
            working[4] = working[4].wrapping_add(temp1);
            working[0] = temp1.wrapping_add(temp2);
        }

        for (slot, round) in state.iter_mut().zip(working) {
            *slot = slot.wrapping_add(round);
        }
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
        use super::{archive_name, sha256_hex, sidecar_hash, tail_chars, version_token};

        /// Published FIPS 180-4 vectors — independent of anything in this crate,
        /// which is the point: a digest that only agrees with itself would let a
        /// corrupt archive verify against a sidecar hashed the same wrong way.
        #[test]
        fn sha256_hex_matches_the_published_fips_vectors() {
            assert_eq!(
                sha256_hex(b""),
                "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
            );
            assert_eq!(
                sha256_hex(b"abc"),
                "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
            );
            assert_eq!(
                sha256_hex(b"abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"),
                "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"
            );
            // Many blocks, and a length that pads into an extra one.
            assert_eq!(
                sha256_hex(&vec![b'a'; 1_000_000]),
                "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0"
            );
            // A length whose padding cannot share the final block (56 bytes),
            // taken from `shasum -a 256` rather than from this implementation.
            assert_eq!(
                sha256_hex(&[b'x'; 56]),
                "04c26261370ee7541549d16dee320c723e3fd14671e66a099afe0a377c16888e"
            );
        }

        #[test]
        fn sidecar_hash_takes_the_first_field_and_rejects_anything_else() {
            let hash = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
            assert_eq!(
                sidecar_hash(&format!("{hash} *the-loop-x86_64-apple-darwin.tar.xz\n")),
                Some(hash.to_owned())
            );
            assert_eq!(
                sidecar_hash(&format!("{} \tfile\n", hash.to_uppercase())),
                Some(hash.to_owned()),
                "an uppercase sidecar hash should compare equal to a computed one"
            );
            assert_eq!(sidecar_hash("<!DOCTYPE html><html>404</html>"), None);
            assert_eq!(sidecar_hash(&hash[..63]), None, "63 hex digits is not a hash");
            assert_eq!(sidecar_hash(""), None);
        }

        /// The archive `upgrade` fetches must be one a release actually
        /// publishes, or verification 404s on every host it runs on.
        #[test]
        fn archive_name_names_a_target_the_release_publishes() {
            let name = archive_name().expect("this host must map to a released target");
            let dist = std::fs::read_to_string(
                std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                    .join("..")
                    .join("dist-workspace.toml"),
            )
            .expect("read dist-workspace.toml");

            let triple = name
                .trim_start_matches("the-loop-")
                .trim_end_matches(".tar.xz")
                .trim_end_matches(".zip");
            assert!(
                dist.contains(&format!("\"{triple}\"")),
                "{name} names {triple}, which [dist] targets does not list"
            );
            let expected_extension = if cfg!(windows) { ".zip" } else { ".tar.xz" };
            assert!(
                name.ends_with(expected_extension),
                "{name} should carry this platform's cargo-dist archive extension"
            );
        }

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

    /// The module's own design note has to say where archive verification
    /// lives, because that ownership is the whole reason a corrupt download
    /// cannot destroy a Windows install: the generated PowerShell installer
    /// verifies nothing, so a note that still delegated integrity to "the
    /// installer" would send the next reader looking in the wrong place.
    #[test]
    fn module_note_states_that_upgrade_owns_archive_verification() {
        let source = fs::read_to_string(
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("src")
                .join("commands")
                .join("upgrade.rs"),
        )
        .expect("read upgrade.rs");
        let note: String = source
            .lines()
            .take_while(|line| line.starts_with("//!"))
            .collect::<Vec<_>>()
            .join(" ");

        assert!(
            note.contains("verif"),
            "the module note must say that upgrade verifies the archive; note was {note:?}"
        );
        assert!(
            !note.contains("it owns no download-verification"),
            "the module note must no longer delegate download verification; note was {note:?}"
        );
        assert!(
            note.contains("layout"),
            "the module note must still leave install layout to the installer; note was {note:?}"
        );
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
