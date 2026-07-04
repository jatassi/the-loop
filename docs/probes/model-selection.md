# Probe pack — model-selection

Pinned from the four-leg would-be-perfect validation of patch_id
`116191601b26d859314ce554be0722c89358faa2` (run `wf_97851563`; merged under the
human-authority resolution recorded in docs/validations/model-selection.md).
The bindings framework exercised black-box: `node bin/spine.js models` resolves
the per-role table across config layers with provenance, the workflow script
passes resolved model/effort opts with model-prefixed labels and logs the
session-model fallback for unbound roles, and `spine plan check` enforces the
task tier field.

Volatile fields (temp-dir paths, feature/test counts, durations, commit SHAs)
are masked; replay re-derives them fresh. Pin the shape, never the number.

```yaml
probe: fixture-repo
steps:
  - step: resolve the shipped table
    run: node bin/spine.js models (fixture repo, no project/local overrides)
    observe: every config/model-bindings.json role prints with provenance `default`; roles bound in no layer are absent from the table — absence itself is the fallback signal the consuming surfaces read
  - step: layer precedence
    run: node bin/spine.js models with a project .claude/settings.json and a local settings.local.json each overriding one role
    observe: whole-entry replacement per role; provenance flips to `project` / `local` for exactly the overridden roles, `default` elsewhere
  - step: workflow spawn plumbing
    run: shim-execute workflows/inner-loop.js with args.models carrying explicit bindings for build.complex and derive
    observe: spawn opts carry the resolved model (and effort where bound); labels are prefixed `[<model>] `; an unbound role gets no model/effort opts and logs the pinned `model-selection — role <x> unbound, session-model fallback` line; a role bound to literal `session` inherits WITHOUT the fallback log line
  - step: tier routing + grandfather
    run: shim-execute with a tiered task list plus one untiered task
    observe: tiered tasks route build.<tier>; the untiered task logs the tier-fallback line and routes build.standard
  - step: tier validation
    run: node bin/spine.js plan check <feature> across a valid tier, an invalid tier, and an absent tier
    observe: valid passes clean; invalid prints ERROR bad-tier and exits 1; absent prints a missing-tier warn and exits 0 (grandfathered)
```

Delta proof (recorded, not replayable verbatim): at the merge-base, `spine
models` was a usage error, shim spawns carried plain labels with no opts and no
log lines, and an invalid tier passed `plan check` silently — every step above
discriminated red-at-base / green-on-merged-tree in run `wf_97851563`.
