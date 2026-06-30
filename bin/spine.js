#!/usr/bin/env node
// CLI over the artifact spine, for the interactive session and agents. (The Workflow
// itself has no filesystem — it consumes the index via `args`.) Commands print JSON to
// stdout; `check` is a lint that sets the exit code (0 ok / 1 on errors or round-trip drift).
//
//   spine parse  [design.md]        the full parsed model (minus internals)
//   spine index  [design.md]        the compact workflow-args index (no contract bodies)
//   spine resolve <id> [design.md]  a feature node + the contracts it references
//   spine check  [design.md]        validate + round-trip; report; exit 1 on failure

import { readFileSync } from 'node:fs';
import { parse } from '../src/parse.js';
import { render } from '../src/render.js';
import { validate } from '../src/schema.js';
import { resolveIn, extractIndex } from '../src/resolve.js';

const DEFAULT = 'docs/design/design.md';
const read = (file) => readFileSync(file || DEFAULT, 'utf8');
const out = (obj) => process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
const clean = ({ _blocks, ...rest }) => rest; // drop the yaml Documents from JSON output
const fail = (msg) => { process.stderr.write(`spine: ${msg}\n`); process.exit(1); };

const [cmd, ...rest] = process.argv.slice(2);

try {
  switch (cmd) {
    case 'parse':
      out(clean(parse(read(rest[0]))));
      break;
    case 'index':
      out(extractIndex(parse(read(rest[0]))));
      break;
    case 'resolve':
      if (!rest[0]) fail('usage: spine resolve <feature-id> [design.md]');
      out(resolveIn(parse(read(rest[1])), rest[0]));
      break;
    case 'check':
      process.exit(check(rest[0]));
      break;
    default:
      process.stdout.write('usage: spine <parse|index|resolve <id>|check> [design.md]\n');
      process.exit(cmd ? 1 : 0);
  }
} catch (e) {
  fail(e.message);
}

function check(file) {
  const text = read(file);
  const model = parse(text);
  const { ok, errors, warnings } = validate(model);
  const roundTrips = render(text, model) === text;

  const line = (kind, i) => process.stdout.write(`  ${kind} ${i.code}: ${i.message}${i.where ? ` (${i.where})` : ''}\n`);
  warnings.forEach((w) => line('warn ', w));
  errors.forEach((e) => line('ERROR', e));
  if (!roundTrips) process.stdout.write('  ERROR round-trip: render(text, parse(text)) != text\n');

  const good = ok && roundTrips;
  process.stdout.write(
    `${good ? 'OK  ' : 'FAIL'} ${model.features.length} features, ${model.contracts.length} contracts — ` +
    `${errors.length} error(s), ${warnings.length} warning(s)\n`,
  );
  return good ? 0 : 1;
}
