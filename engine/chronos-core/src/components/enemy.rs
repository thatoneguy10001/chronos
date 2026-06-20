use bevy_ecs::component::Component;

/// Marker component for hostile entities. Mirrors [`Controllable`](super::Controllable)
/// for the player: systems use `With<Enemy>` to find combatants without a global ID.
/// An enemy carries the same `Identity` + `Stats` + `Health` + `Position` as the
/// player body — it's just flagged hostile and not player-controlled.
#[derive(Component, Debug, Clone)]
pub struct Enemy;
