# begin-version-handshake — plugin↔CLI skew detection at the front door

## What this is

/begin learns to compare its own plugin version against the installed binary's
version and heal the breaking direction automatically. Today the begin skill's
missing-binary posture says outright "there is no version handshake" — skew between
the independently-updating plugin (marketplace) and binary (installer) surfaces as a
mysterious unknown-subcommand failure mid-session. After this feature, it surfaces
at the front door as a one-line auto-update. Brief: `docs/briefs/cli-upgrade.md`.
Depends on `cli-upgrade` (the `the-loop upgrade` subcommand it runs).

## How it fits

Plugin and CLI versions are bumped in lockstep every release
(`plugin/.claude-plugin/plugin.json` and `cli/Cargo.toml` carry the same number;
cargo-dist refuses a mismatched tag — Release runbook, binary leg). So exact string
compare of the two versions is the whole check: offline, deterministic, no state.
The check lives **only** in `/begin` (`plugin/skills/begin/SKILL.md`) — the
documented front door. Other skills assume it ran; side-door sessions skip it
(accepted in the brief). Normal CLI invocations gain no network calls and no
latency from this feature.

## Decided mechanism

1. **Capture both versions in the skill's context preamble**, beside the existing
   `!`the-loop status --json`` line:
   - binary: `!`the-loop --version``
   - plugin: a `node -e` one-liner reading
     `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` and printing its `version`
     (the skill's `allowed-tools` already grants `Bash(node *)`).
2. **Degrade to skip, never block.** If either capture fails (unset plugin root,
   missing binary — the missing-binary posture already owns that case, unreadable
   manifest), the handshake is skipped silently and orientation proceeds. A broken
   handshake must never cost a session.
3. **Asymmetric response**, in the skill body before any route action:
   - binary **older** than plugin → run `the-loop upgrade`
     (`allowed-tools` already grants `Bash(the-loop *)`), then report exactly one
     line: `the-loop updated to v<new>`. On failure, report one line naming the
     skew and the manual install one-liner (already quoted in the skill), then
     continue on the old binary — the later missing-subcommand error, if it comes,
     is now pre-explained.
   - binary **newer** than plugin → proceed normally with a one-line nudge to
     update the plugin via the marketplace (`claude plugin update the-loop@the-loop`).
   - equal → say nothing.
4. **Rewrite the missing-binary posture's parenthetical** — "re-run it if a newer
   plugin expects a command the installed binary lacks; there is no version
   handshake" is no longer true; the posture keeps the one-liner as the
   missing-binary and failed-upgrade remedy.

## Interfaces touched

- `plugin/skills/begin/SKILL.md` only — preamble context lines, a short handshake
  section, and the missing-binary posture wording. No CLI change, no new files, no
  frontmatter `allowed-tools` change expected (the two grants above suffice).
- Consumes `the-loop upgrade`'s contract from `cli-upgrade`: exit 0 with
  `{"from","to","updated"}` JSON on stdout; nonzero with stderr reason on failure.

## Constraints

- Loop surface authoring rules apply: the skill stays self-contained (no references
  to internal docs/ADRs), and the change takes a write-skills pass before landing.
- The handshake adds at most three preamble lines and one short section — /begin's
  job is orientation; this must not swell it.
- One line of chat per outcome, zero on the equal path. No tables, no ceremony.
