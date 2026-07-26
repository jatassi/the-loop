//! Install-receipt reader: platform path resolution plus a version/binaries load.
//!
//! The cargo-dist installers (`the-loop-installer.sh` / `.ps1`) write an install
//! receipt after a successful install. `upgrade`'s precondition step is the only
//! caller: no receipt (or an unparseable one) means this binary was not installed
//! by an installer this crate can drive, and `upgrade` refuses before touching the
//! network or the filesystem.

use std::env;
use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};

use serde::Deserialize;

/// Receipt file name under the resolved config directory, both platforms.
const RECEIPT_FILENAME: &str = "the-loop-receipt.json";

/// The two fields `upgrade` needs out of an install receipt.
///
/// Every other key in the real cargo-dist body (`binary_aliases`,
/// `install_layout`, `install_prefix`, `modify_path`, `provider`, `source`, …)
/// is read and discarded.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Receipt {
    /// The installed version string, e.g. `"0.5.0"`.
    pub version: String,
    /// The receipt's `binaries` list (empty when the key is absent).
    pub binaries: Vec<String>,
}

/// Wire shape used only to deserialize; unknown keys are ignored by default serde
/// behavior (no `deny_unknown_fields`).
#[derive(Debug, Deserialize)]
struct RawReceipt {
    version: Option<String>,
    #[serde(default)]
    binaries: Vec<String>,
}

/// Failure reading or parsing the install receipt. Both variants carry the
/// resolved path so the message tells a human exactly where to look.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ReceiptError {
    /// No file exists at the resolved path.
    NotFound {
        /// The resolved receipt path that does not exist.
        path: PathBuf,
    },
    /// The file exists but its body is not a usable receipt: unparseable JSON, or
    /// parseable JSON missing a non-empty `version` string.
    Invalid {
        /// The resolved receipt path whose body could not be used.
        path: PathBuf,
        /// Why the body was rejected (malformed JSON message, or "missing version").
        reason: String,
    },
}

impl fmt::Display for ReceiptError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotFound { path } => {
                write!(f, "no install receipt at {}", path.display())
            }
            Self::Invalid { path, reason } => {
                write!(f, "invalid install receipt at {}: {reason}", path.display())
            }
        }
    }
}

impl std::error::Error for ReceiptError {}

/// Resolve the install receipt path by exactly the three rules both cargo-dist
/// installers use, in order:
///
/// 1. `$XDG_CONFIG_HOME/the-loop/the-loop-receipt.json` when `XDG_CONFIG_HOME` is
///    set to a non-empty value — honored on Windows too.
/// 2. Else, on unix: `$HOME/.config/the-loop/the-loop-receipt.json`.
/// 3. Else, on Windows: `%LOCALAPPDATA%/the-loop/the-loop-receipt.json`.
#[must_use]
pub fn receipt_path() -> PathBuf {
    if let Some(xdg) = non_empty_env("XDG_CONFIG_HOME") {
        return PathBuf::from(xdg).join("the-loop").join(RECEIPT_FILENAME);
    }
    platform_default_path()
}

#[cfg(windows)]
fn platform_default_path() -> PathBuf {
    let local_app_data = env::var_os("LOCALAPPDATA").unwrap_or_default();
    PathBuf::from(local_app_data)
        .join("the-loop")
        .join(RECEIPT_FILENAME)
}

#[cfg(not(windows))]
fn platform_default_path() -> PathBuf {
    let home = env::var_os("HOME").unwrap_or_default();
    PathBuf::from(home)
        .join(".config")
        .join("the-loop")
        .join(RECEIPT_FILENAME)
}

fn non_empty_env(key: &str) -> Option<std::ffi::OsString> {
    let value = env::var_os(key)?;
    if value.is_empty() { None } else { Some(value) }
}

/// Load the install receipt from the resolved platform path (see [`receipt_path`]).
///
/// # Errors
///
/// Returns [`ReceiptError::NotFound`] when no file exists at the resolved path, or
/// [`ReceiptError::Invalid`] when the file exists but is not valid JSON, or is
/// valid JSON missing a non-empty `version` string.
pub fn load() -> Result<Receipt, ReceiptError> {
    load_from(&receipt_path())
}

