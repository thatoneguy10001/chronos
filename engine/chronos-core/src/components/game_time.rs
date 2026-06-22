use bevy_ecs::prelude::*;
use serde::{Deserialize, Serialize};

/// In-game clock, tracked in minutes since game start.
/// Starts at 360 (06:00 Day 1). Advances per event type, not per tick —
/// a combat round costs 1 min, moving a room costs 15 min, resting skips to dawn.
/// This is a World Resource, not a Component: one instance per game, replayed
/// deterministically alongside the event log.
#[derive(Resource, Clone, Debug, Serialize, Deserialize)]
pub struct GameTime {
    pub minutes: u32,
}

impl Default for GameTime {
    fn default() -> Self {
        Self::starting()
    }
}

impl GameTime {
    pub fn starting() -> Self {
        Self { minutes: 360 } // 06:00 Day 1
    }

    pub fn hour(&self) -> u32 {
        (self.minutes % 1440) / 60
    }
    pub fn minute_of_hour(&self) -> u32 {
        self.minutes % 60
    }
    pub fn day(&self) -> u32 {
        self.minutes / 1440 + 1
    }

    pub fn is_night(&self) -> bool {
        let h = self.hour();
        !(6..20).contains(&h)
    }

    pub fn advance(&mut self, mins: u32) {
        self.minutes += mins;
    }

    /// Jump forward to the next 06:00 (dawn). Used by the Rest action.
    pub fn skip_to_dawn(&mut self) {
        let day_minutes = self.minutes % 1440;
        let dawn = 360u32; // 06:00
        if day_minutes < dawn {
            self.minutes += dawn - day_minutes;
        } else {
            self.minutes += 1440 - day_minutes + dawn;
        }
    }

    /// Jump forward to the next 20:00 (dusk). Used by the Wait action.
    pub fn skip_to_dusk(&mut self) {
        let day_minutes = self.minutes % 1440;
        let dusk = 1200u32; // 20:00
        if day_minutes < dusk {
            self.minutes += dusk - day_minutes;
        } else {
            // Already past dusk — skip to dusk of the next day.
            self.minutes += 1440 - day_minutes + dusk;
        }
    }

    pub fn time_of_day_label(&self) -> &'static str {
        let h = self.hour();
        match h {
            6..=11 => "morning",
            12..=17 => "afternoon",
            18..=19 => "evening",
            20..=23 => "night",
            _ => "before dawn",
        }
    }
}
