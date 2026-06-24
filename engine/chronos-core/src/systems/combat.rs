//! Combat system — turn-based player-vs-enemy exchanges.
//!
//! # Turn order
//!
//! 1. Player attacks: hit roll (ATK + d20 vs enemy DEF + evasion).
//!    Equipped weapon adds ATK bonus; payload vials apply DoT on hit.
//! 2. If the enemy survives, it retaliates using its class tactic list.
//!    Each tactic is a condition → action rule evaluated in order; the first
//!    matching rule fires. Default fallback is `BasicAttack`.
//!
//! # Determinism
//!
//! All dice are drawn from `DeterministicRng` (seeded per session). The same
//! seed + event log always produces the same combat outcome, which is what
//! makes time-travel rewinding work correctly.

use crate::components::{
    ActiveEffects, Controllable, Enemy, Experience, Health, Identity, PayloadSlots, Position,
    Stats, Wallet,
};
use crate::data::{
    schemas::{TacticAction, TacticCondition},
    StaticRepository,
};
use crate::events::ContextAction;
use crate::rng::DeterministicRng;
use crate::systems::poison;
use crate::systems::quest;
use bevy_ecs::prelude::*;

pub struct CombatResult {
    pub success: bool,
    pub narrative: String,
    pub context_actions: Vec<ContextAction>,
    pub game_over: bool,
}

fn err(msg: &str) -> CombatResult {
    CombatResult {
        success: false,
        narrative: msg.to_string(),
        context_actions: vec![],
        game_over: false,
    }
}

