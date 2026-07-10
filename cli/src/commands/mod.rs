//! CLI command implementations. Dispatch lands in `lib::Command`; each module
//! owns one subcommand body. `graph` bundles the three graph subcommands
//! (`check`, `list`, `set-status`) shipped before this directory existed.

pub mod executors_list;
pub mod graph;
pub mod hooks_list;
pub mod hooks_set;
pub mod models_list;
