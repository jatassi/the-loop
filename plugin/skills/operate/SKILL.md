---
name: operate
description: Run an on-demand ops ask against a deployed instance through the project's own recorded toolkit, under loop-invariant guardrails. Use when the human asks to inspect, deploy, roll back, tail logs, flip a flag, or otherwise operate a running instance.
---

# Operate — route an ops ask onto the project's recorded toolkit

Operate prescribes only the skeleton — the routing and the guardrails, the part that
is the same in every project. The particulars live in the project's own recipe: the
`## Operations toolkit` section of `docs/architecture.md`, recorded at Design time,
sibling to the validation and release bindings. That section is the route table:
its capability entries and runbook pointers ARE the registry — command-is-documentation,
no separate list to keep in sync. This skill reads the section and matches the ask
against it. Nothing here is scheduled or autonomous: every run is human-attended and
on-demand, and deploys still ride the release skill's one synchronous gate — operate
adds no second deploy path.

## 1 · Read the recorded section

Read `## Operations toolkit` from `docs/architecture.md`. It records, under a fixed
order: deployment targets (where instances run and how you reach them); capability
entries, each tagged `read` or `mutate` at recording time so safety is never judged
at runtime; the bound observability solution; runbook pointers (default
`docs/runbooks/<topic>.md`, held loosely); and a never-do list.

**No `## Operations toolkit` section exists → the lazy retrofit.** Run the same
binding interview Design would have run — walk the human through deployment targets,
each capability tagged `read` or `mutate`, observability ("how will you know
something's wrong?"), runbook pointers, and the never-do list — then record the
section into `docs/architecture.md` under that exact heading, ordering fixed and
phrasing free. Then proceed with the original ask. This is a same-session
population, not a redesign: **no graph amendment**, no bumped `design_version`, and
**no re-entering Design**. The section is a recorded binding, not a feature.

## 2 · Classify and route

Classify the ask against the action boundary below, then route it onto the matching
capability entries and runbook pointers. The entry's recording-time `read`/`mutate`
tag decides whether the ask can run without pause — you never re-judge safety at
runtime. When a capability or apprisal path points at a runbook, **read that routed
runbook fully before acting** — never act from the ask alone when a runbook is
pointed at; the runbook is where the project's operational lore lives.

## 3 · The mutation preamble

Before any mutating toolkit action, state in one line what is about to run and why.
This one-line preamble precedes every mutation — it is the whole audit ceremony
(the session transcript is the audit trail). Only entries tagged `mutate` may
mutate; a `read` entry never mutates. The never-do list constrains everything,
`read` and `mutate` alike.

## The action boundary — instance vs repo, four classes

This is prescriptive routing, not enforcement — a direct human ask always trumps the
skill's routing.

| class | rule |
|---|---|
| read-only ops | run freely, via recorded `read` entries — no preamble, no gate |
| mutating instance actions | operate's domain — via recorded `mutate` entries only; the human is in-session by construction; the never-do list constrains; the one-line preamble precedes |
| repo changes | never operate's — a source fix exits to a **diagnose intake that names the originating operate session** (a link, or date + one-line summary) so the RCA doc inherits the operational evidence trail |
| toolkit/runbook doc corrections | operate produces them itself — the one repo write carved out of "repo changes never" |

**Self-correction duty.** When you observe the toolkit section or a routed runbook
drift from instance reality — a stale command, a moved endpoint, a capability the
recording missed — correct that doc drift in the **same session**, right where you
found it. This is the lone exception to "repo changes never": operate fixes its own
map, nothing else.

Everything else that would change the source — a bug in the deployed code, a missing
feature, a behavior that violates its contract — is not operate's to fix. File a
diagnose intake, name this operate session in it as the backlink, and let the bug
door take it from there.

## Never do

- never mutate through a `read` entry, or through no entry at all
- never run a mutating action without its one-line preamble
- never make a source/repo change here — file a diagnose intake instead
- never cross a never-do entry from the recorded toolkit, `read` or `mutate`

Consider mirroring the recorded never-do entries as `permissions.deny` rules or a
PreToolUse hook — those are enforced by the harness, not the model. This skill never
manages the permission rules; it only honors what the recorded section states.
