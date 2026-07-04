# Ship 1 — the-loop reaches its own frontier

The first release of the-loop, and the one that closes the self-hosting loop: the
plugin that builds, validates, and ships software here ships **itself**, system-wide,
through its own Ship corridor. The frontier is the whole validated set at
`91b52335` — eleven features spanning the spine (artifact parse/render/resolve and the
address-by-id injection resolver), the `/the-loop` front door, the full inner loop
(Plan → Build → Validate with park-and-drain over a BoundaryResult), the craft baseline
and independent validator, model-selection bindings, delegated executors, surfacing /
re-entry, and Ship itself.

Two changes landed on the integration target between evidence assembly and this record,
both part of what ship-1 delivers:

- **A security fix (`25e4d47`).** The independent security review found a HIGH command
  injection: a feature id lifted from an untrusted target repo's graph flowed as
  `branch = loop/<id>` into `execSync` shell strings in `spine validate scan`, giving
  arbitrary command execution on the machine running the plugin. It was fixed at the
  sink — the three git calls now use `execFileSync` argv form (no shell) and the
  `diff | patch-id` pipe is split in-process — with a lowercase-slug charset gate on
  feature/contract ids in the schema as defense-in-depth. An independent re-review
  confirmed the finding CLOSED with no new issue introduced.
- **An executable deploy binding (`91b5233`).** The `deploy-target` binding in
  `docs/ports/ports.md` was narrative prose; it is now literal, idempotent
  `{deploy, rollback, smoke}` command strings the corridor excerpts verbatim, so this
  bootstrap ship and every future ship in this repo run the same commands. Deploy
  registers the local marketplace and version-installs the plugin at user scope; smoke
  asserts it is enabled at `plugin.json`'s version with an enumerable surface.

Human approval is on record: the tree, the security remediation, and the deploy
mechanics were all approved before the corridor ran.

## Ship record

```yaml
ship: 1
ship_sha: 91b52335c8b6e4a45c82ec2963a1774093980e1d
design_version: 7
features:
  - artifact-spine
  - the-loop-entry
  - build
  - craft-baseline
  - validate
  - inner-loop-workflow
  - ledger-title-preservation
  - model-selection
  - executor-delegation
  - surfacing
  - ship
evidence:
  integration:
    verdict: green
    method: all six probe packs replayed oldest-first through the fixture-repo binding as one lifecycle; deterministic backbone npm test 232/232 and npm run check clean (25 features, 12 contracts, 0 error/0 warning) on the ship_sha tree; live grok drive exercised end to end (one clean commit, worktree disposed, completion report opens "Driven via grok/grok-build —")
    flakes: none
    advisories:
      - spine ship book on a non-deployed outcome writes the record's outcome before the Ledger insert; if the target Ledger lacks a "## Run history" heading appendShip throws with the record already mutated — cannot arise against this repo (its render pipeline always seeds that heading)
      - the grok playbook's operational lore is currently empty ("none yet"), so the prompt-carries-lore probe pin is vacuously satisfied
      - live `claude -p "/the-loop"` channels stay recorded-unobserved (the plugin is not installed inside the probe fixture) — the binding's known soft spot
  security:
    - severity: HIGH
      category: command-injection
      location: bin/spine-commands.js (spine validate scan)
      finding: a feature id from an untrusted target repo's graph flowed as branch=loop/<id> into execSync shell strings, enabling arbitrary command execution on the machine running the plugin
      status: fixed in 25e4d47 (execFileSync argv form, in-process pipe split, schema id charset gate); independently re-reviewed CLOSED, no new issue
  changelog:
    - feature: artifact-spine
      prose: parse/render/resolve toolkit for the loop's markdown+yaml artifacts, plus the address-by-id injection resolver the spine sits above.
    - feature: the-loop-entry
      prose: the /the-loop front door — stateful orient core, cold-start detection, minimal onboarding.
    - feature: build
      prose: Build task agents with the ADR-0026 git strategy and the diff-scoped lint gate.
    - feature: craft-baseline
      prose: the bundled craft pack — build constitution, design principles, review catalog — with per-task standards selection.
    - feature: validate
      prose: the independent validator — readiness stage plus four legs (forensics, conformance, acceptance, runtime) with a blind deriver and mechanical verdicts.
    - feature: inner-loop-workflow
      prose: the Plan→Build→Validate Workflow orchestration with park-and-drain and the BoundaryResult (completed/parked/stalled/budget).
    - feature: ledger-title-preservation
      prose: the Ledger renderer carries pre-heading content (the title line) byte-identically and seeds a standard title when absent.
    - feature: model-selection
      prose: per-role model/effort bindings resolved across config layers at every spawn surface, with provenance and tier routing.
    - feature: executor-delegation
      prose: rote tasks driven through registered CLI executors (v1 ships grok) by a verifying Claude driver, behind a pure playbook registry.
    - feature: surfacing
      prose: run-boundary → session → human → fold-back re-entry — the resolution toolkit, kind-stamped menus, and the adjust skill wiring.
    - feature: ship
      prose: this human-gated release corridor — evidence package, approval gate, freshness re-pin, and the health-gated delegated rollback.
  waivers: []
approval:
  approver: Jackson Atassi
  date: 2026-07-04
```
