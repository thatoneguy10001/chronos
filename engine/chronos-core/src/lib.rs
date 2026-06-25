//! `chronos-core` — the deterministic game engine.
//!
//! # Architecture
//!
//! The engine is a thin wrapper around a bevy_ecs `World`. All mutable game
//! state lives in ECS components; the `StaticRepository` holds read-only world
//! data loaded from JSON at startup.
//!
//! **Replay invariant**: `World state = bootstrap() + apply(events[0..=tick])`.
//! Every public operation that advances the game appends to an `EventLog`.
//! Rewinding to tick N means clearing the World, calling `bootstrap_world`, then
//! replaying the log — no snapshot diffing needed.
//!
//! # Module map
//!
//! | Module          | Responsibility |
//! |-----------------|----------------|
//! | `systems`       | One file per command verb: movement, combat, dialogue, etc. |
//! | `components`    | ECS component structs (Health, Stats, Position, …) |
//! | `data`          | `StaticRepository` + JSON schemas + `GameStateDTO` |
//! | `events`        | `EngineEvent` enum (one variant per command) + `CommandResult` |
//! | `journal`       | `EventLog` — append-only history for time-travel |
//! | `rng`           | `DeterministicRng` — seeded PRNG so replays are identical |

pub mod components;
pub mod data;
pub mod events;
pub mod journal;
pub mod layers;
pub mod rng;
pub mod systems;

use bevy_ecs::prelude::*;
use components::{
    AbilityCooldowns, ActiveEffects, AssembledWeapon, Controllable, Enemy, EquipSlot,
    EquipmentSlots, Experience, GameTime, Health, Identity, InInventory, ItemBlueprint,
    NpcDispositions, PayloadSlots, Position, QuestLog, Stats, Victory, Wallet, WorldFlags,
};
use data::game_state_dto::{
    CharacterStateDTO, EnemyStateDTO, EntityStateDTO, GameStateDTO, QuestProgressDTO,
};
use data::StaticRepository;
use events::{CommandResult, ContextAction, EngineEvent};
use journal::EventLog;
use rng::DeterministicRng;
use systems::{
    ability, character, character_sheet, combat, dialogue, input_parsing, interaction, movement,
    poison, quest, shop,
};

/// Fixed RNG seed for the session. Re-applied at every bootstrap so combat dice
/// are a pure function of (seed, event log) — the basis for replayable fights.
/// (A per-new-game seed can be threaded through later; fixed is fine for now.)
const WORLD_SEED: u64 = 0xC0FF_EE15_600D_5EED;

/// Gold cost of resting at an inn. Duplicated in dialogue strings is intentional;
/// keep this in sync with the NPC `rest_cost` field if that's ever added to the schema.
pub const REST_COST: i32 = 5;

/// The top-level engine handle. One instance per game session.
///
/// Architecture invariant: the ECS World is mutable runtime state.
/// The EventLog is immutable history. Rewinding to tick N means:
///   1. Drop the World.
///   2. bootstrap_world() with a fresh World.
///   3. Silently apply all log entries with tick <= N.
///
/// This guarantees deterministic replay without any special snapshot machinery.
pub struct ChronosEngine {
    world: World,
    repository: StaticRepository,
    event_log: EventLog,
    tick: u64,
}

impl ChronosEngine {
    pub fn new(repository: StaticRepository) -> Self {
        let mut world = World::new();
        Self::bootstrap_world(&mut world, &repository);
        Self {
            world,
            repository,
            event_log: EventLog::new(),
            tick: 0,
        }
    }

    /// Parse a raw string command and execute it, advancing the engine by one tick.
    pub fn process_command(&mut self, raw_input: &str) -> CommandResult {
        let event = input_parsing::parse(raw_input);

        if let EngineEvent::Unknown { ref raw } = event {
            return CommandResult {
                success: false,
                narrative: format!(
                    "I don't understand '{raw}'. Type 'help' for available commands."
                ),
                context_actions: vec![ContextAction {
                    label: "Help".into(),
                    command: "help".into(),
                }],
                inventory_ids: self.player_inventory_ids(),
                tick: self.tick,
                game_time: self.current_game_time(),
                npc_sections: vec![],
                game_over: false,
            };
        }

        // WorldCommand is the extensible verb seam. Until a layer claims a verb it
        // behaves exactly like Unknown — no tick, no log — so unrecognized verbs
        // never pollute the deterministic event log. Once a layer registers the
        // verb (see the layer dispatch registry), the command falls through to the
        // normal tick/apply/log path below and becomes replay-safe like any other.
        if let EngineEvent::WorldCommand { verb, .. } = &event {
            if !self.world_command_is_handled(verb) {
                return CommandResult {
                    success: false,
                    narrative: format!(
                        "Nothing here responds to '{verb}'. Type 'help' for available commands."
                    ),
                    context_actions: vec![ContextAction {
                        label: "Help".into(),
                        command: "help".into(),
                    }],
                    inventory_ids: self.player_inventory_ids(),
                    tick: self.tick,
                    game_time: self.current_game_time(),
                    npc_sections: vec![],
                    game_over: false,
                };
            }
        }

        // Restart is special: it resets everything including the event log, so it
        // gets its own path that bypasses normal tick/log machinery.
        if event == EngineEvent::Restart {
            Self::reset_world(&mut self.world);
            self.tick = 0;
            self.event_log = journal::EventLog::new();
            Self::bootstrap_world(&mut self.world, &self.repository);
            let result = self.apply_event(&EngineEvent::Look);
            return CommandResult {
                success: true,
                narrative: format!("=== NEW GAME ===\n\n{}", result.narrative),
                context_actions: result.context_actions,
                inventory_ids: vec![],
                tick: 0,
                game_time: self.current_game_time(),
                npc_sections: vec![],
                game_over: false,
            };
        }

        // Guard: if the player character is dead, block all commands except Restart.
        if self.player_is_dead() {
            return CommandResult {
                success: false,
                narrative: "You have fallen. Type 'restart' to begin a new game.".to_string(),
                context_actions: vec![ContextAction {
                    label: "Restart".into(),
                    command: "restart".into(),
                }],
                inventory_ids: self.player_inventory_ids(),
                tick: self.tick,
                game_time: self.current_game_time(),
                npc_sections: vec![],
                game_over: false,
            };
        }

        self.tick += 1;
        // Tick all DoT effects before the event so effects applied this tick start next tick.
        poison::tick_all_effects(&mut self.world, self.tick);
        let mut result = self.apply_event(&event);
        Self::advance_game_time(&mut self.world, &event, result.success);
        result.game_time = self.current_game_time();
        self.event_log.append(self.tick, event);

        // Victory check: if all quests just completed and player has no Victory marker yet,
        // append victory narrative and brand the player entity.
        if let Some(victory_text) = self.check_victory() {
            result.narrative.push_str(&victory_text);
        }

        result
    }

    /// Rewind the engine to the state it was in after the given tick.
    /// After this call, tick == target_tick and the World matches that moment exactly.
    pub fn rewind_to_tick(&mut self, target_tick: u64) {
        let entries = self.event_log.entries_up_to(target_tick);

        // Reset by clearing entities in place rather than dropping and recreating
        // the World. In bevy_ecs 0.19 resources are stored as entities. clear_entities()
        // resets the entity allocator but does NOT update the ResourceCache (the
        // component-id → entity-id map), so any subsequent insert_resource() would
        // panic with "ResourceCache is in sync" when it tries to access the now-invalid
        // entity IDs. We remove resources first so the cache is clean before the clear.
        Self::reset_world(&mut self.world);
        self.tick = 0;
        Self::bootstrap_world(&mut self.world, &self.repository);

        // Replay without logging (the log already contains these entries).
        // Tick poison and advance game time on each step to keep all state in sync.
        for entry in &entries {
            self.tick = entry.tick;
            poison::tick_all_effects(&mut self.world, self.tick);
            let result = self.apply_event(&entry.event);
            Self::advance_game_time(&mut self.world, &entry.event, result.success);
        }
    }

    /// Produce a description of the current location WITHOUT advancing the tick
    /// or appending to the event log. This is the read-only "peek" used after a
    /// rewind: it must never mutate history, or replay determinism breaks.
    pub fn describe_current(&mut self) -> CommandResult {
        let mut result = self.apply_event(&EngineEvent::Look);
        result.game_time = self.current_game_time();
        result
    }

    /// Return all available actions in the current room without advancing the tick.
    /// Combines exits / attack / items / NPCs from `look` with unlocked class abilities.
    pub fn peek_room_actions(&mut self) -> Vec<ContextAction> {
        let mut actions = {
            let r = movement::process_look(&mut self.world, &self.repository);
            r.context_actions
        };

        // Determine player class/level and current room for ability filtering.
        let player_info = {
            let mut q = self
                .world
                .query_filtered::<(&Identity, &Experience, &Position), With<Controllable>>();
            q.iter(&self.world)
                .next()
                .map(|(id, exp, pos)| (id.class_id.clone(), exp.level, pos.room_id.clone()))
        };
        if let Some((class_id, level, room_id)) = player_info {
            // Only show damaging abilities when there's something to hit.
            let enemies_present = {
                let mut q = self
                    .world
                    .query_filtered::<(&Position, &Health), With<Enemy>>();
                q.iter(&self.world)
                    .any(|(pos, hp)| pos.room_id == room_id && hp.current > 0)
            };

            if let Ok(class) = self.repository.class(&class_id) {
                for ability in &class.abilities {
                    if level < ability.unlock_level {
                        continue;
                    }

                    // Heals and pure self-buffs (no damage component) are always available.
                    // Damaging abilities — Single-target or AoE — only appear with live enemies.
                    let needs_enemy = ability.base_damage > 0 && ability.heal_amount == 0;
                    if needs_enemy && !enemies_present {
                        continue;
                    }

                    actions.push(ContextAction {
                        label: ability.name.clone(),
                        command: ability.id.replace('_', " "),
                    });
                }
            }
        }

        actions
    }

