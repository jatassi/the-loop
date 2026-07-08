// Unit discovery and run-matrix cell planning. A cell is one (unit, model, rep)
// triple; completed cells are identified by key in rows.jsonl and skipped on
// resume, so a run can be killed and relaunched without losing or double-counting.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const LEG_BY_DIR = { tasks: 'build', traps: 'build', scenarios: 'validate' };

async function readdirOrEmpty(base) {
  try {
    return await readdir(base, { withFileTypes: true });
  } catch {
    return [];
  }
}

export async function loadUnits(evalRoot) {
  const units = [];
  for (const [sub, leg] of Object.entries(LEG_BY_DIR)) {
    const base = path.join(evalRoot, sub);
    const entries = await readdirOrEmpty(base);
    const dirs = entries.filter((e) => e.isDirectory());
    for (const entry of dirs) {
      const dir = path.join(base, entry.name);
      const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'));
      if (manifest.id !== entry.name) { throw new Error(`manifest id ${manifest.id} != dir ${entry.name}`); }
      units.push({ id: manifest.id, dir, leg, manifest });
    }
  }
  return units;
}

export const rowKey = ({ unit, model, rep }) => `${unit.id}::${model}::r${rep}`;

export const adapterOf = (model) => (model.startsWith('grok') ? 'grok' : 'claude');

export async function loadDoneKeys(rowsPath) {
  let text;
  try {
    text = await readFile(rowsPath, 'utf8');
  } catch {
    return new Set();
  }
  const keys = text.split('\n').filter(Boolean).map((line) => {
    const row = JSON.parse(line);
    return `${row.unit_id}::${row.model}::r${row.rep}`;
  });
  return new Set(keys);
}

function unitSelected(unit, opts) {
  if (opts.filter && !unit.id.includes(opts.filter)) { return false; }
  return !opts.leg || opts.leg === 'all' || unit.leg === opts.leg;
}

export function buildCells({ units, matrix, opts = {} }) {
  const cells = [];
  const selected = units.filter((u) => unitSelected(u, opts));
  for (const unit of selected) {
    const legConfig = matrix.legs[unit.leg];
    const models = opts.models ?? legConfig.models;
    const reps = opts.reps ?? legConfig.reps;
    for (const model of models) {
      for (let rep = 1; rep <= reps; rep++) {
        cells.push({ unit, model, rep });
      }
    }
  }
  return opts.doneKeys ? cells.filter((c) => !opts.doneKeys.has(rowKey(c))) : cells;
}
