#!/usr/bin/env node
// The one CLI over the loop — orientation plus the artifact spine — for the
// interactive session and agents. (The Workflow itself has no filesystem — it
// consumes the launch snapshot via `args`.) Commands print JSON to stdout; `check`
// and `plan check` are lints that set the exit code.
//
//   the-loop orient [root]          mode (cold-start|active|partial), position,
//                                    frontier, and the next-action proposal
//   the-loop graph  [graph.md]      the parsed feature graph (minus internals)
//   the-loop check  [graph.md]      validate + round-trip; report; exit 1 on failure
//   the-loop set-status <id> <status>  flip one feature's durable status in graph.md
//                                    (designed|validated|shipped); prints the updated
//                                    node; exit 1, unwritten, on an unknown id or status
//   the-loop ledger [graph.md]      print the status story to stdout; writes nothing
//   the-loop launch --scope <id,…> --target <ref>
//                                    the one-shot launch snapshot (ADR-0036/0038):
//                                    gates the graph, the scope, and the model table,
//                                    gathers per-feature design docs + plans (from
//                                    feature branches) + git-derived task state, and
//                                    prints the workflow's `args`. exit 1, nothing
//                                    printed, on any gate failure
//   the-loop plan parse <id> [plan.md]              the parsed plan model
//   the-loop plan check <id> [plan.md] [graph.md]   validate against the graph + round-trip
//   the-loop plan task <id> <task-id> [plan.md] [graph.md]  one build task's kernel
//   the-loop worktree create <branch> [--from <ref>]  add .claude/worktrees/<branch>,
//                                    creating the branch from <ref> (default main) when
//                                    new; links node_modules for node projects; prints
//                                    {path, branch, created}
//   the-loop worktree remove <path> remove a worktree and prune
//   the-loop executors [dir]        the parsed executor-playbook registry as JSON
//   the-loop models [defaults.json] [executors-dir]  resolved role table: plugin
//                                    defaults < project < local (.claude/settings*.json,
//                                    "the-loop".modelBindings); hard errors exit 1

import path from 'node:path';

import { orient } from '../src/entry.js';
import { parse } from '../src/parse.js';
import {
  check, clean, fail, launchCommand, ledgerCommand, modelsCommand, out,
  planCommand, PLUGIN_ROOT, read, readRegistry, setStatusCommand, worktreeCommand,
} from './cli-commands.js';

const [cmd, ...rest] = process.argv.slice(2);

try {
  switch (cmd) {
    case 'orient': {
      out(orient(rest[0]));
      break;
    }
    case 'graph': {
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
    case 'ledger': {
      ledgerCommand(rest);
      break;
    }
    case 'launch': {
      launchCommand(rest);
      break;
    }
    case 'plan': {
      planCommand(rest);
      break;
    }
    case 'worktree': {
      worktreeCommand(rest);
      break;
    }
    case 'executors': {
      out(readRegistry(rest[0] || path.join(PLUGIN_ROOT, 'executors')));
      break;
    }
    case 'models': {
      modelsCommand(rest);
      break;
    }
    default: {
      process.stdout.write('usage: the-loop <orient|graph|check|set-status <id> <status>|ledger|launch --scope <id,…> --target <ref>|plan <parse|check|task> <id>|worktree <create|remove>|executors [dir]|models [defaults.json] [executors-dir]> [file…]\n');
      process.exit(cmd ? 1 : 0);
    }
  }
} catch (error) {
  fail(error.message);
}
