# calibration-capture — validation runbook

Judge-only exercise of CLI surfaces from outside the plugin (no in-process imports of the workflow). Pipeline criteria 1/2/5 were evidenced by reading the merged code plus running the biting unit/integration tests (not a full headless agent E2E).

## Bring-up

From the integration worktree root:

```bash
node bin/create-sample-repo.js
# → printed path, e.g. /var/folders/.../T/loop-probe-XXXX
PLUGIN_ROOT="$(pwd)/plugin"
```

Also used a throwaway empty temp dir for the malformed-only summarize path.

## Exercise

### 1. `the-loop calibration-summarize` (live CLI)

In the sample repo, synthesized two minimal valid records under `docs/calibration/runs/` matching the design YAML shape (one standard/validated with actual enrichment, one small/blocked with reslice), then:

```bash
cd "$SAMPLE"
node "$PLUGIN_ROOT/bin/the-loop.js" calibration-summarize
# → {"written":"docs/calibration/index.md","runs":2}
# Ran a second time; index.md was byte-identical to the first write.
# Digest section line count: 26 (≤ 40). ## Runs had one `- ` line per record.
```

Malformed path:

```bash
# Added docs/calibration/runs/2026-07-03-1.md with unparseable yaml
node "$PLUGIN_ROOT/bin/the-loop.js" calibration-summarize
# exit 1; stderr named docs/calibration/runs/2026-07-03-1.md
# Fresh empty temp dir with only a bad record: exit 1, no index.md written
```

### 2. `the-loop prepare-execution-context` (live CLI)

Against sample with regenerated index (feature `greet-cli`, `--target-branch main`):

- **With** `docs/calibration/index.md`: context includes `preparedAt` (ISO-8601 UTC) and `calibration` (digest body only — no `## Runs`, no `## Digest` heading; `sectionAfter` stops at the next `##`).
- **Without** the index file: `calibration` key absent; remainder of context (modulo `preparedAt` wall clock) byte-identical to the with-index context minus `calibration`.
- Fresh sample with no calibration history: no `calibration` key; two successive prepares identical except `preparedAt`.

### 3. Pipeline / division-of-labor / failure modes (tests + code, not live agent)

```bash
node --test \
  test/execution-pipeline-record.test.js \
  test/record-agent.test.js \
  test/calibration-summarize.test.js \
  test/prepare-execution-context.test.js \
  test/prepare-execution-context-script-out.test.js \
  test/calibration-recall-docs.test.js
# 34/34 pass
npm test   # 228/228 pass
npm run lint  # exit 0
```

Observed from tests + reading `plugin/workflows/execution-pipeline.js`:

- Record spawn phase `Record`, label `record`, prompt is the pinned deterministic YAML payload (validated, agents, tasks, null `actual:*`, tokens/attribution).
- Blocked/needs_refinement run still spawns record with outcome/reason/reslice captured.
- Budget-exhausted halt: no record spawn; one log line; summary unchanged.
- Record spawn throw: one log line; run summary JSON identical to a successful-record run.
- Plan prompt appends `calibration digest (this repository's run history):` only when `executionContext.calibration` is set.
- `plugin/agents/record.md` + model binding haiku + design skill step 3 consult `docs/calibration/index.md` when present; record scope is target-repo only.

Integrity: full `git diff main...HEAD` has no `eslint-disable` additions and no lint-config edits; meta/phases and preparedAt test updates strengthen contracts rather than weaken them.

## Expected observations (summary)

| Surface | Expect |
|---|---|
| calibration-summarize ×2 same corpus | byte-identical `docs/calibration/index.md`, digest ≤40 lines, 1 Runs line/record |
| malformed record | exit 1, file named, no new index |
| prepare-execution-context + index | `calibration` = digest body only |
| prepare-execution-context − index | no `calibration` key |
| pipeline tests | payload determinism; blocked still records; budget skip; failure isolation |

## Teardown

```bash
rm -rf "$SAMPLE" "$SAMPLE2" /tmp/calib-*   # any temp fixture paths created outside the worktree
# Integration worktree left clean: git status --porcelain empty; no tracked/untracked edits.
```
