---
status: accepted
date: 2026-07-10
---

# ADR-0052 · Worktree provisioning: a `worktreeSetup` hook family, the node_modules symlink retired

**Context.** `the-loop worktree-create` provisioned dependencies exactly one way:
a best-effort symlink of the repo root's `node_modules` into the new worktree,
any failure silently swallowed (`linkNodeModules`, `plugin/bin/cli-commands.js`).
The 2026-07-10 friction sweep documented the structural failures: dead when no
root install exists (seven concurrent builders each paid a ~6-minute cold
install on one run), wrong for workspace layouts, a shared-mutable-store hazard
(every worktree reads one physical `node_modules`; a sibling's dependency add —
or a stray `git stash -u` — mutates it under everyone), a committing papercut
(the dir-only `.gitignore` rule doesn't match a symlink), and node-only. Brief:
`docs/briefs/worktree-setup.md`; design: `docs/designs/worktree-setup/design.md`.

**Decision.** Worktree provisioning becomes a hook family, and the symlink dies
rather than remaining as the unbound default.

- **`worktreeSetup` is an ordinary hook family** (ADR-0049 machinery): resolved
  `defaults < user < project < local`, shape `{ command, timeout? }`, fallback
  `{ provisioning: "none" }`. `worktree-create` runs the bound command via the
  system shell in the fresh worktree root, after checkout, default timeout
  600000 ms.
- **Unbound means no provisioning at all.** Keeping the symlink as the fallback
  would preserve the exact hazards being killed, so `linkNodeModules` is deleted
  outright. Projects that want provisioning bind a command;
  `configure`/`onboard` detect the stack and recommend one (project layer).
- **Failure is loud and environment-shaped, with teardown.** A failing or
  timing-out command removes the just-created worktree and exits non-zero with a
  self-contained message (command, path, layer, exit code or timeout, stderr
  tail) — establishing the invariant that an existing worktree directory was
  fully provisioned at creation, which is what keeps the `created: false`
  early-return sound without re-running setup.

**Trade-off accepted.** Per-worktree real installs replace a zero-cost (when it
worked) shared symlink. Content-addressed stores (bun, pnpm) make warm installs
cheap via hardlinks; npm pays a copy from cache. The observed 6-minute installs
were cold-cache, not evidence for sharing one mutable store — and isolation buys
correctness: a sibling's dependency change can no longer mutate a running
agent's dependencies. A project silently relying on the symlink today loses it;
this repo binds its own command (`npm ci && cargo fetch`) in the same landing as
the deletion.

**Rejected.** Keeping the symlink as fallback (preserves every hazard); runtime
stack detection inside `worktree-create` (guessing in the hot path — detection
belongs in the human-confirmed interview); a block posture for the family (the
no-provisioning majority makes fallback the correct default); loop-owned
dependency caching or multi-step provisioning (out of scope until proven
needed).
