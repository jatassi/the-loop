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
//   the-loop set-status <id> <status> [graph-path]
//                                    flip one feature's durable status in the feature graph
//                                    (default docs/feature-graph.md; when graph-path is
//                                    supplied, read and write that file only)
//                                    (proposed|designed|validated|shipped); prints the
//                                    updated node; exit 1, unwritten, on an unknown id or status
//   the-loop plan parse <id> [plan.md]              the parsed plan model
//   the-loop plan check <id> [plan.md] [feature-graph.md]   validate against the graph + round-trip
//   the-loop plan task <id> <task-id> [plan.md] [feature-graph.md]  one build task's task brief
//   the-loop prepare-execution-context --features <id,…> --target-branch <ref>
//                                    [--script-out <path>] [--graph-path <path>]
//                                    the one-shot execution context (ADR-0036/0038):
//                                    gates the graph, the scope, and the model table,
//                                    gathers per-feature design docs + plans (from
//                                    feature branches) + git-derived task state, and
//                                    prints the workflow's `args`. exit 1, nothing
//                                    printed, on any gate failure. --script-out also
//                                    writes a launch-ready copy of the canonical
//                                    workflow script, its meta description spliced to
//                                    name this run's scope and target
//                                    (run-presentation); a shape-gate refusal exits 1
//                                    with nothing written
//   the-loop calibration-summarize    regenerate docs/calibration/index.md wholesale from
//                                    docs/calibration/runs/*.md (this repo only): a bounded
//                                    ## Digest section + ## Runs, one line per record.
//                                    Deterministic; a malformed record exits 1 naming the
//                                    file and writes no index
//   the-loop worktree-create <branch> [--base-branch <ref>]  add .claude/worktrees/<branch>,
//                                    creating the branch from <ref> (default main) when
//                                    new; links node_modules for node projects; prints
//                                    {path, branch, created}
//   the-loop worktree-remove <path-or-branch>  remove a worktree, by its path or its
//                                    branch name, and prune
//   the-loop executors-list [dir]   the parsed executor-playbook registry as JSON
//   the-loop models-list [defaults.json] [executors-dir]  resolved role table: plugin
//                                    defaults < user < project < local
//                                    (.claude/settings*.json + ~/.claude/settings.json,
//                                    "the-loop".modelBindings); hard errors exit 1
//   the-loop hooks-list             every real hook-family resolution (defaults < user
//                                    < project < local) plus recorded-binding status
//                                    from docs/architecture.md; missing architecture.md
//                                    warns and treats bindings as absent
//   the-loop hooks-set <family> <layer> <json-value>  persist one "the-loop".<family>
//                                    entry into the named settings layer (user|project|local);
//                                    creates the file when absent; unrelated keys survive

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { parse } from '../src/parse-feature-graph.js';
import {
  calibrationSummarizeCommand, check, clean, fail, modelsListCommand, out, planCommand,
  PLUGIN_ROOT, prepareExecutionContextCommand, read, readRegistry, setStatusCommand,
  statusCommand, worktreeCreateCommand, worktreeRemoveCommand,
} from './cli-commands.js';
import { hooksListCommand, hooksSetCommand } from './hooks-commands.js';

const [cmd, ...rest] = process.argv.slice(2);

try {
  switch (cmd) {
    case '--version': {
      const { version } = JSON.parse(
        readFileSync(path.join(PLUGIN_ROOT, '.claude-plugin/plugin.json'), 'utf8'),
      );
      process.stdout.write(`the-loop ${version}\n`);
      break;
    }
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
    case 'calibration-summarize': {
      calibrationSummarizeCommand();
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
      out(readRegistry(rest[0] || path.join(PLUGIN_ROOT, 'config/executors')));
      break;
    }
    case 'models-list': {
      modelsListCommand(rest);
      break;
    }
    case 'hooks-list': {
      hooksListCommand(rest);
      break;
    }
    case 'hooks-set': {
      hooksSetCommand(rest);
      break;
    }
    default: {
      process.stdout.write('usage: the-loop <status [--json]|list|check|set-status <id> <status> [graph-path]|prepare-execution-context --features <id,…> --target-branch <ref> [--script-out <path>] [--graph-path <path>]|calibration-summarize|plan <parse|check|task>|worktree-create <branch> [--base-branch <ref>]|worktree-remove <path-or-branch>|executors-list [dir]|models-list [defaults.json] [executors-dir]|hooks-list|hooks-set <family> <layer> <json-value>> [file…]\n');
      process.exit(cmd ? 1 : 0);
    }
  }
} catch (error) {
  fail(error.message);
}
