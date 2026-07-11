//! `worktree-create` / `worktree-remove` — the sanctioned worktree verbs.
//!
//! Ports `worktreeCreateCommand` / `worktreeRemoveCommand` and the ADR-0052
//! provisioning helpers (`resolveWorktreeSetup`, `worktreeSetupCommand`,
//! `provisionWorktree`, `worktreeDirFor`) from `plugin/bin/cli-commands.js`.
//! Git is always argv-exec ([`crate::git`]); the setup command runs via the
//! system shell with cwd the new worktree root.

use std::io::Read;
use std::path::{MAIN_SEPARATOR, Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};
use std::{env, fs};

use serde::Serialize;
use serde_json::Value;

use crate::DEFAULT_HOOK_DEFAULTS_JSON;
use crate::git;
use crate::io::{fail, out};
use crate::settings::{
    LayerSources, family_layer, local_settings_path, project_settings_path, read_settings_layer,
    resolve_family, user_settings_path,
};

/// Relative worktrees root (matches JS `WORKTREES_DIR`).
const WORKTREES_DIR: &str = ".claude/worktrees";

/// Default setup-command budget when the binding omits `timeout` (ms).
const DEFAULT_TIMEOUT_MS: u64 = 600_000;

/// Max stderr tail included in the provisioning-failure message (chars).
const STDERR_TAIL_CHARS: usize = 2000;

/// Success payload for `worktree-create`.
#[derive(Debug, Serialize, PartialEq, Eq)]
struct CreateResult {
    path: String,
    branch: String,
    created: bool,
}

/// Success payload for `worktree-remove`.
#[derive(Debug, Serialize, PartialEq, Eq)]
struct RemoveResult {
    removed: String,
}

/// Outcome of running the setup command via the system shell.
#[derive(Debug)]
enum ShellOutcome {
    Success,
    Failed { reason: String, stderr: String },
}

/// `worktree-create <branch> [--base-branch <ref>]`.
///
/// Directory is `.claude/worktrees/<branch with `/` → `-`>`. An existing dir
/// returns `{created:false}` before the binding is resolved. Otherwise the
/// `worktreeSetup` family alone is resolved (never the full hooks table); a
/// string `command` runs after `git worktree add`, and failure tears the
/// worktree down.
pub fn create(branch: &str, base_branch: Option<&str>) {
    let dir = worktree_dir_for_branch(branch);
    let dir_path = PathBuf::from(&dir);

    if dir_path.exists() {
        out(&CreateResult {
            path: dir,
            branch: branch.to_owned(),
            created: false,
        });
        return;
    }

    let setup = match resolve_worktree_setup() {
        Ok(v) => v,
        Err(msg) => fail(&msg),
    };
    let command = match worktree_setup_command(&setup) {
        Ok(c) => c,
        Err(msg) => fail(&msg),
    };

    let base = base_branch.unwrap_or("main");
    if git::branch_exists(branch) {
        if let Err(err) = git::worktree_add(&dir_path, branch) {
            fail(err.message());
        }
    } else if let Err(err) = git::worktree_add_new(branch, &dir_path, base) {
        fail(err.message());
    }

    if let Some(cmd) = command.as_deref() {
        provision_worktree(&dir_path, &dir, cmd, &setup);
    }

    out(&CreateResult {
        path: dir,
        branch: branch.to_owned(),
        created: true,
    });
}

/// `worktree-remove <path-or-branch>`.
///
/// Resolves a path on disk or a branch via `git worktree list --porcelain`,
/// refuses when the caller's cwd is inside the target's realpath, then
/// force-removes and prunes.
pub fn remove(target: &str) {
    let dir = match worktree_dir_for(target) {
        Ok(d) => d,
        Err(msg) => fail(&msg),
    };

    if cwd_inside_target(&dir) {
        fail(&format!(
            "refusing: cwd is inside {dir} — cd out of the worktree first"
        ));
    }

    let dir_path = PathBuf::from(&dir);
    if let Err(err) = git::worktree_remove_force(&dir_path) {
        fail(err.message());
    }
    if let Err(err) = git::worktree_prune() {
        fail(err.message());
    }
    out(&RemoveResult { removed: dir });
}

