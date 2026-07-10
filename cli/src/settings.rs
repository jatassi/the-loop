//! Settings-layer reader and four-layer merge resolver.
//!
//! Ports the observable behavior of `plugin/src/resolve-model-bindings.js` and the
//! settings-layer I/O helpers in `plugin/bin/cli-commands.js` (`readSettingsLayer`,
//! `userSettingsPath`, `familyLayer`). Pure merge core plus file reads only — no
//! process exit, no clap wiring.

use std::collections::BTreeMap;
use std::env;
use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

use serde_json::{Map, Value, json};

/// Effort enum a binding's `effort` field may take (absent inherits session effort).
pub const EFFORTS: &[&str] = &["low", "medium", "high", "xhigh", "max"];

/// Named configuration gap: a role binds both `agent` and `executor` (mutually exclusive).
pub const GAP_AGENT_AND_EXECUTOR: &str = "agent-and-executor";

/// Inventory family keys in declaration order (matches the JS object insertion order).
pub const HOOK_FAMILY_ORDER: &[&str] = &[
    "interview",
    "modelBindings",
    "testHarness",
    "lint",
    "precommit",
    "notification",
    "artifactStores",
    "exampleBlock",
];

/// A family's unbound behavior: fallback value or block.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HookDeclaration {
    /// Value returned when unbound in every layer (object or string marker).
    Fallback(Value),
    /// When unbound, the consuming phase can't run; resolver returns a named-gap shape.
    Block,
}

/// Settings-layer hook inventory: each family key under `"the-loop"` in settings,
/// plus synthetic `exampleBlock` for the block-declaration path.
pub static HOOK_INVENTORY: LazyLock<BTreeMap<&'static str, HookDeclaration>> =
    LazyLock::new(|| {
        let mut m = BTreeMap::new();
        m.insert(
            "interview",
            HookDeclaration::Fallback(json!({ "skill": "grilling" })),
        );
        m.insert(
            "modelBindings",
            HookDeclaration::Fallback(json!({ "model": "session" })),
        );
        m.insert(
            "testHarness",
            HookDeclaration::Fallback(Value::String("detected-convention".into())),
        );
        m.insert(
            "lint",
            HookDeclaration::Fallback(Value::String("detected-convention".into())),
        );
        m.insert(
            "precommit",
            HookDeclaration::Fallback(json!({ "system": "none" })),
        );
        m.insert(
            "notification",
            HookDeclaration::Fallback(json!({ "channel": "chat" })),
        );
        m.insert(
            "artifactStores",
            HookDeclaration::Fallback(json!({
                "briefs": "local",
                "designs": "local",
                "features": "local",
                "runbooks": "local",
                "rcas": "local",
                "calibration": "local",
            })),
        );
        m.insert("exampleBlock", HookDeclaration::Block);
        m
    });

/// Four settings layers in merge order: defaults < user < project < local.
#[derive(Debug, Clone, Default)]
pub struct LayerSources {
    pub defaults: Option<Value>,
    pub user: Option<Value>,
    pub project: Option<Value>,
    pub local: Option<Value>,
}

/// Error from settings reads or merge validation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SettingsError {
    message: String,
}

impl SettingsError {
    #[must_use]
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }

    #[must_use]
    pub fn message(&self) -> &str {
        &self.message
    }
}

impl fmt::Display for SettingsError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for SettingsError {}

/// `~/.claude/settings.json` via `$HOME` (not the OS real-home lookup), so tests
/// and the oracle can override with `HOME`.
#[must_use]
pub fn user_settings_path() -> PathBuf {
    let home = env::var_os("HOME").unwrap_or_default();
    PathBuf::from(home).join(".claude").join("settings.json")
}

/// Project layer path, relative to the current working directory.
#[must_use]
pub fn project_settings_path() -> PathBuf {
    PathBuf::from(".claude").join("settings.json")
}

/// Local layer path, relative to the current working directory.
#[must_use]
pub fn local_settings_path() -> PathBuf {
    PathBuf::from(".claude").join("settings.local.json")
}

