use bevy_ecs::prelude::*;

/// Payload slot loadout for classes that fight with a payload-delivery weapon (Iron Apothecary).
/// Items in `loaded` stay in the player's inventory — they are referenced, not consumed.
/// On each successful attack hit, all loaded payloads apply their effects to the target.
#[derive(Component, Debug, Clone)]
pub struct PayloadSlots {
    pub loaded: Vec<String>,
    pub capacity: usize,
}

impl PayloadSlots {
    pub fn new(capacity: usize) -> Self {
        Self {
            loaded: Vec::new(),
            capacity,
        }
    }
}
