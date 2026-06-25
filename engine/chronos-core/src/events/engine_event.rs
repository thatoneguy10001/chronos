use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// All discrete actions the engine can process. This is the canonical command contract —
/// whether input came from a typed string or a button click, it arrives here as an enum.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum EngineEvent {
    Move {
        direction: String,
    },
    PickUp {
        item_id: String,
    },
    Drop {
        item_id: String,
    },
    Look,
    Inventory,
    /// Imprint a class onto the player body: set name + stats, reset health to
    /// the class's HP. Logged like any other event, so character creation
    /// replays deterministically on rewind.
    SpawnCharacter {
        class_id: String,
        name: String,
    },
    /// Resolve one combat exchange against the enemy in the player's room.
    /// Draws from the seeded RNG, so the same fight replays identically on rewind.
    Attack,
    /// Break off from combat and escape through a passable exit. Requires a living
    /// enemy in the room and at least one currently-open exit. Logged (it moves the
    /// player), so it replays deterministically.
    Flee,
    /// Apply a status effect (poison/burn/bleed) to a target. Damage ticks on turns
    /// [applied_tick+1, applied_tick+duration], then the effect expires.
    ApplyEffect {
        kind: String,
        target_name: String,
        damage_per_turn: i32,
        duration_turns: u32,
    },
    /// Use an ability (e.g., "shield bash") against a target.
    UseAbility {
        ability_name: String,
        target_name: String,
    },
    /// Read-only: display the player's character sheet (level, XP, stats).
    CharacterSheet,
    /// Consume a usable item from inventory (potion, elixir, etc.).
    UseItem {
        item_id: String,
    },
    /// Start a conversation with an NPC in the current room.
    Talk {
        npc_id: String,
    },
    /// Ask an NPC about a specific topic keyword.
    Ask {
        npc_id: String,
        topic: String,
    },
    /// Accept a quest from an NPC in the current room.
    AcceptQuest {
        quest_id: String,
    },
    /// View the player's current quest log.
    QuestLog,
    /// Browse a vendor NPC's shop inventory (read-only, no state change).
    Shop {
        npc_id: String,
    },
    /// Purchase an item from a vendor NPC. Deducts gold from Wallet; adds item to inventory.
    Buy {
        npc_id: String,
        item_id: String,
    },
    /// Wipe the engine to a clean slate — new game. Clears the event log so it
    /// is NOT a rewind; it's a true restart. Dead players use this to try again.
    Restart,
    /// Display available commands. Read-only; logged but replays as a no-op display.
    Help,
    /// Read the description of an item in the room or inventory. Read-only.
    Examine {
        item_id: String,
    },
    /// Rest at an inn: pay 5 gold, restore HP to max. Requires an innkeeper in the room.
    Rest,
    /// Equip an item from inventory into the appropriate body slot (routed by item tags).
    Equip {
        item_id: String,
    },
    /// Remove whatever is in a named slot ("weapon", "head", "body", "hands", "feet", "accessory").
    /// Omitting the slot name defaults to clearing the weapon slot for backward compat.
    Unequip,
    UnequipSlot {
        slot: String,
    },
    /// Assemble a weapon from 3 parts (frame + mechanism + enhancement).
    Assemble {
        frame_id: String,
        mechanism_id: String,
        enhancement_id: String,
    },
    /// Load a payload vial into the syringe spear. Item stays in inventory (reusable).
    Load {
        payload_id: String,
    },
    /// Unload a payload vial from the syringe spear by item ID or partial name.
    Unload {
        payload_id: String,
    },
    /// Dev shortcut: teleport the player to any room by id. Logged so time travel works.
    /// Usage: `dev goto <room_id>` — e.g. `dev goto trench_alpha`
    DevGoto {
        room_id: String,
    },
    /// Dev shortcut: instantly mark a quest complete and set its WorldFlag, bypassing
    /// location checks and rewards. Unlocks chain gates so the next quest becomes available.
    /// Usage: `dev complete <quest_id>` — e.g. `dev complete morlak_intelligence`
    DevComplete {
        quest_id: String,
    },
    /// Return a quest whose objective is met to the original NPC giver to collect rewards.
    /// Player must be in the giver's room. This is when rewards are actually awarded.
    TurnIn {
        quest_id: String,
    },
    /// Advance game time to the next dusk (20:00) or dawn (06:00), whichever comes first.
    /// Passing the day into night unlocks Armistice-gated rooms and quests.
    Wait,
    /// Extensible passthrough for verbs the core binary doesn't hardcode.
    ///
    /// This is the seam that lets a world define its own commands ("brew",
    /// "move_unit", "cast") without adding a variant to this enum and rebuilding
    /// the engine. The owning layer (matched by `verb`) interprets `args`; if no
    /// layer claims the verb, the engine reports it as unknown rather than
    /// crashing.
    ///
    /// `args` is a free-form bag so each verb defines its own parameters. Like
    /// every other event it is logged and replayed, so world commands are
    /// time-travel-safe by construction.
    WorldCommand {
        verb: String,
        #[serde(default)]
        args: HashMap<String, serde_json::Value>,
    },
    /// Passes through to the UI as an error string; never appended to the event log.
    Unknown {
        raw: String,
    },
}

