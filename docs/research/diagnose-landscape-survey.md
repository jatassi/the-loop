# Landscape survey — diagnostic/debugging disciplines (informing the diagnose port)

**Date:** 2026-07-05 · **Produced by:** landscape-survey agent (5 parallel
researchers + adversarial verification pass; 10 primary sources re-fetched) ·
**Consumed by:** the diagnose feature design (ADR-0043,
`docs/design/features/diagnose.md`) — grounded the bundled fallback discipline, the
intake capture fields, and the RCA template's causal vocabulary.

---

## Reference point

the-loop's `diagnose` door — capture → triage → pluggable diagnosis loop →
permanent RCA doc + transient fix node → human gate on root cause + fix design →
test-first fix through the standard engine. Default port binding: the personal
`/diagnosing-bugs` skill; bundled fallback at survey time was 3 lines (reproduce
first; evidence before hypothesis; root cause, not symptom).

## Target: agentic coding toolchains

- **obra/superpowers `systematic-debugging`** ([raw SKILL.md](https://raw.githubusercontent.com/obra/superpowers/main/skills/systematic-debugging/SKILL.md), verified) — the field's strongest artifact. Iron Law: **"NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST."** Four phases: Root Cause Investigation → Pattern Analysis → Hypothesis and Testing → Implementation. Circuit breaker: "If 3+ fixes failed: Question the architecture." Phase 4 requires "Create Failing Test Case — Simplest possible reproduction… MUST have before fixing." Ships a banned-rationalizations table and technique files ([root-cause-tracing.md](https://raw.githubusercontent.com/obra/superpowers/main/skills/systematic-debugging/root-cause-tracing.md): "NEVER fix just the symptom").
- **SWE-agent** ([config/default.yaml](https://raw.githubusercontent.com/princeton-nlp/SWE-agent/main/config/default.yaml), verified) — reproduce-first as a numbered protocol ("Create a script to reproduce the error and execute it… Rerun your reproduce script and confirm that the error is fixed!") plus a cleanup checklist (rerun repro, remove the script, revert test-file edits). Anthropic's own [SWE-bench scaffold](https://www.anthropic.com/engineering/swe-bench-sonnet) uses the same template.
- **Codex CLI** ([gpt_5_1_prompt.md](https://raw.githubusercontent.com/openai/codex/main/codex-rs/core/gpt_5_1_prompt.md), verified) — "Fix the problem at the root cause rather than applying surface-level patches"; reproduction gets a privileged permission tier (repro may run "regardless of approval mode").
- **OpenHands** — test-after in the general flow; reproduce-before only in the failing-CI flow ([templates](https://raw.githubusercontent.com/All-Hands-AI/OpenHands/main/openhands/app_server/integrations/templates/suggested_task/failing_checks_prompt.j2)).
- **Devin** — no methodology in docs, but Cognition dogfoods a `!triage-bug` playbook: diagnosis-only, posting root cause + suggested fix back to the ticket ([blog](https://cognition.com/blog/how-cognition-uses-devin-to-build-devin)) — independent validation of the diagnose/fix split.
- **Cursor Bugbot** — PR-diff analysis; execution-based verification explicitly not yet shipped ([blog](https://cursor.com/blog/building-bugbot)). **Copilot coding agent** — sandbox test/lint validation, no reproduce mandate ([docs](https://docs.github.com/copilot/concepts/agents/coding-agent/about-coding-agent)). **Aider** — no discipline; the human is the loop. **Amp** — Oracle second-opinion escalation for hard bugs ([manual](https://ampcode.com/manual)). **Claude Code best practices** ([docs](https://code.claude.com/docs/en/best-practices)) — "write a failing test that reproduces the issue, then fix it"; "address the root cause, don't suppress the error."
- **Human gates:** nobody in this target has a formal pre-fix approval gate; closest are Devin's triage stop and superpowers' "discuss with your human partner" after 3 failed fixes.

## Target: methodology canon in tool form

- **Zeller** ([Intro_Debugging](https://www.debuggingbook.org/html/Intro_Debugging.html), verified) — the explicit scientific loop (question → hypothesis → prediction → test → repeat) with a **written hypothesis log** ("Writing these things down explicitly allow you to keep track of all your observations and hypotheses over time"). [DeltaDebugger](https://www.debuggingbook.org/html/DeltaDebugger.html) and [ChangeDebugger](https://www.debuggingbook.org/html/ChangeDebugger.html) ("Yesterday, my program worked. Today, it does not. Why?") both hard-require a `test() → PASS/FAIL/UNRESOLVED` oracle. TRAFFIC mnemonic *(flagged: secondary reconstruction)*.
- **Agans' 9 rules** *(flagged: cross-checked transcriptions — [Wheeler](https://dwheeler.com/essays/debugging-agans.html), [Embedded Artistry](https://embeddedartistry.com/blog/2017/09/06/debugging-9-indispensable-rules/))* — Make It Fail; Quit Thinking and Look; Change One Thing at a Time; Keep an Audit Trail; If You Didn't Fix It, It Ain't Fixed ("fix the cause, and fix the process").
- **git bisect** ([docs](https://git-scm.com/docs/git-bisect), verified) — `git bisect run` exit-code contract (0 good, 1–127 bad, 125 skip); **mozregression** does the same over prebuilt binaries. **rr/Pernosco/TTD** — the failing execution as a durable, replayable artifact. **C-Reduce/ddmin/SO-MRE** — minimisation at three automation levels *(SO page fetch-blocked; secondary-verified)*.
- **Ranked convergence within the canon:** reproduction > automated pass/fail oracle > minimisation > bisection > one-change-at-a-time > written falsifiable-hypothesis discipline > fix verification.

## Target: incident/postmortem practice

- **Google SRE** ([example postmortem](https://sre.google/sre-book/example-postmortem/), verified) — Impact / **Root Causes (plural)** / **Trigger** / Resolution / **Detection** / Action Items / Lessons Learned (incl. "Where we got lucky") / Timeline. "An unreviewed postmortem might as well never have existed" ([postmortem culture](https://sre.google/sre-book/postmortem-culture/)).
- **Atlassian** *(flagged: triangulated)* — proximate vs. root cause: "Root causes are reasons at the optimal place in the chain of events where making a change will prevent this entire class of incident" ([templates](https://www.atlassian.com/incident-management/postmortem/templates)).
- **PagerDuty** ([template PDF](https://postmortems.pagerduty.com/assets/pdf/PostmortemTemplate.pdf)) — doc owner ≠ fix owner; postmortem meeting as the gate. **incident.io** ([docs](https://docs.incident.io/post-incident/postmortem-templates)) — **Contributors/Mitigators** pairing; Follow-ups non-removable.
- **Allspaw, [The Infinite Hows](https://www.oreilly.com/radar/the-infinite-hows/)** — "Cause is something we construct, not find"; the single-cause fallacy. Every mature template has pluralized root cause or moved to contributing factors.
- All four practices gate **after** the doc; ours gates **before** the fix is built — tighter than industry norm.

## Target: bug-intake standards

- **Mozilla** ([bug-writing guidelines](https://bugzilla.mozilla.org/page.cgi?id=bug-writing.html), verified) — "Steps to reproduce are the most important part of any bug report"; STR = "Minimized, easy-to-follow steps"; expected vs actual defined; "finding a regression window can help identify the cause." **Bugzilla** — Product/Component, Version, Hardware/OS, Severity/Priority, `regression` keyword; Firefox's structured `Regressed By` links ([process](https://firefox-source-docs.mozilla.org/bug-mgmt/processes/regressions.html)).
- **GitHub issue forms** (raw templates fetched, verified) — [kubernetes](https://raw.githubusercontent.com/kubernetes/kubernetes/master/.github/ISSUE_TEMPLATE/bug-report.yaml): what-happened/expected/minimal-repro/version required; [nodejs](https://raw.githubusercontent.com/nodejs/node/main/.github/ISSUE_TEMPLATE/1-bug-report.yml): unique **"How often does it reproduce? Is there a required condition?"**; [vue](https://raw.githubusercontent.com/vuejs/core/main/.github/ISSUE_TEMPLATE/bug_report.yml) / [next.js](https://raw.githubusercontent.com/vercel/next.js/canary/.github/ISSUE_TEMPLATE/1.bug_report.yml): schema-required repro link, Next.js from an official **reproduction scaffold** + `next info` env dump; [react](https://raw.githubusercontent.com/facebook/react/main/.github/ISSUE_TEMPLATE/bug_report.md): no-repro → closed as not actionable.
- Intake fields map 1:1 onto diagnosis accelerators: version+regression window → bisect anchor; environment → reproduce; repro link → isolate.

## Target: other debug modes and community skills

- **Roo Code Debug mode** ([mode.ts](https://raw.githubusercontent.com/RooCodeInc/Roo-Code/main/packages/types/src/mode.ts), verified) — "Reflect on 5-7 different possible sources… distill to 1-2 most likely… add logs to validate… **Explicitly ask the user to confirm the diagnosis before fixing the problem.**" The only hard confirm-before-fix gate found anywhere — but no reproduction step. Repo archived 2026-05; carried forward by [Kilo Code](https://github.com/Kilo-Org/kilocode). Traces to a viral Cursor community prompt (Feb 2025).
- **wshobson/agents `debugging-strategies`** ([raw](https://raw.githubusercontent.com/wshobson/agents/main/plugins/developer-essentials/skills/debugging-strategies/SKILL.md), verified; MIT, active) — Reproduce → Gather Information → Form Hypothesis → Test & Verify; covers bisect; no test-before-fix, no gate.
- **VoltAgent debugger** ([raw](https://raw.githubusercontent.com/VoltAgent/awesome-claude-code-subagents/main/categories/04-quality-security/debugger.md), MIT) — only community artifact with a postmortem phase.
- **Negative findings:** Cline and Windsurf ship no methodology; **anthropics/skills contains no debugging skill** ([repo](https://github.com/anthropics/skills)) — the space is community-owned; superpowers is the de facto standard.

## Tablestakes, ranked by ubiquity (with our standing at survey time)

1. **Reproduce before you fix** — universal. *Ours: has it.*
2. **Root cause, not symptom** — near-universal; but the field **pluralizes** (Root Causes / contributing factors / Contributors). *Ours: singular — behind convergence.*
3. **Steps-to-reproduce / expected / actual triad** — universal in intake. *Ours: has it.*
4. **Automated red/green check as the engine of everything** — bisect, ddmin, SWE-agent, Anthropic. *Ours: has it, stronger than anyone (oracle-first headline phase).*
5. **Verify the fix by re-running the failure** — SWE-agent, OpenHands, Copilot, Agans R9. *Ours: has it.*
6. **Environment/version capture at intake** — universal across intake standards. *Ours: MISSING as an explicit field — biggest intake gap.*
7. **Hypothesis-then-experiment, one variable at a time** — Zeller, Agans, superpowers, Roo lineage. *Ours: skill has it (stronger: ranked + falsifiable); 3-line fallback did NOT.*
8. **Minimisation** — ddmin, C-Reduce, MRE, Mozilla. *Ours: skill has it; fallback did NOT.*
9. **Regression window / bisection** — git bisect, mozregression, Mozilla fields, Agans. *Ours: buried; absent from fallback and intake capture.*
10. **Written audit trail / findings artifact** — Zeller, Agans R6, all incident templates. *Ours: has it — ahead of every agent tool except Devin.*
11. **Post-doc review gate** — all postmortem practices. *Ours: has it, tighter (pre-fix, not post-doc).*

## Differentiators worth knowing

- Hard confirm-diagnosis-before-fix gate — Roo lineage only; ours already has it as the human gate.
- Regression-test-before-fix (red first) — superpowers + Anthropic advisory only; ours has it.
- **3-failed-fixes circuit breaker → question the architecture** — superpowers only; adopted into our fallback.
- Trigger vs. Root Causes + Detection + "where we got lucky" — Google SRE; Trigger/Detection adopted (bug-scaled).
- Reproduction as privileged permission tier — Codex CLI.
- Second-opinion pass on the diagnosis by a fresh model — Amp Oracle / Anthropic adversarial-subagent rung.
- Scaffolded minimal repro; determinism-rate intake question (nodejs) — adopted into capture.
- Cleanup checklist as exit protocol — SWE-agent; adopted.

## Recommendation adopted: the 10-step bundled fallback

(As folded into `docs/design/features/diagnose.md` — each step justified by multiple
independent traditions above.) Reproduce first (red-capable command) · capture
context (error text, environment, determinism, last known good) · minimise ·
bisect if regression · several ranked falsifiable hypotheses before testing any ·
evidence one variable at a time · root cause(s) not symptom (trigger vs. underlying;
why no existing test caught it) · regression test pinned before fix · circuit
breaker (3 failed fixes or no achievable repro → stop, record, escalate) · clean up
and record.

## Alternative default port bindings

- **obra/superpowers `systematic-debugging`** — strongest external candidate; de
  facto community standard; weaker than the personal `/diagnosing-bugs` on
  feedback-loop construction, minimisation, multi-hypothesis ranking. License
  unverified at survey time.
- **wshobson/agents `debugging-strategies`** — MIT, active; a reasonable named
  alternative, not a default (no test-before-fix, no gate).
- **No first-party artifact exists** — the pluggable-port + bundled-fallback design
  is necessary, not redundant.

## Closing synthesis

The field converges from two directions onto exactly the seam the-loop occupies:
methodology canon and benchmark agents supply the mechanics (oracle, reproduce,
minimise, bisect); incident practice supplies the epistemics and governance
(plural contributing causes, written reviewed artifact, tracked follow-through) —
and almost no surveyed system joins the two. The-loop's shape — a full oracle-first
loop feeding a reviewed RCA behind a pre-fix human gate — is a genuine composite
ahead of the field. The survey's implied priorities, all adopted: upgrade the
fallback to the 10 steps, promote environment capture and regression-window into
intake, pluralize the RCA's causal vocabulary (root causes + trigger + detection).
