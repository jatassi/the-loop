# Design vocabulary & principles

The language for shaping modules and contracts. Use these terms exactly —
consistent language is the point; don't substitute "component," "service,"
"API," or "boundary."

## Vocabulary

- **Module** — anything with an interface and an implementation. Deliberately
  scale-agnostic: a function, a class, a package, a tier-spanning slice.
- **Interface** — everything a caller must know to use the module correctly:
  the signature, but also invariants, ordering constraints, error modes,
  required configuration, performance character.
- **Depth** — leverage at the interface: how much behaviour a caller (or test)
  exercises per unit of interface learned. Deep = small interface, lots behind
  it; shallow = interface nearly as complex as the implementation.
- **Seam** — the place where an interface lives; where behaviour can change
  without editing in place. Where the seam goes is its own design decision,
  distinct from what sits behind it.
- **Adapter** — a concrete thing satisfying an interface at a seam. A role,
  not a substance.
- **Leverage** / **Locality** — what depth buys: callers get more capability
  per unit of interface learned; maintainers get change, bugs, and knowledge
  concentrated in one place instead of smeared across call sites.

## Principles

- **Depth is a property of the interface, not the implementation.** A deep
  module may be internally composed of small, swappable parts — they just
  aren't the caller's problem.
- **The deletion test.** Imagine deleting the module. If complexity vanishes,
  it was a pass-through. If complexity reappears across N callers, it was
  earning its keep.
- **The interface is the test surface.** Callers and tests cross the same seam;
  wanting to test *past* the interface means the module is the wrong shape.
- **One adapter is a hypothetical seam; two are a real one.** Don't introduce a
  seam until something actually varies across it.
- **Accept dependencies, don't create them; return results, don't produce side
  effects.** Both make the interface the natural test surface.
- **Design it twice when the interface is load-bearing.** Sketch a second,
  structurally different interface before committing; the first idea's job is
  to be beaten.
