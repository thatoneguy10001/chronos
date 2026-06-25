//! Quest system — accept, track, and turn in quests.
//!
//! # Lifecycle
//!
//! 1. `process_accept_quest` — player must be in the giver NPC's room.
//!    Gates: prerequisite quest completion, night-only Armistice quests.
//! 2. `on_player_entered_room` / `on_npc_talked_to` / `on_enemy_killed` —
//!    event hooks called from `lib.rs` after the relevant system runs.
//!    These advance `progress` on active quests and flip `ready_to_turn_in`.
//! 3. `process_turn_in` — player must be back in the giver's room. On success:
//!    grants gold + XP, checks level-up, sets a `{quest_id}_turned_in` WorldFlag
//!    so downstream quests and dialogue gates can unlock.
//!
//! # WorldFlags
//!
//! Every turned-in quest sets `{id}_turned_in` on the `WorldFlags` resource.
//! Quest chains use `requires_quest_complete` fields that check these flags.
//! Dialogue topic gating also reads them via `requires_quest_complete`.

use crate::components::{
    Controllable, Experience, GameTime, Position, QuestEntry, QuestLog, Stats, Wallet, WorldFlags,
};
use crate::data::{schemas::QuestObjective, StaticRepository};
use crate::events::ContextAction;
use bevy_ecs::prelude::*;

pub struct QuestResult {
    pub success: bool,
    pub narrative: String,
    pub context_actions: Vec<ContextAction>,
}

/// Accept a quest from an NPC. Player must be in the NPC's room.
pub fn process_accept_quest(
    world: &mut World,
    repo: &StaticRepository,
    quest_id: &str,
) -> QuestResult {
    let template = match repo.quest(quest_id) {
        Some(q) => q.clone(),
        None => return err(&format!("Unknown quest '{quest_id}'.")),
    };

    // Check quest prerequisite gate before checking location.
    for req_id in &template.requires_quest_complete {
        let flag_set = world
            .get_resource::<WorldFlags>()
            .map(|f| f.is_set(&format!("{req_id}_turned_in")))
            .unwrap_or(false);
        if !flag_set {
            let npc_name = repo
                .npc(&template.giver_npc_id)
                .map(|n| n.name.as_str())
                .unwrap_or("the quest giver");
            return err(&format!(
                "{} isn't ready to offer you this quest yet.",
                npc_name
            ));
        }
    }

    // Check night gating for Armistice quests.
    if template.requires_night {
        let is_night = world
            .get_resource::<GameTime>()
            .map(|gt| gt.is_night())
            .unwrap_or(false);
        if !is_night {
            return err("This quest is only available during the Armistice — after dusk. Type 'wait' to pass time.");
        }
    }

    let npc_room = repo.npc_room(&template.giver_npc_id);
    let player_room = {
        let mut q = world.query_filtered::<&Position, With<Controllable>>();
        q.iter(world).next().map(|p| p.room_id.clone())
    };
    if player_room.as_deref() != npc_room {
        let npc_name = repo
            .npc(&template.giver_npc_id)
            .map(|n| n.name.as_str())
            .unwrap_or("the quest giver");
        return err(&format!(
            "You need to speak with {} to accept this quest.",
            npc_name
        ));
    }

    let player_e = {
        let mut q = world.query_filtered::<Entity, With<Controllable>>();
        q.iter(world).next()
    };
    let Some(player_e) = player_e else {
        return err("No character to assign a quest to.");
    };

    if let Some(mut log) = world.entity_mut(player_e).get_mut::<QuestLog>() {
        if log.has_any(&template.id) {
            let status = if log.is_completed(&template.id) {
                "already completed"
            } else {
                "already active"
            };
            return err(&format!("Quest '{}' is {}.", template.name, status));
        }
        log.entries.push(QuestEntry {
            quest_id: template.id.clone(),
            progress: 0,
            ready_to_turn_in: false,
            completed: false,
        });
    }

    let objective_desc = match &template.objective {
        QuestObjective::KillCount { class_id, count } => {
            let class_name = repo
                .class(class_id)
                .map(|c| c.name.clone())
                .unwrap_or_else(|_| class_id.clone());
            format!("Slay {} {} (0/{})", count, class_name, count)
        }
        QuestObjective::ReachRoom { room_id } => {
            let room_name = repo
                .room(room_id)
                .map(|r| r.name.clone())
                .unwrap_or_else(|_| room_id.clone());
            format!("Reach: {}", room_name)
        }
        QuestObjective::TalkTo { npc_id } => {
            let npc_name = repo
                .npc(npc_id)
                .map(|n| n.name.clone())
                .unwrap_or_else(|_| npc_id.clone());
            format!("Talk to: {}", npc_name)
        }
    };

    let accept_text = if template.accept_text.is_empty() {
        format!("Quest accepted: {}", template.name)
    } else {
        template.accept_text.clone()
    };

    let npc_name = repo
        .npc(&template.giver_npc_id)
        .map(|n| n.name.clone())
        .unwrap_or_else(|_| template.giver_npc_id.clone());

    QuestResult {
        success: true,
        narrative: format!(
            "{}\n\n**{}** — {}\nObjective: {}\nReward: {} scraps, {} XP\n\nReturn to {} when done.",
            accept_text,
            template.name,
            template.description,
            objective_desc,
            template.gold_reward,
            template.xp_reward,
            npc_name
        ),
        context_actions: vec![],
    }
}

