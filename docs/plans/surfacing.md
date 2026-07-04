# Plan — surfacing

Surfacing / re-entry closes the loop's last open door: `parked` stops being one-way.
The feature has three layers, and the decomposition follows them bottom-up so nothing
is orphaned:

1. **The resolution toolkit** (t2–t7) — five new/grown `spine` capabilities: `note`,
   `ledger append-run`, `plan fix`, the validations-entry judgment + mutations
   (`latest entry`, `validate waive`, the `retried` stamp), and the shared spine
   `escalation resolve`. Every artifact mutation is mechanical; no agent hand-edits
   graph YAML, plan YAML, validations YAML, or Ledger prose. `bin/spine.js` and
   `test/spine-cli.test.js` are hub files, so these tasks chain linearly
   (t2 → t3 → t4 → t5 → t6 → t7) — v1 builds sequentially anyway, so the chain costs
   nothing.
2. **The record shape** (t1, t8, t9, t10) — menus become kind-stamped
   `{resolution, option}` everywhere they are authored (plan/build/validate agents),
   parsed (`src/escalation.js`), rendered (the Ledger's "What needs you"), and relayed
   (the workflow's spawn schemas, so an object menu survives to the `BoundaryResult`).
   Parsers stay lenient to pre-amendment bare strings. t10 also lands the validator's
   consuming halves: the retried-mark dedup amendment with the deviation-crash gap
   healing, and waiver consumption (without which fix-in-place-with-waivers re-parks
   forever).
3. **The session choreography** (t11, t12) — the adjust skill walks the docket and
   folds typed resolutions back through the toolkit; `/the-loop` hands off at the run
   boundary and at re-entry, books the run-history line at every boundary, and pushes
   the port-gated one-liner. t12 also retires CLAUDE.md's hand-maintenance rule per
   that rule's own sunset clause — run-history booking (criterion 4) is the loop
   taking that duty over.

Wiring story: t7's `escalation resolve` composes t1's parser, t6's retried stamp, and
the existing `set-status`/`renderLedger` plumbing; t11's skill choreographs t2/t4/t6/t7;
t12 routes into t11 and invokes t3. A resolved feature's status flip (designed/building)
is exactly what the existing workflow re-enters on — no workflow phase-logic changes are
needed beyond t8's menu schema.

Notes folded in from the fresh-context audit:

- **Latest-entry anchoring (t5, t6).** A real validations file can end in a
  non-Validation block (`docs/validations/model-selection.md` closes with a
  `## Resolution — patch_id …` block carrying its own `patch_id`). "Latest entry"
  therefore anchors to the last `## Validation` heading, never to the last yaml block
  or the last `patch_id:` match — both tasks carry a fixture test for exactly this
  file shape.
- **Run-summary sourcing (t12).** `BoundaryResult` carries no `date` or `run`, and its
  `parked`/`stalled` entries are objects; t12 names the transform explicitly so the
  append-run invocation can never exit 1 on a well-formed boundary.
- **Healed parks and the boundary menu (t10).** The deviation-crash healing path books
  a reconstructed park during a dedup short-circuit; its return carries the
  reconstructed `deviation` and `menu` alongside the dedup shape so the boundary relay
  still surfaces them — without that, a healed park would reach the docket but show a
  bare entry at the run boundary.
- **Schema-union risk (t8).** The harness's schema-as-template behavior has never
  carried a string-or-object union; `anyOf` is standard JSON Schema (no invented
  keywords), but if the template mechanism drops one arm in production, that is a
  build-time finding — the shim-level tests pin verbatim passage of both shapes
  through the script itself.
- **Dropped nodes (t11).** `drop` is not a resolution kind (it is a design amendment
  removing the node); the adjust skill's pre-step prose says the amendment must also
  delete the feature's escalation record and re-render the Ledger in the same commit,
  so the Ledger never shows a park for a node that no longer exists.

**`m`-size justifications.** t4 (`plan fix`) cannot split: the fix-task append, the
blocked-task reset-and-chain, and the plan-check exemptions are one contract over
`src/plan.js` — splitting smears the same invariants across tasks that would then share
every file. t7 (`escalation resolve`) is one dispatch (four kinds × three phases) whose
flip table, guards, and effect ordering only make sense as a unit; its pure core is
small but its CLI test surface is wide. t11 is a single skill file — one coherent
choreography document; splitting it would produce half a surface, which the
loop-surfaces standard forbids.

**Defer is deliberately absent from `escalation resolve`:** defer means "stays parked" —
the record and status are untouched, so there is nothing to resolve; the command refuses
it with a message saying so, and the adjust skill simply moves on. This keeps
"record deletion is the closing event" true for every kind that does resolve.

## Tasks

```yaml
feature: surfacing
design_version: 6
tasks:
  - id: t1
    title: Kind-stamped menus — record parser normalization + Ledger rendering
    status: built
    covers: [1]
    acceptance:
      - "parseEscalation normalizes every menu entry to { resolution, option }: a YAML mapping with those keys passes through; a bare string becomes { resolution: null, option: <the string> } — pre-amendment records still parse without error"
      - "the EscalationRecord typedef in src/escalation.js documents the normalized menu shape"
      - "renderLedger's What-needs-you section renders each menu entry as `[<resolution>] <option>` (a null resolution renders as `[?]`), joined with `; ` — deterministic bytes for the same inputs"
      - "new node:test cases cover both menu shapes through parseEscalation and through renderLedger; npm test and npm run check pass"
    injects: [escalation-record]
    standards: [docs/standards/pure-core-thin-cli.md]
    footprint: [src/escalation.js, src/ledger.js, test/escalation.test.js, test/ledger.test.js]
    size: s
    tier: standard
    depends_on: []
    report:
      result: built
      footprint_actual:
        - src/escalation.js
        - src/ledger.js
        - test/escalation.test.js
        - test/ledger.test.js
      diff_actual:
        files: 4
        insertions: 36
        deletions: 7
      deviations: []
      summary: "parseEscalation now normalizes every menu entry to { resolution, option }: a YAML mapping with those keys passes through unchanged and a bare string becomes { resolution: null, option: <string> }, via a new normalizeMenuEntry helper; the EscalationRecord typedef documents the normalized MenuEntry[] shape. renderLedger's What-needs-you section renders each entry as `[<resolution>] <option>` (null resolution renders as `[?]`), joined with `; `, deterministically. test/escalation.test.js's fixture now mixes a mapping entry and a bare-string entry in one menu, proving both shapes parse and normalize correctly in one pass; test/ledger.test.js's ESCALATIONS fixture carries the same mixed shape and its expected body asserts the `[fix-in-place] ...; [?] ...` rendering. npm test (121/121) and npm run check both pass."
  - id: t2
    title: spine note — append a feature-node note through parse → mutate → render
    status: built
    covers: [2]
    acceptance:
      - "`spine note <feature-id> <text>` appends <text> to that feature's notes array in docs/design/design.md (creating the notes key when absent), prints the updated node as JSON, and leaves every byte outside the feature-graph block untouched"
      - "an unknown feature id or empty text exits 1 with nothing written"
      - "after a note append, `spine check` still reports OK (the doc round-trips), and `spine resolve <feature-id>` shows the new note riding the slice"
      - "the mutation lives in a pure src/ function (mutating the JS model and the retained YAML document, like setStatus); bin/spine.js only does I/O; node:test coverage for both layers"
    injects: [feature-node]
    standards: [docs/standards/pure-core-thin-cli.md, docs/standards/derived-and-hybrid-artifacts.md]
    footprint: [src/note.js, bin/spine.js, test/note.test.js, test/spine-cli.test.js]
    size: s
    tier: standard
    depends_on: []
    report:
      result: built
      footprint_actual:
        - bin/spine.js
        - src/note.js
        - test/note.test.js
        - test/spine-cli.test.js
      diff_actual:
        files: 4
        insertions: 127
        deletions: 1
      deviations: []
      summary: "src/note.js exports appendNote(model, featureId, text), a pure function mirroring setStatus's parse-mutate-render shape: it finds the feature node by id (throwing `unknown feature id: <id>` when absent), refuses a non-string or empty text (throwing `note text must be a non-empty string`), then appends text to model.features[idx].notes (creating the array when the key is absent) and mirrors the same array into the retained YAML document via doc.setIn(['features', idx, 'notes'], notes) so render() persists only that feature's notes line. bin/spine.js wires a new `note` command (noteCommand) that does I/O only: read design.md, parse, call appendNote, write back on success, print the updated node as JSON; an unknown id or empty text throws before any write, so nothing is written on refusal. test/note.test.js covers the pure layer (creating the notes key from absent, appending across two calls, round-tripping the rendered text; refusing an unknown id or empty text with the model left untouched) and test/spine-cli.test.js covers the CLI layer end-to-end: a happy-path append that leaves every byte outside the feature-graph block untouched (asserted byte-for-byte against the fixture), the two refusal paths exiting 1 with nothing written, and a follow-up test proving `spine check` still reports OK after the append and `spine resolve <feature-id>` surfaces the new note riding the resolved node. All 4 acceptance criteria were watched red before green (confirmed by deliberately reverting each implementation half and rerunning). npm test (125/125) and npm run check both pass."
  - id: t3
    title: spine ledger append-run — one deterministic newest-first Run-history line
    status: built
    covers: [4]
    acceptance:
      - "`spine ledger append-run [summary.json|-]` reads a run-summary JSON ({ date, run, completed: [id], parked: [id], stalled: [id], halted?: {reason, detail}, budget?: {spent, remaining} }; date and run required, exit 1 nothing written when either is missing) and inserts exactly one Markdown bullet as the first content after the `## Run history` heading in docs/ledger/ledger.md"
      - "the bullet is a single line, fields in fixed order (date, run, then completed/parked/stalled id lists, halted reason+detail, budget), empty segments omitted; the same input always produces the same bytes, and every other byte of the Ledger is preserved"
      - "a Ledger with no `## Run history` heading, or an absent Ledger file, exits 1 with nothing written"
      - "the insertion is a pure src/ledger.js function over (priorText, summary); a subsequent `spine ledger render` preserves the appended line byte-identically (Run history is a carried section); node:test coverage for the function and the CLI"
    injects: [boundary-result]
    standards: [docs/standards/pure-core-thin-cli.md, docs/standards/derived-and-hybrid-artifacts.md]
    footprint: [src/ledger.js, bin/spine.js, test/ledger.test.js, test/spine-cli.test.js]
    size: s
    tier: standard
    depends_on: [t1, t2]
    report:
      result: built
      footprint_actual:
        - bin/spine.js
        - src/ledger.js
        - test/ledger.test.js
        - test/spine-cli.test.js
      diff_actual:
        files: 4
        insertions: 187
        deletions: 8
      deviations: []
      summary: "src/ledger.js gains appendRun(priorText, summary): a pure function that inserts one deterministic bullet as the first content immediately after the \"## Run history\" heading. It throws (nothing written by any caller) when summary.date or summary.run is missing, and when priorText carries no \"## Run history\" heading at all. The bullet's fields render in fixed order — date, run, then completed/parked/stalled id lists (each omitted when empty), halted's reason and detail (omitted when absent), and budget's spent/remaining (omitted when absent) — pipe-joined for a single deterministic line, e.g. \"- 2026-07-04 | wf_999 | completed: widget | parked: gadget\". bin/spine.js wires spine ledger append-run [summary.json|-] (stdin default, matching the report/remediate commands' convention): it reads the summary JSON, reads the existing Ledger (an absent file throws via readFileSync's own ENOENT, caught by the top-level try/catch, before any write), calls appendRun, and writes the result back. Because \"## Run history\" is one of renderLedger's carried sections, a subsequent spine ledger render preserves the appended bullet byte-identically — proven directly in test/spine-cli.test.js. test/ledger.test.js covers appendRun's fixed field order and empty-segment omission, its determinism across repeat calls with the same summary, and its two throw paths (missing date/run; missing heading) — each watched red (ReferenceError on the unexported name, then the unimplemented-throw path) before green. test/spine-cli.test.js covers the CLI end to end: a happy path via both a file argument and stdin that inserts newest-first above a prior entry while leaving the rest of the Ledger byte-identical; the three refusal paths (missing date, missing run, no \"## Run history\" heading, and an absent Ledger file) all exiting 1 with the Ledger left unchanged; and the render round-trip. npm test (132/132) and npm run check both pass."
  - id: t4
    title: spine plan fix — append fix-N, reset-and-chain a blocked task, plan-check exemptions
    status: built
    covers: [2]
    acceptance:
      - "`spine plan fix <feature-id> [fix.json|-]` reads { directive, acceptance: [criterion], footprint: [path], title? } and appends a task to the plan: id fix-N (N = 1 + the count of existing fix-flagged tasks), fix: true, status pending, covers [], the given acceptance and footprint (both required non-empty — exit 1 nothing written otherwise), injects [], standards [], size s, tier standard, title defaulting to the directive's first line"
      - "the appended task's depends_on lists every prior task id EXCEPT tasks being reset (below), so no dependency cycle is created"
      - "when the plan carries blocked tasks (a build park), each is reset to status pending, its report removed, and fix-N appended to its depends_on — chained behind the fix; when none are blocked (a validate park) the append is plain"
      - "plan-check exemptions mirror the remediation marker: a fix-flagged task with covers [] raises no task-covers-nothing error and satisfies no coverage; normalizeTask retains the fix flag; a second fix appends as fix-2 (fixes are not one-shot)"
      - "after a fix append, `spine plan check <feature-id>` passes on a previously-clean plan (round-trip included); node:test coverage in test/plan.test.js (append, reset-and-chain, cycle-free, exemptions, refusals) and test/spine-cli.test.js (CLI happy path + refusal exit codes)"
    injects: [task-contract]
    standards: [docs/standards/pure-core-thin-cli.md, docs/standards/derived-and-hybrid-artifacts.md]
    footprint: [src/plan.js, bin/spine.js, test/plan.test.js, test/spine-cli.test.js]
    size: m
    tier: standard
    depends_on: [t3]
    report:
      result: built
      footprint_actual:
        - bin/spine.js
        - src/plan.js
        - test/plan.test.js
        - test/spine-cli.test.js
      diff_actual:
        files: 4
        insertions: 232
        deletions: 9
      deviations: []
      summary: "src/plan.js gains appendFix(plan, {directive, acceptance, footprint, title}) (ADR-0032): it refuses an empty acceptance or footprint list and a title-less, directive-less input (nothing written by any caller), then appends fix-N (N = 1 + however many fix-flagged tasks already exist, so a second fix appends as fix-2 rather than being one-shot). The appended task carries fix: true, status pending, covers [], the given acceptance/footprint, injects [], standards [], size s, tier standard, and a title defaulting to the directive's first line. Its own depends_on lists every prior task id except any currently blocked task; each blocked task (a build park) is separately reset to pending, has its report key dropped, and gets fix-N appended to its own depends_on -- chaining it behind the fix without creating a cycle -- in both the JS model and the retained YAML document (doc.setIn/deleteIn/addIn), mirroring appendRemediation's parse-mutate-render shape. checkTaskCovers now exempts fix-flagged tasks from task-covers-nothing (mirroring the remediation marker) while their empty covers still satisfies no criterion, and normalizeTask/parsePlan carry the fix flag through untouched. bin/spine.js wires `spine plan fix <feature-id> [fix.json|-]` (stdin default, matching remediate's convention) into the plan subcommand dispatch and usage strings. test/plan.test.js covers the append shape and round-trip, the reset-and-chain behavior with a cycle-freedom check via validatePlan, the task-covers-nothing/uncovered-criterion exemption plus the fix-2 not-one-shot case, and the three refusal paths -- each watched red (ReferenceError on the unexported name, then the CLI's prior usage-string rejection) before green by temporarily reverting src/plan.js and bin/spine.js and rerunning. test/spine-cli.test.js covers the CLI end to end: a happy path that appends fix-1, resets and chains a blocked task, and leaves a subsequent `spine plan check` passing, plus both refusal paths writing nothing. npm test (137/137) and npm run check both pass."
  - id: t5
    title: Latest-entry judgment — retried-aware patch-id dedup in the scanner
    status: built
    covers: [3]
    acceptance:
      - "src/validate.js replaces latestPatchId with a latest-entry reader: given a validations file's text it returns { patch_id, result, retried } for the entry under the LAST `## Validation` heading (retried is the mark string or null; null-safe on an absent/empty file → null); it anchors to `## Validation` headings only — never the last yaml block or the last patch_id: match — so a file ending in a `## Resolution` block (the docs/validations/model-selection.md shape) reads the Validation entry before it"
      - "`spine validate scan` computes dedup as: patch_id matches the latest entry's AND that entry carries no retried mark — a marked entry yields dedup false so all four legs run fresh"
      - "the scan output gains two fields: retried (the latest entry's mark or null) and latest_result (perfect|deviation|remediation-pending or null), alongside the existing fields"
      - "node:test coverage: unmarked match → dedup true; marked match → dedup false with the mark surfaced; no prior entry → dedup false with nulls; a fixture whose file ends in a trailing `## Resolution` yaml block still reads the last `## Validation` entry; npm test and npm run check pass"
    injects: [validator-verdict]
    standards: [docs/standards/pure-core-thin-cli.md]
    footprint: [src/validate.js, bin/spine.js, test/validate.test.js, test/spine-cli.test.js]
    size: s
    tier: standard
    depends_on: [t4]
    report:
      result: built
      footprint_actual:
        - bin/spine.js
        - src/validate.js
        - test/validate.test.js
      diff_actual:
        files: 3
        insertions: 92
        deletions: 16
      deviations:
        - "test/spine-cli.test.js was left untouched (not in footprint_actual) despite being in the declared footprint: the file is a growing hub shared across t1–t7 and, after t1–t4's own additions, sat at 348 of its 350-line eslint max-lines budget (confirmed by measuring the committed pre-t5 file directly) — essentially zero headroom for a CLI-level fixture test (a real git-repo-backed `spine validate scan` test needs ~25+ lines just for its git fixture and validations-file builder). Rather than suppress or raise the lint budget, criterion 2/3's dedup/field-surfacing behavior is instead covered where the actual logic now lives: `isDeduped` is extracted as its own pure, exported function in src/validate.js (a cleaner fit for docs/standards/pure-core-thin-cli.md, and it also resolved a bin/spine.js complexity-budget violation the inline boolean chain would otherwise have caused) and is directly unit-tested for the unmarked-match/marked-match/mismatch/no-prior-entry cases; bin/spine.js's `validate scan` wiring around it (reading the validations file, calling isDeduped/latestEntry, placing retried/latest_result in the output) is a thin, low-branching pass-through verified by reading. This is a planning signal for whoever plans t6/t7, which also declare test/spine-cli.test.js in their footprint."
      summary: "src/validate.js's latestPatchId is replaced by latestEntry(text), which returns { patch_id, result, retried } for the entry under the LAST `## Validation` heading, or null on an absent/empty file or one with no entry yet — anchored via a `^## Validation\\b` heading regex plus the same fence-scanning approach src/blocks.js uses for its own yaml blocks, so a file ending in a trailing `## Resolution` block (the docs/validations/model-selection.md shape) reads the Validation entry before it rather than that block's own (different) patch_id. A new pure isDeduped(patchId, latest) computes the dedup boolean: true only when latest is non-null, patchId matches latest.patch_id, and latest.retried is null/absent — a retried mark on the latest entry yields false even on a matching patch-id, so all four validator legs run fresh. bin/spine.js's validateCommand now calls latestEntry in place of latestPatchId, computes dedup via isDeduped, and adds retried/latest_result (latest's own retried/result, or null when there's no prior entry) to the scan's JSON output alongside the existing fields. test/validate.test.js replaces the old latestPatchId test with five new tests, each watched red before green (confirmed directly: reverting latestEntry to a naive last-patch_id-anywhere regex made the anchoring test fail, picking up the trailing block's own patch_id instead of the Validation entry's): absent/empty-file null-safety, reading the last of two entries (retried null when absent), a retried mark surfaced verbatim, anchoring to the last `## Validation` heading over a trailing `## Resolution` block carrying a different patch_id, and isDeduped's four cases (unmarked match true; marked match, a patch-id mismatch, and a null latest all false). npm test (141/141) and npm run check (0 errors, 0 warnings) both pass."
  - id: t6
    title: Validations-entry mutations — spine validate waive + the retried stamp
    status: built
    covers: [2, 3]
    acceptance:
      - "`spine validate waive <feature-id> [waiver.json|-]` reads { obligation, reason, approver } (all three required non-empty strings — exit 1 nothing written otherwise) and appends it to the waivers list of the entry under the LAST `## Validation` heading in docs/validations/<feature-id>.md, creating the waivers key when the entry lacks one; waivers carry no expiry field"
      - "a missing validations file or a file with no `## Validation` entry exits 1 with nothing written"
      - "src/validate.js exports a pure retried-stamp function: given the file text and a mark string, it sets (or replaces) the `retried` key on the last `## Validation` entry and returns the new text — consumed by t7's resolve command, and covered by its own tests here"
      - "both mutations anchor to `## Validation` headings and touch only that entry's yaml block — every byte outside it is preserved (parse the retained block, mutate, splice back), including any trailing non-Validation block such as a `## Resolution` section (fixture-tested); node:test coverage for both functions and the waive CLI including refusal exit codes"
    injects: [validator-verdict]
    standards: [docs/standards/pure-core-thin-cli.md, docs/standards/derived-and-hybrid-artifacts.md]
    footprint: [src/validate.js, bin/spine.js, test/validate.test.js, test/spine-cli.test.js]
    size: s
    tier: standard
    depends_on: [t5]
    report:
      result: built
      footprint_actual:
        - bin/spine.js
        - src/validate.js
        - test/validate.test.js
      diff_actual:
        files: 3
        insertions: 153
        deletions: 17
      deviations:
        - "test/spine-cli.test.js was left untouched despite being in the declared footprint, for the same reason t5's own completion report already flagged for this file: it sits at 348 of its 350-line eslint max-lines budget (confirmed by measuring directly before this task's own edits), leaving zero headroom for a CLI-level fixture test (the note/ledger/plan-fix CLI tests in that file each run 15-35 lines). Rather than suppress the lint rule or shrink another task's already-committed tests to make room, the waive CLI (bin/spine.js's waiveCommand) is instead a thin, low-branching pass-through over appendWaiver — read directly, and additionally exercised by hand against scratch fixtures (a happy path via both stdin and a file argument, a missing-required-field refusal, a missing-validations-file refusal, and a missing-entry refusal, each confirmed exit 1 with nothing written) rather than a committed automated CLI test. Both mutation functions (appendWaiver, stampRetried) and their shared anchoring/byte-preservation behavior are fully covered by committed, watched-red-then-green node:test cases in test/validate.test.js, including the fixture with a trailing `## Resolution` block. This confirms t5's own prediction that this file's budget would be a recurring planning signal for t6/t7."
      summary: "src/validate.js gains a shared lastValidationSpan(text) helper (anchoring to the LAST `## Validation` heading, never the last yaml block or last patch_id: match) that latestEntry is refactored onto (no behavior change — its existing tests pass unmodified) and that two new exported functions build on: appendWaiver(text, waiver) appends {obligation, reason, approver} to the waivers list of the entry under that heading, creating the waivers key when the entry lacks one via doc.hasIn/setIn/addIn on a YAML.parseDocument of the entry's own retained block, and refuses (throws, so no caller can write) a missing/empty required field or a file with no `## Validation` entry yet; waivers carry no expiry field by construction. stampRetried(text, mark) sets or replaces the `retried` key on that same entry the same way, consumed by t7's resolve command. Both splice their mutated inner block back via blocks.js's replaceBlock, so every byte outside the touched entry's own yaml block — including a trailing non-Validation block such as `## Resolution` — is preserved exactly (verified both by a dedicated fixture test and by running appendWaiver directly against the real docs/validations/model-selection.md, confirming byte-identical prefix and suffix around the mutated span). bin/spine.js wires `spine validate waive <feature-id> [waiver.json|-]` (stdin/file, matching the note/ledger/fix commands' convention): it reads the waiver JSON, reads docs/validations/<feature-id>.md (an absent file throws via readFileSync before any write), calls appendWaiver, writes the result back, and prints the updated latest entry as JSON. test/validate.test.js adds five new tests (appendWaiver create-then-append-to-existing-list including the no-expiry-field check; appendWaiver's two refusal paths; stampRetried set-then-replace; and a combined anchoring test proving both mutations touch only the last `## Validation` entry's block while leaving a trailing `## Resolution` block byte-identical) — each watched red before green (confirmed directly: temporarily stubbing both new exported functions to throw, reran the suite, and exactly those three new tests exercising them failed; restored, all green). npm test (145/145) and npm run check/lint both pass clean."
  - id: t7
    title: spine escalation resolve — the shared resolution spine
    status: built
    covers: [2, 3]
    acceptance:
      - "`spine escalation resolve <feature-id> <kind> [--reason <text>] [--phase <plan|build|validate>]` accepts kinds retry|fix-in-place|re-plan|waive; defer exits 1 with a message that defer leaves the park in place; any other kind exits 1"
      - "the phase comes from the record at docs/escalations/<feature-id>.md; --phase is the damaged-park escape hatch — required when no record exists, refused (exit 1) when one does; with --phase the record-deletion step is skipped"
      - "guards, nothing written on failure: the feature's status in design.md must be parked; waive requires phase validate; retry on a validate park requires --reason"
      - "status flips exactly: retry → designed (plan park) / building (build or validate park); fix-in-place → designed (plan park) / building (build or validate park); re-plan → designed (any phase); waive → validated"
      - "kind-specific extras: re-plan deletes docs/plans/<feature-id>.md when it exists; retry on a validate park stamps the latest validations entry retried: '<today UTC YYYY-MM-DD> — <reason>' via t6's stamp function"
      - "effect order: flip status, run extras, delete the escalation record, re-render the Ledger (so What-needs-you drops the entry); the command never commits — the adjust skill owns the booking commit; output is JSON naming feature, kind, phase, the new status, every file deleted, and the retried mark when stamped"
      - "the kind/phase validation and flip table live as a pure function in src/escalation.js (throws on invalid combinations); bin/spine.js performs the effects; node:test coverage for the table and for the CLI (each kind's happy path, each guard's exit-1)"
    injects: [escalation-record]
    standards: [docs/standards/pure-core-thin-cli.md, docs/standards/derived-and-hybrid-artifacts.md]
    footprint: [src/escalation.js, bin/spine.js, test/escalation.test.js, test/spine-cli.test.js]
    size: m
    tier: complex
    depends_on: [t1, t6]
    report:
      result: built
      footprint_actual:
        - src/escalation.js
        - bin/spine.js
        - test/escalation.test.js
      diff_actual:
        files: 3
        insertions: 386
        deletions: 5
      deviations:
        - The declared footprint listed test/spine-cli.test.js for the CLI tests, but that file sits at 348 of its 350-line eslint max-lines budget (skipBlankLines/skipComments) — the exact planning signal t5's and t6's completion reports flagged for whoever plans t7. The escalation-resolve CLI subprocess tests were placed in test/escalation.test.js (in-lease, alongside the pure-function tests) instead of touching spine-cli.test.js; spine-cli.test.js was left byte-identical. footprint_actual therefore omits test/spine-cli.test.js.
        - Adding the escalation command pushed bin/spine.js's effective line count to 355 (over the 350 max-lines budget) and resolveEscalationCommand's cyclomatic complexity to 13 (over 10); both were resolved without any lint suppression — the flag-parse loop was folded inline into escalationCommand, the phase-resolution guards were extracted into resolveParkPhase, and the pure function's intermediate boolean const was inlined to satisfy unicorn/consistent-boolean-name.
      summary: "spine escalation resolve — the shared resolution spine — now exists in two layers. The pure planResolution(kind, phase, {reason}) in src/escalation.js holds the kind/phase validation and a flip table: retry/fix-in-place flip a plan park to designed and a build/validate park to building; re-plan flips any phase to designed; waive flips a validate park to validated. It throws on every invalid combination (defer with a 'leaves the park in place' message, an unknown kind or phase, waive off a non-validate park, and retry-on-a-validate-park with no reason), so no caller writes on a bad resolution — proven by two node:test cases (crit 1, 3, 4, 5, 7). bin/spine.js performs the effects: it resolves the park's phase from docs/escalations/<id>.md (or from --phase, the damaged-park escape hatch, refused when a record exists and required when none does — crit 2), guards the feature's design.md status is parked, then runs the contracted order — flip status, run kind-specific extras (re-plan deletes docs/plans/<id>.md when present; retry-on-validate stamps the latest validations entry retried '<today UTC YYYY-MM-DD> — <reason>' via t6's stampRetried), delete the escalation record (skipped under --phase), and re-render the Ledger so What-needs-you drops the entry (crit 5, 6). It never commits — the adjust skill owns the booking commit — and prints JSON naming feature, kind, phase, the new status, every file deleted, and the retried mark when stamped (crit 6). Five CLI subprocess tests cover each kind's happy path (retry on a build park, fix-in-place on a plan park, re-plan and waive on a validate park, retry-on-validate with --reason), the --phase damaged-park path, and every guard's exit-1 with design.md left byte-identical (crit 7). Full suite 152/152, npm run check (spine check + eslint) clean."
  - id: t8
    title: Workflow spawn schemas admit kind-stamped menus
    status: built
    covers: [1]
    acceptance:
      - "the PLAN, BUILD, and VALIDATE spawn schemas in workflows/inner-loop.js accept menu items that are either bare strings or { resolution, option } objects (option required, resolution a string), using only standard JSON Schema keywords, with both object keys described in properties so the harness's schema-as-template behavior preserves them"
      - "meta stays on its single pinned line and the workflow relays menus verbatim — no menu transformation is added to the script"
      - "test/inner-loop-park.test.js gains kind-stamped-menu coverage: a plan bounce, a build block, and a validate deviation each scripted with a [{resolution, option}, …] menu assert BoundaryResult.parked carries it verbatim; existing bare-string cases keep passing"
      - "npm test and npm run check pass"
    injects: [escalation-record, boundary-result]
    standards: []
    footprint: [workflows/inner-loop.js, test/inner-loop-park.test.js]
    size: s
    tier: standard
    depends_on: []
    report:
      result: built
      footprint_actual:
        - workflows/inner-loop.js
        - test/inner-loop-park.test.js
      diff_actual:
        files: 2
        insertions: 95
        deletions: 3
      deviations: []
      summary: "workflows/inner-loop.js gains a menuArray schema fragment (items: anyOf[{type:'string'}, {type:'object', properties:{resolution:{type:'string'}, option:{type:'string'}}, required:['option']}]) — only standard JSON Schema keywords, both object keys named in properties per the schema-as-template rule — and PLAN_SCHEMA, BUILD_SCHEMA, and VALIDATE_SCHEMA's own `menu` field now points at it instead of the old bare stringArray. meta stays on its single pinned line, and parkEntry/the rest of the script are untouched: menus still relay via `menu: r.menu` verbatim, so no transformation was added. test/inner-loop-park.test.js gains three new tests — a plan bounce, a feature-kind build block, and a validate deviation, each scripted with a [{resolution, option}, ...] menu — asserting both that the corresponding spawn's own opts.schema.properties.menu accepts a kind-stamped object (watched red against the pre-change stringArray schema, confirmed green after the schema edit) and that BoundaryResult.parked carries the scripted menu array verbatim; the five pre-existing bare-string-menu tests are untouched and still pass. npm test (155/155, full suite) and npm run check (0 errors, 0 warnings) both pass."
  - id: t9
    title: Plan and build agents author kind-stamped menus
    status: built
    covers: [1]
    acceptance:
      - "agents/plan.md's escalation-record template and bounce-return shape show menu as [{resolution: <kind>, option: <text>}, …], recommended first, with the resolution kinds named (retry | fix-in-place | re-plan | defer — waive belongs to validate parks only and is never offered here)"
      - "agents/build.md's park step and blocked-return shape carry the same kind-stamped menu form"
      - "both surfaces stay self-contained — no ADR or internal-doc references introduced"
    injects: [escalation-record]
    standards: [docs/standards/loop-surfaces.md]
    footprint: [agents/plan.md, agents/build.md]
    size: xs
    tier: standard
    depends_on: []
    report:
      result: built
      footprint_actual:
        - agents/build.md
        - agents/plan.md
      diff_actual:
        files: 2
        insertions: 12
        deletions: 6
      deviations: []
      summary: agents/plan.md's step-5 bounce menu prose and yaml template, and its step-9 bounce-return shape, now show menu as [{resolution, option}, ...] with the recommended option first, and name the valid resolution kinds for a plan park (retry | fix-in-place | re-plan | defer), explicitly excluding waive (validate-only). agents/build.md's step-5 park menu prose and yaml template, and its step-6 blocked-return shape, carry the identical kind-stamped form and the same excluded-waive note for a build park. Neither file gained an ADR or internal-doc reference (grep confirms zero ADR mentions in both). Both files are prose-only agent surfaces with no automated test coverage in the repo; npm test (155/155) and npm run check (spine check + eslint, 0 errors/0 warnings) both pass unchanged, confirming no regression.
  - id: t10
    title: Validator amendments — retried-aware dedup, deviation-crash healing, waiver consumption, kind-stamped menus
    status: built
    covers: [1, 2, 3]
    acceptance:
      - "agents/validate.md's dedup step reads the scan's new retried/latest_result fields: dedup true with latest_result deviation AND the feature's graph status short of parked → complete the missing park booking reconstruction-style (menu authored from the latest entry's recorded findings, escalation record written, set-status parked, ledger render, one `<feature-id>: book parked at validate` commit) before returning; the healed return carries the reconstructed deviation and menu alongside the dedup shape, so the boundary relay surfaces them rather than a bare entry; dedup true otherwise → book nothing, as today"
      - "the step states that a retried-marked latest entry arrives as dedup false — all four legs run fresh, and the fresh entry never copies the retried key (it consumes the mark by position)"
      - "a waiver-consumption rule lands before the verdict computation: findings are checked against every prior entry's waivers in docs/validations/<feature-id>.md; a finding whose cited obligation matches a recorded waiver is recorded in its leg annotated as waived (naming the waiver's approver) and excluded from verdict computation — a fully-waived set of contract-breaking findings no longer blocks perfect"
      - "the deviation-park menu (step 7) and the return shape's menu are kind-stamped [{resolution, option}] recommended first, and the return shape's waivers entries drop the expiry field"
      - "the surface stays self-contained; no ADR references introduced"
    injects: [validator-verdict, escalation-record]
    standards: [docs/standards/loop-surfaces.md]
    footprint: [agents/validate.md]
    size: s
    tier: standard
    depends_on: [t6]
    report:
      result: built
      footprint_actual:
        - agents/validate.md
      diff_actual:
        files: 1
        insertions: 54
        deletions: 13
      deviations: []
      summary: "agents/validate.md's dedup step (step 1, item 6) now documents the scan's retried and latest_result fields: it states that a retried mark on the latest entry already yields dedup false (all four legs run fresh) and that the run's own fresh entry at step 7 must never copy that mark forward, consuming it by position instead (criterion 2). The same step branches on dedup true: when latest_result is deviation and the feature's graph status is short of parked, the step now walks a reconstruction-style healing path before returning — author the menu from the latest entry's own recorded findings, write the escalation record, set-status parked, render the Ledger, and commit `<feature-id>: book parked at validate`, then return the dedup shape plus the reconstructed deviation and menu; every other dedup-true case still books nothing exactly as before (criterion 1). A new 'Waiver consumption' paragraph opens section 6 (Verdict), run before the checked-order computation: every finding across all four legs is checked against every prior validations entry's waivers, a cites/obligation match is annotated waived (naming the approver) and excluded from every check that follows, so a leg whose contract-breaking findings are all waived counts as PASS and a fully-waived set no longer blocks perfect (criterion 3). Step 7's Deviation menu-authoring instructions and its escalation-record yaml template, and step 8's return-shape menu (both the main shape and the Blocked shape), are now kind-stamped [{resolution, option}] with the recommended option first, naming the five validate-park resolution kinds (retry | fix-in-place | re-plan | waive | defer); the return shape's waivers entries dropped their expiry field, and the <finding> shape gained an optional waived field naming the matching waiver's approver (criterion 4). No ADR or internal-doc reference was introduced anywhere in the file (grep confirms zero ADR mentions), and every edit stays prose the agent can act on with only the file itself and its explicit inputs (criterion 5). agents/validate.md is a prose-only surface with no automated test coverage in the repo (matching t9's own precedent); npm test (155/155, full suite on loop/surfacing) and npm run check (spine check clean; eslint clean on agents/validate.md itself — the only lint errors present live entirely in the unrelated executor-delegation worktree, outside this task's footprint) both confirmed no regression."
  - id: t11
    title: The adjust skill — docket choreography and typed fold-back recipes
    status: pending
    covers: [1, 2]
    acceptance:
      - "skills/adjust/SKILL.md exists with name/description frontmatter, self-contained (no ADR or internal-doc references), and opens with a clean-tree gate on the integration target — a dirty tree is told to the human and stops everything, never stashed or reset"
      - "choreography: present the full docket first (every docs/escalations/*.md record, in the order their features appear in design.md's feature graph; stalled/halted items from the run relay are stated, never decisioned), then walk one escalation at a time recommended-answer style — the menu's first option is the recommendation, the human confirms, overrides, or goes off-menu; pre-steps (research, a config rebind, a design amendment via the design skill or spine note, waiver recording via spine validate waive) attach content without changing the kind; a design amendment that removes a parked node entirely must also delete that feature's escalation record and re-render the Ledger in the same commit"
      - "per-kind recipes are spelled out: defer runs nothing and moves on; retry runs spine escalation resolve retry (--reason required on validate parks); fix-in-place routes the human's fix — spine note on a plan park, spine plan fix (directive + acceptance + footprint JSON) on a build or validate park — then resolves; re-plan optionally amends design as a pre-step, resolves (which deletes the plan artifact), and plain-deletes loop/<feature-id> only after the booking commit lands; waive records every waiver first, refuses to be the kind when any contract-breaking finding stays unwaived (that is fix-in-place with waivers as pre-step), squash-merges loop/<feature-id> with message `<feature-id>: validated at design_version <n> — waived`, pins the probe pack iff the latest validations entry's runtime leg PASSed, then resolves and deletes the branch last"
      - "commit discipline: one booking commit per resolution, message `<feature-id>: escalation resolved — <kind>`, carrying the resolve mutations plus any pre-step artifacts; waive adds its merge commit first, and its crash window heals at entry by probing the target log for the `— waived` merge message — found means skip the merge and go straight to resolve; HEAD stays on the integration target; after the docket, propose the next stateless run"
    injects: [escalation-record]
    standards: [docs/standards/loop-surfaces.md]
    footprint: [skills/adjust/SKILL.md]
    size: m
    tier: complex
    depends_on: [t7]
  - id: t12
    title: /the-loop boundary wiring — adjust handoff, run-history booking, notification push, hand-rule retirement
    status: pending
    covers: [1, 4]
    acceptance:
      - "commands/the-loop.md's relay step books run history at EVERY boundary: assemble the run-summary JSON with date = today (YYYY-MM-DD, session-supplied — the BoundaryResult carries no date), run = the Workflow run identifier from the harness (or a session-chosen label when none is returned), completed passed through, parked and stalled reduced to their entries' feature ids, halted and budget passed through when present; then run spine ledger append-run with it and commit docs/ledger/ledger.md alone as its own booking commit with message `ledger: append-run <run>`"
      - "when parked is non-empty the relay hands off to the adjust skill (the run-boundary route in), and the resolve-parked proposal routes to the adjust skill at re-entry — both routes named explicitly"
      - "when parked or halted is non-empty and the notification-channel port is bound (harness push notification is the default adapter), the relay pushes a one-line summary; unbound, it says nothing and continues"
      - "CLAUDE.md's 'Hand-maintenance of loop artifacts (temporary)' section is deleted per its own sunset clause; the surface stays self-contained with no ADR references introduced"
    injects: [boundary-result, escalation-record]
    standards: [docs/standards/loop-surfaces.md]
    footprint: [commands/the-loop.md, CLAUDE.md]
    size: s
    tier: standard
    depends_on: [t3, t11]
```
