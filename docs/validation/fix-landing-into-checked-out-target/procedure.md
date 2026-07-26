# Validation runbook — fix-landing-into-checked-out-target

Judge pass against `main...HEAD` on the assembled
`integrate--fix-landing-into-checked-out-target` worktree. The footprint is two
agent contracts (`plugin/agents/record.md` §6, `plugin/agents/validate.md` §3 step 3)
plus `test/worktree-safe-landing.test.js`. Because the publish step is *prose an
agent carries out*, not code the product runs, the acceptance has two halves and both
must be exercised:

- the **mechanism** — the prescribed command
  `git -C <repo-root> merge --ff-only <source-branch>` really produces the
  postconditions the criteria name, in the exact repo shape the incident occurred in
  (target branch checked out in the primary worktree, commit sitting in a linked
  worktree);
- the **prescription** — the two contracts actually name that command, only that
  command, and name the ref-only moves they forbid.

A mechanism proof alone would pass even if the contracts still prescribed the broken
recipe, and a text proof alone would pass even if the command didn't work. Run both.

## Bring-up

```bash
# From the integration worktree root
cargo build --release                   # target/release/the-loop — the JS suite spawns it
node bin/create-sample-repo.js          # → configured fixture repo, prints its path ($FIX)

# Mirror a real consuming project: linked worktrees are not version-controlled.
printf '.claude/worktrees/\n' >> "$FIX/.gitignore"
git -C "$FIX" add .gitignore && git -C "$FIX" commit -m "fixture: ignore linked worktrees"
```

The fixture's primary worktree has `main` checked out — that is the whole precondition
of this defect, and it is the default, not a contrivance.

## Exercise

### 1 · Integrity gates, suite, lint

```bash
git diff main --stat                             # exactly 3 files, no others
git diff main -- eslint.config.js package.json   # expect empty (no lint-config edit)
git diff main | grep -c '^-.*assert'             # expect 0 (no weakened/deleted test)
grep -rn 'eslint-disable' test/worktree-safe-landing.test.js plugin/agents/
npm test                                         # node suite
cargo test --release                             # Rust CLI suite
npm run lint
./target/release/the-loop check
```

Expected: `tests 218 / pass 218 / fail 0`; Rust `235 passed` + `3 passed`; eslint exit
0; `check` → `OK 52 features — 0 error(s), 0 warning(s)`.

### 2 · The tests bite (two mutation probes)

Both halves of `test/worktree-safe-landing.test.js` must be shown to fail when the
thing they assert is removed. Revert each mutation afterwards.

| mutation | expected casualty |
| --- | --- |
| restore `plugin/agents/record.md` and `plugin/agents/validate.md` from `main` (`git show main:<path> >`) | the two text tests fail (`should name the worktree-safe landing command`, `should name git update-ref as forbidden`); the three fixture tests still pass |
| in a scratch copy of the test file, replace `landingCommand`'s `['-C', repoRoot, 'merge', '--ff-only', branch]` with `['-C', repoRoot, 'update-ref', 'refs/heads/main', branch]` | the three fixture tests fail — `primary worktree should be clean after publish`, `Missing expected exception: non-fast-forward publish should fail rather than silently succeed`, `primary worktree should be clean after validate publishes` |

The second probe is the load-bearing one: it reproduces the incident's own
mechanism and shows the assertions catch it.

### 3 · Criterion 1 & 3 — record's shape, live against the fixture

```bash
cd "$FIX" && the-loop worktree-create record-temp --base-branch main
mkdir -p "$FIX/.claude/worktrees/record-temp/docs/calibration/runs"
echo '{"run":1}' > "$FIX/.claude/worktrees/record-temp/docs/calibration/runs/2026-07-25-1.json"
git -C "$FIX/.claude/worktrees/record-temp" add -A
git -C "$FIX/.claude/worktrees/record-temp" commit -m "calibration: run 2026-07-25-1"

git -C "$FIX" merge --ff-only record-temp        # the prescribed command, run at the root
git -C "$FIX" status --porcelain                 # criterion 1: must be empty
test -f "$FIX/docs/calibration/runs/2026-07-25-1.json"   # criterion 1: artifact on disk
git -C "$FIX" reflog -1                          # criterion 3: HEAD entry for the commit
the-loop worktree-remove record-temp
```

Observed: `Updating 97988e9..aa642eb / Fast-forward`; porcelain `[]`; artifact
present; `aa642eb HEAD@{0}: merge record-temp-2: Fast-forward` — a HEAD reflog entry
exists, so the primary worktree really saw the commit (the ref-only signature is an
*empty* message and no HEAD entry at all).

### 4 · Criterion 2 — every way a publish can fail to fast-forward

