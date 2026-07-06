# Operate landscape survey — agent-assisted operation of deployed software

**Date:** 2026-07-05 · **Consumer:** the operate-tooling brief
(`docs/briefs/operate-tooling.md`) · **Method:** four parallel researchers (agentic
SDLC tools; incident-response/AIOps copilots; runbook-automation practice; ChatOps
lineage), primary-source discipline, ~25 load-bearing quotes re-fetched verbatim in
a verification pass; unverified claims hedged inline.

---

## 1. Method note

- **Researchers:** four parallel, one per target class, each with a self-contained
  brief covering the same four questions (artifact contents, human-in-loop,
  downstream connection, worth stealing) and primary-source discipline (official
  docs and raw files over READMEs over blogs; verbatim quotes; one URL per claim;
  unofficial sources flagged).
- **Verification pass:** ~25 load-bearing quotes re-fetched against primary
  sources — every quote promoted into the tablestakes/differentiators sections was
  verified verbatim. One quote failed and was cut (incident.io's "The AI drafts the
  action. You click the button." — only the surrounding sentences confirmed); one
  was repaired (HolmesGPT's fixed-tier quote — doc moved to a `/latest/` path,
  where it verified exactly).
- **Reference point (ours):** the-loop's `operate-tooling`: a Design-time
  `## Operations toolkit` section in architecture.md (deployment targets,
  per-capability toolkit entries for deploy/logs/DB/flags, the bound observability
  solution and how it apprises the human, runbook pointers, a project-specific
  never-do list) plus a thin runtime `operate` skill that routes on-demand asks
  onto that toolkit with invariant guardrails: on-demand only, human in-session,
  read the routed runbook before acting, mutating-instance actions via the recorded
  toolkit only, repo changes never (diagnose/RCA intake instead), and a
  same-session docs-correction duty.

## 2. Target: Agentic SDLC / AI-coding tools

**(a) Artifact.** The headline is a well-evidenced negative: **all six core tools
stop their lifecycle at the merged PR** (Aider at the local commit). Devin's
knowledge surfaces are Playbooks ("like a custom system prompt for a repeated
task") and Knowledge ("a collection of tips, advice, and instructions that Devin
can reference in all sessions," gated by a required trigger description, invocable
via macros like `!deploy-checklist`) — deploy-shaped naming, no operate capability
behind it ([docs.devin.ai](https://docs.devin.ai/product-guides/knowledge)). Cursor
Rules are `.mdc` coding-convention files
([cursor.com/docs/rules](https://cursor.com/docs/rules)); OpenHands is
architecturally bounded by its sandbox-vs-host security frame; Aider's docs contain
zero deployment/production concepts; Copilot's agent runs in "an ephemeral
development environment, powered by GitHub Actions." Claude Code is the substrate,
not an operator — though its newest surfaces are ops-adjacent: deep links (docs
show an incident-runbook entry where "a deep link never executes anything on its
own"), Routines (documented "Alert triage" and "Deploy verification" use cases),
and Channels ([code.claude.com/docs/en/deep-links](https://code.claude.com/docs/en/deep-links),
[/routines](https://code.claude.com/docs/en/routines)). The only genuine operate
stories are two **added peers that own the runtime**: **Replit** ("Agent is not
able to modify the production database, this restriction is in place so that your
production database stays safe" —
[docs.replit.com](https://docs.replit.com/cloud-services/storage-and-databases/production-databases);
a posture retrofitted after its agent deleted a live prod DB in July 2025 — X
post/press, *flagged unofficial*) and **Vercel Agent** ("Agent is read-only by
default and cannot make changes until you approve the plan"; "When a task requires
write access, Vercel Agent presents a scoped plan and waits for your approval…
open a pull request, roll back, or update a config"; "elevated actions are
attributed to Agent, the requester, and the approver" —
[vercel.com/docs/agent](https://vercel.com/docs/agent)).

**(b) Human in the loop.** Uniform deny-first permission grammars: Claude Code —
"Rules are evaluated in order: deny, then ask, then allow" and the doctrinal line
**"Permission rules are enforced by Claude Code, not by the model. Instructions in
your prompt or CLAUDE.md shape what Claude tries to do, but they don't change what
Claude Code allows"**
([code.claude.com/docs/en/permissions](https://code.claude.com/docs/en/permissions));
Devin CLI mirrors it ("a deny rule always wins", per
[docs.devin.ai](https://docs.devin.ai/cli/reference/permissions)); Cursor requires
approval for terminal commands by default and concedes its natural-language
`allow_instructions`/`block_instructions` are "best-effort guardrails rather than a
hard security boundary"
([cursor.com/docs/agent/security](https://cursor.com/docs/agent/security)). The
cautionary standout: Copilot's firewall and branch protections are hard, but
**"Once you've configured an MCP server, Copilot will be able to use the tools
provided by the server autonomously, and will not ask for your approval before
using them"**
([docs.github.com](https://docs.github.com/copilot/how-tos/agents/copilot-coding-agent/extending-copilot-coding-agent-with-mcp))
— the shell-layer boundary silently excludes the MCP layer. **No coding tool has a
dev-vs-prod environment concept.**

**(c) Downstream.** 100% PR/issue-routed everywhere; Copilot bakes session-log
links into every commit and emits enterprise audit-log events. Counter-current:
Claude Code Routines run ops scenarios with "no permission-mode picker and no
approval prompts during a run," guarded by branch-prefix and network scoping — the
field's cloud direction is *removing* the in-session human.

**(d) Distinctive.** Devin Knowledge Suggestions ("Devin will automatically suggest
Knowledge to remember based on your feedback in chat," editable before saving —
verified) and Cursor's "When you see Agent make a mistake, update the rule. You can
even tag `@cursor` on a GitHub issue or PR to have Agent update the rule for you"
(verified) are the field's only self-correction loops — both dev-knowledge loops,
not runbook-vs-prod-reality loops.

## 3. Target: Incident-response / AIOps copilots

**(a) Artifact.** The richest lane, and the one that directly answers our encoding
question. Three vendors ship a **lightweight prose environment file distinct from
runbooks**: Datadog's `bits.md` — "a Markdown file that provides structured context
about your environment," giving "lightweight guidance to improve investigation
accuracy, query construction, and terminology alignment" (verified,
[docs.datadoghq.com](https://docs.datadoghq.com/bits_ai/bits_ai_sre/knowledge_sources/));
Resolve.ai's "Resolve MD" among five markdown knowledge types, with Runbooks
(deterministic, alert-bound) split from Skills ("markdown files with YAML
frontmatter" on "the open agent skills standard used by Claude" —
[docs.resolve.ai/skills](https://docs.resolve.ai/skills)); Cleric's free-text
Global Guidance. Prose runbooks are ingested as-is by PagerDuty's SRE Agent (from
Confluence/GitHub, with a provenance rule — main branch only), incident.io, Azure
SRE Agent (markdown/PDF/Word), and Cleric. Mutation surfaces are pre-registered
catalogs, not open-ended: PagerDuty recommended workflows appear only if
configured; Resolve.ai ships exactly one mutation type (alert silencing).

**(b) Human in the loop.** Marketing says "autonomous"; every verified shipped
mechanism is **propose-then-approve**. PagerDuty engineering: "Today, the agent
proposes. It doesn't mutate your systems, restart services, or run cleanup
scripts—it shows you the command and explains why," with execution deferred "until
those rails are in place" (verified,
[pagerduty.com/eng](https://www.pagerduty.com/eng/context-over-cleverness-building-pagerdutys-sre-agent/))
— and PagerDuty *removed* its Advance assistant's direct incident actions.
Resolve.ai: "every action requires explicit human approval before execution";
"only after a human explicitly clicks 'approve' does the execution engine carry out
the action using your integration credentials"; architecturally, "Resolve never has
direct access to execute write APIs on your monitoring platforms" (all verified,
[docs.resolve.ai/mitigation-actions](https://docs.resolve.ai/mitigation-actions)).
incident.io: "For autonomous actions (running a rollback, scaling a fleet)… human
approval is mandatory"; "Autonomous remediation remains limited, with human
oversight and decision-making central to production environments" (verified,
[incident.io guide](https://incident.io/blog/what-is-ai-sre-complete-guide-2026)).
Azure SRE Agent is the most complete governance model: "Read commands… Runs
immediately, no approval needed" vs "Write commands… Requires approval in Review
mode" (default), plus hard mode-independent guardrails — "The agent never runs
`delete` and `remove` commands… blocks all `az keyvault` commands" (verified,
[learn.microsoft.com](https://learn.microsoft.com/en-us/azure/sre-agent/execute-mitigations)).
Datadog Infra Ops scopes autonomy by tag: auto-apply in `env:staging`, approval in
`env:prod` (launch blog; reference docs 404 — *flagged*). Rootly publishes the
survey's sharpest **negative list**: "No production runtime actions. The assistant
won't run kubectl, roll back a deploy, restart a pod, or flip a feature flag. It
can create an action item and page someone who will." (verified,
[docs.rootly.com](https://docs.rootly.com/ai/rootly-in-slack/what-to-use-rootly-for)).

**(c) Downstream.** The field splits into PR-openers (Datadog "never auto-merges";
Cleric, whose only writes *are* PRs/issues plus "Hand off the diagnosis to Claude
Code, Cursor, or your in-house agent"; Grafana; incident.io on explicit ask) and
intake models (Azure's "**Create work item** | Agent creates GitHub issue or Azure
DevOps work item | Human-in-the-loop, change management" vs "**Direct mitigation**
… Trusted patterns, nonproduction" — verified; AWS DevOps Agent's copy-the-spec
handoff to a coding agent). **Nobody hotfixes the repo in place.** Audit is typed
and attributed at the top end: Azure's `AgentToolExecution`/`ApprovalDecision`
events; Resolve.ai's "every action is recorded: who proposed it, who approved or
rejected it, when, and what was affected" (verified); Rootly attributes AI actions
"to the actual user… not to a generic bot identity."

**(d) Distinctive.** HolmesGPT: "Each tool is *either* always auto-approved *or*
always human-approved — the split is fixed, so the model never has to guess whether
an action is safe to take on its own" (verified,
[holmesgpt.dev](https://holmesgpt.dev/latest/data-sources/builtin-toolsets/kubernetes-remediation-mcp/)),
with approvals bound by short-lived JWTs. PagerDuty's two-tier memory — durable
service-scoped "Observations" ("where logs and metrics live, the dashboards people
trust, the runbook anchors they use") vs incident-scoped "Recollections" (verified)
— is a near-exact analog of our toolkit-doc/diagnose-forensics split. Structural
absence as the hard gate recurs: AWS's SRE-agent sample backends are GET-only
OpenAPI specs; k8sgpt's plugin contract has no mutate method; Grafana's
`--disable-write` "prevents any tool with side effects from being registered."

## 4. Target: Runbook-automation practice

**(a) Encoding — is our prose doc an outlier? No.** The field is an explicit
two-lineage spectrum. The automation lineage encodes runbooks as declarative,
parameterized jobs: Rundeck YAML job definitions with typed `options`; StackStorm
actions ("pieces of code that can perform arbitrary automation or remediation
tasks") with JSON-Schema parameters; Ansible playbooks; AWS SSM Automation runbooks
("Runbooks use YAML or JSON… steps run in sequential order"). The doctrine lineage
— Google SRE, PagerDuty's public response docs, GitLab's real production runbooks —
is prose a trained human reads: "Playbooks contain high-level instructions on how
to respond to automated alerts… include debugging suggestions and possible actions
to take to mitigate impact and fully resolve the alert" (verified,
[sre.google/workbook/on-call](https://sre.google/workbook/on-call/)); GitLab's
runbooks repo is markdown-per-service co-located with scripts and dashboards, with
generated service-catalog skeletons and hand-written procedures
([gitlab.com/gitlab-com/runbooks](https://gitlab.com/gitlab-com/runbooks)). Dan
Slimmon's do-nothing scripting names the ladder between them: "A do-nothing script
is a script that encodes the instructions of a slog, encapsulating each step in a
function"; "This script doesn't actually *do* any of the steps"; it "lowers the
activation energy for automating tasks" (verified,
[blog.danslimmon.com](https://blog.danslimmon.com/2019/07/15/do-nothing-scripting-the-key-to-gradual-automation/)
— personal blog but the canonical citation). Prose is the legitimate first rung,
and the LLM era (bits.md, Resolve MD, prose-runbook ingestion) has re-legitimized
it as the *agent-facing* format.

**(b) Human in the loop.** The automation lineage's gates: Ansible check mode ("In
check mode, Ansible runs without making any changes on remote systems. Modules that
support check mode report the changes they would have made" — verified, with the
caveat "Modules that do not support check mode report nothing and do nothing"); AWX
Approval nodes; StackStorm Inquiries ("Inquiries allow you to pause a workflow to
wait for additional information," responder-restricted by users/roles — verified);
AWS SSM manual mode and `aws:approve`; Rundeck ACLs where "Deny rules are evaluated
**first** and take precedence over allow rules" with `read`/`run` as the
read-vs-mutate proxy (verified). The doctrine lineage's gate is a human role:
PagerDuty's Incident Commander — "Announce all suggestions for resolution to the
Incident Commander, it is their decision on how to proceed" and "do not follow any
actions unless told to do so!" (verified,
[response.pagerduty.com](https://response.pagerduty.com/during/during_an_incident/)).

**(c) Downstream.** Automation engines log everything (Rundeck audit events,
StackStorm execution history) but treat code fixes as out of scope. PagerDuty's
postmortem doctrine routes fixes as bounded downstream tickets — actionable,
specific, verb-first, narrowly scoped
([postmortems.pagerduty.com](https://postmortems.pagerduty.com/how_to_write/writing/))
— never incident-time actions.

**(d) Distinctive.** Google SRE binds observability to docs at creation: "In SRE,
whenever an alert is created, a corresponding playbook entry is usually created"
(verified) — the closest thing anywhere to our design-time observability-binding
question. And it names drift: "Details in playbooks go out of date at the same rate
as production environment changes. For daily releases, playbooks might need an
update on any given day" (verified). GitLab makes runbook updates an on-call duty
("submit updates to improve them for others" — handbook via search summary,
*flagged*). The famous "3x improvement in MTTR" playbook claim could not be
verified on a live sre.google page — treat as secondhand.

## 5. Target: ChatOps lineage

**(a) Command surface.** Twelve-plus years converge on a **flat registry of named
commands with self-documenting help**, never a rich capability schema: Hubot
scripts with `Commands:` comment blocks auto-indexed by `hubot-help`; StackStorm
action aliases (single YAML files); GitLab ChatOps, where the registry *is*
`.gitlab-ci.yml` on the default branch (verified) and any command requires "the
Developer, Maintainer, or Owner role" (verified); GitHub's own successor is
IssueOps ("GitHub Actions is the runtime that executes our desired logic when an
IssueOps command is invoked").

**(b) Guardrails, by ubiquity.** Near-universal: coarse admin/non-admin split
anchored to **platform-verified identity** — hubot-auth's source states
`HUBOT_AUTH_ADMIN` is "A comma separate list of user IDs," "the 'admin' role can
only be assigned through the environment variable," and "Names were insecure as a
user could impersonate a user" (all verified from `src/auth.coffee`). Common:
per-command ACLs (Errbot's `allowusers/denyusers/allowrooms/denyrooms`; Botkube's
channel-name→RBAC-group binding, making the channel the security boundary). **Rare
and a known gap:** RBAC keyed to the individual chat user — StackStorm's docs admit
the effective RBAC principal for ChatOps executions is the service account ("the
StackStorm user that is configured in hubot… by default that is `chatops_bot`" —
verified), with per-user enforcement still an open issue. Read-only-by-default as a
*named* stance is an LLM-era addition, not a Hubot-era survivor. "Break-glass" is
unattested anywhere in ChatOps literature.

**(c) Audit.** The single most universal claim across the whole survey: **the
channel is the audit log**. StackStorm's definitional page: "you are unifying the
communication about what work should get done with the actual history of the work
being done"; "Get complete history and audit trails of all commands executed via
ChatOps" (verified). Nobody in this lineage builds a second audit database on top
of the transcript. Chat-to-command mapping is uniformly literal (the regex/alias
*is* the dispatch) — a legibility guardrail. The "route a code fix to dev instead
of acting" branch **does not exist natively anywhere in ChatOps** — it lives in
individual script authors' judgment.

**(d) Distinctive.** Admin power grantable only out-of-band (never through the chat
surface itself) — structurally the same move as our "repo changes never."
Command-is-documentation (registry and help are one artifact).

## 6. Tablestakes, ranked by ubiquity

1. **Read/mutate action classification, fixed per action at registration — never
   decided by the model at runtime.** Azure (read vs write commands), HolmesGPT
   ("the split is fixed, so the model never has to guess"), PagerDuty
   (Diagnostic/Remediation categories), Rootly, Resolve.ai, Cleric, Vercel, Replit,
   Rundeck (`read`/`run`), Keep (`view`/`action`), AWS (`_read_operations` tool
   names), Claude Code/Devin/Cursor (read-only auto-approved), Grafana. *Ours: has
   the split in spirit (mutations only via recorded toolkit), but toolkit entries
   don't explicitly carry a read/mutate tag per capability — the one place we're
   below tablestakes.*
2. **Propose-then-human-approve before any mutating action.** Every verified
   shipped mechanism in the AIOps lane (PagerDuty, incident.io, Resolve.ai, Azure
   Review mode, Datadog-in-prod, Vercel, Rootly-destructive), the automation lane
   (AWX approval nodes, SSM `aws:approve`, StackStorm Inquiries), ChatOps approve
   buttons, and the doctrine lane (PagerDuty IC). Marketing autonomy consistently
   outruns shipped gating; two vendors (PagerDuty Advance, Cleric's original pitch)
   walked autonomy *back*. *Ours: has it, in a stronger form (human in-session
   throughout, not just at the click).*
3. **Attributed audit trail of agent actions.** Typed records at the top end (Azure
   `ApprovalDecision`, Resolve.ai who-proposed/approved/when/what, Rootly
   attribution-to-human, Copilot session-log links in commits); transcript-as-log
   at the minimalist end (the ChatOps lineage's founding virtue, treated as
   sufficient for 13 years). *Ours: session transcript only — the ChatOps precedent
   says that's defensible for a human-in-session design, provided the routed
   runbook and executed commands are visible in the same session.*
4. **Deny-overrides-allow, enforced below the model.** Claude Code ("deny, then
   ask, then allow"; "Permission rules are enforced by Claude Code, not by the
   model"), Devin, Rundeck ("Deny rules are evaluated first"), Azure's layered
   stack; the strongest form is structural absence of the mutate path (AWS GET-only
   specs, k8sgpt's no-mutate contract, Grafana's write-tool deregistration,
   Resolve.ai's separate execution engine, Replit's platform wall). *Ours: the
   never-do list is prose. The field's unanimous verdict is that prose shapes but
   doesn't enforce.*
5. **Code fixes route through a dev channel; nobody hotfixes the repo in place.**
   PR-openers gated at merge (Datadog, Cleric, Grafana, incident.io, all coding
   agents) or work-item/handoff intakes (Azure, AWS DevOps Agent, Rootly). *Ours:
   has it, as the strictest variant surveyed (repo changes never; diagnose
   intake).*
6. **Project-specific ops surface encoded as lightweight prose/markdown.** Datadog
   `bits.md`, Resolve MD, Cleric Global Guidance, Azure/PagerDuty/incident.io
   prose-runbook ingestion, GitLab's markdown repo, Google SRE playbooks. **A prose
   doc section is not an outlier — it's the converging agent-facing norm**;
   executable YAML registries are the pre-LLM automation lineage. *Ours: has it.*
7. **Environment scoping as a gating dimension.** Datadog tag-scoped
   staging-vs-prod policies, Azure per-response-plan autonomy ("Nonproduction
   environments" recommendation), Replit's prod/dev DB wall, Botkube/Errbot
   channel-as-boundary. Absent from every coding tool. *Ours: implicit via recorded
   deployment targets; adequate for the thin design but worth naming in the toolkit
   section.*

## 7. Differentiators

- **Scoped-plan approval with three-way attribution** — "elevated actions are
  attributed to Agent, the requester, and the approver" (Vercel).
- **Two-tier ops memory**: durable service Observations vs incident Recollections
  (PagerDuty eng) — external validation of our architecture.md-toolkit vs
  diagnose-forensics split.
- **Published concrete negative list** (Rootly: "won't run kubectl, roll back a
  deploy, restart a pod, or flip a feature flag") — the only falsifiable never-do
  list found; *per-project user-authored* never-do lists are unattested as a
  product feature anywhere. Ours is genuinely novel here.
- **Alert↔runbook binding at creation** (Google SRE: "whenever an alert is created,
  a corresponding playbook entry is usually created") and **agent-ops gated on an
  observability product** (Vercel Investigations require Observability Plus) — the
  only field analogs of our design-time "how will you know it's broken?" question,
  which otherwise **no surveyed system asks in a design artifact**.
- **Show-the-command-don't-run-it vs auto-fire-to-pre-registered-endpoint split**
  (FireHydrant Script step: "We'll show the raw script, letting your engineers
  copy/paste it into their terminal" vs signed Webhook step).
- **Inert routing links** (Claude Code deep links: "never executes anything on its
  own") — runbook routing without execution, our operate skill's shape in
  miniature.
- **Self-correction loops, all propose-then-confirm and none
  same-session-from-prod-divergence**: Devin Knowledge Suggestions, Cursor's
  update-the-rule/`@cursor`, GitLab's runbook-update on-call duty (*flagged: search
  summary*), FireHydrant's 90-day runbook-condition reconciliation, Azure's
  self-maintenance of its own synthesized memory only. **No surveyed system
  corrects a human-authored runbook when observed prod behavior diverges, in the
  same session** — our self-correction duty and our read-the-runbook-before-acting
  gate (nearest kin: HolmesGPT's `fetch_skill`, the AWS sample's "MANDATORY: You
  MUST show the complete runbook content") have no direct competitor.
- **Restraint micro-patterns**: PagerDuty's run-once-per-incident idempotence and
  main-branch-only runbook provenance; HolmesGPT's guardrail legibility (blocked
  output labeled "a designed safety feature, not an error" so the model doesn't
  route around the gate); hubot-auth's admin-only-out-of-band.

## 8. Answers to the brief's direct questions, with adopt/consider/reject

- **Tablestakes for touching prod:** items 1–4 above — fixed read/mutate
  classification, propose-then-approve on mutation, attributed traceability,
  deny-first enforced below the model. We meet or exceed all but the explicit
  per-entry read/mutate tag.
- **Is a prose doc section an outlier?** No (tablestake 6). The two closest
  commercial analogs of our `## Operations toolkit` are Datadog's `bits.md` and
  Resolve.ai's "Resolve MD" — both markdown environment files distinct from
  runbooks. Recording it at *design time* inside the SDLC artifact, however, is
  ours alone.
- **Agent-proposes-fix boundary:** the field routes to dev universally; our "repo
  never, diagnose intake" is the strictest surveyed form and needs no change.
  Nearest kin: Azure's work-item path, AWS's coding-agent handoff.
- **Self-correction / runbook drift:** doctrine exists (Google SRE staleness,
  GitLab duty), mechanisms are all after-the-fact and propose-then-confirm;
  same-session divergence-driven correction is an industry hole we're ahead on.
- **Observability binding at design time:** essentially unclaimed ground; only
  Google SRE's alert↔playbook doctrine and Vercel's Observability-Plus dependency
  gesture at it.

**Adopt (2):**

1. **Tag each toolkit entry read vs mutate.** The single most ubiquitous pattern in
   the survey, absent from our spec, and one prose word per entry. It also gives
   the operate skill a crisp rule for which entries even *can* be routed without
   pause.
2. **Google SRE's alert↔runbook binding as a nudge** in the Operations-toolkit
   prompts: when recording the observability solution, ask that each
   alert/apprisal path name the runbook it routes to. Cheap, doctrinally grounded,
   and it operationalizes our "how does it apprise the human" line.

**Consider (2):**

1. **Back the never-do list with harness enforcement.** The field's sharpest
   verified line — "Permission rules are enforced by Claude Code, not by the model"
   — is an argument *native to our own substrate*: the toolkit section could
   suggest mirroring never-do items as `permissions.deny` rules or a PreToolUse
   hook. Consider rather than adopt only because it adds a second artifact to keep
   in sync, against the minimalism frame.
2. **A one-line mutation preamble** (Vercel's scoped-plan shape): before any
   mutating toolkit action, the operate skill states what it's about to run and
   why, in-session. Near-zero cost; formalizes what a human-in-session flow mostly
   does anyway.

**Reject (3):**

1. **Scheduled/autonomous operation** (Devin Automations, Claude Code Routines,
   Datadog auto-investigations). The field's momentum runs this way, but every
   vendor's *verified* gating still reduces to propose-then-approve, and two
   vendors walked autonomy back. Our on-demand/human-in-session invariant is a
   deliberate stance the evidence supports.
2. **Structured job/action registries** (Rundeck/StackStorm/SSM YAML). The LLM-era
   systems converged back to prose+markdown for agent-facing knowledge; a
   schema-heavy registry buys us nothing at our scale.
3. **A separate operate audit log.** Thirteen years of ChatOps treat the transcript
   as the audit trail, full stop; our in-session transcript plus the
   diagnose-intake paper trail already is the record. (If anything, mirror
   Copilot's cheap trick: a diagnose intake filed from operate should link back to
   the operate session.)

## 9. Closing synthesis

The field is bifurcating. Below the agent, guardrails are hardening into structure
— GET-only tool contracts, executor splits, platform-enforced prod walls,
deny-first grammars enforced by the harness rather than the prompt. Above the
agent, autonomy is expanding — Routines and Automations run ops scenarios
unattended, and Datadog/Azure ship staged-autonomy ratchets scoped by environment.
What holds the middle together, in every system whose shipped mechanism we could
verify, is the same skeleton the-loop already prescribes: a recorded,
project-specific surface of what the agent may touch; read free, mutation behind a
human; fixes routed to dev. The survey's implication for the reference point is
therefore mostly confirmation with one hardening move: the design occupies
genuinely unclaimed ground (design-time toolkit recording,
observability-binding-as-a-question, must-read-runbook, same-session drift
correction, per-project never-do list), and its only real deviation from field
tablestakes — a never-do list and toolkit that live entirely in prose — sits
exactly on the fault line the field is moving away from. Tag entries read/mutate
now; keep enforcement-backing of the never-do list in reserve as the cheap upgrade
path the substrate already supports.

**Known holes, carried not synthesized around:** Slack's retired
approval-workflow blueprint; SRE "3x MTTR" wording unverified on a live page;
Devin's absence-inferred no-mutate boundary; Datadog Infra Ops 404'd reference
docs; incident.io GA status; no per-project technical never-do list found anywhere
in the field; no first-class read-vs-mutate job classification in
Rundeck/StackStorm/AAP.