/// Read one settings-layer family value from a JSON file.
///
/// A missing file, or a present file missing the `"the-loop".[family]` key, is an
/// empty layer — never an error. Unparseable JSON in a present file is an error
/// naming the file.
///
/// # Errors
///
/// Returns [`SettingsError`] when the file exists but is not valid JSON, or cannot
/// be read.
pub fn read_settings_layer(file: impl AsRef<Path>, family: &str) -> Result<Value, SettingsError> {
    let file = file.as_ref();
    if !file.exists() {
        return Ok(empty_object());
    }
    let text = fs::read_to_string(file).map_err(|error| {
        SettingsError::new(format!(
            "could not read settings file {}: {error}",
            file.display()
        ))
    })?;
    let settings: Value = serde_json::from_str(&text).map_err(|error| {
        SettingsError::new(format!("unparseable JSON in {}: {error}", file.display()))
    })?;
    Ok(layer_value_from_settings(&settings, family))
}

/// Apply the empty-object-is-unbound rule for single-entry families.
///
/// `read_settings_layer` returns `{}` for a missing key (right for modelBindings
/// role maps). Single-entry families must leave the layer unset when unbound so
/// merge-single-entry does not treat an empty object as a wholesale win over lower
/// layers / fallbacks.
#[must_use]
pub fn family_layer(family: &str, value: Value) -> Option<Value> {
    if family == "modelBindings" {
        return Some(value);
    }
    if is_empty_object(&value) {
        return None;
    }
    Some(value)
}

/// Merge role-binding layers into a resolved table with provenance stamps.
///
/// Order is defaults < user < project < local, whole-entry replacement per role
/// (a role bound in a higher layer replaces the entire entry, no field-level merge).
///
/// # Errors
///
/// Returns [`SettingsError`] on a malformed entry — non-object, missing or
/// non-string `model`, out-of-enum `effort`, non-string `agent` — naming the role
/// and the layer it came from.
pub fn resolve_models(layers: &LayerSources) -> Result<Value, SettingsError> {
    merge_keyed_layers(layers)
}

/// Look up a role's bound entry, or the session fallback
/// (`{ model: "session", provenance: "fallback" }`) when the role isn't bound.
#[must_use]
pub fn binding_for(table: &Value, role: &str) -> Value {
    table
        .get(role)
        .cloned()
        .unwrap_or_else(|| json!({ "model": "session", "provenance": "fallback" }))
}

/// Resolve one hook family across the four settings layers (defaults < user <
/// project < local), whole-entry replacement per key within a layer.
///
/// - `modelBindings`: each layer value is a role→binding map; delegates to
///   [`resolve_models`].
/// - Every other inventory family: each layer value is the family's single entry
///   object. An empty `{}` layer is unbound (omitted), never a wholesale win.
///
/// When unbound in every layer, consults [`HOOK_INVENTORY`]:
/// - fallback-declared → fallback content plus `provenance: "fallback"`
/// - block-declared → `{ blocked: true, family, gap }`
///
/// # Errors
///
/// Returns [`SettingsError`] for an unknown family, a non-object single-entry
/// layer value, or (for `modelBindings`) a malformed role entry.
pub fn resolve_family(family: &str, layers: &LayerSources) -> Result<Value, SettingsError> {
    let declaration = HOOK_INVENTORY
        .get(family)
        .ok_or_else(|| SettingsError::new(format!("unknown hook family \"{family}\"")))?;

    if family == "modelBindings" {
        return resolve_models(layers);
    }

    if let Some(entry) = merge_single_entry(family, layers)? {
        return Ok(entry);
    }

    match declaration {
        HookDeclaration::Fallback(fallback) => Ok(fallback_result(fallback)),
        HookDeclaration::Block => Ok(json!({
            "blocked": true,
            "family": family,
            "gap": format!("{family} is not configured"),
        })),
    }
}

// --- internals ---------------------------------------------------------------

const LAYERS: &[(&str, &str)] = &[
    ("defaults", "default"),
    ("user", "user"),
    ("project", "project"),
    ("local", "local"),
];

fn empty_object() -> Value {
    Value::Object(Map::new())
}

fn is_empty_object(value: &Value) -> bool {
    matches!(value, Value::Object(map) if map.is_empty())
}

