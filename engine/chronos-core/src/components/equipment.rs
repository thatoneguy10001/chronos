use bevy_ecs::prelude::Component;

/// Tracks what items the player has equipped.
/// Only one weapon slot for now; additional slots (armor, accessory) can be added later.
#[derive(Component, Debug, Clone, Default)]
pub struct EquipmentSlots {
    pub weapon: Option<String>,
}

impl EquipmentSlots {
    pub fn new() -> Self {
        Self::default()
    }
}