fn load_from(path: &Path) -> Result<Receipt, ReceiptError> {
    if !path.exists() {
        return Err(ReceiptError::NotFound {
            path: path.to_path_buf(),
        });
    }
    let text = fs::read_to_string(path).map_err(|error| ReceiptError::Invalid {
        path: path.to_path_buf(),
        reason: format!("could not read: {error}"),
    })?;
    let raw: RawReceipt = serde_json::from_str(&text).map_err(|error| ReceiptError::Invalid {
        path: path.to_path_buf(),
        reason: format!("malformed JSON: {error}"),
    })?;
    let version = raw
        .version
        .filter(|v| !v.is_empty())
        .ok_or_else(|| ReceiptError::Invalid {
            path: path.to_path_buf(),
            reason: "missing \"version\"".to_string(),
        })?;
    Ok(Receipt {
        version,
        binaries: raw.binaries,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static TEMP_SEQ: AtomicU64 = AtomicU64::new(0);

    fn unique_temp_dir() -> PathBuf {
        let n = TEMP_SEQ.fetch_add(1, Ordering::Relaxed);
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |d| d.as_nanos());
        let dir = env::temp_dir().join(format!(
            "the-loop-receipt-{}-{}-{}",
            std::process::id(),
            nanos,
            n
        ));
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    /// RAII guard restoring one env var's previous value (present or absent) on
    /// drop. Callers hold `crate::env_lock()` for the full test body.
    struct EnvVarGuard {
        key: &'static str,
        prev: Option<std::ffi::OsString>,
    }

    impl EnvVarGuard {
        fn set(key: &'static str, value: &Path) -> Self {
            let prev = env::var_os(key);
            // SAFETY: test-only override, restored on drop; caller holds env_lock
            // for its full body so no other thread observes the mutation.
            unsafe {
                env::set_var(key, value);
            }
            Self { key, prev }
        }

        fn unset(key: &'static str) -> Self {
            let prev = env::var_os(key);
            // SAFETY: see `set` above.
            unsafe {
                env::remove_var(key);
            }
            Self { key, prev }
        }
    }

    impl Drop for EnvVarGuard {
        fn drop(&mut self) {
            // SAFETY: restores whatever was present before this guard.
            unsafe {
                match &self.prev {
                    Some(v) => env::set_var(self.key, v),
                    None => env::remove_var(self.key),
                }
            }
        }
    }

    fn write_receipt(dir: &Path, body: &str) {
        fs::create_dir_all(dir.join("the-loop")).expect("mkdir the-loop");
        fs::write(dir.join("the-loop").join(RECEIPT_FILENAME), body).expect("write receipt");
    }

    /// Criterion 1 + 4: `XDG_CONFIG_HOME` override wins over HOME / LOCALAPPDATA,
    /// and the loaded receipt comes from the resolved override path.
    #[test]
    fn xdg_override_wins_over_platform_default() {
        let _env = crate::env_lock();
        let xdg = unique_temp_dir();
        let home = unique_temp_dir();
        write_receipt(&xdg, r#"{"version":"1.2.3","binaries":["the-loop"]}"#);

        let _xdg_guard = EnvVarGuard::set("XDG_CONFIG_HOME", &xdg);
        let _home_guard = EnvVarGuard::set("HOME", &home);
        let _local_guard = EnvVarGuard::unset("LOCALAPPDATA");

        assert_eq!(receipt_path(), xdg.join("the-loop").join(RECEIPT_FILENAME));
        let receipt = load().expect("xdg-resolved receipt must load");
        assert_eq!(receipt.version, "1.2.3");
        assert_eq!(receipt.binaries, vec!["the-loop".to_string()]);

        let _ = fs::remove_dir_all(&xdg);
        let _ = fs::remove_dir_all(&home);
    }

    /// Criterion 1 + 4: with no `XDG_CONFIG_HOME` set, the platform default path
    /// is used (this crate's dev/test platform is unix, so `$HOME/.config/...`).
    #[cfg(not(windows))]
    #[test]
    fn platform_default_resolves_under_home_config() {
        let _env = crate::env_lock();
        let home = unique_temp_dir();
        write_receipt(
            &home.join(".config"),
            r#"{"version":"0.5.0","binaries":["the-loop"]}"#,
        );

        let _xdg_guard = EnvVarGuard::unset("XDG_CONFIG_HOME");
        let _home_guard = EnvVarGuard::set("HOME", &home);

        assert_eq!(
            receipt_path(),
            home.join(".config").join("the-loop").join(RECEIPT_FILENAME)
        );
        let receipt = load().expect("platform-default receipt must load");
        assert_eq!(receipt.version, "0.5.0");

        let _ = fs::remove_dir_all(&home);
    }

    /// Criterion 2 + 4: missing file is a distinct, path-naming error.
    #[test]
    fn missing_file_is_not_found_naming_path() {
        let _env = crate::env_lock();
        let xdg = unique_temp_dir();
        // Directory exists but the receipt file inside it does not.
        let _xdg_guard = EnvVarGuard::set("XDG_CONFIG_HOME", &xdg);

        let expected_path = xdg.join("the-loop").join(RECEIPT_FILENAME);
        let err = load().expect_err("missing receipt must error");
        match &err {
            ReceiptError::NotFound { path } => assert_eq!(path, &expected_path),
            other @ ReceiptError::Invalid { .. } => panic!("expected NotFound, got {other:?}"),
        }
        assert!(
            err.to_string()
                .contains(&expected_path.display().to_string()),
            "error message must carry the resolved path; got {err}"
        );

        let _ = fs::remove_dir_all(&xdg);
    }

    /// Criterion 2 + 4: malformed JSON is a distinct, path-naming error, separate
    /// from the missing-file case.
    #[test]
    fn malformed_json_is_invalid_naming_path() {
        let _env = crate::env_lock();
        let xdg = unique_temp_dir();
        write_receipt(&xdg, "{ not json");
        let _xdg_guard = EnvVarGuard::set("XDG_CONFIG_HOME", &xdg);

        let expected_path = xdg.join("the-loop").join(RECEIPT_FILENAME);
        let err = load().expect_err("malformed JSON must error");
        match &err {
            ReceiptError::Invalid { path, .. } => assert_eq!(path, &expected_path),
            other @ ReceiptError::NotFound { .. } => panic!("expected Invalid, got {other:?}"),
        }
        assert!(
            err.to_string()
                .contains(&expected_path.display().to_string()),
            "error message must carry the resolved path; got {err}"
        );

        let _ = fs::remove_dir_all(&xdg);
    }

    /// Criterion 2 + 4: valid JSON with no `version` is also `Invalid` (not
    /// `NotFound`), and names the resolved path too.
    #[test]
    fn missing_version_is_invalid_naming_path() {
        let _env = crate::env_lock();
        let xdg = unique_temp_dir();
        write_receipt(&xdg, r#"{"binaries":["the-loop"]}"#);
        let _xdg_guard = EnvVarGuard::set("XDG_CONFIG_HOME", &xdg);

        let expected_path = xdg.join("the-loop").join(RECEIPT_FILENAME);
        let err = load().expect_err("version-less receipt must error");
        match &err {
            ReceiptError::Invalid { path, reason } => {
                assert_eq!(path, &expected_path);
                assert!(
                    reason.contains("version"),
                    "reason should name the missing field; got {reason}"
                );
            }
            other @ ReceiptError::NotFound { .. } => panic!("expected Invalid, got {other:?}"),
        }
        assert!(
            err.to_string()
                .contains(&expected_path.display().to_string())
        );

        let _ = fs::remove_dir_all(&xdg);
    }

    /// Criterion 3: the real cargo-dist 0.32.0 receipt shape parses; every key
    /// besides `version` and `binaries` is ignored.
    #[test]
    fn real_cargo_dist_receipt_shape_parses() {
        let _env = crate::env_lock();
        let xdg = unique_temp_dir();
        write_receipt(
            &xdg,
            r#"{"binaries":["the-loop"],"binary_aliases":{},"install_layout":"cargo-home",
               "install_prefix":"/Users/jatassi/.cargo","modify_path":false,
               "provider":{"source":"cargo-dist","version":"0.32.0"},
               "source":{"app_name":"the-loop","name":"the-loop","owner":"jatassi","release_type":"github"},
               "version":"0.5.0"}"#,
        );
        let _xdg_guard = EnvVarGuard::set("XDG_CONFIG_HOME", &xdg);

        let receipt = load().expect("real receipt shape must parse");
        assert_eq!(receipt.version, "0.5.0");
        assert_eq!(receipt.binaries, vec!["the-loop".to_string()]);

        let _ = fs::remove_dir_all(&xdg);
    }
}
