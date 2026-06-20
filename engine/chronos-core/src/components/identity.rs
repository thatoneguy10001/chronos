use bevy_ecs::component::Component;

/// Who an entity *is*: a display name and the class blueprint it was built from.
/// Imprinted by the `SpawnCharacter` event. The class display name and base
/// data are looked up in the repository via `class_id`, so this component stays
/// small and the blueprint remains the single source of truth.
#[derive(Component, Debug, Clone)]
pub struct Identity {
    pub name: String,
    pub class_id: String,
}
