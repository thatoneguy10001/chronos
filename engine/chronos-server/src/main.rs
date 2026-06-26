use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path,
    },
    response::{Json, Response},
    routing::get,
    Router,
};
use chronos_core::{data::repository::StaticRepository, ChronosEngine};
use serde::Deserialize;
use serde_json::Value;
use std::{fs, net::SocketAddr, path::PathBuf};
use tower_http::cors::{Any, CorsLayer};

// ── message types ────────────────────────────────────────────────────────────

/// Every message from the browser includes a `seq` so we can match responses.
#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ClientMsg {
    WorldList {
        seq: u64,
    },
    Init {
        seq: u64,
        world_id: String,
    },
    /// Initialize from an in-memory world payload instead of one on disk. This is
    /// Build Mode's Test Play over the WebSocket bridge: the browser serializes a
    /// draft and sends the world inline, so a not-yet-saved world is playable here
    /// exactly as it is in the bundled WASM engine.
    InitInline {
        seq: u64,
        world: InlineWorld,
    },
    Command {
        seq: u64,
        input: String,
    },
    Rewind {
        seq: u64,
        tick: u32,
    },
    Snapshot {
        seq: u64,
    },
    RoomActions {
        seq: u64,
    },
    LoadSnapshot {
        seq: u64,
        snapshot_json: String,
    },
}

/// One serialized world file as the browser sends it: a name and its JSON text.
#[derive(Deserialize)]
struct InlineFile {
    filename: String,
    content: String,
}

/// A complete world sent inline — the same shape `build_repo` assembles from disk,
/// just delivered in the message. Every collection defaults to empty so a minimal
/// world (a room and a class) serializes to a valid payload.
#[derive(Deserialize)]
struct InlineWorld {
    #[serde(default)]
    rooms: Vec<InlineFile>,
    #[serde(default)]
    items: Vec<InlineFile>,
    #[serde(default)]
    classes: Vec<InlineFile>,
    #[serde(default)]
    npcs: Vec<InlineFile>,
    #[serde(default)]
    quests: Vec<InlineFile>,
    #[serde(default)]
    passives: Vec<InlineFile>,
    #[serde(default)]
    manifest: Option<String>,
}

fn ok_msg(seq: u64) -> String {
    serde_json::json!({ "seq": seq, "type": "ok" }).to_string()
}

fn err_msg(seq: u64, message: impl std::fmt::Display) -> String {
    serde_json::json!({ "seq": seq, "type": "error", "message": message.to_string() }).to_string()
}

// ── world loading ─────────────────────────────────────────────────────────────

fn worlds_dir() -> PathBuf {
    std::env::var("WORLDS_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("./worlds"))
}

/// Read all `*.json` files from a directory into (filename, content) pairs.
fn load_dir(dir: &PathBuf) -> Vec<(String, String)> {
    let Ok(entries) = fs::read_dir(dir) else {
        return vec![];
    };
    entries
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().map(|x| x == "json").unwrap_or(false))
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            let content = fs::read_to_string(e.path()).ok()?;
            Some((name, content))
        })
        .collect()
}

fn load_file_opt(path: &PathBuf) -> Option<String> {
    fs::read_to_string(path).ok()
}

