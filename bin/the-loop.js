#!/usr/bin/env node
// The one CLI over the loop — status plus the artifact spine — for the interactive
// session and agents. (The Workflow itself has no filesystem — it consumes the
// execution context via `args`.) Commands print JSON to stdout; `check` and `plan
// check` are lints that set the exit code.
//
//   the-loop status [feature-graph.md]  the human-readable status summary; writes nothing
//   the-loop status --json [root]   mode (unconfigured|configured|partial), position,
//                                    eligible set, and the next-action proposal
//   the-loop list   [feature-graph.md]  the parsed feature graph (minus internals)
//   the-loop check  [feature-graph.md]  validate + round-trip; report; exit 1 on failure
//   the-loop set-status <id> <status>  flip one feature's durable status in feature-graph.md
//                                    (designed|validated|shipped); prints the updated
//                                    node; exit 1, unwritten, on an unknown id or status
//   the-loop plan parse <id> [plan.md]              the parsed plan model
//   the-loop plan check <id> [plan.md] [feature-graph.md]   validate against the graph + round-trip
//   the-loop plan task <id> <task-id> [plan.md] [feature-graph.md]  one build task's task brief
//   the-loop prepare-execution-context --features <id,…> --target-branch <ref>
//                                    the one-shot execution context (ADR-0036/0038):
//                                    gates the graph, the scope, and the model table,
//                                    gathers per-feature design docs + plans (from
//                                    feature branches) + git-derived task state, and
//                                    prints the workflow's `args`. exit 1, nothing
//                                    printed, on any gate failure
//   the-loop worktree-create <branch> [--base-branch <ref>]  add .claude/worktrees/<branch>,
//                                    creating the branch from <ref> (default main) when
//                                    new; links node_modules for node projects; prints
//                                    {path, branch, created}
//   the-loop worktree-remove <path> remove a worktree and prune
//   the-loop executors-list [dir]   the parsed executor-playbook registry as JSON
//   the-loop models-list [defaults.json] [executors-dir]  resolved role table: plugin
//                                    defaults < project < local (.claude/settings*.json,
//                                    "the-loop".modelBindings); hard errors exit 1

import path from 'node:path';

import { parse } from '../src/parse-feature-graph.js';
import {
  check, clean, fail, modelsListCommand, out, planCommand, PLUGIN_ROOT,
  prepareExecutionContextCommand, read, readRegistry, setStatusCommand, statusCommand,
  worktreeCreateCommand, worktreeRemoveCommand,
} from './cli-commands.js';

const [cmd, ...rest] = process.argv.slice(2);

try {
  switch (cmd) {
    case 'status': {
      statusCommand(rest);
      break;
    }
    case 'list': {
      const model = parse(read(rest[0]));
      out(clean(model));
      break;
    }
    case 'check': {
      process.exit(check(rest[0]));
      break;
    }
    case 'set-status': {
      setStatusCommand(rest);
      break;
    }
    case 'prepare-execution-context': {
      prepareExecutionContextCommand(rest);
      break;
    }
    case 'plan': {
      planCommand(rest);
      break;
    }
    case 'worktree-create': {
      worktreeCreateCommand(rest);
      break;
    }
    case 'worktree-remove': {
      worktreeRemoveCommand(rest);
      break;
    }
    case 'executors-list': {
      out(readRegistry(rest[0] || path.join(PLUGIN_ROOT, 'docs/executors')));
      break;
    }
    case 'models-list': {
      modelsListCommand(rest);
      break;
    }
    default: {
      process.stdout.write('usage: the-loop <status [--json]|list|check|set-status <id> <status>|prepare-execution-context --features <id,…> --target-branch <ref>|plan <parse|check|task>|worktree-create <branch> [--base-branch <ref>]|worktree-remove <path>|executors-list [dir]|models-list [defaults.json] [executors-dir]> [file…]\n');
      process.exit(cmd ? 1 : 0);
    }
  }
} catch (error) {
  fail(error.message);
}