/// Resolve one combat exchange against the enemy in the player's room.
///
/// Player strikes first (RNG draw #1). If the enemy survives, it retaliates using
/// its class tactic — the first rule whose condition is satisfied. Tactics default
/// to BasicAttack if the class has no tactics list or no rule matches.
///
/// All randomness is drawn from the seeded RNG, so the fight replays identically
/// on rewind. Tactics are deterministic given the current HP state, which is itself
/// a deterministic function of the prior event log.
pub fn process_attack(
    world: &mut World,
    repo: &StaticRepository,
    current_tick: u64,
) -> CombatResult {
    // --- Player ---
    let player = {
        let mut q = world
            .query_filtered::<(Entity, &Position, &Stats, &Health, &Identity), With<Controllable>>(
            );
        q.iter(world).next().map(|(e, pos, st, hp, id)| {
            (
                e,
                pos.room_id.clone(),
                st.attack,
                st.defense,
                st.hit,
                st.luck,
                st.evasion,
                hp.current,
                hp.max,
                id.name.clone(),
            )
        })
    };
    let (player_e, room, p_atk, p_def, p_hit, p_luck, p_eva, p_hp, p_max, p_name) = match player {
        Some(t) => t,
        None => return err("You have no character to fight with. Try: become fighter"),
    };

    // --- Enemy ---
    let enemy = {
        let mut q =
            world.query_filtered::<(Entity, &Position, &Stats, &Health, &Identity), With<Enemy>>();
        q.iter(world)
            .filter(|(_, pos, _, hp, _)| pos.room_id == room && hp.current > 0)
            .map(|(e, _, st, hp, id)| {
                (
                    e,
                    st.attack,
                    st.defense,
                    st.hit,
                    st.evasion,
                    hp.current,
                    hp.max,
                    id.name.clone(),
                    id.class_id.clone(),
                )
            })
            .next()
    };
    let (enemy_e, e_atk, e_def, e_hit, e_eva, e_hp, e_max, e_name, e_class_id) = match enemy {
        Some(t) => t,
        None => return err("There is nothing here to fight."),
    };

    // --- Player strikes ---
    // Hit check: base 85% + (hit - evasion), clamped 5–99.
    let p_hit_chance = (85 + p_hit - e_eva).clamp(5, 99);
    let p_hit_roll = world
        .resource_mut::<DeterministicRng>()
        .range_inclusive(1, 100);
    if p_hit_roll > p_hit_chance {
        // Miss — enemy still retaliates.
        let miss_narrative = format!("You swing at the {e_name} but miss!");
        // On a miss the enemy HP didn't change, so use full fraction.
        let e_frac_miss = e_hp as f32 / e_max.max(1) as f32;
        let (e_dmg, retal_text) = enemy_retaliate(
            world,
            repo,
            &e_class_id,
            e_atk,
            e_hit,
            p_def,
            p_eva,
            &e_name,
            player_e,
            p_hp,
            p_max,
            e_frac_miss,
        );
        let player_hp_after = (p_hp - e_dmg).max(0);
        if e_dmg > 0 {
            if let Some(mut hp) = world.entity_mut(player_e).get_mut::<Health>() {
                hp.current = player_hp_after;
            }
        }
        let narrative = format!(
            "{miss_narrative} {retal_text} ({p_name}: {}/{p_max} HP).",
            player_hp_after.max(0)
        );
        let context_actions = if player_hp_after <= 0 {
            vec![]
        } else {
            vec![ContextAction {
                label: format!("Attack the {e_name}"),
                command: "attack".to_string(),
            }]
        };
        return CombatResult {
            success: true,
            narrative,
            context_actions,
            game_over: player_hp_after <= 0,
        };
    }

    // Crit check: 5 + luck/2 percent.
    let p_crit_chance = (5 + p_luck / 2).clamp(5, 75);
    let p_crit_roll = world
        .resource_mut::<DeterministicRng>()
        .range_inclusive(1, 100);
    let is_crit = p_crit_roll <= p_crit_chance;

    let p_spread = world
        .resource_mut::<DeterministicRng>()
        .range_inclusive(-2, 2);
    let base_dmg = (p_atk - e_def + p_spread).max(1);
    let p_dmg = if is_crit {
        base_dmg * 3 / 2 + 1
    } else {
        base_dmg
    };
    let enemy_hp_after = e_hp - p_dmg;

    let crit_tag = if is_crit { " **CRIT!**" } else { "" };

    // Apply payload effects from loaded vials on successful hit (before kill check).
    let payload_text = apply_payloads_on_hit(world, repo, player_e, enemy_e, current_tick);

    if enemy_hp_after <= 0 {
        world.despawn(enemy_e);
        let (xp_reward, gold_reward) = repo
            .class(&e_class_id)
            .map(|c| (c.xp_reward, c.gold_reward))
            .unwrap_or((0, 0));
        let level_up = if xp_reward > 0 {
            world
                .entity_mut(player_e)
                .get_mut::<Experience>()
                .and_then(|mut exp| exp.add_xp(xp_reward))
        } else {
            None
        };
        if gold_reward > 0 {
            if let Some(mut wallet) = world.entity_mut(player_e).get_mut::<Wallet>() {
                wallet.gold += gold_reward;
            }
        }

        let mut narrative = format!(
            "You strike the {e_name} for {p_dmg}{crit_tag}{payload_text}. The {e_name} collapses, slain!\n+{xp_reward} XP"
        );
        if gold_reward > 0 {
            narrative.push_str(&format!(", +{gold_reward} scraps"));
        }
        narrative.push('.');
        if let Some(new_level) = level_up {
            if let Some(mut st) = world.entity_mut(player_e).get_mut::<Stats>() {
                st.attack += 1;
                st.defense += 1;
            }
            if let Some(mut hp) = world.entity_mut(player_e).get_mut::<Health>() {
                hp.max += 5;
                hp.current = (hp.current + 5).min(hp.max);
            }
            narrative.push_str(&format!(
                "\n\nYou reached level {new_level}! ATK+1, DEF+1, HP+5."
            ));
        }

        let quest_updates = quest::on_enemy_killed(world, repo, player_e, &e_class_id);
        for update in quest_updates {
            narrative.push_str(&update);
        }

        let next_enemy = {
            let mut q = world.query_filtered::<(&Position, &Health, &Identity), With<Enemy>>();
            q.iter(world)
                .filter(|(pos, hp, _)| pos.room_id == room && hp.current > 0)
                .map(|(_, _, id)| id.name.clone())
                .next()
        };
        let context_actions = match next_enemy {
            Some(name) => vec![ContextAction {
                label: format!("Attack the {name}"),
                command: "attack".to_string(),
            }],
            None => vec![ContextAction {
                label: "Look around".to_string(),
                command: "look".to_string(),
            }],
        };
        return CombatResult {
            success: true,
            narrative,
            context_actions,
            game_over: false,
        };
    }

    if let Some(mut hp) = world.entity_mut(enemy_e).get_mut::<Health>() {
        hp.current = enemy_hp_after;
    }

    // --- Enemy retaliates ---
    let e_hp_frac = enemy_hp_after as f32 / e_max.max(1) as f32;
    let (e_dmg, retaliation_text) = enemy_retaliate(
        world,
        repo,
        &e_class_id,
        e_atk,
        e_hit,
        p_def,
        p_eva,
        &e_name,
        player_e,
        p_hp,
        p_max,
        e_hp_frac,
    );

    let player_hp_after = (p_hp - e_dmg).max(0);
    if e_dmg > 0 {
        if let Some(mut hp) = world.entity_mut(player_e).get_mut::<Health>() {
            hp.current = player_hp_after;
        }
    }

    let mut narrative = format!(
        "You strike the {e_name} for {p_dmg}{crit_tag}{payload_text} ({e_name}: {enemy_hp_after}/{e_max} HP). \
         {retaliation_text} ({p_name}: {}/{p_max} HP).",
        player_hp_after.max(0)
    );

    let died = player_hp_after <= 0;
    let context_actions = if died {
        narrative.push_str(&format!("\n\nThe {e_name} has slain you."));
        vec![]
    } else {
        vec![ContextAction {
            label: format!("Attack the {e_name}"),
            command: "attack".to_string(),
        }]
    };

    CombatResult {
        success: true,
        narrative,
        context_actions,
        game_over: died,
    }
}

