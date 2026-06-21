//! Dialogue system — NPC conversations, disposition tracking, topic gating.
//!
//! # Flow
//!
//! `process_talk` greets an NPC and lists unlocked topics.
//! `process_ask` resolves a topic keyword, returns the NPC's response, and
//! records the topic so subsequent `is_available` checks can unlock new lines.
//!
//! # Disposition
//!
//! Each NPC has a per-player disposition score (0–100). Topics have a
//! `disposition_delta` that shifts it on ask. Lines above `min_disposition`
//! are visible; locked lines show a count hint ("N topics locked").
//!
//! # Name resolution
//!
//! Players type display names ("talk thorn"); `resolve_npc_in_room` maps them
//! to internal IDs via exact → suffix → display-name-word matching. Re-exported
//! so shop.rs can reuse the same resolver.

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

/// Convert `[[keyword]]` markers in dialogue text into `[[display|command]]` inline links.
///
/// The original `[[word]]` syntax in world JSON becomes a clickable span on the frontend.
/// The marker is preserved (not stripped) so the renderer can style it; a matching
/// `ContextAction` button is still generated for the button-panel fallback.
fn extract_keywords(npc_id: &str, text: &str) -> (String, Vec<ContextAction>) {
    let mut out     = String::new();
    let mut actions = Vec::new();
    let mut rest    = text;

    while let Some(open) = rest.find("[[") {
        out.push_str(&rest[..open]);
        rest = &rest[open + 2..];
        if let Some(close) = rest.find("]]") {
            let kw      = &rest[..close];
            let cmd_kw  = kw.to_lowercase();
            let command = format!("ask {npc_id} {cmd_kw}");
            // Embed as [[display|command]] so the frontend renders it as an inline link.
            out.push_str(&format!("[[{kw}|{command}]]"));
            actions.push(ContextAction {
                label:   format!("Ask about {kw}"),
                command,
            });
            rest = &rest[close + 2..];
        } else {
            out.push_str("[[");
        }
    }
    out.push_str(rest);
    (out, actions)
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

/// Resolve a player-typed name fragment to the best-matching NPC ID present in `npcs_here`.
/// Exported so other systems (shop, quest) can reuse the same logic.
///
/// Resolution order (first match wins):
///   1. Exact ID match              — "commander_thorn" → "commander_thorn"
///   2. ID suffix match             — "thorn"           → "commander_thorn"
///   3. Display name word match     — "thorn" or "commander thorn" against NPC name field
pub(crate) fn resolve_npc_in_room<'a>(
    fragment: &str,
    npcs_here: &'a [String],
    repo: &StaticRepository,
) -> Option<&'a str> {
    let frag = fragment.to_lowercase();

    // 1. Exact ID
    if let Some(id) = npcs_here.iter().find(|id| id.to_lowercase() == frag) {
        return Some(id.as_str());
    }

    // 2. ID ends with "_<fragment>" — handles "thorn" → "commander_thorn"
    let suffix = format!("_{frag}");
    if let Some(id) = npcs_here.iter().find(|id| id.to_lowercase().ends_with(&suffix)) {
        return Some(id.as_str());
    }

    // 3. All words of the fragment appear in the NPC's display name
    let words: Vec<&str> = frag.split_whitespace().collect();
    for id in npcs_here {
        if let Ok(npc) = repo.npc(id) {
            let name_lower = npc.name.to_lowercase();
            if words.iter().all(|w| name_lower.contains(w)) {
                return Some(id.as_str());
            }
        }
    }

    None
}

