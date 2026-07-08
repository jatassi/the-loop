// Optional, advisory-only blinded pairwise judge — never a rubric gate. Compares
// two passed builds of the same unit on code quality:
//   node eval/judge.js <diffA.patch> <diffB.patch> "<task summary>"
// Blinding: the diffs are presented in an order derived from their content hash,
// and the mapping is only printed after the verdict.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { invokeClaude } from './lib/cli-claude.js';
import { JUDGE_SCHEMA } from './lib/schemas.js';

const [fileA, fileB, summary] = process.argv.slice(2);
if (!fileA || !fileB) {
  console.log('usage: node eval/judge.js <diffA.patch> <diffB.patch> "<task summary>"');
  process.exit(1);
}

const diffs = [
  { file: fileA, text: await readFile(fileA, 'utf8') },
  { file: fileB, text: await readFile(fileB, 'utf8') },
];
const isFlip = createHash('sha256').update(diffs[0].text + diffs[1].text).digest()[0] % 2 === 1;
const [first, second] = isFlip ? [diffs[1], diffs[0]] : [diffs[0], diffs[1]];

const promptText = [
  'Two independent implementations of the same task. Judge which is the better',
  'engineering: correctness risk, clarity, test quality, fit with the surrounding',
  'codebase. Ignore diff length alone. Return JSON only per the schema.',
  '',
  `task: ${summary ?? '(no summary provided)'}`,
  '',
  '--- implementation A ---',
  first.text,
  '',
  '--- implementation B ---',
  second.text,
].join('\n');

const r = await invokeClaude({ model: 'opus', promptText, cwd: process.cwd(), schema: JUDGE_SCHEMA, timeoutMs: 600_000 });
const verdict = r.selfReport;
console.log(JSON.stringify(verdict, null, 2));
if (verdict?.preferred === 'A' || verdict?.preferred === 'B') {
  const winner = verdict.preferred === 'A' ? first : second;
  console.log(`preferred file: ${winner.file}`);
}
