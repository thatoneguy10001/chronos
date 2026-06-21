//! Input parsing — raw string → `EngineEvent`.
//!
//! `parse()` is the single choke-point between the UI and the engine. All text
//! normalization (direction aliases, verb synonyms, space→underscore for IDs)
//! happens here. Nothing downstream ever sees a raw string.
//!
//! Adding a new command means: add an `EngineEvent` variant, add a match arm
//! here, and add a handler arm in `lib.rs::apply_event`.

use crate::events::EngineEvent;

/// Aliases for movement directions — normalizes synonyms before routing.
const DIRECTION_ALIASES: &[(&str, &str)] = &[
    ("n", "north"), ("s", "south"), ("e", "east"), ("w", "west"),
    ("u", "up"), ("d", "down"),
    ("ne", "northeast"), ("nw", "northwest"), ("se", "southeast"), ("sw", "southwest"),
];

/// Parse a raw input string into a typed EngineEvent.
/// This is the only place in the codebase that touches raw strings from the UI.
pub fn parse(raw: &str) -> EngineEvent {
    let input = raw.trim().to_lowercase();
    let tokens: Vec<&str> = input.split_whitespace().collect();

    if tokens.is_empty() {
        return EngineEvent::Unknown { raw: raw.to_string() };
    }

    match tokens[0] {
        // Movement
        "go" | "move" | "walk" | "run" if tokens.len() >= 2 => {
            EngineEvent::Move { direction: normalize_direction(tokens[1]) }
        }
        // Bare direction words
        word if is_direction(word) => {
            EngineEvent::Move { direction: normalize_direction(word) }
        }

        // Pick up
        "take" | "pick" | "grab" | "get" => {
            let item_fragment = if tokens[0] == "pick" && tokens.get(1) == Some(&"up") {
                tokens[2..].join(" ")
            } else {
                tokens[1..].join(" ")
            };
            if item_fragment.is_empty() {
                EngineEvent::Unknown { raw: raw.to_string() }
            } else {
                EngineEvent::PickUp { item_id: item_fragment }
            }
        }

        // Drop
        "drop" | "put" | "place" => {
            let item_fragment = tokens[1..].join(" ");
            if item_fragment.is_empty() {
                EngineEvent::Unknown { raw: raw.to_string() }
            } else {
                EngineEvent::Drop { item_id: item_fragment }
            }
        }

        // Character creation: "become fighter Aragorn" / "play fighter" / "create fighter Bob"
        "become" | "play" | "create" if tokens.len() >= 2 => {
            let class_id = tokens[1].to_string();
            // Pull the name from the ORIGINAL (non-lowercased) input so "Aragorn"
            // keeps its capitalization. Default to "Hero" when no name is given.
            let raw_tokens: Vec<&str> = raw.trim().split_whitespace().collect();
            let name = if raw_tokens.len() >= 3 {
                raw_tokens[2..].join(" ")
            } else {
                "Hero".to_string()
            };
            EngineEvent::SpawnCharacter { class_id, name }
        }

        // Combat
        "attack" | "fight" | "hit" | "kill" | "strike" => EngineEvent::Attack,

        // --- Abilities ---
        // Generic: "use ability <name> [target]" / "ability <name> [target]"
        "ability" | "use_ability" if tokens.len() >= 2 => {
            let (ability_name, target_name) = split_ability_target(&tokens[1..]);
            EngineEvent::UseAbility { ability_name, target_name }
        }

        // Two-word ability shortcuts (must come before single-word fallbacks)
        "shield" if tokens.get(1).copied() == Some("bash") => EngineEvent::UseAbility {
            ability_name: "shield bash".to_string(),
            target_name: tokens.get(2).copied().unwrap_or("enemy").to_string(),
        },
        "shield" if tokens.get(1).copied() == Some("fortify") => EngineEvent::UseAbility {
            ability_name: "shield fortify".to_string(),
            target_name: "self".to_string(),
        },
        "healing" if tokens.get(1).copied() == Some("touch") => EngineEvent::UseAbility {
            ability_name: "healing touch".to_string(),
            target_name: "self".to_string(),
        },
        "whirlwind" if tokens.get(1).copied() == Some("slash") => EngineEvent::UseAbility {
            ability_name: "whirlwind slash".to_string(),
            target_name: tokens.get(2).copied().unwrap_or("enemy").to_string(),
        },
        "septic" if tokens.get(1).copied() == Some("strike") => EngineEvent::UseAbility {
            ability_name: "septic strike".to_string(),
            target_name: tokens.get(2).copied().unwrap_or("enemy").to_string(),
        },
        "steam" if tokens.get(1).copied() == Some("smash") => EngineEvent::UseAbility {
            ability_name: "steam smash".to_string(),
            target_name: tokens.get(2).copied().unwrap_or("enemy").to_string(),
        },
        "fortress" if tokens.get(1).copied() == Some("stance") => EngineEvent::UseAbility {
            ability_name: "fortress stance".to_string(),
            target_name: tokens.get(2).copied().unwrap_or("enemy").to_string(),
        },
        "seismic" if tokens.get(1).copied() == Some("slam") => EngineEvent::UseAbility {
            ability_name: "seismic slam".to_string(),
            target_name: tokens.get(2).copied().unwrap_or("enemy").to_string(),
        },
        "frag" if tokens.get(1).copied() == Some("grenade") => EngineEvent::UseAbility {
            ability_name: "frag grenade".to_string(),
            target_name: tokens.get(2).copied().unwrap_or("enemy").to_string(),
        },
        "cluster" if tokens.get(1).copied() == Some("bomb") => EngineEvent::UseAbility {
            ability_name: "cluster bomb".to_string(),
            target_name: tokens.get(2).copied().unwrap_or("enemy").to_string(),
        },
        "incendiary" if tokens.get(1).copied() == Some("round") => EngineEvent::UseAbility {
            ability_name: "incendiary round".to_string(),
            target_name: tokens.get(2).copied().unwrap_or("enemy").to_string(),
        },
        "power" if tokens.get(1).copied() == Some("punch") => EngineEvent::UseAbility {
            ability_name: "power punch".to_string(),
            target_name: tokens.get(2).copied().unwrap_or("enemy").to_string(),
        },
        "revolver" if tokens.get(1).copied() == Some("shot") => EngineEvent::UseAbility {
            ability_name: "revolver shot".to_string(),
            target_name: tokens.get(2).copied().unwrap_or("enemy").to_string(),
        },
        "suppression" if tokens.get(1).copied() == Some("fire") => EngineEvent::UseAbility {
            ability_name: "suppression fire".to_string(),
            target_name: tokens.get(2).copied().unwrap_or("enemy").to_string(),
        },
        "field" if tokens.get(1).copied() == Some("repairs") => EngineEvent::UseAbility {
            ability_name: "field repairs".to_string(),
            target_name: "self".to_string(),
        },
        "syringe" if tokens.get(1).copied() == Some("lunge") => EngineEvent::UseAbility {
            ability_name: "syringe lunge".to_string(),
            target_name: tokens.get(2).copied().unwrap_or("enemy").to_string(),
        },
        "acid" if tokens.get(1).copied() == Some("stream") => EngineEvent::UseAbility {
            ability_name: "acid stream".to_string(),
            target_name: tokens.get(2).copied().unwrap_or("enemy").to_string(),
        },
        "hemotoxin" if tokens.get(1).copied() == Some("impale") => EngineEvent::UseAbility {
            ability_name: "hemotoxin impale".to_string(),
            target_name: tokens.get(2).copied().unwrap_or("enemy").to_string(),
        },
        "antitoxin" if tokens.get(1).copied() == Some("jab") => EngineEvent::UseAbility {
            ability_name: "antitoxin jab".to_string(),
            target_name: tokens.get(2).copied().unwrap_or("self").to_string(),
        },
        "hemostatic" if tokens.get(1).copied() == Some("jab") => EngineEvent::UseAbility {
            ability_name: "hemostatic jab".to_string(),
            target_name: tokens.get(2).copied().unwrap_or("self").to_string(),
        },
        "field" if tokens.get(1).copied() == Some("sutures") => EngineEvent::UseAbility {
            ability_name: "field sutures".to_string(),
            target_name: tokens.get(2).copied().unwrap_or("self").to_string(),
        },
        "adrenaline" if tokens.get(1).copied() == Some("injection") => EngineEvent::UseAbility {
            ability_name: "adrenaline injection".to_string(),
            target_name: "self".to_string(),
        },
        "aimed" if tokens.get(1).copied() == Some("shot") => EngineEvent::UseAbility {
            ability_name: "aimed shot".to_string(),
            target_name: tokens.get(2).copied().unwrap_or("enemy").to_string(),
        },
        "rapid" if tokens.get(1).copied() == Some("fire") => EngineEvent::UseAbility {
            ability_name: "rapid fire".to_string(),
            target_name: tokens.get(2).copied().unwrap_or("enemy").to_string(),
        },
        "suppression" if tokens.get(1).copied() == Some("shot") => EngineEvent::UseAbility {
            ability_name: "suppression shot".to_string(),
            target_name: tokens.get(2).copied().unwrap_or("enemy").to_string(),
        },

        // Vanguard abilities
        "trench" if tokens.get(1).copied() == Some("charge") => EngineEvent::UseAbility {
            ability_name: "trench charge".to_string(),
            target_name: tokens.get(2).copied().unwrap_or("enemy").to_string(),
        },
        "iron" if tokens.get(1).copied() == Some("press") => EngineEvent::UseAbility {
            ability_name: "iron press".to_string(),
            target_name: tokens.get(2).copied().unwrap_or("enemy").to_string(),
        },
        "bulwark" if tokens.get(1).copied() == Some("stance") => EngineEvent::UseAbility {
            ability_name: "bulwark stance".to_string(),
            target_name: tokens.get(2).copied().unwrap_or("self").to_string(),
        },
        "bayonet" if tokens.get(1).copied() == Some("drive") => EngineEvent::UseAbility {
            ability_name: "bayonet drive".to_string(),
            target_name: tokens.get(2).copied().unwrap_or("enemy").to_string(),
        },

        // Single-word ability shortcuts
        "overcharge" => EngineEvent::UseAbility {
            ability_name: "overcharge".to_string(),
            target_name: tokens.get(1).copied().unwrap_or("enemy").to_string(),
        },
        "surgical" => EngineEvent::UseAbility {
            ability_name: "surgical strike".to_string(),
            target_name: tokens.get(1).copied().unwrap_or("enemy").to_string(),
        },
        "poison" if tokens.get(1).copied() == Some("cloud") => EngineEvent::UseAbility {
            ability_name: "poison cloud".to_string(),
            target_name: tokens.get(2).copied().unwrap_or("enemy").to_string(),
        },

        // Generic effect application: "apply_effect <kind> <target> [magnitude] [duration]"
        "apply_effect" | "effect" if tokens.len() >= 3 => EngineEvent::ApplyEffect {
            kind: tokens[1].to_string(),
            target_name: tokens[2].to_string(),
            damage_per_turn: tokens.get(3).and_then(|s| s.parse().ok()).unwrap_or(2),
            duration_turns: tokens.get(4).and_then(|s| s.parse().ok()).unwrap_or(3),
        },

        // Debug effect commands (poison cloud is guarded above; these are bare-word fallbacks)
        "poison" => EngineEvent::ApplyEffect {
            kind: "poison".to_string(),
            target_name: tokens.get(1).copied().unwrap_or("goblin").to_string(),
            damage_per_turn: 2,
            duration_turns: 3,
        },
        "burn" => EngineEvent::ApplyEffect {
            kind: "burn".to_string(),
            target_name: tokens.get(1).copied().unwrap_or("goblin").to_string(),
            damage_per_turn: 3,
            duration_turns: 2,
        },
        "bleed" => EngineEvent::ApplyEffect {
            kind: "bleed".to_string(),
            target_name: tokens.get(1).copied().unwrap_or("goblin").to_string(),
            damage_per_turn: 2,
            duration_turns: 4,
        },
        "corrode" => EngineEvent::ApplyEffect {
            kind: "corrode".to_string(),
            target_name: tokens.get(1).copied().unwrap_or("goblin").to_string(),
            damage_per_turn: 3,
            duration_turns: 3,
        },
        "blind" => EngineEvent::ApplyEffect {
            kind: "blind".to_string(),
            target_name: tokens.get(1).copied().unwrap_or("goblin").to_string(),
            damage_per_turn: 10,
            duration_turns: 2,
        },
        "stun" => EngineEvent::ApplyEffect {
            kind: "stun".to_string(),
            target_name: tokens.get(1).copied().unwrap_or("goblin").to_string(),
            damage_per_turn: 0,
            duration_turns: 1,
        },

        // Talk to NPC: "talk innkeeper" / "talk to innkeeper" / "speak innkeeper"
        "talk" | "speak" | "greet" => {
            let rest = if tokens.get(1).copied() == Some("to") {
                tokens[2..].join(" ")
            } else {
                tokens[1..].join(" ")
            };
            if rest.is_empty() {
                EngineEvent::Unknown { raw: raw.to_string() }
            } else {
                EngineEvent::Talk { npc_id: rest.replace(' ', "_") }
            }
        }

        // Ask NPC about topic: "ask innkeeper goblins" / "ask innkeeper about goblins"
        "ask" => {
            let rest: Vec<&str> = if tokens.get(2).copied() == Some("about") {
                [&tokens[1..2], &tokens[3..]].concat()
            } else {
                tokens[1..].to_vec()
            };
            if rest.len() < 2 {
                EngineEvent::Unknown { raw: raw.to_string() }
            } else {
                EngineEvent::Ask {
                    npc_id: rest[0].to_string(),
                    topic: rest[1..].join(" "),
                }
            }
        }

        // Use item
        "use" | "drink" | "consume" | "quaff" => {
            let item_fragment = tokens[1..].join(" ");
            if item_fragment.is_empty() {
                EngineEvent::Unknown { raw: raw.to_string() }
            } else {
                EngineEvent::UseItem { item_id: item_fragment }
            }
        }

        // Accept quest: "accept goblin_hunt" / "accept quest goblin_hunt"
        "accept" | "take quest" => {
            let rest = tokens[1..].join("_");
            if rest.is_empty() {
                EngineEvent::Unknown { raw: raw.to_string() }
            } else {
                EngineEvent::AcceptQuest { quest_id: rest }
            }
        }

        // Quest log: "quests" / "journal" / "quest"
        "quests" | "journal" | "quest" => EngineEvent::QuestLog,

        // Browse vendor shop: "shop innkeeper" / "browse innkeeper" / "wares innkeeper"
        "shop" | "browse" | "wares" | "vendor" => {
            let rest = tokens[1..].join("_");
            if rest.is_empty() {
                EngineEvent::Unknown { raw: raw.to_string() }
            } else {
                EngineEvent::Shop { npc_id: rest }
            }
        }

        // Buy item from vendor: "buy innkeeper health_potion"
        "buy" | "purchase" => {
            if tokens.len() < 3 {
                EngineEvent::Unknown { raw: raw.to_string() }
            } else {
                EngineEvent::Buy {
                    npc_id: tokens[1].to_string(),
                    item_id: tokens[2..].join("_"),
                }
            }
        }

        // Equip / unequip weapon
        "equip" | "wield" | "wear" if tokens.len() >= 2 => {
            EngineEvent::Equip { item_id: tokens[1..].join(" ") }
        }
        "unequip" | "remove" | "unwield" => EngineEvent::Unequip,

        // Load / unload payload vials into syringe spear
        "load" | "slot" if tokens.len() >= 2 => EngineEvent::Load { payload_id: tokens[1..].join(" ") },
        "unload" | "eject" if tokens.len() >= 2 => EngineEvent::Unload { payload_id: tokens[1..].join(" ") },

        // Assemble weapon from parts: "assemble <frame> <mech> <enhance>"
        "assemble" | "craft" | "combine" if tokens.len() >= 4 => {
            EngineEvent::Assemble {
                frame_id: tokens[1].to_string(),
                mechanism_id: tokens[2].to_string(),
                enhancement_id: tokens[3].to_string(),
            }
        }

        // Turn in quest: "turn in <quest_id>" / "hand in <quest_id>" / "deliver <quest_id>"
        "turn" if tokens.get(1).copied() == Some("in") => {
            let quest_id = tokens[2..].join("_");
            if quest_id.is_empty() {
                EngineEvent::Unknown { raw: raw.to_string() }
            } else {
                EngineEvent::TurnIn { quest_id }
            }
        }
        "hand" if tokens.get(1).copied() == Some("in") => {
            let quest_id = tokens[2..].join("_");
            if quest_id.is_empty() {
                EngineEvent::Unknown { raw: raw.to_string() }
            } else {
                EngineEvent::TurnIn { quest_id }
            }
        }
        "deliver" if tokens.len() >= 2 => {
            EngineEvent::TurnIn { quest_id: tokens[1..].join("_") }
        }

        // Rest at inn
        "rest" | "sleep" | "camp" => EngineEvent::Rest,

        // Wait: advance time to next dusk or dawn (Armistice gating)
        "wait" | "pass time" | "wait for night" | "wait until dark" | "wait until dusk"
        | "wait for dawn" | "wait until dawn" | "wait until morning" => EngineEvent::Wait,

        // Help
        "help" | "?" | "commands" | "h" => EngineEvent::Help,

        // Dev commands: only active when first token is "dev"
        "dev" => match tokens.get(1).copied() {
            Some("goto") | Some("go") => {
                let room_id = tokens.get(2).copied().unwrap_or("").to_string();
                if room_id.is_empty() {
                    EngineEvent::Unknown { raw: raw.to_string() }
                } else {
                    EngineEvent::DevGoto { room_id }
                }
            }
            Some("complete") => {
                let quest_id = tokens[2..].join("_");
                if quest_id.is_empty() {
                    EngineEvent::Unknown { raw: raw.to_string() }
                } else {
                    EngineEvent::DevComplete { quest_id }
                }
            }
            _ => EngineEvent::Unknown { raw: raw.to_string() },
        },

        // Restart / new game
        "restart" | "new" | "respawn" => EngineEvent::Restart,

        // Character sheet
        "stats" | "sheet" | "level" | "xp" | "status" => EngineEvent::CharacterSheet,

        // Examine item: "examine iron sword" / "look at iron sword"
        "look" if tokens.get(1).copied() == Some("at") && tokens.len() >= 3 => {
            EngineEvent::Examine { item_id: tokens[2..].join(" ") }
        }
        "examine" | "x" | "inspect" if tokens.len() >= 2 => {
            EngineEvent::Examine { item_id: tokens[1..].join(" ") }
        }

        // Look
        "look" | "l" | "examine" | "x" | "inspect" => EngineEvent::Look,

        // Inventory
        "inventory" | "inv" | "i" | "items" => EngineEvent::Inventory,

        _ => EngineEvent::Unknown { raw: raw.to_string() },
    }
}

