// Surgical write of one "the-loop".<family> entry into a settings-file text.
// Whole-entry replacement for that family; every other byte of the file survives
// verbatim (unrelated top-level keys, nested structure, sibling families, formatting).
// Pure — no filesystem; the hooks-set CLI does I/O. Pattern mirrors replace-fenced-block's
// span splice, but for JSON object members.

const LOOP_KEY = 'the-loop';

/**
 * Set `"the-loop".<family>` on a settings document by whole-entry replacement.
 * @param {string|null} text  existing settings-file text, or null when the file is missing
 * @param {string} family     top-level key under `"the-loop"`, e.g. `"testHarness"`
 * @param {*} value           any JSON-serializable value (replaces the family's entire entry)
 * @returns {string}          the new settings-file text
 */
export function writeSettingsEntry(text, family, value) {
  if (text === null) {
    return `${JSON.stringify({ [LOOP_KEY]: { [family]: value } }, null, 2)}\n`;
  }
  const parsed = parseSettingsText(text);
  assertPlainObjectRoot(parsed);
  assertTheLoopShape(parsed);
  const root = listObjectMembers(text, objectStartAt(text, 0));
  const indentUnit = inferIndentUnit(text, root.members);
  const loopMember = root.members.find((m) => m.key === LOOP_KEY);
  if (!loopMember) {
    return insertMember({ text, obj: root, key: LOOP_KEY, value: { [family]: value }, indentUnit, parentKeyIndent: '' });
  }
  const loopObj = listObjectMembers(text, loopMember.valueStart);
  const familyMember = loopObj.members.find((m) => m.key === family);
  if (familyMember) {
    return replaceMemberValue({ text, member: familyMember, value, indentUnit });
  }
  return insertMember({
    text,
    obj: loopObj,
    key: family,
    value,
    indentUnit,
    parentKeyIndent: lineIndentAt(text, loopMember.keyStart),
  });
}

function parseSettingsText(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`unparseable JSON in settings text: ${error.message}`, { cause: error });
  }
}

function assertPlainObjectRoot(parsed) {
  if (!isPlainObject(parsed)) {
    throw new Error(`settings text must be a JSON object (got ${describeType(parsed)})`);
  }
}

function assertTheLoopShape(parsed) {
  if (!Object.hasOwn(parsed, LOOP_KEY)) {
    return;
  }
  if (!isPlainObject(parsed[LOOP_KEY])) {
    throw new Error(
      `"${LOOP_KEY}" must be a plain object (got ${describeType(parsed[LOOP_KEY])})`,
    );
  }
}

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function describeType(v) {
  if (v === null) {
    return 'null';
  }
  if (Array.isArray(v)) {
    return 'array';
  }
  return typeof v;
}

/** Skip whitespace; return the new index. */
function skipWs(text, i) {
  while (i < text.length && /\s/.test(text[i])) {
    i += 1;
  }
  return i;
}

/** Index of the opening `{` of the JSON object starting at or after `from`. */
function objectStartAt(text, from) {
  const i = skipWs(text, from);
  if (text[i] !== '{') {
    throw new Error(`expected '{' at index ${i} in settings text`);
  }
  return i;
}

/**
 * Scan a JSON string literal starting at the opening quote.
 * @returns {number} index just past the closing quote
 */
function scanString(text, i) {
  i += 1;
  while (i < text.length) {
    const c = text[i];
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === '"') {
      return i + 1;
    }
    i += 1;
  }
  throw new Error('unterminated string in settings text');
}

/**
 * Scan a JSON value starting at `i` (already at the value's first non-ws char).
 * @returns {number} index just past the value
 */
function scanValue(text, i) {
  const c = text[i];
  if (c === '"') {
    return scanString(text, i);
  }
  if (c === '{' || c === '[') {
    return scanContainer(text, i);
  }
  if ('tfn'.includes(c)) {
    return scanLiteral(text, i);
  }
  if (c === '-' || isDigit(c)) {
    return scanNumber(text, i);
  }
  throw new Error(`unexpected character ${JSON.stringify(c)} in settings text at index ${i}`);
}

function isDigit(c) {
  return c >= '0' && c <= '9';
}

function scanLiteral(text, i) {
  if (text.startsWith('true', i)) {
    return i + 4;
  }
  if (text.startsWith('false', i)) {
    return i + 5;
  }
  if (text.startsWith('null', i)) {
    return i + 4;
  }
  throw new Error(`invalid literal in settings text at index ${i}`);
}

function scanNumber(text, i) {
  let j = i;
  if (text[j] === '-') {
    j += 1;
  }
  while (j < text.length && '0123456789.eE+-'.includes(text[j])) {
    j += 1;
  }
  return j;
}

/**
 * Scan `{...}` or `[...]` from the opening delimiter, respecting nesting and strings.
 * @returns {number} index just past the matching closer
 */