fn build_repo(world_id: &str) -> Result<StaticRepository, String> {
    let base = worlds_dir().join(world_id);
    if !base.exists() {
        return Err(format!(
            "World '{}' not found in {}",
            world_id,
            worlds_dir().display()
        ));
    }

    let rooms = load_dir(&base.join("rooms"));
    let items = load_dir(&base.join("items"));
    let classes = load_dir(&base.join("classes"));
    let npcs = load_dir(&base.join("npcs"));
    let quests = load_dir(&base.join("quests"));
    let passives = load_dir(&base.join("passives"));
    let manifest = load_file_opt(&base.join("manifest.json"));

    // StaticRepository wants &[(&str, &str)] — borrow from our owned Vecs.
    let room_pairs: Vec<(&str, &str)> = rooms
        .iter()
        .map(|(k, v)| (k.as_str(), v.as_str()))
        .collect();
    let item_pairs: Vec<(&str, &str)> = items
        .iter()
        .map(|(k, v)| (k.as_str(), v.as_str()))
        .collect();
    let class_pairs: Vec<(&str, &str)> = classes
        .iter()
        .map(|(k, v)| (k.as_str(), v.as_str()))
        .collect();
    let npc_pairs: Vec<(&str, &str)> = npcs.iter().map(|(k, v)| (k.as_str(), v.as_str())).collect();
    let quest_pairs: Vec<(&str, &str)> = quests
        .iter()
        .map(|(k, v)| (k.as_str(), v.as_str()))
        .collect();
    let passive_pairs: Vec<(&str, &str)> = passives
        .iter()
        .map(|(k, v)| (k.as_str(), v.as_str()))
        .collect();

    StaticRepository::from_json_pairs_complete(
        &room_pairs,
        &item_pairs,
        &class_pairs,
        &npc_pairs,
        &quest_pairs,
        &passive_pairs,
        manifest.as_deref(),
    )
    .map_err(|e| e.to_string())
}

/// Build a repository from an inline world payload (Build Mode Test Play). Mirrors
/// `build_repo` but borrows the (filename, content) pairs straight from the message
/// instead of reading them off disk.
fn build_repo_inline(world: &InlineWorld) -> Result<StaticRepository, String> {
    fn pairs(files: &[InlineFile]) -> Vec<(&str, &str)> {
        files
            .iter()
            .map(|f| (f.filename.as_str(), f.content.as_str()))
            .collect()
    }

    StaticRepository::from_json_pairs_complete(
        &pairs(&world.rooms),
        &pairs(&world.items),
        &pairs(&world.classes),
        &pairs(&world.npcs),
        &pairs(&world.quests),
        &pairs(&world.passives),
        world.manifest.as_deref(),
    )
    .map_err(|e| e.to_string())
}

/// List all available worlds by scanning for world.json files.
fn list_worlds() -> Vec<Value> {
    let base = worlds_dir();
    let Ok(entries) = fs::read_dir(&base) else {
        return vec![];
    };
    entries
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .filter_map(|e| {
            let world_json = e.path().join("world.json");
            let content = fs::read_to_string(world_json).ok()?;
            serde_json::from_str(&content).ok()
        })
        .collect()
}

// ── WebSocket handler ─────────────────────────────────────────────────────────

async fn ws_upgrade(ws: WebSocketUpgrade) -> Response {
    ws.on_upgrade(handle_socket)
}

async fn handle_socket(mut socket: WebSocket) {
    let mut engine: Option<ChronosEngine> = None;

    while let Some(Ok(msg)) = socket.recv().await {
        let text = match msg {
            Message::Text(t) => t,
            Message::Close(_) => break,
            _ => continue,
        };

        let response = match serde_json::from_str::<ClientMsg>(&text) {
            Err(e) => err_msg(0, format!("bad message: {e}")),
            Ok(client_msg) => dispatch(&mut engine, client_msg),
        };

        if socket.send(Message::Text(response.into())).await.is_err() {
            break;
        }
    }
}

