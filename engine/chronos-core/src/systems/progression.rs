//! Progression — the single source of truth for what a character gains on
//! level-up.
//!
//! Both combat kills and quest turn-ins can level the player; before this module
//! each did its own ad-hoc stat bump (and they disagreed — combat granted HP,
//! quests didn't). [`apply_level_up`] consolidates that into one path so every
//! level-up is identical regardless of what triggered it, and so a class can
//! define its own per-level growth.

use crate::components::{stat_abbrev, Health, Stats};
use crate::data::StaticRepository;
use bevy_ecs::prelude::*;

/// Engine-default per-level gains for a class that declares no `level_up_gains`.
const DEFAULT_HP_GAIN: i32 = 5;
const DEFAULT_STAT_GAINS: &[(&str, i32)] = &[("attack", 1), ("defense", 1)];

/// Apply one level's worth of gains to the player and return a narrative fragment
/// like "\n\nYou reached level 3! ATK+1, DEF+1, HP+5.".
///
/// Reads the class's `level_up_gains` when present (HP plus any stat keys,
/// including world-defined ones); otherwise falls back to the classic
/// ATK+1/DEF+1/HP+5. Stat gains are applied in sorted key order so the narrative
/// is stable (HashMap iteration order is not).
pub fn apply_level_up(
    world: &mut World,
    player_e: Entity,
    repo: &StaticRepository,
    class_id: &str,
    new_level: u32,
) -> String {
    let custom = repo
        .class(class_id)
        .ok()
        .and_then(|c| c.level_up_gains.clone());

    let (hp_gain, mut stat_gains): (i32, Vec<(String, i32)>) = match custom {
        Some(g) => (g.hp, g.stats.into_iter().collect()),
        None => (
            DEFAULT_HP_GAIN,
            DEFAULT_STAT_GAINS
                .iter()
                .map(|(k, v)| (k.to_string(), *v))
                .collect(),
        ),
    };
    // Sort for a deterministic narrative; the applied state is order-independent.
    stat_gains.sort_by(|a, b| a.0.cmp(&b.0));

    if let Some(mut stats) = world.entity_mut(player_e).get_mut::<Stats>() {
        for (key, amount) in &stat_gains {
            stats.add(key, *amount);
        }
    }
    if hp_gain != 0 {
        if let Some(mut hp) = world.entity_mut(player_e).get_mut::<Health>() {
            hp.max += hp_gain;
            hp.current = (hp.current + hp_gain).min(hp.max);
        }
    }

    let mut parts: Vec<String> = stat_gains
        .iter()
        .filter(|(_, v)| *v != 0)
        .map(|(k, v)| format!("{}+{}", stat_abbrev(k), v))
        .collect();
    if hp_gain != 0 {
        parts.push(format!("HP+{hp_gain}"));
    }
    format!("\n\nYou reached level {new_level}! {}.", parts.join(", "))
}
