use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// World-level configuration loaded from `manifest.json` at startup.
/// Holds settings that aren't tied to any single room or item — most
/// importantly the canonical spawn point.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorldManifest {
    /// Room the player spawns in at world init. Must match a RoomTemplate id.
    pub start_room_id: String,
    /// Display title for the world (optional; not yet wired to the UI).
    #[serde(default)]
    pub title: Option<String>,
    /// Initial enemy placements. Each is (class blueprint → room) and is spawned
    /// at every bootstrap, so a rewind respawns enemies and replay re-fights them.
    #[serde(default)]
    pub encounters: Vec<EncounterDef>,
    /// NPC placements: where each NPC stands at world start. Unlike enemies, NPCs
    /// don't change state so these are never re-bootstrapped — just referenced.
    #[serde(default)]
    pub npc_placements: Vec<NpcPlacement>,
}

/// One enemy placement: spawn class `class_id` into room `room_id` at world init.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncounterDef {
    pub class_id: String,
    pub room_id: String,
}

/// One NPC placement: spawn NPC `npc_id` into room `room_id` at world init.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NpcPlacement {
    pub npc_id: String,
    pub room_id: String,
}

/// Immutable NPC blueprint. NPCs are purely data — no HP, no combat, no ECS components.
/// They live in the repository and are placed in rooms via the manifest's `npc_placements`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NpcTemplate {
    pub id: String,
    pub name: String,
    /// First thing the NPC says when the player talks to them.
    pub greeting: String,
    /// List of topics the player can ask about.
    #[serde(default)]
    pub dialogue: Vec<DialogueLine>,
    /// Whether this NPC sells items.
    #[serde(default)]
    pub vendor: bool,
    /// Whether this NPC offers resting (pay 5 gold, restore full HP).
    #[serde(default)]
    pub rest_provider: bool,
    /// Items this NPC sells, with prices in gold.
    #[serde(default)]
    pub shop: Vec<ShopItem>,
    /// Starting disposition with this NPC (0–100). Default 50 (Neutral).
    #[serde(default = "default_disposition")]
    pub initial_disposition: i32,
}

fn default_disposition() -> i32 { 50 }

/// One item in a vendor's shop inventory.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShopItem {
    pub item_id: String,
    pub price: i32,
}

/// One conversation branch: player says the keyword, NPC responds.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DialogueLine {
    /// The word the player types to trigger this line (e.g., "goblins", "quest").
    pub keyword: String,
    /// Short label shown in the context actions button (e.g., "the goblins").
    pub prompt: String,
    /// The NPC's full response text. Embed [[word]] to auto-generate follow-up ask actions.
    pub response: String,
    /// If set, the player must have already asked this keyword before this topic appears.
    #[serde(default)]
    pub requires_topic: Option<String>,
    /// Minimum NPC disposition required to see this topic (0 = always visible).
    #[serde(default)]
    pub min_disposition: i32,
    /// How much this topic shifts the player's disposition with this NPC (can be negative).
    #[serde(default)]
    pub disposition_delta: i32,
    /// Quest IDs that must ALL have been turned in before this topic appears.
    /// Accepts a single string "id" or an array ["id1","id2"] in JSON — both are valid.
    #[serde(default, deserialize_with = "deserialize_string_or_vec")]
    pub requires_quest_complete: Vec<String>,
}

/// Immutable blueprint loaded from JSON at startup. Never modified at runtime.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ItemTemplate {
    pub id: String,
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub starting_room_id: Option<String>,
    #[serde(default = "default_true")]
    pub takeable: bool,
    #[serde(default)]
    pub attributes: HashMap<String, serde_json::Value>,
    #[serde(default)]
    pub tags: Vec<String>,
}

/// Immutable blueprint for a world location. Never modified at runtime.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoomTemplate {
    pub id: String,
    pub name: String,
    pub description: String,
    /// Keyed by canonical direction string (north, south, east, west, up, down).
    pub exits: HashMap<String, ExitDefinition>,
    #[serde(default)]
    pub requirements: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExitDefinition {
    pub target_room_id: String,
    #[serde(default)]
    pub label: Option<String>,
    /// Item ID required in player inventory to traverse this exit.
    #[serde(default)]
    pub requirement: Option<String>,
    #[serde(default)]
    pub locked_message: Option<String>,
    /// If true, this exit is only passable during the Armistice (game_time.is_night()).
    #[serde(default)]
    pub requires_night: bool,
}

/// How an ability selects its targets.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum TargetingType {
    /// One enemy named in the command (default).
    #[default]
    Single,
    /// All living enemies in the player's room.
    Aoe,
    /// The caster only (heals, buffs).
    Caster,
    /// All allies (future — currently acts as Caster).
    AllAllies,
}

/// An ability a class can use: attack, shield bash, fireball, etc.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AbilityTemplate {
    pub id: String,
    pub name: String,
    pub description: String,
    /// Base damage dealt by this ability (added to caster's attack stat). 0 = no damage hit.
    pub base_damage: i32,
    /// Status effect applied on hit: "poison", "burn", "bleed", "corrode", etc. None = no effect.
    #[serde(default)]
    pub applies_effect: Option<String>,
    /// Magnitude passed to the effect (damage per turn for DoTs; stat delta for buff/debuff).
    #[serde(default)]
    pub effect_damage: i32,
    /// Duration in turns for the applied effect.
    #[serde(default)]
    pub effect_duration: u32,
    /// HP restored to the caster when this ability is used. 0 = no heal.
    #[serde(default)]
    pub heal_amount: i32,
    /// Number of hits to deal. Default 1.
    #[serde(default = "default_hit_count")]
    pub hit_count: u32,
    /// Turns between uses. 0 = no cooldown. Checked against AbilityCooldowns component.
    #[serde(default)]
    pub cooldown: u32,
    /// Player level required to use this ability. Default 1 (always available).
    #[serde(default = "default_unlock_level")]
    pub unlock_level: u32,
    /// How the ability selects targets.
    #[serde(default)]
    pub targeting: TargetingType,
}