fn layer_value_from_settings(settings: &Value, family: &str) -> Value {
    match settings
        .get("the-loop")
        .and_then(|the_loop| the_loop.get(family))
    {
        None | Some(Value::Null) => empty_object(),
        Some(value) => value.clone(),
    }
}

fn layer_source<'a>(sources: &'a LayerSources, key: &str) -> Option<&'a Value> {
    match key {
        "defaults" => sources.defaults.as_ref(),
        "user" => sources.user.as_ref(),
        "project" => sources.project.as_ref(),
        "local" => sources.local.as_ref(),
        _ => None,
    }
}

/// Whole-entry replacement for a single-entry family: the highest layer that
/// defines the family wins entirely. Empty `{}` is unbound (omitted). Returns
/// `None` when unbound in every layer.
fn merge_single_entry(
    family: &str,
    sources: &LayerSources,
) -> Result<Option<Value>, SettingsError> {
    let mut resolved: Option<Value> = None;
    for &(key, provenance) in LAYERS {
        let Some(layer) = layer_source(sources, key) else {
            continue;
        };
        // familyLayer empty-object-is-unbound rule for non-modelBindings families.
        if is_empty_object(layer) {
            continue;
        }
        if !layer.is_object() {
            return Err(SettingsError::new(format!(
                "family \"{family}\" in the {provenance} layer must be an object entry (got {layer})"
            )));
        }
        let mut entry = layer.as_object().expect("is_object checked").clone();
        entry.insert("provenance".into(), Value::String(provenance.into()));
        resolved = Some(Value::Object(entry));
    }
    Ok(resolved)
}

fn merge_keyed_layers(sources: &LayerSources) -> Result<Value, SettingsError> {
    let mut table = Map::new();
    for &(key, provenance) in LAYERS {
        let layer = layer_source(sources, key)
            .cloned()
            .unwrap_or_else(empty_object);
        let Some(map) = layer.as_object() else {
            // A non-object layer is treated as empty for role maps (JS uses ?? {}).
            // Only per-entry values are validated.
            continue;
        };
        for (entry_key, entry) in map {
            validate_entry(entry, entry_key, provenance)?;
            table.insert(entry_key.clone(), resolve_entry(entry, provenance));
        }
    }
    Ok(Value::Object(table))
}

fn resolve_entry(entry: &Value, provenance: &str) -> Value {
    let mut resolved = entry.as_object().expect("validated object").clone();
    resolved.insert("provenance".into(), Value::String(provenance.into()));
    let has_agent = resolved.contains_key("agent");
    let has_executor = resolved.contains_key("executor");
    if has_agent && has_executor {
        resolved.insert("gap".into(), Value::String(GAP_AGENT_AND_EXECUTOR.into()));
    }
    Value::Object(resolved)
}

fn validate_entry(entry: &Value, role: &str, layer: &str) -> Result<(), SettingsError> {
    if !entry.is_object() {
        return Err(SettingsError::new(format!(
            "role \"{role}\" in the {layer} layer must be an object binding (got {entry})"
        )));
    }
    let obj = entry.as_object().expect("is_object checked");
    match obj.get("model") {
        Some(Value::String(_)) => {}
        other => {
            let got = other.map_or_else(|| "null".to_string(), ToString::to_string);
            return Err(SettingsError::new(format!(
                "role \"{role}\" in the {layer} layer is missing a string \"model\" (got {got})"
            )));
        }
    }
    if let Some(effort) = obj.get("effort") {
        let effort_str = effort.as_str();
        if effort_str.is_none_or(|s| !EFFORTS.contains(&s)) {
            return Err(SettingsError::new(format!(
                "role \"{role}\" in the {layer} layer has an out-of-enum effort (got {effort}); must be one of {}",
                EFFORTS.join("|")
            )));
        }
    }
    if let Some(agent) = obj.get("agent")
        && !agent.is_string()
    {
        return Err(SettingsError::new(format!(
            "role \"{role}\" in the {layer} layer has a non-string \"agent\" (got {agent})"
        )));
    }
    Ok(())
}

