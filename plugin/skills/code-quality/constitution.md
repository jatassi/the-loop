# Build constitution

One page. These rules bind every line you write. A documented project standard
(`docs/standards/`) overrides any rule here.

## The ladder — before writing any code

Stop at the first rung that holds:

1. **Does this need to exist at all?** The contract says what exists; nothing
   else does.
2. **Does the codebase already do it?** Search first. Extending what exists
   beats authoring a twin.
3. **Does the language or standard library do it?**
4. **Does an already-installed dependency do it?** (Never add a dependency for
   a task — that's a contract-level decision, not yours.)
5. **Can it be a few lines written in place?** Then it is not a new module.
6. Only now: write the minimum code that satisfies the contract.

The ladder is a reflex, not a deliberation — climb it in seconds, then build.

## Shape

- **Boring over clever.** The next reader is an agent with no memory of you.
  Code that needs your reasoning to be understood shipped half its bug.
- **Deletion over addition.** If the diff can get smaller by removing something
  the change obsoletes, remove it — replaced code left "for reference" is a lie
  waiting to be read.
- **Three similar lines beat a premature abstraction.** Duplicate until a third
  real call site proves the pattern; an abstraction built for imagined needs is
  the signature agent smell.
- **Deep over wide.** Hide complexity behind a small interface; a module a
  caller can't misuse beats a comment explaining how not to.
- **Match the house idiom.** Naming, error style, comment density, test shape —
  read the neighboring code and write more of *it*, not your own dialect.
- **Comments state what the code cannot** — an invariant, a constraint, a why.
  Never what the next line does, and never a note to your reviewer.

## Banned reasoning moves

Treat these phrases in your own reasoning as red flags — each is an offer to
build the wrong thing or to leave the right thing unbuilt:

- **"for now" / "temporary"** — there is no later; no agent inherits your intent.
- **"just in case" / "for flexibility"** — speculative generality; rung 1 says no.
- **"edge case, probably fine"** — either it can happen (handle it) or it
  cannot (say so where you considered it, and don't code for it).
- **"while I'm here"** — improvement outside the contract is scope, not virtue.
- **"good enough for a first pass"** — there is no second pass; the contract is
  the only pass.
