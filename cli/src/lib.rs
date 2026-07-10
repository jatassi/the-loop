//! CLI library surface for `the-loop`.
//!
//! Clap argv dispatch for `--version` and the graph subcommands (`check`, `list`,
//! `set-status`, `status`), plus the feature-graph JSON model (canonical
//! parse/emit) and pure graph validation. `status` carries the human summary and
//! `--json` machine orientation. Shared stdout-JSON/stderr-fail helpers (`io`),
//! compiled-in plugin defaults, the pure executor registry (`executors`:
//! playbook parse + binding validation), the settings-layer reader / four-layer
//! merge resolver (`settings`), the recorded-bindings section scan
//! (`recorded_bindings`), and the pure byte-surgical settings writer
//! (`settings_write`) back the config-surface command bodies under [`commands`]
//! (`executors-list`, `models-list`, `hooks-list`, `hooks-set`).

mod commands;
mod graph;
mod status;
mod validate;

pub mod executors;
pub mod io;
pub mod recorded_bindings;
pub mod settings;
pub mod settings_write;

pub use commands::graph::{
    CommandResult, DEFAULT_GRAPH, check, list, resolve_graph_path, set_status,
};
pub use graph::{Acceptance, Feature, FeatureGraph, ParseError, emit, parse};
pub use settings_write::{SettingsWriteError, write_settings_entry};
pub use status::{
    ByStatus, IssueOut, Orientation, Position, Proposal, Refusal, State, blocking_proposed_ids,
    detect_state, eligible_set_ids, machine_orientation, propose, render_status_summary,
    run_status,
};
pub use validate::{Issue, STATUS, ValidateResult, validate};

use std::path::PathBuf;
use std::process::ExitCode;

use clap::{Parser, Subcommand};

use crate::executors::{PlaybookEntry, Registry, parse_executors};

/// Plugin model-bindings defaults (`plugin/config/model-bindings.json`), compiled in.
pub const DEFAULT_MODEL_BINDINGS_JSON: &str =
    include_str!("../../plugin/config/model-bindings.json");

/// Plugin hook-defaults (`plugin/config/hook-defaults.json`), compiled in.
pub const DEFAULT_HOOK_DEFAULTS_JSON: &str = include_str!("../../plugin/config/hook-defaults.json");

/// Default grok executor playbook (json-fenced), compiled in as the default registry.
pub const DEFAULT_GROK_PLAYBOOK: &str = include_str!("../config/executors/grok.md");

/// Path stamp used when parsing the compiled-in default playbook (stem = `grok`).
const DEFAULT_GROK_PLAYBOOK_FILE: &str = "config/executors/grok.md";

/// Root CLI. Graph subcommands are the first real clap dispatch surface;
/// config-surface commands (`executors-list`, `models-list`, `hooks-list`,
/// `hooks-set`) extend the same enum.
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
    /// Print the parsed executor-playbook registry as JSON.
    #[command(name = "executors-list")]
    ExecutorsList {
        /// Directory of `*.md` playbooks. When omitted, the compiled-in default
        /// registry is printed. An absent directory is an empty registry (exit 0).
        dir: Option<String>,
    },
    /// Print the resolved model-bindings role table with per-role provenance.
    #[command(name = "models-list")]
    ModelsList {
        /// Optional path to model-bindings defaults JSON (compiled-in when omitted).
        defaults_json: Option<String>,
        /// Optional executors directory (compiled-in default registry when omitted).
        executors_dir: Option<String>,
    },
    /// Print every real hook-family resolution plus recorded-binding status.
    #[command(name = "hooks-list")]
    HooksList,
    /// Persist one `"the-loop".<family>` entry into a settings layer.
    #[command(name = "hooks-set")]
    HooksSet {
        /// Hook family (interview, modelBindings, testHarness, lint, precommit,
        /// notification, artifactStores).
        family: String,
        /// Settings layer: user | project | local.
        layer: String,
        /// JSON value to write under `"the-loop".<family>`.
        #[arg(value_name = "json-value")]
        json_value: String,
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
            Some(Command::ExecutorsList { dir }) => {
                // These `commands::*::run` bodies print via `io::out` and return on
                // success; a refusal exits 1 itself via `io::fail` and never returns.
                commands::executors_list::run(dir.as_deref());
                ExitCode::SUCCESS
            }
            Some(Command::ModelsList {
                defaults_json,
                executors_dir,
            }) => {
                commands::models_list::run(defaults_json.as_deref(), executors_dir.as_deref());
                ExitCode::SUCCESS
            }
            Some(Command::HooksList) => {
                commands::hooks_list::run();
                ExitCode::SUCCESS
            }
            Some(Command::HooksSet {
                family,
                layer,
                json_value,
            }) => {
                commands::hooks_set::run(&family, &layer, &json_value);
                ExitCode::SUCCESS
            }
            None => ExitCode::SUCCESS,
        }
    }
}

