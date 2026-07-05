# configure-step-full — /loop-config

**Status:** designed.

The full configure step: bindings (test harness, probe, ship recipe, model
overrides, notification) set via recommended-answer grilling and persisted to
harness-native layers — user/global scope and project scope (`.claude/settings.json`
under the `"the-loop"` key; the model-binding layering already dogfoods this
pattern). v2's minimal onboarding (Configure → Frame → Design) covers the cold-start
subset today.

## Acceptance

- Bindings are set via recommended-answer grilling and persisted to harness-native
  layers.