/// `.claude/worktrees/<branch with every `/` replaced by `-`>`.
#[must_use]
pub fn worktree_dir_for_branch(branch: &str) -> String {
    let dashed = branch.replace('/', "-");
    // Match Node `path.join(WORKTREES_DIR, dashed)` on Unix (oracle host).
    Path::new(WORKTREES_DIR)
        .join(dashed)
        .to_string_lossy()
        .into_owned()
}

/// Resolve the `worktreeSetup` family alone across the four settings layers.
///
/// Never builds the full hooks table — a malformed unrelated family must not
/// break create. Embedded `hook-defaults.json` may omit the key (inventory
/// fallback `{provisioning:"none"}` applies).
fn resolve_worktree_setup() -> Result<Value, String> {
    const FAMILY: &str = "worktreeSetup";
    let hook_defaults: Value = serde_json::from_str(DEFAULT_HOOK_DEFAULTS_JSON)
        .map_err(|e| format!("unparseable embedded hook-defaults: {e}"))?;
    let defaults = hook_defaults.get(FAMILY).cloned();

    let user_raw = read_settings_layer(user_settings_path(), FAMILY).map_err(|e| e.to_string())?;
    let project_raw =
        read_settings_layer(project_settings_path(), FAMILY).map_err(|e| e.to_string())?;
    let local_raw =
        read_settings_layer(local_settings_path(), FAMILY).map_err(|e| e.to_string())?;

    let layers = LayerSources {
        defaults,
        user: family_layer(FAMILY, user_raw),
        project: family_layer(FAMILY, project_raw),
        local: family_layer(FAMILY, local_raw),
    };
    resolve_family(FAMILY, &layers).map_err(|e| e.to_string())
}

/// String command to run, or `None` for the no-provisioning fallback.
///
/// Anything else is a configuration gap (fail closed — never guess a command).
fn worktree_setup_command(setup: &Value) -> Result<Option<String>, String> {
    if let Some(Value::String(cmd)) = setup.get("command") {
        return Ok(Some(cmd.clone()));
    }
    let provisioning = setup.get("provisioning").and_then(Value::as_str);
    let provenance = setup.get("provenance").and_then(Value::as_str);
    if provisioning == Some("none") && provenance == Some("fallback") {
        return Ok(None);
    }
    let provenance = provenance.unwrap_or("unknown");
    let got = setup
        .get("command")
        .map_or_else(|| "null".to_owned(), ToString::to_string);
    Err(format!(
        "worktreeSetup binding is malformed (layer {provenance}): command must be a string (got {got})"
    ))
}

/// Run the bound command in `dir`; on any failure tear the worktree down and exit 1.
fn provision_worktree(dir_path: &Path, dir_display: &str, command: &str, setup: &Value) {
    let budget = timeout_budget_ms(setup);
    let outcome = run_shell(command, dir_path, budget);
    match outcome {
        ShellOutcome::Success => {}
        ShellOutcome::Failed { reason, stderr } => {
            let _ = git::worktree_remove_force(dir_path);
            let _ = git::worktree_prune();
            let cmd_json = serde_json::to_string(command).unwrap_or_else(|_| "\"\"".to_owned());
            let provenance = setup
                .get("provenance")
                .and_then(Value::as_str)
                .unwrap_or("unknown");
            let tail = stderr_tail(&stderr, STDERR_TAIL_CHARS);
            fail(&format!(
                "worktree provisioning failed: command {cmd_json} in {dir_display} (layer {provenance}) {reason}\n{tail}"
            ));
        }
    }
}