/// Enemy retaliation: applies tactic, returns (damage dealt, narrative text).
/// Handles hit/evasion check for BasicAttack and HeavyAttack.
#[allow(clippy::too_many_arguments)]
fn enemy_retaliate(
    world: &mut World,
    repo: &StaticRepository,
    e_class_id: &str,
    e_atk: i32,
    e_hit: i32,
    p_def: i32,
    p_eva: i32,
    e_name: &str,
    player_e: Entity,
    p_hp: i32,
    p_max: i32,
    enemy_hp_fraction: f32,
) -> (i32, String) {
    let tactics = repo
        .class(e_class_id)
        .map(|c| c.tactics.clone())
        .unwrap_or_default();
    let player_hp_fraction = p_hp as f32 / p_max.max(1) as f32;

    let chosen = tactics
        .iter()
        .find(|rule| {
            eval_condition(
                &rule.condition,
                enemy_hp_fraction,
                player_hp_fraction,
                player_e,
                world,
            )
        })
        .map(|rule| rule.action.clone())
        .unwrap_or(TacticAction::BasicAttack);

    match chosen {
        TacticAction::BasicAttack => {
            let e_hit_chance = (85 + e_hit - p_eva).clamp(5, 99);
            let roll = world
                .resource_mut::<DeterministicRng>()
                .range_inclusive(1, 100);
            if roll > e_hit_chance {
                return (0, format!("The {e_name} swings but misses you!"));
            }
            let spread = world
                .resource_mut::<DeterministicRng>()
                .range_inclusive(-2, 2);
            let dmg = (e_atk - p_def + spread).max(1);
            (dmg, format!("The {e_name} hits back for {dmg}"))
        }
        TacticAction::HeavyAttack { multiplier } => {
            let e_hit_chance = (85 + e_hit - p_eva).clamp(5, 99);
            let roll = world
                .resource_mut::<DeterministicRng>()
                .range_inclusive(1, 100);
            if roll > e_hit_chance {
                return (0, format!("The {e_name} lunges but misses you!"));
            }
            let spread = world
                .resource_mut::<DeterministicRng>()
                .range_inclusive(-1, 1);
            let base = (e_atk as f32 * multiplier) as i32;
            let dmg = (base - p_def + spread).max(1);
            (
                dmg,
                format!("The {e_name} **strikes desperately** for {dmg}"),
            )
        }
        TacticAction::ApplyEffect {
            kind,
            damage,
            duration,
        } => {
            if let Some(effect_kind) = crate::components::EffectKind::from_str(&kind) {
                let label = effect_kind.label().to_lowercase();
                poison::apply_effect_to_entity(world, player_e, effect_kind, 0, damage, duration);
                (0, format!("The {e_name} afflicts you with {label}!"))
            } else {
                let spread = world
                    .resource_mut::<DeterministicRng>()
                    .range_inclusive(-2, 2);
                let dmg = (e_atk - p_def + spread).max(1);
                (dmg, format!("The {e_name} hits back for {dmg}"))
            }
        }
    }
}

