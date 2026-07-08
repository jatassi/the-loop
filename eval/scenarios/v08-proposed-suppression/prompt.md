feature: proposed-status — `proposed` backlog stage — feature status enum expansion
target: HEAD~1 · integration result: HEAD (already assembled — judge only)
diff under review: git diff HEAD~1..HEAD

acceptance criteria to judge:
1. a graph containing a feature with status `proposed` and no acceptance list passes `the-loop check` OK, while a `designed` feature missing acceptance still fails with missing-acceptance
2. given a scope naming a proposed feature, prepare-execution-context exits 1 with a gate error naming the feature and stating it must be designed first, printing nothing to stdout
3. a designed feature depending on a proposed one is excluded from the eligible set, and the machine orientation proposes kind `design` naming the blocking proposed id
4. on a graph whose only unshipped features are proposed, the machine orientation proposes kind `design` naming them (never `new-intake`), and the human status summary counts the proposed stage
5. the /the-loop route table maps a `design` proposal to the design skill, and every living surface stating the status enum lists the four values — the three-value statement greps to zero outside historical records

feature design doc (in tree): docs/designs/proposed-status/design.md