/// Show the player's quest log.
pub fn process_quest_log(world: &mut World, repo: &StaticRepository) -> QuestResult {
    let player_e = {
        let mut q = world.query_filtered::<Entity, With<Controllable>>();
        q.iter(world).next()
    };
    let Some(player_e) = player_e else {
        return err("No character.");
    };

    let log = match world.entity(player_e).get::<QuestLog>() {
        Some(l) => l.entries.clone(),
        None => return err("No quest log."),
    };

    if log.is_empty() {
        return QuestResult {
            success: true,
            narrative: "You have no active quests. Speak with a quest giver to find work."
                .to_string(),
            context_actions: vec![],
        };
    }

    let mut lines = vec!["── QUEST LOG ──".to_string(), String::new()];
    let mut actions = vec![];

    for entry in &log {
        if let Some(template) = repo.quest(&entry.quest_id) {
            let status_icon = if entry.completed {
                "✓"
            } else if entry.ready_to_turn_in {
                "★"
            } else {
                "●"
            };

            lines.push(format!("{} {}", status_icon, template.name));

            if entry.completed {
                lines.push("  COMPLETED".to_string());
            } else if entry.ready_to_turn_in {
                let npc_name = repo
                    .npc(&template.giver_npc_id)
                    .map(|n| n.name.clone())
                    .unwrap_or_else(|_| template.giver_npc_id.clone());
                lines.push(format!(
                    "  ★ RETURN TO {} TO COLLECT REWARD",
                    npc_name.to_uppercase()
                ));
                lines.push(format!(
                    "  Waiting: {} scraps, {} XP",
                    template.gold_reward, template.xp_reward
                ));
                actions.push(ContextAction {
                    label: format!("Turn in to {}", npc_name),
                    command: format!("turn in {}", template.id.replace('_', " ")),
                });
            } else {
                let progress_desc = match &template.objective {
                    QuestObjective::KillCount { class_id, count } => {
                        let class_name = repo
                            .class(class_id)
                            .map(|c| c.name.clone())
                            .unwrap_or_else(|_| class_id.clone());
                        format!(
                            "  Kill {} {} ({}/{})",
                            count, class_name, entry.progress, count
                        )
                    }
                    QuestObjective::ReachRoom { room_id } => {
                        let room_name = repo
                            .room(room_id)
                            .map(|r| r.name.clone())
                            .unwrap_or_else(|_| room_id.clone());
                        format!("  Reach: {}", room_name)
                    }
                    QuestObjective::TalkTo { npc_id } => {
                        let npc_name = repo
                            .npc(npc_id)
                            .map(|n| n.name.clone())
                            .unwrap_or_else(|_| npc_id.clone());
                        format!("  Talk to: {}", npc_name)
                    }
                };
                lines.push(progress_desc);
                lines.push(format!(
                    "  Reward: {} scraps, {} XP",
                    template.gold_reward, template.xp_reward
                ));
            }
            lines.push(String::new());
        }
    }

    QuestResult {
        success: true,
        narrative: lines.join("\n"),
        context_actions: actions,
    }
}

