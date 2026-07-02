# Pure core, thin CLI

**`src/` modules are pure over in-memory models.** They take parsed models and
values, return results, and never touch the filesystem, the process, or the
clock. The one sanctioned exception is a loader whose whole job is the file
edge (`resolve()`'s design-text read).

**Effects live in `bin/`.** File reads/writes, `process.exit`, stdout — the CLI
layer owns them. When validation needs a fact only the filesystem knows, inject
a probe instead of importing `fs`:

```js
// right: purity kept, fs injected at the edge
export function validatePlan(plan, design, { standardExists } = {}) { … }
// bin/spine.js
validatePlan(model, design, { standardExists: (p) => existsSync(p) });

// wrong: fs inside the core
import { existsSync } from 'node:fs';
export function validatePlan(plan, design) { … existsSync(p) … }
```

This is what keeps the core testable without fixtures on disk and reusable by
consumers that hold documents in memory.