impl EngineEvent {
    /// Read a string argument from a `WorldCommand`'s arg bag. Returns `None`
    /// for any other variant, a missing key, or a non-string value.
    pub fn world_arg_str(&self, key: &str) -> Option<&str> {
        match self {
            EngineEvent::WorldCommand { args, .. } => args.get(key).and_then(|v| v.as_str()),
            _ => None,
        }
    }
}

/// One segment of an NPC response, split by the dialogue system.
/// `kind` is "action" (narration/stage direction) or "speech" (spoken dialogue).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NpcSection {
    pub kind: String,
    pub text: String,
}

/// Structured output from the engine after processing one event.
/// The UI renders `narrative` and uses `context_actions` to build BUTTONS mode entries.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandResult {
    pub success: bool,
    pub narrative: String,
    /// Available actions in the new state, for BUTTONS input mode.
    pub context_actions: Vec<ContextAction>,
    /// Snapshot of player inventory item IDs after this command.
    pub inventory_ids: Vec<String>,
    /// Tick index this result was generated at.
    pub tick: u64,
    /// In-game minutes since game start, after this action's time cost is applied.
    /// Day 1 begins at 360 (06:00). Separate from tick — one tick is not one minute.
    #[serde(default)]
    pub game_time: u32,
    /// NPC response split into action/speech segments. Populated only for Talk/Ask.
    /// Empty for all other command types.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub npc_sections: Vec<NpcSection>,
    /// True when the player has just died. The UI should show a death screen.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub game_over: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextAction {
    /// Human-readable button label (e.g. "North", "Take Iron Key").
    pub label: String,
    /// Raw command string dispatched when this button is clicked.
    pub command: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn world_command_round_trips_through_json() {
        let json = r#"{ "type": "world_command", "verb": "brew",
            "args": { "recipe": "antitoxin", "doses": 2 } }"#;
        let event: EngineEvent = serde_json::from_str(json).unwrap();
        match &event {
            EngineEvent::WorldCommand { verb, args } => {
                assert_eq!(verb, "brew");
                assert_eq!(
                    args.get("recipe").and_then(|v| v.as_str()),
                    Some("antitoxin")
                );
                assert_eq!(args.get("doses").and_then(|v| v.as_i64()), Some(2));
            }
            other => panic!("expected WorldCommand, got {other:?}"),
        }
        // Re-serializing and re-parsing yields an identical event (replay-safe).
        let reser = serde_json::to_string(&event).unwrap();
        let again: EngineEvent = serde_json::from_str(&reser).unwrap();
        assert_eq!(event, again);
    }

    #[test]
    fn world_command_args_default_to_empty() {
        let json = r#"{ "type": "world_command", "verb": "end_turn" }"#;
        let event: EngineEvent = serde_json::from_str(json).unwrap();
        assert!(matches!(&event, EngineEvent::WorldCommand { verb, args }
            if verb == "end_turn" && args.is_empty()));
    }

    #[test]
    fn world_arg_str_reads_string_args_only() {
        let json = r#"{ "type": "world_command", "verb": "cast",
            "args": { "spell": "ignite", "power": 7 } }"#;
        let event: EngineEvent = serde_json::from_str(json).unwrap();
        assert_eq!(event.world_arg_str("spell"), Some("ignite"));
        assert_eq!(event.world_arg_str("power"), None); // not a string
        assert_eq!(event.world_arg_str("missing"), None);
        // Non-WorldCommand variants always return None.
        assert_eq!(EngineEvent::Look.world_arg_str("spell"), None);
    }
}
