//! Fixture-release builder: a real release directory the upgrade tests install
//! from, served over loopback.
//!
//! A [`FixtureRelease`] owns a temp root (removed when it drops) that doubles
//! as the served release directory and as the isolated filesystem the
//! installer writes into:
//!
//! ```text
//! <root>/the-loop-<triple>.tar.xz        the published archive (.zip on Windows)
//! <root>/the-loop-<triple>.tar.xz.sha256 its sidecar, `<hash> *<archive name>`
//! <root>/the-loop-installer.sh           the committed template, patched (.ps1 on Windows)
//! <root>/opt/bin/the-loop                where the installer installs
//! <root>/config/the-loop/the-loop-receipt.json  the install receipt
//! <root>/home, <root>/cargo              redirected HOME / CARGO_HOME
//! ```
//!
//! Two facts about cargo-dist 0.32.0 shape this builder, both verified against
//! its generated output:
//!
//! * The committed installer templates carry **no** checksums — cargo-dist only
//!   embeds `_checksum_value` for arms whose archive was built in the same
//!   `dist` run, and the templates here come from a global-artifacts-only run.
//!   So the harness patches the current target's arm itself, and a missing
//!   patch anchor panics: an installer that verifies nothing would make the
//!   corrupt-archive case vacuous.
//! * The `sha256` is computed by shelling out to the very tool the installer
//!   needs to verify a download (`sha256sum` on unix, `Get-FileHash` through
//!   `powershell` on Windows), so this crate gains no dependency. If that tool
//!   is missing the harness panics rather than proceeding: the shell installer
//!   silently *skips* verification without it.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::sync::atomic::{AtomicU64, Ordering};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use super::http_server;

/// The app name cargo-dist builds every artifact name from.
const APP_NAME: &str = "the-loop";

/// Line prefix that carries the version in the generated shell installer.
const SHELL_VERSION_ANCHOR: &str = "\nAPP_VERSION=\"";

/// Line prefix that carries the version in the generated `PowerShell`
/// installer.
const POWERSHELL_VERSION_ANCHOR: &str = "\n$app_version = '";

/// Indentation cargo-dist uses inside a `select_archive_for_arch` case arm.
const ARM_INDENT: &str = "            ";

static ROOT_SEQ: AtomicU64 = AtomicU64::new(0);

/// The cargo-dist target triple whose archive this platform's installer asks
/// for — one of the five targets in `dist-workspace.toml`.
///
/// Note the linux arms: the installer maps a `gnu` host onto the `musl`
/// archive, so the archive is named for the musl target even on a glibc box.
#[must_use]
pub fn current_target_triple() -> &'static str {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("macos", "aarch64") => "aarch64-apple-darwin",
        ("macos", "x86_64") => "x86_64-apple-darwin",
        ("linux", "aarch64") => "aarch64-unknown-linux-musl",
        ("linux", "x86_64") => "x86_64-unknown-linux-musl",
        ("windows", _) => "x86_64-pc-windows-msvc",
        (os, arch) => panic!(
            "fixture release: no cargo-dist arm covers {os}/{arch}; the five released targets are \
             aarch64/x86_64-apple-darwin, aarch64/x86_64-unknown-linux-musl and \
             x86_64-pc-windows-msvc"
        ),
    }
}

/// Name of the archive this platform's installer downloads.
#[must_use]
pub fn archive_name() -> String {
    let triple = current_target_triple();
    if cfg!(windows) {
        format!("{APP_NAME}-{triple}.zip")
    } else {
        format!("{APP_NAME}-{triple}.tar.xz")
    }
}

/// Name the installed binary carries on this platform.
#[must_use]
pub const fn binary_file_name() -> &'static str {
    if cfg!(windows) {
        "the-loop.exe"
    } else {
        "the-loop"
    }
}

/// Name of the installer this platform runs.
#[must_use]
pub const fn installer_file_name() -> &'static str {
    if cfg!(windows) {
        "the-loop-installer.ps1"
    } else {
        "the-loop-installer.sh"
    }
}

/// Path of a committed installer template inside this crate's test fixtures.
#[must_use]
pub fn installer_template_path(file_name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join("installers")
        .join(file_name)
}