```bash
# (a) target checked out — both recipes the old contracts prescribed
git -C "$FIX/.claude/worktrees/rec3" fetch . rec3:main   # validate.md's old recipe
git -C "$FIX/.claude/worktrees/rec3" checkout main       # record's old first attempt
git -C "$FIX" merge --ff-only rec3                       # the prescribed command

# (b) target moved / non-fast-forward
echo z > "$FIX/moved.txt"; git -C "$FIX" add -A; git -C "$FIX" commit -m "target moved"
PRE=$(git -C "$FIX" rev-parse main)
git -C "$FIX" merge --ff-only rec4 ; echo "exit=$?"
git -C "$FIX" rev-parse main                             # must still equal $PRE
git -C "$FIX" status --porcelain                         # must be empty
```

Observed: (a) `fatal: refusing to fetch into branch 'refs/heads/main' checked out at
…` (exit 128) and `fatal: 'main' is already used by worktree at …` (exit 128) — both
old recipes fail, confirming the fix's premise; the prescribed command lands cleanly
in the same situation. (b) `fatal: Not possible to fast-forward, aborting.` exit 128,
`main` unchanged, porcelain empty — a loud failure the leg reports `blocked` on, with
no partial state. The prohibition half is judged by reading `record.md:89-94` and
`validate.md:74-79`, which name `git update-ref`, `git branch -f`, `git push --force`
and "any other ref-only move", asserted by the text tests in step 2.

### 5 · Criterion 6 — the verification catches the destructive path

Perform the *forbidden* publish deliberately and confirm the prescribed
post-landing assertions detect it:

```bash
git -C "$FIX" update-ref refs/heads/main "$(git -C "$FIX" rev-parse rec5)"
git -C "$FIX" status --porcelain     # → "D  run5.json"  (non-empty ⇒ blocked)
test -f "$FIX/run5.json"             # → absent          (⇒ blocked)
git -C "$FIX" reflog -1              # → "0b1ddd5 HEAD@{0}: "  (empty message)
git -C "$FIX" reset --hard main      # resync the fixture before continuing
```

Observed exactly the incident's signature: staged deletion of the artifact the commit
just added, the file gone from disk, an empty-message reflog entry. Both of
`record.md`'s two prescribed checks fire, so the leg returns `blocked` with that
porcelain instead of `recorded`.

### 6 · Criterion 4 — validate's squash landing, live

```bash
the-loop worktree-create integrate--probe-feature --base-branch main
# two wip commits in the worktree, then collapse as validate.md step 2 prescribes
git -C "$IW" reset --soft "$(git -C "$FIX" rev-parse main)"
git -C "$IW" commit -m "probe-feature: squashed"
git -C "$FIX" merge --ff-only integrate--probe-feature
git -C "$FIX" status --porcelain      # must be empty
git -C "$FIX" reflog -1
```

Observed: `main` equals the squash commit, porcelain `[]`,
`276a8dc HEAD@{0}: merge integrate--probe-feature: Fast-forward` — no improvisation
needed, same command as record.

**The live end-to-end confirmation:** the validating agent's own publish of this
feature is itself an instance of criterion 4 — the target `main` is checked out in
this repository's primary worktree, and the landing was performed with
`git -C <repo-root> merge --ff-only integrate--fix-landing-into-checked-out-target`,
leaving `git status --porcelain` empty.

### 7 · Criterion 5 — one command, named in both contracts

```bash
grep -rn 'merge --ff-only' plugin/ cli/          # only record.md and validate.md
grep -rn 'fetch \.' plugin/ cli/ docs/adr/       # no hits anywhere
grep -rln 'fast-forward' plugin/ cli/src/        # only the two agent contracts
```

Read `plugin/agents/record.md:76-102` and `plugin/agents/validate.md:65-79` side by
side: both name `git -C <repo-root> merge --ff-only <source>`, both define
`<repo-root>` in their §1 as the primary worktree they start in (before creating a
linked worktree), and neither retains `git fetch . <src>:<target>`. The
fast-forward/landing sweep confirms no third surface prescribes a publish, so the
contract is coherent across the phase sequence.

## Teardown

```bash
the-loop worktree-remove <each probe worktree>   # inside the fixture
rm -rf "$FIX"                                    # the printed loop-probe path
rm -rf <scratch copy of the mutated test file>
```

## Notes for replay

- `git status --porcelain` is only empty after a landing if the consuming project
  ignores its linked-worktree directory. A first fixture run without
  `.claude/worktrees/` in `.gitignore` reports `?? .claude/` — a fixture artifact,
  not a landing defect. Real consuming projects (and this repo) ignore it; add the
  line during bring-up as above so the observation matches the criterion literally.
- Both contracts define `<repo-root>` as "the working directory you are already in",
  noted *before* the linked worktree is created. That holds for legs spawned at the
  project root, which is how build/validate/record are spawned today. A leg spawned
  with its cwd already inside a worktree would resolve `<repo-root>` wrongly; nothing
  in the contracts guards that, and it is out of scope for these criteria.
