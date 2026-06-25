//! Layer system — the formal boundary between the engine's subsystems.
//!
//! A *layer* is one engine subsystem (space, combat, dialogue, …). A world's
//! manifest declares an ordered **stack** of layers, and that combination *is*
//! the genre: room-graph + single-exchange combat + dialogue is a text
//! adventure; grid space + tactical combat + party is an SRPG.
//!
//! This module does not contain the gameplay logic — that still lives in
//! [`crate::systems`]. What it adds is the *contract*:
//!
//! - [`KNOWN_LAYERS`] — the catalogue of layers this engine build can run, each
//!   with its dependencies and the [`crate::events::EngineEvent::WorldCommand`]
//!   verbs it owns.
//! - [`LayerStack`] — a world's declared stack, validated against the catalogue
//!   (no unknown layers, every dependency present and earlier in the order).
//! - Verb routing — [`LayerStack::handles_verb`] is what the engine's
//!   `world_command_is_handled` seam consults to decide whether an extensible
//!   command is claimed by an active layer.
//!
//! Today every built-in layer drives itself through typed `EngineEvent`
//! variants rather than `WorldCommand`, so no layer registers verbs yet. The
//! registry is wired anyway so that a new layer (or a community world's custom
//! layer) only has to add an entry here, not thread plumbing through the engine.
//!
//! ## What this is NOT (yet)
//!
//! The engine does not yet *gate behaviour* on layer presence — a world with an
//! empty stack still runs the full built-in rule set (that is how every world
//! authored before the layer system behaves, and all of them must keep working).
//! Switching behaviour on the active stack (skip combat when there is no combat
//! layer, pick `turn_order` vs `single_exchange`) comes when the alternate
//! modes actually exist. This step lands the boundary and the validation; the
//! branching is deliberately deferred.

use crate::data::schemas::LayerConfig;

/// Static description of one layer this engine build knows how to run.
pub struct LayerSpec {
    /// Stable identifier used in the manifest (`"combat"`, `"space"`, …).
    pub id: &'static str,
    /// Layer ids that must appear *before* this one in the stack. A combat layer
    /// needs something to fight in (space) and someone to fight with (entity).
    pub requires: &'static [&'static str],
    /// `WorldCommand` verbs this layer owns. Empty for layers that drive
    /// themselves through typed `EngineEvent` variants (all of them, for now).
    pub verbs: &'static [&'static str],
}

/// The catalogue of layers this engine build can run. Adding a new layer type
/// (JRPG combat, tactical grid, party, …) means adding an entry here.
pub const KNOWN_LAYERS: &[LayerSpec] = &[
    LayerSpec {
        id: "space",
        requires: &[],
        verbs: &[],
    },
    LayerSpec {
        id: "entity",
        requires: &[],
        verbs: &[],
    },
    LayerSpec {
        id: "combat",
        requires: &["space", "entity"],
        verbs: &[],
    },
    LayerSpec {
        id: "effects",
        requires: &["entity"],
        verbs: &[],
    },
    LayerSpec {
        id: "economy",
        requires: &["entity"],
        verbs: &[],
    },
    LayerSpec {
        id: "progression",
        requires: &["entity"],
        verbs: &[],
    },
    LayerSpec {
        id: "dialogue",
        requires: &["space"],
        verbs: &[],
    },
    LayerSpec {
        id: "quests",
        requires: &[],
        verbs: &[],
    },
    LayerSpec {
        id: "time",
        requires: &[],
        verbs: &[],
    },
];

/// Look up a layer's static spec by id.
pub fn known_layer(id: &str) -> Option<&'static LayerSpec> {
    KNOWN_LAYERS.iter().find(|l| l.id == id)
}

/// Why a declared layer stack is invalid.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LayerError {
    /// A declared layer id isn't in [`KNOWN_LAYERS`]. Almost always a typo — a
    /// genuinely newer layer would come with a higher `schema_version`, which
    /// the loader rejects before it ever gets here.
    UnknownLayer(String),
    /// A layer's dependency isn't present anywhere in the stack.
    MissingDependency {
        layer: String,
        requires: &'static str,
    },
    /// A layer's dependency is present but declared *after* it. The stack is an
    /// ordered pipeline, so a layer must come after everything it depends on.
    DependencyOutOfOrder {
        layer: String,
        requires: &'static str,
    },
    /// The same layer id appears more than once.
    DuplicateLayer(String),
}

impl std::fmt::Display for LayerError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LayerError::UnknownLayer(id) => {
                write!(f, "unknown layer '{id}' (not built into this engine)")
            }
            LayerError::MissingDependency { layer, requires } => {
                write!(
                    f,
                    "layer '{layer}' requires '{requires}', which the stack does not declare"
                )
            }
            LayerError::DependencyOutOfOrder { layer, requires } => write!(
                f,
                "layer '{layer}' requires '{requires}', which must be declared before it"
            ),
            LayerError::DuplicateLayer(id) => write!(f, "layer '{id}' is declared more than once"),
        }
    }
}

