use crate::data::schemas::{
    ClassTemplate, EncounterDef, ItemTemplate, LayerConfig, NpcTemplate, QuestTemplate,
    RoomTemplate, WorldManifest, CURRENT_SCHEMA_VERSION,
};
use crate::layers::{LayerError, LayerStack};
use std::collections::HashMap;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum RepositoryError {
    #[error("JSON parse error in {file}: {source}")]
    ParseError {
        file: String,
        source: serde_json::Error,
    },
    #[error("No start room defined — at least one room must exist")]
    NoStartRoom,
    #[error("Manifest start_room_id '{0}' does not match any room")]
    StartRoomNotFound(String),
    #[error(
        "World schema_version {found} is newer than this engine supports (max {supported}). \
         Update the engine to run this world."
    )]
    UnsupportedSchemaVersion { found: u32, supported: u32 },
    #[error("Invalid layer stack: {0}")]
    InvalidLayerStack(#[from] LayerError),
    #[error("Item template '{0}' not found")]
    ItemNotFound(String),
    #[error("Room template '{0}' not found")]
    RoomNotFound(String),
    #[error("Class template '{0}' not found")]
    ClassNotFound(String),
    #[error("NPC template '{0}' not found")]
    NpcNotFound(String),
}

/// Immutable world blueprint compiled from JSON at engine startup.
/// Once built, this structure is never mutated; all runtime state lives in the ECS World.
#[derive(Debug)]
pub struct StaticRepository {
    rooms: HashMap<String, RoomTemplate>,
    items: HashMap<String, ItemTemplate>,
    classes: HashMap<String, ClassTemplate>,
    npcs: HashMap<String, NpcTemplate>,
    quests: HashMap<String, QuestTemplate>,
    encounters: Vec<EncounterDef>,
    /// Maps room_id → list of npc_ids present in that room.
    npc_placements: HashMap<String, Vec<String>>,
    /// Maps npc_id → room_id (reverse index for fast "where is this NPC" lookup).
    npc_id_to_room: HashMap<String, String>,
    start_room_id: String,
    /// Schema version declared by the manifest (validated ≤ CURRENT_SCHEMA_VERSION).
    schema_version: u32,
    /// The world's layer stack — defines its genre. Empty for default-engine worlds.
    layers: Vec<LayerConfig>,
    /// Validated view of `layers`: dependency-checked, used for verb routing.
    layer_stack: LayerStack,
}

impl StaticRepository {
    /// Build repository from raw JSON strings. Caller provides a list of (filename, contents)
    /// pairs so this compiles clean on both native (filesystem) and WASM (bundled assets).
    ///
    /// `manifest_json` is the contents of `manifest.json`. When present, its
    /// `start_room_id` defines the canonical spawn point (validated against the
    /// loaded rooms). When `None`, the start falls back to the alphabetically
    /// first room id — a convenience for tests and partial worlds.
    pub fn from_json_pairs(
        room_jsons: &[(&str, &str)],
        item_jsons: &[(&str, &str)],
        class_jsons: &[(&str, &str)],
        manifest_json: Option<&str>,
    ) -> Result<Self, RepositoryError> {
        Self::from_json_pairs_with_npcs(room_jsons, item_jsons, class_jsons, &[], manifest_json)
    }

    pub fn from_json_pairs_with_npcs(
        room_jsons: &[(&str, &str)],
        item_jsons: &[(&str, &str)],
        class_jsons: &[(&str, &str)],
        npc_jsons: &[(&str, &str)],
        manifest_json: Option<&str>,
    ) -> Result<Self, RepositoryError> {
        Self::from_json_pairs_full(
            room_jsons,
            item_jsons,
            class_jsons,
            npc_jsons,
            &[],
            manifest_json,
        )
    }

