use bevy_ecs::prelude::Resource;

/// Deterministic pseudo-random generator (SplitMix64), stored as a World resource.
///
/// This is the keystone of time-travel-over-combat. The engine re-inserts it with
/// a FIXED seed at every `bootstrap_world`, and the only code allowed to draw from
/// it lives inside `apply_event`. Because a rewind is `bootstrap + replay(events)`,
/// the RNG state becomes a pure function of `(seed, event sequence)` — so replaying
/// the same fight produces the exact same dice, every time.
///
/// INVARIANT: never draw during a read-only operation (`snapshot`, `describe_current`).
/// A stray draw there would desync the stream from the event log and break replay.
#[derive(Resource, Debug, Clone)]
pub struct DeterministicRng {
    state: u64,
}

impl DeterministicRng {
    pub fn new(seed: u64) -> Self {
        Self { state: seed }
    }

    /// SplitMix64 — small, fast, and good enough for combat dice. No external crate
    /// (and crucially no `getrandom`, which we never want feeding gameplay rolls).
    pub fn next_u64(&mut self) -> u64 {
        self.state = self.state.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.state;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    /// Inclusive integer in `[lo, hi]`. Mirrors Python's `random.randint`.
    pub fn range_inclusive(&mut self, lo: i32, hi: i32) -> i32 {
        if hi <= lo {
            return lo;
        }
        let span = (hi - lo + 1) as u64;
        lo + (self.next_u64() % span) as i32
    }
}
