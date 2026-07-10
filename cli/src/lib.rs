//! CLI library surface for `the-loop`.
//!
//! Clap argv dispatch for `--version` and the graph subcommands (`check`, `list`,
//! `set-status`, `status`), plus the feature-graph JSON model (canonical
//! parse/emit) and pure graph validation. `status` carries the human summary and
//! `--json` machine orientation; later verticals (plan, …) extend the same
//! stdout-is-JSON dispatch shape.

mod commands;
mod graph;
mod status;
mod validate;

pub use commands::{CommandResult, DEFAULT_GRAPH, check, list, resolve_graph_path, set_status};
pub use graph::{Acceptance, Feature, FeatureGraph, ParseError, emit, parse};
pub use status::{
    ByStatus, IssueOut, Orientation, Position, Proposal, Refusal, State, blocking_proposed_ids,
    detect_state, eligible_set_ids, machine_orientation, propose, render_status_summary,
    run_status,
};
pub use validate::{Issue, STATUS, ValidateResult, validate};

use std::path::PathBuf;
use std::process::ExitCode;

use clap::{Parser, Subcommand};

/// Root CLI. Graph subcommands are the first real clap dispatch surface.
#[derive(Parser, Debug)]
#[command(
    name = "the-loop",
    version,
    about = "An owned, composable agentic dev loop"
)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Option<Command>,
}

/// Subcommands. Success payloads are JSON on stdout; refusals leave stdout empty.
#[derive(Subcommand, Debug)]
pub enum Command {
    /// Validate the feature graph (schema + edges + round-trip) and print OK/FAIL.
    Check {
        /// Path to `feature-graph.json` (default: `docs/feature-graph.json`).
        path: Option<PathBuf>,
    },
    /// Print the parsed feature graph as JSON (`designVersion` + `features`).
    List {
        /// Path to `feature-graph.json` (default: `docs/feature-graph.json`).
        path: Option<PathBuf>,
    },
    /// Flip one feature's durable status and rewrite the graph canonically.
    #[command(name = "set-status")]
    SetStatus {
        /// Feature id to update.
        id: String,
        /// New status (`proposed` | `designed` | `validated` | `shipped`).
        status: String,
        /// Path to `feature-graph.json` (default: `docs/feature-graph.json`).
        path: Option<PathBuf>,
    },
    /// Project status: the human summary, or `--json` machine orientation.
    Status {
        /// Emit the machine orientation as JSON instead of the human summary.
        #[arg(long)]
        json: bool,
        /// Human form: graph file path (default `docs/feature-graph.json`).
        /// `--json`: repo root (default `.`).
        path: Option<String>,
    },
}

impl Cli {
    /// Dispatch the parsed CLI to its command, returning the process exit code.
    /// No subcommand is a success no-op (usage help is clap's job on error paths).
    #[must_use]
    pub fn run(self) -> ExitCode {
        match self.command {
            Some(Command::Check { path }) => check(&resolve_graph_path(path)).into_exit_code(),
            Some(Command::List { path }) => list(&resolve_graph_path(path)).into_exit_code(),
            Some(Command::SetStatus { id, status, path }) => {
                set_status(&resolve_graph_path(path), &id, &status).into_exit_code()
            }
            Some(Command::Status { json, path }) => run_status(json, path.as_deref()),
            None => ExitCode::SUCCESS,
        }
    }
}

/// Crate version string embedded from `Cargo.toml` (same source clap uses).
#[must_use]
pub const fn crate_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
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

    #[test]
    fn check_list_set_status_parse_as_subcommands() {
        let check = Cli::try_parse_from(["the-loop", "check"]).expect("check");
        assert!(matches!(
            check.command,
            Some(Command::Check { path: None })
        ));

        let list = Cli::try_parse_from(["the-loop", "list", "alt.json"]).expect("list");
        match list.command {
            Some(Command::List { path: Some(p) }) => {
                assert_eq!(p, PathBuf::from("alt.json"));
            }
            other => panic!("expected List with path, got {other:?}"),
        }

        let set = Cli::try_parse_from(["the-loop", "set-status", "alpha", "validated", "g.json"])
            .expect("set-status");
        match set.command {
            Some(Command::SetStatus {
                id,
                status,
                path: Some(p),
            }) => {
                assert_eq!(id, "alpha");
                assert_eq!(status, "validated");
                assert_eq!(p, PathBuf::from("g.json"));
            }
            other => panic!("expected SetStatus, got {other:?}"),
        }
    }
}