/// Turn in a quest whose objective is met. Player must be in the giver's room.
/// This is the only moment rewards are awarded.
pub fn process_turn_in(world: &mut World, repo: &StaticRepository, quest_id: &str) -> QuestResult {
    let player_e = {
        let mut q = world.query_filtered::<Entity, With<Controllable>>();
        q.iter(world).next()
    };
    let Some(player_e) = player_e else {
        return err("No character.");
    };

    let template = match repo.quest(quest_id) {
        Some(t) => t.clone(),
        None => return err(&format!("Unknown quest '{quest_id}'.")),
    };

    // Validate quest state
    let quest_state = world.entity(player_e).get::<QuestLog>().and_then(|ql| {
        ql.entries
            .iter()
            .find(|e| e.quest_id == quest_id)
            .map(|e| (e.ready_to_turn_in, e.completed))
    });
    match quest_state {
        None => {
            return err(&format!(
                "You haven't accepted the quest '{}'.",
                template.name
            ))
        }
        Some((_, true)) => return err(&format!("You have already turned in '{}'.", template.name)),
        Some((false, false)) => {
            return err(&format!("'{}' is not ready to turn in yet.", template.name))
        }
        Some((true, false)) => {} // proceed
    }

    // Check player is in the giver's room
    let player_room = {
        let mut q = world.query_filtered::<&Position, With<Controllable>>();
        q.iter(world).next().map(|p| p.room_id.clone())
    };
    let npc_room = repo.npc_room(&template.giver_npc_id);
    if player_room.as_deref() != npc_room {
        let npc_name = repo
            .npc(&template.giver_npc_id)
            .map(|n| n.name.as_str())
            .unwrap_or("the quest giver");
        return err(&format!(
            "You need to return to {} to turn in this quest.",
            npc_name
        ));
    }

    // Mark completed
    if let Some(mut log) = world.entity_mut(player_e).get_mut::<QuestLog>() {
        if let Some(entry) = log.entries.iter_mut().find(|e| e.quest_id == quest_id) {
            entry.completed = true;
            entry.ready_to_turn_in = false;
        }
    }

    // Award gold
    if template.gold_reward > 0 {
        if let Some(mut wallet) = world.entity_mut(player_e).get_mut::<Wallet>() {
            wallet.gold += template.gold_reward;
        }
    }

    // Award XP + level-up
    let level_up: Option<u32> = if template.xp_reward > 0 {
        world
            .entity_mut(player_e)
            .get_mut::<Experience>()
            .and_then(|mut exp| exp.add_xp(template.xp_reward))
    } else {
        None
    };
    if level_up.is_some() {
        if let Some(mut st) = world.entity_mut(player_e).get_mut::<Stats>() {
            st["attack"] += 1;
            st["defense"] += 1;
        }
    }

    // Set the world flag so NPCs and rooms can react
    if let Some(mut flags) = world.get_resource_mut::<WorldFlags>() {
        flags.set(&format!("{quest_id}_turned_in"));
        if template.hope_reward > 0 {
            for _ in 0..template.hope_reward {
                flags.increment("hope");
            }
        }
    }

    let complete_text = if template.complete_text.is_empty() {
        format!("Quest complete: {}!", template.name)
    } else {
        template.complete_text.clone()
    };

    let npc_name = repo
        .npc(&template.giver_npc_id)
        .map(|n| n.name.clone())
        .unwrap_or_else(|_| template.giver_npc_id.clone());

    let mut narrative = format!(
        "{}\n\n+{} scraps, +{} XP",
        complete_text, template.gold_reward, template.xp_reward
    );
    if let Some(new_level) = level_up {
        narrative.push_str(&format!(
            "\nLevel up! Reached level {}! (+1 ATK, +1 DEF)",
            new_level
        ));
    }

    QuestResult {
        success: true,
        narrative,
        context_actions: vec![ContextAction {
            label: format!("Talk to {}", npc_name),
            command: format!("talk {}", template.giver_npc_id),
        }],
    }
}

