use bevy_ecs::prelude::*;

/// Marker component added to the player when all quests are completed.
/// Triggers the victory narrative once; persists for the rest of the session.
/// Cleared by restart (world.clear_entities() + bootstrap).
#[derive(Component, Debug, Clone)]
pub struct Victory;
