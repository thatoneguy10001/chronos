use serde::{Deserialize, Serialize};
use crate::journal::event_log::LogEntryDTO;

fn default_game_time() -> u32 { 360 } // 06:00 Day 1 — fallback for old saves

/// Complete serializable snapshot of engine state.
/// On WASM this round-trips through JS as JSON; on native it maps to SQLite rows.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameStateDTO {
    /// Current engine tick (monotonically increasing command counter).
    pub tick: u64,
    /// In-game minutes since game start (360 = 06:00 Day 1). Reconstructed on replay.
    #[serde(default = "default_game_time")]
    pub game_time: u32,
    /// Room ID the player currently occupies.
    pub player_room_id: String,
    /// Display name of the player's current room, for the UI room header.
    #[serde(default)]
    pub current_room_name: String,
    /// Item IDs held in player inventory.
    pub inventory_ids: Vec<String>,
    /// All non-player entities that have moved from their starting positions.
    pub entity_states: Vec<EntityStateDTO>,
    /// The player's character sheet, or None before any `SpawnCharacter` event
    /// has imprinted a class onto the body.
    pub player_character: Option<CharacterStateDTO>,
    /// Living enemies currently in the world (despawned when slain).
    pub enemies: Vec<EnemyStateDTO>,
    /// Full event history — enables complete replay from scratch.
    pub event_log: Vec<LogEntryDTO>,
}

/// Snapshot of a living enemy — name, where it is, health, and active status effects.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnemyStateDTO {
    pub name: String,
    pub class_id: String,
    pub room_id: String,
    pub hp: i32,
    pub max_hp: i32,
    /// Active effect kind names (e.g. ["Poison", "Burn"]) for UI display.
    pub active_effects: Vec<String>,
}

/// One quest entry in the player's log, for UI display.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestProgressDTO {
    pub quest_id: String,
    pub name: String,
    pub description: String,
    pub objective_hint: String,
    pub progress: i32,
    pub target: i32,
    pub completed: bool,
    /// Objective met; player must return to quest giver to collect reward.
    #[serde(default)]
    pub ready_to_turn_in: bool,
}

/// Snapshot of the player's identity, class, and current stats. Populated only
/// once a class has been imprinted; mirrors the `Identity` + `Stats` + `Health`
/// + `Experience` + `ActiveEffects` components on the player body.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CharacterStateDTO {
    pub name: String,
    pub class_id: String,
    pub hp: i32,
    pub max_hp: i32,
    pub attack: i32,
    pub defense: i32,
    pub intelligence: i32,
    #[serde(default)]
    pub hit: i32,
    #[serde(default)]
    pub tech_attack: i32,
    #[serde(default)]
    pub evasion: i32,
    #[serde(default)]
    pub endurance: i32,
    #[serde(default)]
    pub luck: i32,
    #[serde(default)]
    pub agility: i32,
    pub xp: i32,
    pub level: u32,
    pub gold: i32,
    #[serde(default)]
    pub shards: i32,
    /// Item ID of the currently equipped weapon, or None.
    #[serde(default)]
    pub equipped_weapon: Option<String>,
    /// IDs of payload vials currently loaded into the syringe spear (Iron Apothecary only).
    #[serde(default)]
    pub payload_slots: Vec<String>,
    /// Maximum number of payload slots (0 if class doesn't have payload slots).
    #[serde(default)]
    pub payload_capacity: u32,
    /// Active effect kind names on the player (e.g. ["Poison", "Defense Up"]).
    #[serde(default)]
    pub active_effects: Vec<String>,
    /// Quest log entries for sidebar display.
    #[serde(default)]
    pub active_quests: Vec<QuestProgressDTO>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntityStateDTO {
    /// Blueprint ID (matches ItemTemplate.id).
    pub blueprint_id: String,
    /// Current room ID if in a room, or None if in someone's inventory.
    pub room_id: Option<String>,
    /// Owner entity index if in inventory, or None if in a room.
    pub owner_index: Option<u32>,
}

#[cfg(not(target_arch = "wasm32"))]
pub mod sqlite {
    use super::GameStateDTO;
    use rusqlite::{Connection, params};

    pub fn save(conn: &Connection, slot: &str, state: &GameStateDTO) -> rusqlite::Result<()> {
        conn.execute(
            "CREATE TABLE IF NOT EXISTS saves (slot TEXT PRIMARY KEY, state_json TEXT NOT NULL)",
            [],
        )?;
        let json = serde_json::to_string(state).expect("GameStateDTO is always serializable");
        conn.execute(
            "INSERT OR REPLACE INTO saves (slot, state_json) VALUES (?1, ?2)",
            params![slot, json],
        )?;
        Ok(())
    }

    pub fn load(conn: &Connection, slot: &str) -> rusqlite::Result<Option<GameStateDTO>> {
        conn.execute(
            "CREATE TABLE IF NOT EXISTS saves (slot TEXT PRIMARY KEY, state_json TEXT NOT NULL)",
            [],
        )?;
        let mut stmt = conn.prepare("SELECT state_json FROM saves WHERE slot = ?1")?;
        let mut rows = stmt.query(params![slot])?;
        if let Some(row) = rows.next()? {
            let json: String = row.get(0)?;
            let state: GameStateDTO = serde_json::from_str(&json).expect("corrupted save data");
            Ok(Some(state))
        } else {
            Ok(None)
        }
    }
}