    /// Serialize the current engine state for saving or debug inspection.
    pub fn snapshot(&mut self) -> GameStateDTO {
        let player_room_id = {
            let mut q = self.world.query_filtered::<&Position, With<Controllable>>();
            q.iter(&self.world)
                .next()
                .map(|p| p.room_id.clone())
                .unwrap_or_default()
        };

        let inventory_ids = self.player_inventory_ids();

        // Player character sheet — present only once a class has been imprinted.
        let (player_gold, player_shards) = {
            let mut q = self.world.query_filtered::<&Wallet, With<Controllable>>();
            q.iter(&self.world)
                .next()
                .map(|w| (w.gold, w.shards))
                .unwrap_or((0, 0))
        };
        let active_quests: Vec<QuestProgressDTO> = {
            let mut q = self.world.query_filtered::<&QuestLog, With<Controllable>>();
            q.iter(&self.world)
                .next()
                .map(|ql| {
                    ql.entries
                        .iter()
                        .filter_map(|e| {
                            self.repository.quest(&e.quest_id).map(|t| {
                                use data::schemas::QuestObjective;
                                let (target, objective_hint) = match &t.objective {
                                    QuestObjective::KillCount { count, class_id } => {
                                        let label = class_id.replace('_', " ");
                                        (
                                            *count,
                                            format!(
                                                "Slay {} {} ({}/{})",
                                                count, label, e.progress, count
                                            ),
                                        )
                                    }
                                    QuestObjective::ReachRoom { room_id } => {
                                        let label = room_id.replace('_', " ");
                                        (1, format!("Reach {}", label))
                                    }
                                    QuestObjective::TalkTo { npc_id } => {
                                        let name = self
                                            .repository
                                            .npc(npc_id)
                                            .map(|n| n.name.clone())
                                            .unwrap_or_else(|_| npc_id.replace('_', " "));
                                        (1, format!("Talk to {}", name))
                                    }
                                };
                                QuestProgressDTO {
                                    quest_id: e.quest_id.clone(),
                                    name: t.name.clone(),
                                    description: t.description.clone(),
                                    objective_hint,
                                    progress: e.progress,
                                    target,
                                    completed: e.completed,
                                    ready_to_turn_in: e.ready_to_turn_in,
                                }
                            })
                        })
                        .collect()
                })
                .unwrap_or_default()
        };
        // Pre-collect assembled weapon display names so the closure below can look them up
        // without holding a borrow on self.world.
        let assembled_names: Vec<(String, String)> = {
            let mut q = self.world.query::<&AssembledWeapon>();
            q.iter(&self.world)
                .map(|aw| (aw.weapon_id.clone(), aw.display_name.clone()))
                .collect()
        };
        let player_character: Option<CharacterStateDTO> = {
            let mut q = self.world.query_filtered::<(
                &Identity,
                &Stats,
                &Health,
                &Experience,
                Option<&ActiveEffects>,
                Option<&EquipmentSlots>,
                Option<&PayloadSlots>,
            ), With<Controllable>>();
            q.iter(&self.world)
                .next()
                .map(|(id, stats, hp, exp, ae, eq, ps)| CharacterStateDTO {
                    name: id.name.clone(),
                    class_id: id.class_id.clone(),
                    hp: hp.current,
                    max_hp: hp.max,
                    attack: stats.attack(),
                    defense: stats.defense(),
                    intelligence: stats.intelligence(),
                    hit: stats.hit(),
                    tech_attack: stats.tech_attack(),
                    evasion: stats.evasion(),
                    endurance: stats.endurance(),
                    luck: stats.luck(),
                    agility: stats.agility(),
                    xp: exp.xp,
                    level: exp.level,
                    gold: player_gold,
                    shards: player_shards,
                    equipped_weapon: eq.and_then(|e| {
                        e.weapon.as_deref().map(|id| {
                            if let Some(wid) = id.strip_prefix("assembled:") {
                                assembled_names
                                    .iter()
                                    .find(|(k, _)| k == wid)
                                    .map(|(_, name)| name.clone())
                                    .unwrap_or_else(|| wid.to_string())
                            } else {
                                self.repository
                                    .item(id)
                                    .ok()
                                    .map(|t| t.name.clone())
                                    .unwrap_or_else(|| id.to_string())
                            }
                        })
                    }),
                    equipped_head: eq.and_then(|e| {
                        e.head
                            .as_deref()
                            .and_then(|id| self.repository.item(id).ok().map(|t| t.name.clone()))
                    }),
                    equipped_body: eq.and_then(|e| {
                        e.body
                            .as_deref()
                            .and_then(|id| self.repository.item(id).ok().map(|t| t.name.clone()))
                    }),
                    equipped_hands: eq.and_then(|e| {
                        e.hands
                            .as_deref()
                            .and_then(|id| self.repository.item(id).ok().map(|t| t.name.clone()))
                    }),
                    equipped_feet: eq.and_then(|e| {
                        e.feet
                            .as_deref()
                            .and_then(|id| self.repository.item(id).ok().map(|t| t.name.clone()))
                    }),
                    equipped_accessory_1: eq.and_then(|e| {
                        e.accessory_1
                            .as_deref()
                            .and_then(|id| self.repository.item(id).ok().map(|t| t.name.clone()))
                    }),
                    equipped_accessory_2: eq.and_then(|e| {
                        e.accessory_2
                            .as_deref()
                            .and_then(|id| self.repository.item(id).ok().map(|t| t.name.clone()))
                    }),
                    payload_slots: ps.map(|p| p.loaded.clone()).unwrap_or_default(),
                    payload_capacity: ps.map(|p| p.capacity as u32).unwrap_or(0),
                    active_effects: ae
                        .map(|a| {
                            a.effects
                                .iter()
                                .map(|e| e.kind.label().to_string())
                                .collect()
                        })
                        .unwrap_or_default(),
                    active_quests: active_quests.clone(),
                })
        };

        let entity_states: Vec<EntityStateDTO> = {
            let mut q = self
                .world
                .query::<(Option<&Position>, Option<&InInventory>, &ItemBlueprint)>();
            q.iter(&self.world)
                .map(|(pos, inv, bp)| EntityStateDTO {
                    blueprint_id: bp.id.clone(),
                    room_id: pos.map(|p| p.room_id.clone()),
                    owner_index: inv.map(|i| i.owner.index_u32()),
                })
                .collect()
        };

        let enemies: Vec<EnemyStateDTO> = {
            let mut q = self.world
                .query_filtered::<(&Identity, &Position, &Health, Option<&ActiveEffects>), With<Enemy>>();
            q.iter(&self.world)
                .map(|(id, pos, hp, ae)| EnemyStateDTO {
                    name: id.name.clone(),
                    class_id: id.class_id.clone(),
                    room_id: pos.room_id.clone(),
                    hp: hp.current,
                    max_hp: hp.max,
                    active_effects: ae
                        .map(|a| {
                            a.effects
                                .iter()
                                .map(|e| e.kind.label().to_string())
                                .collect()
                        })
                        .unwrap_or_default(),
                })
                .collect()
        };

        let current_room_name = self
            .repository
            .room(&player_room_id)
            .map(|r| r.name.clone())
            .unwrap_or_default();

        GameStateDTO {
            tick: self.tick,
            game_time: self.current_game_time(),
            player_room_id,
            current_room_name,
            inventory_ids,
            entity_states,
            player_character,
            enemies,
            event_log: self.event_log.entries().to_vec(),
        }
    }

    pub fn current_tick(&self) -> u64 {
        self.tick
    }

    pub fn max_tick(&self) -> u64 {
        self.event_log.current_tick()
    }

    /// Restore engine state from a previously saved snapshot JSON.
    /// Extracts the event log from the snapshot and replays it from a clean bootstrap,
    /// maintaining the time-travel invariant: State = bootstrap + replay(events).
    pub fn load_from_snapshot(&mut self, snapshot_json: &str) -> Result<(), String> {
        let snapshot: data::game_state_dto::GameStateDTO =
            serde_json::from_str(snapshot_json).map_err(|e| format!("Invalid save data: {e}"))?;

        self.event_log = journal::EventLog::from_entries(snapshot.event_log);
        let max = self.event_log.current_tick();

        Self::reset_world(&mut self.world);
        self.tick = 0;
        Self::bootstrap_world(&mut self.world, &self.repository);

        for entry in self.event_log.entries_up_to(max) {
            self.tick = entry.tick;
            poison::tick_all_effects(&mut self.world, self.tick);
            let result = self.apply_event(&entry.event);
            Self::advance_game_time(&mut self.world, &entry.event, result.success);
        }

        Ok(())
    }

    // --- Private ---

    /// Minutes of in-game time in the current world state.
    fn current_game_time(&self) -> u32 {
        self.world
            .get_resource::<GameTime>()
            .map(|gt| gt.minutes)
            .unwrap_or(360)
    }

