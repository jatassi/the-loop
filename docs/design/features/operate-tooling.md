# operate-tooling — on-demand ops/debug tooling

**Status:** designed.

Operate is **on-demand, never scheduled**: the human invokes ops/debug tooling
reactively; an observability solution (bound per project at Design) apprises the
human that something is wrong; a resulting fix files an Evolve intake. The loop
never acts on prod unattended — consistent with ADR-0034's operating model and
Ship's one-synchronous-gate posture.

## Acceptance

- The human invokes ops/debug tooling reactively; a resulting fix files an Evolve
  intake; never acts on prod unattended.
