use bevy_ecs::prelude::Component;

/// Tracks how many boss phases an enemy has already entered, so each phase
/// transition fires exactly once even though combat re-evaluates HP every hit.
///
/// Absent on a freshly-spawned enemy (treated as 0 phases entered). Because it is
/// set during combat — itself a replayed event — a rewind rebuilds it correctly:
/// the enemy respawns clean at bootstrap and replaying the fight re-enters the
/// same phases in the same order.
#[derive(Component, Debug, Clone, Default)]
pub struct PhaseProgress {
    /// Number of phases (sorted by descending HP threshold) already entered.
    pub entered: usize,
}
