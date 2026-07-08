feature: run-presentation — Run presentation — scope-derived workflow description and prefix-free spawn labels
target: HEAD~1 · integration result: HEAD (already assembled — judge only)
diff under review: git diff HEAD~1..HEAD

acceptance criteria to judge:
1. given a valid scope, prepare-execution-context with --script-out <path> writes a copy of the canonical workflow script differing only in its meta description — one line naming the target branch and every in-scope feature id (past 5 ids, the first 5 then +<k> more) — while stdout stays the unchanged execution context; without the flag nothing is written
2. the splice is quote-safe (the description value lands JSON-stringified, meta stays one physical line) and shape-gated — a canonical script whose meta line doesn't match the expected description shape makes the command exit 1 with nothing written
3. no spawn label in the workflow carries a phase or agentType prefix — plan and validate labels are the bare feature id, build labels are <feature>/<task>, drive labels are <feature>/<task> via <executor>
4. the /the-loop launch leg passes --script-out and the Workflow call's scriptPath is the spliced per-run script, never the canonical workflows/ file

feature design doc (in tree): docs/designs/run-presentation/design.md
