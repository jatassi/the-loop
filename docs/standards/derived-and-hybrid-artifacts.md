# Derived and hybrid artifacts

**Derived projections re-render with their source, in the same commit.** The
Ledger is a projection of the feature graph: a diff that moves a feature's
status must re-render the Ledger too — the two must never disagree, even for
one commit.

**Machine edits to hybrid documents go through the retained document, never the
text.** A hybrid artifact (design.md, a plan) is narrative plus machine-parsed
YAML blocks. To change a block: parse the file, mutate the retained YAML
document (`doc.setIn(...)`), and re-render. Never string-edit inside a block.

The test is byte-identity: `render(text, parse(text)) === text`, and after any
machine edit, every byte outside the touched block is unchanged. `spine check`
and `spine plan check` enforce this — a round-trip failure means the edit went
through the wrong layer.

```js
// right: the retained document carries the edit
const plan = parsePlan(text);
plan._blocks.tasks.doc.setIn(['tasks', idx, 'status'], 'built');
writeFileSync(file, render(text, plan));

// wrong: string surgery inside a machine-parsed block
writeFileSync(file, text.replace('status: pending', 'status: built'));
```
