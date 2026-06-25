//! Interaction system — item pickup, drop, use, and inventory display.
//!
//! Items in the world are ECS entities with a `Position` component.
//! Picking up an item removes `Position` and inserts `InInventory { owner }`.
//! Dropping reverses this. Using an item reads its `use_effect` attribute from
//! the `StaticRepository` and applies it (heal, stat buff, apply DoT, etc.).
//!
//! Item matching is fuzzy: the player can type a name fragment ("health pot")
//! and the system matches against both the template ID and the display name.

use crate::components::{
    ActiveEffects, AssembledWeapon, Controllable, EffectKind, Health, InInventory, ItemBlueprint,
    Position, Stats,
};
use crate::data::StaticRepository;
use crate::events::ContextAction;
use crate::systems::poison;
use bevy_ecs::prelude::*;

pub struct InteractionResult {
    pub success: bool,
    pub narrative: String,
    pub inventory_ids: Vec<String>,
    pub context_actions: Vec<ContextAction>,
}

/// Attempt to pick up an item by name fragment or ID.
/// On success: removes Position from the item, inserts InInventory { owner: player }.
pub fn process_pick_up(
    world: &mut World,
    repo: &StaticRepository,
    item_fragment: &str,
) -> InteractionResult {
    let mut player_query = world.query_filtered::<(Entity, &Position), With<Controllable>>();
    let (player_entity, player_room) = match player_query.iter(world).next() {
        Some((e, pos)) => (e, pos.room_id.clone()),
        None => return error_result("No player found.", world),
    };

    // Find matching item entity in the same room
    let mut item_query = world.query::<(Entity, &Position, &ItemBlueprint)>();
    let match_result = item_query.iter(world).find_map(|(entity, pos, bp)| {
        if pos.room_id != player_room {
            return None;
        }
        let template = repo.item(&bp.id).ok()?;
        let matches = template.id.contains(item_fragment)
            || template.name.to_lowercase().contains(item_fragment);
        if matches {
            Some((
                entity,
                bp.id.clone(),
                template.name.clone(),
                template.takeable,
            ))
        } else {
            None
        }
    });

    let (item_entity, item_id, item_name, takeable) = match match_result {
        Some(r) => r,
        None => {
            return InteractionResult {
                success: false,
                narrative: format!("You don't see any '{item_fragment}' here."),
                inventory_ids: get_inventory(world, player_entity, repo),
                context_actions: pick_up_actions_in_room(world, &player_room, repo),
            }
        }
    };

    if !takeable {
        return InteractionResult {
            success: false,
            narrative: format!("You can't pick up the {item_name}."),
            inventory_ids: get_inventory(world, player_entity, repo),
            context_actions: pick_up_actions_in_room(world, &player_room, repo),
        };
    }

    // Transfer: remove Position, add InInventory
    world
        .entity_mut(item_entity)
        .remove::<Position>()
        .insert(InInventory {
            owner: player_entity,
        });

    // Apply passive equipment bonus if item has equip_stat/equip_bonus attributes.
    let equip_note = apply_equip_bonus(world, repo, &item_id, player_entity, 1);

    InteractionResult {
        success: true,
        narrative: format!("You pick up the {item_name}.{equip_note}"),
        inventory_ids: get_inventory(world, player_entity, repo),
        context_actions: vec![ContextAction {
            label: format!("Drop {item_name}"),
            command: format!("drop {item_id}"),
        }],
    }
}

/// Drop an item from inventory into the player's current room.
pub fn process_drop(
    world: &mut World,
    repo: &StaticRepository,
    item_fragment: &str,
) -> InteractionResult {
    let mut player_query = world.query_filtered::<(Entity, &Position), With<Controllable>>();
    let (player_entity, player_room) = match player_query.iter(world).next() {
        Some((e, pos)) => (e, pos.room_id.clone()),
        None => return error_result("No player found.", world),
    };

    let mut inv_query = world.query::<(Entity, &InInventory, &ItemBlueprint)>();
    let match_result = inv_query.iter(world).find_map(|(entity, inv, bp)| {
        if inv.owner != player_entity {
            return None;
        }
        let template = repo.item(&bp.id).ok()?;
        let matches = template.id.contains(item_fragment)
            || template.name.to_lowercase().contains(item_fragment);
        if matches {
            Some((entity, bp.id.clone(), template.name.clone()))
        } else {
            None
        }
    });

    let (item_entity, item_id, item_name) = match match_result {
        Some(r) => r,
        None => {
            return InteractionResult {
                success: false,
                narrative: format!("You're not carrying any '{item_fragment}'."),
                inventory_ids: get_inventory(world, player_entity, repo),
                context_actions: vec![],
            }
        }
    };

    // Remove equipment bonus before dropping
    let equip_note = apply_equip_bonus(world, repo, &item_id, player_entity, -1);

    // Transfer: remove InInventory, add Position at current room
    world
        .entity_mut(item_entity)
        .remove::<InInventory>()
        .insert(Position {
            room_id: player_room.clone(),
        });

    InteractionResult {
        success: true,
        narrative: format!("You drop the {item_name}.{equip_note}"),
        inventory_ids: get_inventory(world, player_entity, repo),
        context_actions: vec![ContextAction {
            label: format!("Take {item_name}"),
            command: format!("take {item_name}"),
        }],
    }
}