fn default_hit_count() -> u32 { 1 }
fn default_unlock_level() -> u32 { 1 }

/// Immutable blueprint for a playable (or, later, enemy) character class.
/// Rewritten from the Python RPG's `*_DATA` dicts (see `characters/impl/classes.py`).
/// Carries everything a class defines; `SpawnCharacter` reads `base_stats` to
/// imprint a body.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClassTemplate {
    pub id: String,
    pub name: String,
    pub description: String,
    pub base_stats: BaseStats,
    #[serde(default)]
    pub abilities: Vec<AbilityTemplate>,
    #[serde(default)]
    pub passives: Vec<String>,
    #[serde(default)]
    pub starting_equipment: Vec<String>,
    /// XP awarded to the killer when an entity of this class is defeated.
    #[serde(default = "default_xp_reward")]
    pub xp_reward: i32,
    /// Gold dropped by an enemy of this class on death.
    #[serde(default)]
    pub gold_reward: i32,
    /// Combat AI rules evaluated top-to-bottom each round. First matching condition wins.
    /// Falls back to a plain basic attack if no rule matches.
    #[serde(default)]
    pub tactics: Vec<TacticRule>,
}

// --- Tactic system ---

/// One combat AI rule: if `condition` is true, execute `action`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TacticRule {
    pub condition: TacticCondition,
    pub action: TacticAction,
}

/// When a tactic fires.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum TacticCondition {
    /// Always fires — use as the last rule to guarantee a fallback.
    Always,
    /// Enemy's current HP is below this fraction of max (e.g. 0.4 = 40%).
    HpBelow { threshold: f32 },
    /// Player's current HP is above this fraction of their max.
    PlayerHpAbove { threshold: f32 },
    /// The player does NOT have a specific effect active (prevents re-applying).
    PlayerEffectAbsent { kind: String },
}

/// What the enemy does when a tactic fires.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum TacticAction {
    /// Normal melee swing — uses 1 RNG draw.
    BasicAttack,
    /// Empowered hit: damage = (atk * multiplier) - def + rng(-1,1). Uses 1 RNG draw.
    HeavyAttack { multiplier: f32 },
    /// Apply a status effect to the player. Deterministic — no RNG draw.
    ApplyEffect { kind: String, damage: i32, duration: u32 },
}

/// The numeric starting block of a class. `hp` seeds `Health`; the rest seed `Stats`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BaseStats {
    pub hp: i32,
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
}

/// A quest the player can accept and complete.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestTemplate {
    pub id: String,
    pub name: String,
    pub description: String,
    pub objective: QuestObjective,
    pub gold_reward: i32,
    pub xp_reward: i32,
    /// Which NPC grants this quest (must be in player's room to accept).
    pub giver_npc_id: String,
    /// Flavour text shown on acceptance.
    #[serde(default)]
    pub accept_text: String,
    /// Flavour text shown on completion.
    #[serde(default)]
    pub complete_text: String,
    /// Quest IDs that must ALL be turned in before this quest appears for acceptance.
    /// Accepts a single string "id" or an array ["id1","id2"] in JSON — both are valid.
    #[serde(default, deserialize_with = "deserialize_string_or_vec")]
    pub requires_quest_complete: Vec<String>,
    /// If true, this quest can only be accepted during the Armistice (game_time.is_night()).
    #[serde(default)]
    pub requires_night: bool,
    /// Hope points awarded to the player when this quest is turned in.
    #[serde(default)]
    pub hope_reward: i32,
}

/// What the player must do to complete a quest.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum QuestObjective {
    /// Kill `count` enemies of the given class.
    KillCount { class_id: String, count: i32 },
    /// Reach a specific room (exploration / scouting objective).
    ReachRoom { room_id: String },
    /// Talk to a specific NPC (investigation / story objective).
    TalkTo { npc_id: String },
}

fn default_true() -> bool {
    true
}

fn default_xp_reward() -> i32 {
    10
}

/// Deserializes `requires_quest_complete` from either a bare string or an array.
/// Absent / null → empty Vec (no requirement).
/// `"quest_id"` → `["quest_id"]`.
/// `["a", "b"]` → `["a", "b"]` (ALL must be complete).
fn deserialize_string_or_vec<'de, D>(d: D) -> Result<Vec<String>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    use serde_json::Value;
    let v = Value::deserialize(d)?;
    match v {
        Value::Null => Ok(vec![]),
        Value::String(s) => Ok(vec![s]),
        Value::Array(arr) => arr
            .into_iter()
            .map(|x| {
                x.as_str()
                    .map(|s| s.to_owned())
                    .ok_or_else(|| serde::de::Error::custom("array entries must be strings"))
            })
            .collect(),
        other => Err(serde::de::Error::custom(format!(
            "expected string, array, or null for requires_quest_complete, got {}",
            other
        ))),
    }
}
