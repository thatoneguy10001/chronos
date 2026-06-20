use serde::{Deserialize, Serialize};

/// All discrete actions the engine can process. This is the canonical command contract —
/// whether input came from a typed string or a button click, it arrives here as an enum.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum EngineEvent {
    Move { direction: String },
    PickUp { item_id: String },
    Drop { item_id: String },
    Look,
    Inventory,
    /// Imprint a class onto the player body: set name + stats, reset health to
    /// the class's HP. Logged like any other event, so character creation
    /// replays deterministically on rewind.
    SpawnCharacter { class_id: String, name: String },
    /// Resolve one combat exchange against the enemy in the player's room.
    /// Draws from the seeded RNG, so the same fight replays identically on rewind.
    Attack,
    /// Apply a status effect (poison/burn/bleed) to a target. Damage ticks on turns
    /// [applied_tick+1, applied_tick+duration], then the effect expires.
    ApplyEffect { kind: String, target_name: String, damage_per_turn: i32, duration_turns: u32 },
    /// Use an ability (e.g., "shield bash") against a target.
    UseAbility { ability_name: String, target_name: String },
    /// Read-only: display the player's character sheet (level, XP, stats).
    CharacterSheet,
    /// Consume a usable item from inventory (potion, elixir, etc.).
    UseItem { item_id: String },
    /// Start a conversation with an NPC in the current room.
    Talk { npc_id: String },
    /// Ask an NPC about a specific topic keyword.
    Ask { npc_id: String, topic: String },
    /// Accept a quest from an NPC in the current room.
    AcceptQuest { quest_id: String },
    /// View the player's current quest log.
    QuestLog,
    /// Browse a vendor NPC's shop inventory (read-only, no state change).
    Shop { npc_id: String },
    /// Purchase an item from a vendor NPC. Deducts gold from Wallet; adds item to inventory.
    Buy { npc_id: String, item_id: String },
    /// Wipe the engine to a clean slate — new game. Clears the event log so it
    /// is NOT a rewind; it's a true restart. Dead players use this to try again.
    Restart,
    /// Display available commands. Read-only; logged but replays as a no-op display.
    Help,
    /// Read the description of an item in the room or inventory. Read-only.
    Examine { item_id: String },
    /// Rest at an inn: pay 5 gold, restore HP to max. Requires an innkeeper in the room.
    Rest,
    /// Equip a weapon from inventory into the weapon slot.
    Equip { item_id: String },
    /// Remove the weapon from the weapon slot (returns to inventory conceptually).
    Unequip,
    /// Assemble a weapon from 3 parts (frame + mechanism + enhancement).
    Assemble { frame_id: String, mechanism_id: String, enhancement_id: String },
    /// Load a payload vial into the syringe spear. Item stays in inventory (reusable).
    Load { payload_id: String },
    /// Unload a payload vial from the syringe spear by item ID or partial name.
    Unload { payload_id: String },
    /// Dev shortcut: teleport the player to any room by id. Logged so time travel works.
    /// Usage: `dev goto <room_id>` — e.g. `dev goto trench_alpha`
    DevGoto { room_id: String },
    /// Dev shortcut: instantly mark a quest complete and set its WorldFlag, bypassing
    /// location checks and rewards. Unlocks chain gates so the next quest becomes available.
    /// Usage: `dev complete <quest_id>` — e.g. `dev complete morlak_intelligence`
    DevComplete { quest_id: String },
    /// Return a quest whose objective is met to the original NPC giver to collect rewards.
    /// Player must be in the giver's room. This is when rewards are actually awarded.
    TurnIn { quest_id: String },
    /// Advance game time to the next dusk (20:00) or dawn (06:00), whichever comes first.
    /// Passing the day into night unlocks Armistice-gated rooms and quests.
    Wait,
    /// Passes through to the UI as an error string; never appended to the event log.
    Unknown { raw: String },
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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextAction {
    /// Human-readable button label (e.g. "North", "Take Iron Key").
    pub label: String,
    /// Raw command string dispatched when this button is clicked.
    pub command: String,
}