    /// How many in-game minutes a given event costs. Read-only events cost 0.
    fn time_cost(event: &EngineEvent) -> u32 {
        match event {
            EngineEvent::Move { .. } => 15,
            EngineEvent::Attack => 1,
            EngineEvent::UseAbility { .. } => 1,
            EngineEvent::ApplyEffect { .. } => 1,
            EngineEvent::UseItem { .. } => 2,
            EngineEvent::PickUp { .. } => 1,
            EngineEvent::Drop { .. } => 1,
            EngineEvent::Buy { .. } => 5,
            EngineEvent::Talk { .. } => 5,
            EngineEvent::Ask { .. } => 5,
            EngineEvent::AcceptQuest { .. } => 2,
            EngineEvent::TurnIn { .. } => 5,
            EngineEvent::SpawnCharacter { .. } => 0,
            EngineEvent::Rest => 0, // handled separately: skip to dawn
            EngineEvent::Wait => 0, // handled separately: skip to dusk or dawn
            EngineEvent::Load { .. } => 1,
            EngineEvent::Unload { .. } => 1,
            _ => 0, // Look, Inventory, CharacterSheet, Help, etc.
        }
    }

    /// Advance in-game time for a completed event. Called after apply_event.
    fn advance_game_time(world: &mut World, event: &EngineEvent, succeeded: bool) {
        match event {
            EngineEvent::Rest if succeeded => {
                world.resource_mut::<GameTime>().skip_to_dawn();
            }
            EngineEvent::Rest => {} // failed rest: no time passes
            EngineEvent::Wait => {
                let is_night = world
                    .get_resource::<GameTime>()
                    .map(|gt| gt.is_night())
                    .unwrap_or(false);
                if is_night {
                    world.resource_mut::<GameTime>().skip_to_dawn();
                } else {
                    world.resource_mut::<GameTime>().skip_to_dusk();
                }
            }
            _ => {
                let cost = Self::time_cost(event);
                if cost > 0 {
                    world.resource_mut::<GameTime>().advance(cost);
                }
            }
        }
    }

    /// Reset the world without dropping it — safe on wasm32.
    ///
    /// In bevy_ecs 0.19, `despawn()` calls `flush()` *after* `mark_free()` bumps
    /// the entity's generation. For resource entities the `IsResource::on_discard`
    /// hook queues a command referencing the entity just freed; that flush panics
    /// with "entity 0v0 is invalid; its index now has generation 1".
    ///
    /// Fix: despawn only game entities (player, items, NPCs) and leave resource
    /// entities alive. Resource values are reset in place by `bootstrap_world`.
    fn reset_world(world: &mut World) {
        let resource_entity_ids: std::collections::HashSet<Entity> =
            world.resource_entities().iter().map(|(_, e)| e).collect();

        let game_entities: Vec<Entity> = world
            .iter_entities()
            .map(|e| e.id())
            .filter(|e| !resource_entity_ids.contains(e))
            .collect();
        for entity in game_entities {
            world.despawn(entity);
        }
    }

    /// Spawn baseline entities. Called at startup and before any replay.
    fn bootstrap_world(world: &mut World, repo: &StaticRepository) {
        // Resources are created on first call; reset_world() keeps them alive so
        // subsequent calls update the values in place via resource_mut() to avoid
        // spawning duplicate resource entities (which on_insert would remove with
        // a warning, leaving the old value unchanged anyway).
        if world.contains_resource::<DeterministicRng>() {
            *world.resource_mut::<DeterministicRng>() = DeterministicRng::new(WORLD_SEED);
            *world.resource_mut::<GameTime>() = GameTime::starting();
            *world.resource_mut::<WorldFlags>() = WorldFlags::default();
        } else {
            world.insert_resource(DeterministicRng::new(WORLD_SEED));
            world.insert_resource(GameTime::starting());
            world.insert_resource(WorldFlags::default());
        }

        world.spawn((
            Position {
                room_id: repo.start_room_id().to_string(),
            },
            Controllable,
            Health::full(100),
            ActiveEffects::default(),
            AbilityCooldowns::new(),
            EquipmentSlots::new(),
            NpcDispositions::default(),
            Wallet::new(),
            QuestLog::new(),
        ));

        for template in repo.all_items() {
            if let Some(room_id) = &template.starting_room_id {
                world.spawn((
                    Position {
                        room_id: room_id.clone(),
                    },
                    ItemBlueprint {
                        id: template.id.clone(),
                    },
                ));
            }
        }

        // Place enemies from the manifest's encounter list. Re-spawned on every
        // bootstrap at full health, so a rewind un-kills them and replay re-fights.
        // ActiveEffects is always present (empty) so the archetype is stable from spawn —
        // applying an effect later is a component mutation, not an archetype move.
        for enc in repo.encounters() {
            if let Ok(class) = repo.class(&enc.class_id) {
                let bs = &class.base_stats;
                // Fold this class's OnSpawn StatBonus passives into the enemy's
                // stats (e.g. heavy_plate → +DEF), so enemy passives are as real
                // as the player's. DamageOnHit passives don't apply to enemies —
                // they attack via tactics, not the player attack path.
                let mut stats = Stats::from_map(bs.stats.clone());
                for effect in repo.class_passive_effects(&class.id) {
                    if let crate::data::schemas::PassiveEffect::StatBonus { stat, amount } = effect
                    {
                        stats.add(stat, *amount);
                    }
                }
                world.spawn((
                    Position {
                        room_id: enc.room_id.clone(),
                    },
                    Enemy,
                    Identity {
                        name: class.name.clone(),
                        class_id: class.id.clone(),
                    },
                    stats,
                    Health::full(bs.hp),
                    ActiveEffects::default(),
                ));
            }
        }
    }

    /// Execute an event against the World. Does not touch the event log.
    /// Whether any active layer claims the given `WorldCommand` verb.
    ///
    /// This is the dispatch seam for the layer system. Today no layer registers
    /// verbs, so every world command is unhandled and behaves like `Unknown`.
    /// When the layer registry lands, this consults it: a verb owned by a layer
    /// in the world's stack returns `true` and flows through the normal
    /// tick/apply/log path, making world commands replay-safe by construction.
    fn world_command_is_handled(&self, verb: &str) -> bool {
        // Consult the world's validated layer stack: a verb is handled only if an
        // active layer claims it. No built-in layer registers verbs yet, so this
        // is currently always false for the shipped worlds — but a new layer that
        // owns verbs is picked up here automatically with no engine plumbing.
        self.repository.layer_stack().handles_verb(verb)
    }

    /// Route a `WorldCommand` to its owning layer. Mirror of `world_command_is_handled`:
    /// until layers register verbs this is only reached defensively (the guard in
    /// `process_command` short-circuits unhandled verbs first), so it returns a
    /// graceful "unrecognized" result rather than panicking.
    fn dispatch_world_command(
        &mut self,
        verb: &str,
        _args: &std::collections::HashMap<String, serde_json::Value>,
    ) -> CommandResult {
        CommandResult {
            success: false,
            narrative: format!("Nothing here responds to '{verb}'."),
            context_actions: vec![],
            inventory_ids: self.player_inventory_ids(),
            tick: self.tick,
            game_time: self.current_game_time(),
            npc_sections: vec![],
            game_over: false,
        }
    }

