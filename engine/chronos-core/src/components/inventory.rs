use bevy_ecs::component::Component;
use bevy_ecs::entity::Entity;

/// Marks an entity as held by another entity. Mutually exclusive with Position.
/// When an item is picked up: remove Position, insert InInventory { owner }.
/// When dropped: remove InInventory, insert Position { room_id: owner's room }.
#[derive(Component, Debug, Clone)]
pub struct InInventory {
    pub owner: Entity,
}