pub fn process_inventory(world: &mut World, repo: &StaticRepository) -> InteractionResult {
    let mut player_query = world.query_filtered::<Entity, With<Controllable>>();
    let player_entity = match player_query.iter(world).next() {
        Some(e) => e,
        None => return error_result("No player found.", world),
    };

    let inv = get_inventory(world, player_entity, repo);
    let narrative = if inv.is_empty() {
        "You are carrying nothing.".to_string()
    } else {
        let names: Vec<String> = inv
            .iter()
            .filter_map(|id| {
                repo.item(id).ok().map(|t| {
                    let bonus_str = match (
                        t.attributes.get("equip_stat").and_then(|v| v.as_str()),
                        t.attributes.get("equip_bonus").and_then(|v| v.as_i64()),
                    ) {
                        (Some(stat), Some(bonus)) => {
                            let label = match stat {
                                "attack" => "ATK",
                                "defense" => "DEF",
                                "intelligence" => "INT",
                                _ => stat,
                            };
                            format!(" [+{bonus} {label}]")
                        }
                        _ => String::new(),
                    };
                    format!("{}{}", t.name, bonus_str)
                })
            })
            .collect();
        format!("You are carrying: {}.", names.join(", "))
    };

    let mut actions: Vec<ContextAction> = inv
        .iter()
        .filter_map(|id| repo.item(id).ok())
        .flat_map(|t| {
            let mut v = vec![ContextAction {
                label: format!("Drop {}", t.name),
                command: format!("drop {}", t.id),
            }];
            if t.attributes.contains_key("use_effect") {
                v.push(ContextAction {
                    label: format!("Use {}", t.name),
                    command: format!("use {}", t.id),
                });
            }
            v
        })
        .collect();
    // Sort: usable items first (Use before Drop for each)
    actions.sort_by_key(|a| if a.command.starts_with("use") { 0 } else { 1 });

    InteractionResult {
        success: true,
        narrative,
        inventory_ids: inv,
        context_actions: actions,
    }
}

