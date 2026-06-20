use bevy_ecs::component::Component;

/// Links an entity to its immutable ItemTemplate in the StaticRepository.
#[derive(Component, Debug, Clone)]
pub struct ItemBlueprint {
    pub id: String,
}
