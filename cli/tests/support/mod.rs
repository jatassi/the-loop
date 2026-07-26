//! Shared test-only helpers for the `cli-upgrade` fixture integration tests.
//!
//! Each test binary (`fixture_release.rs` today, `upgrade_fixture.rs` once it
//! lands) declares `mod support;` and uses only the subset of helpers it
//! needs, so the crate-wide `#![allow(dead_code)]` below is inner-scoped to
//! this module rather than sprinkled per-item.
#![allow(
    dead_code,
    reason = "two test binaries each use a subset of these shared helpers; the workspace denies warnings"
)]

pub mod fixture_release;
pub mod http_server;
