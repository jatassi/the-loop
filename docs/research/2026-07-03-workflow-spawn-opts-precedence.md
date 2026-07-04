# Probe — workflow `agent()` spawn opts vs agent-definition frontmatter for `model`

**Status:** Probe record (the ADR-0029 probe pattern — "the build opens with... harness probes"
and confirmed at the first live run, `docs/adr/0029-inner-loop-run-mechanics.md`). Produced
2026-07-03 by the `model-selection` feature's task `t1`, before any spawn-opts plumbing lands
(`t5`, which will pass `model`/`effort` opts from `args.models[role]` into every workflow spawn).

## The question

`docs/adr/0030-model-selection-per-role-bindings.md` names one unresolved gap: when a workflow
script's `agent(prompt, opts)` call passes `opts.model` **and** the target agent-definition file
(`agents/<type>.md`) carries `model:` frontmatter, which one wins? The ADR already states, twice,
that it expects spawn opts to win — once as a "harness fact confirmed from the docs" ("the
per-invocation model parameter beats frontmatter") and once, contradictorily, flagging the exact
same claim as unconfirmed ("**One gap:** the workflow `agent()` opts' precedence over frontmatter
is undocumented" and, in "Considered and rejected," "spawn opts override it anyway" stated as
settled fact). This probe exists to resolve that tension: confirm the workflow-`agent()`-specific
precedence with real evidence, or state plainly why it can't be confirmed from here — never treat
the ADR's own assumption as the observation.

## Channels attempted

**1. This repo's own design record** (`docs/adr/0029-inner-loop-run-mechanics.md`,
`docs/adr/0030-model-selection-per-role-bindings.md`, `docs/design/design.md`):

```
grep -n "ADR-0029" docs/design/design.md
grep -n -i "probe" docs/adr/0029-inner-loop-run-mechanics.md
grep -n "model" docs/design/design.md
```

