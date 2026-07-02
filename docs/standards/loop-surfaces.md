# Loop surfaces are self-contained

`commands/`, `skills/`, and `agents/` files are **surfaces**: text injected
into a fresh agent that has no session context, no memory of this repo's
history, and no ability to follow internal references.

- **No ADR or internal-doc references.** A surface states its rules directly;
  the *why* lives in the ADRs, cited from `docs/`, never from a surface. If a
  rule can't stand without its citation, rewrite the rule.
- **Assume nothing about the session.** The surface must work for an agent that
  has seen only it plus its explicit inputs (a task slice, a file path).
- **Agents that return data say so structurally.** A JSON-returning agent's
  final message IS its return value — machine-readable only, shapes spelled out
  in the surface, no prose around them.
- Surfaces are written to the skill-authoring bar: front-loaded descriptions,
  reference material disclosed to sibling files, every line passing the no-op
  test (does it change behaviour versus the default?).