fn timeout_budget_ms(setup: &Value) -> u64 {
    match setup.get("timeout") {
        Some(Value::Number(n)) => n
            .as_u64()
            .or_else(|| n.as_i64().and_then(|i| u64::try_from(i).ok()))
            .unwrap_or(DEFAULT_TIMEOUT_MS),
        _ => DEFAULT_TIMEOUT_MS,
    }
}

/// Spawn the setup command via the system shell (`sh -c` / `cmd /C`).
///
/// Captures stdout/stderr on reader threads while polling for exit or timeout
/// so a large child output cannot deadlock the pipes.
fn run_shell(command: &str, cwd: &Path, timeout_ms: u64) -> ShellOutcome {
    let mut child = match spawn_shell(command, cwd) {
        Ok(c) => c,
        Err(err) => {
            return ShellOutcome::Failed {
                reason: format!("spawn error: {err}"),
                stderr: String::new(),
            };
        }
    };

    let stdout_pipe = child.stdout.take();
    let stderr_pipe = child.stderr.take();
    let (tx_out, rx_out) = mpsc::channel();
    let (tx_err, rx_err) = mpsc::channel();

    let out_handle = thread::spawn(move || {
        let mut buf = Vec::new();
        if let Some(mut pipe) = stdout_pipe {
            let _ = pipe.read_to_end(&mut buf);
        }
        let _ = tx_out.send(buf);
    });
    let err_handle = thread::spawn(move || {
        let mut buf = Vec::new();
        if let Some(mut pipe) = stderr_pipe {
            let _ = pipe.read_to_end(&mut buf);
        }
        let _ = tx_err.send(buf);
    });

    let deadline = Instant::now() + Duration::from_millis(timeout_ms);
    let wait_result = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Ok(status),
            Ok(None) => {
                if Instant::now() >= deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    break Err(());
                }
                thread::sleep(Duration::from_millis(10));
            }
            Err(err) => {
                let _ = out_handle.join();
                let _ = err_handle.join();
                return ShellOutcome::Failed {
                    reason: format!("spawn error: {err}"),
                    stderr: String::new(),
                };
            }
        }
    };

    let _ = out_handle.join();
    let _ = err_handle.join();
    let _stdout = rx_out.recv().unwrap_or_default();
    let stderr_bytes = rx_err.recv().unwrap_or_default();
    let stderr = String::from_utf8_lossy(&stderr_bytes).into_owned();

    match wait_result {
        Err(()) => ShellOutcome::Failed {
            reason: format!("timed out after {timeout_ms}ms"),
            stderr,
        },
        Ok(status) if status.success() => ShellOutcome::Success,
        Ok(status) => {
            let reason = status.code().map_or_else(
                || "spawn error: unknown".to_owned(),
                |n| format!("exit code {n}"),
            );
            ShellOutcome::Failed { reason, stderr }
        }
    }
}

fn spawn_shell(command: &str, cwd: &Path) -> std::io::Result<std::process::Child> {
    #[cfg(windows)]
    {
        Command::new("cmd")
            .args(["/C", command])
            .current_dir(cwd)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
    }
    #[cfg(not(windows))]
    {
        Command::new("sh")
            .args(["-c", command])
            .current_dir(cwd)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
    }
}

fn stderr_tail(stderr: &str, max_chars: usize) -> String {
    if stderr.chars().count() <= max_chars {
        return stderr.to_owned();
    }
    let skip = stderr.chars().count().saturating_sub(max_chars);
    stderr.chars().skip(skip).collect()
}

/// Resolve path-or-branch to a worktree directory string.
fn worktree_dir_for(target: &str) -> Result<String, String> {
    if Path::new(target).exists() {
        return Ok(target.to_owned());
    }
    let porcelain = git::worktree_list_porcelain().map_err(|e| e.to_string())?;
    // Blocks are separated by blank lines (JS: split on `\n\n`).
    let branch_line = format!("branch refs/heads/{target}");
    for block in porcelain.split("\n\n") {
        let lines: Vec<&str> = block.lines().collect();
        if !lines.iter().any(|l| *l == branch_line) {
            continue;
        }
        for line in lines {
            if let Some(path) = line.strip_prefix("worktree ") {
                return Ok(path.to_owned());
            }
        }
    }
    Err(format!("no worktree at path or for branch: {target}"))
}