Finding: design.md line 166 records the gap as still open ("spawn-opts-over-frontmatter
precedence for workflow `agent()` opts is a documented gap — empirically confirmed as a first
build probe"). ADR-0030 §Context distinguishes two separate facts: (a) confirmed from the docs —
the session-side **Agent tool**'s per-invocation `model` parameter beats that subagent's
definition frontmatter; (b) unconfirmed — whether the **workflow script's `agent()`** opts follow
the same rule. This repo has never itself observed (b); it has only assumed it by analogy to (a).

**2. This repo's own workflow harness code** (`workflows/inner-loop.js`, `test/workflow-shim.js`):

```
grep -n "model\|effort" workflows/inner-loop.js
```

Finding: no spawn in the current script passes a `model` opt at all (t5 hasn't landed) — every
`spawn()` call passes only `agentType`, `label`, `phase`, `schema`, and (derive only) a hardcoded
`effort: 'low'`. `test/workflow-shim.js` is this repo's own test double for `agent()` — it records
whatever prompt/opts the script passes and returns a scripted reply; it has no connection to the
real harness's model-resolution logic, so running the shim can prove what opts *this script*
sends, never how the *real* harness arbitrates them against frontmatter. Not a usable channel for
the precedence question itself.

**3. No plugin agent has ever carried `model` frontmatter, so no historical conflict exists to
observe:**

```
grep -n "model" agents/*.md
git log -p --all -- agents/*.md | grep -nE "^\+model:|^-model:"
```

The first command's only two hits are prose inside `agents/plan.md`'s body ("...a weaker model,
and it gets the task contract..."), not a frontmatter field. The second command (full history of
every commit touching any `agents/*.md`) returns nothing — `model:` frontmatter has never existed
on any plugin agent file in this repo, so no past spawn (real or shimmed) could ever have produced
a frontmatter/opts conflict to inspect after the fact.

**4. Local Claude Code app cache** (`~/.claude/cache/changelog.md`):

```
grep -n -i "workflow" ~/.claude/cache/changelog.md | grep -i "model"
grep -n -i "model.*frontmatter\|frontmatter.*model\|per-invocation" ~/.claude/cache/changelog.md
```

Finding: the changelog documents subagent-model changes generally (e.g. "Restored the `model`
parameter on the Agent tool for per-invocation model overrides") but no entry names the workflow
`agent()` function's own opts or states its precedence against frontmatter specifically.

**5. Live-fetched official docs** (`code.claude.com/docs`, fetched fresh today, 2026-07-03):

```
curl -sS https://code.claude.com/docs/en/workflows.md
curl -sS https://code.claude.com/docs/en/agent-sdk/typescript.md
curl -sS https://code.claude.com/docs/en/sub-agents.md
curl -sS https://code.claude.com/docs/llms-full.txt
```

Findings:
- `/en/sub-agents.md` ("Choose a model") states a resolution order for "when Claude invokes a
  subagent": *(1) the `CLAUDE_CODE_SUBAGENT_MODEL` env var, (2) the per-invocation `model`
  parameter, (3) the subagent definition's `model` frontmatter, (4) the main conversation's
  model.* This is the same fact ADR-0030 called "confirmed from the docs," and it is phrased
  generically ("when Claude invokes a subagent"), not scoped to any one calling surface.
- `/en/workflows.md` states "Every agent in a workflow uses your session's model unless the
  script routes a stage to a different one" — confirming a workflow's `agent()` call *can* carry
  a model override, but not stating whether that override follows the same 4-step order as (5)
  above, or something else.
- Neither `/en/workflows.md` nor the Agent SDK reference (`/en/agent-sdk/typescript.md`, the page
  `/en/workflows.md` itself points to for "the full set of options") documents the in-script
  `agent()` function's options object at all — the SDK reference's own "Workflow" entries describe
  only the outer `Workflow` **tool**'s input (`script`/`name`/`scriptPath`/`args`/`resumeFromRunId`)
  and output shapes, never the `agent(prompt, opts)` global's fields (no `model`, `effort`,
  `agentType`, `label`, `phase`, or `schema` key is named anywhere in `llms-full.txt`). So the
  docs simply do not publish a field-by-field reference for workflow `agent()` opts to check
  precedence against in the first place — the generic subagent order above is the closest
  available statement, not a workflow-specific one.

**6. This Build agent's own tool boundary:**

```
grep -n "^tools:" agents/build.md
```

Finding: `tools: Read, Grep, Glob, Bash, Write, Edit` — no `Workflow` and no `Agent` tool. A Build
agent cannot itself invoke `agent()` or the `Workflow` tool, so it cannot construct the one
decisive test (an agent-definition file with `model` frontmatter set to one model, spawned via a
workflow's `agent()` with a conflicting `opts.model`, then inspecting which model actually served
the request) from inside a build task.

**7. Live session-transcript introspection.** This very Build task is itself running as a real
workflow `agent()` spawn (agentType `build`, spawned by the same run that spawned this feature's
plan agent), so its own transcript is a genuine — if inconclusive — data point:

```
cat ~/.claude/projects/-Users-jatassi-Git-the-loop/5146dc9e-d6cd-4c8a-98aa-7022dd28f387/subagents/workflows/wf_f1c42418-2a0/agent-a2dcad15fcdd0b271.meta.json
grep -o '"model":"[^"]*"' ~/.claude/projects/-Users-jatassi-Git-the-loop/5146dc9e-d6cd-4c8a-98aa-7022dd28f387/subagents/workflows/wf_f1c42418-2a0/agent-a2dcad15fcdd0b271.jsonl | sort -u
```

Finding: `{"agentType":"build","spawnDepth":1}` and every recorded turn served on
`claude-sonnet-5`, with no `model` key anywhere in the transcript. Consistent with channel 2 (no
`model` opt is sent by the current script) and channel 3 (`agents/build.md` carries no `model`
frontmatter) — this spawn has neither signal, so it inherited the launching session's model, per
ADR-0029's baseline posture. It confirms the transcript format that *would* carry the answer if a
conflicting pair were ever spawned (`.message.model` per turn), but there is no conflicting pair
to read here, so it doesn't settle precedence either.

## Conclusion — no channel available in this environment can observe the workflow-specific answer

No channel above produces a direct, workflow-`agent()`-specific empirical observation: channels 1–4
and 7 confirm the question has never been *tested* (no agent file has ever carried `model`
frontmatter, so no real or historical spawn ever had a conflict to arbitrate), channel 5 finds only
a generically-worded doc statement that isn't scoped to, or explicitly inclusive of, the workflow
`agent()` primitive specifically (and confirms the docs don't publish a field reference for that
primitive's opts at all), and channel 6 is the concrete, structural reason none of the above can be
turned into a live test from a build task: **a Build agent's own tool set
(`agents/build.md`: `tools: Read, Grep, Glob, Bash, Write, Edit`) has no `Workflow` or `Agent`
tool, so it cannot itself spawn the conflicting pair the question requires.** That test needs a
session with the `Workflow` tool (the launch leg, or a human running `/the-loop` directly) to
craft a throwaway agent-definition file with `model` frontmatter, spawn it through a workflow
`agent()` call with a conflicting `opts.model`, and read back which model actually served the
request — outside what this probe task's own tools can execute. Reporting the generic doc language
above as if it settled the workflow-specific case would be exactly the guess-presented-as-observation
this record is required to avoid; it is cited as the best available signal, not as the answer.

## Standing consequence for the plumbing either way

Two facts hold regardless of which side of the gap turns out to be true, so `t5`'s plumbing is not
gated on this probe:

1. **Spawn opts are passed regardless.** The pinned plumbing rule (`docs/plans/model-selection.md`
   §"Spawn opts from a binding," carried from ADR-0030 §"Workflow plumbing") has every spawn pass
   `model`/`effort` opts from the resolved binding whenever one exists — that's true whether the
   real harness's precedence turns out to favor opts or frontmatter, because the *plumbing's own
   contribution* is to supply the opt, not to adjudicate a conflict.
2. **No plugin agent file carries `model` frontmatter today, so there is nothing for opts to lose
   to.** Verified:

   ```
   grep -n "model" agents/*.md
   ```

   returns only the two prose hits inside `agents/plan.md`'s body noted in channel 3 above — no
   `model:` frontmatter line in any of `agents/build.md`, `agents/derive.md`, `agents/plan.md`, or
   `agents/validate.md`. Until some future surface adds `model:` frontmatter to a plugin agent
   file, the precedence question is real but inert: every spawn's model is decided by opts alone
   (or, when a role is unbound, by the documented session-model fallback), so `t5` can land safely
   on the assumption ADR-0030 already made, with this record as the durable evidence trail for why
   that assumption is still open and what would need to happen (a `Workflow`-tool-capable
   channel) to close it.