    fn apply_event(&mut self, event: &EngineEvent) -> CommandResult {
        match event {
            EngineEvent::Move { direction } => {
                let r = movement::process_move(&mut self.world, &self.repository, direction);
                let mut narrative = r.narrative;
                if r.success {
                    let player_e = {
                        let mut q = self.world.query_filtered::<Entity, With<Controllable>>();
                        q.iter(&self.world).next()
                    };
                    let new_room = {
                        let mut q = self.world.query_filtered::<&Position, With<Controllable>>();
                        q.iter(&self.world).next().map(|p| p.room_id.clone())
                    };
                    if let (Some(pe), Some(room_id)) = (player_e, new_room) {
                        let notices = quest::on_player_entered_room(
                            &mut self.world,
                            &self.repository,
                            pe,
                            &room_id,
                        );
                        for n in notices {
                            narrative.push_str(&n);
                        }
                    }
                }
                CommandResult {
                    success: r.success,
                    narrative,
                    context_actions: r.context_actions,
                    inventory_ids: self.player_inventory_ids(),
                    tick: self.tick,
                    game_time: self.current_game_time(),
                    npc_sections: vec![],
                    game_over: false,
                }
            }

            EngineEvent::Look => {
                let r = movement::process_look(&mut self.world, &self.repository);
                CommandResult {
                    success: r.success,
                    narrative: r.narrative,
                    context_actions: r.context_actions,
                    inventory_ids: self.player_inventory_ids(),
                    tick: self.tick,
                    game_time: self.current_game_time(),
                    npc_sections: vec![],
                    game_over: false,
                }
            }

            EngineEvent::PickUp { item_id } => {
                let r = interaction::process_pick_up(&mut self.world, &self.repository, item_id);
                if r.success {
                    let resolved = self
                        .repository
                        .item(item_id)
                        .ok()
                        .map(|t| t.id.clone())
                        .unwrap_or_default();
                    if resolved == "ren_diary" {
                        if let Some(mut flags) = self.world.get_resource_mut::<WorldFlags>() {
                            flags.set("diary_found_turned_in");
                        }
                    }
                }
                CommandResult {
                    success: r.success,
                    narrative: r.narrative,
                    context_actions: r.context_actions,
                    inventory_ids: r.inventory_ids,
                    tick: self.tick,
                    game_time: self.current_game_time(),
                    npc_sections: vec![],
                    game_over: false,
                }
            }

            EngineEvent::Drop { item_id } => {
                let r = interaction::process_drop(&mut self.world, &self.repository, item_id);
                CommandResult {
                    success: r.success,
                    narrative: r.narrative,
                    context_actions: r.context_actions,
                    inventory_ids: r.inventory_ids,
                    tick: self.tick,
                    game_time: self.current_game_time(),
                    npc_sections: vec![],
                    game_over: false,
                }
            }

            EngineEvent::Inventory => {
                let r = interaction::process_inventory(&mut self.world, &self.repository);
                CommandResult {
                    success: r.success,
                    narrative: r.narrative,
                    context_actions: r.context_actions,
                    inventory_ids: r.inventory_ids,
                    tick: self.tick,
                    game_time: self.current_game_time(),
                    npc_sections: vec![],
                    game_over: false,
                }
            }

            EngineEvent::SpawnCharacter { class_id, name } => {
                let r = character::process_spawn_character(
                    &mut self.world,
                    &self.repository,
                    class_id,
                    name,
                );
                if r.success && class_id == "iron_apothecary" {
                    let player_e = {
                        let mut q = self.world.query_filtered::<Entity, With<Controllable>>();
                        q.iter(&self.world).next()
                    };
                    if let Some(pe) = player_e {
                        self.world.entity_mut(pe).insert(PayloadSlots::new(3));
                    }
                }
                CommandResult {
                    success: r.success,
                    narrative: r.narrative,
                    context_actions: r.context_actions,
                    inventory_ids: self.player_inventory_ids(),
                    tick: self.tick,
                    game_time: self.current_game_time(),
                    npc_sections: vec![],
                    game_over: false,
                }
            }

            EngineEvent::Attack => {
                let r = combat::process_attack(&mut self.world, &self.repository, self.tick);
                CommandResult {
                    success: r.success,
                    narrative: r.narrative,
                    context_actions: r.context_actions,
                    inventory_ids: self.player_inventory_ids(),
                    tick: self.tick,
                    game_time: self.current_game_time(),
                    npc_sections: vec![],
                    game_over: r.game_over,
                }
            }

            EngineEvent::ApplyEffect {
                kind,
                target_name,
                damage_per_turn,
                duration_turns,
            } => {
                use components::EffectKind;
                let effect_kind = EffectKind::from_str(kind).unwrap_or(EffectKind::Poison);
                let r = poison::process_apply_effect(
                    &mut self.world,
                    self.tick,
                    effect_kind,
                    target_name,
                    *damage_per_turn,
                    *duration_turns,
                );
                CommandResult {
                    success: true,
                    narrative: r.narrative,
                    context_actions: r.context_actions,
                    inventory_ids: self.player_inventory_ids(),
                    tick: self.tick,
                    game_time: self.current_game_time(),
                    npc_sections: vec![],
                    game_over: false,
                }
            }

            EngineEvent::UseAbility {
                ability_name,
                target_name,
            } => {
                let r = ability::process_use_ability(
                    &mut self.world,
                    &self.repository,
                    ability_name,
                    target_name,
                    self.tick,
                );
                CommandResult {
                    success: r.success,
                    narrative: r.narrative,
                    context_actions: r.context_actions,
                    inventory_ids: self.player_inventory_ids(),
                    tick: self.tick,
                    game_time: self.current_game_time(),
                    npc_sections: vec![],
                    game_over: false,
                }
            }

            EngineEvent::CharacterSheet => {
                let r = character_sheet::process_character_sheet(&mut self.world, &self.repository);
                CommandResult {
                    success: r.success,
                    narrative: r.narrative,
                    context_actions: r.context_actions,
                    inventory_ids: self.player_inventory_ids(),
                    tick: self.tick,
                    game_time: self.current_game_time(),
                    npc_sections: vec![],
                    game_over: false,
                }
            }

            EngineEvent::UseItem { item_id } => {
                let r = interaction::process_use_item(&mut self.world, &self.repository, item_id);
                CommandResult {
                    success: r.success,
                    narrative: r.narrative,
                    context_actions: r.context_actions,
                    inventory_ids: r.inventory_ids,
                    tick: self.tick,
                    game_time: self.current_game_time(),
                    npc_sections: vec![],
                    game_over: false,
                }
            }

            EngineEvent::Talk { npc_id } => {
                let r = dialogue::process_talk(&mut self.world, &self.repository, npc_id);
                let mut narrative = r.narrative;
                if r.success {
                    let player_e = {
                        let mut q = self.world.query_filtered::<Entity, With<Controllable>>();
                        q.iter(&self.world).next()
                    };
                    if let Some(pe) = player_e {
                        let notices =
                            quest::on_npc_talked_to(&mut self.world, &self.repository, pe, npc_id);
                        for n in notices {
                            narrative.push_str(&n);
                        }
                    }
                }
                CommandResult {
                    success: r.success,
                    narrative,
                    context_actions: r.context_actions,
                    inventory_ids: self.player_inventory_ids(),
                    tick: self.tick,
                    game_time: self.current_game_time(),
                    npc_sections: r.npc_sections,
                    game_over: false,
                }
            }

            EngineEvent::Ask { npc_id, topic } => {
                let r = dialogue::process_ask(&mut self.world, &self.repository, npc_id, topic);
                CommandResult {
                    success: r.success,
                    narrative: r.narrative,
                    context_actions: r.context_actions,
                    inventory_ids: self.player_inventory_ids(),
                    tick: self.tick,
                    game_time: self.current_game_time(),
                    npc_sections: r.npc_sections,
                    game_over: false,
                }
            }

            EngineEvent::AcceptQuest { quest_id } => {
                let r = quest::process_accept_quest(&mut self.world, &self.repository, quest_id);
                CommandResult {
                    success: r.success,
                    narrative: r.narrative,
                    context_actions: r.context_actions,
                    inventory_ids: self.player_inventory_ids(),
                    tick: self.tick,
                    game_time: self.current_game_time(),
                    npc_sections: vec![],
                    game_over: false,
                }
            }

            EngineEvent::QuestLog => {
                let r = quest::process_quest_log(&mut self.world, &self.repository);
                CommandResult {
                    success: r.success,
                    narrative: r.narrative,
                    context_actions: r.context_actions,
                    inventory_ids: self.player_inventory_ids(),
                    tick: self.tick,
                    game_time: self.current_game_time(),
                    npc_sections: vec![],
                    game_over: false,
                }
            }

            EngineEvent::Rest => {
                let room_id = {
                    let mut q = self.world.query_filtered::<&Position, With<Controllable>>();
                    q.iter(&self.world)
                        .next()
                        .map(|p| p.room_id.clone())
                        .unwrap_or_default()
                };
                let rest_npc_name: Option<String> = self
                    .repository
                    .npcs_in_room(&room_id)
                    .iter()
                    .find_map(|id| {
                        self.repository
                            .npc(id)
                            .ok()
                            .filter(|n| n.rest_provider)
                            .map(|n| n.name.clone())
                    });
                let Some(npc_name) = rest_npc_name else {
                    return CommandResult {
                        success: false,
                        narrative: "There's nowhere to rest here.".to_string(),
                        context_actions: vec![],
                        inventory_ids: self.player_inventory_ids(),
                        tick: self.tick,
                        game_time: self.current_game_time(),
                        npc_sections: vec![],
                        game_over: false,
                    };
                };
                let (player_e, gold, hp_cur, hp_max) = {
                    let mut q = self
                        .world
                        .query_filtered::<(Entity, &Wallet, &Health), With<Controllable>>();
                    match q.iter(&self.world).next() {
                        Some((e, w, h)) => (e, w.gold, h.current, h.max),
                        None => {
                            return CommandResult {
                                success: false,
                                narrative: "No character to rest.".to_string(),
                                context_actions: vec![],
                                inventory_ids: self.player_inventory_ids(),
                                tick: self.tick,
                                game_time: self.current_game_time(),
                                npc_sections: vec![],
                                game_over: false,
                            }
                        }
                    }
                };
                if gold < REST_COST {
                    return CommandResult {
                        success: false,
                        narrative: format!("{npc_name} shakes their head. 'That'll be {REST_COST} gold for a rest. You've only got {gold}.'"),
                        context_actions: vec![],
                        inventory_ids: self.player_inventory_ids(),
                        tick: self.tick,
                        game_time: self.current_game_time(), npc_sections: vec![],
                    game_over: false,
                    };
                }
                if let Some(mut w) = self.world.entity_mut(player_e).get_mut::<Wallet>() {
                    w.gold -= REST_COST;
                }
                if let Some(mut h) = self.world.entity_mut(player_e).get_mut::<Health>() {
                    h.current = h.max;
                }
                let healed = hp_max - hp_cur;
                CommandResult {
                    success: true,
                    narrative: format!(
                        "You pay {REST_COST} gold and take a few hours to rest.\n\nYou wake fully restored.\n\nHP: {hp_cur} → {hp_max} (+{healed})."),
                    context_actions: vec![
                        ContextAction { label: "Look around".into(), command: "look".into() },
                    ],
                    inventory_ids: self.player_inventory_ids(),
                    tick: self.tick,
                    game_time: self.current_game_time(), npc_sections: vec![],
                game_over: false,
                }
            }

            EngineEvent::Wait => {
                let is_night = self
                    .world
                    .get_resource::<GameTime>()
                    .map(|gt| gt.is_night())
                    .unwrap_or(false);
                let narrative = if is_night {
                    "Hours pass. The Armistice fires die down. Dawn breaks over the Wastes, pale and cold. The ceasefire is over."
                } else {
                    "Hours pass. The light fades from the sky. In the distance, both sides fall silent — the Armistice has begun. The ceasefire holds until dawn."
                };
                CommandResult {
                    success: true,
                    narrative: narrative.to_string(),
                    context_actions: vec![ContextAction {
                        label: "Look around".into(),
                        command: "look".into(),
                    }],
                    inventory_ids: self.player_inventory_ids(),
                    tick: self.tick,
                    game_time: self.current_game_time(),
                    npc_sections: vec![],
                    game_over: false,
                }
            }

            EngineEvent::Examine { item_id } => {
                let item_id_lower = item_id.to_lowercase();
                let room_id = {
                    let mut q = self.world.query_filtered::<&Position, With<Controllable>>();
                    q.iter(&self.world)
                        .next()
                        .map(|p| p.room_id.clone())
                        .unwrap_or_default()
                };
                // Collect (id, in_room) for items in this room or in inventory.
                let candidates: Vec<(String, bool)> = {
                    let mut q = self
                        .world
                        .query::<(Option<&Position>, Option<&InInventory>, &ItemBlueprint)>();
                    q.iter(&self.world)
                        .filter(|(pos, inv, _)| {
                            pos.as_ref().map(|p| p.room_id == room_id).unwrap_or(false)
                                || inv.is_some()
                        })
                        .map(|(pos, _, bp)| {
                            let in_room =
                                pos.as_ref().map(|p| p.room_id == room_id).unwrap_or(false);
                            (bp.id.clone(), in_room)
                        })
                        .collect()
                };
                let found = candidates.iter().find(|(id, _)| {
                    id.to_lowercase().contains(&item_id_lower)
                        || self
                            .repository
                            .item(id)
                            .ok()
                            .map(|t| t.name.to_lowercase().contains(&item_id_lower))
                            .unwrap_or(false)
                });
                match found {
                    Some((found_id, in_room)) => {
                        let t = match self.repository.item(found_id) {
                            Ok(t) => t,
                            Err(_) => {
                                return CommandResult {
                                    success: false,
                                    narrative: format!(
                                        "Item data for '{found_id}' is missing from the world."
                                    ),
                                    context_actions: vec![],
                                    inventory_ids: self.player_inventory_ids(),
                                    tick: self.tick,
                                    game_time: self.current_game_time(),
                                    npc_sections: vec![],
                                    game_over: false,
                                }
                            }
                        };
                        // Special rendering for the diary: build contents from WorldFlags.
                        if t.id == "ren_diary" {
                            let flags = self
                                .world
                                .get_resource::<WorldFlags>()
                                .map(|f| f.flags.clone())
                                .unwrap_or_default();
                            let narrative = build_diary_narrative(&flags);
                            let context_actions = vec![ContextAction {
                                label: "Read the diary".to_string(),
                                command: "examine ren_diary".to_string(),
                            }];
                            return CommandResult {
                                success: true,
                                narrative,
                                context_actions,
                                inventory_ids: self.player_inventory_ids(),
                                tick: self.tick,
                                game_time: self.current_game_time(),
                                npc_sections: vec![],
                                game_over: false,
                            };
                        }
                        let context_actions = if *in_room {
                            vec![ContextAction {
                                label: format!("Take {}", t.name),
                                command: format!("take {}", t.id),
                            }]
                        } else {
                            let mut acts = vec![];
                            if t.attributes.contains_key("use_effect") {
                                acts.push(ContextAction {
                                    label: format!("Use {}", t.name),
                                    command: format!("use {}", t.id),
                                });
                            }
                            acts.push(ContextAction {
                                label: format!("Drop {}", t.name),
                                command: format!("drop {}", t.id),
                            });
                            acts
                        };
                        CommandResult {
                            success: true,
                            narrative: format!("**{}** — {}", t.name, t.description),
                            context_actions,
                            inventory_ids: self.player_inventory_ids(),
                            tick: self.tick,
                            game_time: self.current_game_time(),
                            npc_sections: vec![],
                            game_over: false,
                        }
                    }
                    None => CommandResult {
                        success: false,
                        narrative: format!("You don't see '{}' here.", item_id),
                        context_actions: vec![],
                        inventory_ids: self.player_inventory_ids(),
                        tick: self.tick,
                        game_time: self.current_game_time(),
                        npc_sections: vec![],
                        game_over: false,
                    },
                }
            }

            EngineEvent::Help => {
                let w = 54usize; // inner width between ║ delimiters
                let hr = format!("╠{}╣", "═".repeat(w));
                let top = format!("╔{}╗", "═".repeat(w));
                let bot = format!("╚{}╝", "═".repeat(w));
                let row = |s: &str| format!("║ {:<width$} ║", s, width = w - 2);

                let mut lines = vec![
                    top.clone(),
                    row("             CHRONOS — COMMANDS"),
                    hr.clone(),
                    row("MOVEMENT"),
                    row("  n/s/e/w   — move (or: go north/south/east/west)"),
                    hr.clone(),
                    row("EXPLORATION"),
                    row("  look (l)          — describe current room"),
                    row("  examine <item>    — read an item's description"),
                    row("  inventory (i)     — list carried items"),
                    row("  stats             — character sheet & abilities"),
                    row("  quests            — quest log"),
                    hr.clone(),
                    row("ITEMS"),
                    row("  take <item>   — pick up an item"),
                    row("  drop <item>   — drop a carried item"),
                    row("  use <item>    — use or drink an item"),
                    hr.clone(),
                    row("COMBAT"),
                    row("  attack        — fight the enemy in this room"),
                    row("  <ability name> — use a class ability (see 'stats' for list)"),
                    hr.clone(),
                    row("NPCS & SHOPS"),
                    row("  talk <npc>          — greet an NPC"),
                    row("  ask <npc> <topic>   — ask about a topic"),
                    row("  shop <npc>          — browse a vendor's wares"),
                    row("  buy <npc> <item>    — purchase an item"),
                    row("  accept <quest_id>        — accept a quest"),
                    row("  turn in <quest_id>   — turn in a completed quest"),
                    row(&format!(
                        "  rest               — sleep at an inn ({} gold, full HP)",
                        REST_COST
                    )),
                    hr.clone(),
                    row("CLASSES  (type to start playing)"),
                ];
                for c in self
                    .repository
                    .all_classes()
                    .filter(|c| c.tactics.is_empty())
                {
                    lines.push(row(&format!("  become {:<12} — {}", c.id, c.name)));
                }
                lines.push(hr.clone());
                lines.push(row("  restart        — start a new game"));
                lines.push(row("  help / ?       — show this reference"));
                lines.push(bot);

                CommandResult {
                    success: true,
                    narrative: lines.join("\n"),
                    context_actions: vec![ContextAction {
                        label: "Look around".into(),
                        command: "look".into(),
                    }],
                    inventory_ids: self.player_inventory_ids(),
                    tick: self.tick,
                    game_time: self.current_game_time(),
                    npc_sections: vec![],
                    game_over: false,
                }
            }

            EngineEvent::Shop { npc_id } => {
                let r = shop::process_shop(&mut self.world, &self.repository, npc_id);
                shop::shop_result_to_command(r, self.tick, self.current_game_time())
            }

            EngineEvent::Buy { npc_id, item_id } => {
                let r = shop::process_buy(&mut self.world, &self.repository, npc_id, item_id);
                shop::shop_result_to_command(r, self.tick, self.current_game_time())
            }

            EngineEvent::Assemble {
                frame_id,
                mechanism_id,
                enhancement_id,
            } => {
                let player_e = {
                    let mut q = self.world.query_filtered::<Entity, With<Controllable>>();
                    q.iter(&self.world).next()
                };
                let Some(player_e) = player_e else {
                    return CommandResult {
                        success: false,
                        narrative: "No character.".into(),
                        context_actions: vec![],
                        inventory_ids: vec![],
                        tick: self.tick,
                        game_time: self.current_game_time(),
                        npc_sections: vec![],
                        game_over: false,
                    };
                };

                // Validate all 3 parts are templates with weapon_part type.
                let parts: Vec<(String, String, i32, Option<String>)> = [
                    (&frame_id, "frame"),
                    (&mechanism_id, "mechanism"),
                    (&enhancement_id, "enhancement"),
                ]
                .iter()
                .filter_map(|(id, slot)| {
                    self.repository
                        .item(id)
                        .ok()
                        .map(|t| {
                            let part_slot = t
                                .attributes
                                .get("part_slot")
                                .and_then(|v| v.as_str())
                                .unwrap_or("");
                            let atk = t
                                .attributes
                                .get("part_attack")
                                .and_then(|v| v.as_i64())
                                .unwrap_or(0) as i32;
                            let fx = t
                                .attributes
                                .get("part_effect")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string());
                            (part_slot.to_string(), t.name.clone(), atk, fx)
                        })
                        .filter(|(ps, _, _, _)| ps == *slot)
                })
                .collect();

                if parts.len() < 3 {
                    return CommandResult {
                        success: false,
                        narrative: format!("Assembly failed: make sure you have a valid frame ({}), mechanism ({}), and enhancement ({}).", frame_id, mechanism_id, enhancement_id),
                        context_actions: vec![],
                        inventory_ids: self.player_inventory_ids(),
                        tick: self.tick,
                        game_time: self.current_game_time(), npc_sections: vec![],
                    game_over: false,
                    };
                }

                // Check all 3 parts are in player inventory.
                let part_ids = [
                    frame_id.as_str(),
                    mechanism_id.as_str(),
                    enhancement_id.as_str(),
                ];
                let mut entities_to_despawn = Vec::new();
                for pid in part_ids.iter() {
                    let found = {
                        let mut q = self.world.query::<(Entity, &InInventory, &ItemBlueprint)>();
                        q.iter(&self.world).find_map(|(e, inv, bp)| {
                            if inv.owner == player_e && bp.id == *pid {
                                Some(e)
                            } else {
                                None
                            }
                        })
                    };
                    match found {
                        Some(e) => entities_to_despawn.push(e),
                        None => {
                            return CommandResult {
                                success: false,
                                narrative: format!("You don't have '{}' in your inventory.", pid),
                                context_actions: vec![],
                                inventory_ids: self.player_inventory_ids(),
                                tick: self.tick,
                                game_time: self.current_game_time(),
                                npc_sections: vec![],
                                game_over: false,
                            }
                        }
                    }
                }

                // Despawn parts.
                for e in entities_to_despawn {
                    self.world.despawn(e);
                }

                // Compute combined stats.
                let total_atk: i32 = parts.iter().map(|(_, _, a, _)| a).sum();
                let on_hit = parts.iter().find_map(|(_, _, _, fx)| fx.clone());
                let part_names: Vec<&str> =
                    parts.iter().map(|(_, name, _, _)| name.as_str()).collect();
                let display_name =
                    format!("{} + {} + {}", part_names[0], part_names[1], part_names[2]);

                // Tick-derived ID is deterministic, so it survives event-log replay unchanged.
                let weapon_id = format!("aw_{}", self.tick);
                // Spawn the assembled weapon entity.
                self.world.spawn((
                    InInventory { owner: player_e },
                    AssembledWeapon {
                        weapon_id: weapon_id.clone(),
                        display_name: display_name.clone(),
                        attack_bonus: total_atk,
                        on_hit_effect: on_hit,
                        part_ids: [
                            frame_id.clone(),
                            mechanism_id.clone(),
                            enhancement_id.clone(),
                        ],
                    },
                ));

                CommandResult {
                    success: true,
                    narrative: format!("You assemble: {}. (+{} ATK)", display_name, total_atk),
                    context_actions: vec![ContextAction {
                        label: format!("Equip {display_name}"),
                        command: format!("equip assembled:{}", weapon_id),
                    }],
                    inventory_ids: self.player_inventory_ids(),
                    tick: self.tick,
                    game_time: self.current_game_time(),
                    npc_sections: vec![],
                    game_over: false,
                }
            }

            EngineEvent::Equip { item_id } => {
                // Resolve item: must be in player inventory or the current room.
                let player_e = {
                    let mut q = self.world.query_filtered::<Entity, With<Controllable>>();
                    q.iter(&self.world).next()
                };
                let Some(player_e) = player_e else {
                    return CommandResult {
                        success: false,
                        narrative: "No character.".into(),
                        context_actions: vec![],
                        inventory_ids: vec![],
                        tick: self.tick,
                        game_time: self.current_game_time(),
                        npc_sections: vec![],
                        game_over: false,
                    };
                };
                // Handle assembled weapons (assembled:<weapon_id>).
                let (narrative, success) = if let Some(id_part) = item_id.strip_prefix("assembled:")
                {
                    // Find assembled weapon in inventory by weapon_id.
                    let found = {
                        let mut q = self
                            .world
                            .query::<(Entity, &InInventory, &AssembledWeapon)>();
                        q.iter(&self.world).find_map(|(e, inv, aw)| {
                            if inv.owner == player_e && aw.weapon_id == id_part {
                                Some((
                                    e,
                                    aw.weapon_id.clone(),
                                    aw.display_name.clone(),
                                    aw.attack_bonus,
                                ))
                            } else {
                                None
                            }
                        })
                    };
                    if let Some((_e, wid, dname, atk)) = found {
                        if let Some(mut eq) =
                            self.world.entity_mut(player_e).get_mut::<EquipmentSlots>()
                        {
                            let slot_id = format!("assembled:{}", wid);
                            let prev = eq.weapon.replace(slot_id);
                            if let Some(old) = prev {
                                (
                                    format!(
                                        "You swap out {} and equip {} (+{} ATK).",
                                        old, dname, atk
                                    ),
                                    true,
                                )
                            } else {
                                (format!("You equip {} (+{} ATK).", dname, atk), true)
                            }
                        } else {
                            ("No equipment slots.".into(), false)
                        }
                    } else {
                        (
                            format!("No assembled weapon '{}' in inventory.", id_part),
                            false,
                        )
                    }
                } else {
                    // Check item exists in the template repository.
                    let item = self.repository.item(item_id);
                    if let Ok(tmpl) = item {
                        let slot = EquipSlot::from_tags(&tmpl.tags);
                        let Some(slot) = slot else {
                            return CommandResult {
                                success: false,
                                narrative: format!(
                                    "The {} doesn't seem to be equippable.",
                                    tmpl.name
                                ),
                                context_actions: vec![],
                                inventory_ids: self.player_inventory_ids(),
                                tick: self.tick,
                                game_time: self.current_game_time(),
                                npc_sections: vec![],
                                game_over: false,
                            };
                        };
                        if let Some(mut eq) =
                            self.world.entity_mut(player_e).get_mut::<EquipmentSlots>()
                        {
                            let prev = eq.set(slot, tmpl.id.clone());
                            let slot_label = slot.name();
                            if let Some(old_id) = prev {
                                let old_name = self
                                    .repository
                                    .item(&old_id)
                                    .ok()
                                    .map(|t| t.name.clone())
                                    .unwrap_or(old_id);
                                (
                                    format!(
                                        "You swap out the {} and equip the {} ({} slot).",
                                        old_name, tmpl.name, slot_label
                                    ),
                                    true,
                                )
                            } else {
                                (
                                    format!("You equip the {} ({} slot).", tmpl.name, slot_label),
                                    true,
                                )
                            }
                        } else {
                            ("No equipment slots.".into(), false)
                        }
                    } else {
                        (format!("No item '{}' found.", item_id), false)
                    }
                };
                CommandResult {
                    success,
                    narrative,
                    context_actions: vec![ContextAction {
                        label: "Unequip".into(),
                        command: "unequip".into(),
                    }],
                    inventory_ids: self.player_inventory_ids(),
                    tick: self.tick,
                    game_time: self.current_game_time(),
                    npc_sections: vec![],
                    game_over: false,
                }
            }

            EngineEvent::Unequip => {
                let player_e = {
                    let mut q = self.world.query_filtered::<Entity, With<Controllable>>();
                    q.iter(&self.world).next()
                };
                let Some(player_e) = player_e else {
                    return CommandResult {
                        success: false,
                        narrative: "No character.".into(),
                        context_actions: vec![],
                        inventory_ids: vec![],
                        tick: self.tick,
                        game_time: self.current_game_time(),
                        npc_sections: vec![],
                        game_over: false,
                    };
                };
                let (narrative, success) = if let Some(mut eq) =
                    self.world.entity_mut(player_e).get_mut::<EquipmentSlots>()
                {
                    // Bare "unequip" clears weapon slot for backward compatibility.
                    if let Some(old_id) = eq.weapon.take() {
                        let display = self
                            .repository
                            .item(&old_id)
                            .ok()
                            .map(|t| t.name.clone())
                            .unwrap_or_else(|| old_id.clone());
                        (format!("You unequip the {}.", display), true)
                    } else {
                        ("Nothing equipped in the weapon slot.".into(), false)
                    }
                } else {
                    ("No equipment slots.".into(), false)
                };
                CommandResult {
                    success,
                    narrative,
                    context_actions: vec![],
                    inventory_ids: self.player_inventory_ids(),
                    tick: self.tick,
                    game_time: self.current_game_time(),
                    npc_sections: vec![],
                    game_over: false,
                }
            }

            EngineEvent::UnequipSlot { slot } => {
                let player_e = {
                    let mut q = self.world.query_filtered::<Entity, With<Controllable>>();
                    q.iter(&self.world).next()
                };
                let Some(player_e) = player_e else {
                    return CommandResult {
                        success: false,
                        narrative: "No character.".into(),
                        context_actions: vec![],
                        inventory_ids: vec![],
                        tick: self.tick,
                        game_time: self.current_game_time(),
                        npc_sections: vec![],
                        game_over: false,
                    };
                };
                let parsed = EquipSlot::parse_slot(slot);
                let (narrative, success) = if let Some(target_slot) = parsed {
                    if let Some(mut eq) =
                        self.world.entity_mut(player_e).get_mut::<EquipmentSlots>()
                    {
                        if let Some(old_id) = eq.clear(target_slot) {
                            let display = self
                                .repository
                                .item(&old_id)
                                .ok()
                                .map(|t| t.name.clone())
                                .unwrap_or_else(|| old_id.clone());
                            (format!("You unequip the {}.", display), true)
                        } else {
                            (
                                format!("Nothing equipped in the {} slot.", target_slot.name()),
                                false,
                            )
                        }
                    } else {
                        ("No equipment slots.".into(), false)
                    }
                } else {
                    (
                        format!(
                            "Unknown slot '{}'. Try: weapon, head, body, hands, feet, accessory.",
                            slot
                        ),
                        false,
                    )
                };
                CommandResult {
                    success,
                    narrative,
                    context_actions: vec![],
                    inventory_ids: self.player_inventory_ids(),
                    tick: self.tick,
                    game_time: self.current_game_time(),
                    npc_sections: vec![],
                    game_over: false,
                }
            }

            EngineEvent::Load { payload_id } => {
                let player_e = {
                    let mut q = self.world.query_filtered::<Entity, With<Controllable>>();
                    q.iter(&self.world).next()
                };
                let Some(player_e) = player_e else {
                    return CommandResult {
                        success: false,
                        narrative: "No character.".into(),
                        context_actions: vec![],
                        inventory_ids: vec![],
                        tick: self.tick,
                        game_time: self.current_game_time(),
                        npc_sections: vec![],
                        game_over: false,
                    };
                };

                let (current_loaded, capacity) = match self.world.entity(player_e).get::<PayloadSlots>() {
                    Some(ps) => (ps.loaded.clone(), ps.capacity),
                    None => return CommandResult { success: false, narrative: "Your class doesn't have payload slots. Play as Iron Apothecary to use payloads.".into(), context_actions: vec![], inventory_ids: self.player_inventory_ids(), tick: self.tick, game_time: self.current_game_time(), npc_sections: vec![], game_over: false },
                };

                if current_loaded.len() >= capacity {
                    return CommandResult {
                        success: false,
                        narrative: format!(
                            "All {} payload slots are occupied. Unload a vial first.",
                            capacity
                        ),
                        context_actions: vec![],
                        inventory_ids: self.player_inventory_ids(),
                        tick: self.tick,
                        game_time: self.current_game_time(),
                        npc_sections: vec![],
                        game_over: false,
                    };
                }

                // Resolve item by ID (try with underscores too for "venom vial" → "venom_vial").
                let resolved_id = if self.repository.item(payload_id).is_ok() {
                    payload_id.clone()
                } else {
                    payload_id.replace(' ', "_")
                };

                let (payload_name, is_payload) = match self.repository.item(&resolved_id) {
                    Ok(t) => (
                        t.name.clone(),
                        t.attributes.get("item_type").and_then(|v| v.as_str()) == Some("payload"),
                    ),
                    Err(_) => {
                        return CommandResult {
                            success: false,
                            narrative: format!("Unknown item '{payload_id}'."),
                            context_actions: vec![],
                            inventory_ids: self.player_inventory_ids(),
                            tick: self.tick,
                            game_time: self.current_game_time(),
                            npc_sections: vec![],
                            game_over: false,
                        }
                    }
                };
                if !is_payload {
                    return CommandResult {
                        success: false,
                        narrative: format!("{payload_name} is not a payload vial."),
                        context_actions: vec![],
                        inventory_ids: self.player_inventory_ids(),
                        tick: self.tick,
                        game_time: self.current_game_time(),
                        npc_sections: vec![],
                        game_over: false,
                    };
                }
                if current_loaded.contains(&resolved_id) {
                    return CommandResult {
                        success: false,
                        narrative: format!("{payload_name} is already loaded."),
                        context_actions: vec![],
                        inventory_ids: self.player_inventory_ids(),
                        tick: self.tick,
                        game_time: self.current_game_time(),
                        npc_sections: vec![],
                        game_over: false,
                    };
                }

                let has_item = {
                    let mut q = self.world.query::<(&InInventory, &ItemBlueprint)>();
                    q.iter(&self.world)
                        .any(|(inv, bp)| inv.owner == player_e && bp.id == resolved_id)
                };
                if !has_item {
                    return CommandResult {
                        success: false,
                        narrative: format!("You don't have a {payload_name} in your inventory."),
                        context_actions: vec![],
                        inventory_ids: self.player_inventory_ids(),
                        tick: self.tick,
                        game_time: self.current_game_time(),
                        npc_sections: vec![],
                        game_over: false,
                    };
                }

                if let Some(mut ps) = self.world.entity_mut(player_e).get_mut::<PayloadSlots>() {
                    ps.loaded.push(resolved_id.clone());
                }
                let new_count = current_loaded.len() + 1;
                CommandResult {
                    success: true,
                    narrative: format!("You slot the {payload_name} into your syringe spear. ({new_count}/{capacity} loaded) It will apply on every hit."),
                    context_actions: vec![ContextAction { label: format!("Unload {payload_name}"), command: format!("unload {resolved_id}") }],
                    inventory_ids: self.player_inventory_ids(),
                    tick: self.tick,
                    game_time: self.current_game_time(), npc_sections: vec![],
                game_over: false,
                }
            }

            EngineEvent::Unload { payload_id } => {
                let player_e = {
                    let mut q = self.world.query_filtered::<Entity, With<Controllable>>();
                    q.iter(&self.world).next()
                };
                let Some(player_e) = player_e else {
                    return CommandResult {
                        success: false,
                        narrative: "No character.".into(),
                        context_actions: vec![],
                        inventory_ids: vec![],
                        tick: self.tick,
                        game_time: self.current_game_time(),
                        npc_sections: vec![],
                        game_over: false,
                    };
                };

                let current_loaded = match self.world.entity(player_e).get::<PayloadSlots>() {
                    Some(ps) => ps.loaded.clone(),
                    None => {
                        return CommandResult {
                            success: false,
                            narrative: "Your class doesn't have payload slots.".into(),
                            context_actions: vec![],
                            inventory_ids: self.player_inventory_ids(),
                            tick: self.tick,
                            game_time: self.current_game_time(),
                            npc_sections: vec![],
                            game_over: false,
                        }
                    }
                };

                // Find the payload by exact ID or partial name match.
                let payload_id_lower = payload_id.to_lowercase().replace(' ', "_");
                let matched = current_loaded
                    .iter()
                    .find(|id| {
                        let id_str = id.as_str();
                        id_str == payload_id.as_str()
                            || id_str == payload_id_lower.as_str()
                            || self
                                .repository
                                .item(id_str)
                                .ok()
                                .map(|t| {
                                    t.name
                                        .to_lowercase()
                                        .contains(payload_id.to_lowercase().as_str())
                                })
                                .unwrap_or(false)
                    })
                    .cloned();

                match matched {
                    Some(matched_id) => {
                        let name = self
                            .repository
                            .item(&matched_id)
                            .ok()
                            .map(|t| t.name.clone())
                            .unwrap_or_else(|| matched_id.clone());
                        if let Some(mut ps) =
                            self.world.entity_mut(player_e).get_mut::<PayloadSlots>()
                        {
                            ps.loaded.retain(|i| i != &matched_id);
                        }
                        CommandResult {
                            success: true,
                            narrative: format!("You eject the {name} from your syringe spear."),
                            context_actions: vec![ContextAction {
                                label: format!("Load {name}"),
                                command: format!("load {matched_id}"),
                            }],
                            inventory_ids: self.player_inventory_ids(),
                            tick: self.tick,
                            game_time: self.current_game_time(),
                            npc_sections: vec![],
                            game_over: false,
                        }
                    }
                    None => CommandResult {
                        success: false,
                        narrative: format!(
                            "No payload matching '{}' is currently loaded.",
                            payload_id
                        ),
                        context_actions: vec![],
                        inventory_ids: self.player_inventory_ids(),
                        tick: self.tick,
                        game_time: self.current_game_time(),
                        npc_sections: vec![],
                        game_over: false,
                    },
                }
            }

            EngineEvent::Restart => {
                // Handled before apply_event is called; shouldn't reach here.
                CommandResult {
                    success: true,
                    narrative: "Restarting...".to_string(),
                    context_actions: vec![],
                    inventory_ids: vec![],
                    tick: self.tick,
                    game_time: self.current_game_time(),
                    npc_sections: vec![],
                    game_over: false,
                }
            }

            EngineEvent::TurnIn { quest_id } => {
                let r = quest::process_turn_in(&mut self.world, &self.repository, quest_id);
                CommandResult {
                    success: r.success,
                    narrative: r.narrative,
                    context_actions: r.context_actions,
                    inventory_ids: self.player_inventory_ids(),
                    tick: self.tick,
                    game_time: self.current_game_time(),
                    npc_sections: vec![],
                    game_over: false,
                }
            }

            EngineEvent::DevGoto { room_id } => {
                if self.repository.room(room_id).is_err() {
                    return CommandResult {
                        success: false,
                        narrative: format!("[DEV] Unknown room id '{room_id}'. Check world data for valid room ids."),
                        context_actions: vec![],
                        inventory_ids: self.player_inventory_ids(),
                        tick: self.tick,
                        game_time: self.current_game_time(), npc_sections: vec![],
                    game_over: false,
                    };
                }
                // Scoped query releases the borrow before entity_mut + process_look.
                let player_entity = {
                    let mut q = self
                        .world
                        .query_filtered::<Entity, With<crate::components::Controllable>>();
                    q.iter(&self.world).next()
                };
                if let Some(e) = player_entity {
                    self.world
                        .entity_mut(e)
                        .insert(crate::components::Position {
                            room_id: room_id.clone(),
                        });
                }
                // Fire room-entry hooks so ReachRoom quest objectives are detected on teleport.
                let mut quest_notices = vec![];
                if let Some(pe) = player_entity {
                    quest_notices = quest::on_player_entered_room(
                        &mut self.world,
                        &self.repository,
                        pe,
                        room_id,
                    );
                }
                let r = movement::process_look(&mut self.world, &self.repository);
                let mut narrative = format!("[DEV] Teleported to '{room_id}'.\n{}", r.narrative);
                for n in quest_notices {
                    narrative.push_str(&n);
                }
                CommandResult {
                    success: true,
                    narrative,
                    context_actions: r.context_actions,
                    inventory_ids: self.player_inventory_ids(),
                    tick: self.tick,
                    game_time: self.current_game_time(),
                    npc_sections: vec![],
                    game_over: false,
                }
            }

            EngineEvent::DevComplete { quest_id } => {
                if self.repository.quest(quest_id).is_none() {
                    return CommandResult {
                        success: false,
                        narrative: format!("[DEV] Unknown quest id '{quest_id}'. Check world data for valid quest ids."),
                        context_actions: vec![],
                        inventory_ids: self.player_inventory_ids(),
                        tick: self.tick,
                        game_time: self.current_game_time(), npc_sections: vec![],
                    game_over: false,
                    };
                }
                let player_e = {
                    let mut q = self.world.query_filtered::<Entity, With<Controllable>>();
                    q.iter(&self.world).next()
                };
                if let Some(e) = player_e {
                    if let Some(mut log) = self.world.entity_mut(e).get_mut::<QuestLog>() {
                        if !log.has_any(quest_id) {
                            log.entries.push(crate::components::QuestEntry {
                                quest_id: quest_id.clone(),
                                progress: 999,
                                ready_to_turn_in: false,
                                completed: true,
                            });
                        } else if let Some(entry) =
                            log.entries.iter_mut().find(|e| e.quest_id == *quest_id)
                        {
                            entry.completed = true;
                            entry.ready_to_turn_in = false;
                        }
                    }
                }
                if let Some(mut flags) = self.world.get_resource_mut::<WorldFlags>() {
                    flags.set(&format!("{quest_id}_turned_in"));
                }
                let quest_name = self
                    .repository
                    .quest(quest_id)
                    .map(|q| q.name.clone())
                    .unwrap_or_else(|| quest_id.to_string());
                CommandResult {
                    success: true,
                    narrative: format!(
                        "[DEV] Quest '{}' marked complete. Chain gates unlocked.",
                        quest_name
                    ),
                    context_actions: vec![],
                    inventory_ids: self.player_inventory_ids(),
                    tick: self.tick,
                    game_time: self.current_game_time(),
                    npc_sections: vec![],
                    game_over: false,
                }
            }

            EngineEvent::WorldCommand { verb, args } => self.dispatch_world_command(verb, args),

            EngineEvent::Unknown { raw } => CommandResult {
                success: false,
                narrative: format!(
                    "I don't understand '{raw}'. Type 'help' for available commands."
                ),
                context_actions: vec![ContextAction {
                    label: "Help".into(),
                    command: "help".into(),
                }],
                inventory_ids: self.player_inventory_ids(),
                tick: self.tick,
                game_time: self.current_game_time(),
                npc_sections: vec![],
                game_over: false,
            },
        }
    }

    fn player_is_dead(&mut self) -> bool {
        let mut q = self
            .world
            .query_filtered::<&Health, (With<Controllable>, With<Identity>)>();
        q.iter(&self.world)
            .next()
            .map(|hp| hp.current <= 0)
            .unwrap_or(false)
    }

    /// Returns Some(victory_text) if all quests just completed and Victory not yet marked.
    /// Adds the Victory component to the player so this only fires once per session.
    fn check_victory(&mut self) -> Option<String> {
        // No quests in this repo → nothing to win
        self.repository.all_quests().next()?;

        // Already won
        let already_won = {
            let mut q = self
                .world
                .query_filtered::<Entity, (With<Controllable>, With<Victory>)>();
            q.iter(&self.world).next().is_some()
        };
        if already_won {
            return None;
        }

        // Check if all quests are complete
        let all_done = {
            let mut q = self.world.query_filtered::<&QuestLog, With<Controllable>>();
            q.iter(&self.world)
                .next()
                .map(|ql| {
                    let quest_ids: Vec<_> = self
                        .repository
                        .all_quests()
                        .map(|t| t.id.as_str())
                        .collect();
                    if quest_ids.is_empty() {
                        return false;
                    }
                    quest_ids.iter().all(|id| ql.is_completed(id))
                })
                .unwrap_or(false)
        };

        if all_done {
            // Brand the player with Victory marker
            let player_e = {
                let mut q = self.world.query_filtered::<Entity, With<Controllable>>();
                q.iter(&self.world).next()
            };
            if let Some(e) = player_e {
                self.world.entity_mut(e).insert(Victory);
            }
            Some(
                "\n\n\
                ╔══════════════════════════════════════╗\n\
                ║           ✦ VICTORY ✦               ║\n\
                ║  You have cleared Millbrook's        ║\n\
                ║  threats. The town is safe.          ║\n\
                ║  Type 'restart' for a new game.      ║\n\
                ╚══════════════════════════════════════╝"
                    .to_string(),
            )
        } else {
            None
        }
    }

    fn player_inventory_ids(&mut self) -> Vec<String> {
        let player = {
            let mut q = self.world.query_filtered::<Entity, With<Controllable>>();
            q.iter(&self.world).next()
        };
        let Some(player) = player else { return vec![] };

        let mut ids: Vec<String> = {
            let mut q = self.world.query::<(&InInventory, &ItemBlueprint)>();
            q.iter(&self.world)
                .filter(|(inv, _)| inv.owner == player)
                .map(|(_, bp)| bp.id.clone())
                .collect()
        };
        // Also include assembled weapons (they have no ItemBlueprint).
        let assembled: Vec<String> = {
            let mut q = self.world.query::<(&InInventory, &AssembledWeapon)>();
            q.iter(&self.world)
                .filter(|(inv, _)| inv.owner == player)
                .map(|(_, aw)| format!("assembled:{}", aw.weapon_id))
                .collect()
        };
        ids.extend(assembled);
        ids
    }
}

