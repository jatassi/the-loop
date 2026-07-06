// The status story, rendered on demand from the feature graph (ADR-0037): `the-loop
// status` prints it to stdout and nothing ever writes or commits it. Deterministic:
// the same model always renders the same bytes. Run history lives in git (`git log`),
// not here.

import { STATUS } from './feature-schema.js';
import { eligibleSet } from './propose-next-action.js';

/**
 * @param {import('./parse-feature-graph.js').DesignModel} model
 * @returns {string}
 */
export function renderStatusSummary(model) {
  const features = model.features || [];
  const counts = STATUS.map((s) => `- ${s}: ${features.filter((f) => f.status === s).length}`);
  const ready = eligibleSet(model).map((f) => `\`${f.id}\``);
  const rows = features.map((f) => `| ${f.id} | ${f.status} | ${f.title} |`);
  return [
    '# Status — projected from docs/feature-graph.md',
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
