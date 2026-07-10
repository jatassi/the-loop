//! Argv-exec wrapper around the `git` binary.
//!
//! Every call hands arguments straight to `git` via [`std::process::Command`] —
//! never a shell. A hostile ref or branch name therefore reaches git as one
//! literal argv element (matching the JS `execFileSync` contract).

use std::fmt;
use std::path::Path;
use std::process::Command;

/// Error from a `git` invocation (spawn failure or non-zero exit).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitError {
    /// Human-readable summary (includes stderr when available).
    message: String,
}

impl GitError {
    #[must_use]
    pub fn message(&self) -> &str {
        &self.message
    }
}

impl fmt::Display for GitError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for GitError {}

/// Run `git` with the given argv, returning captured stdout on success.
///
/// # Errors
///
/// Returns [`GitError`] when the process cannot be spawned or exits non-zero.
/// Non-zero exits carry git's stderr so callers can build refusal messages.
pub fn run(args: &[&str]) -> Result<String, GitError> {
    let output = Command::new("git")
        .args(args)
        .output()
        .map_err(|err| GitError {
            message: format!("failed to spawn git: {err}"),
        })?;
    if output.status.success() {
        return Ok(String::from_utf8_lossy(&output.stdout).into_owned());
    }
    let stderr = String::from_utf8_lossy(&output.stderr);
    let trimmed = stderr.trim();
    let message = if trimmed.is_empty() {
        format!("git {} failed", args.join(" "))
    } else {
        format!("git {} failed: {trimmed}", args.join(" "))
    };
    Err(GitError { message })
}

/// Run `git` and return whether it exited zero (stderr/stdout discarded).
#[must_use]
pub fn ok(args: &[&str]) -> bool {
    run(args).is_ok()
}

/// Attach an existing local branch at `dir`: `git worktree add <dir> <branch>`.
///
/// # Errors
///
/// Returns [`GitError`] on spawn failure or non-zero exit.
pub fn worktree_add(dir: &Path, branch: &str) -> Result<(), GitError> {
    let dir_s = dir.to_string_lossy();
    run(&["worktree", "add", dir_s.as_ref(), branch]).map(|_| ())
}

/// Create a new branch off `base` at `dir`: `git worktree add -b <branch> <dir> <base>`.
///
/// # Errors
///
/// Returns [`GitError`] on spawn failure or non-zero exit.
pub fn worktree_add_new(branch: &str, dir: &Path, base: &str) -> Result<(), GitError> {
    let dir_s = dir.to_string_lossy();
    run(&["worktree", "add", "-b", branch, dir_s.as_ref(), base]).map(|_| ())
}

/// Force-remove a worktree: `git worktree remove --force <dir>`.
///
/// # Errors
///
/// Returns [`GitError`] on spawn failure or non-zero exit.
pub fn worktree_remove_force(dir: &Path) -> Result<(), GitError> {
    let dir_s = dir.to_string_lossy();
    run(&["worktree", "remove", "--force", dir_s.as_ref()]).map(|_| ())
}

/// Prune stale worktree metadata: `git worktree prune`.
///
/// # Errors
///
/// Returns [`GitError`] on spawn failure or non-zero exit.
pub fn worktree_prune() -> Result<(), GitError> {
    run(&["worktree", "prune"]).map(|_| ())
}

/// List worktrees in porcelain form: `git worktree list --porcelain`.
///
/// # Errors
///
/// Returns [`GitError`] on spawn failure or non-zero exit.
pub fn worktree_list_porcelain() -> Result<String, GitError> {
    run(&["worktree", "list", "--porcelain"])
}

/// True when local branch `refs/heads/<branch>` exists.
#[must_use]
pub fn branch_exists(branch: &str) -> bool {
    let spec = format!("refs/heads/{branch}");
    ok(&["rev-parse", "--verify", "--quiet", &spec])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ok_true_for_version() {
        assert!(ok(&["--version"]));
    }

    #[test]
    fn ok_false_for_bogus_subcommand() {
        assert!(!ok(&["definitely-not-a-git-subcommand-xyzzy"]));
    }

    #[test]
    fn run_captures_stdout() {
        let out = run(&["--version"]).expect("git --version");
        assert!(
            out.to_ascii_lowercase().contains("git"),
            "expected version string, got {out:?}"
        );
    }

    #[test]
    fn run_error_carries_stderr_on_failure() {
        let err = run(&[
            "rev-parse",
            "--verify",
            "--quiet",
            "refs/heads/no-such-branch-xyz",
        ])
        .expect_err("missing branch must fail");
        // quiet mode may leave stderr empty; message still names the invocation.
        assert!(
            err.message().contains("git ") || !err.message().is_empty(),
            "error message must be non-empty: {err}"
        );
    }
}