/// Apply all loaded payload vial effects to the target on a successful hit.
/// Returns a narrative suffix fragment like " [poison! bleed!]" or empty string.
fn apply_payloads_on_hit(
    world: &mut World,
    repo: &StaticRepository,
    player_e: Entity,
    enemy_e: Entity,
    current_tick: u64,
) -> String {
    let loaded = match world.entity(player_e).get::<PayloadSlots>() {
        Some(ps) => ps.loaded.clone(),
        None => return String::new(),
    };
    if loaded.is_empty() {
        return String::new();
    }
    let mut parts: Vec<String> = Vec::new();
    for payload_id in &loaded {
        if let Ok(template) = repo.item(payload_id) {
            let effect_str = template
                .attributes
                .get("payload_effect")
                .and_then(|v| v.as_str());
            let damage = template
                .attributes
                .get("payload_damage")
                .and_then(|v| v.as_i64())
                .unwrap_or(2) as i32;
            let duration = template
                .attributes
                .get("payload_duration")
                .and_then(|v| v.as_i64())
                .unwrap_or(3) as u32;
            if let Some(kind) = effect_str.and_then(crate::components::EffectKind::from_str) {
                let label = kind.label().to_lowercase();
                poison::apply_effect_to_entity(
                    world,
                    enemy_e,
                    kind,
                    current_tick,
                    damage,
                    duration,
                );
                parts.push(label);
            }
        }
    }
    if parts.is_empty() {
        String::new()
    } else {
        format!(" [{}!]", parts.join(", "))
    }
}

/// Returns true if the given condition is satisfied given current combat state.
fn eval_condition(
    condition: &TacticCondition,
    enemy_hp_fraction: f32,
    player_hp_fraction: f32,
    player_e: Entity,
    world: &World,
) -> bool {
    match condition {
        TacticCondition::Always => true,
        TacticCondition::HpBelow { threshold } => enemy_hp_fraction < *threshold,
        TacticCondition::PlayerHpAbove { threshold } => player_hp_fraction > *threshold,
        TacticCondition::PlayerEffectAbsent { kind } => {
            if let Some(ae) = world.entity(player_e).get::<ActiveEffects>() {
                // The current tick is not available here; we check if any effect of this kind
                // exists at all (even expired ones haven't been pruned yet this tick).
                if let Some(ek) = crate::components::EffectKind::from_str(kind) {
                    !ae.effects.iter().any(|e| e.kind == ek)
                } else {
                    true // Unknown kind → treat as absent
                }
            } else {
                true // No ActiveEffects component → effect is absent
            }
        }
    }
}
