use crate::events::EngineEvent;
use serde::{Deserialize, Serialize};

/// One entry in the deterministic event history.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub tick: u64,
    pub event: EngineEvent,
}

/// Serializable mirror of LogEntry for GameStateDTO persistence.
pub type LogEntryDTO = LogEntry;

/// Append-only log of every valid command processed by the engine.
/// This is the source of truth for time-travel replay: replaying all entries
/// from a fresh world bootstrap produces identical state at any tick.
pub struct EventLog {
    entries: Vec<LogEntry>,
}

impl EventLog {
    pub fn new() -> Self {
        Self {
            entries: Vec::new(),
        }
    }

    /// Restore an EventLog from a saved list of entries (used by save/load).
    pub fn from_entries(entries: Vec<LogEntry>) -> Self {
        Self { entries }
    }

    /// Append a processed event. Only called for valid, state-mutating events.
    /// Unknown/invalid commands are never logged — they don't affect deterministic state.
    pub fn append(&mut self, tick: u64, event: EngineEvent) {
        self.entries.push(LogEntry { tick, event });
    }

    pub fn entries(&self) -> &[LogEntry] {
        &self.entries
    }

    /// Returns all entries with tick <= target_tick, for replay.
    pub fn entries_up_to(&self, target_tick: u64) -> Vec<LogEntry> {
        self.entries
            .iter()
            .filter(|e| e.tick <= target_tick)
            .cloned()
            .collect()
    }

    pub fn current_tick(&self) -> u64 {
        self.entries.last().map(|e| e.tick).unwrap_or(0)
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }
}

impl Default for EventLog {
    fn default() -> Self {
        Self::new()
    }
}