/// Refuse when the caller's raw cwd is inside the target's realpath.
///
/// Compares `cwd + sep` against `realpath(resolve(dir)) + sep` with `starts_with`
/// (matches JS `process.cwd` / `realpathSync(path.resolve(dir))`).
fn cwd_inside_target(dir: &str) -> bool {
    let Ok(cwd) = env::current_dir() else {
        return false;
    };
    let resolved = if Path::new(dir).is_absolute() {
        PathBuf::from(dir)
    } else {
        cwd.join(dir)
    };
    let Ok(real) = fs::canonicalize(&resolved) else {
        return false;
    };
    let cwd_s = format!("{}{MAIN_SEPARATOR}", cwd.display());
    let real_s = format!("{}{MAIN_SEPARATOR}", real.display());
    cwd_s.starts_with(&real_s)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command as ProcCommand;
    use std::sync::OnceLock;
    use std::time::{SystemTime, UNIX_EPOCH};

    use serde_json::json;

    fn bin() -> PathBuf {
        static BIN: OnceLock<PathBuf> = OnceLock::new();
        BIN.get_or_init(|| {
            if let Ok(p) = std::env::var("CARGO_BIN_EXE_the-loop") {
                return PathBuf::from(p);
            }
            let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
            path.push("../target/debug/the-loop");
            if path.exists() {
                return path;
            }
            let mut release = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
            release.push("../target/release/the-loop");
            release
        })
        .clone()
    }

    fn ensure_bin() {
        let path = bin();
        if path.exists() {
            return;
        }
        let status = ProcCommand::new("cargo")
            .args(["build", "-p", "the-loop", "--quiet"])
            .current_dir(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(".."))
            .status()
            .expect("cargo build must start");
        assert!(status.success(), "cargo build -p the-loop failed");
        assert!(
            bin().exists(),
            "expected binary at {} after cargo build",
            bin().display()
        );
    }

    fn tempfile_dir(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |d| d.as_nanos());
        let dir =
            std::env::temp_dir().join(format!("the-loop-{label}-{}-{nanos}", std::process::id()));
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    fn git_in(cwd: &Path, args: &[&str]) {
        let out = ProcCommand::new("git")
            .args(args)
            .current_dir(cwd)
            .output()
            .expect("spawn git");
        assert!(
            out.status.success(),
            "git {} failed: {}",
            args.join(" "),
            String::from_utf8_lossy(&out.stderr)
        );
    }

    fn git_fixture() -> PathBuf {
        let root = tempfile_dir("wt-fixture");
        git_in(&root, &["init", "-q", "-b", "main"]);
        git_in(&root, &["config", "user.email", "test@the-loop.local"]);
        git_in(&root, &["config", "user.name", "test"]);
        fs::write(root.join("README.md"), "# fixture\n").expect("write");
        git_in(&root, &["add", "-A"]);
        git_in(&root, &["commit", "-qm", "seed"]);
        root
    }

    fn spawn_in(cwd: &Path, args: &[&str]) -> std::process::Output {
        ProcCommand::new(bin())
            .current_dir(cwd)
            .env("HOME", tempfile_dir("wt-home"))
            .args(args)
            .output()
            .unwrap_or_else(|err| panic!("failed to spawn the-loop: {err}"))
    }

    #[test]
    fn worktree_dir_maps_slashes_to_dashes() {
        assert_eq!(
            worktree_dir_for_branch("loop/widget"),
            Path::new(WORKTREES_DIR)
                .join("loop-widget")
                .to_string_lossy()
        );
        assert_eq!(
            worktree_dir_for_branch("loop/a/b"),
            Path::new(WORKTREES_DIR).join("loop-a-b").to_string_lossy()
        );
    }

    #[test]
    fn worktree_setup_command_string_or_fallback_or_malformed() {
        let cmd = worktree_setup_command(&json!({"command": "npm ci", "provenance": "project"}))
            .expect("ok");
        assert_eq!(cmd.as_deref(), Some("npm ci"));

        let none = worktree_setup_command(&json!({
            "provisioning": "none",
            "provenance": "fallback"
        }))
        .expect("ok");
        assert!(none.is_none());

        let err = worktree_setup_command(&json!({"timeout": 1000, "provenance": "project"}))
            .expect_err("malformed");
        assert!(err.contains("worktreeSetup"));
        assert!(err.contains("project"));
        assert!(err.contains("command"));

        let err2 = worktree_setup_command(&json!({"command": 42, "provenance": "local"}))
            .expect_err("non-string");
        assert!(err2.contains("command"));
        assert!(err2.contains("42"));
    }

    #[test]
    fn timeout_budget_defaults_and_overrides() {
        assert_eq!(
            timeout_budget_ms(&json!({"command": "x", "provenance": "project"})),
            DEFAULT_TIMEOUT_MS
        );
        assert_eq!(
            timeout_budget_ms(&json!({"command": "x", "timeout": 200, "provenance": "project"})),
            200
        );
    }

    #[test]
    fn stderr_tail_keeps_last_n_chars() {
        let s = "a".repeat(2500);
        let tail = stderr_tail(&s, 2000);
        assert_eq!(tail.chars().count(), 2000);
        assert!(tail.ends_with('a'));
    }

    #[test]
    fn process_create_new_and_idempotent() {
        ensure_bin();
        let root = git_fixture();
        let create = spawn_in(
            &root,
            &["worktree-create", "loop/widget", "--base-branch", "main"],
        );
        assert!(
            create.status.success(),
            "stderr: {}",
            String::from_utf8_lossy(&create.stderr)
        );
        let body: Value = serde_json::from_slice(&create.stdout).expect("JSON");
        let expected_path = worktree_dir_for_branch("loop/widget");
        assert_eq!(body["path"], expected_path);
        assert_eq!(body["branch"], "loop/widget");
        assert_eq!(body["created"], true);
        assert!(root.join(&expected_path).exists());

        let again = spawn_in(&root, &["worktree-create", "loop/widget"]);
        assert!(again.status.success());
        let body2: Value = serde_json::from_slice(&again.stdout).expect("JSON");
        assert_eq!(body2["created"], false);
        assert_eq!(body2["path"], expected_path);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn process_remove_by_path_and_by_branch() {
        ensure_bin();
        let root = git_fixture();
        let create = spawn_in(
            &root,
            &["worktree-create", "loop/widget", "--base-branch", "main"],
        );
        assert!(create.status.success());
        let body: Value = serde_json::from_slice(&create.stdout).expect("JSON");
        let path = body["path"].as_str().expect("path").to_owned();

        let rm = spawn_in(&root, &["worktree-remove", &path]);
        assert!(
            rm.status.success(),
            "stderr: {}",
            String::from_utf8_lossy(&rm.stderr)
        );
        let removed: Value = serde_json::from_slice(&rm.stdout).expect("JSON");
        assert_eq!(removed["removed"], path);
        assert!(!root.join(&path).exists());

        // recreate and remove by branch
        let create2 = spawn_in(
            &root,
            &["worktree-create", "loop/widget", "--base-branch", "main"],
        );
        assert!(create2.status.success());
        let rm2 = spawn_in(&root, &["worktree-remove", "loop/widget"]);
        assert!(
            rm2.status.success(),
            "stderr: {}",
            String::from_utf8_lossy(&rm2.stderr)
        );
        let removed2: Value = serde_json::from_slice(&rm2.stdout).expect("JSON");
        assert!(removed2.get("removed").is_some());
        assert!(!root.join(worktree_dir_for_branch("loop/widget")).exists());

        let unknown = spawn_in(&root, &["worktree-remove", "loop/nonexistent"]);
        assert!(!unknown.status.success());
        assert!(unknown.stdout.is_empty());
        let err = String::from_utf8_lossy(&unknown.stderr);
        assert!(err.contains("loop/nonexistent"), "stderr: {err}");

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn process_remove_refuses_when_cwd_inside_target() {
        ensure_bin();
        let root = git_fixture();
        let create = spawn_in(
            &root,
            &["worktree-create", "loop/widget", "--base-branch", "main"],
        );
        assert!(create.status.success());
        let path = worktree_dir_for_branch("loop/widget");
        let inside = root.join(&path);
        let refused = ProcCommand::new(bin())
            .current_dir(&inside)
            .env("HOME", tempfile_dir("wt-home-in"))
            .args(["worktree-remove", "loop/widget"])
            .output()
            .expect("spawn");
        assert!(!refused.status.success());
        let err = String::from_utf8_lossy(&refused.stderr);
        assert!(
            err.contains("cd out of the worktree first"),
            "stderr: {err}"
        );
        assert!(inside.join("README.md").exists());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn process_bound_setup_runs_in_worktree() {
        ensure_bin();
        let root = git_fixture();
        let settings = json!({
            "the-loop": {
                "worktreeSetup": { "command": "echo provisioned > marker.txt" }
            }
        });
        fs::create_dir_all(root.join(".claude")).expect("mkdir");
        fs::write(
            root.join(".claude/settings.json"),
            serde_json::to_string_pretty(&settings).expect("ser"),
        )
        .expect("write settings");
        git_in(&root, &["add", "-A"]);
        git_in(&root, &["commit", "-qm", "bind"]);

        let create = spawn_in(
            &root,
            &["worktree-create", "loop/bound", "--base-branch", "main"],
        );
        assert!(
            create.status.success(),
            "stderr: {}",
            String::from_utf8_lossy(&create.stderr)
        );
        let marker = root
            .join(worktree_dir_for_branch("loop/bound"))
            .join("marker.txt");
        assert!(marker.exists(), "expected provisioning marker");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn process_bound_failure_tears_down_and_keeps_branch() {
        ensure_bin();
        let root = git_fixture();
        let settings = json!({
            "the-loop": {
                "worktreeSetup": { "command": "echo boom >&2; exit 7" }
            }
        });
        fs::create_dir_all(root.join(".claude")).expect("mkdir");
        fs::write(
            root.join(".claude/settings.json"),
            serde_json::to_string_pretty(&settings).expect("ser"),
        )
        .expect("write");
        git_in(&root, &["add", "-A"]);
        git_in(&root, &["commit", "-qm", "bind fail"]);

        let create = spawn_in(
            &root,
            &["worktree-create", "loop/fail", "--base-branch", "main"],
        );
        assert!(!create.status.success());
        assert!(create.stdout.is_empty());
        let err = String::from_utf8_lossy(&create.stderr);
        assert!(
            err.contains("worktree provisioning failed"),
            "stderr: {err}"
        );
        assert!(err.contains("exit code 7"), "stderr: {err}");
        assert!(err.contains("project"), "stderr: {err}");
        let dir = root.join(worktree_dir_for_branch("loop/fail"));
        assert!(!dir.exists(), "worktree must be torn down");
        // branch survives
        git_in(
            &root,
            &["rev-parse", "--verify", "--quiet", "refs/heads/loop/fail"],
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn process_setup_timeout_wording_and_teardown() {
        ensure_bin();
        let root = git_fixture();
        let settings = json!({
            "the-loop": {
                "worktreeSetup": { "command": "sleep 30", "timeout": 200 }
            }
        });
        fs::create_dir_all(root.join(".claude")).expect("mkdir");
        fs::write(
            root.join(".claude/settings.json"),
            serde_json::to_string_pretty(&settings).expect("ser"),
        )
        .expect("write");
        git_in(&root, &["add", "-A"]);
        git_in(&root, &["commit", "-qm", "bind timeout"]);

        let create = spawn_in(
            &root,
            &["worktree-create", "loop/timeout", "--base-branch", "main"],
        );
        assert!(!create.status.success());
        assert!(create.stdout.is_empty());
        let err = String::from_utf8_lossy(&create.stderr);
        assert!(err.contains("timed out after 200ms"), "stderr: {err}");
        assert!(
            !err.contains("exit code"),
            "timeout must not be phrased as exit code: {err}"
        );
        assert!(!root.join(worktree_dir_for_branch("loop/timeout")).exists());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn process_malformed_binding_refuses_before_create() {
        ensure_bin();
        let root = git_fixture();
        let settings = json!({
            "the-loop": {
                "worktreeSetup": { "timeout": 1000 }
            }
        });
        fs::create_dir_all(root.join(".claude")).expect("mkdir");
        fs::write(
            root.join(".claude/settings.json"),
            serde_json::to_string_pretty(&settings).expect("ser"),
        )
        .expect("write");
        git_in(&root, &["add", "-A"]);
        git_in(&root, &["commit", "-qm", "malformed"]);

        let create = spawn_in(
            &root,
            &["worktree-create", "loop/malformed", "--base-branch", "main"],
        );
        assert!(!create.status.success());
        assert!(create.stdout.is_empty());
        let err = String::from_utf8_lossy(&create.stderr);
        assert!(err.contains("worktreeSetup"), "stderr: {err}");
        assert!(err.contains("project"), "stderr: {err}");
        assert!(err.contains("command"), "stderr: {err}");
        assert!(
            !root
                .join(worktree_dir_for_branch("loop/malformed"))
                .exists()
        );
        // no branch either (never reached worktree add)
        let check = ProcCommand::new("git")
            .args([
                "rev-parse",
                "--verify",
                "--quiet",
                "refs/heads/loop/malformed",
            ])
            .current_dir(&root)
            .status()
            .expect("git");
        assert!(!check.success(), "branch must not exist after refuse");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn process_missing_branch_arg_exits_1() {
        ensure_bin();
        let root = git_fixture();
        let out = spawn_in(&root, &["worktree-create"]);
        assert!(!out.status.success());
        assert!(out.stdout.is_empty());
        assert!(!out.stderr.is_empty());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn resolve_worktree_setup_only_does_not_need_other_families() {
        let _env = crate::env_lock();
        let project = tempfile_dir("wt-resolve-only");
        let home = tempfile_dir("wt-resolve-home");
        // Malformed unrelated family must not break worktreeSetup resolve.
        fs::create_dir_all(project.join(".claude")).expect("mkdir");
        fs::write(
            project.join(".claude/settings.json"),
            r#"{"the-loop":{
              "modelBindings":{"broken":"not-an-object"},
              "worktreeSetup":{"command":"npm ci"}
            }}"#,
        )
        .expect("write");
        // SAFETY: held under env_lock for the full body.
        let prev_home = env::var_os("HOME");
        let prev_cwd = env::current_dir().expect("cwd");
        unsafe {
            env::set_var("HOME", &home);
        }
        env::set_current_dir(&project).expect("cd");
        let setup = resolve_worktree_setup().expect("worktreeSetup alone must resolve");
        env::set_current_dir(&prev_cwd).expect("restore cwd");
        unsafe {
            match prev_home {
                Some(v) => env::set_var("HOME", v),
                None => env::remove_var("HOME"),
            }
        }
        assert_eq!(setup["command"], "npm ci");
        assert_eq!(setup["provenance"], "project");
        let _ = fs::remove_dir_all(&project);
        let _ = fs::remove_dir_all(&home);
    }
}