fn dispatch(engine: &mut Option<ChronosEngine>, msg: ClientMsg) -> String {
    match msg {
        ClientMsg::WorldList { seq } => {
            let worlds = list_worlds();
            serde_json::json!({ "seq": seq, "type": "world_list", "worlds": worlds }).to_string()
        }

        ClientMsg::Init { seq, world_id } => match build_repo(&world_id) {
            Err(e) => err_msg(seq, e),
            Ok(repo) => {
                *engine = Some(ChronosEngine::new(repo));
                ok_msg(seq)
            }
        },

        ClientMsg::InitInline { seq, world } => match build_repo_inline(&world) {
            Err(e) => err_msg(seq, e),
            Ok(repo) => {
                *engine = Some(ChronosEngine::new(repo));
                ok_msg(seq)
            }
        },

        ClientMsg::Command { seq, input } => {
            let Some(eng) = engine.as_mut() else {
                return err_msg(seq, "engine not initialized — send Init first");
            };
            let result = eng.process_command(&input);
            let room_actions = eng.peek_room_actions();
            let max_tick = eng.max_tick();
            serde_json::to_string(&serde_json::json!({
                "seq": seq,
                "type": "result",
                "success": result.success,
                "narrative": result.narrative,
                "context_actions": result.context_actions,
                "inventory_ids": result.inventory_ids,
                "tick": result.tick,
                "game_time": result.game_time,
                "npc_sections": result.npc_sections,
                "room_actions": room_actions,
                "max_tick": max_tick,
            }))
            .unwrap()
        }

        ClientMsg::Rewind { seq, tick } => {
            let Some(eng) = engine.as_mut() else {
                return err_msg(seq, "engine not initialized");
            };
            eng.rewind_to_tick(tick as u64);
            let result = eng.describe_current();
            let room_actions = eng.peek_room_actions();
            let max_tick = eng.max_tick();
            serde_json::to_string(&serde_json::json!({
                "seq": seq,
                "type": "result",
                "success": result.success,
                "narrative": result.narrative,
                "context_actions": result.context_actions,
                "inventory_ids": result.inventory_ids,
                "tick": result.tick,
                "game_time": result.game_time,
                "room_actions": room_actions,
                "max_tick": max_tick,
            }))
            .unwrap()
        }

        ClientMsg::Snapshot { seq } => {
            let Some(eng) = engine.as_mut() else {
                return err_msg(seq, "engine not initialized");
            };
            let snap = eng.snapshot();
            let mut val = serde_json::to_value(&snap).unwrap();
            val["seq"] = serde_json::json!(seq);
            val["type"] = serde_json::json!("snapshot");
            val.to_string()
        }

        ClientMsg::RoomActions { seq } => {
            let Some(eng) = engine.as_mut() else {
                return err_msg(seq, "engine not initialized");
            };
            let actions = eng.peek_room_actions();
            serde_json::json!({ "seq": seq, "type": "room_actions", "actions": actions })
                .to_string()
        }

        ClientMsg::LoadSnapshot { seq, snapshot_json } => {
            let Some(eng) = engine.as_mut() else {
                return err_msg(seq, "engine not initialized");
            };
            match eng.load_from_snapshot(&snapshot_json) {
                Err(e) => err_msg(seq, e),
                Ok(()) => {
                    let result = eng.describe_current();
                    let room_actions = eng.peek_room_actions();
                    let max_tick = eng.max_tick();
                    serde_json::to_string(&serde_json::json!({
                        "seq": seq,
                        "type": "result",
                        "success": result.success,
                        "narrative": result.narrative,
                        "context_actions": result.context_actions,
                        "inventory_ids": result.inventory_ids,
                        "tick": result.tick,
                        "game_time": result.game_time,
                        "room_actions": room_actions,
                        "max_tick": max_tick,
                    }))
                    .unwrap()
                }
            }
        }
    }
}

// ── HTTP endpoints ────────────────────────────────────────────────────────────

async fn worlds_handler() -> Json<Vec<Value>> {
    Json(list_worlds())
}

/// Returns playable class blueprints for a world (excludes enemy classes).
async fn classes_handler(Path(world_id): Path<String>) -> Json<Vec<Value>> {
    let dir = worlds_dir().join(&world_id).join("classes");
    let playable: Vec<Value> = load_dir(&dir)
        .into_iter()
        .filter_map(|(_, content)| {
            let v: Value = serde_json::from_str(&content).ok()?;
            // Enemy classes have xp_reward or gold_reward; player classes don't.
            let xp = v.get("xp_reward").and_then(|x| x.as_i64()).unwrap_or(0);
            let gold = v.get("gold_reward").and_then(|x| x.as_i64()).unwrap_or(0);
            if xp > 0 || gold > 0 {
                return None;
            }
            Some(v)
        })
        .collect();
    Json(playable)
}