    pub fn from_json_pairs_full(
        room_jsons: &[(&str, &str)],
        item_jsons: &[(&str, &str)],
        class_jsons: &[(&str, &str)],
        npc_jsons: &[(&str, &str)],
        quest_jsons: &[(&str, &str)],
        manifest_json: Option<&str>,
    ) -> Result<Self, RepositoryError> {
        let mut rooms = HashMap::new();
        for (file, json) in room_jsons {
            let template: RoomTemplate =
                serde_json::from_str(json).map_err(|e| RepositoryError::ParseError {
                    file: file.to_string(),
                    source: e,
                })?;
            rooms.insert(template.id.clone(), template);
        }

        let mut items = HashMap::new();
        for (file, json) in item_jsons {
            let template: ItemTemplate =
                serde_json::from_str(json).map_err(|e| RepositoryError::ParseError {
                    file: file.to_string(),
                    source: e,
                })?;
            items.insert(template.id.clone(), template);
        }

        let mut classes = HashMap::new();
        for (file, json) in class_jsons {
            let template: ClassTemplate =
                serde_json::from_str(json).map_err(|e| RepositoryError::ParseError {
                    file: file.to_string(),
                    source: e,
                })?;
            classes.insert(template.id.clone(), template);
        }

        let mut npcs = HashMap::new();
        for (file, json) in npc_jsons {
            let template: NpcTemplate =
                serde_json::from_str(json).map_err(|e| RepositoryError::ParseError {
                    file: file.to_string(),
                    source: e,
                })?;
            npcs.insert(template.id.clone(), template);
        }

        let mut quests = HashMap::new();
        for (file, json) in quest_jsons {
            let template: QuestTemplate =
                serde_json::from_str(json).map_err(|e| RepositoryError::ParseError {
                    file: file.to_string(),
                    source: e,
                })?;
            quests.insert(template.id.clone(), template);
        }

        let (start_room_id, encounters, raw_placements, schema_version, layers) =
            match manifest_json {
                Some(json) => {
                    let manifest: WorldManifest =
                        serde_json::from_str(json).map_err(|e| RepositoryError::ParseError {
                            file: "manifest.json".to_string(),
                            source: e,
                        })?;
                    // Version gate: an engine can migrate older worlds forward, but it
                    // cannot run a world authored against a *newer* schema than it knows.
                    if manifest.schema_version > CURRENT_SCHEMA_VERSION {
                        return Err(RepositoryError::UnsupportedSchemaVersion {
                            found: manifest.schema_version,
                            supported: CURRENT_SCHEMA_VERSION,
                        });
                    }
                    if !rooms.contains_key(&manifest.start_room_id) {
                        return Err(RepositoryError::StartRoomNotFound(manifest.start_room_id));
                    }
                    (
                        manifest.start_room_id,
                        manifest.encounters,
                        manifest.npc_placements,
                        manifest.schema_version,
                        manifest.layers,
                    )
                }
                None => (
                    rooms
                        .keys()
                        .min()
                        .ok_or(RepositoryError::NoStartRoom)?
                        .clone(),
                    Vec::new(),
                    Vec::new(),
                    CURRENT_SCHEMA_VERSION,
                    Vec::new(),
                ),
            };

        // Build and validate the layer stack. An invalid stack (unknown layer,
        // missing/out-of-order dependency) is a load error, caught here rather
        // than surfacing as mysterious runtime behaviour. An empty stack is valid.
        let layer_stack = LayerStack::from_configs(&layers);
        layer_stack.validate()?;

        // Build room → [npc_ids] and npc_id → room indexes.
        let mut npc_placements: HashMap<String, Vec<String>> = HashMap::new();
        let mut npc_id_to_room: HashMap<String, String> = HashMap::new();
        for p in raw_placements {
            npc_placements
                .entry(p.room_id.clone())
                .or_default()
                .push(p.npc_id.clone());
            npc_id_to_room.insert(p.npc_id, p.room_id);
        }

        Ok(Self {
            rooms,
            items,
            classes,
            npcs,
            quests,
            encounters,
            npc_placements,
            npc_id_to_room,
            start_room_id,
            schema_version,
            layers,
            layer_stack,
        })
    }

    pub fn start_room_id(&self) -> &str {
        &self.start_room_id
    }

    /// The schema version the loaded world declared (always ≤ CURRENT_SCHEMA_VERSION).
    pub fn schema_version(&self) -> u32 {
        self.schema_version
    }

    /// The world's full layer stack, in declared order. Empty for worlds that
    /// rely on the engine's built-in defaults (everything authored pre-layers).
    pub fn layers(&self) -> &[LayerConfig] {
        &self.layers
    }

    /// Look up a single layer's config by id (`"combat"`, `"space"`, …), if the
    /// world declared it. Returns `None` when the layer isn't in the stack.
    pub fn layer(&self, id: &str) -> Option<&LayerConfig> {
        self.layers.iter().find(|l| l.id == id)
    }

    /// The world's validated layer stack — dependency-checked and used for
    /// `WorldCommand` verb routing.
    pub fn layer_stack(&self) -> &LayerStack {
        &self.layer_stack
    }

    pub fn room(&self, id: &str) -> Result<&RoomTemplate, RepositoryError> {
        self.rooms
            .get(id)
            .ok_or_else(|| RepositoryError::RoomNotFound(id.to_string()))
    }

    pub fn item(&self, id: &str) -> Result<&ItemTemplate, RepositoryError> {
        self.items
            .get(id)
            .ok_or_else(|| RepositoryError::ItemNotFound(id.to_string()))
    }

    pub fn class(&self, id: &str) -> Result<&ClassTemplate, RepositoryError> {
        self.classes
            .get(id)
            .ok_or_else(|| RepositoryError::ClassNotFound(id.to_string()))
    }

    pub fn all_classes(&self) -> impl Iterator<Item = &ClassTemplate> {
        self.classes.values()
    }

    pub fn encounters(&self) -> &[EncounterDef] {
        &self.encounters
    }

    pub fn all_rooms(&self) -> impl Iterator<Item = &RoomTemplate> {
        self.rooms.values()
    }

    pub fn all_items(&self) -> impl Iterator<Item = &ItemTemplate> {
        self.items.values()
    }

    /// Returns every item whose starting_room_id matches the given room.
    pub fn items_starting_in(&self, room_id: &str) -> Vec<&ItemTemplate> {
        self.items
            .values()
            .filter(|t| t.starting_room_id.as_deref() == Some(room_id))
            .collect()
    }

    pub fn npc(&self, id: &str) -> Result<&NpcTemplate, RepositoryError> {
        self.npcs
            .get(id)
            .ok_or_else(|| RepositoryError::NpcNotFound(id.to_string()))
    }

    /// Room ID that the given NPC occupies, or None if not placed.
    pub fn npc_room(&self, npc_id: &str) -> Option<&str> {
        self.npc_id_to_room.get(npc_id).map(|s| s.as_str())
    }

    pub fn quest(&self, id: &str) -> Option<&QuestTemplate> {
        self.quests.get(id)
    }

    /// All quests offered by the given NPC.
    pub fn quests_for_npc(&self, npc_id: &str) -> Vec<&QuestTemplate> {
        self.quests
            .values()
            .filter(|q| q.giver_npc_id == npc_id)
            .collect()
    }

    pub fn all_quests(&self) -> impl Iterator<Item = &QuestTemplate> {
        self.quests.values()
    }

    /// NPCs present in the given room (by npc_id).
    pub fn npcs_in_room(&self, room_id: &str) -> &[String] {
        self.npc_placements
            .get(room_id)
            .map(|v| v.as_slice())
            .unwrap_or(&[])
    }
}
