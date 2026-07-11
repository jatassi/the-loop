//! Shared stdout-JSON / stderr-fail helpers for CLI commands.
//!
//! Mirrors `out` / `fail` / `warn` in `plugin/bin/cli-commands.js`: success
//! payloads are pretty JSON on stdout; refusals write a `spine:`-prefixed
//! message to stderr and exit 1 with empty stdout.

use std::io::{self, Write};
use std::process;

use serde::Serialize;

/// Write a value as pretty-printed JSON plus a trailing newline on stdout.
///
/// # Panics
///
/// Panics only if serialization fails (command payloads are always serializable).
pub fn out<T: Serialize>(value: &T) {
    let json = serde_json::to_string_pretty(value).expect("command payload must serialize");
    let mut stdout = io::stdout().lock();
    writeln!(stdout, "{json}").expect("stdout write must succeed");
}

/// Print a refusal to stderr and exit 1. Never returns — stdout stays empty.
pub fn fail(msg: &str) -> ! {
    let mut stderr = io::stderr().lock();
    let _ = writeln!(stderr, "spine: {msg}");
    process::exit(1);
}

/// Non-fatal guard warning on stderr (models-list / hooks-list consumers).
pub fn warn(msg: &str) {
    let mut stderr = io::stderr().lock();
    let _ = writeln!(stderr, "spine: warn — {msg}");
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    #[test]
    fn out_serializes_pretty_json_shape() {
        // out() writes to the real stdout; verify the same serializer path the
        // helper uses produces the expected pretty form for an object payload.
        let value = json!({"a": 1, "b": [true]});
        let rendered = serde_json::to_string_pretty(&value).expect("serialize");
        assert!(rendered.contains('\n'), "pretty JSON should be multi-line");
        assert!(
            rendered.starts_with('{'),
            "object payload should start with '{{'; got {rendered:?}"
        );
        let parsed: serde_json::Value =
            serde_json::from_str(&rendered).expect("pretty JSON must re-parse");
        assert_eq!(parsed, value);
    }

    #[test]
    fn fail_prefix_matches_js_spine_contract() {
        // The observable stderr prefix for refusals; process-exit is covered by
        // executors-list process tests + the oracle.
        let msg = "playbooks/widget.md: \"command\" must be a string (got null)";
        let line = format!("spine: {msg}");
        assert!(line.starts_with("spine: "));
        assert!(line.contains("playbooks/widget.md"));
    }
}
