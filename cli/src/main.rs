//! `the-loop` binary entrypoint — clap argv dispatch with exit-code mapping.
//!
//! Refusal paths from command bodies exit 1 (graph commands via `CommandResult`;
//! config commands via `io::fail`). Clap parse errors (unknown subcommand, bad
//! flags) are mapped to exit 1 as well — matching the JS CLI and the oracle's
//! refusal expectation — instead of clap's default 2. `--version` / `--help`
//! still exit 0.

use std::process::ExitCode;

use clap::Parser;
use clap::error::ErrorKind;
use the_loop::Cli;

fn main() -> ExitCode {
    match Cli::try_parse() {
        Ok(cli) => cli.run(),
        Err(err) => {
            // Map non-display errors from clap's default exit 2 → 1 for oracle parity.
            let code = match err.kind() {
                ErrorKind::DisplayHelp | ErrorKind::DisplayVersion => ExitCode::SUCCESS,
                _ => ExitCode::FAILURE,
            };
            // `print` writes help/version to stdout and errors to stderr — same as clap.
            let _ = err.print();
            code
        }
    }
}
