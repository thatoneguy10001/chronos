//! Morale (Hope) — a world-state meter that both reflects how the campaign is
//! going and feeds back into the fight.
//!
//! Hope lives in `WorldFlags.int_flags["hope"]`, which is a bevy_ecs Resource and
//! therefore cleared on rewind and rebuilt by replay — so morale is time-travel
//! safe for free. It is raised by quest `hope_reward` (see `quest.rs`) and
//! lowered when the player turns and runs (see the `Flee` handler).
//!
//! Mechanically, morale resolves to a [`MoraleTier`] which grants a small flat
//! attack modifier in combat: a force that believes it can win hits a little
//! harder; one that's breaking hits a little softer. The effect is deliberately
//! small — a thumb on the scale, not a swing.
//!
//! Worlds opt in purely through data: a world that never grants `hope_reward`
//! sits at 0 → `Steady` → no modifier, exactly as if morale didn't exist.

use crate::components::WorldFlags;
use bevy_ecs::prelude::*;

/// The `int_flags` key morale is stored under.
pub const HOPE_KEY: &str = "hope";

/// How much hope a retreat costs. Turning your back on a fight saps resolve.
pub const FLEE_HOPE_COST: i32 = 1;

/// Morale band derived from the current hope value.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MoraleTier {
    /// Hope has gone negative — the line is breaking. Combat penalty.
    Faltering,
    /// The baseline. No modifier. A fresh campaign starts here.
    Steady,
    /// Hope is high — the soldiers believe. Combat bonus.
    Resolute,
}

impl MoraleTier {
    /// Map a raw hope value to a tier. 0–4 is Steady so a new game (hope 0) is
    /// neutral; quests push toward Resolute, retreats toward Faltering.
    pub fn from_hope(hope: i32) -> Self {
        if hope < 0 {
            MoraleTier::Faltering
        } else if hope >= 5 {
            MoraleTier::Resolute
        } else {
            MoraleTier::Steady
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            MoraleTier::Faltering => "Faltering",
            MoraleTier::Steady => "Steady",
            MoraleTier::Resolute => "Resolute",
        }
    }

    /// One-line flavour shown on the character sheet.
    pub fn flavour(self) -> &'static str {
        match self {
            MoraleTier::Faltering => "The line is wavering. Hands shake on triggers.",
            MoraleTier::Steady => "Holding. No more, no less.",
            MoraleTier::Resolute => "They believe they can win. It shows in the fighting.",
        }
    }

    /// Flat attack modifier this morale grants the player in combat.
    pub fn attack_modifier(self) -> i32 {
        match self {
            MoraleTier::Faltering => -1,
            MoraleTier::Steady => 0,
            MoraleTier::Resolute => 1,
        }
    }
}

/// Current hope value (0 if no morale has been tracked yet).
pub fn current_hope(world: &World) -> i32 {
    world
        .get_resource::<WorldFlags>()
        .map(|f| f.get_int(HOPE_KEY))
        .unwrap_or(0)
}

/// Current morale tier derived from hope.
pub fn current_tier(world: &World) -> MoraleTier {
    MoraleTier::from_hope(current_hope(world))
}

/// Adjust hope by a (possibly negative) delta. No-op if WorldFlags is absent.
pub fn adjust_hope(world: &mut World, delta: i32) {
    if let Some(mut flags) = world.get_resource_mut::<WorldFlags>() {
        let v = flags.get_int(HOPE_KEY);
        flags.set_int(HOPE_KEY, v + delta);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tiers_map_from_hope_thresholds() {
        assert_eq!(MoraleTier::from_hope(-3), MoraleTier::Faltering);
        assert_eq!(MoraleTier::from_hope(-1), MoraleTier::Faltering);
        assert_eq!(MoraleTier::from_hope(0), MoraleTier::Steady); // fresh game is neutral
        assert_eq!(MoraleTier::from_hope(4), MoraleTier::Steady);
        assert_eq!(MoraleTier::from_hope(5), MoraleTier::Resolute);
        assert_eq!(MoraleTier::from_hope(99), MoraleTier::Resolute);
    }

    #[test]
    fn attack_modifier_matches_tier() {
        assert_eq!(MoraleTier::Faltering.attack_modifier(), -1);
        assert_eq!(MoraleTier::Steady.attack_modifier(), 0);
        assert_eq!(MoraleTier::Resolute.attack_modifier(), 1);
    }
}
