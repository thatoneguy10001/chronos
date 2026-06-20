use bevy_ecs::prelude::*;
use crate::components::{Controllable, NpcDispositions, Position, QuestLog, WorldFlags};
use crate::data::StaticRepository;
use crate::data::schemas::DialogueLine;
use crate::events::ContextAction;

pub struct DialogueResult {
    pub success: bool,
    pub narrative: String,
    pub context_actions: Vec<ContextAction>,
}

/// Human-readable disposition tier label.
fn disposition_label(value: i32) -> &'static str {
    match value {
        0..=20  => "Hostile",
        21..=40 => "Wary",
        41..=60 => "Neutral",
        61..=80 => "Friendly",
        _       => "Trusted",
    }
}

/// Strip [[keyword]] markers from `text`, returning clean prose + extracted ContextActions.
/// `[[word]]` → displays as "word", generates `ask {npc_id} word` action.
fn extract_keywords(npc_id: &str, text: &str) -> (String, Vec<ContextAction>) {
    let mut clean   = String::new();
    let mut actions = Vec::new();
    let mut rest    = text;

    while let Some(open) = rest.find("[[") {
        clean.push_str(&rest[..open]);
        rest = &rest[open + 2..];
        if let Some(close) = rest.find("]]") {
            let kw = &rest[..close];
            let cmd_kw = kw.to_lowercase();
            clean.push_str(kw);
            actions.push(ContextAction {
                label:   format!("Ask about {kw}"),
                command: format!("ask {npc_id} {cmd_kw}"),
            });
            rest = &rest[close + 2..];
        } else {
            clean.push_str("[[");
        }
    }
    clean.push_str(rest);
    (clean, actions)
}

/// Read disposition + seen topics for one NPC from the player entity. Read-only.
fn get_npc_state(world: &mut World, npc_id: &str, initial: i32) -> (i32, Vec<String>) {
    let mut q = world.query_filtered::<&NpcDispositions, With<Controllable>>();
    q.iter(world).next().map(|nd| {
        let disp  = nd.disposition(npc_id, initial);
        let seen  = nd.topics_seen.get(npc_id).cloned().unwrap_or_default();
        (disp, seen)
    }).unwrap_or((initial, vec![]))
}

/// Returns true if this dialogue line is currently accessible to the player.
fn is_available(
    line: &DialogueLine,
    player_disp: i32,
    seen: &[String],
    world_flags: &std::collections::HashMap<String, bool>,
) -> bool {
    let disp_ok  = line.min_disposition <= player_disp;
    let topic_ok = line.requires_topic.as_ref()
        .map(|req| seen.iter().any(|s| s == req))
        .unwrap_or(true);
    let quest_ok = line.requires_quest_complete.is_empty()
        || line.requires_quest_complete.iter().all(|qid| {
            world_flags.get(&format!("{qid}_turned_in")).copied().unwrap_or(false)
        });
    disp_ok && topic_ok && quest_ok
}

/// Build the context_action list for available topics after an interaction.
fn topic_actions(
    npc_id: &str,
    lines: &[DialogueLine],
    disp: i32,
    seen: &[String],
    world_flags: &std::collections::HashMap<String, bool>,
) -> Vec<ContextAction> {
    lines.iter()
        .filter(|d| is_available(d, disp, seen, world_flags))
        .map(|d| ContextAction {
            label:   format!("Ask about {}", d.prompt),
            command: format!("ask {} {}", npc_id, d.keyword),
        })
        .collect()
}

/// Read the current world flags from the World resource (cloned so the borrow is released).
fn get_world_flags(world: &World) -> std::collections::HashMap<String, bool> {
    world.get_resource::<WorldFlags>()
        .map(|wf| wf.flags.clone())
        .unwrap_or_default()
}

