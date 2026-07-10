// Hook-inventory command implementations for the the-loop CLI: hooks-list and
// hooks-set. Split out of cli-commands.js (its sole caller alongside bin/the-loop.js)
// once the family generalization plus recorded-bindings plus settings-writer pushed
// that file over the max-lines budget — same split precedent as bin/the-loop.js →
// cli-commands.js itself.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

import { recordedBindingsStatus } from '../src/recorded-bindings.js';
import { writeSettingsEntry } from '../src/settings-write.js';
import { buildHooksTable, DESIGN, fail, out, warn } from './cli-commands.js';

// the-loop hooks-list — print every real hook-family resolution (defaults < user <
// project < local) plus the three recorded-binding statuses from architecture.md.
// A missing architecture.md is a stderr warning and every binding is treated as
// absent; resolver errors exit 1 with nothing printed to stdout.
export function hooksListCommand(argv = []) {
  const hooks = buildHooksTable();
  let architectureText = '';
  if (existsSync(DESIGN)) {
    architectureText = readFileSync(DESIGN, 'utf8');
  } else {
    warn(`no ${DESIGN} — recorded bindings treated as absent`);
  }
  const recordedBindings = recordedBindingsStatus(architectureText);
  // --compact: one single-line JSON entry per family so the whole inventory fits one
  // read — the pretty tree paged past agents' output windows (head + tail to see it).
  if (argv.includes('--compact')) {
    for (const [family, entry] of Object.entries(hooks)) {
      process.stdout.write(`${family}: ${JSON.stringify(entry)}\n`);
    }
    process.stdout.write(`recordedBindings: ${JSON.stringify(recordedBindings)}\n`);
    return;
  }
  out({ hooks, recordedBindings });
}

// Known settings-layer hook families (ADR-0049 inventory). Hardcoded here until a later
// task unifies the list with other consumers.
const HOOK_FAMILIES = new Set([
  'interview', 'modelBindings', 'testHarness', 'lint', 'precommit', 'notification', 'artifactStores',
]);
const HOOK_LAYERS = new Set(['user', 'project', 'local']);

// the-loop hooks-set <family> <layer> <json-value> — persist one "the-loop".<family>
// entry into the named settings layer (user → ~/.claude/settings.json, project →
// .claude/settings.json, local → .claude/settings.local.json). Creates the file and
// its .claude/ parent when absent. Unrelated keys byte-survive via writeSettingsEntry.
export function hooksSetCommand([family, layer, jsonValue]) {
  if (!family || !layer || jsonValue === undefined) {
    fail('usage: spine hooks-set <family> <layer> <json-value>');
  }
  if (!HOOK_FAMILIES.has(family)) {
    fail(`unknown family: ${family}`);
  }
  if (!HOOK_LAYERS.has(layer)) {
    fail(`unknown layer: ${layer}`);
  }
  let value;
  try {
    value = JSON.parse(jsonValue);
  } catch (error) {
    fail(`unparseable JSON value: ${error.message}`);
  }

  const file = hooksLayerPath(layer);
  const text = existsSync(file) ? readFileSync(file, 'utf8') : null;
  let next;
  try {
    next = writeSettingsEntry(text, family, value);
  } catch (error) {
    fail(`${error.message} (${file})`);
  }
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, next);
  out({ family, layer, file, value });
}

// Resolve the settings file for a layer. user uses the OS home directory (homedir());
// project and local are cwd-relative so a scoped cwd in tests targets the fixture.
function hooksLayerPath(layer) {
  if (layer === 'user') {
    return path.join(homedir(), '.claude', 'settings.json');
  }
  if (layer === 'project') {
    return path.join('.claude', 'settings.json');
  }
  return path.join('.claude', 'settings.local.json');
}