/// Returns id/name/description for every item in a world.
async fn items_handler(Path(world_id): Path<String>) -> Json<Vec<Value>> {
    let dir = worlds_dir().join(&world_id).join("items");
    let items: Vec<Value> = load_dir(&dir)
        .into_iter()
        .filter_map(|(_, content)| {
            let v: Value = serde_json::from_str(&content).ok()?;
            Some(serde_json::json!({
                "id":          v.get("id")?,
                "name":        v.get("name").cloned().unwrap_or(Value::Null),
                "description": v.get("description").cloned().unwrap_or(Value::Null),
                "tags":        v.get("tags").cloned().unwrap_or(Value::Array(vec![])),
                "consumable":  v.get("consumable").cloned().unwrap_or(Value::Bool(true)),
                "attributes":  v.get("attributes").cloned().unwrap_or(Value::Object(serde_json::Map::new())),
            }))
        })
        .collect();
    Json(items)
}

// ── tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── message formatting ────────────────────────────────────────────────────

    #[test]
    fn ok_msg_format() {
        let v: serde_json::Value = serde_json::from_str(&ok_msg(42)).unwrap();
        assert_eq!(v["seq"], 42);
        assert_eq!(v["type"], "ok");
    }

    #[test]
    fn err_msg_format() {
        let v: serde_json::Value = serde_json::from_str(&err_msg(7, "something broke")).unwrap();
        assert_eq!(v["seq"], 7);
        assert_eq!(v["type"], "error");
        assert_eq!(v["message"], "something broke");
    }

    // ── dispatch: engine-required commands return error when not initialised ──

    fn assert_error(response: &str, expected_seq: u64) {
        let v: serde_json::Value = serde_json::from_str(response).unwrap();
        assert_eq!(v["type"], "error", "expected error type, got: {response}");
        assert_eq!(v["seq"], expected_seq);
    }

    #[test]
    fn dispatch_command_requires_init() {
        let mut engine = None;
        let r = dispatch(
            &mut engine,
            ClientMsg::Command {
                seq: 1,
                input: "look".into(),
            },
        );
        assert_error(&r, 1);
    }

    #[test]
    fn dispatch_rewind_requires_init() {
        let mut engine = None;
        let r = dispatch(&mut engine, ClientMsg::Rewind { seq: 2, tick: 0 });
        assert_error(&r, 2);
    }

    #[test]
    fn dispatch_snapshot_requires_init() {
        let mut engine = None;
        let r = dispatch(&mut engine, ClientMsg::Snapshot { seq: 3 });
        assert_error(&r, 3);
    }

    #[test]
    fn dispatch_room_actions_requires_init() {
        let mut engine = None;
        let r = dispatch(&mut engine, ClientMsg::RoomActions { seq: 4 });
        assert_error(&r, 4);
    }

    #[test]
    fn dispatch_load_snapshot_requires_init() {
        let mut engine = None;
        let r = dispatch(
            &mut engine,
            ClientMsg::LoadSnapshot {
                seq: 5,
                snapshot_json: "{}".into(),
            },
        );
        assert_error(&r, 5);
    }

    // ── init_inline: an in-memory world boots and is playable ─────────────────

    /// A minimal but complete inline world: one room, one playable class.
    fn minimal_inline_world() -> ClientMsg {
        let world: InlineWorld = serde_json::from_value(serde_json::json!({
            "rooms": [{ "filename": "room_1.json", "content":
                r#"{ "id": "room_1", "name": "Trench", "description": "Mud.", "exits": {} }"# }],
            "items": [],
            "classes": [{ "filename": "class_1.json", "content":
                r#"{ "id": "class_1", "name": "Scout", "description": "t",
                    "base_stats": { "hp": 80, "attack": 12, "defense": 3 } }"# }],
            "npcs": [], "quests": [], "passives": [],
            "manifest": r#"{ "start_room_id": "room_1" }"#,
        }))
        .unwrap();
        ClientMsg::InitInline { seq: 10, world }
    }

    #[test]
    fn dispatch_init_inline_boots_and_plays() {
        let mut engine = None;
        let r = dispatch(&mut engine, minimal_inline_world());
        let v: serde_json::Value = serde_json::from_str(&r).unwrap();
        assert_eq!(v["type"], "ok", "init_inline should succeed: {r}");
        assert_eq!(v["seq"], 10);
        assert!(
            engine.is_some(),
            "engine should be initialized after init_inline"
        );

        // The inline world is actually playable: become the class, then look.
        dispatch(
            &mut engine,
            ClientMsg::Command {
                seq: 11,
                input: "become class_1".into(),
            },
        );
        let look = dispatch(
            &mut engine,
            ClientMsg::Command {
                seq: 12,
                input: "look".into(),
            },
        );
        let v: serde_json::Value = serde_json::from_str(&look).unwrap();
        assert_eq!(v["type"], "result");
        assert!(
            v["narrative"].as_str().unwrap_or("").contains("Trench"),
            "should be standing in the authored room: {look}"
        );
    }

    #[test]
    fn dispatch_init_inline_reports_bad_world() {
        // A class referencing a start room that doesn't exist must error, not panic.
        let world: InlineWorld = serde_json::from_value(serde_json::json!({
            "rooms": [],
            "manifest": r#"{ "start_room_id": "missing_room" }"#,
        }))
        .unwrap();
        let mut engine = None;
        let r = dispatch(&mut engine, ClientMsg::InitInline { seq: 13, world });
        assert_error(&r, 13);
    }

    #[test]
    fn dispatch_world_list_returns_array() {
        let mut engine = None;
        let r = dispatch(&mut engine, ClientMsg::WorldList { seq: 6 });
        let v: serde_json::Value = serde_json::from_str(&r).unwrap();
        assert_eq!(v["seq"], 6);
        assert_eq!(v["type"], "world_list");
        assert!(v["worlds"].is_array());
    }

    // ── filesystem helpers ───────────────────────────────────────────────────

    #[test]
    fn load_dir_returns_empty_for_missing_path() {
        let result = load_dir(&PathBuf::from("/nonexistent/path/xyz_chronos_test"));
        assert!(result.is_empty());
    }

    #[test]
    fn list_worlds_returns_empty_for_missing_dir() {
        // Override WORLDS_DIR to a path that doesn't exist.
        std::env::set_var("WORLDS_DIR", "/nonexistent/worlds_xyz_chronos_test");
        let result = list_worlds();
        std::env::remove_var("WORLDS_DIR");
        assert!(result.is_empty());
    }
}

// ── main ──────────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Use CHRONOS_PORT (not PORT) so the preview tool's PORT injection for Vite
    // doesn't accidentally redirect this server away from its default of 3000.
    let port: u16 = std::env::var("CHRONOS_PORT")
        .or_else(|_| std::env::var("PORT"))
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3000);

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/ws", get(ws_upgrade))
        .route("/api/worlds", get(worlds_handler))
        .route("/api/worlds/{world_id}/classes", get(classes_handler))
        .route("/api/worlds/{world_id}/items", get(items_handler))
        .layer(cors);

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    println!("chronos-server listening on ws://localhost:{port}/ws");
    println!("worlds dir: {}", worlds_dir().display());

    let listener = tokio::net::TcpListener::bind(addr).await.map_err(|e| {
        format!("could not bind to {addr}: {e} — is another instance already running?")
    })?;
    axum::serve(listener, app).await?;
    Ok(())
}
