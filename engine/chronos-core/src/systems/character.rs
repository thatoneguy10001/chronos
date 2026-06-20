use bevy_ecs::prelude::*;
use crate::components::{AbilityCooldowns, Controllable, Experience, Health, Identity, InInventory, ItemBlueprint, Stats};
use crate::data::StaticRepository;
use crate::events::ContextAction;

pub struct SpawnResult {
    pub success: bool,
    pub narrative: String,
    pub context_actions: Vec<ContextAction>,
}

/// Imprint a character class onto the player body.
///
/// This is the Chronos-native rewrite of the Python `Character._apply_class_data`:
/// it does not create a new entity but stamps identity + stats onto the existing
/// `Controllable` body (bootstrap spawns exactly one) and resets `Health` to the
/// class's HP. Re-casting is allowed — a second `SpawnCharacter` just overwrites
/// the same components, so `become fighter` then `become hunter` reclasses cleanly.
pub fn process_spawn_character(
    world: &mut World,
    repo: &StaticRepository,
    class_id: &str,
    name: &str,
) -> SpawnResult {
    let class = match repo.class(class_id) {
        Ok(c) => c,
        Err(_) => {
            let known: Vec<String> = repo.all_classes()
                .filter(|c| c.tactics.is_empty())
                .map(|c| c.id.clone())
                .collect();
            let hint = if known.is_empty() {
                String::new()
            } else {
                format!(" Known classes: {}.", known.join(", "))
            };
            return SpawnResult {
                success: false,
                narrative: format!("Unknown class '{class_id}'.{hint}"),
                context_actions: vec![],
            };
        }
    };

    // Bootstrap guarantees exactly one Controllable entity — the player body.
    let mut q = world.query_filtered::<Entity, With<Controllable>>();
    let Some(player) = q.iter(world).next() else {
        return SpawnResult {
            success: false,
            narrative: "There is no body to inhabit.".to_string(),
            context_actions: vec![],
        };
    };

    let bs = &class.base_stats;
    // `insert` overwrites Health/Stats/Experience (and any prior values from a re-cast).
    // Experience resets on re-cast so you can't carry XP across classes by swapping.
    world.entity_mut(player).insert((
        Identity { name: name.to_string(), class_id: class.id.clone() },
        Stats {
            attack: bs.attack,
            defense: bs.defense,
            intelligence: bs.intelligence,
            hit: bs.hit,
            tech_attack: bs.tech_attack,
            evasion: bs.evasion,
            endurance: bs.endurance,
            luck: bs.luck,
            agility: bs.agility,
        },
        Health::full(bs.hp),
        Experience::new(),
        AbilityCooldowns::new(),
    ));

    let narrative = format!(
        "**{name}** the {} stands ready.\n\nHP {}/{}  \u{2022}  ATK {}  \u{2022}  DEF {}  \u{2022}  INT {}  \u{2022}  LVL 1\nHIT {}  \u{2022}  TECH ATK {}  \u{2022}  EVA {}  \u{2022}  TECH DEF {}  \u{2022}  LCK {}  \u{2022}  AGI {}",
        class.name, bs.hp, bs.hp, bs.attack, bs.defense, bs.intelligence,
        bs.hit, bs.tech_attack, bs.evasion, bs.endurance, bs.luck, bs.agility
    );

    // Auto-equip starting items that have no starting_room_id (they're personal kit,
    // not loot placed in the world). Items with a starting_room_id stay in that room.
    let mut gear_notes: Vec<String> = Vec::new();
    for item_id in &class.starting_equipment {
        if let Ok(template) = repo.item(item_id) {
            if template.starting_room_id.is_none() {
                world.spawn((
                    ItemBlueprint { id: item_id.clone() },
                    InInventory { owner: player },
                ));
                let stat = template.attributes.get("equip_stat").and_then(|v| v.as_str());
                let bonus = template.attributes.get("equip_bonus").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                if bonus != 0 {
                    if let Some(mut stats) = world.entity_mut(player).get_mut::<Stats>() {
                        match stat {
                            Some("attack")       => stats.attack += bonus,
                            Some("defense")      => stats.defense += bonus,
                            Some("intelligence") => stats.intelligence += bonus,
                            _ => {}
                        }
                    }
                    let label = match stat { Some("attack") => "ATK", Some("defense") => "DEF", Some("intelligence") => "INT", _ => "" };
                    gear_notes.push(format!("{} (+{} {})", template.name, bonus, label));
                }
            }
        }
    }

    let mut full_narrative = narrative;
    if !gear_notes.is_empty() {
        full_narrative.push_str(&format!("\n\nStarting kit: {}.", gear_notes.join(", ")));
    }

    SpawnResult { success: true, narrative: full_narrative, context_actions: vec![] }
}
