//! Ability system — active skill usage, cooldown tracking, and XP/kill rewards.
//!
//! # Ability types
//!
//! Defined by `TargetingType` in the schema:
//! - `HealSelf` — restores HP to the caster
//! - `DamageEnemy` — direct damage to the enemy in the room
//! - `ApplyEffect` — attaches a status effect (DoT or debuff) to the target
//! - `BuffSelf` — temporary stat boost with a turn duration
//!
//! # Cooldowns
//!
//! Each class ability has a `cooldown_turns` value. `AbilityCooldowns` stores
//! `next_usable_tick` per ability name. `process_ability` gates on the tick
//! and rejects if the cooldown hasn't expired.
//!
//! # XP and kills
//!
//! When a `DamageEnemy` or `ApplyEffect` ability kills the target, this system
//! calls into `quest::on_enemy_killed` and grants XP via the experience
//! component directly — same logic as the combat system.

use bevy_ecs::prelude::*;
use crate::components::{AbilityCooldowns, Controllable, EffectKind, Enemy, Experience, Health, Identity, Position, Stats};
use crate::data::{AbilityTemplate, StaticRepository, schemas::TargetingType};
use crate::events::ContextAction;
use crate::rng::DeterministicRng;
use crate::systems::{poison, quest};

/// Restore HP to the caster. Returns a narrative string describing the heal.
fn heal_caster(world: &mut World, caster_e: Entity, caster_name: &str, ability_name: &str, amount: i32) -> AbilityResult {
    let (healed, new_hp, max_hp) = {
        if let Some(mut hp) = world.entity_mut(caster_e).get_mut::<Health>() {
            let before = hp.current;
            hp.current = (hp.current + amount).min(hp.max);
            (hp.current - before, hp.current, hp.max)
        } else {
            return AbilityResult { success: false, narrative: "No health component found.".into(), context_actions: vec![] };
        }
    };
    AbilityResult {
        success: true,
        narrative: format!(
            "{caster_name} uses {ability_name}, restoring {healed} HP. ({new_hp}/{max_hp} HP)"
        ),
        context_actions: vec![ContextAction {
            label: format!("Use {ability_name} again"),
            command: ability_name.to_lowercase().replace(' ', " "),
        }],
    }
}

pub struct AbilityResult {
    pub success: bool,
    pub narrative: String,
    pub context_actions: Vec<ContextAction>,
}

fn err(msg: &str) -> AbilityResult {
    AbilityResult { success: false, narrative: msg.to_string(), context_actions: vec![] }
}

fn normalise(s: &str) -> String {
    s.to_lowercase().replace(['_', '-'], " ")
}

fn find_ability<'a>(class: &'a crate::data::schemas::ClassTemplate, ability_name: &str) -> Option<&'a AbilityTemplate> {
    let needle = normalise(ability_name);
    class.abilities.iter().find(|a| normalise(&a.id) == needle || normalise(&a.name) == needle)
}

/// Use an ability by name. Enforces cooldown, unlock level, and targeting type.
pub fn process_use_ability(
    world: &mut World,
    repo: &StaticRepository,
    ability_name: &str,
    target_name: &str,
    current_tick: u64,
) -> AbilityResult {
    // --- Caster ---
    let caster = {
        let mut q = world.query_filtered::<(Entity, &Stats, &Identity, &Experience), With<Controllable>>();
        q.iter(world).next().map(|(e, st, id, exp)| (e, st.attack, id.class_id.clone(), id.name.clone(), exp.level))
    };
    let (caster_e, caster_atk, class_id, caster_name, caster_level) = match caster {
        Some(t) => t,
        None => return err("You have no character. Try: become <class>"),
    };

    // --- Resolve ability ---
    let ability: AbilityTemplate = match repo.class(&class_id) {
        Ok(class) => match find_ability(class, ability_name) {
            Some(a) => a.clone(),
            None => {
                let known: Vec<String> = class.abilities.iter()
                    .map(|a| format!("{} (lv{})", a.name, a.unlock_level))
                    .collect();
                let hint = if known.is_empty() { String::new() } else {
                    format!(" Known: {}.", known.join(", "))
                };
                return err(&format!("Unknown ability '{ability_name}'.{hint}"));
            }
        },
        Err(_) => return err("Class template not found."),
    };

    // --- Level gate ---
    if caster_level < ability.unlock_level {
        return err(&format!(
            "{} requires level {} (you are level {}).",
            ability.name, ability.unlock_level, caster_level
        ));
    }

    // --- Cooldown gate ---
    if ability.cooldown > 0 {
        let ready = world.entity(caster_e)
            .get::<AbilityCooldowns>()
            .map(|cd| cd.is_ready(&ability.id, ability.cooldown, current_tick))
            .unwrap_or(true);
        if !ready {
            let remaining = world.entity(caster_e)
                .get::<AbilityCooldowns>()
                .map(|cd| cd.turns_remaining(&ability.id, ability.cooldown, current_tick))
                .unwrap_or(0);
            return err(&format!("{} is on cooldown ({} turn(s) remaining).", ability.name, remaining));
        }
    }

    // Record cooldown usage up front (before targeting, so AoE hits all count as one use).
    if ability.cooldown > 0 {
        if let Some(mut cd) = world.entity_mut(caster_e).get_mut::<AbilityCooldowns>() {
            cd.mark_used(&ability.id, current_tick);
        }
    }

    let has_damage = ability.base_damage > 0;
    let has_effect = ability.applies_effect.is_some() && ability.effect_duration > 0;

    // --- Dispatch by targeting type ---
    match ability.targeting {
        TargetingType::Caster | TargetingType::AllAllies => {
            use_ability_on_caster(world, caster_e, &caster_name, &ability, current_tick)
        }
        TargetingType::Aoe => {
            if !has_damage && !has_effect {
                return err(&format!("{} has no effect yet.", ability.name));
            }
            use_ability_aoe(world, repo, caster_e, caster_atk, &caster_name, &ability, current_tick)
        }
        TargetingType::Single => {
            // Self-buff via Single targeting (heal_amount > 0 or self-targeting effect)
            if ability.heal_amount > 0 {
                return heal_caster(world, caster_e, &caster_name, &ability.name, ability.heal_amount);
            }
            if let Some(kind_str) = &ability.applies_effect.clone() {
                if let Some(kind) = EffectKind::from_str(kind_str) {
                    if kind.is_self_targeting() && !has_damage {
                        return apply_self_buff(world, caster_e, &caster_name, &ability, kind, current_tick);
                    }
                }
            }
            if !has_damage && !has_effect {
                return err(&format!("{} has no effect yet.", ability.name));
            }
            use_ability_single(world, repo, caster_e, caster_atk, &caster_name, ability_name, &ability, target_name, current_tick)
        }
    }
}

