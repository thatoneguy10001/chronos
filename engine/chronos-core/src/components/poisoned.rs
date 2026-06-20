use bevy_ecs::component::Component;

/// An active poison effect. Damage ticks on turns `applied_at_tick+1` through
/// `applied_at_tick+duration_turns`. Deterministic — no RNG — so it replays
/// identically under rewind. At the end of the duration, the component is removed.
#[derive(Component, Debug, Clone)]
pub struct Poisoned {
    /// The tick on which poison was applied. Damage starts on `applied_at_tick+1`.
    pub applied_at_tick: u64,
    /// Damage dealt each turn while poisoned.
    pub damage_per_turn: i32,
    /// Total number of turns (ticks) poison lasts.
    pub duration_turns: u32,
}

impl Poisoned {
    /// The tick on which this poison will stop ticking (inclusive).
    pub fn end_tick(&self) -> u64 {
        self.applied_at_tick + self.duration_turns as u64
    }

    /// Whether poison is ticking on the given tick.
    pub fn is_ticking_on(&self, current_tick: u64) -> bool {
        let start = self.applied_at_tick + 1;
        let end = self.end_tick();
        current_tick >= start && current_tick <= end
    }
}
