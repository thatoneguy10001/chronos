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
    ActiveEffects, Controllable, EffectKind, Enemy, Experience, Health, Identity, ItemBlueprint,
    PayloadSlots, Position, Stats, Wallet,
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
                st.attack(),
                st.defense(),
                st.hit(),
                st.luck(),
                st.evasion(),
                hp.current,
                hp.max,
                id.name.clone(),
                id.class_id.clone(),
            )
        })
    };
    let (player_e, room, p_atk, p_def, p_hit, p_luck, p_eva, p_hp, p_max, p_name, p_class) =
        match player {
            Some(t) => t,
            None => return err("You have no character to fight with. Try: become fighter"),
        };

    // Sum any DamageOnHit passives this class grants — added to every landed hit.
    let passive_dmg: i32 = repo
        .class_passive_effects(&p_class)
        .into_iter()
        .filter_map(|e| match e {
            crate::data::schemas::PassiveEffect::DamageOnHit { amount } => Some(*amount),
            _ => None,
        })
        .sum();

    // Morale: high hope nudges damage up, a breaking line nudges it down.
    let morale_mod = crate::systems::morale::current_tier(world).attack_modifier();

    // --- Enemy ---
    let enemy = {
        let mut q =
            world.query_filtered::<(Entity, &Position, &Stats, &Health, &Identity), With<Enemy>>();
        q.iter(world)
            .filter(|(_, pos, _, hp, _)| pos.room_id == room && hp.current > 0)
            .map(|(e, _, st, hp, id)| {
                (
                    e,
                    st.attack(),
                    st.defense(),
                    st.hit(),
                    st.evasion(),
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
        // Miss — enemy still retaliates (unless stunned).
        let miss_narrative = format!("You swing at the {e_name} but miss!");
        // On a miss the enemy HP didn't change, so use full fraction.
        let e_frac_miss = e_hp as f32 / e_max.max(1) as f32;
        let (e_dmg, retal_text) = if enemy_is_stunned(world, enemy_e, current_tick) {
            (0, format!("The {e_name} is stunned and cannot retaliate!"))
        } else {
            enemy_retaliate(
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
            )
        };
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
    let base_dmg = (p_atk - e_def + p_spread + passive_dmg + morale_mod).max(1);
    let p_dmg = if is_crit {
        base_dmg * 3 / 2 + 1
    } else {
        base_dmg
    };
    let enemy_hp_after = e_hp - p_dmg;

    let crit_tag = if is_crit { " **CRIT!**" } else { "" };

    if enemy_hp_after <= 0 {
        // Payloads are not consumed on the killing blow — enemy is already dead.
        let payload_text = String::new();

        // Plague spreads when its host dies: capture the active plague (if any)
        // before despawn so it can leap to the other enemies in the room.
        let plague_to_spread = world.entity(enemy_e).get::<ActiveEffects>().and_then(|ae| {
            ae.effects
                .iter()
                .find(|e| e.kind == EffectKind::Plague && e.is_active_on(current_tick))
                .map(|e| (e.magnitude, e.duration_turns))
        });

        world.despawn(enemy_e);

        // Apply the captured plague to every other living enemy in the room. This
        // is a pure function of world state (no RNG), so it replays identically.
        let plague_text = if let Some((magnitude, duration)) = plague_to_spread {
            let targets: Vec<Entity> = {
                let mut q = world.query_filtered::<(Entity, &Position, &Health), With<Enemy>>();
                q.iter(world)
                    .filter(|(_, pos, hp)| pos.room_id == room && hp.current > 0)
                    .map(|(e, _, _)| e)
                    .collect()
            };
            let spread_count = targets.len();
            for target in targets {
                poison::apply_effect_to_entity(
                    world,
                    target,
                    EffectKind::Plague,
                    current_tick,
                    magnitude,
                    duration,
                );
            }
            if spread_count > 0 {
                format!(
                    "\nThe plague leaps from the dying body to {spread_count} other{} nearby!",
                    if spread_count == 1 { "" } else { "s" }
                )
            } else {
                String::new()
            }
        } else {
            String::new()
        };
        let class_data = repo.class(&e_class_id).ok();
        let xp_reward = class_data.as_ref().map(|c| c.xp_reward).unwrap_or(0);
        let gold_reward = class_data.as_ref().map(|c| c.gold_reward).unwrap_or(0);
        let class_missing = class_data.is_none();
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

        // Roll the class's loot table. Each entry is an independent RNG check, so
        // drops are deterministic and replay identically under rewind. Dropped
        // items land on the room floor (spawned with Position), where the existing
        // pick-up machinery surfaces them — no special handling needed.
        let mut dropped_names: Vec<String> = Vec::new();
        if let Some(class) = class_data.as_ref() {
            for drop in &class.loot_table {
                let roll = world
                    .resource_mut::<DeterministicRng>()
                    .range_inclusive(1, 100);
                let threshold = (drop.chance * 100.0).round() as i32;
                if roll <= threshold {
                    world.spawn((
                        Position {
                            room_id: room.clone(),
                        },
                        ItemBlueprint {
                            id: drop.item_id.clone(),
                        },
                    ));
                    let name = repo
                        .item(&drop.item_id)
                        .map(|t| t.name.clone())
                        .unwrap_or_else(|_| drop.item_id.clone());
                    dropped_names.push(name);
                }
            }
        }

        let mut narrative = format!(
            "You strike the {e_name} for {p_dmg}{crit_tag}{payload_text}. The {e_name} collapses, slain!\n+{xp_reward} XP"
        );
        if gold_reward > 0 {
            narrative.push_str(&format!(", +{gold_reward} scraps"));
        }
        narrative.push('.');
        if !dropped_names.is_empty() {
            narrative.push_str(&format!(
                "\nThe {e_name} drops: {}.",
                dropped_names.join(", ")
            ));
        }
        if let Some(new_level) = level_up {
            // The player's class drives the gains — its id is on the body, not the
            // slain enemy's class (e_class_id).
            let player_class = world
                .entity(player_e)
                .get::<Identity>()
                .map(|id| id.class_id.clone())
                .unwrap_or_default();
            let gains = crate::systems::progression::apply_level_up(
                world,
                player_e,
                repo,
                &player_class,
                new_level,
            );
            narrative.push_str(&gains);
        }

        let quest_updates = quest::on_enemy_killed(world, repo, player_e, &e_class_id);
        for update in quest_updates {
            narrative.push_str(&update);
        }
        if class_missing {
            narrative.push_str(&format!(
                "\n[Warning: class data missing for '{e_class_id}' — no XP/gold awarded]"
            ));
        }
        narrative.push_str(&plague_text);

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

    // Enemy survived — apply payload effects now that we know the hit landed on a living target.
    let payload_text = apply_payloads_on_hit(world, repo, player_e, enemy_e, current_tick);

    if let Some(mut hp) = world.entity_mut(enemy_e).get_mut::<Health>() {
        hp.current = enemy_hp_after;
    }

    // --- Enemy retaliates (unless stunned) ---
    let e_hp_frac = enemy_hp_after as f32 / e_max.max(1) as f32;
    let (e_dmg, retaliation_text) = if enemy_is_stunned(world, enemy_e, current_tick) {
        (0, format!("The {e_name} is stunned and cannot retaliate!"))
    } else {
        enemy_retaliate(
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
        )
    };

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

/// Whether the given enemy has an active Stun effect this tick. A stunned enemy
/// skips its retaliation entirely — and, crucially, draws no RNG, so it doesn't
/// just "miss" but genuinely loses the turn. Stun is duration-based, so a 1-turn
/// stun applied this turn lapses after the enemy's next (skipped) turn.
fn enemy_is_stunned(world: &World, enemy_e: Entity, tick: u64) -> bool {
    world
        .entity(enemy_e)
        .get::<ActiveEffects>()
        .map(|ae| ae.has_active(&EffectKind::Stun, tick))
        .unwrap_or(false)
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
