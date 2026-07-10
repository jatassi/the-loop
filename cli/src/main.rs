//! `the-loop` binary entrypoint — clap argv dispatch only in this scaffold slice.

use clap::Parser;
use the_loop::Cli;

fn main() {
    // Clap prints --version / usage errors to stderr and exits; success path is
    // a no-op until real subcommands land.
    let _cli = Cli::parse();
}
