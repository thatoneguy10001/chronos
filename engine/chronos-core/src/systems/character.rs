//! Character creation and reclassing.
//!
//! The engine uses a single persistent `Controllable` entity (spawned at
//! bootstrap) as the player body. `process_spawn_character` stamps a class
//! onto that body — setting `Identity`, `Stats`, `Health`, and
//! `AbilityCooldowns` — rather than spawning a fresh entity. This means
//! reclassing (`become hunter` after `become fighter`) just overwrites the
//! components in place, keeping inventory and position unchanged.

use crate::components::{
    stat_abbrev, AbilityCooldowns, Controllable, Experience, Health, Identity, InInventory,
    ItemBlueprint, Stats,
};
use crate::data::schemas::PassiveEffect;
use crate::data::StaticRepository;
use crate::events::ContextAction;
use bevy_ecs::prelude::*;

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
            let known: Vec<String> = repo
                .all_classes()
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
    // Stats come straight from the class's flattened stat map, so a world-defined
    // stat the engine has never heard of is carried onto the body unchanged.
    world.entity_mut(player).insert((
        Identity {
            name: name.to_string(),
            class_id: class.id.clone(),
        },
        Stats::from_map(bs.stats.clone()),
        Health::full(bs.hp),
        Experience::new(),
        AbilityCooldowns::new(),
    ));

    // Apply this class's OnSpawn passives: flat stat bonuses baked onto the body.
    // Done before gear so the final stat readback below reflects them. Other
    // passive kinds (e.g. DamageOnHit) are read live during combat, not here.
    for effect in repo.class_passive_effects(&class.id) {
        if let PassiveEffect::StatBonus { stat, amount } = effect {
            if let Some(mut stats) = world.entity_mut(player).get_mut::<Stats>() {
                stats.add(stat, *amount);
            }
        }
    }

    // Auto-equip starting items that have no starting_room_id (they're personal kit,
    // not loot placed in the world). Items with a starting_room_id stay in that room.
    let mut gear_notes: Vec<String> = Vec::new();
    for item_id in &class.starting_equipment {
        if let Ok(template) = repo.item(item_id) {
            if template.starting_room_id.is_none() {
                world.spawn((
                    ItemBlueprint {
                        id: item_id.clone(),
                    },
                    InInventory { owner: player },
                ));
                let stat = template
                    .attributes
                    .get("equip_stat")
                    .and_then(|v| v.as_str());
                let bonus = template
                    .attributes
                    .get("equip_bonus")
                    .and_then(|v| v.as_i64())
                    .unwrap_or(0) as i32;
                if bonus != 0 {
                    if let Some(stat_key) = stat {
                        if let Some(mut stats) = world.entity_mut(player).get_mut::<Stats>() {
                            // Any stat key works now, not just the three hardcoded ones.
                            stats.add(stat_key, bonus);
                        }
                        let label = stat_abbrev(stat_key);
                        gear_notes.push(format!("{} (+{} {})", template.name, bonus, label));
                    }
                }
            }
        }
    }

    // Read back live stats after gear bonuses have been applied.
    let (
        final_atk,
        final_def,
        final_int,
        final_hit,
        final_tech,
        final_eva,
        final_end,
        final_lck,
        final_agi,
    ) = world
        .entity(player)
        .get::<Stats>()
        .map(|s| {
            (
                s.attack(),
                s.defense(),
                s.intelligence(),
                s.hit(),
                s.tech_attack(),
                s.evasion(),
                s.endurance(),
                s.luck(),
                s.agility(),
            )
        })
        .unwrap_or((
            bs.get("attack"),
            bs.get("defense"),
            bs.get("intelligence"),
            bs.get("hit"),
            bs.get("tech_attack"),
            bs.get("evasion"),
            bs.get("endurance"),
            bs.get("luck"),
            bs.get("agility"),
        ));

    let secondary: Vec<String> = [
        ("HIT", final_hit),
        ("TECH ATK", final_tech),
        ("EVA", final_eva),
        ("TECH DEF", final_end),
        ("LCK", final_lck),
        ("AGI", final_agi),
    ]
    .iter()
    .filter(|(_, v)| *v != 0)
    .map(|(l, v)| format!("{} {}", l, v))
    .collect();
    let secondary_line = if secondary.is_empty() {
        String::new()
    } else {
        format!("\n{}", secondary.join("  \u{2022}  "))
    };
    let narrative = format!(
        "**{name}** the {} stands ready.\n\nHP {}/{}  \u{2022}  ATK {}  \u{2022}  DEF {}  \u{2022}  INT {}  \u{2022}  LVL 1{}",
        class.name, bs.hp, bs.hp, final_atk, final_def, final_int,
        secondary_line
    );

    let mut full_narrative = narrative;
    if !gear_notes.is_empty() {
        full_narrative.push_str(&format!("\n\nStarting kit: {}.", gear_notes.join(", ")));
    }

    // List the class's passives by name so the player knows what traits they have.
    let passive_names: Vec<&str> = class
        .passives
        .iter()
        .filter_map(|pid| repo.passive(pid))
        .map(|p| p.name.as_str())
        .collect();
    if !passive_names.is_empty() {
        full_narrative.push_str(&format!("\n\nPassives: {}.", passive_names.join(", ")));
    }

    SpawnResult {
        success: true,
        narrative: full_narrative,
        context_actions: vec![],
    }
}