fn use_ability_on_caster(
    world: &mut World,
    caster_e: Entity,
    caster_name: &str,
    ability: &AbilityTemplate,
    current_tick: u64,
) -> AbilityResult {
    if ability.heal_amount > 0 {
        return heal_caster(world, caster_e, caster_name, &ability.name, ability.heal_amount);
    }
    if let Some(kind_str) = &ability.applies_effect {
        if let Some(kind) = EffectKind::from_str(kind_str) {
            return apply_self_buff(world, caster_e, caster_name, ability, kind, current_tick);
        }
    }
    err(&format!("{} has no effect yet.", ability.name))
}

fn apply_self_buff(
    world: &mut World,
    caster_e: Entity,
    caster_name: &str,
    ability: &AbilityTemplate,
    kind: EffectKind,
    current_tick: u64,
) -> AbilityResult {
    let label = kind.label().to_lowercase();
    poison::apply_effect_to_entity(world, caster_e, kind, current_tick, ability.effect_damage, ability.effect_duration);
    let cd_str = if ability.cooldown > 0 { format!(" ({}-turn cooldown)", ability.cooldown) } else { String::new() };
    AbilityResult {
        success: true,
        narrative: format!("{} uses {}! {} for {} turns.{}", caster_name, ability.name, label, ability.effect_duration, cd_str),
        context_actions: vec![ContextAction {
            label: format!("Use {} again", ability.name),
            command: ability.id.replace('_', " "),
        }],
    }
}

fn use_ability_single(
    world: &mut World,
    repo: &StaticRepository,
    caster_e: Entity,
    caster_atk: i32,
    caster_name: &str,
    ability_cmd: &str,
    ability: &AbilityTemplate,
    target_name: &str,
    current_tick: u64,
) -> AbilityResult {
    let player_room = {
        let mut q = world.query_filtered::<&Position, With<Controllable>>();
        q.iter(world).next().map(|p| p.room_id.clone())
    };
    let player_room = match player_room { Some(r) => r, None => return err("No room.") };

    let target = {
        let mut q = world.query_filtered::<(Entity, &Position, &Health, &Identity, &Stats), With<Enemy>>();
        let candidates: Vec<_> = q.iter(world)
            .filter(|(_, pos, hp, _, _)| pos.room_id == player_room && hp.current > 0)
            .map(|(e, _, hp, id, st)| (e, hp.current, hp.max, id.name.clone(), id.class_id.clone(), st.defense))
            .collect();
        if target_name == "enemy" || target_name == "self" {
            candidates.into_iter().next()
        } else {
            candidates.into_iter().find(|(_, _, _, name, _, _)| name.eq_ignore_ascii_case(target_name))
        }
    };
    let (target_e, target_hp, target_max, resolved_name, target_class_id, target_def) = match target {
        Some(t) => t,
        None => return err(&format!("There is no {} here.", target_name)),
    };

    deal_damage_and_effect(world, repo, caster_e, caster_atk, caster_name, ability_cmd, ability, target_e, &resolved_name, &target_class_id, target_hp, target_max, target_def, current_tick)
}

