use bevy_ecs::prelude::Component;

/// XP thresholds to reach each level. Index N is XP needed to attain level N+2
/// (so index 0 = XP for level 2, index 1 = XP for level 3, etc.).
/// Adapted from the Python RPG's `LEVEL_THRESHOLDS` in `progression/impl/rules.py`.
const XP_THRESHOLDS: &[i32] = &[100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500];

/// Tracks XP and level for the player. Attached by SpawnCharacter and reset on recast.
#[derive(Component, Debug, Clone)]
pub struct Experience {
    pub xp: i32,
    pub level: u32,
}

impl Experience {
    pub fn new() -> Self {
        Self { xp: 0, level: 1 }
    }

    /// Add XP. Returns the new level if a level-up occurred, otherwise None.
    pub fn add_xp(&mut self, amount: i32) -> Option<u32> {
        self.xp += amount;
        let old_level = self.level;
        // Each threshold is the total XP needed to reach the next level.
        while let Some(&threshold) = XP_THRESHOLDS.get((self.level - 1) as usize) {
            if self.xp >= threshold {
                self.level += 1;
            } else {
                break;
            }
        }
        if self.level > old_level { Some(self.level) } else { None }
    }

    /// XP remaining until next level, or None if already at max.
    pub fn xp_to_next(&self) -> Option<i32> {
        XP_THRESHOLDS.get((self.level - 1) as usize).map(|&t| t - self.xp)
    }
}