/// Consume a usable item from the player's inventory, applying its effect.
///
/// Reads `use_effect` from the item template's `attributes` map:
/// - "heal"      → restore `heal_amount` HP (capped at max)
/// - "boost_atk" → permanently add `boost_amount` to ATK
/// - "boost_def" → permanently add `boost_amount` to DEF
/// - "boost_int" → permanently add `boost_amount` to INT
///
/// If `consumable: true` in attributes (or no `consumable` key → defaults true),
/// the item entity is despawned after use so it can't be used again.
pub fn process_use_item(
    world: &mut World,
    repo: &StaticRepository,
    item_fragment: &str,
) -> InteractionResult {
    let mut player_q = world.query_filtered::<Entity, With<Controllable>>();
    let player_entity = match player_q.iter(world).next() {
        Some(e) => e,
        None => return error_result("No player found.", world),
    };

    // Find item in inventory
    let mut inv_q = world.query::<(Entity, &InInventory, &ItemBlueprint)>();
    let match_result = inv_q.iter(world).find_map(|(entity, inv, bp)| {
        if inv.owner != player_entity {
            return None;
        }
        let template = repo.item(&bp.id).ok()?;
        let matches = template.id.contains(item_fragment)
            || template.name.to_lowercase().contains(item_fragment);
        if matches {
            Some((entity, bp.id.clone(), template.name.clone()))
        } else {
            None
        }
    });

    let (item_entity, item_id, item_name) = match match_result {
        Some(r) => r,
        None => {
            return InteractionResult {
                success: false,
                narrative: format!("You're not carrying any '{item_fragment}'."),
                inventory_ids: get_inventory(world, player_entity, repo),
                context_actions: vec![],
            }
        }
    };

    let template = match repo.item(&item_id) {
        Ok(t) => t,
        Err(_) => return error_result("Item data missing.", world),
    };

    let use_effect = match template
        .attributes
        .get("use_effect")
        .and_then(|v| v.as_str())
    {
        Some(e) => e.to_string(),
        None => {
            return InteractionResult {
                success: false,
                narrative: format!("You can't use the {item_name} like that."),
                inventory_ids: get_inventory(world, player_entity, repo),
                context_actions: vec![],
            }
        }
    };

    let boost_amount = template
        .attributes
        .get("boost_amount")
        .and_then(|v| v.as_i64())
        .unwrap_or(0) as i32;
    let heal_amount = template
        .attributes
        .get("heal_amount")
        .and_then(|v| v.as_i64())
        .unwrap_or(0) as i32;
    let consumable = template
        .attributes
        .get("consumable")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    let effect_kind_str = template
        .attributes
        .get("effect_kind")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let effect_amount = template
        .attributes
        .get("effect_amount")
        .and_then(|v| v.as_i64())
        .unwrap_or(0) as i32;
    let effect_duration = template
        .attributes
        .get("effect_duration")
        .and_then(|v| v.as_i64())
        .unwrap_or(3) as u32;
    let cures_kind = template
        .attributes
        .get("cures_kind")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let narrative = match use_effect.as_str() {
        "heal" => {
            let mut hp_q = world.query_filtered::<&mut Health, With<Controllable>>();
            if let Some(mut hp) = hp_q.iter_mut(world).next() {
                let old = hp.current;
                hp.current = (hp.current + heal_amount).min(hp.max);
                let gained = hp.current - old;
                format!(
                    "You use the {item_name}, restoring {gained} HP. ({}/{})",
                    hp.current, hp.max
                )
            } else {
                format!("You use the {item_name}.")
            }
        }
        "buff" => {
            if let Some(kind) = EffectKind::from_str(&effect_kind_str) {
                let label = kind.label().to_lowercase();
                poison::apply_effect_to_entity(
                    world,
                    player_entity,
                    kind,
                    0,
                    effect_amount,
                    effect_duration,
                );
                format!("You use the {item_name}. {label} for {effect_duration} turns.")
            } else {
                format!("You use the {item_name}. (Unknown buff kind: {effect_kind_str})")
            }
        }
        "cure_status" => {
            cure_effects(world, player_entity, &cures_kind);
            if cures_kind == "all" {
                format!("You use the {item_name}. All status effects cleared.")
            } else {
                format!("You use the {item_name}. {} cured.", cures_kind)
            }
        }
        "heal_and_cure" => {
            let healed = {
                let mut hp_q = world.query_filtered::<&mut Health, With<Controllable>>();
                if let Some(mut hp) = hp_q.iter_mut(world).next() {
                    let old = hp.current;
                    hp.current = (hp.current + heal_amount).min(hp.max);
                    hp.current - old
                } else {
                    0
                }
            };
            cure_effects(world, player_entity, &cures_kind);
            let cure_text = if cures_kind == "all" {
                "all status effects cleared"
            } else {
                "effects cured"
            };
            format!("You use the {item_name}: +{healed} HP, {cure_text}.")
        }
        "revive" => {
            let revive_pct = template
                .attributes
                .get("revive_percent")
                .and_then(|v| v.as_i64())
                .unwrap_or(50) as i32;
            let mut hp_q = world.query_filtered::<&mut Health, With<Controllable>>();
            if let Some(mut hp) = hp_q.iter_mut(world).next() {
                if hp.current <= 0 {
                    let restored = (hp.max * revive_pct / 100).max(1);
                    hp.current = restored;
                    format!(
                        "You use the {item_name}. Revived at {restored}/{} HP.",
                        hp.max
                    )
                } else {
                    "You are already alive (use when HP reaches 0).".to_string()
                }
            } else {
                format!("You use the {item_name}.")
            }
        }
        "boost_atk" => {
            let mut stats_q = world.query_filtered::<&mut Stats, With<Controllable>>();
            if let Some(mut stats) = stats_q.iter_mut(world).next() {
                stats.attack += boost_amount;
                format!(
                    "You use the {item_name}. ATK increased by {boost_amount} (now {}).",
                    stats.attack
                )
            } else {
                format!("You use the {item_name}.")
            }
        }
        "boost_def" => {
            let mut stats_q = world.query_filtered::<&mut Stats, With<Controllable>>();
            if let Some(mut stats) = stats_q.iter_mut(world).next() {
                stats.defense += boost_amount;
                format!(
                    "You use the {item_name}. DEF increased by {boost_amount} (now {}).",
                    stats.defense
                )
            } else {
                format!("You use the {item_name}.")
            }
        }
        "boost_int" => {
            let mut stats_q = world.query_filtered::<&mut Stats, With<Controllable>>();
            if let Some(mut stats) = stats_q.iter_mut(world).next() {
                stats.intelligence += boost_amount;
                format!(
                    "You use the {item_name}. INT increased by {boost_amount} (now {}).",
                    stats.intelligence
                )
            } else {
                format!("You use the {item_name}.")
            }
        }
        other => format!("You use the {item_name}. (Effect: {other})"),
    };

    if consumable {
        world.despawn(item_entity);
    }

    InteractionResult {
        success: true,
        narrative,
        inventory_ids: get_inventory(world, player_entity, repo),
        context_actions: vec![],
    }
}

