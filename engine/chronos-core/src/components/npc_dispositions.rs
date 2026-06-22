use bevy_ecs::prelude::*;
use std::collections::HashMap;

/// Per-NPC relationship tracking on the player entity.
/// Dispositions default to the NPC's `initial_disposition` when first accessed.
/// Topics seen gate unlock chains: asking about a topic records it here.
#[derive(Component, Debug, Clone, Default)]
pub struct NpcDispositions {
    /// NPC id → current disposition (0–100).
    pub values: HashMap<String, i32>,
    /// NPC id → list of keywords the player has already asked about.
    pub topics_seen: HashMap<String, Vec<String>>,
}

impl NpcDispositions {
    pub fn disposition(&self, npc_id: &str, initial: i32) -> i32 {
        *self.values.get(npc_id).unwrap_or(&initial)
    }

    pub fn has_seen_topic(&self, npc_id: &str, keyword: &str) -> bool {
        self.topics_seen
            .get(npc_id)
            .map(|v| v.iter().any(|t| t == keyword))
            .unwrap_or(false)
    }

    pub fn record_topic(&mut self, npc_id: &str, keyword: &str) {
        let seen = self.topics_seen.entry(npc_id.to_string()).or_default();
        if !seen.iter().any(|t| t == keyword) {
            seen.push(keyword.to_string());
        }
    }

    /// Adjust disposition by `delta`, initializing from `initial` if first access.
    pub fn adjust(&mut self, npc_id: &str, delta: i32, initial: i32) {
        let entry = self.values.entry(npc_id.to_string()).or_insert(initial);
        *entry = (*entry + delta).clamp(0, 100);
    }
}
