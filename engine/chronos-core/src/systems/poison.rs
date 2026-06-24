//! Poison / DoT (damage-over-time) system.
//!
//! `tick_all_effects` is called once per turn before the player's action,
//! applying damage or stat changes from every active effect and expiring
//! those whose duration has run out.
//!
//! `process_apply_effect` attaches a new `ActiveEffect` to a named entity
//! (player or enemy). Used directly by the `ApplyEffect` engine event and
//! also called internally when payload vials or abilities fire on-hit effects.
//!
//! # Effect kinds
//!
//! Defined in `components::EffectKind`: Poison, Burn, Bleed, Corrode, Blind, Stun.
//! Each has a `damage_per_turn` and `duration_turns`. Stat debuffs (Blind, Stun)
//! are modeled as large-magnitude damage so they interact consistently with HP.

use crate::components::{
    ActiveEffect, ActiveEffects, EffectKind, Health, Identity, StatField, Stats,
};
use crate::events::ContextAction;
use bevy_ecs::prelude::*;

pub struct EffectResult {
    pub narrative: String,
    pub context_actions: Vec<ContextAction>,
}

/// Apply a status effect by name to a named target in the world.
pub fn process_apply_effect(
    world: &mut World,
    current_tick: u64,
    kind: EffectKind,
    target_name: &str,
    magnitude: i32,
    duration_turns: u32,
) -> EffectResult {
    let target = {
        let mut q = world.query::<(Entity, &Identity)>();
        q.iter(world)
            .find(|(_, id)| id.name.eq_ignore_ascii_case(target_name))
            .map(|(e, _)| e)
    };
    let Some(entity) = target else {
        return EffectResult {
            narrative: format!("There is no {} here.", target_name),
            context_actions: vec![],
        };
    };
    let label = kind.label().to_lowercase();
    apply_effect_to_entity(world, entity, kind, current_tick, magnitude, duration_turns);
    EffectResult {
        narrative: format!("The {} is {}!", target_name, label),
        context_actions: vec![],
    }
}

/// Apply a status effect directly to an entity.
///
/// Stat-mutating effects (DefenseUp, Blind, Corrode, etc.) are applied immediately
/// to the Stats component and reversed on expiry in `tick_all_effects`.
/// Stacking effects (Bleed ≤3×, Corrode ≤2×) add a new instance rather than replacing.
pub fn apply_effect_to_entity(
    world: &mut World,
    entity: Entity,
    kind: EffectKind,
    current_tick: u64,
    magnitude: i32,
    duration_turns: u32,
) {
    // For non-stacking stat-mutating effects, undo the existing bonus first
    // so re-application replaces rather than stacks the stat change.
    if let Some(mutation) = kind.stat_mutation() {
        let is_stacking = matches!(kind, EffectKind::Bleed | EffectKind::Corrode);
        if !is_stacking {
            let existing_total: i32 = world
                .entity(entity)
                .get::<ActiveEffects>()
                .map(|ae| {
                    ae.effects
                        .iter()
                        .filter(|e| e.kind == kind)
                        .map(|e| e.magnitude)
                        .sum()
                })
                .unwrap_or(0);
            if existing_total != 0 {
                apply_stat_delta(
                    world,
                    entity,
                    &mutation.stat,
                    -(existing_total * mutation.sign),
                );
            }
        }
        apply_stat_delta(world, entity, &mutation.stat, magnitude * mutation.sign);
    }

    let effect = ActiveEffect {
        kind,
        applied_at_tick: current_tick,
        duration_turns,
        magnitude,
    };
    if let Some(mut ae) = world.entity_mut(entity).get_mut::<ActiveEffects>() {
        ae.apply(effect);
    } else {
        let mut ae = ActiveEffects::default();
        ae.apply(effect);
        world.entity_mut(entity).insert(ae);
    }
}

/// Tick all active effects on all entities. Called once per tick before the event is applied.
///
/// DoT effects deal `magnitude` damage per active tick.
/// Stat-mutating effects have their bonus reversed when they expire.
pub fn tick_all_effects(world: &mut World, current_tick: u64) {
    // Collect entities with active effects and what needs ticking/expiring.
    let affected: Vec<(Entity, Vec<ActiveEffect>)> = {
        let mut q = world.query::<(Entity, &ActiveEffects)>();
        q.iter(world)
            .map(|(e, ae)| (e, ae.effects.clone()))
            .collect()
    };

    for (entity, effects) in affected {
        // DoT damage pass
        let dot_damage: i32 = effects
            .iter()
            .filter(|e| e.kind.is_dot() && e.is_active_on(current_tick))
            .map(|e| e.magnitude)
            .sum();
        if dot_damage > 0 {
            if let Some(mut hp) = world.entity_mut(entity).get_mut::<Health>() {
                hp.current = (hp.current - dot_damage).max(0);
            }
        }

        // Expiry pass — reverse stat mutations for expired stat-mutating effects.
        // Fires AT end_tick (same tick as the final DoT) so the debuff lasts exactly
        // duration_turns ticks, matching the DoT window, not duration_turns+1.
        for effect in &effects {
            if current_tick >= effect.end_tick() {
                if let Some(mutation) = effect.kind.stat_mutation() {
                    // Reverse: sign is already baked into the original application,
                    // so we invert it here to undo the delta.
                    apply_stat_delta(
                        world,
                        entity,
                        &mutation.stat,
                        -(effect.magnitude * mutation.sign),
                    );
                }
            }
        }

        // Prune expired effects (using < so the prune also fires at end_tick).
        if let Some(mut ae) = world.entity_mut(entity).get_mut::<ActiveEffects>() {
            ae.effects.retain(|e| current_tick < e.end_tick());
        }
    }
}

/// Helper: apply a raw delta to a specific stat field on an entity's Stats component.
fn apply_stat_delta(world: &mut World, entity: Entity, field: &StatField, delta: i32) {
    if let Some(mut stats) = world.entity_mut(entity).get_mut::<Stats>() {
        match field {
            StatField::Attack => stats.attack = (stats.attack + delta).max(0),
            StatField::Defense => stats.defense = (stats.defense + delta).max(0),
            StatField::Hit => stats.hit = (stats.hit + delta).max(0),
            StatField::TechAttack => stats.tech_attack = (stats.tech_attack + delta).max(0),
            StatField::Agility => stats.agility = (stats.agility + delta).max(0),
            StatField::Luck => stats.luck = (stats.luck + delta).max(0),
        }
    }
}
