// Surgical settings-write core (src/settings-write.js): whole-entry replacement under
// "the-loop".<family> while every unrelated byte of the settings file survives
// verbatim. Pure — text (or null) in, text out; no filesystem.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { writeSettingsEntry } from '../plugin/src/settings-write.js';

test('writeSettingsEntry(null, …) produces a well-formed document with the family set (missing-file case)', () => {
  const value = { commands: { test: 'npm test' } };
  const out = writeSettingsEntry(null, 'testHarness', value);
  const parsed = JSON.parse(out);
  assert.deepEqual(parsed['the-loop'].testHarness, value);
  assert.equal(Object.keys(parsed).length, 1);
  assert.equal(Object.keys(parsed['the-loop']).length, 1);
});

test('unrelated top-level keys survive byte-for-byte when writing a different the-loop family', () => {
  // Deliberately quirky formatting so a re-stringify would not reproduce it.
  const unrelated = `"someOtherTool": { "unrelated": true }`;
  const text = `{
  ${unrelated},
  "the-loop": {
    "modelBindings": { "build": { "model": "opus" } }
  }
}
`;
  const out = writeSettingsEntry(text, 'testHarness', { commands: { test: 'npm test' } });
  assert.ok(out.includes(unrelated), 'unrelated top-level key substring must be untouched');
  const parsed = JSON.parse(out);
  assert.deepEqual(parsed['the-loop'].testHarness, { commands: { test: 'npm test' } });
  assert.deepEqual(parsed['the-loop'].modelBindings, { build: { model: 'opus' } });
  // Sibling family entry text is also untouched (same original substring).
  assert.ok(out.includes(`"modelBindings": { "build": { "model": "opus" } }`));
});

test('deeply nested unrelated structure elsewhere in the document survives as an exact substring', () => {
  const nested = `"deep": {
    "arr": [1, { "k": "v", "n": [true, false, null] }],
    "obj": { "x": { "y": "z" } }
  }`;
  const text = `{
  ${nested},
  "the-loop": {
    "interview": { "skill": "grilling" }
  }
}
`;
  const out = writeSettingsEntry(text, 'lint', { commands: ['npm run check'] });
  assert.ok(out.includes(nested), 'nested unrelated structure must be byte-identical');
  assert.deepEqual(JSON.parse(out)['the-loop'].lint, { commands: ['npm run check'] });
  assert.deepEqual(JSON.parse(out)['the-loop'].interview, { skill: 'grilling' });
});

test('pre-existing the-loop sibling families survive verbatim; overwrite replaces only the targeted family value', () => {
  const modelBindings = `"modelBindings": {
      "build": { "model": "opus" },
      "drive": { "model": "sonnet" }
    }`;
  const interview = `"interview": { "skill": "grilling" }`;
  const text = `{
  "the-loop": {
    ${modelBindings},
    ${interview}
  }
}
`;
  // Write a third family — both siblings' exact text must remain.
  const withThird = writeSettingsEntry(text, 'testHarness', { framework: 'node:test' });
  assert.ok(withThird.includes(modelBindings));
  assert.ok(withThird.includes(interview));
  assert.deepEqual(JSON.parse(withThird)['the-loop'].testHarness, { framework: 'node:test' });

  // Overwrite interview — modelBindings substring survives; old interview value is gone.
  const overwritten = writeSettingsEntry(text, 'interview', { skill: 'custom' });
  assert.ok(overwritten.includes(modelBindings));
  assert.equal(overwritten.includes(`"skill": "grilling"`), false);
  assert.deepEqual(JSON.parse(overwritten)['the-loop'].interview, { skill: 'custom' });
  assert.deepEqual(JSON.parse(overwritten)['the-loop'].modelBindings, {
    build: { model: 'opus' },
    drive: { model: 'sonnet' },
  });
});

test('unparseable settings text throws an Error naming the JSON parse problem', () => {
  assert.throws(
    () => writeSettingsEntry('{ not valid json', 'testHarness', {}),
    (err) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /unparseable/i);
      assert.match(err.message, /JSON|json|parse/i);
      return true;
    },
  );
});

test('missing the-loop key, or missing family under the-loop, inserts cleanly and preserves pre-existing content', () => {
  // File present, no the-loop yet.
  const noLoop = `{
  "permissions": {
    "allow": ["Bash"]
  }
}
`;
  const permissions = `"permissions": {
    "allow": ["Bash"]
  }`;
  const addedLoop = writeSettingsEntry(noLoop, 'lint', { commands: ['npm run lint'] });
  assert.ok(addedLoop.includes(permissions), 'pre-existing top-level content must survive');
  assert.deepEqual(JSON.parse(addedLoop)['the-loop'].lint, { commands: ['npm run lint'] });

  // the-loop present, family absent.
  const loopNoFamily = `{
  "the-loop": {
    "modelBindings": { "build": { "model": "haiku" } }
  }
}
`;
  const sibling = `"modelBindings": { "build": { "model": "haiku" } }`;
  const addedFamily = writeSettingsEntry(loopNoFamily, 'precommit', { system: 'none' });
  assert.ok(addedFamily.includes(sibling), 'existing the-loop sibling must survive');
  assert.deepEqual(JSON.parse(addedFamily)['the-loop'].precommit, { system: 'none' });
  assert.deepEqual(JSON.parse(addedFamily)['the-loop'].modelBindings, { build: { model: 'haiku' } });
});

test('the-loop present but not a plain object is a malformed-input error', () => {
  assert.throws(
    () => writeSettingsEntry('{ "the-loop": "nope" }', 'testHarness', {}),
    /the-loop/,
  );
  assert.throws(
    () => writeSettingsEntry('{ "the-loop": [] }', 'testHarness', {}),
    /the-loop/,
  );
});
