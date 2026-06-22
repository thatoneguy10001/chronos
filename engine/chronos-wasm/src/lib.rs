use chronos_core::{data::repository::StaticRepository, ChronosEngine};
use serde::Deserialize;
use wasm_bindgen::prelude::*;

// Replace std's vendored dlmalloc (its wasm `memory.grow` path corrupts the heap
// once allocation outgrows the initial pages — see Cargo.toml) with lol_alloc, a
// wasm-native allocator. AssumeSingleThreaded is sound: wasm here is single-threaded.
#[cfg(target_arch = "wasm32")]
use lol_alloc::{AssumeSingleThreaded, FreeListAllocator};

#[cfg(target_arch = "wasm32")]
#[global_allocator]
static ALLOCATOR: AssumeSingleThreaded<FreeListAllocator> =
    unsafe { AssumeSingleThreaded::new(FreeListAllocator::new()) };

// Wire up console panics for debugging
pub fn set_panic_hook() {
    console_error_panic_hook::set_once();
}

/// Payload passed from JS to initialize the engine with bundled world data.
/// JS bundles room/item JSON files at build time and passes them as string arrays.
#[derive(Deserialize)]
pub struct WorldPayload {
    pub rooms: Vec<FileEntry>,
    pub items: Vec<FileEntry>,
    /// Character-class blueprints (data/classes/*.json). Optional so older
    /// payloads without classes still load.
    #[serde(default)]
    pub classes: Vec<FileEntry>,
    /// NPC blueprints (data/npcs/*.json). Optional so older payloads still load.
    #[serde(default)]
    pub npcs: Vec<FileEntry>,
    /// Quest blueprints (data/quests/*.json). Optional.
    #[serde(default)]
    pub quests: Vec<FileEntry>,
    /// Raw contents of manifest.json. Optional so older payloads still load
    /// (they fall back to the alphabetical start-room rule).
    #[serde(default)]
    pub manifest: Option<String>,
}

#[derive(Deserialize)]
pub struct FileEntry {
    pub filename: String,
    pub content: String,
}

/// The WASM-exposed engine handle. JS holds one instance per session.
#[wasm_bindgen]
pub struct WasmEngine {
    inner: ChronosEngine,
}

#[wasm_bindgen]
impl WasmEngine {
    /// Construct the engine from serialized world JSON passed by the JS bundler.
    /// Returns an error string if any blueprint file fails to parse.
    #[wasm_bindgen(constructor)]
    pub fn new(world_payload_json: &str) -> Result<WasmEngine, JsValue> {
        set_panic_hook();

        let payload: WorldPayload = serde_json::from_str(world_payload_json)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;

        let room_pairs: Vec<(&str, &str)> = payload
            .rooms
            .iter()
            .map(|e| (e.filename.as_str(), e.content.as_str()))
            .collect();

        let item_pairs: Vec<(&str, &str)> = payload
            .items
            .iter()
            .map(|e| (e.filename.as_str(), e.content.as_str()))
            .collect();

        let class_pairs: Vec<(&str, &str)> = payload
            .classes
            .iter()
            .map(|e| (e.filename.as_str(), e.content.as_str()))
            .collect();

        let npc_pairs: Vec<(&str, &str)> = payload
            .npcs
            .iter()
            .map(|e| (e.filename.as_str(), e.content.as_str()))
            .collect();

        let quest_pairs: Vec<(&str, &str)> = payload
            .quests
            .iter()
            .map(|e| (e.filename.as_str(), e.content.as_str()))
            .collect();

        let repo = StaticRepository::from_json_pairs_full(
            &room_pairs,
            &item_pairs,
            &class_pairs,
            &npc_pairs,
            &quest_pairs,
            payload.manifest.as_deref(),
        )
        .map_err(|e| JsValue::from_str(&e.to_string()))?;

        Ok(WasmEngine {
            inner: ChronosEngine::new(repo),
        })
    }

    /// Process one command string. Returns a JSON-serialized CommandResult.
    #[wasm_bindgen]
    pub fn process_command(&mut self, raw_input: &str) -> String {
        let result = self.inner.process_command(raw_input);
        serde_json::to_string(&result).unwrap()
    }

    /// Rewind the engine to tick N and return a CommandResult reflecting that state.
    /// Uses describe_current() (a read-only peek) so the rewind itself never
    /// advances the tick or appends to the event log — replay stays deterministic.
    #[wasm_bindgen]
    pub fn rewind_to_tick(&mut self, target_tick: u32) -> String {
        self.inner.rewind_to_tick(target_tick as u64);
        let result = self.inner.describe_current();
        serde_json::to_string(&result).unwrap()
    }

    /// Full engine snapshot for debugging. Returns JSON-serialized GameStateDTO.
    #[wasm_bindgen]
    pub fn snapshot(&mut self) -> String {
        serde_json::to_string(&self.inner.snapshot()).unwrap()
    }

    /// Load engine state from a snapshot JSON (produced by `snapshot()`).
    /// Replays the embedded event log from a fresh bootstrap.
    /// Returns an error string if the JSON is invalid; on success returns the
    /// CommandResult of the restored state (same as describe_current after rewind).
    #[wasm_bindgen]
    pub fn load_from_snapshot(&mut self, snapshot_json: &str) -> Result<String, JsValue> {
        self.inner
            .load_from_snapshot(snapshot_json)
            .map_err(|e| JsValue::from_str(&e))?;
        let result = self.inner.describe_current();
        Ok(serde_json::to_string(&result).unwrap())
    }

    /// Return all available room actions (exits, items, NPCs, unlocked abilities)
    /// without advancing the tick. Used to populate the BUTTONS panel's tabs.
    #[wasm_bindgen]
    pub fn peek_room_actions(&mut self) -> String {
        let actions = self.inner.peek_room_actions();
        serde_json::to_string(&actions).unwrap()
    }

    #[wasm_bindgen(getter)]
    pub fn current_tick(&self) -> u32 {
        self.inner.current_tick() as u32
    }

    #[wasm_bindgen(getter)]
    pub fn max_tick(&self) -> u32 {
        self.inner.max_tick() as u32
    }
}