/// Remove status effects from the player.
/// `cures_kind`: "all" removes everything; otherwise removes effects matching that EffectKind label.
fn cure_effects(world: &mut World, player_e: Entity, cures_kind: &str) {
    if let Some(mut ae) = world.entity_mut(player_e).get_mut::<ActiveEffects>() {
        if cures_kind == "all" {
            // Reverse stat mutations before clearing — effects won't get their normal expiry path.
            // For simplicity we just clear the list; stat mutations were applied at use and
            // will not be reversed here (the common case: DoTs/CC, not buffs, get cured).
            ae.effects.retain(|e| {
                // Keep buffs (stat mutations) — cures remove DoTs and debuffs only.
                matches!(
                    e.kind,
                    EffectKind::DefenseUp
                        | EffectKind::AttackUp
                        | EffectKind::TechUp
                        | EffectKind::AgilityUp
                        | EffectKind::LuckUp
                )
            });
        } else if let Some(target_kind) = EffectKind::from_str(cures_kind) {
            ae.effects.retain(|e| e.kind != target_kind);
        }
    }
}

/// Apply (sign=+1) or remove (sign=-1) passive stat bonuses from an equipment item.
/// Items opt in via JSON attributes: `"equip_stat": "attack"`, `"equip_bonus": 4`.
/// Returns a short annotation string like " (+4 ATK while carried)" or "".
fn apply_equip_bonus(
    world: &mut World,
    repo: &StaticRepository,
    item_id: &str,
    _player: Entity,
    sign: i32,
) -> String {
    let template = match repo.item(item_id) {
        Ok(t) => t,
        Err(_) => return String::new(),
    };
    let stat = match template
        .attributes
        .get("equip_stat")
        .and_then(|v| v.as_str())
    {
        Some(s) => s.to_string(),
        None => return String::new(),
    };
    let bonus = match template
        .attributes
        .get("equip_bonus")
        .and_then(|v| v.as_i64())
    {
        Some(b) => b as i32,
        None => return String::new(),
    };
    let delta = sign * bonus;
    let mut stats_q = world.query_filtered::<&mut Stats, With<Controllable>>();
    if let Some(mut stats) = stats_q.iter_mut(world).next() {
        match stat.as_str() {
            "attack" => {
                stats.attack += delta;
                if sign > 0 {
                    format!(" (+{bonus} ATK while carried)")
                } else {
                    format!(" (-{bonus} ATK removed)")
                }
            }
            "defense" => {
                stats.defense += delta;
                if sign > 0 {
                    format!(" (+{bonus} DEF while carried)")
                } else {
                    format!(" (-{bonus} DEF removed)")
                }
            }
            "intelligence" => {
                stats.intelligence += delta;
                if sign > 0 {
                    format!(" (+{bonus} INT while carried)")
                } else {
                    format!(" (-{bonus} INT removed)")
                }
            }
            _ => String::new(),
        }
    } else {
        String::new()
    }
}

fn get_inventory(world: &mut World, player: Entity, _repo: &StaticRepository) -> Vec<String> {
    let mut regular: Vec<String> = {
        let mut q = world.query::<(&InInventory, &ItemBlueprint)>();
        q.iter(world)
            .filter(|(inv, _)| inv.owner == player)
            .map(|(_, bp)| bp.id.clone())
            .collect()
    };
    let assembled: Vec<String> = {
        let mut q = world.query::<(&InInventory, &AssembledWeapon)>();
        q.iter(world)
            .filter(|(inv, _)| inv.owner == player)
            .map(|(_, aw)| format!("assembled:{}", aw.weapon_id))
            .collect()
    };
    regular.extend(assembled);
    regular
}

fn pick_up_actions_in_room(
    world: &mut World,
    room_id: &str,
    repo: &StaticRepository,
) -> Vec<ContextAction> {
    let mut query = world.query::<(&Position, &ItemBlueprint)>();
    query
        .iter(world)
        .filter(|(pos, _)| pos.room_id == room_id)
        .filter_map(|(_, bp)| repo.item(&bp.id).ok().filter(|t| t.takeable))
        .map(|t| ContextAction {
            label: format!("Take {}", t.name),
            command: format!("take {}", t.id),
        })
        .collect()
}

fn error_result(msg: &str, _world: &mut World) -> InteractionResult {
    InteractionResult {
        success: false,
        narrative: msg.to_string(),
        inventory_ids: vec![],
        context_actions: vec![],
    }
}