/// Rewrite the version in the generated shell installer and give the current
/// target's arm a `sha256` checksum to verify against.
///
/// Panics if either anchor is absent — the version anchor because an installer
/// left at the template's version would install and record the wrong release,
/// and the arm anchor because an installer with no checksum lines verifies
/// nothing at all while still exiting 0.
#[must_use]
pub fn patch_shell_installer(
    template: &str,
    version: &str,
    archive_name: &str,
    archive_sha256: &str,
) -> String {
    let current = template_version(template, SHELL_VERSION_ANCHOR, '"');
    let versioned = template.replace(&current, version);
    insert_shell_checksum(&versioned, archive_name, archive_sha256)
}

/// Rewrite the version in the generated `PowerShell` installer.
///
/// Unlike its shell sibling there is no checksum to patch: cargo-dist 0.32.0's
/// `.ps1` performs no verification at all — its `$platforms` table carries
/// `artifact_name`, `bins`, `libs`, `staticlibs` and `zip_ext` and nothing
/// else, and the word "checksum" never appears in the generated script. On
/// Windows the `.sha256` sidecar is the only checksum surface in the fixture,
/// and a corrupt archive is caught at unpack time instead. The version anchor
/// is still mandatory and a missing one panics.
#[must_use]
pub fn patch_powershell_installer(template: &str, version: &str) -> String {
    let current = template_version(template, POWERSHELL_VERSION_ANCHOR, '\'');
    template.replace(&current, version)
}

/// A published fixture release plus the isolated filesystem it installs into.
pub struct FixtureRelease {
    root: PathBuf,
    base_url: String,
    server: Option<http_server::Handle>,
    published: Option<Published>,
}

/// What one [`FixtureRelease::publish`] call laid down.
struct Published {
    version: String,
    archive: PathBuf,
    sidecar: PathBuf,
    installer: PathBuf,
    sha256: String,
}

/// One run of the fixture installer: what it produced and the environment it
/// ran under, so a later `the-loop upgrade` child can reuse the same isolation.
pub struct InstallRun {
    /// Path the installer installs the binary to. Present after a successful
    /// run; a failed run leaves nothing there, which is worth asserting.
    pub binary: PathBuf,
    /// The isolation environment the installer ran under.
    pub env: BTreeMap<String, String>,
    /// Exit status, stdout and stderr of the installer.
    pub output: Output,
}

impl FixtureRelease {
    /// Create a fixture root under the system temp dir and start serving it.
    #[must_use]
    pub fn new(label: &str) -> Self {
        let root = unique_temp_root(label);
        for sub in ["opt", "config", "home", "cargo", "localappdata"] {
            let dir = root.join(sub);
            fs::create_dir_all(&dir)
                .unwrap_or_else(|err| panic!("create {}: {err}", dir.display()));
        }
        let server = http_server::serve(&root);
        let base_url = server.base_url().to_string();
        Self {
            root,
            base_url,
            server: Some(server),
            published: None,
        }
    }

    /// The fixture root — served directory and isolation root at once.
    #[must_use]
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// `http://127.0.0.1:<port>` the fixture is served on.
    #[must_use]
    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    /// Requests the fixture server has answered — zero proves nothing fetched.
    #[must_use]
    pub fn request_count(&self) -> usize {
        self.server_handle().request_count()
    }

    /// Where the isolated install receipt lands.
    #[must_use]
    pub fn receipt_path(&self) -> PathBuf {
        self.root
            .join("config")
            .join(APP_NAME)
            .join("the-loop-receipt.json")
    }

    /// Where the installer places the binary under this fixture's forced
    /// install dir (cargo-dist's `cargo-home` layout puts it under `bin/`).
    #[must_use]
    pub fn installed_binary(&self) -> PathBuf {
        self.root.join("opt").join("bin").join(binary_file_name())
    }

    /// The published archive.
    #[must_use]
    pub fn archive_path(&self) -> &Path {
        &self.published().archive
    }

    /// The published archive's `.sha256` sidecar.
    #[must_use]
    pub fn sidecar_path(&self) -> &Path {
        &self.published().sidecar
    }

    /// The patched installer published into the fixture root.
    #[must_use]
    pub fn installer_path(&self) -> &Path {
        &self.published().installer
    }

    /// The published archive's true `sha256`, as the sidecar and the patched
    /// installer both record it.
    #[must_use]
    pub fn published_sha256(&self) -> &str {
        &self.published().sha256
    }

    /// The version the published archive and installer claim.
    #[must_use]
    pub fn published_version(&self) -> &str {
        &self.published().version
    }