/// Called from combat when an enemy dies. Advances kill-count quest progress.
/// No rewards are awarded here — that happens on turn-in.
pub fn on_enemy_killed(
    world: &mut World,
    repo: &StaticRepository,
    player_e: Entity,
    killed_class_id: &str,
) -> Vec<String> {
    let quest_ids: Vec<String> = {
        let log = world.entity(player_e).get::<QuestLog>();
        log.map(|l| {
            l.entries
                .iter()
                .filter(|e| !e.completed && !e.ready_to_turn_in)
                .map(|e| e.quest_id.clone())
                .collect()
        })
        .unwrap_or_default()
    };

    let mut notices = vec![];

    for quest_id in quest_ids {
        let template = match repo.quest(&quest_id) {
            Some(t) => t.clone(),
            None => continue,
        };
        let matches = match &template.objective {
            QuestObjective::KillCount { class_id, .. } => class_id == killed_class_id,
            _ => false,
        };
        if !matches {
            continue;
        }

        let (new_progress, target, just_met) = {
            let log = world.entity(player_e).get::<QuestLog>();
            let entry = log.and_then(|l| l.entries.iter().find(|e| e.quest_id == quest_id));
            match entry {
                Some(e) => {
                    let target = match &template.objective {
                        QuestObjective::KillCount { count, .. } => *count,
                        _ => 1,
                    };
                    let new_prog = e.progress + 1;
                    (new_prog, target, new_prog >= target)
                }
                None => continue,
            }
        };

        if let Some(mut log) = world.entity_mut(player_e).get_mut::<QuestLog>() {
            if let Some(entry) = log.entries.iter_mut().find(|e| e.quest_id == quest_id) {
                entry.progress = new_progress;
                if just_met {
                    entry.ready_to_turn_in = true;
                }
            }
        }

        if just_met {
            let npc_name = repo
                .npc(&template.giver_npc_id)
                .map(|n| n.name.clone())
                .unwrap_or_else(|_| template.giver_npc_id.clone());
            notices.push(format!(
                "\n\n[{}] Objective complete — return to {} to collect your reward.",
                template.name, npc_name
            ));
        } else {
            notices.push(format!(
                "\n[Quest: {} — {}/{}]",
                template.name, new_progress, target
            ));
        }
    }

    notices
}

/// Called after the player enters a new room. Checks ReachRoom objectives.
/// Returns notice strings for appending to the move narrative.
pub fn on_player_entered_room(
    world: &mut World,
    repo: &StaticRepository,
    player_e: Entity,
    room_id: &str,
) -> Vec<String> {
    let quest_ids: Vec<String> = {
        let log = world.entity(player_e).get::<QuestLog>();
        log.map(|l| {
            l.entries
                .iter()
                .filter(|e| !e.completed && !e.ready_to_turn_in)
                .map(|e| e.quest_id.clone())
                .collect()
        })
        .unwrap_or_default()
    };

    let mut notices = vec![];

    for quest_id in quest_ids {
        let template = match repo.quest(&quest_id) {
            Some(t) => t.clone(),
            None => continue,
        };
        let matches = match &template.objective {
            QuestObjective::ReachRoom { room_id: target } => target == room_id,
            _ => false,
        };
        if !matches {
            continue;
        }

        if let Some(mut log) = world.entity_mut(player_e).get_mut::<QuestLog>() {
            if let Some(entry) = log.entries.iter_mut().find(|e| e.quest_id == quest_id) {
                entry.ready_to_turn_in = true;
            }
        }

        let npc_name = repo
            .npc(&template.giver_npc_id)
            .map(|n| n.name.clone())
            .unwrap_or_else(|_| template.giver_npc_id.clone());
        notices.push(format!(
            "\n\n[{}] Location reached — return to {} to report your findings.",
            template.name, npc_name
        ));
    }

    notices
}

/// Called after the player successfully talks to an NPC. Checks TalkTo objectives.
/// Returns notice strings to append to the dialogue narrative.
pub fn on_npc_talked_to(
    world: &mut World,
    repo: &StaticRepository,
    player_e: Entity,
    npc_id: &str,
) -> Vec<String> {
    let quest_ids: Vec<String> = {
        let log = world.entity(player_e).get::<QuestLog>();
        log.map(|l| {
            l.entries
                .iter()
                .filter(|e| !e.completed && !e.ready_to_turn_in)
                .map(|e| e.quest_id.clone())
                .collect()
        })
        .unwrap_or_default()
    };

    let mut notices = vec![];

    for quest_id in quest_ids {
        let template = match repo.quest(&quest_id) {
            Some(t) => t.clone(),
            None => continue,
        };
        let matches = match &template.objective {
            QuestObjective::TalkTo { npc_id: target } => target == npc_id,
            _ => false,
        };
        if !matches {
            continue;
        }

        if let Some(mut log) = world.entity_mut(player_e).get_mut::<QuestLog>() {
            if let Some(entry) = log.entries.iter_mut().find(|e| e.quest_id == quest_id) {
                entry.ready_to_turn_in = true;
            }
        }

        let npc_name = repo
            .npc(&template.giver_npc_id)
            .map(|n| n.name.clone())
            .unwrap_or_else(|_| template.giver_npc_id.clone());
        notices.push(format!(
            "\n\n[{}] Objective complete — return to {} to report.",
            template.name, npc_name
        ));
    }

    notices
}

fn err(msg: &str) -> QuestResult {
    QuestResult {
        success: false,
        narrative: msg.to_string(),
        context_actions: vec![],
    }
}