/// Greet the player with the NPC's opening line and list unlocked topics.
pub fn process_talk(world: &mut World, repo: &StaticRepository, npc_id: &str) -> DialogueResult {
    let room_id = player_room(world);
    let Some(room_id) = room_id else { return error("No player found."); };

    let npcs_here = repo.npcs_in_room(&room_id);
    if !npcs_here.iter().any(|id| id == npc_id) {
        return DialogueResult {
            success: false,
            narrative: format!("There's no '{npc_id}' here to talk to."),
            context_actions: vec![],
        };
    }

    let npc = match repo.npc(npc_id) {
        Ok(n)  => n,
        Err(_) => return error(&format!("Unknown NPC '{npc_id}'.")),
    };

    let world_flags = get_world_flags(world);
    let (player_disp, seen) = get_npc_state(world, npc_id, npc.initial_disposition);
    let disp_label = disposition_label(player_disp);

    let available: Vec<&DialogueLine> = npc.dialogue.iter()
        .filter(|d| is_available(d, player_disp, &seen, &world_flags))
        .collect();
    let locked_count = npc.dialogue.len() - available.len();

    let mut narrative = format!("**{}** [{disp_label}] — {}", npc.name, npc.greeting);
    if !available.is_empty() {
        let prompts: Vec<&str> = available.iter().map(|d| d.prompt.as_str()).collect();
        narrative.push_str(&format!("\n\nYou can ask about: {}.", prompts.join(", ")));
    }
    if locked_count > 0 {
        narrative.push_str(&format!(
            "\n\n({locked_count} topic(s) locked — investigate more or build rapport.)"
        ));
    }
    if npc.vendor {
        narrative.push_str(&format!("\n\nThis merchant sells wares. Type 'shop {npc_id}' to browse."));
    }

    // Available quests
    let available_quests = repo.quests_for_npc(npc_id);
    let accepted_ids: std::collections::HashSet<String> = {
        let mut q = world.query_filtered::<&QuestLog, With<Controllable>>();
        q.iter(world).next()
            .map(|ql| ql.entries.iter().map(|e| e.quest_id.clone()).collect())
            .unwrap_or_default()
    };
    let new_quests: Vec<_> = available_quests.iter()
        .filter(|q| !accepted_ids.contains(&q.id))
        .filter(|q| q.requires_quest_complete.is_empty()
            || q.requires_quest_complete.iter().all(|req| {
                world_flags.get(&format!("{req}_turned_in")).copied().unwrap_or(false)
            }))
        .collect();
    if !new_quests.is_empty() {
        narrative.push_str("\n\nAvailable quests:");
        for q in &new_quests {
            narrative.push_str(&format!("\n  [{}] — {} scraps, {} XP", q.name, q.gold_reward, q.xp_reward));
        }
    }

    let mut context_actions = topic_actions(npc_id, &npc.dialogue, player_disp, &seen, &world_flags);
    if npc.vendor {
        context_actions.push(ContextAction {
            label:   format!("Browse {}'s wares", npc.name),
            command: format!("shop {}", npc.name.to_lowercase()),
        });
    }
    if npc.rest_provider {
        context_actions.push(ContextAction {
            label:   "Rest here (5 gold, full HP)".to_string(),
            command: "rest".to_string(),
        });
    }
    for q in &new_quests {
        context_actions.push(ContextAction {
            label:   format!("Accept quest: {}", q.name),
            command: format!("accept {}", q.id.replace('_', " ")),
        });
    }

    // Offer turn-in button for any quests with this NPC that are ready
    let ready_quests: Vec<_> = {
        let mut qlog_q = world.query_filtered::<&QuestLog, With<Controllable>>();
        qlog_q.iter(world).next()
            .map(|ql| ql.entries.iter()
                .filter(|e| e.ready_to_turn_in && !e.completed)
                .filter_map(|e| repo.quests_for_npc(npc_id).into_iter()
                    .find(|qt| qt.id == e.quest_id)
                    .map(|qt| (qt.id.clone(), qt.name.clone())))
                .collect::<Vec<_>>()
            ).unwrap_or_default()
    };
    for (quest_id, quest_name) in ready_quests {
        context_actions.push(ContextAction {
            label:   format!("Turn in: {}", quest_name),
            command: format!("turn in {}", quest_id.replace('_', " ")),
        });
    }

    DialogueResult { success: true, narrative, context_actions }
}

