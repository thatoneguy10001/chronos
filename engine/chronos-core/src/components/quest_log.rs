use bevy_ecs::prelude::*;

/// Tracks the player's quest progress. Attached to the player entity at bootstrap.
#[derive(Component, Debug, Clone, Default)]
pub struct QuestLog {
    pub entries: Vec<QuestEntry>,
}

#[derive(Debug, Clone)]
pub struct QuestEntry {
    pub quest_id: String,
    pub progress: i32,
    /// Objective met but reward not yet collected — player must return to giver.
    pub ready_to_turn_in: bool,
    /// Reward collected from the giver. Terminal state.
    pub completed: bool,
}

impl QuestLog {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn has_active(&self, quest_id: &str) -> bool {
        self.entries.iter().any(|e| e.quest_id == quest_id && !e.completed)
    }

    pub fn is_completed(&self, quest_id: &str) -> bool {
        self.entries.iter().any(|e| e.quest_id == quest_id && e.completed)
    }

    pub fn is_ready_to_turn_in(&self, quest_id: &str) -> bool {
        self.entries.iter().any(|e| e.quest_id == quest_id && e.ready_to_turn_in && !e.completed)
    }

    pub fn has_any(&self, quest_id: &str) -> bool {
        self.entries.iter().any(|e| e.quest_id == quest_id)
    }

    pub fn progress_for(&self, quest_id: &str) -> Option<i32> {
        self.entries.iter().find(|e| e.quest_id == quest_id).map(|e| e.progress)
    }
}