/// Greet the player with the NPC's opening line and list unlocked topics.
pub fn process_talk(world: &mut World, repo: &StaticRepository, npc_id: &str) -> DialogueResult {
    let room_id = player_room(world);
    let Some(room_id) = room_id else { return error("No player found."); };

    let npcs_here = repo.npcs_in_room(&room_id);

    // Resolve the player's input to a real NPC ID present in this room.
    let npc_id = match resolve_npc_in_room(npc_id, &npcs_here, repo) {
        Some(id) => id.to_string(),
        None => return DialogueResult {
            success: false,
            narrative: format!(
                "There's no '{npc_id}' here to talk to.{}",
                if npcs_here.is_empty() { String::new() } else {
                    let names: Vec<String> = npcs_here.iter()
                        .filter_map(|id| repo.npc(id).ok().map(|n| n.name.clone()))
                        .collect();
                    format!(" (You can see: {}.)", names.join(", "))
                }
            ),
            context_actions: vec![],
        },
    };
    let npc_id = npc_id.as_str();

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
        let topic_links: Vec<String> = available.iter()
            .map(|d| format!("[[{}|ask {} {}]]", d.prompt, npc_id, d.keyword))
            .collect();
        narrative.push_str(&format!("\n\nYou can ask about: {}.", topic_links.join(", ")));
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
    let npc_id = match resolve_npc_in_room(npc_id, &npcs_here, repo) {
        Some(id) => id.to_string(),
        None => return DialogueResult {
            success: false,
            narrative: format!("There's no '{npc_id}' here to talk to."),
            context_actions: vec![],
        },
    };
    let npc_id = npc_id.as_str();

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

#[cfg(test)]
mod tests {
    use super::resolve_npc_in_room;
    use crate::data::StaticRepository;

    fn make_ids(ids: &[&str]) -> Vec<String> {
        ids.iter().map(|s| s.to_string()).collect()
    }

    // A minimal repo stub that only answers npc() with a name.
    // We build one real NPC JSON per call to avoid a full world load.
    fn repo_with_npcs(npcs: &[(&str, &str)]) -> StaticRepository {
        let npc_jsons: Vec<(String, String)> = npcs.iter()
            .map(|(id, name)| (
                id.to_string(),
                format!(r#"{{"id":"{id}","name":"{name}","initial_disposition":50,"greeting":"Hi.","dialogue":[]}}"#),
            ))
            .collect();
        let npc_pairs: Vec<(&str, &str)> = npc_jsons.iter().map(|(k,v)| (k.as_str(), v.as_str())).collect();
        let manifest   = r#"{"start_room_id":"stub","npc_placements":[]}"#;
        let stub_room  = r#"{"id":"stub","name":"Stub","description":".","exits":{}}"#;
        let room_pairs = &[("stub", stub_room)];
        StaticRepository::from_json_pairs_full(room_pairs, &[], &[], &npc_pairs, &[], Some(manifest)).unwrap()
    }

    #[test]
    fn exact_id_resolves() {
        let repo = repo_with_npcs(&[("commander_thorn", "Commander Thorn")]);
        let ids  = make_ids(&["commander_thorn"]);
        assert_eq!(resolve_npc_in_room("commander_thorn", &ids, &repo), Some("commander_thorn"));
    }

    #[test]
    fn suffix_resolves() {
        let repo = repo_with_npcs(&[("commander_thorn", "Commander Thorn")]);
        let ids  = make_ids(&["commander_thorn"]);
        assert_eq!(resolve_npc_in_room("thorn", &ids, &repo), Some("commander_thorn"));
    }

    #[test]
    fn display_name_word_resolves() {
        let repo = repo_with_npcs(&[("gate_sergeant_orr", "Sergeant Orr")]);
        let ids  = make_ids(&["gate_sergeant_orr"]);
        // "sergeant orr" → both words in "Sergeant Orr" → match
        assert_eq!(resolve_npc_in_room("sergeant orr", &ids, &repo), Some("gate_sergeant_orr"));
    }

    #[test]
    fn partial_display_name_resolves() {
        let repo = repo_with_npcs(&[("gate_sergeant_orr", "Sergeant Orr")]);
        let ids  = make_ids(&["gate_sergeant_orr"]);
        assert_eq!(resolve_npc_in_room("orr", &ids, &repo), Some("gate_sergeant_orr"));
    }

    #[test]
    fn wrong_room_returns_none() {
        let repo = repo_with_npcs(&[("commander_thorn", "Commander Thorn")]);
        let ids  = make_ids(&[]);  // empty: Thorn is not in this room
        assert_eq!(resolve_npc_in_room("thorn", &ids, &repo), None);
    }
}
