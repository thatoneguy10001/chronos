use axum::{
    extract::{ws::{Message, WebSocket, WebSocketUpgrade}, Path},
    response::{Json, Response},
    routing::get,
    Router,
};
use chronos_core::{
    data::{game_state_dto::GameStateDTO, repository::StaticRepository},
    events::{CommandResult, ContextAction},
    ChronosEngine,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{fs, net::SocketAddr, path::PathBuf};
use tower_http::cors::{Any, CorsLayer};

// ── message types ────────────────────────────────────────────────────────────

/// Every message from the browser includes a `seq` so we can match responses.
#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ClientMsg {
    WorldList    { seq: u64 },
    Init         { seq: u64, world_id: String },
    Command      { seq: u64, input: String },
    Rewind       { seq: u64, tick: u32 },
    Snapshot     { seq: u64 },
    RoomActions  { seq: u64 },
    LoadSnapshot { seq: u64, snapshot_json: String },
}

/// Flatten CommandResult into the Result variant so the browser sees a single flat object.
#[derive(Serialize)]
struct ResultMsg {
    seq: u64,
    #[serde(rename = "type")]
    msg_type: &'static str,
    #[serde(flatten)]
    result: CommandResult,
    room_actions: Vec<ContextAction>,
}

#[derive(Serialize)]
struct SnapshotMsg {
    seq: u64,
    #[serde(rename = "type")]
    msg_type: &'static str,
    #[serde(flatten)]
    state: GameStateDTO,
}

#[derive(Serialize)]
struct SimpleMsg<T: Serialize> {
    seq: u64,
    #[serde(rename = "type")]
    msg_type: &'static str,
    #[serde(flatten)]
    payload: T,
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
    let Ok(entries) = fs::read_dir(dir) else { return vec![] };
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
        return Err(format!("World '{}' not found in {}", world_id, worlds_dir().display()));
    }

    let rooms   = load_dir(&base.join("rooms"));
    let items   = load_dir(&base.join("items"));
    let classes = load_dir(&base.join("classes"));
    let npcs    = load_dir(&base.join("npcs"));
    let quests  = load_dir(&base.join("quests"));
    let manifest = load_file_opt(&base.join("manifest.json"));

    // StaticRepository wants &[(&str, &str)] — borrow from our owned Vecs.
    let room_pairs:   Vec<(&str, &str)> = rooms.iter().map(|(k,v)| (k.as_str(), v.as_str())).collect();
    let item_pairs:   Vec<(&str, &str)> = items.iter().map(|(k,v)| (k.as_str(), v.as_str())).collect();
    let class_pairs:  Vec<(&str, &str)> = classes.iter().map(|(k,v)| (k.as_str(), v.as_str())).collect();
    let npc_pairs:    Vec<(&str, &str)> = npcs.iter().map(|(k,v)| (k.as_str(), v.as_str())).collect();
    let quest_pairs:  Vec<(&str, &str)> = quests.iter().map(|(k,v)| (k.as_str(), v.as_str())).collect();

    StaticRepository::from_json_pairs_full(
        &room_pairs,
        &item_pairs,
        &class_pairs,
        &npc_pairs,
        &quest_pairs,
        manifest.as_deref(),
    )
    .map_err(|e| e.to_string())
}

/// List all available worlds by scanning for world.json files.
fn list_worlds() -> Vec<Value> {
    let base = worlds_dir();
    let Ok(entries) = fs::read_dir(&base) else { return vec![] };
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
            Message::Text(t)  => t,
            Message::Close(_) => break,
            _                 => continue,
        };

        let response = match serde_json::from_str::<ClientMsg>(&text) {
            Err(e) => err_msg(0, format!("bad message: {e}")),
            Ok(client_msg) => dispatch(&mut engine, client_msg),
        };

        if socket.send(Message::Text(response)).await.is_err() {
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

        ClientMsg::Init { seq, world_id } => {
            match build_repo(&world_id) {
                Err(e) => err_msg(seq, e),
                Ok(repo) => {
                    *engine = Some(ChronosEngine::new(repo));
                    ok_msg(seq)
                }
            }
        }

        ClientMsg::Command { seq, input } => {
            let Some(eng) = engine.as_mut() else {
                return err_msg(seq, "engine not initialized — send Init first");
            };
            let result      = eng.process_command(&input);
            let room_actions = eng.peek_room_actions();
            let max_tick    = eng.max_tick();
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
            })).unwrap()
        }

        ClientMsg::Rewind { seq, tick } => {
            let Some(eng) = engine.as_mut() else {
                return err_msg(seq, "engine not initialized");
            };
            eng.rewind_to_tick(tick as u64);
            let result      = eng.describe_current();
            let room_actions = eng.peek_room_actions();
            let max_tick    = eng.max_tick();
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
            })).unwrap()
        }

        ClientMsg::Snapshot { seq } => {
            let Some(eng) = engine.as_mut() else {
                return err_msg(seq, "engine not initialized");
            };
            let snap = eng.snapshot();
            let mut val = serde_json::to_value(&snap).unwrap();
            val["seq"]  = serde_json::json!(seq);
            val["type"] = serde_json::json!("snapshot");
            val.to_string()
        }

        ClientMsg::RoomActions { seq } => {
            let Some(eng) = engine.as_mut() else {
                return err_msg(seq, "engine not initialized");
            };
            let actions = eng.peek_room_actions();
            serde_json::json!({ "seq": seq, "type": "room_actions", "actions": actions }).to_string()
        }

        ClientMsg::LoadSnapshot { seq, snapshot_json } => {
            let Some(eng) = engine.as_mut() else {
                return err_msg(seq, "engine not initialized");
            };
            match eng.load_from_snapshot(&snapshot_json) {
                Err(e) => err_msg(seq, e),
                Ok(()) => {
                    let result      = eng.describe_current();
                    let room_actions = eng.peek_room_actions();
                    let max_tick    = eng.max_tick();
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
                    })).unwrap()
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
            let xp   = v.get("xp_reward").and_then(|x| x.as_i64()).unwrap_or(0);
            let gold = v.get("gold_reward").and_then(|x| x.as_i64()).unwrap_or(0);
            if xp > 0 || gold > 0 { return None; }
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
            }))
        })
        .collect();
    Json(items)
}

// ── main ──────────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() {
    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3000);

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/ws",                              get(ws_upgrade))
        .route("/api/worlds",                      get(worlds_handler))
        .route("/api/worlds/:world_id/classes",    get(classes_handler))
        .route("/api/worlds/:world_id/items",      get(items_handler))
        .layer(cors);

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    println!("chronos-server listening on ws://localhost:{port}/ws");
    println!("worlds dir: {}", worlds_dir().display());

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
