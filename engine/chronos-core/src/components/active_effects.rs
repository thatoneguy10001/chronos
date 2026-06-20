use bevy_ecs::prelude::Component;
use serde::{Deserialize, Serialize};

/// All active status effects on an entity. Spawned empty; effects are pushed/pruned each tick.
#[derive(Component, Debug, Clone, Default)]
pub struct ActiveEffects {
    pub effects: Vec<ActiveEffect>,
}

impl ActiveEffects {
    /// Add an effect. Most kinds replace on reapply; Bleed stacks up to 3×, Corrode up to 2×.
    /// Hemotoxin is permanent — ignored if already present.
    pub fn apply(&mut self, effect: ActiveEffect) {
        match effect.kind {
            EffectKind::Bleed => {
                let stacks = self.effects.iter().filter(|e| e.kind == EffectKind::Bleed).count();
                if stacks < 3 {
                    self.effects.push(effect);
                }
            }
            EffectKind::Corrode => {
                let stacks = self.effects.iter().filter(|e| e.kind == EffectKind::Corrode).count();
                if stacks < 2 {
                    self.effects.push(effect);
                }
            }
            // Hemotoxin cannot be removed or re-applied once active.
            EffectKind::Hemotoxin => {
                if !self.effects.iter().any(|e| e.kind == EffectKind::Hemotoxin) {
                    self.effects.push(effect);
                }
            }
            _ => {
                self.effects.retain(|e| e.kind != effect.kind);
                self.effects.push(effect);
            }
        }
    }

    /// Whether any effect of the given kind is currently active on `tick`.
    pub fn has_active(&self, kind: &EffectKind, tick: u64) -> bool {
        self.effects.iter().any(|e| e.kind == *kind && e.is_active_on(tick))
    }

    /// Stack count for stackable effects (Bleed/Corrode). Returns 1 for all others.
    pub fn stack_count(&self, kind: &EffectKind) -> usize {
        self.effects.iter().filter(|e| &e.kind == kind).count().max(1)
    }
}

/// One active status effect instance.
#[derive(Debug, Clone)]
pub struct ActiveEffect {
    pub kind: EffectKind,
    /// Tick the effect was applied. Damage/debuff starts on `applied_at_tick + 1`.
    pub applied_at_tick: u64,
    /// Number of turns the effect lasts.
    pub duration_turns: u32,
    /// Magnitude: damage per turn for DoTs; stat delta for buff/debuff kinds.
    pub magnitude: i32,
}

impl ActiveEffect {
    pub fn end_tick(&self) -> u64 {
        // Hemotoxin never expires naturally (u64::MAX simulates permanence).
        if self.kind == EffectKind::Hemotoxin {
            return u64::MAX;
        }
        self.applied_at_tick + self.duration_turns as u64
    }

    pub fn is_active_on(&self, tick: u64) -> bool {
        tick >= self.applied_at_tick + 1 && tick <= self.end_tick()
    }
}

/// All available status effect types.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EffectKind {
    // --- DoT effects ---
    Poison,
    Burn,
    Bleed,
    /// Stackable (max 2×). DoT + reduces Stats.defense by magnitude. Reversed on expiry.
    Corrode,
    /// Permanent DoT. Cannot be removed. Also reduces Stats.hit.
    Hemotoxin,
    /// DoT that can spread to adjacent enemies on death (spreading handled by combat system).
    Plague,

    // --- Stat debuffs (applied immediately to Stats, reversed on expiry) ---
    Blind,      // -Stats.hit
    Chill,      // -Stats.agility
    Frozen,     // Stats.agility → 0 (immobilize)
    Weaken,     // -Stats.attack

    // --- Stat buffs (applied immediately to Stats, reversed on expiry) ---
    DefenseUp,
    AttackUp,
    TechUp,
    AgilityUp,
    LuckUp,

    // --- CC (no stat mutation; checked by combat system each turn) ---
    Stun,
}

impl EffectKind {
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().replace('-', "_").as_str() {
            "poison"     => Some(Self::Poison),
            "burn"       => Some(Self::Burn),
            "bleed"      => Some(Self::Bleed),
            "corrode"    => Some(Self::Corrode),
            "hemotoxin"  => Some(Self::Hemotoxin),
            "plague"     => Some(Self::Plague),
            "blind"      => Some(Self::Blind),
            "chill"      => Some(Self::Chill),
            "frozen"     => Some(Self::Frozen),
            "weaken"     => Some(Self::Weaken),
            "defense_up" => Some(Self::DefenseUp),
            "attack_up"  => Some(Self::AttackUp),
            "tech_up"    => Some(Self::TechUp),
            "agility_up" => Some(Self::AgilityUp),
            "luck_up"    => Some(Self::LuckUp),
            "stun"       => Some(Self::Stun),
            _ => None,
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            Self::Poison     => "Poison",
            Self::Burn       => "Burn",
            Self::Bleed      => "Bleed",
            Self::Corrode    => "Corrode",
            Self::Hemotoxin  => "Hemotoxin",
            Self::Plague     => "Plague",
            Self::Blind      => "Blind",
            Self::Chill      => "Chill",
            Self::Frozen     => "Frozen",
            Self::Weaken     => "Weaken",
            Self::DefenseUp  => "Defense Up",
            Self::AttackUp   => "Attack Up",
            Self::TechUp     => "Tech Up",
            Self::AgilityUp  => "Agility Up",
            Self::LuckUp     => "Luck Up",
            Self::Stun       => "Stunned",
        }
    }

    /// Whether the effect deals damage per tick.
    pub fn is_dot(&self) -> bool {
        matches!(self, Self::Poison | Self::Burn | Self::Bleed | Self::Corrode | Self::Hemotoxin | Self::Plague)
    }

    /// Whether the effect mutates a stat on the Stats component directly.
    /// Returns (field_sign, stat_name) — sign +1 for buff, -1 for debuff.
    pub fn stat_mutation(&self) -> Option<StatMutation> {
        match self {
            Self::DefenseUp  => Some(StatMutation { stat: StatField::Defense,    sign: 1  }),
            Self::AttackUp   => Some(StatMutation { stat: StatField::Attack,     sign: 1  }),
            Self::TechUp     => Some(StatMutation { stat: StatField::TechAttack, sign: 1  }),
            Self::AgilityUp  => Some(StatMutation { stat: StatField::Agility,    sign: 1  }),
            Self::LuckUp     => Some(StatMutation { stat: StatField::Luck,       sign: 1  }),
            Self::Blind      => Some(StatMutation { stat: StatField::Hit,        sign: -1 }),
            Self::Chill      => Some(StatMutation { stat: StatField::Agility,    sign: -1 }),
            Self::Frozen     => Some(StatMutation { stat: StatField::Agility,    sign: -1 }),
            Self::Weaken     => Some(StatMutation { stat: StatField::Attack,     sign: -1 }),
            Self::Corrode    => Some(StatMutation { stat: StatField::Defense,    sign: -1 }),
            Self::Hemotoxin  => Some(StatMutation { stat: StatField::Hit,        sign: -1 }),
            _ => None,
        }
    }

    /// Whether the effect targets the caster rather than an enemy.
    pub fn is_self_targeting(&self) -> bool {
        matches!(self, Self::DefenseUp | Self::AttackUp | Self::TechUp | Self::AgilityUp | Self::LuckUp)
    }
}

#[derive(Debug, Clone, Copy)]
pub struct StatMutation {
    pub stat: StatField,
    pub sign: i32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StatField {
    Attack,
    Defense,
    Hit,
    TechAttack,
    Agility,
    Luck,
}