fn use_ability_aoe(
    world: &mut World,
    repo: &StaticRepository,
    caster_e: Entity,
    caster_atk: i32,
    caster_name: &str,
    ability: &AbilityTemplate,
    current_tick: u64,
) -> AbilityResult {
    let player_room = {
        let mut q = world.query_filtered::<&Position, With<Controllable>>();
        q.iter(world).next().map(|p| p.room_id.clone())
    };
    let player_room = match player_room { Some(r) => r, None => return err("No room.") };

    let targets: Vec<(Entity, i32, i32, String, String, i32)> = {
        let mut q = world.query_filtered::<(Entity, &Position, &Health, &Identity, &Stats), With<Enemy>>();
        q.iter(world)
            .filter(|(_, pos, hp, _, _)| pos.room_id == player_room && hp.current > 0)
            .map(|(e, _, hp, id, st)| (e, hp.current, hp.max, id.name.clone(), id.class_id.clone(), st.defense))
            .collect()
    };

    if targets.is_empty() {
        return err("There are no enemies here to hit.");
    }

    let mut narrative_parts = vec![format!("{} uses {}!", caster_name, ability.name)];
    let mut kills = 0usize;
    let cmd = ability.id.replace('_', " ");

    for (target_e, target_hp, target_max, target_name, target_class_id, target_def) in targets {
        let result = deal_damage_and_effect(world, repo, caster_e, caster_atk, caster_name, &cmd, ability, target_e, &target_name, &target_class_id, target_hp, target_max, target_def, current_tick);
        narrative_parts.push(result.narrative);
        if !world.entities().contains(target_e) { kills += 1; }
    }

    let narrative = narrative_parts.join("\n");
    let context_actions = if kills > 0 {
        vec![ContextAction { label: "Look around".into(), command: "look".into() }]
    } else {
        vec![ContextAction { label: format!("Use {} again", ability.name), command: cmd }]
    };
    AbilityResult { success: true, narrative, context_actions }
}

/// Apply damage and/or status effect to a single target entity. Returns a narrative line.
fn deal_damage_and_effect(
    world: &mut World,
    repo: &StaticRepository,
    caster_e: Entity,
    caster_atk: i32,
    _caster_name: &str,
    ability_cmd: &str,
    ability: &AbilityTemplate,
    target_e: Entity,
    target_name: &str,
    target_class_id: &str,
    target_hp: i32,
    target_max: i32,
    target_def: i32,
    current_tick: u64,
) -> AbilityResult {
    let has_damage = ability.base_damage > 0;
    let has_effect = ability.applies_effect.is_some() && ability.effect_duration > 0;

    let hits = ability.hit_count.max(1);
    let mut total_dmg = 0i32;
    let mut current_hp = target_hp;
    let mut killed = false;
    let mut hit_log: Vec<i32> = Vec::with_capacity(hits as usize);

    if has_damage {
        // Abilities pierce half the target's DEF — still better than basic attacks,
        // but armored enemies remain meaningful. Floor at base_damage/2 so abilities
        // always deal significant damage regardless of enemy DEF.
        let def_reduction = target_def / 2;
        let dmg_floor = (ability.base_damage / 2).max(1);
        for _ in 0..hits {
            let spread = world.resource_mut::<DeterministicRng>().range_inclusive(-1, 1);
            let dmg = (ability.base_damage + caster_atk - def_reduction + spread).max(dmg_floor);
            total_dmg += dmg;
            current_hp -= dmg;
            hit_log.push(dmg);
            if current_hp <= 0 { killed = true; break; }
        }
    }

    if killed {
        world.despawn(target_e);
        let quest_updates = quest::on_enemy_killed(world, repo, caster_e, target_class_id);
        let detail = if hit_log.len() == 1 { format!("{}", hit_log[0]) }
                     else { format!("{} ({} hits)", total_dmg, hit_log.len()) };
        let mut narrative = format!("  {}: {} damage — slain!", target_name, detail);
        for update in quest_updates { narrative.push_str(&update); }
        return AbilityResult {
            success: true,
            narrative,
            context_actions: vec![],
        };
    }

    if has_damage {
        if let Some(mut hp) = world.entity_mut(target_e).get_mut::<Health>() {
            hp.current = current_hp;
        }
    }

    let mut effect_text = String::new();
    if has_effect {
        if let Some(kind_str) = &ability.applies_effect {
            if let Some(kind) = EffectKind::from_str(kind_str) {
                let label = kind.label().to_lowercase();
                poison::apply_effect_to_entity(world, target_e, kind, current_tick, ability.effect_damage, ability.effect_duration);
                effect_text = format!(" ({} applied)", label);
            }
        }
    }

    let hp_now = if has_damage { current_hp } else { target_hp };
    let dmg_text = if has_damage {
        if hit_log.len() > 1 { format!("{} ({} hits)", total_dmg, hit_log.len()) }
        else { format!("{}", total_dmg) }
    } else { String::new() };

    let narrative = if has_damage {
        format!("  {}: {} damage ({}/{} HP){}", target_name, dmg_text, hp_now, target_max, effect_text)
    } else {
        format!("  {}{}", target_name, effect_text)
    };

    AbilityResult {
        success: true,
        narrative,
        context_actions: vec![ContextAction {
            label: format!("Use {} again", ability.name),
            command: format!("{} {}", ability_cmd, target_name),
        }],
    }
}