/// Split `["power", "punch", "rust_scavenger"]` into ("power punch", "rust_scavenger").
/// Last token is the target if there are 2+ tokens and it isn't a known ability word.
/// Falls back to "enemy" when no target is found.
fn split_ability_target(tokens: &[&str]) -> (String, String) {
    // Treat all tokens as the ability name; target defaults to "enemy".
    // The explicit per-ability shortcuts above handle targets when needed.
    (tokens.join(" "), "enemy".to_string())
}

fn normalize_direction(word: &str) -> String {
    DIRECTION_ALIASES
        .iter()
        .find(|(alias, _)| *alias == word)
        .map(|(_, full)| full.to_string())
        .unwrap_or_else(|| word.to_string())
}

fn is_direction(word: &str) -> bool {
    let canonical = ["north", "south", "east", "west", "up", "down",
                     "northeast", "northwest", "southeast", "southwest"];
    canonical.contains(&word)
        || DIRECTION_ALIASES.iter().any(|(alias, _)| *alias == word)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bare_direction_shorthand() {
        assert_eq!(parse("n"), EngineEvent::Move { direction: "north".into() });
        assert_eq!(parse("go south"), EngineEvent::Move { direction: "south".into() });
    }

    #[test]
    fn pick_up_variants() {
        assert!(matches!(parse("take iron key"), EngineEvent::PickUp { .. }));
        assert!(matches!(parse("pick up torch"), EngineEvent::PickUp { .. }));
        assert!(matches!(parse("grab sword"), EngineEvent::PickUp { .. }));
    }

    #[test]
    fn look_aliases() {
        assert_eq!(parse("l"), EngineEvent::Look);
        assert_eq!(parse("examine"), EngineEvent::Look);
    }

    #[test]
    fn inventory_aliases() {
        assert_eq!(parse("i"), EngineEvent::Inventory);
        assert_eq!(parse("inventory"), EngineEvent::Inventory);
    }
}
