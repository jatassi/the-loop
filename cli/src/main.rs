//! `the-loop` binary entrypoint — clap argv dispatch to the command surface.

use std::process::ExitCode;

use clap::Parser;
use the_loop::Cli;

fn main() -> ExitCode {
    // Clap prints --version / usage errors to stderr and exits; a parsed CLI is
    // dispatched to its command, whose exit code becomes the process exit code.
    Cli::parse().run()
}
