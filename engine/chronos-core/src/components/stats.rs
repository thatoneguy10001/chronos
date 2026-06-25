use bevy_ecs::component::Component;
use std::collections::HashMap;
use std::ops::{Index, IndexMut};

/// Canonical stat keys used by the built-in (Iron & Blood / Millbrook) rule set.
///
/// These are the stats the default combat/progression layers read. Worlds are
/// free to define *additional* keys — a JRPG world might add `"magic_power"`, an
/// SRPG world `"movement_range"` — and store them in the same map. Nothing here
/// is special-cased at the storage layer; these constants exist only so the
/// built-in systems refer to stats by a single source of truth instead of bare
/// string literals scattered across the codebase.
pub mod stat_keys {
    pub const ATTACK: &str = "attack";
    pub const DEFENSE: &str = "defense";
    pub const INTELLIGENCE: &str = "intelligence";
    pub const HIT: &str = "hit";
    pub const TECH_ATTACK: &str = "tech_attack";
    pub const EVASION: &str = "evasion";
    pub const ENDURANCE: &str = "endurance";
    pub const LUCK: &str = "luck";
    pub const AGILITY: &str = "agility";
}

/// Combat stats shared by every fighting entity — players and enemies alike.
///
/// Backed by a `name -> value` map rather than a fixed struct, so a world can
/// define whatever stats its genre needs without an engine change. Missing keys
/// read as `0`, so a system asking for a stat a world didn't define just sees
/// zero rather than erroring — exactly how an unset numeric stat should behave.
///
/// Call sites stay readable through two ergonomic layers:
/// - **Typed accessors** (`stats.attack()`, `stats.defense()`, …) for the
///   canonical stats — these are just `get(stat_keys::X)` with a friendly name.
/// - **Indexing** (`stats["attack"]`, `stats["attack"] += 3`) for arithmetic and
///   for world-defined keys. `IndexMut` auto-creates a key at `0` on first write.
#[derive(Component, Debug, Clone, Default, PartialEq, Eq)]
pub struct Stats {
    values: HashMap<String, i32>,
}

impl Stats {
    /// An empty stat block — every stat reads as 0 until set.
    pub fn new() -> Self {
        Self::default()
    }

    /// Build a stat block from a `name -> value` map (e.g. a class's `base_stats`).
    pub fn from_map(values: HashMap<String, i32>) -> Self {
        Self { values }
    }

    /// Read a stat by name. Unset stats read as 0.
    pub fn get(&self, key: &str) -> i32 {
        self.values.get(key).copied().unwrap_or(0)
    }

    /// Set a stat to an absolute value.
    pub fn set(&mut self, key: &str, value: i32) {
        self.values.insert(key.to_string(), value);
    }

    /// Add a (possibly negative) delta to a stat. The result may go negative —
    /// use [`Stats::add_clamped`] when a stat must never drop below zero.
    pub fn add(&mut self, key: &str, delta: i32) {
        let next = self.get(key) + delta;
        self.set(key, next);
    }

    /// Add a delta but floor the result at 0. Used by status-effect application
    /// and reversal, where a debuff must never push a stat negative.
    pub fn add_clamped(&mut self, key: &str, delta: i32) {
        let next = (self.get(key) + delta).max(0);
        self.set(key, next);
    }

    /// Iterate every defined stat as `(name, value)`.
    pub fn iter(&self) -> impl Iterator<Item = (&String, &i32)> {
        self.values.iter()
    }

    // --- Typed accessors for the canonical stats (readability sugar) ---------
    pub fn attack(&self) -> i32 {
        self.get(stat_keys::ATTACK)
    }
    pub fn defense(&self) -> i32 {
        self.get(stat_keys::DEFENSE)
    }
    pub fn intelligence(&self) -> i32 {
        self.get(stat_keys::INTELLIGENCE)
    }
    pub fn hit(&self) -> i32 {
        self.get(stat_keys::HIT)
    }
    pub fn tech_attack(&self) -> i32 {
        self.get(stat_keys::TECH_ATTACK)
    }
    pub fn evasion(&self) -> i32 {
        self.get(stat_keys::EVASION)
    }
    pub fn endurance(&self) -> i32 {
        self.get(stat_keys::ENDURANCE)
    }
    pub fn luck(&self) -> i32 {
        self.get(stat_keys::LUCK)
    }
    pub fn agility(&self) -> i32 {
        self.get(stat_keys::AGILITY)
    }
}

impl Index<&str> for Stats {
    type Output = i32;
    /// Read access. Missing keys read as 0 (integer-literal references are
    /// promoted to `'static`, so returning `&0` is sound).
    fn index(&self, key: &str) -> &i32 {
        self.values.get(key).unwrap_or(&0)
    }
}

impl IndexMut<&str> for Stats {
    /// Mutable access for in-place arithmetic (`stats["attack"] += 3`). A key that
    /// doesn't exist yet is created at 0 so the `+=` has something to add to.
    fn index_mut(&mut self, key: &str) -> &mut i32 {
        self.values.entry(key.to_string()).or_insert(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unset_stats_read_as_zero() {
        let s = Stats::new();
        assert_eq!(s.get("attack"), 0);
        assert_eq!(s.attack(), 0);
        assert_eq!(s["anything"], 0);
    }

    #[test]
    fn typed_accessors_match_string_keys() {
        let mut s = Stats::new();
        s.set(stat_keys::ATTACK, 12);
        s.set(stat_keys::AGILITY, 7);
        assert_eq!(s.attack(), 12);
        assert_eq!(s.get("attack"), 12);
        assert_eq!(s.agility(), 7);
    }

    #[test]
    fn add_and_clamp_behave_independently() {
        let mut s = Stats::new();
        s.set("defense", 3);
        s.add("defense", -10); // add allows negative
        assert_eq!(s.get("defense"), -7);

        s.set("hit", 2);
        s.add_clamped("hit", -10); // clamp floors at 0
        assert_eq!(s.get("hit"), 0);
    }

    #[test]
    fn index_mut_supports_in_place_arithmetic() {
        let mut s = Stats::new();
        s["attack"] += 5; // auto-creates at 0, then adds
        s["attack"] += 1;
        assert_eq!(s.attack(), 6);
    }

    #[test]
    fn world_defined_stats_are_first_class() {
        // A world the engine has never heard of can define its own stat names;
        // they store, read, and mutate exactly like the canonical ones.
        let mut s = Stats::from_map(HashMap::from([
            ("magic_power".to_string(), 40),
            ("movement_range".to_string(), 5),
        ]));
        assert_eq!(s.get("magic_power"), 40);
        s.add("magic_power", 10);
        assert_eq!(s.get("magic_power"), 50);
        assert_eq!(s["movement_range"], 5);
        // Canonical accessors still read 0 for a world that didn't define them.
        assert_eq!(s.attack(), 0);
    }
}