    /// Compile a stand-in "newer build" that answers `--version` with
    /// `the-loop <version>`.
    ///
    /// Compiled here with `rustc` rather than assembled as a script so the
    /// Windows leg gets a real `.exe`.
    #[must_use]
    pub fn newer_stub(&self, version: &str) -> PathBuf {
        assert!(
            !version.contains(['"', '\\']),
            "fixture stub version must not contain quotes or backslashes: {version:?}"
        );
        let dir = self.root.join("stub").join(version);
        fs::create_dir_all(&dir).unwrap_or_else(|err| panic!("create stub dir: {err}"));

        let source = dir.join("stub.rs");
        fs::write(&source, stub_source(version)).unwrap_or_else(|err| panic!("write stub: {err}"));

        let binary = dir.join(binary_file_name());
        let output = Command::new("rustc")
            .arg("--edition")
            .arg("2024")
            .arg("-o")
            .arg(&binary)
            .arg(&source)
            .output()
            .unwrap_or_else(|err| {
                panic!("fixture release needs rustc on PATH to build the newer stub: {err}")
            });
        assert!(
            output.status.success(),
            "rustc failed to build the fixture stub: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        binary
    }

    /// Publish `binary` as `version`: build the current-platform archive, hash
    /// it, write the sidecar, and write the committed installer patched to that
    /// version and hash — all into the served fixture root.
    pub fn publish(&mut self, binary: &Path, version: &str) {
        let archive_name = archive_name();
        let archive = self.root.join(&archive_name);
        let stage = self.root.join(".stage");
        if stage.exists() {
            fs::remove_dir_all(&stage).unwrap_or_else(|err| panic!("clear stage dir: {err}"));
        }

        if cfg!(windows) {
            // Windows archives are flat: `the-loop.exe` sits at the zip root,
            // because the installer runs `Expand-Archive` with no strip.
            let flat = stage.join("flat");
            fs::create_dir_all(&flat).unwrap_or_else(|err| panic!("create stage dir: {err}"));
            stage_binary(binary, &flat.join(binary_file_name()));
            let script = format!(
                "Compress-Archive -Path '{}' -DestinationPath '{}' -Force",
                flat.join("*").display(),
                archive.display()
            );
            let output = run_powershell(&script);
            assert!(
                output.status.success(),
                "Compress-Archive failed to build {archive_name}: {}",
                String::from_utf8_lossy(&output.stderr)
            );
        } else {
            // Unix archives have exactly one top-level directory, because the
            // installer untars with `--strip-components 1`.
            let top_name = format!("{APP_NAME}-{}", current_target_triple());
            let top = stage.join(&top_name);
            fs::create_dir_all(&top).unwrap_or_else(|err| panic!("create stage dir: {err}"));
            stage_binary(binary, &top.join(binary_file_name()));
            let output = Command::new("tar")
                .arg("-cJf")
                .arg(&archive)
                .arg("-C")
                .arg(&stage)
                .arg(&top_name)
                .output()
                .unwrap_or_else(|err| {
                    panic!("fixture release needs tar (with xz support) on PATH: {err}")
                });
            assert!(
                output.status.success(),
                "tar failed to build {archive_name}: {}",
                String::from_utf8_lossy(&output.stderr)
            );
        }
        fs::remove_dir_all(&stage).unwrap_or_else(|err| panic!("clear stage dir: {err}"));

        let sidecar_line = sha256_sidecar_line(&self.root, &archive_name);
        let sha256 = parse_sidecar_hash(&sidecar_line, &archive_name);
        let sidecar = self.root.join(format!("{archive_name}.sha256"));
        fs::write(&sidecar, &sidecar_line).unwrap_or_else(|err| panic!("write sidecar: {err}"));

        let template_name = installer_file_name();
        let template = read_installer_template(template_name);
        let patched = if cfg!(windows) {
            patch_powershell_installer(&template, version)
        } else {
            patch_shell_installer(&template, version, &archive_name, &sha256)
        };
        let installer = self.root.join(template_name);
        fs::write(&installer, patched)
            .unwrap_or_else(|err| panic!("write patched installer: {err}"));

        self.published = Some(Published {
            version: version.to_string(),
            archive,
            sidecar,
            installer,
            sha256,
        });
    }

    /// Run the published installer under the fixture's isolation environment.
    ///
    /// Never touches the developer's real `HOME`, `CARGO_HOME` or shell
    /// profile: every path the installer could write to is redirected under
    /// the fixture root and `THE_LOOP_NO_MODIFY_PATH` is set.
    #[must_use]
    pub fn install(&self) -> InstallRun {
        let installer = &self.published().installer;
        let env = self.isolation_env();

        let mut command = if cfg!(windows) {
            let mut command = Command::new("powershell");
            command
                .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"])
                .arg(installer);
            command
        } else {
            let mut command = Command::new("sh");
            command.arg(installer);
            command
        };
        command.current_dir(&self.root);
        for (key, value) in &env {
            command.env(key, value);
        }

        let output = command
            .output()
            .unwrap_or_else(|err| panic!("run fixture installer {}: {err}", installer.display()));
        InstallRun {
            binary: self.installed_binary(),
            env,
            output,
        }
    }

    /// The isolation environment, also handed back by [`Self::install`] so a
    /// later `the-loop upgrade` child runs against the same fixture.
    fn isolation_env(&self) -> BTreeMap<String, String> {
        let mut env = BTreeMap::new();
        env.insert("THE_LOOP_DOWNLOAD_URL".to_string(), self.base_url.clone());
        env.insert(
            "THE_LOOP_INSTALL_DIR".to_string(),
            path_string(&self.root.join("opt")),
        );
        env.insert("THE_LOOP_NO_MODIFY_PATH".to_string(), "1".to_string());
        env.insert(
            "XDG_CONFIG_HOME".to_string(),
            path_string(&self.root.join("config")),
        );
        env.insert("HOME".to_string(), path_string(&self.root.join("home")));
        env.insert(
            "CARGO_HOME".to_string(),
            path_string(&self.root.join("cargo")),
        );
        if cfg!(windows) {
            env.insert(
                "LOCALAPPDATA".to_string(),
                path_string(&self.root.join("localappdata")),
            );
            // Pin the module path here too, so the installer's own
            // PowerShell process (spawned in `install`, below) can't have
            // its cmdlet lookups shadowed the same way `sha256_sidecar_line`
            // could — see `windows_powershell_module_path`.
            let system_root = std::env::var("SystemRoot").ok();
            env.insert(
                "PSModulePath".to_string(),
                windows_powershell_module_path(system_root.as_deref()),
            );
        }
        env
    }

    /// Mutate the published archive's bytes, leaving the sidecar and the
    /// installer's embedded checksum at the good hash.
    pub fn corrupt_archive(&self) {
        let archive = &self.published().archive;
        let mut bytes =
            fs::read(archive).unwrap_or_else(|err| panic!("read published archive: {err}"));
        assert!(
            bytes.len() > 64,
            "published archive is implausibly small ({} bytes) to corrupt",
            bytes.len()
        );
        let middle = bytes.len() / 2;
        for byte in &mut bytes[middle..middle + 32] {
            *byte ^= 0xFF;
        }
        fs::write(archive, &bytes).unwrap_or_else(|err| panic!("write corrupted archive: {err}"));
    }

    const fn published(&self) -> &Published {
        self.published
            .as_ref()
            .expect("call publish() before using the fixture release")
    }

    const fn server_handle(&self) -> &http_server::Handle {
        self.server
            .as_ref()
            .expect("the fixture server runs until the fixture is dropped")
    }
}

impl Drop for FixtureRelease {
    fn drop(&mut self) {
        // Stop serving first: on Windows a directory with an open handle
        // inside it refuses to be removed.
        drop(self.server.take());
        for attempt in 0..5_u64 {
            if fs::remove_dir_all(&self.root).is_ok() || !self.root.exists() {
                return;
            }
            thread::sleep(Duration::from_millis(20 * (attempt + 1)));
        }
        assert!(
            thread::panicking(),
            "fixture release root {} could not be removed; the test would leave a directory behind",
            self.root.display()
        );
    }
}

/// Source of the stand-in "newer build".
fn stub_source(version: &str) -> String {
    format!(
        r#"fn main() {{
    let mut args = std::env::args().skip(1);
    match args.next() {{
        Some(arg) if arg == "--version" => println!("the-loop {version}"),
        other => {{
            eprintln!("fixture stub build understands only --version (got {{other:?}})");
            std::process::exit(2);
        }}
    }}
}}
"#
    )
}

