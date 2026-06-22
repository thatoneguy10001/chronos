//! Movement system — room traversal and room description.
//!
//! `process_move` validates the requested direction against the room's exit map,
//! checks any item requirement on the exit, then teleports the player by
//! replacing their `Position` component.
//!
//! `process_look` renders the current room: description, visible items, NPCs,
//! living enemies, and exits. It also generates the `ContextAction` list that
//! the UI's button panel uses — one action per exit, item, NPC, and live enemy.
//!
//! Neither function touches the tick or event log.

use crate::components::{
    Controllable, Enemy, GameTime, Health, Identity, InInventory, ItemBlueprint, Position,
};
use crate::data::{RoomTemplate, StaticRepository};
use crate::events::ContextAction;
use bevy_ecs::prelude::*;

pub struct MoveResult {
    pub success: bool,
    pub narrative: String,
    pub context_actions: Vec<ContextAction>,
}

/// Attempt to move the player in the given direction.
/// Checks exit existence and any item requirements from the room blueprint.
pub fn process_move(world: &mut World, repo: &StaticRepository, direction: &str) -> MoveResult {
    // --- Locate player ---
    let mut player_query = world.query_filtered::<(Entity, &Position), With<Controllable>>();
    let (player_entity, current_room_id) = match player_query.iter(world).next() {
        Some((e, pos)) => (e, pos.room_id.clone()),
        None => return error_result("No player entity found."),
    };

    // --- Look up current room blueprint ---
    let room = match repo.room(&current_room_id) {
        Ok(r) => r,
        Err(_) => return error_result(&format!("Unknown room: {current_room_id}")),
    };

    // --- Check exit exists ---
    let exit = match room.exits.get(direction) {
        Some(e) => e,
        None => {
            return MoveResult {
                success: false,
                narrative: format!("You can't go {direction} from here."),
                context_actions: build_exit_actions(room),
            }
        }
    };

    // --- Check exit requirement ---
    if let Some(required_item_id) = &exit.requirement {
        let has_item = player_has_item(world, player_entity, required_item_id);
        if !has_item {
            let msg = exit
                .locked_message
                .clone()
                .unwrap_or_else(|| format!("You need a {required_item_id} to go that way."));
            return MoveResult {
                success: false,
                narrative: msg,
                context_actions: build_exit_actions(room),
            };
        }
    }

    // --- Check night requirement (Armistice gating) ---
    if exit.requires_night {
        let is_night = world
            .get_resource::<GameTime>()
            .map(|gt| gt.is_night())
            .unwrap_or(false);
        if !is_night {
            let msg = exit.locked_message.clone()
                .unwrap_or_else(|| "That passage is only open during the Armistice — after dusk. Type 'wait' to pass time.".to_string());
            return MoveResult {
                success: false,
                narrative: msg,
                context_actions: build_exit_actions(room),
            };
        }
    }

    // --- Move player ---
    let target_room_id = exit.target_room_id.clone();
    world.entity_mut(player_entity).insert(Position {
        room_id: target_room_id.clone(),
    });

    // --- Build arrival narrative ---
    let target_room = match repo.room(&target_room_id) {
        Ok(r) => r,
        Err(_) => return error_result(&format!("Target room not found: {target_room_id}")),
    };

    let items_here = items_in_room(world, &target_room_id, repo);
    let enemies_here = enemies_in_room(world, &target_room_id);
    let npcs_here = npc_ids_in_room(&target_room_id, repo);
    let narrative =
        format_room_description(target_room, &items_here, &enemies_here, &npcs_here, repo);
    let mut context_actions = build_exit_actions(target_room);
    if !enemies_here.is_empty() {
        context_actions.insert(
            0,
            ContextAction {
                label: "Attack".to_string(),
                command: "attack".to_string(),
            },
        );
    }
    context_actions.extend(takeable_item_actions(world, &target_room_id, repo));
    context_actions.extend(talk_npc_actions(&target_room_id, repo));

    MoveResult {
        success: true,
        narrative,
        context_actions,
    }
}

/// Generate the room description for a LOOK command without moving.
pub fn process_look(world: &mut World, repo: &StaticRepository) -> MoveResult {
    let mut player_query = world.query_filtered::<&Position, With<Controllable>>();
    let room_id = match player_query.iter(world).next() {
        Some(pos) => pos.room_id.clone(),
        None => return error_result("No player found."),
    };

    let room = match repo.room(&room_id) {
        Ok(r) => r,
        Err(_) => return error_result("Unknown room."),
    };

    let items_here = items_in_room(world, &room_id, repo);
    let enemies_here = enemies_in_room(world, &room_id);
    let npcs_here = npc_ids_in_room(&room_id, repo);
    let narrative = format_room_description(room, &items_here, &enemies_here, &npcs_here, repo);
    let mut context_actions = build_exit_actions(room);
    if !enemies_here.is_empty() {
        context_actions.insert(
            0,
            ContextAction {
                label: "Attack".to_string(),
                command: "attack".to_string(),
            },
        );
    }
    context_actions.extend(takeable_item_actions(world, &room_id, repo));
    context_actions.extend(talk_npc_actions(&room_id, repo));

    MoveResult {
        success: true,
        narrative,
        context_actions,
    }
}

