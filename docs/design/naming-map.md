# the-loop — rename map
enumerated_at: 3ef07178fdd936bfde2d0a14122d32031c1dcb6f
status: approved

Enumeration + blind generation per ADR-0044 / `docs/design/features/naming-map.md`.
Every proposed name below was produced by a fresh-context `claude -p` invocation
(no repo access, no CLAUDE.md, no prior conversation) that received only a family's
grammatical roles + jargon-free purpose lines — never a current name — and proposed
the family as a coherent set. `naming-map` and `rename-sweep` are constrained
`keep` rows per the feature's own constraints (born standard-compliant; the sweep
must not rename its own in-flight subtree), so they carry no blind proposal.

**Scope note (seam adjustments from the method's suggested groupings, recorded per
step 2):** ADRs/ship records/RCA docs/research/founding design docs are historical
records (ADR-0044) — their *content* and individual filenames are never renamed;
only the live path *conventions* going forward are in scope, so individual ADR/ship
titles are not enumerated as separate rows. `test/*.test.js` filenames are not
enumerated one-by-one either — they mechanically mirror their module's rename under
a fixed `<module>.test.js` suffix convention (its own single row under Code
modules), carrying no independent naming decision. Harness-native vocabulary owned
by the underlying platform (Claude Code's own terms: plugin, skill, subagent,
command, Workflow, marketplace) is out of scope — renaming the platform's own words
would misdescribe them, not clarify them. Two SDLC-phase words `plan`/`build`/
`validate` name both the phase and the agent role that performs it (one word, one
concept, doubling as noun and role id) — listed once each under **Lifecycle phases &
their surfaces**, not duplicated under **Roles / models / executors**.

**Verdict column:** resolved. The human gave the complete verdict set at the
2026-07-05 run boundary (bulk approval of the blind proposals with named
exceptions); the session transcribed them verbatim — the header flip to
`approved` is that human authorization, per Method step 6.

**2026-07-05 validation-boundary repair:** the validator found the enumeration
incomplete — two architecture-doc contract names (Feature node, Runtime probe),
their sibling Ship recipe, the graph's feature identifiers, and two already-
compliant conventions had no rows. All added below with human verdicts; the
Feature identifiers family is a recorded seam adjustment per Method step 2.
Feature-id policy (human-approved): ids follow their terms' approved verdicts
mechanically (not fresh naming decisions); standard-word compounds keep; only
jargon ids received fresh blind candidates (same isolated no-context protocol as
the draft). Also from the validator's blind-inference run (20/22): the
compose-and-prove verdict was upgraded to its runner-up after the miss lost the
test-gated half; the status --json miss was accepted — a flag carries a composite
purpose after the approved collapse, and the swept docs split it.

## Lifecycle phases & their surfaces
| current | role | purpose (jargon-free) | proposed | runner-ups | verdict |
|---|---|---|---|---|---|
| frame | a skill id (also names the SDLC phase) | the phase that turns a raw stated need into a sharpened, written statement of intent. | define | scope; specify | rename → define |
| design | a skill id (also names the SDLC phase and its output-document folder) | the phase that turns a statement of intent into an architecture, a list of shippable pieces, and one write-up per piece. | design | architect | keep (re-proposed blind) |
| plan | an agent role id (also names the SDLC phase) | the phase that turns one shippable piece of work into a checklist of small, independently gradable items, or decides the piece is small enough to do whole. | plan | decompose; breakdown | keep (re-proposed blind) |
| build | an agent role id (also names the SDLC phase) | the phase that writes the code for one piece of work and proves it with tests. | build | implement | keep (re-proposed blind) |
| validate | an agent role id (also names the SDLC phase) | the phase where someone other than the writer checks the finished work against what was promised. | validate | review; verify | keep (re-proposed blind) |
| ship | a skill id (also names the SDLC phase) | the phase that checks the code is ready, gets a person's go-ahead, and releases it. | release | ship; deploy | rename → release |
| diagnose | a skill id (also names the SDLC phase) | the phase that investigates a reported bug down to its root cause and designs the fix. | diagnose | troubleshoot; investigate | keep (re-proposed blind) |
| operate | names an SDLC phase (a feature id) | the phase covering day-to-day running and troubleshooting of the released system. | operations | maintenance; support | keep |
| Brief | a document name | the written statement of what to build and why, produced before any design starts. | brief | charter; spec | rename → brief |
| grilling | a skill/port name | the structured question-and-answer session that turns a rough idea or open question into firm, written decisions. | interview | elicitation; consultation | rename → interview (port term only; default binding id stays /grilling — a user-level skill outside this repo) |
| port | a generic role/slot name | a place in the process where a swappable skill can be plugged in, with a default supplied out of the box. | port | extension point; hook | keep (re-proposed blind) |
| intake door | a category name | one of several distinct ways a new request can enter the process after the first release. | intake channel | channel; entry point | rename → intake channel |
| design amendment | a workflow-path name | a small, obvious change applied directly to the existing design without a full re-interview. | amendment | standard change; fast path | rename → amendment |
| craft | a skill id | the shared bundle of code-quality guidance (standing rules, design vocabulary, a review catalog) drawn on across every phase that writes or judges code. | code-quality | coding-standards; code-standards | rename → code-quality |

