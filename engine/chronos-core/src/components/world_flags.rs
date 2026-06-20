use bevy_ecs::prelude::*;
use std::collections::HashMap;

/// Global world-state flags set by quest turn-ins and major events.
/// Lives as a bevy_ecs Resource so it is naturally cleared on rewind and rebuilt by replay.
#[derive(Resource, Debug, Clone, Default)]
pub struct WorldFlags {
    pub flags: HashMap<String, bool>,
    /// Integer counters for tracked values like Hope and Despair.
    pub int_flags: HashMap<String, i32>,
}

impl WorldFlags {
    pub fn set(&mut self, key: &str) {
        self.flags.insert(key.to_string(), true);
    }

    pub fn is_set(&self, key: &str) -> bool {
        self.flags.get(key).copied().unwrap_or(false)
    }

    pub fn set_int(&mut self, key: &str, value: i32) {
        self.int_flags.insert(key.to_string(), value);
    }

    pub fn get_int(&self, key: &str) -> i32 {
        self.int_flags.get(key).copied().unwrap_or(0)
    }

    pub fn increment(&mut self, key: &str) {
        let v = self.get_int(key);
        self.int_flags.insert(key.to_string(), v + 1);
    }

    pub fn decrement(&mut self, key: &str) {
        let v = self.get_int(key);
        self.int_flags.insert(key.to_string(), v - 1);
    }
}
