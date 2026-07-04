#!/usr/bin/env node
// CLI over the artifact spine, for the interactive session and agents. (The Workflow
// itself has no filesystem — it consumes the index via `args`.) Commands print JSON to
// stdout; `check` is a lint that sets the exit code (0 ok / 1 on errors or round-trip drift).
//
//   spine parse  [design.md]        the full parsed model (minus internals)
//   spine index  [design.md]        the compact workflow-args index (no contract bodies)
//   spine resolve <id> [design.md]  a feature node + the contracts it references
//   spine check  [design.md]        validate + round-trip; report; exit 1 on failure
//   spine set-status <feature-id> <status>  flip one feature's status in design.md; prints
//                                            the updated node as JSON; exit 1, unwritten, on
//                                            an unknown id or an out-of-enum status
//   spine note <feature-id> <text>  append <text> to a feature's notes array in design.md;
//                                    prints the updated node as JSON; exit 1, unwritten, on
//                                    an unknown id or empty text
//   spine ledger render             regenerate docs/ledger/ledger.md from design.md +
//                                    docs/escalations/*.md (absent dir = none); idempotent
//   spine ledger append-run [summary.json|-]  insert one newest-first Run-history bullet
//                                    from a run-summary JSON; exit 1, unwritten, when
//                                    date/run are missing, the Ledger has no
//                                    "## Run history" heading, or the Ledger is absent
//   spine plan parse <feature-id> [plan.md]             the parsed plan model
//   spine plan check <feature-id> [plan.md] [design.md] validate against the design + round-trip
//   spine plan task <feature-id> <task-id> [plan.md] [design.md]        a build agent's task slice
//   spine plan report <feature-id> <task-id> [report.json|-] [plan.md]  fold a completion report in
//   spine plan remediate <feature-id> [findings.json|-]  append the remediation round-marker task;
//                                                        exit 1, unwritten, on a second round or a
//                                                        findings set with no file:line locations
//   spine plan fix <feature-id> [fix.json|-]  append a fix-N task (not one-shot); resets +
//                                             chains any blocked task behind it; exit 1,
//                                             unwritten, on empty acceptance/footprint
//   spine validate scan <feature-id> [target] [branch]  forensics tripwires + patch-id dedup over
//                                                       the feature branch's diff (target: main,
//                                                       branch: loop/<feature-id> by default)
//   spine validate waive <feature-id> [waiver.json|-]  append one waiver to the LAST
//                                                       "## Validation" entry; exit 1, unwritten,
//                                                       on a missing required field, a missing
//                                                       validations file, or a file with no entry
//   spine escalation resolve <feature-id> <kind> [--reason <text>] [--phase <plan|build|validate>]
//                                    resolve a parked feature: validate kind against the record's
//                                    phase, flip the status, run kind-specific extras (re-plan
//                                    deletes the plan; retry-on-validate stamps the retried mark),
//                                    delete the record, re-render the Ledger. Never commits — the
//                                    adjust skill owns the booking commit. --phase is the
//                                    damaged-park escape hatch (no record). exit 1, unwritten, on
//                                    any invalid kind/phase/guard
//   spine executors [dir]           the parsed executor-playbook registry as JSON,
//                                    keyed by id (dir default: <plugin-root>/executors);
//                                    an absent dir prints {}
//   spine models [defaults.json] [executors-dir]  resolved role table: plugin defaults <
//                                    project (.claude/settings.json) < local
//                                    (.claude/settings.local.json), "the-loop".modelBindings;
//                                    validated against the executor registry — a hard error
//                                    exits 1 with no table; the three guard warnings print to
//                                    stderr but never fail
//   spine ship status                docs/ships/ship-*.md's count, next N, previous
//                                    ship_sha, and the latest record's projection
//                                    ({ship, ship_sha, outcome, interrupted}) — the
//                                    healing + pin helper; exit 1, naming the file, on a
//                                    record with no "## Ship record" block

import path from 'node:path';

import { parse } from '../src/parse.js';
import { extractIndex, resolveIn } from '../src/resolve.js';
import { shipCommand } from './ship.js';
import {
  check, clean, escalationCommand, fail, ledgerCommand, modelsCommand, noteCommand,
  out, planCommand, PLUGIN_ROOT, read, readRegistry, setStatusCommand, validateCommand,
} from './spine-commands.js';

const [cmd, ...rest] = process.argv.slice(2);

try {
  switch (cmd) {
    case 'parse': {
      const model = parse(read(rest[0]));
      out(clean(model));
      break;
    }
    case 'index': {
      const model = parse(read(rest[0]));
      out(extractIndex(model));
      break;
    }
    case 'resolve': {
      if (!rest[0]) { fail('usage: spine resolve <feature-id> [design.md]'); }
      const model = parse(read(rest[1]));
      out(resolveIn(model, rest[0]));
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
    case 'note': {
      noteCommand(rest);
      break;
    }
    case 'ledger': {
      ledgerCommand(rest);
      break;
    }
    case 'plan': {
      planCommand(rest);
      break;
    }
    case 'validate': {
      validateCommand(rest);
      break;
    }
    case 'escalation': {
      escalationCommand(rest);
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
    case 'ship': { shipCommand(rest); break; }
    default: {
      process.stdout.write('usage: spine <parse|index|resolve <id>|check|set-status <id> <status>|note <id> <text>|ledger render|plan <parse|check|task|report|remediate|fix> <id>|validate <scan|waive> <id>|escalation resolve <id> <kind>|executors [dir]|models [defaults.json] [executors-dir]|ship status> [file…]\n');
      process.exit(cmd ? 1 : 0);
    }
  }
} catch (error) {
  fail(error.message);
}