function scanContainer(text, i) {
  const stack = [text[i]];
  let j = i + 1;
  while (j < text.length && stack.length > 0) {
    const c = text[j];
    if (c === '"') {
      j = scanString(text, j);
      continue;
    }
    if (c === '{' || c === '[') {
      stack.push(c);
      j += 1;
      continue;
    }
    if (c === '}' || c === ']') {
      stack.pop();
      j += 1;
      continue;
    }
    j += 1;
  }
  if (stack.length > 0) {
    throw new Error('unclosed container in settings text');
  }
  return j;
}

/**
 * List top-level members of the object whose `{` is at `openBrace`.
 * @returns {{ openBrace: number, closeBrace: number, members: Array<{key: string, keyStart: number, keyEnd: number, valueStart: number, valueEnd: number, memberEnd: number}> }}
 */
function listObjectMembers(text, openBrace) {
  if (text[openBrace] !== '{') {
    throw new Error(`expected object at index ${openBrace}`);
  }
  const members = [];
  let i = skipWs(text, openBrace + 1);
  if (text[i] === '}') {
    return { openBrace, closeBrace: i, members };
  }
  while (i < text.length) {
    const member = readNextMember(text, i);
    members.push(member);
    i = skipWs(text, member.memberEnd);
    if (text[i] === ',') {
      i += 1;
      continue;
    }
    if (text[i] === '}') {
      return { openBrace, closeBrace: i, members };
    }
    throw new Error(`expected ',' or '}' at index ${i}`);
  }
  throw new Error('unterminated object in settings text');
}

function readNextMember(text, from) {
  let i = skipWs(text, from);
  if (text[i] !== '"') {
    throw new Error(`expected object key string at index ${i}`);
  }
  const keyStart = i;
  const keyEnd = scanString(text, i);
  const key = JSON.parse(text.slice(keyStart, keyEnd));
  i = skipWs(text, keyEnd);
  if (text[i] !== ':') {
    throw new Error(`expected ':' after key at index ${i}`);
  }
  i = skipWs(text, i + 1);
  const valueStart = i;
  const valueEnd = scanValue(text, i);
  return { key, keyStart, keyEnd, valueStart, valueEnd, memberEnd: valueEnd };
}

/** Whitespace indent (spaces/tabs) of the line containing `pos`. */
function lineIndentAt(text, pos) {
  const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
  let i = lineStart;
  while (i < pos && (text[i] === ' ' || text[i] === '\t')) {
    i += 1;
  }
  return text.slice(lineStart, i);
}

/**
 * Indent unit for pretty-printing new values: take the first root member's line
 * indent when present; default to two spaces.
 */
function inferIndentUnit(text, rootMembers) {
  if (rootMembers.length === 0) {
    return '  ';
  }
  const ind = lineIndentAt(text, rootMembers[0].keyStart);
  if (ind.length === 0) {
    return '  ';
  }
  if (ind.includes('\t')) {
    return '\t';
  }
  return ind;
}

function stringifyIndentArg(indentUnit) {
  if (indentUnit.includes('\t')) {
    return '\t';
  }
  return indentUnit.length;
}

/**
 * Pretty-print `value` so the first line sits after `: ` and continuation lines
 * share `continuationIndent` (the key's line indent).
 */
function formatValue(value, indentUnit, continuationIndent) {
  const raw = JSON.stringify(value, null, stringifyIndentArg(indentUnit));
  if (!raw.includes('\n')) {
    return raw;
  }
  const lines = raw.split('\n');
  const rest = lines.slice(1).map((line) => `${continuationIndent}${line}`);
  return `${lines[0]}\n${rest.join('\n')}`;
}

/** Replace only the value span of an existing member. */
function replaceMemberValue({ text, member, value, indentUnit }) {
  const keyIndent = lineIndentAt(text, member.keyStart);
  const formatted = formatValue(value, indentUnit, keyIndent);
  return `${text.slice(0, member.valueStart)}${formatted}${text.slice(member.valueEnd)}`;
}

/**
 * Insert a new member into an object span. `parentKeyIndent` is the indent of the
 * enclosing key (empty string for the root object).
 */
function insertMember({ text, obj, key, value, indentUnit, parentKeyIndent }) {
  const keyIndent = memberKeyIndent({ text, obj, parentKeyIndent, indentUnit });
  const memberLine = `${keyIndent}${JSON.stringify(key)}: ${formatValue(value, indentUnit, keyIndent)}`;
  if (obj.members.length === 0) {
    return `${text.slice(0, obj.openBrace + 1)}\n${memberLine}\n${parentKeyIndent}${text.slice(obj.closeBrace)}`;
  }
  const last = obj.members.at(-1);
  return `${text.slice(0, last.memberEnd)},\n${memberLine}${text.slice(last.memberEnd)}`;
}

function memberKeyIndent({ text, obj, parentKeyIndent, indentUnit }) {
  if (obj.members.length > 0) {
    return lineIndentAt(text, obj.members[0].keyStart);
  }
  return `${parentKeyIndent}${indentUnit}`;
}