/// Names of living (HP > 0) enemies in the given room.
fn enemies_in_room(world: &mut World, room_id: &str) -> Vec<String> {
    let mut query = world.query_filtered::<(&Position, &Health, &Identity), With<Enemy>>();
    query
        .iter(world)
        .filter(|(pos, hp, _)| pos.room_id == room_id && hp.current > 0)
        .map(|(_, _, id)| id.name.clone())
        .collect()
}

fn player_has_item(world: &mut World, player: Entity, item_id: &str) -> bool {
    let mut query = world.query::<(&InInventory, &ItemBlueprint)>();
    query
        .iter(world)
        .any(|(inv, bp)| inv.owner == player && bp.id == item_id)
}

/// Returns (display_name, item_id) pairs for items on the ground in a room.
fn items_in_room(
    world: &mut World,
    room_id: &str,
    repo: &StaticRepository,
) -> Vec<(String, String)> {
    let mut query = world.query::<(&Position, &ItemBlueprint)>();
    query
        .iter(world)
        .filter(|(pos, _)| pos.room_id == room_id)
        .filter_map(|(_, bp)| {
            repo.item(&bp.id)
                .ok()
                .map(|t| (t.name.clone(), bp.id.clone()))
        })
        .collect()
}

/// Returns (display_name, npc_id) pairs for NPCs in a room.
fn npc_ids_in_room(room_id: &str, repo: &StaticRepository) -> Vec<(String, String)> {
    repo.npcs_in_room(room_id)
        .iter()
        .filter_map(|id| repo.npc(id).ok().map(|n| (n.name.clone(), id.clone())))
        .collect()
}

fn format_room_description(
    room: &RoomTemplate,
    items: &[(String, String)],
    enemies: &[String],
    npcs: &[(String, String)],
    repo: &StaticRepository,
) -> String {
    let mut desc = format!("**{}**\n\n{}", room.name, room.description);

    if !npcs.is_empty() {
        let links: Vec<String> = npcs
            .iter()
            .map(|(name, id)| format!("[[{name}|talk {id}]]"))
            .collect();
        desc.push_str(&format!("\n\n\u{1f4ac} Here: {}.", links.join(", ")));
    }

    if !items.is_empty() {
        let links: Vec<String> = items
            .iter()
            .map(|(name, id)| format!("[[{name}|take {id}]]"))
            .collect();
        desc.push_str(&format!("\n\nYou can see: {}.", links.join(", ")));
    }

    if !enemies.is_empty() {
        let links: Vec<String> = enemies
            .iter()
            .map(|name| format!("[[{name}|attack]]"))
            .collect();
        desc.push_str(&format!(
            "\n\n\u{2694}\u{fe0f} Hostile: {}.",
            links.join(", ")
        ));
    }

    let mut exit_lines: Vec<String> = room
        .exits
        .iter()
        .map(|(dir, exit_def)| {
            let dest_name = repo
                .room(&exit_def.target_room_id)
                .map(|r| r.name.as_str())
                .unwrap_or("Unknown");
            format!("[[{} → {}|go {}]]", capitalize(dir), dest_name, dir)
        })
        .collect();
    exit_lines.sort();
    if !exit_lines.is_empty() {
        desc.push_str(&format!("\n\nExits: {}.", exit_lines.join("  |  ")));
    }

    desc
}

fn talk_npc_actions(room_id: &str, repo: &StaticRepository) -> Vec<ContextAction> {
    repo.npcs_in_room(room_id)
        .iter()
        .filter_map(|id| {
            repo.npc(id).ok().map(|n| ContextAction {
                label: format!("Talk to {}", n.name),
                command: format!("talk {}", n.name.to_lowercase()),
            })
        })
        .collect()
}

fn takeable_item_actions(
    world: &mut World,
    room_id: &str,
    repo: &StaticRepository,
) -> Vec<ContextAction> {
    let mut query = world.query::<(&Position, &ItemBlueprint)>();
    query
        .iter(world)
        .filter(|(pos, _)| pos.room_id == room_id)
        .filter_map(|(_, bp)| repo.item(&bp.id).ok().filter(|t| t.takeable))
        .map(|t| ContextAction {
            label: format!("Take {}", t.name),
            command: format!("take {}", t.id),
        })
        .collect()
}

fn build_exit_actions(room: &RoomTemplate) -> Vec<ContextAction> {
    room.exits
        .iter()
        .map(|(direction, exit)| ContextAction {
            label: exit.label.clone().unwrap_or_else(|| capitalize(direction)),
            command: format!("go {direction}"),
        })
        .collect()
}

fn capitalize(s: &str) -> String {
    let mut c = s.chars();
    match c.next() {
        None => String::new(),
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
    }
}

fn error_result(msg: &str) -> MoveResult {
    MoveResult {
        success: false,
        narrative: msg.to_string(),
        context_actions: vec![],
    }
}