/// Parse the compiled-in default executor registry (the json-fenced grok playbook).
///
/// # Errors
///
/// Returns a parse error if the embedded playbook is malformed (should never
/// happen for the shipping asset; unit-tested on every build).
pub fn default_executor_registry() -> Result<Registry, String> {
    parse_executors(&[PlaybookEntry {
        file: DEFAULT_GROK_PLAYBOOK_FILE,
        text: DEFAULT_GROK_PLAYBOOK,
    }])
}

/// Crate version string embedded from `Cargo.toml` (same source clap uses).
#[must_use]
pub const fn crate_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

// The settings-resolver slice's serde placeholder is retired here: `status.rs` and
// `commands::graph` already derive `serde::Serialize` on the merged tree, so the
// crate is genuinely exercised and clippy::unused_crate_dependencies stays quiet
// without it.

/// Serializes tests that mutate process-global state (HOME, current dir).
/// `cargo test` runs the crate's tests on parallel threads sharing one process,
/// so every such test must hold this guard for its full body. Poisoning is
/// ignored: a panicked holder already restored nothing worth protecting.
#[cfg(test)]
pub(crate) fn env_lock() -> std::sync::MutexGuard<'static, ()> {
    static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    LOCK.lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
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

    #[test]
    fn executors_list_subcommand_parses_optional_dir() {
        let cli = Cli::try_parse_from(["the-loop", "executors-list"])
            .expect("executors-list with no dir must parse");
        match cli.command {
            Some(Command::ExecutorsList { dir: None }) => {}
            other => panic!("expected ExecutorsList {{ dir: None }}, got {other:?}"),
        }

        let cli = Cli::try_parse_from(["the-loop", "executors-list", "config/executors"])
            .expect("executors-list with dir must parse");
        match cli.command {
            Some(Command::ExecutorsList { dir: Some(d) }) => {
                assert_eq!(d, "config/executors");
            }
            other => panic!("expected ExecutorsList with dir, got {other:?}"),
        }
    }

    #[test]
    fn hooks_set_subcommand_parses_three_positionals() {
        let cli = Cli::try_parse_from([
            "the-loop",
            "hooks-set",
            "testHarness",
            "project",
            r#"{"command":"npm test"}"#,
        ])
        .expect("hooks-set with three args must parse");
        match cli.command {
            Some(Command::HooksSet {
                family,
                layer,
                json_value,
            }) => {
                assert_eq!(family, "testHarness");
                assert_eq!(layer, "project");
                assert_eq!(json_value, r#"{"command":"npm test"}"#);
            }
            other => panic!("expected HooksSet, got {other:?}"),
        }
    }

    #[test]
    fn hooks_set_too_few_args_fails_parse() {
        let err = Cli::try_parse_from(["the-loop", "hooks-set", "lint", "project"])
            .expect_err("missing json-value must fail parse");
        let rendered = err.to_string();
        assert!(
            rendered.to_ascii_lowercase().contains("usage")
                || rendered.contains("required")
                || rendered.contains("json-value"),
            "missing-arg error should mention usage or required arg; got {rendered:?}"
        );
    }

    #[test]
    fn default_executor_registry_contains_grok() {
        let registry = default_executor_registry().expect("embedded grok playbook must parse");
        assert!(registry.contains_key("grok"));
    }

    #[test]
    fn models_list_subcommand_parses_optional_args() {
        let cli = Cli::try_parse_from(["the-loop", "models-list"])
            .expect("models-list with no args must parse");
        match cli.command {
            Some(Command::ModelsList {
                defaults_json: None,
                executors_dir: None,
            }) => {}
            other => panic!("expected ModelsList with no args, got {other:?}"),
        }

        let cli = Cli::try_parse_from([
            "the-loop",
            "models-list",
            "defaults.json",
            "config/executors",
        ])
        .expect("models-list with both args must parse");
        match cli.command {
            Some(Command::ModelsList {
                defaults_json: Some(d),
                executors_dir: Some(e),
            }) => {
                assert_eq!(d, "defaults.json");
                assert_eq!(e, "config/executors");
            }
            other => panic!("expected ModelsList with both args, got {other:?}"),
        }
    }

    #[test]
    fn hooks_list_subcommand_parses() {
        let cli = Cli::try_parse_from(["the-loop", "hooks-list"]).expect("hooks-list must parse");
        match cli.command {
            Some(Command::HooksList) => {}
            other => panic!("expected HooksList, got {other:?}"),
        }
    }
}
