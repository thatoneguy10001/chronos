use bevy_ecs::component::Component;

/// The room an entity currently occupies. Mutually exclusive with InInventory.
#[derive(Component, Debug, Clone)]
pub struct Position {
    pub room_id: String,
}