impl std::error::Error for LayerError {}

/// A world's declared layer stack, in order. Built from the manifest's
/// `layers[]` and validated against [`KNOWN_LAYERS`].
///
/// An empty stack is valid and means "use the engine's built-in defaults" —
/// exactly how every world authored before the layer system behaves.
#[derive(Debug, Clone, Default)]
pub struct LayerStack {
    /// Active layer ids, preserving manifest order.
    ids: Vec<String>,
}

impl LayerStack {
    /// Build a stack from the manifest's declared layer configs (order preserved).
    pub fn from_configs(configs: &[LayerConfig]) -> Self {
        Self {
            ids: configs.iter().map(|c| c.id.clone()).collect(),
        }
    }

    /// Whether the stack declares the given layer.
    pub fn contains(&self, id: &str) -> bool {
        self.ids.iter().any(|i| i == id)
    }

    /// Active layer ids in declared order.
    pub fn ids(&self) -> &[String] {
        &self.ids
    }

    /// Whether the stack is empty (→ engine defaults).
    pub fn is_empty(&self) -> bool {
        self.ids.is_empty()
    }

    /// The layer that owns a given `WorldCommand` verb, if any active layer claims it.
    pub fn verb_owner(&self, verb: &str) -> Option<&'static str> {
        self.ids.iter().find_map(|id| {
            let spec = known_layer(id)?;
            spec.verbs.contains(&verb).then_some(spec.id)
        })
    }

    /// Whether any active layer claims the given verb. This is the seam the
    /// engine's `world_command_is_handled` consults.
    pub fn handles_verb(&self, verb: &str) -> bool {
        self.verb_owner(verb).is_some()
    }

    /// Validate the stack against the catalogue: no duplicates, no unknown
    /// layers, and every dependency present and earlier in the order. An empty
    /// stack is trivially valid.
    pub fn validate(&self) -> Result<(), LayerError> {
        let mut seen: Vec<&str> = Vec::with_capacity(self.ids.len());
        for id in &self.ids {
            if seen.contains(&id.as_str()) {
                return Err(LayerError::DuplicateLayer(id.clone()));
            }
            let spec = known_layer(id).ok_or_else(|| LayerError::UnknownLayer(id.clone()))?;
            for req in spec.requires {
                if !self.contains(req) {
                    return Err(LayerError::MissingDependency {
                        layer: id.clone(),
                        requires: req,
                    });
                }
                if !seen.contains(req) {
                    return Err(LayerError::DependencyOutOfOrder {
                        layer: id.clone(),
                        requires: req,
                    });
                }
            }
            seen.push(id);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stack(ids: &[&str]) -> LayerStack {
        LayerStack {
            ids: ids.iter().map(|s| s.to_string()).collect(),
        }
    }

    #[test]
    fn empty_stack_is_valid() {
        assert!(stack(&[]).validate().is_ok());
        assert!(stack(&[]).is_empty());
    }

    #[test]
    fn iron_and_blood_stack_validates() {
        // The stack Iron & Blood / Millbrook declare in their manifests.
        let s = stack(&[
            "space",
            "entity",
            "combat",
            "effects",
            "economy",
            "progression",
            "dialogue",
            "quests",
            "time",
        ]);
        assert_eq!(s.validate(), Ok(()));
    }

    #[test]
    fn unknown_layer_is_rejected() {
        let err = stack(&["space", "teleportation"]).validate().unwrap_err();
        assert_eq!(err, LayerError::UnknownLayer("teleportation".to_string()));
    }

    #[test]
    fn missing_dependency_is_rejected() {
        // combat requires space + entity; neither present.
        let err = stack(&["combat"]).validate().unwrap_err();
        assert!(matches!(
            err,
            LayerError::MissingDependency {
                requires: "space",
                ..
            }
        ));
    }

    #[test]
    fn dependency_after_dependent_is_rejected() {
        // combat declared before the space it depends on.
        let err = stack(&["entity", "combat", "space"])
            .validate()
            .unwrap_err();
        assert!(matches!(
            err,
            LayerError::DependencyOutOfOrder {
                requires: "space",
                ..
            }
        ));
    }

    #[test]
    fn duplicate_layer_is_rejected() {
        let err = stack(&["space", "space"]).validate().unwrap_err();
        assert_eq!(err, LayerError::DuplicateLayer("space".to_string()));
    }

    #[test]
    fn verbs_are_unclaimed_until_a_layer_registers_them() {
        // No built-in layer registers WorldCommand verbs yet.
        let s = stack(&["space", "combat", "entity"]);
        assert!(!s.handles_verb("brew"));
        assert_eq!(s.verb_owner("brew"), None);
    }
}
