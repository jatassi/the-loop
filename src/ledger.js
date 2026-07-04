// The status story, rendered on demand from the feature graph (ADR-0037): `spine
// ledger` prints it to stdout and nothing ever writes or commits it. Deterministic:
// the same model always renders the same bytes. Run history lives in git (`git log`),
// not here.

import { frontier } from './entry.js';
import { STATUS } from './schema.js';

/**
 * @param {import('./parse.js').DesignModel} model
 * @returns {string}
 */
export function renderLedger(model) {
  const features = model.features || [];
  const counts = STATUS.map((s) => `- ${s}: ${features.filter((f) => f.status === s).length}`);
  const ready = frontier(model).map((f) => `\`${f.id}\``);
  const rows = features.map((f) => `| ${f.id} | ${f.status} | ${f.title} |`);
  return [
    '# Status — projected from docs/design/graph.md',
    '',
    `Total: ${features.length} feature(s) at design_version ${model.designVersion}`,
    '',
    ...counts,
    '',
    `**Next:** ${ready.length > 0 ? ready.join(', ') : 'nothing dependency-ready.'}`,
    '',
    '| feature | status | title |',
    '|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}