fn fallback_result(fallback: &Value) -> Value {
    if let Some(obj) = fallback.as_object() {
        let mut out = obj.clone();
        out.insert("provenance".into(), Value::String("fallback".into()));
        return Value::Object(out);
    }
    json!({ "value": fallback, "provenance": "fallback" })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static TEMP_SEQ: AtomicU64 = AtomicU64::new(0);

    fn unique_temp_dir() -> PathBuf {
        let n = TEMP_SEQ.fetch_add(1, Ordering::Relaxed);
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |d| d.as_nanos());
        let dir = env::temp_dir().join(format!(
            "the-loop-settings-{}-{}-{}",
            std::process::id(),
            nanos,
            n
        ));
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    fn write_temp(dir: &Path, name: &str, content: &str) -> PathBuf {
        let path = dir.join(name);
        fs::write(&path, content).expect("write temp file");
        path
    }

    // --- read_settings_layer -------------------------------------------------

    #[test]
    fn missing_settings_file_is_empty_layer() {
        let dir = unique_temp_dir();
        let path = dir.join("does-not-exist.json");
        let layer = read_settings_layer(&path, "modelBindings").expect("missing is ok");
        assert_eq!(layer, empty_object());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn present_file_missing_family_key_is_empty_layer() {
        let dir = unique_temp_dir();
        let path = write_temp(
            &dir,
            "settings.json",
            r#"{"the-loop":{"interview":{"skill":"grilling"}}}"#,
        );
        let layer = read_settings_layer(&path, "modelBindings").expect("missing key is ok");
        assert_eq!(layer, empty_object());

        let no_the_loop = write_temp(&dir, "other.json", r#"{"unrelated":true}"#);
        let layer2 = read_settings_layer(&no_the_loop, "modelBindings").expect("ok");
        assert_eq!(layer2, empty_object());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn present_file_with_family_returns_that_value() {
        let dir = unique_temp_dir();
        let path = write_temp(
            &dir,
            "settings.json",
            r#"{"the-loop":{"modelBindings":{"build":{"model":"opus"}}}}"#,
        );
        let layer = read_settings_layer(&path, "modelBindings").expect("ok");
        assert_eq!(layer, json!({ "build": { "model": "opus" } }));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn unparseable_json_errors_naming_the_file() {
        let dir = unique_temp_dir();
        let path = write_temp(&dir, "bad.json", "{ not json");
        let err = read_settings_layer(&path, "modelBindings").expect_err("must fail");
        let msg = err.to_string();
        assert!(
            msg.contains("unparseable JSON"),
            "expected unparseable marker; got {msg}"
        );
        assert!(
            msg.contains(path.file_name().unwrap().to_str().unwrap())
                || msg.contains(&path.display().to_string()),
            "error must name the file; got {msg}"
        );
        let _ = fs::remove_dir_all(&dir);
    }

    // --- resolve_models ------------------------------------------------------

    #[test]
    fn resolve_models_merges_layers_whole_entry_with_provenance() {
        let layers = LayerSources {
            defaults: Some(json!({
                "build": { "model": "opus", "effort": "low" },
                "drive": { "model": "sonnet" }
            })),
            user: Some(json!({
                "build": { "model": "haiku" },
                "plan": { "model": "sonnet", "effort": "low" }
            })),
            project: Some(json!({
                "build": { "model": "opus", "effort": "medium" }
            })),
            local: Some(json!({
                "drive": { "model": "opus" }
            })),
        };
        let table = resolve_models(&layers).expect("valid");
        assert_eq!(
            table["plan"],
            json!({ "model": "sonnet", "effort": "low", "provenance": "user" })
        );
        // project beats user for build — whole-entry: user effort does not leak
        assert_eq!(
            table["build"],
            json!({ "model": "opus", "effort": "medium", "provenance": "project" })
        );
        assert_eq!(
            table["drive"],
            json!({ "model": "opus", "provenance": "local" })
        );

        // higher layer replaces entire entry (effort: low gone)
        let wholesale = LayerSources {
            defaults: Some(json!({ "build": { "model": "opus", "effort": "low" } })),
            project: Some(json!({ "build": { "model": "haiku" } })),
            ..LayerSources::default()
        };
        let t = resolve_models(&wholesale).expect("valid");
        assert_eq!(
            t["build"],
            json!({ "model": "haiku", "provenance": "project" })
        );
        assert!(t["build"].get("effort").is_none());
    }

    #[test]
    fn resolve_models_stamps_agent_and_executor_gap() {
        let layers = LayerSources {
            local: Some(json!({
                "validate": {
                    "model": "opus",
                    "agent": "my-validator",
                    "executor": "grok"
                }
            })),
            ..LayerSources::default()
        };
        let table = resolve_models(&layers).expect("gap is not an error");
        assert_eq!(table["validate"]["agent"], "my-validator");
        assert_eq!(table["validate"]["executor"], "grok");
        assert_eq!(table["validate"]["gap"], GAP_AGENT_AND_EXECUTOR);
        assert_eq!(table["validate"]["provenance"], "local");
    }

    #[test]
    fn resolve_models_rejects_malformed_entries_naming_role_and_layer() {
        assert_eq!(EFFORTS, &["low", "medium", "high", "xhigh", "max"]);

        let cases: Vec<(LayerSources, &str, &str)> = vec![
            (
                LayerSources {
                    defaults: Some(json!({ "build": "opus" })),
                    ..LayerSources::default()
                },
                "build",
                "default",
            ),
            (
                LayerSources {
                    defaults: Some(json!({ "build": {} })),
                    ..LayerSources::default()
                },
                "build",
                "default",
            ),
            (
                LayerSources {
                    project: Some(json!({ "build": { "model": 42 } })),
                    ..LayerSources::default()
                },
                "build",
                "project",
            ),
            (
                LayerSources {
                    local: Some(json!({ "build": { "model": "sonnet", "effort": "blazing" } })),
                    ..LayerSources::default()
                },
                "build",
                "local",
            ),
            (
                LayerSources {
                    project: Some(json!({ "plan": { "model": "session", "agent": 7 } })),
                    ..LayerSources::default()
                },
                "plan",
                "project",
            ),
        ];

        for (layers, role, layer) in cases {
            let err = resolve_models(&layers).expect_err("must reject");
            let msg = err.to_string();
            assert!(msg.contains(role), "error must name role {role}; got {msg}");
            assert!(
                msg.contains(layer),
                "error must name layer {layer}; got {msg}"
            );
        }
    }

    // --- resolve_family ------------------------------------------------------

    #[test]
    fn resolve_family_empty_object_layer_is_unbound_for_single_entry() {
        // Empty {} must not wholesale-win over a lower layer.
        let layers = LayerSources {
            defaults: Some(json!({ "skill": "grilling", "extra": true })),
            user: Some(empty_object()),
            project: Some(empty_object()),
            local: Some(empty_object()),
        };
        let resolved = resolve_family("interview", &layers).expect("ok");
        assert_eq!(
            resolved,
            json!({ "skill": "grilling", "extra": true, "provenance": "default" })
        );

        // Empty {} must not wholesale-win over the inventory fallback either.
        let only_empty = LayerSources {
            user: Some(empty_object()),
            project: Some(empty_object()),
            ..LayerSources::default()
        };
        let unbound = resolve_family("interview", &only_empty).expect("ok");
        assert_eq!(
            unbound,
            json!({ "skill": "grilling", "provenance": "fallback" })
        );

        // modelBindings still treats {} as an empty role map (not omitted semantics).
        let mb = resolve_family(
            "modelBindings",
            &LayerSources {
                defaults: Some(empty_object()),
                ..LayerSources::default()
            },
        )
        .expect("ok");
        assert_eq!(mb, empty_object());
    }

    #[test]
    fn resolve_family_unbound_uses_inventory_fallback_with_provenance() {
        // Object fallbacks are spread with provenance stamp.
        let interview = resolve_family("interview", &LayerSources::default()).expect("ok");
        assert_eq!(
            interview,
            json!({ "skill": "grilling", "provenance": "fallback" })
        );

        let precommit = resolve_family("precommit", &LayerSources::default()).expect("ok");
        assert_eq!(
            precommit,
            json!({ "system": "none", "provenance": "fallback" })
        );

        // String markers become { value, provenance }.
        let lint = resolve_family("lint", &LayerSources::default()).expect("ok");
        assert_eq!(
            lint,
            json!({ "value": "detected-convention", "provenance": "fallback" })
        );
        let test_harness = resolve_family("testHarness", &LayerSources::default()).expect("ok");
        assert_eq!(
            test_harness,
            json!({ "value": "detected-convention", "provenance": "fallback" })
        );

        // modelBindings unbound → empty table (role-level fallback is binding_for).
        let mb = resolve_family("modelBindings", &LayerSources::default()).expect("ok");
        assert_eq!(mb, empty_object());
        assert_eq!(
            binding_for(&mb, "ghost"),
            json!({ "model": "session", "provenance": "fallback" })
        );
    }

    #[test]
    fn resolve_family_single_entry_whole_replacement_and_block() {
        let resolved = resolve_family(
            "interview",
            &LayerSources {
                defaults: Some(json!({ "alpha": 1, "beta": 2, "keep": true })),
                project: Some(json!({ "alpha": 99 })),
                ..LayerSources::default()
            },
        )
        .expect("ok");
        assert_eq!(resolved, json!({ "alpha": 99, "provenance": "project" }));

        let blocked = resolve_family("exampleBlock", &LayerSources::default()).expect("ok");
        assert_eq!(blocked["blocked"], true);
        assert_eq!(blocked["family"], "exampleBlock");
        assert!(
            blocked["gap"]
                .as_str()
                .is_some_and(|g| g.contains("exampleBlock"))
        );
        assert!(blocked.get("provenance").is_none());

        let bound_block = resolve_family(
            "exampleBlock",
            &LayerSources {
                project: Some(json!({ "procedure": "docs/validation.md" })),
                ..LayerSources::default()
            },
        )
        .expect("ok");
        assert_eq!(
            bound_block,
            json!({ "procedure": "docs/validation.md", "provenance": "project" })
        );
    }

    #[test]
    fn resolve_family_model_bindings_matches_resolve_models() {
        let layers = LayerSources {
            defaults: Some(json!({
                "build": { "model": "opus", "effort": "low" },
                "drive": { "model": "sonnet" }
            })),
            user: Some(json!({ "build": { "model": "haiku" } })),
            project: Some(json!({ "build": { "model": "opus" } })),
            local: Some(json!({ "drive": { "model": "opus", "effort": "high" } })),
        };
        let via_family = resolve_family("modelBindings", &layers).expect("ok");
        let via_models = resolve_models(&layers).expect("ok");
        assert_eq!(via_family, via_models);
    }

    #[test]
    fn family_layer_omits_empty_object_for_single_entry() {
        assert_eq!(family_layer("interview", empty_object()), None);
        assert_eq!(
            family_layer("interview", json!({ "skill": "grilling" })),
            Some(json!({ "skill": "grilling" }))
        );
        // modelBindings keeps empty maps
        assert_eq!(
            family_layer("modelBindings", empty_object()),
            Some(empty_object())
        );
    }

    #[test]
    fn hook_inventory_declares_all_expected_families() {
        for family in HOOK_FAMILY_ORDER {
            assert!(
                HOOK_INVENTORY.contains_key(family),
                "HOOK_INVENTORY missing {family}"
            );
        }
        assert!(matches!(
            HOOK_INVENTORY.get("exampleBlock"),
            Some(HookDeclaration::Block)
        ));
        assert!(matches!(
            HOOK_INVENTORY.get("interview"),
            Some(HookDeclaration::Fallback(_))
        ));
    }

    // --- layer paths ---------------------------------------------------------

    #[test]
    fn user_settings_path_honors_home_env() {
        let home = env::var_os("HOME").unwrap_or_default();
        let expected = PathBuf::from(&home).join(".claude").join("settings.json");
        assert_eq!(user_settings_path(), expected);
        // Path is built from HOME, not an absolute real-home API: ends with the
        // fixed suffix and starts with whatever HOME currently is.
        let path = user_settings_path();
        assert!(path.ends_with(Path::new(".claude").join("settings.json")));
        if !home.is_empty() {
            assert!(path.starts_with(PathBuf::from(home)));
        }
    }

    #[test]
    fn project_and_local_paths_are_cwd_relative() {
        let project = project_settings_path();
        let local = local_settings_path();
        assert_eq!(project, PathBuf::from(".claude").join("settings.json"));
        assert_eq!(local, PathBuf::from(".claude").join("settings.local.json"));
        assert!(project.is_relative());
        assert!(local.is_relative());
    }
}