/// Ask an NPC about a topic keyword. Records the topic, shifts disposition, extracts [[links]].
pub fn process_ask(world: &mut World, repo: &StaticRepository, npc_id: &str, topic: &str) -> DialogueResult {
    let room_id = player_room(world);
    let Some(room_id) = room_id else { return error("No player found."); };

    let npcs_here = repo.npcs_in_room(&room_id);
    if !npcs_here.iter().any(|id| id == npc_id) {
        return DialogueResult {
            success: false,
            narrative: format!("There's no '{npc_id}' here to talk to."),
            context_actions: vec![],
        };
    }

    let npc = match repo.npc(npc_id) {
        Ok(n)  => n,
        Err(_) => return error(&format!("Unknown NPC '{npc_id}'.")),
    };

    let world_flags = get_world_flags(world);
    let (player_disp, seen) = get_npc_state(world, npc_id, npc.initial_disposition);
    let topic_lower = topic.to_lowercase();

    // Find a matching line that is also currently available.
    let matched = npc.dialogue.iter().find(|d| {
        let matches = d.keyword.to_lowercase() == topic_lower
            || d.prompt.to_lowercase().contains(&topic_lower);
        matches && is_available(d, player_disp, &seen, &world_flags)
    });

    // Check for a line that matches keyword but is locked (to give a better error).
    let is_locked = matched.is_none() && npc.dialogue.iter().any(|d| {
        let matches = d.keyword.to_lowercase() == topic_lower
            || d.prompt.to_lowercase().contains(&topic_lower);
        matches && !is_available(d, player_disp, &seen, &world_flags)
    });

    match matched {
        Some(d) => {
            let keyword  = d.keyword.clone();
            let delta    = d.disposition_delta;
            let initial  = npc.initial_disposition;

            // Mutate NpcDispositions: record topic + adjust disposition.
            {
                let mut q = world.query_filtered::<&mut NpcDispositions, With<Controllable>>();
                if let Some(mut nd) = q.iter_mut(world).next() {
                    nd.record_topic(npc_id, &keyword);
                    nd.adjust(npc_id, delta, initial);
                }
            }

            // Re-read updated state to build context actions with newly unlocked topics.
            let (new_disp, new_seen) = get_npc_state(world, npc_id, initial);
            let disp_label = disposition_label(new_disp);

            let (clean_response, kw_actions) = extract_keywords(npc_id, &d.response);
            let narrative = format!("**{}** [{disp_label}] — {clean_response}", npc.name);

            let mut context_actions = topic_actions(npc_id, &npc.dialogue, new_disp, &new_seen, &world_flags);
            // Prepend keyword-extracted actions (most relevant to this response).
            let mut all_actions = kw_actions;
            all_actions.append(&mut context_actions);

            DialogueResult { success: true, narrative, context_actions: all_actions }
        }

        None => {
            if is_locked {
                let narrative = format!(
                    "**{}** [{} — {}] — They're not ready to discuss that yet.",
                    npc.name,
                    disposition_label(player_disp),
                    topic,
                );
                let context_actions = topic_actions(npc_id, &npc.dialogue, player_disp, &seen, &world_flags);
                DialogueResult { success: false, narrative, context_actions }
            } else {
                let narrative = format!(
                    "**{}** shrugs. \"I don't know anything about that.\"",
                    npc.name,
                );
                let context_actions = topic_actions(npc_id, &npc.dialogue, player_disp, &seen, &world_flags);
                DialogueResult { success: true, narrative, context_actions }
            }
        }
    }
}

fn player_room(world: &mut World) -> Option<String> {
    let mut q = world.query_filtered::<&Position, With<Controllable>>();
    q.iter(world).next().map(|p| p.room_id.clone())
}

fn error(msg: &str) -> DialogueResult {
    DialogueResult { success: false, narrative: msg.to_string(), context_actions: vec![] }
}
