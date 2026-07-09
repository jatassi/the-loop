# the-loop 

A Claude plugin with an opinionated agent-assisted development workflow.

## Subagents

Always include the model name in subagent titles like this: `[Opus] Do the thing`, `[Sonnet] Do the less complex thing`, `[Fable] Do the complex thing`. This applies to Agent-tool spawns only — workflow-spawned agents skip the prefix, because the workflow UI already displays each agent's model.

## Git hygiene

Never modify files directly in the main checkout unless explicitly instructed by the user. Instead, isolate in a worktree before making changes. Once changes are complete and validated, ask the user's approval to merge back to main. Merge directly, do not ask to open GitHub PRs.