/// Build the full diary narrative from unlocked WorldFlags.
/// Ren's entries unlock as the Blood and Memory chain progresses.
/// Player entries appear after the same milestones, written in a different voice.
fn build_diary_narrative(flags: &std::collections::HashMap<String, bool>) -> String {
    let set = |k: &str| flags.get(k).copied().unwrap_or(false);
    let mut out = String::new();

    out.push_str("**A Soldier's Diary** — *Property of —*\n\n");
    out.push_str("─────────────────────────────────────────\n\n");

    // Entry 1 — always visible once diary is found
    out.push_str("*Day 12.*\n\
The recruiter said it would feel like purpose. It does, a little. Different from what I expected — colder and louder and more like work. But when we drilled today I thought: I know why I'm here. I thought that clearly. I wrote it down so I wouldn't lose it later.\n\n");

    if set("bam_before_silence_turned_in") {
        out.push_str("─────────────────────────────────────────\n\n");
        out.push_str("*Somewhere in year two.*\n\
I've stopped counting days. We all stopped around the same time — nobody announced it, it just happened. Kael says counting makes it feel longer. He's probably right. I haven't asked him since. We don't ask each other things the same way anymore. We still talk. It's different. WE, I wrote. I should say I. I notice I keep writing WE.\n\n");

        out.push_str("*[Your hand, different ink]*\n\
Showed it to the Commander today. He held it for a long time without opening it. He knew without being told what it was — that kind of quiet knowing. He said he should remember them more clearly. I think he does. I think that's the problem.\n\n");
    }

    if set("bam_bone_fields_turned_in") {
        out.push_str("─────────────────────────────────────────\n\n");
        out.push_str("*No date.*\n\
There's a place east of the trench where the ground changed color. I don't know when it happened. Nobody talks about what it is. I think it was a battle. I think a lot of people died there and nobody buried any of them and the ground absorbed it and that changed the color. I walked past the edge of it last week and I felt nothing. That's what I'm writing about. Not the ground. The fact that I felt nothing.\n\n");

        out.push_str("*[Your hand]*\n\
The color of the ground. I understand the entry now. There's no way to explain it without having stood here. Whoever wrote this — they stood here too. I don't think they felt nothing. I think they felt everything and stopped being able to call it by name.\n\n");
    }

    if set("bam_high_ground_turned_in") {
        out.push_str("─────────────────────────────────────────\n\n");
        out.push_str("*No date.*\n\
Something happened in the ruins. I'm not going to write what it was. I'm going to write around it, because writing it would make it the kind of thing that can be known, and I don't want it to be known. I want it to be the kind of thing that just happened to someone once, a long time ago, and stopped. But I can feel it didn't stop. I can feel it in the way I look at things now.\n\n");

        out.push_str("*[Your hand]*\n\
Kehl said: you can't keep taking the measure of something that keeps getting worse without it eventually measuring you back. I think that's what this entry is about. I'm not going to write what I think happened in the ruins either.\n\n");
    }

    if set("bam_arris_turned_in") {
        out.push_str("─────────────────────────────────────────\n\n");
        out.push_str("*Final entry.*\n\
I don't know what's left of me that isn't this war. I'm going to find out. That's all. That's the whole plan.\n\n");

        out.push_str("*[Your hand]*\n\
Sevyas can't see Arris's face. He knows he should be able to. Not the forgetting — knowing the shape of the loss without being able to see what you lost. I didn't tell him whether the name was in the diary.\n\n");
    }

    if set("bam_memory_enough_turned_in") {
        out.push_str("─────────────────────────────────────────\n\n");
        out.push_str("*[Your hand — the last page]*\n\
The diary is full. Whatever comes next is mine, not theirs. Whoever kept this book: the war didn't get to take this too. Someone carried it. Someone read it. Someone wrote in it. That's all. That's the whole plan.\n");
    }

    out
}
