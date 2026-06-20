use bevy_ecs::prelude::*;
use crate::components::{Controllable, Experience, Health, Identity, Stats};
use crate::data::StaticRepository;
use crate::events::ContextAction;

pub struct SheetResult {
    pub success: bool,
    pub narrative: String,
    pub context_actions: Vec<ContextAction>,
}

/// Read-only view of the player's character sheet. Does not advance the tick.
pub fn process_character_sheet(world: &mut World, repo: &StaticRepository) -> SheetResult {
    let mut q = world.query_filtered::<(&Identity, &Stats, &Health, &Experience), With<Controllable>>();
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
    let atk = stats.attack;
    let def = stats.defense;
    let int = stats.intelligence;
    let hit = stats.hit;
    let tech = stats.tech_attack;
    let eva = stats.evasion;
    let end = stats.endurance;
    let lck = stats.luck;
    let agi = stats.agility;

    let xp_line = match exp.xp_to_next() {
        Some(remaining) => format!("XP {}/{} ({} to next level)", xp, xp + remaining, remaining),
        None => format!("XP {} (max level)", xp),
    };

    let (class_display_name, abilities_section) = if let Ok(class) = repo.class(&class_id) {
        let display = class.name.clone();
        let section = if class.abilities.is_empty() {
            String::new()
        } else {
            let lines: String = class.abilities.iter()
                .map(|a| format!("\n  {} — {}", a.name, a.description))
                .collect();
            format!("\n\nAbilities:{}", lines)
        };
        (display, section)
    } else {
        (class_id.clone(), String::new())
    };

    let narrative = format!(
        "=== {} the {} (Level {}) ===\n\nHP {}/{}  \u{2022}  ATK {}  \u{2022}  DEF {}  \u{2022}  INT {}\nHIT {}  \u{2022}  TECH ATK {}  \u{2022}  EVA {}  \u{2022}  TECH DEF {}  \u{2022}  LCK {}  \u{2022}  AGI {}\n{}{}",
        name, class_display_name, level,
        hp_cur, hp_max, atk, def, int,
        hit, tech, eva, end, lck, agi,
        xp_line,
        abilities_section,
    );

    let context_actions = if let Ok(class) = repo.class(&class_id) {
        class.abilities.iter().map(|a| ContextAction {
            label: a.name.clone(),
            command: a.id.replace('_', " "),
        }).collect()
    } else {
        vec![]
    };

    SheetResult { success: true, narrative, context_actions }
}
