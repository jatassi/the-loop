//! CLI library surface for `the-loop`.
//!
//! This slice only exposes clap argv dispatch for `--version`. Command parity
//! and artifact parsing land in later slices; `serde` / `serde_json` are
//! declared now so the JSON spine is on the dependency graph from commit one.

use clap::Parser;

/// Root CLI. Subcommands are intentionally empty in this scaffold slice.
#[derive(Parser, Debug)]
#[command(
    name = "the-loop",
    version,
    about = "An owned, composable agentic dev loop"
)]
pub struct Cli {}

/// Crate version string embedded from `Cargo.toml` (same source clap uses).
#[must_use]
pub const fn crate_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

// Hold the JSON-spine crates on the graph until artifact parsing lands.
// Clippy's `unused_crate_dependencies` (cargo group) would otherwise deny them.
#[allow(
    dead_code,
    reason = "serde/serde_json reserved for the JSON spine; usage lands in a later slice"
)]
fn _json_spine_placeholder() -> serde_json::Value {
    #[derive(serde::Serialize)]
    struct Spine {
        ready: bool,
    }
    serde_json::to_value(Spine { ready: true }).unwrap_or(serde_json::Value::Null)
}

#[cfg(test)]
mod tests {
    use super::*;
    use clap::Parser;
    use clap::error::ErrorKind;

    #[test]
    fn crate_version_is_non_empty_and_matches_cargo_pkg() {
        let version = crate_version();
        assert!(
            !version.is_empty(),
            "crate version must be non-empty for --version output"
        );
        assert_eq!(version, env!("CARGO_PKG_VERSION"));
        // Semver-ish: at least one dot (e.g. 0.1.0), not a tautology on emptiness alone.
        assert!(
            version.contains('.'),
            "expected semver-like version, got {version:?}"
        );
    }

    #[test]
    fn version_flag_is_handled_by_clap() {
        let err = Cli::try_parse_from(["the-loop", "--version"])
            .expect_err("--version should short-circuit via clap DisplayVersion");
        assert_eq!(err.kind(), ErrorKind::DisplayVersion);
        let rendered = err.to_string();
        assert!(
            rendered.contains(crate_version()),
            "version output should include crate version; got {rendered:?}"
        );
    }

    #[test]
    fn unknown_subcommand_errors_with_usage_and_no_stdout_payload() {
        let err = Cli::try_parse_from(["the-loop", "not-a-real-command"])
            .expect_err("unknown subcommand must fail parse");
        assert_ne!(
            err.kind(),
            ErrorKind::DisplayVersion,
            "unknown command must not be treated as --version"
        );
        assert_ne!(err.kind(), ErrorKind::DisplayHelp);

        // Clap's rendered error is what lands on stderr in main; it must carry a
        // usage line. The binary must print nothing on stdout (stdout-is-JSON
        // contract) — verified separately by the process integration test.
        let rendered = err.to_string();
        assert!(
            rendered.to_ascii_lowercase().contains("usage"),
            "error must include a usage line; got {rendered:?}"
        );
        // No JSON / success payload shape on the error render path.
        assert!(
            !rendered.trim_start().starts_with('{'),
            "error render must not look like a JSON stdout payload"
        );
    }
}
