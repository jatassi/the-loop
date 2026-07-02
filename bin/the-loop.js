#!/usr/bin/env node
// The deterministic half of /the-loop (feature: the-loop-entry). The command surface
// (commands/the-loop.md) calls this for machine truth before saying anything; agents
// may call it too. Prints JSON to stdout; exits 1 only on unexpected failure —
// cold-start is an answer, not an error.
//
//   the-loop orient [root]   mode (cold-start|active|partial), position, parked,
//                            frontier, and the next-action proposal

import { orient } from '../src/entry.js';

const [cmd, root] = process.argv.slice(2);

switch (cmd) {
  case 'orient': {
    try {
      process.stdout.write(`${JSON.stringify(orient(root), null, 2)  }\n`);
    } catch (error) {
      process.stderr.write(`the-loop: ${error.message}\n`);
      process.exit(1);
    }
    break;
  }
  default: {
    process.stdout.write('usage: the-loop <orient> [root]\n');
    process.exit(cmd ? 1 : 0);
  }
}