/// Copy `binary` into the archive staging tree, executable.
fn stage_binary(binary: &Path, destination: &Path) {
    fs::copy(binary, destination).unwrap_or_else(|err| {
        panic!(
            "stage {} as {}: {err}",
            binary.display(),
            destination.display()
        )
    });
    make_executable(destination);
}

#[cfg(unix)]
fn make_executable(path: &Path) {
    use std::os::unix::fs::PermissionsExt;

    let mut permissions = fs::metadata(path)
        .unwrap_or_else(|err| panic!("stat {}: {err}", path.display()))
        .permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(path, permissions)
        .unwrap_or_else(|err| panic!("chmod {}: {err}", path.display()));
}

#[cfg(windows)]
fn make_executable(_path: &Path) {}

/// Read a committed installer template, panicking loudly if it is missing.
fn read_installer_template(file_name: &str) -> String {
    let path = installer_template_path(file_name);
    fs::read_to_string(&path).unwrap_or_else(|err| {
        panic!(
            "fixture release needs the committed installer template at {}: {err}",
            path.display()
        )
    })
}

/// Pull the version out of a generated installer, so the rewrite does not have
/// to hardcode whatever version the templates were generated at.
fn template_version(template: &str, anchor: &str, terminator: char) -> String {
    let start = template.find(anchor).unwrap_or_else(|| {
        panic!(
            "fixture installer patch: no version anchor {anchor:?} in the committed installer \
             template; an installer left at the template's version would install and record the \
             wrong release"
        )
    }) + anchor.len();
    let rest = &template[start..];
    let end = rest.find(terminator).unwrap_or_else(|| {
        panic!("fixture installer patch: version anchor {anchor:?} is unterminated")
    });
    let version = &rest[..end];
    assert!(
        !version.is_empty(),
        "fixture installer patch: version anchor {anchor:?} carries an empty version"
    );
    version.to_string()
}

