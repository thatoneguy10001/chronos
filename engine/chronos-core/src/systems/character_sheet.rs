//! Character sheet — read-only stat display for the `sheet` / `stats` command.
//!
//! Formats a human-readable block of the player's current stats: level, XP
//! to next level, HP, attack, defense, hit chance, evasion, luck, and equipped
//! items. Does not advance the tick or modify any state.

use crate::components::{
    AssembledWeapon, Controllable, EquipmentSlots, Experience, Health, Identity, Stats,
};
use crate::data::StaticRepository;
use crate::events::ContextAction;
use bevy_ecs::prelude::*;

pub struct SheetResult {
    pub success: bool,
    pub narrative: String,
    pub context_actions: Vec<ContextAction>,
}

/// Read-only view of the player's character sheet. Does not advance the tick.
pub fn process_character_sheet(world: &mut World, repo: &StaticRepository) -> SheetResult {
    let mut q =
        world.query_filtered::<(&Identity, &Stats, &Health, &Experience), With<Controllable>>();
    let Some((id, stats, hp, exp)) = q.iter(world).next() else {
        return SheetResult {
            success: false,
            narrative: "You have no character yet. Try: become fighter\nType 'help' to see all available classes.".to_string(),
            context_actions: vec![],
        };
    };

    let class_id = id.class_id.clone();
    let name = id.name.clone();
    let level = exp.level;
    let xp = exp.xp;
    let hp_cur = hp.current;
    let hp_max = hp.max;
    let atk = stats.attack();
    let def = stats.defense();
    let int = stats.intelligence();
    let hit = stats.hit();
    let tech = stats.tech_attack();
    let eva = stats.evasion();
    let end = stats.endurance();
    let lck = stats.luck();
    let agi = stats.agility();

    let xp_line = match exp.xp_to_next() {
        Some(remaining) => format!("XP {}/{} ({} to next level)", xp, xp + remaining, remaining),
        None => format!("XP {} (max level)", xp),
    };

    // Collect the player's equipped items and any assembled-weapon display data,
    // so the sheet can show not just *what* is equipped but what each piece does.
    let equipment = {
        let mut q = world.query_filtered::<&EquipmentSlots, With<Controllable>>();
        q.iter(world).next().cloned()
    };
    let assembled: Vec<(String, String, i32)> = {
        let mut q = world.query::<&AssembledWeapon>();
        q.iter(world)
            .map(|aw| {
                (
                    aw.weapon_id.clone(),
                    aw.display_name.clone(),
                    aw.attack_bonus,
                )
            })
            .collect()
    };
    let equipped_section = equipment
        .map(|eq| {
            let slots = [
                ("Weapon", &eq.weapon),
                ("Head", &eq.head),
                ("Body", &eq.body),
                ("Hands", &eq.hands),
                ("Feet", &eq.feet),
                ("Accessory", &eq.accessory_1),
                ("Accessory", &eq.accessory_2),
            ];
            let lines: String = slots
                .iter()
                .filter_map(|(label, opt)| {
                    opt.as_ref().map(|id| {
                        format!("\n  {}: {}", label, describe_equipped(id, repo, &assembled))
                    })
                })
                .collect();
            if lines.is_empty() {
                String::new()
            } else {
                format!("\n\nEquipped:{lines}")
            }
        })
        .unwrap_or_default();

    let (class_display_name, abilities_section) = if let Ok(class) = repo.class(&class_id) {
        let display = class.name.clone();
        let section = if class.abilities.is_empty() {
            String::new()
        } else {
            let lines: String = class
                .abilities
                .iter()
                .map(|a| format!("\n  {} — {}", a.name, a.description))
                .collect();
            format!("\n\nAbilities:{}", lines)
        };
        (display, section)
    } else {
        (class_id.clone(), String::new())
    };

    let secondary: Vec<String> = [
        ("HIT", hit),
        ("TECH ATK", tech),
        ("EVA", eva),
        ("TECH DEF", end),
        ("LCK", lck),
        ("AGI", agi),
    ]
    .iter()
    .filter(|(_, v)| *v != 0)
    .map(|(l, v)| format!("{} {}", l, v))
    .collect();
    let secondary_line = if secondary.is_empty() {
        String::new()
    } else {
        format!("\n{}", secondary.join("  \u{2022}  "))
    };
    let narrative = format!(
        "=== {} the {} (Level {}) ===\n\nHP {}/{}  \u{2022}  ATK {}  \u{2022}  DEF {}  \u{2022}  INT {}{}\n{}{}{}",
        name, class_display_name, level,
        hp_cur, hp_max, atk, def, int,
        secondary_line,
        xp_line,
        equipped_section,
        abilities_section,
    );

    let context_actions = if let Ok(class) = repo.class(&class_id) {
        class
            .abilities
            .iter()
            .map(|a| ContextAction {
                label: a.name.clone(),
                command: a.id.replace('_', " "),
            })
            .collect()
    } else {
        vec![]
    };

    SheetResult {
        success: true,
        narrative,
        context_actions,
    }
}

/// Describe an equipped item as "Name (+N STAT)", resolving assembled weapons
/// (the weapon slot may hold "assembled:<id>") and reading the passive
/// equip_stat/equip_bonus attributes off plain items. Falls back to just the
/// name (or the raw id) when no bonus is declared.
fn describe_equipped(
    item_id: &str,
    repo: &StaticRepository,
    assembled: &[(String, String, i32)],
) -> String {
    if let Some(wid) = item_id.strip_prefix("assembled:") {
        return assembled
            .iter()
            .find(|(k, _, _)| k == wid)
            .map(|(_, name, bonus)| format!("{name} (+{bonus} ATK)"))
            .unwrap_or_else(|| wid.to_string());
    }
    match repo.item(item_id) {
        Ok(t) => {
            let stat = t.attributes.get("equip_stat").and_then(|v| v.as_str());
            let bonus = t.attributes.get("equip_bonus").and_then(|v| v.as_i64());
            match (stat, bonus) {
                (Some(s), Some(b)) => format!("{} (+{} {})", t.name, b, stat_abbrev(s)),
                _ => t.name.clone(),
            }
        }
        Err(_) => item_id.to_string(),
    }
}

/// Short uppercase abbreviation for a stat key, for equip annotations.
fn stat_abbrev(key: &str) -> String {
    match key {
        "attack" => "ATK".to_string(),
        "defense" => "DEF".to_string(),
        "intelligence" => "INT".to_string(),
        "tech_attack" => "TECH ATK".to_string(),
        "evasion" => "EVA".to_string(),
        "endurance" => "TECH DEF".to_string(),
        "agility" => "AGI".to_string(),
        "luck" => "LCK".to_string(),
        "hit" => "HIT".to_string(),
        other => other.to_uppercase(),
    }
}
