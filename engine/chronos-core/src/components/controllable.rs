use bevy_ecs::component::Component;

/// Marker component. Exactly one entity carries this — the player.
/// Systems use With<Controllable> to locate the player without a global ID.
#[derive(Component, Debug, Clone)]
pub struct Controllable;
