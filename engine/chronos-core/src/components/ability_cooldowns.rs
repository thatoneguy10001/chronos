use bevy_ecs::prelude::Component;
use std::collections::HashMap;

/// Tracks the last-used tick for each ability by ID.
/// An ability with cooldown N is available when `current_tick - last_used >= N`.
#[derive(Component, Debug, Clone, Default)]
pub struct AbilityCooldowns {
    pub last_used: HashMap<String, u64>,
}

impl AbilityCooldowns {
    pub fn new() -> Self {
        Self::default()
    }

    /// Returns true if the ability is off cooldown (or has no cooldown).
    pub fn is_ready(&self, ability_id: &str, cooldown: u32, current_tick: u64) -> bool {
        if cooldown == 0 {
            return true;
        }
        match self.last_used.get(ability_id) {
            None => true,
            Some(&last) => current_tick.saturating_sub(last) >= cooldown as u64,
        }
    }

    /// Returns how many ticks remain before the ability is ready. 0 means ready.
    pub fn turns_remaining(&self, ability_id: &str, cooldown: u32, current_tick: u64) -> u64 {
        if cooldown == 0 {
            return 0;
        }
        match self.last_used.get(ability_id) {
            None => 0,
            Some(&last) => {
                let elapsed = current_tick.saturating_sub(last);
                (cooldown as u64).saturating_sub(elapsed)
            }
        }
    }

    /// Record that this ability was just used.
    pub fn mark_used(&mut self, ability_id: &str, current_tick: u64) {
        self.last_used.insert(ability_id.to_string(), current_tick);
    }

    /// Clear all cooldowns (on class change / restart).
    pub fn reset(&mut self) {
        self.last_used.clear();
    }
}
