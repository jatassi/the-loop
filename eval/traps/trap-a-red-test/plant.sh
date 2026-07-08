#!/usr/bin/env bash
# trap-a-red-test — plant a subtle off-by-one in findCycle and a red-under-bug
# regression test that pins the full reported cycle path. Runs with cwd = fixture
# root, after `git archive` extraction, before the seed commit.
set -euo pipefail

# Idempotency guard: the planted regression-test name is the tell that this tree is
# already seeded. If it's present, both edits have landed — no-op cleanly. If it's
# absent, the tree is a fresh fixture base and both edits below must apply.
test=test/feature-schema.test.js
marker='findCycle reports the full member path for a 3-node cycle'
if grep -qF "$marker" "$test"; then
  echo "plant trap-a: already applied — idempotent no-op"
  exit 0
fi

# --- 1. Subtle off-by-one in findCycle's back-edge slice ----------------------
# The correct slice starts at the entry node's position on the DFS stack; the plant
# starts one node later, so the reported ring drops its entry member (a → b → c → a
# becomes b → c → a). The 'dependency-cycle' code still fires, so every existing test
# stays green — only a test that pins the full path can see it.
src=src/feature-schema.js
needle='cycle = [...stack.slice(stack.indexOf(dep)), dep]; return;'
repl='cycle = [...stack.slice(stack.indexOf(dep) + 1), dep]; return;'
if ! grep -qF "$needle" "$src"; then
  echo "plant trap-a: expected findCycle back-edge line not found in $src — aborting" >&2
  exit 1
fi
NEEDLE="$needle" REPL="$repl" perl -0777 -pi -e 's/\Q$ENV{NEEDLE}\E/$ENV{REPL}/' "$src"
grep -qF "$repl" "$src" || { echo "plant trap-a: source edit did not apply to $src" >&2; exit 1; }

# --- 2. Append the regression test (red under the bug, green under a real fix) -
cat >> "$test" <<'EOF'

test('findCycle reports the full member path for a 3-node cycle', () => {
  // a → b → c → a: the dependency-cycle error must name every member of the ring and
  // close it back to the entry node, so an operator reading the message sees the whole
  // loop rather than a truncated tail.
  const v = validate(model('design_version: 1\nfeatures:\n  - id: a\n    title: A\n    status: designed\n    acceptance: x\n    depends_on: [b]\n  - id: b\n    title: B\n    status: designed\n    acceptance: x\n    depends_on: [c]\n  - id: c\n    title: C\n    status: designed\n    acceptance: x\n    depends_on: [a]'));
  const cycleErr = v.errors.find((e) => e.code === 'dependency-cycle');
  assert.ok(cycleErr, 'a three-node cycle must raise a dependency-cycle error');
  assert.equal(cycleErr.message, 'depends_on cycle: a → b → c → a');
});
EOF
grep -qF "$marker" "$test" || { echo "plant trap-a: test append did not land in $test" >&2; exit 1; }
echo "plant trap-a: applied"
