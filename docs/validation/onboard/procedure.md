# Validation runbook — onboard

Judge pass against `main...HEAD` on the assembled `integrate--onboard` worktree.
Interview-level behavior is agent prose in shipped skills; mechanical substrate is
exercised via CLI from the outside. Suite and lint re-run as integrity gates.

## Bring-up

```bash
# From the-loop repo root (plugin lives under plugin/)
PLUGIN_ROOT="$(pwd)/plugin"
test -f "$PLUGIN_ROOT/bin/the-loop.js"

# Greenfield / empty unconfigured repo
EMPTY=$(node bin/create-sample-repo.js empty)
# → prints a temp git repo path (bare unconfigured variant)

# Brownfield fixture (code + tests + CI, no loop artifacts)
BF=$(mktemp -d /tmp/onboard-bf-XXXXXX)
cp -R test/fixtures/onboard-brownfield/. "$BF/"
cd "$BF" && git init -q && git add -A \
  && git -c user.email=judge@test -c user.name=judge commit -q -m "brownfield seed"
```

## Exercise

Against each fixture (cwd = fixture path):

```bash
node "$PLUGIN_ROOT/bin/the-loop.js" status --json
node "$PLUGIN_ROOT/bin/the-loop.js" hooks-list
```

Integrity (from the-loop repo root):

```bash
npm test          # expect 257/257 pass
npm run lint      # expect clean
git diff main...HEAD   # read-only: skills + tests + brownfield fixture only
```

Prose surfaces checked by literal read (not interactive LLM interview):

- `plugin/skills/onboard/SKILL.md` — greenfield configure-before-Define + recommended
  answers; brownfield assess-and-fill, human-confirmed hooks, three recorded-binding
  sections with `none` opt-out, skeletal architecture.md, no graph surgery
- `plugin/skills/begin/SKILL.md` — `onboard` route → onboard skill; jump list includes
  `/begin onboard` and `/begin configure`
- `plugin/skills/design/SKILL.md` — recorded-binding interviews are confirm-or-fill;
  stack-time hooks-set for testHarness/lint/precommit; lint-policy elicitation
- `plugin/skills/configure/SKILL.md` — one recommended answer per configure question
  (dependency of the configure leg)

## Expected observations

### Empty repo (`create-sample-repo.js empty`)

- `status --json`: `mode: "unconfigured"`, `hasDesign/hasGraph/hasBrief: false`,
  `proposal.kind: "onboard"`
- `hooks-list`: resolvable hook inventory; all three `recordedBindings` absent;
  warn line about missing `docs/architecture.md`
- Working tree is bare (only `.git`) — greenfield substrate for the onboard skill's
  configure-then-Define route (prose)

### Brownfield fixture (`test/fixtures/onboard-brownfield`)

- Carries `package.json` with non-empty `test` and `lint` scripts, `src/`, `test/`,
  and `.github/workflows/ci.yml`
- Carries no loop artifacts: no `docs/`, no `.claude/`
- `status --json`: `mode: "unconfigured"`, proposal kind `onboard` (same as empty —
  no design/graph; brownfield vs greenfield is derived by the onboard skill from the
  tree, not a stored marker)
- `hooks-list`: inventory printable; recorded bindings absent until onboard fills them
  (prose: recommend-and-confirm settings-side hooks; fill Validation runbook / Release
  runbook / Operations toolkit or `none`)

### Integrity gates

- Diff adds only: `plugin/skills/{onboard,begin,design}/SKILL.md`, four onboard tests,
  brownfield fixture files. No `eslint-disable`, no lint-config edit, no deleted or
  weakened pre-existing tests (only additive).
- Full suite 257/257; lint clean. Onboard tests bite the shipped SKILL.md text and
  fixture/detectState substrate (prose-surface tests are intentional for agent skills).

### Acceptance criteria (judge summary)

1. **Met** — front door `onboard` route runs the onboard skill; skill mandates configure
   leg before Define with recommended answers on every configure question (prose +
   begin/onboard/configure skill reads; empty fixture CLI shows unconfigured + onboard
   proposal).
2. **Met** — brownfield fixture + CLI confirm unconfigured / no loop artifacts with real
   infra; onboard skill prose mandates detect → interview-only-gaps → human-confirmed
   hooks and three binding sections populated or opted out.
3. **Met** — design skill prose mandates confirm-or-fill for recorded-binding sections
   that already carry content (including onboard brownfield fills).

## Teardown

```bash
rm -rf "$EMPTY"
rm -rf "$BF"
```

Do not leave probe repos on disk; do not commit this runbook from the judge process
unless the drive agent elects to land it with the feature.