/// Insert `_checksum_style` / `_checksum_value` into the shell installer's case
/// arm for `archive_name`.
fn insert_shell_checksum(installer: &str, archive_name: &str, archive_sha256: &str) -> String {
    let header = format!("\n        \"{archive_name}\")\n");
    let arm_start = installer.find(&header).unwrap_or_else(|| {
        panic!(
            "fixture installer patch: no case arm for {archive_name} in the committed shell \
             installer template; without one the installer would verify nothing and still exit 0"
        )
    }) + header.len();
    let arm = &installer[arm_start..];
    let arm_end = arm.find(&format!("\n{ARM_INDENT};;")).unwrap_or_else(|| {
        panic!("fixture installer patch: the case arm for {archive_name} does not terminate")
    });

    let zip_ext_anchor = format!("{ARM_INDENT}_zip_ext=\"");
    let zip_ext_at = arm[..arm_end].find(&zip_ext_anchor).unwrap_or_else(|| {
        panic!(
            "fixture installer patch: no {zip_ext_anchor:?} line inside the case arm for \
             {archive_name}; the checksum lines have nowhere to go"
        )
    });
    let line_end = arm[zip_ext_at..arm_end]
        .find('\n')
        .unwrap_or_else(|| panic!("fixture installer patch: unterminated _zip_ext line"));
    let insert_at = arm_start + zip_ext_at + line_end + 1;

    let checksum_lines = format!(
        "{ARM_INDENT}_checksum_style=\"sha256\"\n{ARM_INDENT}_checksum_value=\"{archive_sha256}\"\n"
    );
    let mut patched = String::with_capacity(installer.len() + checksum_lines.len());
    patched.push_str(&installer[..insert_at]);
    patched.push_str(&checksum_lines);
    patched.push_str(&installer[insert_at..]);
    patched
}

/// The directory Windows PowerShell 5.1 autoloads its built-in modules from
/// (including `Microsoft.PowerShell.Utility`, home of `Get-FileHash`), rooted
/// at `system_root` (normally `%SystemRoot%`, falling back to `C:\Windows`).
///
/// Every `powershell` spawn below pins `PSModulePath` to exactly this
/// directory rather than trusting whatever the child inherits. Left
/// inherited, a GitHub Windows runner's `run:` step defaults to pwsh 7, whose
/// `PSModulePath` lists PowerShell 7's own module directory *first*; a
/// Windows PowerShell 5.1 child launched from that environment then
/// autoloads PowerShell 7's Core-only `Microsoft.PowerShell.Utility`
/// manifest, which exports nothing usable to 5.1, so cmdlets like
/// `Get-FileHash` silently fail to resolve. Pinning the path here means the
/// lookup can't be shadowed by whatever shell spawned this test process.
fn windows_powershell_module_path(system_root: Option<&str>) -> String {
    let root = system_root
        .filter(|value| !value.is_empty())
        .unwrap_or("C:\\Windows");
    format!("{root}\\system32\\WindowsPowerShell\\v1.0\\Modules")
}