## Engine & run vocabulary
| current | role | purpose (jargon-free) | proposed | runner-ups | verdict |
|---|---|---|---|---|---|
| inner loop | a system-component name (aliased as "the engine") | the automated sequence that carries one piece of work from planning through a checked, merged result. | integration pipeline | pipeline; delivery pipeline; orchestrator | rename → execution pipeline |
| BoundaryResult | a return-value type name | the summary a single execution run hands back: what finished, what needs a human decision, what failed to run at all, and what stopped the run early. | run summary | run result; run report; execution summary | rename → run summary |
| launch snapshot | an artifact/parameter name (aliased as "the snapshot") | the one bundle of everything a run needs, assembled before it starts so nothing has to be looked up again mid-run. | run snapshot | run context; execution context; input bundle | rename → execution context |
| feature graph | a document/data-structure name (aliased as "the graph") | the master list of shippable pieces of work, their current state, and which ones depend on which. | dependency graph | task graph; work graph; feature graph | keep |
| frontier | a computed-set name | the pieces of work that are ready to start right now because everything they depend on is already done. | ready set | ready queue; runnable set; eligible set | rename → eligible set |
| ready-set walk | a scheduling-algorithm name | the rule for deciding, at every moment during a run, which ready pieces of work proceed concurrently. | scheduling policy | concurrency policy; concurrency control; parallel execution policy | rename → concurrency policy |
| lane | a routing/classification name | which of a few standard paths a piece of work takes through the process, chosen by its size and complexity. | complexity tier | size tier; routing tier; processing tier | rename → workflow path (harmonized with the small/standard/bypass row) |
| worktree | a workspace name | an isolated, separate copy of the codebase that one unit of work runs in. | worktree | workspace; sandbox; working copy | keep (re-proposed blind) |
| integration target | a git-ref name (aliased as "target") | the branch that finished, checked work is merged into. | target branch | base branch; destination branch | rename → target branch |
| compose-and-prove | a conflict-resolution policy name | the rule for resolving two pieces of work that edit the same lines: only combine them if a single change can satisfy both, and only keep the combination if every affected test still passes. | merge policy | conflict resolution policy; test-gated merge policy; verified merge policy | rename → test-gated merge policy (upgraded from the primary at the 2026-07-05 validation boundary — the blind-inference miss lost the test-gated half) |
| target repo | a repository-role name | the repository the tool reads from and writes its output into, as opposed to the repository the tool's own code lives in. | target repository | project repository; consumer repository | rename → target repository |
| Feature node | a record-shape name | the record describing one shippable piece of work in the master list — its identifier, title, current state, what it depends on, and its acceptance criteria. | feature record | feature entry; feature spec | rename → feature record (validation-boundary addition) |