/// A `<hash> *<archive name>` sidecar line for `archive_name` under `dir`,
/// produced by the same tool the installer verifies with.
fn sha256_sidecar_line(dir: &Path, archive_name: &str) -> String {
    if cfg!(windows) {
        let script = format!(
            "(Get-FileHash -Algorithm SHA256 -LiteralPath '{archive_name}').Hash.ToLower()"
        );
        let system_root = std::env::var("SystemRoot").ok();
        let output = Command::new("powershell")
            .args(["-NoProfile", "-Command", &script])
            .env(
                "PSModulePath",
                windows_powershell_module_path(system_root.as_deref()),
            )
            .current_dir(dir)
            .output()
            .unwrap_or_else(|err| {
                panic!("fixture release needs powershell for Get-FileHash: {err}")
            });
        assert!(
            output.status.success(),
            "Get-FileHash failed for {archive_name}: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        let hash = String::from_utf8_lossy(&output.stdout).trim().to_string();
        format!("{hash} *{archive_name}\n")
    } else {
        let output = Command::new("sha256sum")
            .arg("-b")
            .arg(archive_name)
            .current_dir(dir)
            .output()
            .unwrap_or_else(|err| {
                panic!(
                    "fixture release needs the sha256sum command — the very tool the shell \
                     installer verifies downloads with. Without it the installer silently skips \
                     verification, so the fixture would prove nothing ({err})"
                )
            });
        assert!(
            output.status.success(),
            "sha256sum failed for {archive_name}: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8(output.stdout).expect("sha256sum output should be utf-8")
    }
}

/// Take the hash out of a sidecar line, checking it names the right archive.
fn parse_sidecar_hash(line: &str, archive_name: &str) -> String {
    let mut fields = line.split_whitespace();
    let hash = fields
        .next()
        .unwrap_or_else(|| panic!("sidecar line {line:?} carries no hash"));
    let named = fields
        .next()
        .unwrap_or_else(|| panic!("sidecar line {line:?} names no file"));
    assert_eq!(
        named,
        format!("*{archive_name}"),
        "sidecar line {line:?} should name the published archive in binary form"
    );
    assert_eq!(
        hash.len(),
        64,
        "sidecar line {line:?} should carry a 64-hex-digit sha256"
    );
    hash.to_string()
}

/// Render a path for an environment variable, refusing non-utf-8.
fn path_string(path: &Path) -> String {
    path.to_str()
        .unwrap_or_else(|| panic!("fixture paths must be utf-8: {}", path.display()))
        .to_string()
}

/// Run a `PowerShell` one-liner.
fn run_powershell(script: &str) -> Output {
    Command::new("powershell")
        .args(["-NoProfile", "-Command", script])
        .output()
        .unwrap_or_else(|err| panic!("fixture release needs powershell on PATH: {err}"))
}

/// A fresh, uniquely named fixture root under the system temp dir.
fn unique_temp_root(label: &str) -> PathBuf {
    let n = ROOT_SEQ.fetch_add(1, Ordering::Relaxed);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |elapsed| elapsed.as_nanos());
    let root = std::env::temp_dir().join(format!(
        "the-loop-fixture-release-{label}-{}-{nanos}-{n}",
        std::process::id()
    ));
    fs::create_dir_all(&root)
        .unwrap_or_else(|err| panic!("create fixture root {}: {err}", root.display()));
    root
}

#[cfg(test)]
mod tests {
    use super::windows_powershell_module_path;

    /// The value every fixture `powershell` spawn pins `PSModulePath` to
    /// must be Windows PowerShell 5.1's own built-in module directory —
    /// never left to whatever the test process inherited (on CI, pwsh 7's
    /// `PSModulePath`, which shadows `Get-FileHash`; see
    /// `windows_powershell_module_path`'s doc comment).
    #[test]
    fn pins_to_windows_powershells_own_module_directory_under_system_root() {
        assert_eq!(
            windows_powershell_module_path(Some("C:\\Windows")),
            "C:\\Windows\\system32\\WindowsPowerShell\\v1.0\\Modules",
        );
        // No SystemRoot in the environment (or an empty one) still resolves
        // to a usable path rather than a shell spawn with an empty
        // PSModulePath.
        assert_eq!(
            windows_powershell_module_path(None),
            "C:\\Windows\\system32\\WindowsPowerShell\\v1.0\\Modules",
        );
        assert_eq!(
            windows_powershell_module_path(Some("")),
            "C:\\Windows\\system32\\WindowsPowerShell\\v1.0\\Modules",
        );
    }
}