## Artifacts & paths
| current | role | purpose (jargon-free) | proposed | runner-ups | verdict |
|---|---|---|---|---|---|
| system design doc | a document path | the one write-up describing the whole system's architecture and its cross-cutting rules. | docs/architecture.md | ARCHITECTURE.md; docs/system-architecture.md; docs/architecture-overview.md | rename → docs/architecture.md |
| feature design doc | a document-path convention (aliased as "slice") | the one-page write-up, one per shippable piece of work, containing everything a newcomer needs in order to build or check it without asking around. | docs/slices/<slice>/spec.md | docs/slices/<slice>/README.md; docs/features/<slice>/spec.md; docs/slices/<slice>/overview.md | rename → docs/designs/<feature-name>/design.md |
| plan artifact | a document-path convention (aliased as "plan") | the checklist a piece of work was broken into, kept only until that work is finished. | docs/slices/<slice>/plan.md | docs/slices/<slice>/tasks.md; docs/slices/<slice>/checklist.md; docs/slices/<slice>/todo.md | rename → docs/plans/<feature-name>/plan.md |
| probe pack | a document-path convention | the recorded steps for manually starting up, exercising, and shutting down one piece of work, so a later release can re-run the same check. | docs/slices/<slice>/runbook.md | docs/slices/<slice>/verify.md; docs/slices/<slice>/test-steps.md; docs/slices/<slice>/manual-test.md | rename → docs/runbooks/<feature-name>/runbook.md |
| Runtime probe | a recorded-procedure name (an architecture-doc section) | the project-level recorded procedure for starting the built system, exercising it against acceptance criteria, and shutting it down — consumed when independently checking finished work. | system runbook | validation runbook; verification procedure | rename → validation runbook (runner-up adopted at the second validation boundary: 3/3 fresh agents read "system runbook" as an ops/incident runbook — a collision with release runbook's legitimate deploy reading) |
| Ship recipe | a recorded-procedure name (an architecture-doc section) | the project-level recorded release procedure — readiness checks, deploy commands, a health check, and the rollback path. | release runbook | release procedure; deployment runbook | rename → release runbook (validation-boundary addition) |
| RCA doc | a document-path convention | the permanent write-up of a bug's investigation: how it was reproduced, its root cause, and its fix. | docs/bugs/<bug>/rca.md | docs/bugs/<bug>-rca.md; docs/postmortems/<bug>.md; docs/bugs/<bug>/root-cause-analysis.md | rename → docs/bugs/<bug-short-description>.md |
| ship record | a document-path convention | the short record of what was released, when, and whether it worked. | docs/releases/<release>/log.md | docs/releases/<release>/report.md; docs/releases/<release>-log.md; docs/releases/<release>/notes.md | rename → docs/releases/v<version-number>/report.md |
| dictionary | a document name | the glossary of terms specific to this project, kept so everyone uses the same words for the same things. | glossary | terminology glossary; term glossary; project glossary | rename → glossary, at docs/glossary.md |
| ADR | a document-path convention | one permanent record of a single hard-to-reverse decision and the reasoning behind it. | docs/decisions/<decision>/record.md | docs/adr/<number>-<decision>.md; docs/decisions/<decision>/adr.md; docs/decisions/<decision>.md | keep (current convention docs/adr/<number>-<slug>.md) |
| actions log | a document name | the short list of open to-do items about the process itself, as opposed to any particular shippable piece of work. | process backlog | process todo list; housekeeping backlog; meta backlog | rename → docs/TODO.md |
| docs/design/graph.md | a document path | the master list of shippable pieces of work, their states, and dependencies | — | — | rename → docs/feature-graph.md (human-added at the boundary; term kept, path follows its renamed neighbors) |
| naming-map | a feature id / document name | the complete list of every name in the project below the top-level brand name, each with a plain-English purpose and a decision to keep it or a named replacement. | — | — | keep (born standard-compliant; sweep must not rename its own in-flight subtree) |
| rename-sweep | a feature id | the single pass that applies every approved rename across the whole codebase at once. | — | — | keep (born standard-compliant; sweep must not rename its own in-flight subtree) |

## CLI verbs
| current | role | purpose (jargon-free) | proposed | runner-ups | verdict |
|---|---|---|---|---|---|
| the-loop CLI | a command-line program name | the one command-line program used to inspect and operate on this project's tracked pieces of work. | work | tasks; flow | keep (brand tier) |
| orient | a CLI subcommand | print where the project currently stands and what to do next. | status | overview; next | rename → status --json (collapsed with ledger — sweep mechanics note 1) |
| graph | a CLI subcommand | print the master list of shippable pieces of work in a plain, readable form. | list | list-features; catalog | rename → list |
| check | a CLI subcommand | verify the master list of shippable pieces of work is well-formed and report any problems. | validate | lint; check | keep (avoids collision with the kept validate phase) |
| set-status | a CLI subcommand | change one shippable piece of work's recorded state. | transition | set-state; move | keep |
| ledger | a CLI subcommand | print a plain-English summary of where every piece of work currently stands. | summarize | report; status-report | rename → status (collapsed with orient — sweep mechanics note 1) |
| launch | a CLI subcommand | verify everything needed to start a run and assemble the bundle that run consumes. | launch | prepare; bootstrap | rename → prepare-execution-context |
| --scope | a CLI flag (on the launch subcommand) | the list of shippable pieces of work this run should cover. | --features | --feature-ids; --include | rename → --features |
| --target | a CLI flag (on the launch subcommand) | the branch this run's finished work should merge into. | --target-branch | --merge-into; --destination-branch | rename → --target-branch |
| plan parse | a CLI subcommand | read one piece of work's checklist and print it in a plain, readable form. | checklist-show | show-checklist; checklist-print | keep (blind checklist-* proposals assumed "plan" would not survive; the human kept plan as the artifact term) |
| plan check | a CLI subcommand | verify one piece of work's checklist is well-formed and matches the master list. | checklist-validate | validate-checklist; checklist-check | keep (same basis as plan parse) |
| plan task | a CLI subcommand | print everything one checklist item needs in order to be worked on. | task-describe | task-show; task-context | keep (same basis as plan parse) |
| worktree create | a CLI subcommand | set up an isolated copy of the codebase for one unit of work. | worktree-create | worktree-setup; worktree-add | rename → worktree-create |
| worktree remove | a CLI subcommand | tear down an isolated copy of the codebase once its work is done. | worktree-destroy | worktree-teardown; worktree-remove | rename → worktree-remove |
| --from | a CLI flag (on the worktree-create subcommand) | which existing branch a new isolated copy's branch should start from. | --base-branch | --start-point; --from-branch | rename → --base-branch |
| executors | a CLI subcommand | print the list of registered external command-line tools available to drive work. | tools-list | list-tools; tools | rename → executors-list |
| models | a CLI subcommand | print which AI model is assigned to each role in the process. | models-list | roles-list; list-models | rename → models-list |

## Statuses & conventions
| current | role | purpose (jargon-free) | proposed | runner-ups | verdict |
|---|---|---|---|---|---|
| designed \| validated \| shipped | an enum of recorded states for a shippable piece of work | the three recorded states a shippable piece of work can be in: designed but not yet built, built and independently checked, or released. | feature status | feature lifecycle stage; feature state | rename → feature status (enum name; values keep — pre-designed expansion deferred to a post-sweep design amendment, filed in the actions log) |
| xs \| s \| m | an enum of size classes for a checklist item | how big a single checklist item is, on a small fixed scale. | task size | task effort size; checklist item size | rename → task size (enum name; values keep) |
| completed \| blocked \| stalled \| halted | an enum of outcome buckets for a single execution run | the four ways a single execution run can leave a piece of work: finished, waiting on a human decision, failed to run at all, or the whole run stopped early. | run outcome | run result; execution outcome | rename → run outcome (enum name; values keep) |
| feature-shaped \| environment-shaped | an enum of values classifying a stoppage | whether a stoppage needs a decision about the work itself, or is caused by something broken around the work (tooling, access, credentials). | stoppage reason | block reason; halt cause | rename → blocker type (enum name; values keep) |
| loop/<id>, loop/<id>--<task>, "<feature>/<task>: …" | a branch-name and commit-subject naming convention | the fixed pattern branch names and commit messages follow, so which piece of work — and which item within it — produced a given commit can always be read off directly. | task branch and commit message convention | feature-task branch and commit message convention; branch and commit naming convention | rename → task branch and commit message convention (label only; literal patterns stay — sweep mechanics note 3) |
| ship-N | a git-tag and commit-subject naming convention | the fixed pattern used to mark and record each release in order. | release tag and commit message convention | release tagging convention; sequential release tag and commit convention | rename → release tag and commit message convention (label; future tags v<version-number> — sweep mechanics note 3) |
| lowercase slug (id pattern) | a validation rule for identifiers | the required shape of every shippable piece of work's short identifier, since it also becomes a branch name and a file path. | feature slug format | feature id format; feature identifier format | rename → feature slug format |
| id, title, status, depends_on, acceptance, notes, design_version | the master list's record field names | the field names of one shippable piece of work's record in the master list document. | — | — | keep (standard words, already compliant — no blind pass needed; validation-boundary addition) |
| fix-<slug> | an identifier-prefix naming convention | the fixed prefix marking a shippable piece of work as a bug fix rather than a new feature. | fix id prefix | bugfix prefix; fix branch prefix | rename → fix id prefix (label only; literal prefix stays) |
| cold-start \| active \| partial | an enum of a project's detected setup states | the three states an inspection can find a project in: nothing set up yet, fully set up, or only halfway set up. | unconfigured, partial, configured | none, partial, complete; not_set_up, partially_set_up, fully_set_up | rename → unconfigured, partial, configured (values renamed) |
| deviation | a checker's fail-verdict value | the verdict a piece of finished work gets when at least one requirement isn't actually met. | fail | failed; rejected | rename → fail |
| bounce | a planning-step decline value | the verdict that a piece of work is too large or too unclear to break into a checklist yet, and needs re-scoping first. | needs_refinement | needs_rescoping; too_large_to_plan | rename → needs_refinement |
| block typing | a stoppage-classification field name | the one distinction every stoppage report carries: whether it needs a decision about the work itself, or was caused by something broken around the work. | blocker_type | blocker_category; stoppage_cause; stop_reason | rename → blocker type (harmonized with its enum) |
| fix node | a feature-node type name | an ordinary tracked piece of work created specifically to fix a discovered bug; expected to disappear from the tracked list once released, while its investigation write-up stays behind permanently. | fix | bugfix; bug_fix; defect_fix | rename → fix |
| small \| standard \| bypass | an enum of values for which path a piece of work takes through the process | the three standard paths a piece of work can take: handled whole by one person or agent, broken into a checklist first, or skipped as trivial maintenance outside the tracked process entirely. | workflow_path | process_path; planning_mode; handling_mode | rename → workflow path (enum name; values keep — harmonized with the lane row) |

## Roles / models / executors
| current | role | purpose (jargon-free) | proposed | runner-ups | verdict |
|---|---|---|---|---|---|
| driver | an agent role id (aliased as "drive agent") | the role that runs a rote piece of work through an external command-line tool instead of editing it directly, then checks the result at the usual bar. | drive | operate; run; execute | rename → drive |
| decision-density tier | a task field name (aliased as "tier") | the name of the field that records how much independent judgment a checklist item leaves to whoever does it. | autonomy_level | discretion_level; judgment_level | rename → judgment level |
| rote \| standard \| complex | an enum of values rating how much judgment a checklist item requires | how much independent judgment a checklist item leaves to whoever does it, used to pick which model works on it. | judgment_level | autonomy_level; discretion_level; complexity_level | rename → judgment level (enum name; values keep — harmonized with its field) |
| model binding | a configuration-value shape | the record of which AI model — and how hard it should think — is assigned to a given role. | model_binding | model_assignment; role_model_mapping; model_config | rename → model_binding |
| low \| medium \| high \| xhigh \| max | an enum of values rating how hard an assigned model should think | how hard an assigned AI model should think on a given role, on a fixed scale. | effort_level | reasoning_effort; thinking_level; effort | rename → effort_level (values keep) |
| executor playbook | a document-path convention | the registration record for one external command-line tool: how to invoke it, which models it supports, and operational notes. | docs/executors/<name>.md | executors/<name>.md; docs/executors/<tool>.md; docs/tools/<name>.md | rename → docs/executors/<name>.md |
| via | a configuration-key name | the setting that names which registered external command-line tool a role's work is routed through. | executor | cli_executor; executor_name; tool | rename → executor |
| landscape-survey | an ad hoc research-agent id | the role that surveys how comparable systems solve a problem and reports the common patterns found. | survey | research; scan; landscape_review | rename → survey |

## Context-architecture terms
| current | role | purpose (jargon-free) | proposed | runner-ups | verdict |
|---|---|---|---|---|---|
| progressive disclosure | an architectural-principle name | the rule that an agent starts with the least context possible and fetches more only when it actually needs it. | least context principle | just-in-time context principle; lazy loading principle; minimal context principle | keep |
| role card | a document/prompt-section name | the fixed, short set of standing instructions every agent of one role always receives. | system prompt | base instructions; standing instructions | rename → system prompt |
| kernel | a prompt-section name | the one piece of task-specific information an agent's prompt cannot start its work without. | task brief | task description; task input | rename → task brief |
| menu | a prompt-section name | the short list, inside an agent's prompt, of what else it can fetch and when it's worth fetching. | fetch guide | reference index; resource guide; lookup guide | rename → resource guide |
| on-demand unit | a category name | a piece of information small enough to be fetched by itself, rather than an agent having to read a whole file to get it. | fact | snippet; field; chunk | rename → fact |
| task contract | a data-shape name | the complete specification for one checklist item: what it must do, how it will be judged, and which files it's expected to touch. | task contract | task specification; task spec | keep (re-proposed blind) |

## Code modules
*Blind agents were shown only a role of "a file path" and a plain-English purpose
— nothing tells them this repo is plain JavaScript with no build step, so several
proposals default to a generic `.ts` convention. A human approving a code-modules
rename should read the proposed path's directory/name and keep the current `.js`
extension unless a build step is separately adopted; that substitution is not a
fresh naming decision, so it does not require another blind pass.*

| current | role | purpose (jargon-free) | proposed | runner-ups | verdict |
|---|---|---|---|---|---|
| bin/the-loop.js | a file path (the CLI's entry point) | reads the command name off the command line and hands off to the matching implementation. | bin/cli.ts | src/cli.ts; src/entry.ts | keep (brand-tier binary) |
| bin/cli-commands.js | a file path | holds the command-line program's implementations, one function per command. | src/commands.ts | src/command-handlers.ts; src/actions.ts | keep |
| config/model-bindings.json | a file path | the configuration file assigning an AI model to each role in the process. | — | — | keep (standard words, matches the kept model_binding term; validation-boundary addition) |
| bin/probe-fixture.js | a file path | builds a disposable, realistic sample project for exercising the command-line program end to end. | test/fixtures/build-sample-project.ts | test/support/scaffold-project.ts; e2e/create-fixture-project.ts | rename → bin/create-sample-repo.js |
| src/blocks.js | a file path | finds and replaces one fenced block of machine-readable content inside a larger text document, leaving the surrounding prose untouched. | src/replace-fenced-block.ts | src/update-fenced-block.ts; src/splice-code-block.ts | rename → src/replace-fenced-block.js |
| src/parse.js | a file path | reads the master list document's text into an in-memory structure. | src/read-task-list.ts | src/parse-task-list.ts; src/load-task-list.ts | rename → src/parse-feature-graph.js |
| src/render.js | a file path | writes an in-memory structure back into the master list document's text, changing only what changed. | src/write-task-list.ts | src/save-task-list.ts; src/update-task-list.ts | rename → src/write-feature-graph.js |
| src/schema.js | a file path | defines what a well-formed shippable piece of work looks like and checks a given one against those rules. | src/task-schema.ts | src/validate-task.ts; src/task-contract.ts | rename → src/feature-schema.js |
| src/entry.js | a file path | figures out where a project currently stands and what to propose doing next. | src/propose-next-action.ts | src/recommend-next-step.ts; src/determine-status.ts | rename → src/propose-next-action.js |
| src/plan.js | a file path | reads, validates, and looks up items inside one piece of work's checklist. | src/task-checklist.ts | src/read-task-checklist.ts; src/task-criteria.ts | keep ("plan" survives as the artifact term) |
| src/launch.js | a file path | assembles everything one run needs, gated against the current state of the codebase. | src/build-run-context.ts | src/assemble-run-context.ts; src/prepare-run.ts | rename → src/prepare-execution-context.js |
| src/ledger.js | a file path | turns the master list into a plain-English status summary. | src/summarize-task-list.ts | src/task-list-summary.ts; src/report-status.ts | rename → src/status-summary.js |
| src/models.js | a file path | resolves which AI model is assigned to each role, layering overrides in a fixed order. | src/resolve-model-bindings.ts | src/resolve-model-config.ts; src/model-assignments.ts | rename → src/resolve-model-bindings.js |
| src/executors.js | a file path | reads external-tool registration records and checks role assignments against them. | src/verify-model-bindings.ts | src/check-model-bindings.ts; src/audit-model-bindings.ts | rename → src/executor-registry.js |
| src/status.js | a file path | changes one shippable piece of work's recorded state in the master list. | src/set-task-state.ts | src/update-task-state.ts; src/change-task-state.ts | rename → src/set-feature-status.js |
| src/index.js | a file path | re-exports everything else in its folder for other code to import from one place. | src/index.ts | src/lib/index.ts | keep |
| workflows/inner-loop.js | a file path | runs the automated plan-build-check sequence across every ready piece of work. | src/run-pipeline.ts | src/process-ready-tasks.ts; src/run-plan-build-check.ts | rename → workflows/execution-pipeline.js (in place — workflows/ is harness-owned) |
| test/workflow-shim.js | a file path (a test fixture, not itself a test) | runs the automated plan-build-check sequence's script under stand-in versions of the real runner's globals, so the checks exercise the exact shipped script. | test/fixtures/pipeline-harness.ts | test/fixtures/mock-runtime-globals.ts; test/fixtures/stub-globals-harness.ts | rename → test/execution-pipeline-harness.js |
| test/*.test.js naming convention | a file-naming rule | the rule that a file's automated checks live in a same-named file carrying a fixed suffix. | same-name `.test.ts` suffix convention | co-located test-file naming convention; sibling `.test.ts` file rule | keep (same-name .test.js suffix; no build step, .js stays) |

## Feature identifiers
*Validation-boundary addition (recorded seam adjustment, Method step 2): the
graph's feature ids were silently absent from the draft. Policy, human-approved:
an id whose term already carries an approved verdict follows it mechanically (not
a fresh naming decision); standard-word compounds keep; the three jargon ids
received fresh blind candidates under the draft's protocol. `naming-map` and
`rename-sweep` remain constrained keeps in Artifacts & paths. Renamed ids carry
their feature-doc and runbook filenames with them (rename-sweep mechanics).*

| current | role | purpose (jargon-free) | proposed | runner-ups | verdict |
|---|---|---|---|---|---|
| artifact-spine | a feature identifier | created the project's core document files, their validation rules, and the toolkit that reads and writes them. | document-foundation | document-schema; document-toolkit | rename → document-foundation |
| the-loop-entry | a feature identifier | built the tool's front-door command — detects a fresh project, onboards it, proposes the next action. | — | — | keep (brand + standard compound) |
| frame | a feature identifier | built the phase that turns a raw stated need into a written statement of intent. | — | — | rename → define (follows its term's verdict) |
| design | a feature identifier | built the phase that turns a statement of intent into an architecture and per-piece write-ups. | — | — | keep |
| plan | a feature identifier | built the role that breaks one piece of work into a checklist or declares it small enough to do whole. | — | — | keep |
| build | a feature identifier | built the role that writes and tests the code for one piece of work. | — | — | keep |
| craft-baseline | a feature identifier | bundled the shared code-quality guidance drawn on across every phase that writes or judges code. | — | — | rename → code-quality-baseline (follows its term's verdict) |
| validate | a feature identifier | built the role that independently checks finished work against what was promised. | — | — | keep |
| inner-loop-workflow | a feature identifier | built the automated plan-build-check sequence over ready pieces of work. | — | — | rename → execution-pipeline (follows its term's verdict) |
| ledger-title-preservation | a feature identifier | retired fix — stopped the status-report renderer from overwriting the report document's title line (kept as history). | title-preservation | report-title-guard; heading-overwrite-fix | rename → title-preservation |
| model-selection | a feature identifier | assigns an AI model to each role in the process via layered configuration. | — | — | keep (standard compound) |
| executor-delegation | a feature identifier | routes rote work through registered external command-line tools, with the result verified at the usual bar. | — | — | keep (standard compound) |
| workflow-phase-grouping | a feature identifier | groups the automated run's progress display by phase. | — | — | keep (standard compound) |
| surfacing | a feature identifier | retired mechanism — carried questions and failures from autonomous runs back to the human for decisions (kept as history). | escalation-queue | human-escalation; decision-relay | rename → escalation-queue |
| ship | a feature identifier | built the phase that checks readiness, gets a person's go-ahead, and releases. | — | — | rename → release (follows its term's verdict) |
| worktree-parallelism | a feature identifier | lets independent pieces of work proceed in parallel isolated copies with test-proven merges. | — | — | keep (standard compound) |
| diagnose | a feature identifier | built the phase that investigates a reported bug to its root cause and designs the fix. | — | — | keep |
| operate-tooling | a feature identifier | on-demand tooling for day-to-day running and troubleshooting of the released system. | — | — | keep (standard compound) |
| calibration-capture | a feature identifier | captures actual-vs-estimated cost of work items so later planning can learn from it. | — | — | keep (standard compound) |
| configure-step-full | a feature identifier | guided setup writing the tool's configuration at user and project scope. | — | — | keep (standard compound) |
| ports-adapters-full | a feature identifier | swappable process components behind validated contracts. | — | — | keep (standard compound) |
| research-tiers | a feature identifier | escalating research rigor when confidence is low on a consequential decision. | — | — | keep (standard compound) |
| severity-tiering | a feature identifier | an expedited, still-gated path for the most urgent bug fixes. | — | — | keep (standard compound) |

## Sweep mechanics (human-approved at the boundary)

The sweep consumes these verbatim, alongside the row verdicts:

1. **Status collapse**: the orient and ledger subcommands merge into one `status`
   subcommand — default output is the human-readable summary (today's ledger),
   `status --json` is the machine orientation (today's orient). One approved
   functional consolidation the sweep implements alongside the renames.
2. **Record moves**: existing docs/ships/* and docs/rca/* files move
   content-identical (git mv, filenames preserved) into docs/releases/ and
   docs/bugs/ respectively — content bytes unchanged; these paths are the one
   approved exception to the records-untouched rule.
3. **Convention rows rename labels, not literal patterns**: loop/<id>,
   loop/<id>--<task>, the "<feature>/<task>: …" commit-subject shape, and the
   fix-<slug> prefix all stay literally as-is. Exception: future release tags use
   v<version-number> with the report at docs/releases/v<version-number>/report.md;
   past ship-N tags and records stay (modulo note 2's move).
4. **Port binding**: the interview port's default binding id remains `/grilling`
   (a user-level skill outside the repo); only the repo-side term renames.
5. **Deferred, not lost**: the pre-designed feature-status expansion is filed in
   the actions log as a post-sweep design amendment — a semantic change, not a
   rename; the sweep must not implement it.
