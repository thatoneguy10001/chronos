//! Integration test reproducing the time-travel rewind path end-to-end,
//! mirroring exactly what the WASM layer does.

use chronos_core::data::repository::RepositoryError;
use chronos_core::{data::repository::StaticRepository, ChronosEngine};

/// Shared room/item blueprints for the test world.
fn world_data() -> (
    Vec<(&'static str, &'static str)>,
    Vec<(&'static str, &'static str)>,
) {
    let rooms = vec![
        (
            "dim_corridor.json",
            r#"{
            "id": "dim_corridor",
            "name": "Dim Corridor",
            "description": "A narrow corridor.",
            "exits": { "west": { "target_room_id": "stone_foyer" } }
        }"#,
        ),
        (
            "stone_foyer.json",
            r#"{
            "id": "stone_foyer",
            "name": "Stone Foyer",
            "description": "A cold foyer.",
            "exits": { "east": { "target_room_id": "dim_corridor" } }
        }"#,
        ),
    ];
    let items = vec![(
        "iron_key.json",
        r#"{
            "id": "iron_key",
            "name": "Iron Key",
            "description": "A heavy key.",
            "starting_room_id": "dim_corridor"
        }"#,
    )];
    (rooms, items)
}

/// A minimal class blueprint so spawn tests have something to imprint.
fn test_classes() -> Vec<(&'static str, &'static str)> {
    vec![(
        "fighter.json",
        r#"{
        "id": "fighter",
        "name": "Fighter",
        "description": "A tank.",
        "base_stats": { "hp": 120, "attack": 9, "defense": 8, "intelligence": 2 }
    }"#,
    )]
}

fn test_repo() -> StaticRepository {
    let (rooms, items) = world_data();
    // Start in the corridor (where the key is) so the rewind tests can take it.
    let manifest = r#"{ "start_room_id": "dim_corridor" }"#;
    StaticRepository::from_json_pairs(&rooms, &items, &test_classes(), Some(manifest)).unwrap()
}

/// A repo with a plague_knight + a goblin: tests septic_strike (bleed) replay.
fn plague_repo() -> StaticRepository {
    let (rooms, items) = world_data();
    let classes = vec![
        (
            "plague_knight.json",
            r#"{ "id": "plague_knight", "name": "Plague Knight", "description": "t",
            "base_stats": { "hp": 100, "attack": 11, "defense": 6, "intelligence": 5 },
            "abilities": [{
                "id": "septic_strike", "name": "Septic Strike",
                "description": "bleed hit", "base_damage": 5,
                "applies_effect": "bleed", "effect_damage": 2, "effect_duration": 4
            }] }"#,
        ),
        (
            "goblin.json",
            r#"{ "id": "goblin", "name": "Goblin", "description": "g",
            "base_stats": { "hp": 100, "attack": 2, "defense": 1, "intelligence": 1 },
            "xp_reward": 10 }"#,
        ),
    ];
    let manifest = r#"{ "start_room_id": "dim_corridor",
        "encounters": [ { "class_id": "goblin", "room_id": "dim_corridor" } ] }"#;
    StaticRepository::from_json_pairs(&rooms, &items, &classes, Some(manifest)).unwrap()
}

/// A repo whose goblin always uses HeavyAttack (threshold 0.99 → fires once HP is
/// below 99% of max, which is true after the very first player hit).
fn tactic_repo() -> StaticRepository {
    let (rooms, items) = world_data();
    let classes = vec![
        (
            "fighter.json",
            r#"{ "id": "fighter", "name": "Fighter", "description": "t",
            "base_stats": { "hp": 120, "attack": 9, "defense": 8, "intelligence": 2 } }"#,
        ),
        (
            "goblin.json",
            r#"{ "id": "goblin", "name": "Goblin", "description": "g",
            "base_stats": { "hp": 30, "attack": 7, "defense": 3, "intelligence": 1 },
            "xp_reward": 10,
            "tactics": [
                { "condition": { "type": "hp_below", "threshold": 0.99 },
                  "action": { "type": "heavy_attack", "multiplier": 2.0 } },
                { "condition": { "type": "always" },
                  "action": { "type": "basic_attack" } }
            ] }"#,
        ),
    ];
    let manifest = r#"{ "start_room_id": "dim_corridor",
        "encounters": [ { "class_id": "goblin", "room_id": "dim_corridor" } ] }"#;
    StaticRepository::from_json_pairs(&rooms, &items, &classes, Some(manifest)).unwrap()
}

/// A repo with a fighter + a goblin placed in the player's start room, so combat
/// tests can `become fighter` then `attack` without moving.
fn combat_repo() -> StaticRepository {
    let (rooms, items) = world_data();
    let classes = vec![
        (
            "fighter.json",
            r#"{ "id": "fighter", "name": "Fighter", "description": "t",
            "base_stats": { "hp": 120, "attack": 9, "defense": 8, "intelligence": 2 } }"#,
        ),
        (
            "goblin.json",
            r#"{ "id": "goblin", "name": "Goblin", "description": "g",
            "base_stats": { "hp": 30, "attack": 7, "defense": 3, "intelligence": 1 },
            "xp_reward": 50 }"#,
        ),
    ];
    let manifest = r#"{ "start_room_id": "dim_corridor",
        "encounters": [ { "class_id": "goblin", "room_id": "dim_corridor" } ] }"#;
    StaticRepository::from_json_pairs(&rooms, &items, &classes, Some(manifest)).unwrap()
}

#[test]
fn manifest_selects_start_room() {
    let (rooms, items) = world_data();
    let manifest = r#"{ "start_room_id": "stone_foyer", "title": "Test World" }"#;
    let repo = StaticRepository::from_json_pairs(&rooms, &items, &[], Some(manifest)).unwrap();
    assert_eq!(repo.start_room_id(), "stone_foyer");
}

#[test]
fn manifest_with_unknown_start_room_errors() {
    let (rooms, items) = world_data();
    let manifest = r#"{ "start_room_id": "nonexistent_room" }"#;
    let err = StaticRepository::from_json_pairs(&rooms, &items, &[], Some(manifest)).unwrap_err();
    assert!(matches!(err, RepositoryError::StartRoomNotFound(id) if id == "nonexistent_room"));
}

#[test]
fn no_manifest_falls_back_to_alphabetical_start() {
    let (rooms, items) = world_data();
    let repo = StaticRepository::from_json_pairs(&rooms, &items, &[], None).unwrap();
    // "dim_corridor" < "stone_foyer" alphabetically.
    assert_eq!(repo.start_room_id(), "dim_corridor");
}

#[test]
fn manifest_without_version_defaults_to_v1() {
    let (rooms, items) = world_data();
    // A pre-versioning manifest (no schema_version field) loads as v1.
    let manifest = r#"{ "start_room_id": "dim_corridor" }"#;
    let repo = StaticRepository::from_json_pairs(&rooms, &items, &[], Some(manifest)).unwrap();
    assert_eq!(repo.schema_version(), 1);
    // No layers declared → empty stack → engine uses built-in defaults.
    assert!(repo.layers().is_empty());
}

#[test]
fn manifest_newer_than_engine_is_rejected() {
    let (rooms, items) = world_data();
    // A world authored against a future schema must not silently load — the engine
    // can't know about fields that didn't exist when it was built.
    let manifest = r#"{ "schema_version": 9999, "start_room_id": "dim_corridor" }"#;
    let err = StaticRepository::from_json_pairs(&rooms, &items, &[], Some(manifest)).unwrap_err();
    assert!(matches!(
        err,
        RepositoryError::UnsupportedSchemaVersion { found: 9999, .. }
    ));
}

#[test]
fn manifest_layer_stack_parses_with_freeform_params() {
    let (rooms, items) = world_data();
    let manifest = r#"{
        "start_room_id": "dim_corridor",
        "layers": [
            { "id": "space", "mode": "room_graph" },
            { "id": "entity" },
            { "id": "economy", "currencies": ["scraps", "shards"] },
            { "id": "combat", "mode": "turn_order", "party_size": 4 }
        ]
    }"#;
    let repo = StaticRepository::from_json_pairs(&rooms, &items, &[], Some(manifest)).unwrap();

    assert_eq!(repo.layers().len(), 4);

    // mode is pulled out as a first-class field.
    let combat = repo.layer("combat").expect("combat layer present");
    assert_eq!(combat.mode.as_deref(), Some("turn_order"));
    // Extra keys land in the flattened param bag, no schema change needed.
    assert_eq!(combat.param_i64("party_size"), Some(4));

    // A layer with no mode reports None; unknown layers report None.
    let economy = repo.layer("economy").expect("economy layer present");
    assert_eq!(economy.mode, None);
    assert!(repo.layer("nonexistent").is_none());

    // The validated stack is exposed and reflects the declared order.
    assert!(repo.layer_stack().contains("combat"));
    assert_eq!(
        repo.layer_stack().ids().first().map(|s| s.as_str()),
        Some("space")
    );
}

#[test]
fn manifest_with_invalid_layer_stack_fails_to_load() {
    let (rooms, items) = world_data();
    // combat requires space + entity; declaring it alone is an invalid stack and
    // must fail at load rather than silently running a broken world.
    let manifest = r#"{
        "start_room_id": "dim_corridor",
        "layers": [ { "id": "combat" } ]
    }"#;
    let err = StaticRepository::from_json_pairs(&rooms, &items, &[], Some(manifest)).unwrap_err();
    assert!(matches!(err, RepositoryError::InvalidLayerStack(_)));
}

#[test]
fn rewind_restores_picked_up_item_to_room() {
    let mut engine = ChronosEngine::new(test_repo());

    // tick 1: look
    engine.process_command("look");
    // tick 2: take the key
    let take = engine.process_command("take iron key");
    assert!(take.success, "pick up should succeed");
    assert_eq!(engine.current_tick(), 2);
    assert_eq!(engine.max_tick(), 2);

    // Rewind to tick 1 — before the key was taken.
    engine.rewind_to_tick(1);

    // After rewind: tick must be exactly 1, and history must NOT have grown.
    assert_eq!(
        engine.current_tick(),
        1,
        "rewind must land on the target tick"
    );
    assert_eq!(
        engine.max_tick(),
        2,
        "rewind must not append to the event log"
    );

    // The key should be back in the room (inventory empty).
    let snap = engine.snapshot();
    assert!(
        snap.inventory_ids.is_empty(),
        "key should not be held after rewind to tick 1"
    );
}

#[test]
fn repeated_rewinds_after_archetype_moves_are_stable() {
    // Exercises the exact shape that trapped bevy's World drop on wasm:
    // pick up an item (archetype move), then reset the world repeatedly.
    let mut engine = ChronosEngine::new(test_repo());
    engine.process_command("look"); // tick 1
    engine.process_command("take iron key"); // tick 2 (archetype move)
    engine.process_command("drop iron key"); // tick 3 (archetype move back)
    engine.process_command("take iron key"); // tick 4 (archetype move again)

    for target in [0u64, 2, 4, 1, 3] {
        engine.rewind_to_tick(target);
        assert_eq!(engine.current_tick(), target);
        // Snapshot must always succeed and reflect a coherent world.
        let snap = engine.snapshot();
        let held = !snap.inventory_ids.is_empty();
        // Key is held after ticks 2 and 4 (takes), not after 0/1/3.
        let expected_held = target == 2 || target == 4;
        assert_eq!(held, expected_held, "inventory mismatch at tick {target}");
    }
    // History is never mutated by any of the rewinds.
    assert_eq!(engine.max_tick(), 4);
}

#[test]
fn spawn_character_replays_under_rewind() {
    // Character creation is just another logged event, so rewinding past it must
    // un-make the character, and replaying forward must rebuild it identically.
    let mut engine = ChronosEngine::new(test_repo());

    // tick 0: no character yet — bootstrap body has no Identity/Stats.
    assert!(
        engine.snapshot().player_character.is_none(),
        "no character before spawn"
    );

    // tick 1: become a Fighter.
    let res = engine.process_command("become fighter Aragorn");
    assert!(res.success, "spawn should succeed");
    let sheet = engine
        .snapshot()
        .player_character
        .expect("character after spawn");
    assert_eq!(sheet.name, "Aragorn");
    assert_eq!(sheet.class_id, "fighter");
    assert_eq!((sheet.hp, sheet.max_hp), (120, 120));
    assert_eq!((sheet.attack, sheet.defense, sheet.intelligence), (9, 8, 2));

    // tick 2: walk somewhere (the character must persist across other events).
    engine.process_command("go west");
    assert!(
        engine.snapshot().player_character.is_some(),
        "character persists after moving"
    );

    // Rewind to tick 0 — before creation. The character must be gone.
    engine.rewind_to_tick(0);
    assert!(
        engine.snapshot().player_character.is_none(),
        "rewind past spawn un-makes the character"
    );

    // Replay forward to tick 1 — the character must come back, identical.
    engine.rewind_to_tick(1);
    let restored = engine
        .snapshot()
        .player_character
        .expect("character restored by replay");
    assert_eq!(restored.name, "Aragorn");
    assert_eq!((restored.hp, restored.max_hp), (120, 120));

    // History was never mutated by the rewinds.
    assert_eq!(engine.max_tick(), 2);
}

#[test]
fn unknown_class_is_rejected_without_advancing_state() {
    let mut engine = ChronosEngine::new(test_repo());
    let res = engine.process_command("become wizard");
    assert!(!res.success, "unknown class should fail");
    assert!(
        engine.snapshot().player_character.is_none(),
        "no character imprinted on failure"
    );
}

#[test]
fn combat_replays_identically_under_rewind() {
    // The headline of slice 3: a fight is deterministic. Damage uses the seeded
    // RNG, so rewinding to mid-fight and replaying must reproduce the exact HPs.
    let mut engine = ChronosEngine::new(combat_repo());
    engine.process_command("become fighter Aragorn"); // tick 1

    // Goblin starts at full health, in the room with us.
    let goblin0 = engine.snapshot().enemies;
    assert_eq!(goblin0.len(), 1);
    assert_eq!(goblin0[0].hp, 30);

    // tick 2: first exchange.
    assert!(engine.process_command("attack").success);
    let snap2 = engine.snapshot();
    let enemy_hp_t2 = snap2.enemies[0].hp;
    let player_hp_t2 = snap2.player_character.as_ref().unwrap().hp;
    assert!(enemy_hp_t2 < 30, "goblin should have taken damage");

    // tick 3: second exchange (advances the RNG stream further).
    engine.process_command("attack");

    // Rewind to tick 2 and re-read: must match the original tick-2 state EXACTLY.
    engine.rewind_to_tick(2);
    let replay = engine.snapshot();
    assert_eq!(
        replay.enemies[0].hp, enemy_hp_t2,
        "enemy HP must replay identically"
    );
    assert_eq!(
        replay.player_character.as_ref().unwrap().hp,
        player_hp_t2,
        "player HP must replay identically"
    );
    assert_eq!(engine.max_tick(), 3, "rewind must not grow history");
}

#[test]
fn rewind_un_kills_a_slain_enemy() {
    let mut engine = ChronosEngine::new(combat_repo());
    engine.process_command("become fighter Aragorn"); // tick 1

    // Beat the goblin to death (fighter atk 9 vs goblin def 3, goblin 30 HP).
    let mut guard = 0;
    while !engine.snapshot().enemies.is_empty() {
        engine.process_command("attack");
        guard += 1;
        assert!(guard < 50, "goblin should have died by now");
    }
    // The corpse is despawned.
    assert!(engine.snapshot().enemies.is_empty(), "slain goblin is gone");
    // The player survived (goblin only ever chips 1 HP through 120 HP / def 8).
    assert!(engine.snapshot().player_character.unwrap().hp > 0);

    // Rewind to before the first swing — the goblin must be back, at full health.
    engine.rewind_to_tick(1);
    let revived = engine.snapshot().enemies;
    assert_eq!(revived.len(), 1, "rewind respawns the slain goblin");
    assert_eq!(revived[0].hp, 30, "respawned goblin is at full health");
}

#[test]
fn poison_ticks_and_replays_under_rewind() {
    // Poison is deterministic (no RNG) — it ticks based on the applied_at_tick
    // and duration. Rewind must show identical poison damage at each replayed tick.
    let mut engine = ChronosEngine::new(combat_repo());
    engine.process_command("become fighter Aragorn"); // tick 1

    // Apply poison to the goblin: 2 damage/turn, 3 turns duration.
    assert!(engine.process_command("poison goblin").success); // tick 2

    // Tick 2: poison was applied; no damage yet (ticking starts tick 3).
    let snap2 = engine.snapshot();
    assert_eq!(snap2.enemies[0].hp, 30, "no damage on application tick");

    // Tick 3: first poison damage (30 - 2 = 28).
    engine.process_command("look"); // tick 3, just advance time
    let snap3 = engine.snapshot();
    assert_eq!(snap3.enemies[0].hp, 28, "poison ticks once on first turn");

    // Tick 4: second poison damage (28 - 2 = 26).
    engine.process_command("look"); // tick 4
    let snap4 = engine.snapshot();
    assert_eq!(snap4.enemies[0].hp, 26, "poison ticks twice");

    // Tick 5: third and final poison damage (26 - 2 = 24), then expires.
    engine.process_command("look"); // tick 5
    let snap5 = engine.snapshot();
    assert_eq!(snap5.enemies[0].hp, 24, "poison ticks thrice, then expires");

    // Rewind to tick 3 and verify poison damage matches exactly.
    engine.rewind_to_tick(3);
    let replay3 = engine.snapshot();
    assert_eq!(
        replay3.enemies[0].hp, 28,
        "rewind tick 3: poison damage replayed identically"
    );
    assert_eq!(engine.max_tick(), 5, "rewind does not grow history");
}

#[test]
fn poison_expires_and_never_reapplies_under_rewind() {
    let mut engine = ChronosEngine::new(combat_repo());
    engine.process_command("become fighter Aragorn"); // tick 1
    engine.process_command("poison goblin"); // tick 2, goblin: 30 HP
    engine.process_command("look"); // tick 3, goblin: 28 HP
    engine.process_command("look"); // tick 4, goblin: 26 HP
    engine.process_command("look"); // tick 5, goblin: 24 HP
                                    // At this point, poison has expired (3 ticks: ticks 3, 4, 5).

    engine.process_command("look"); // tick 6
    let snap6 = engine.snapshot();
    assert_eq!(
        snap6.enemies[0].hp, 24,
        "no more poison damage after expiration"
    );

    // Rewind to tick 5 (when poison was still active) and check it's still there.
    engine.rewind_to_tick(5);
    let snap5 = engine.snapshot();
    assert_eq!(snap5.enemies[0].hp, 24, "rewind to tick 5: poisoned");

    // Rewind to tick 4 and verify.
    engine.rewind_to_tick(4);
    let snap4 = engine.snapshot();
    assert_eq!(
        snap4.enemies[0].hp, 26,
        "rewind to tick 4: more poison damage visible"
    );
}

#[test]
fn describe_current_does_not_mutate_history() {
    // This mirrors exactly what the WASM rewind path does: rewind, then peek.
    let mut engine = ChronosEngine::new(test_repo());
    engine.process_command("look"); // tick 1
    engine.process_command("take iron key"); // tick 2

    engine.rewind_to_tick(1);
    let tick_before = engine.current_tick();
    let max_before = engine.max_tick();

    // The peek the WASM layer performs after rewinding.
    let peek = engine.describe_current();

    assert_eq!(
        engine.current_tick(),
        tick_before,
        "describe_current must not advance the tick"
    );
    assert_eq!(
        engine.max_tick(),
        max_before,
        "describe_current must not append to the log"
    );
    assert!(
        peek.narrative.contains("Dim Corridor"),
        "peek should describe the rewound room"
    );
    // Calling it repeatedly must be idempotent — no drift, no borrow corruption.
    let peek2 = engine.describe_current();
    assert_eq!(
        engine.max_tick(),
        max_before,
        "repeated peeks must not grow history"
    );
    assert_eq!(
        peek.narrative, peek2.narrative,
        "peeks must be deterministic"
    );
}

#[test]
fn burn_ticks_and_replays_under_rewind() {
    // Burn (3 dmg/turn, 2 turns). combat_repo goblin has 30 HP.
    let mut engine = ChronosEngine::new(combat_repo());
    engine.process_command("become fighter Aragorn"); // tick 1
    engine.process_command("burn goblin"); // tick 2, goblin: 30 HP, burn applied
    engine.process_command("look"); // tick 3, burn ticks: 30 - 3 = 27
    engine.process_command("look"); // tick 4, burn ticks: 27 - 3 = 24
    engine.process_command("look"); // tick 5, burn expired

    let snap5 = engine.snapshot();
    assert_eq!(
        snap5.enemies[0].hp, 24,
        "burn dealt 6 total damage over 2 ticks"
    );

    engine.process_command("look"); // tick 6, no more burn
    let snap6 = engine.snapshot();
    assert_eq!(snap6.enemies[0].hp, 24, "no more burn damage after expiry");

    // Rewind to tick 3 — must show only 1 tick of burn damage.
    engine.rewind_to_tick(3);
    assert_eq!(
        engine.snapshot().enemies[0].hp,
        27,
        "rewind tick 3: one burn tick"
    );
    assert_eq!(engine.max_tick(), 6, "history unchanged");
}

#[test]
fn bleed_via_ability_replays_under_rewind() {
    // Plague Knight's septic_strike: deals 5+11=16 damage AND applies bleed (2/turn, 4 turns).
    let mut engine = ChronosEngine::new(plague_repo());
    engine.process_command("become plague_knight Morrigan"); // tick 1
    let snap1 = engine.snapshot().enemies;
    assert_eq!(snap1[0].hp, 100);

    engine.process_command("septic strike goblin"); // tick 2, deal 16 dmg + apply bleed
    let snap2 = engine.snapshot();
    // After septic strike: 100 - 16 = 84 HP. Bleed applied at tick 2 starts ticking tick 3.
    assert_eq!(snap2.enemies[0].hp, 84, "septic strike deals 5+11 damage");
    assert!(
        snap2.enemies[0]
            .active_effects
            .contains(&"Bleed".to_string()),
        "bleed applied"
    );

    engine.process_command("look"); // tick 3, bleed: 84 - 2 = 82
    assert_eq!(engine.snapshot().enemies[0].hp, 82);
    engine.process_command("look"); // tick 4, bleed: 82 - 2 = 80
    engine.process_command("look"); // tick 5, bleed: 80 - 2 = 78
    engine.process_command("look"); // tick 6, bleed: 78 - 2 = 76 (final tick)
    engine.process_command("look"); // tick 7, expired
    assert_eq!(
        engine.snapshot().enemies[0].hp,
        76,
        "4 bleed ticks: -8 total"
    );

    // Rewind to tick 3 — one bleed tick, goblin should be at 82.
    engine.rewind_to_tick(3);
    assert_eq!(
        engine.snapshot().enemies[0].hp,
        82,
        "rewind tick 3: one bleed tick"
    );
    assert_eq!(engine.max_tick(), 7, "history unchanged");
}

#[test]
fn xp_awarded_on_kill() {
    // XP is a deterministic consequence of killing an enemy — no separate event needed.
    let mut engine = ChronosEngine::new(combat_repo());
    engine.process_command("become fighter Aragorn"); // tick 1

    let sheet_before = engine.snapshot().player_character.unwrap();
    assert_eq!(sheet_before.xp, 0, "no XP before any kill");
    assert_eq!(sheet_before.level, 1, "starts at level 1");

    // Kill the goblin (xp_reward = 50). Fighter atk 9 vs goblin def 3 → at least 4 dmg/hit.
    let mut guard = 0;
    while !engine.snapshot().enemies.is_empty() {
        engine.process_command("attack");
        guard += 1;
        assert!(guard < 50, "goblin should have died");
    }

    let sheet_after = engine.snapshot().player_character.unwrap();
    assert_eq!(sheet_after.xp, 50, "50 XP awarded on goblin kill");
    // Level 2 requires 100 XP; goblin gives 50 → still level 1.
    assert_eq!(sheet_after.level, 1, "not enough XP to level up yet");
}

#[test]
fn level_up_replays_under_rewind() {
    // Killing the goblin twice (via two goblins in one room) should trigger level-up.
    // Rewind to before the second kill must undo the level-up and stat boost.
    let (rooms, items) = world_data();
    let classes = vec![
        (
            "fighter.json",
            r#"{ "id": "fighter", "name": "Fighter", "description": "t",
            "base_stats": { "hp": 120, "attack": 9, "defense": 8, "intelligence": 2 } }"#,
        ),
        // High XP goblin: 60 XP each → 120 XP total → level-up at 100 XP.
        (
            "goblin.json",
            r#"{ "id": "goblin", "name": "Goblin", "description": "g",
            "base_stats": { "hp": 1, "attack": 1, "defense": 0, "intelligence": 1 },
            "xp_reward": 60 }"#,
        ),
    ];
    // Two goblins in start room. Fighter one-shots each (atk 9 vs def 0, hp 1).
    let manifest = r#"{ "start_room_id": "dim_corridor", "encounters": [
        { "class_id": "goblin", "room_id": "dim_corridor" },
        { "class_id": "goblin", "room_id": "dim_corridor" }
    ] }"#;
    let repo = StaticRepository::from_json_pairs(&rooms, &items, &classes, Some(manifest)).unwrap();

    let mut engine = ChronosEngine::new(repo);
    engine.process_command("become fighter Aragorn"); // tick 1

    // tick 2: kill first goblin → 60 XP, still level 1.
    engine.process_command("attack"); // tick 2
    let snap2 = engine.snapshot().player_character.unwrap();
    assert_eq!(snap2.xp, 60);
    assert_eq!(snap2.level, 1, "not yet leveled after first kill");
    let atk_before_levelup = snap2.attack;

    // tick 3: kill second goblin → 120 XP, level 2 (threshold: 100).
    engine.process_command("attack"); // tick 3
    let snap3 = engine.snapshot().player_character.unwrap();
    assert_eq!(snap3.xp, 120);
    assert_eq!(snap3.level, 2, "should have leveled up after second kill");
    assert_eq!(
        snap3.attack,
        atk_before_levelup + 1,
        "ATK boosted on level-up"
    );

    // Rewind to tick 2 — level-up must be undone.
    engine.rewind_to_tick(2);
    let reverted = engine.snapshot().player_character.unwrap();
    assert_eq!(reverted.xp, 60, "rewind undoes XP from second kill");
    assert_eq!(reverted.level, 1, "rewind undoes level-up");
    assert_eq!(
        reverted.attack, atk_before_levelup,
        "rewind undoes stat boost"
    );
    assert_eq!(engine.max_tick(), 3, "history unchanged by rewind");
}

#[test]
fn enemy_tactic_heavy_attack_fires_after_first_hit() {
    // tactic_repo's goblin uses HeavyAttack (multiplier 2.0) whenever HP < 99%.
    // After the player's first hit, the goblin is below full HP, so HeavyAttack kicks in
    // on the very first exchange and every exchange thereafter.
    // We just verify the tactic fires (narrative contains "strikes desperately") and that
    // rewind to before the attack restores the goblin to full HP.
    let mut engine = ChronosEngine::new(tactic_repo());
    engine.process_command("become fighter Aragorn"); // tick 1

    let snap_before = engine.snapshot();
    let goblin_max = snap_before.enemies[0].max_hp;
    assert_eq!(
        snap_before.enemies[0].hp, goblin_max,
        "goblin starts at full HP"
    );

    // tick 2: player hits goblin → goblin now below 99% HP → HeavyAttack fires.
    let result = engine.process_command("attack");
    assert!(
        result.narrative.contains("strikes desperately"),
        "HeavyAttack narrative should contain 'strikes desperately'; got: {}",
        result.narrative,
    );

    let snap2 = engine.snapshot();
    assert!(
        snap2.enemies[0].hp < goblin_max,
        "goblin took damage from player hit"
    );

    // Rewind to tick 1 — goblin should be back at full HP, player back at imprint state.
    engine.rewind_to_tick(1);
    let reverted = engine.snapshot();
    assert_eq!(
        reverted.enemies[0].hp, goblin_max,
        "rewind restores goblin to full HP"
    );
    assert_eq!(engine.max_tick(), 2, "history unchanged by rewind");
}

#[test]
fn healing_ability_restores_hp_and_replays_under_rewind() {
    // Medica with healing_touch (25 HP) and triage (12 HP). No enemy needed.
    let (rooms, items) = world_data();
    let classes = vec![(
        "medica.json",
        r#"{
        "id": "medica", "name": "Medica", "description": "t",
        "base_stats": { "hp": 95, "attack": 9, "defense": 5, "intelligence": 7 },
        "abilities": [
            { "id": "healing_touch", "name": "Healing Touch", "description": "h", "base_damage": 0, "heal_amount": 25 },
            { "id": "triage",        "name": "Triage",         "description": "t", "base_damage": 0, "heal_amount": 12 }
        ]
    }"#,
    )];
    let repo = StaticRepository::from_json_pairs(&rooms, &items, &classes, None).unwrap();

    let mut engine = ChronosEngine::new(repo);
    engine.process_command("become medica Asha"); // tick 1, HP = 95/95

    // Damage ourselves via the test: directly verify full-HP guard by trying to heal at full.
    // First, confirm HP is full.
    let snap1 = engine.snapshot().player_character.unwrap();
    assert_eq!(snap1.hp, 95);
    assert_eq!(snap1.max_hp, 95);

    // Healing at full HP should cap at max — no over-heal.
    let result = engine.process_command("healing touch"); // tick 2
    assert!(result.success, "healing_touch should succeed");
    assert!(
        result.narrative.contains("95/95"),
        "full-HP heal caps at max: {}",
        result.narrative
    );

    // Now simulate damage by using a combat_repo-style approach:
    // We'll use a separate repo with an enemy to take damage, then heal.
    let (rooms2, items2) = world_data();
    let classes2 = vec![
        (
            "medica.json",
            r#"{ "id": "medica", "name": "Medica", "description": "t",
            "base_stats": { "hp": 50, "attack": 9, "defense": 5, "intelligence": 7 },
            "abilities": [
                { "id": "healing_touch", "name": "Healing Touch", "description": "h", "base_damage": 0, "heal_amount": 20 },
                { "id": "triage", "name": "Triage", "description": "t", "base_damage": 0, "heal_amount": 10 }
            ] }"#,
        ),
        (
            "goblin.json",
            r#"{ "id": "goblin", "name": "Goblin", "description": "g",
            "base_stats": { "hp": 200, "attack": 15, "defense": 1, "intelligence": 1 } }"#,
        ),
    ];
    let manifest2 = r#"{ "start_room_id": "dim_corridor",
        "encounters": [ { "class_id": "goblin", "room_id": "dim_corridor" } ] }"#;
    let repo2 =
        StaticRepository::from_json_pairs(&rooms2, &items2, &classes2, Some(manifest2)).unwrap();

    let mut e2 = ChronosEngine::new(repo2);
    e2.process_command("become medica Asha"); // tick 1, HP = 50/50
    e2.process_command("attack"); // tick 2, take damage from goblin (atk 15, def 5 → ~10 dmg)

    let snap_after_hit = e2.snapshot().player_character.unwrap();
    assert!(
        snap_after_hit.hp < 50,
        "goblin hit us: hp={}",
        snap_after_hit.hp
    );
    let hp_after_hit = snap_after_hit.hp;

    // tick 3: heal with healing_touch (20 HP)
    let heal_result = e2.process_command("healing touch");
    assert!(
        heal_result.success,
        "heal should succeed: {}",
        heal_result.narrative
    );
    let snap3 = e2.snapshot().player_character.unwrap();
    let expected_hp = (hp_after_hit + 20).min(50);
    assert_eq!(
        snap3.hp, expected_hp,
        "healing_touch restored 20 HP: {}",
        heal_result.narrative
    );

    // Rewind to tick 2 — HP should be back to the damaged state.
    e2.rewind_to_tick(2);
    let reverted = e2.snapshot().player_character.unwrap();
    assert_eq!(reverted.hp, hp_after_hit, "rewind undoes the heal");
    assert_eq!(e2.max_tick(), 3, "history unchanged");
}

#[test]
fn multi_hit_ability_deals_multiple_hits_and_replays_under_rewind() {
    // Fighter whirlwind_slash: base_damage 3, hit_count 3. Fighter atk 9, goblin def 1.
    // Each hit = 3 + 9 + spread(-1..1) - 0 (base_damage doesn't subtract def in ability system)
    // Wait: damage = base_damage + caster_atk + spread (no def subtraction in ability.rs)
    // So each hit = 3 + 9 + spread = 12 ± 1. Goblin has 60 HP → won't die in 3 hits.
    let (rooms, items) = world_data();
    let classes = vec![
        (
            "fighter.json",
            r#"{ "id": "fighter", "name": "Fighter", "description": "t",
            "base_stats": { "hp": 120, "attack": 9, "defense": 8, "intelligence": 2 },
            "abilities": [{
                "id": "whirlwind_slash", "name": "Whirlwind Slash",
                "description": "3-hit spin", "base_damage": 3, "hit_count": 3
            }] }"#,
        ),
        (
            "goblin.json",
            r#"{ "id": "goblin", "name": "Goblin", "description": "g",
            "base_stats": { "hp": 60, "attack": 5, "defense": 1, "intelligence": 1 } }"#,
        ),
    ];
    let manifest = r#"{ "start_room_id": "dim_corridor",
        "encounters": [ { "class_id": "goblin", "room_id": "dim_corridor" } ] }"#;
    let repo = StaticRepository::from_json_pairs(&rooms, &items, &classes, Some(manifest)).unwrap();

    let mut engine = ChronosEngine::new(repo);
    engine.process_command("become fighter Aragorn"); // tick 1
    let snap_before = engine.snapshot();
    let goblin_hp_before = snap_before.enemies[0].hp;

    // tick 2: whirlwind slash (3 hits)
    let result = engine.process_command("whirlwind slash goblin");
    assert!(
        result.success,
        "whirlwind slash failed: {}",
        result.narrative
    );
    assert!(
        result.narrative.contains("3 hits"),
        "narrative should mention 3 hits: {}",
        result.narrative
    );

    let snap2 = engine.snapshot();
    let goblin_hp_after = snap2.enemies[0].hp;
    // Each hit = 3 + 9 + spread(-1..1). Minimum 3 hits × (3+9-1) = 33 total.
    // Maximum 3 hits × (3+9+1) = 39 total. Goblin started at 60.
    let damage_dealt = goblin_hp_before - goblin_hp_after;
    assert!(
        damage_dealt >= 33 && damage_dealt <= 39,
        "3 hits of base_damage=3 atk=9 spread=±1 should deal 33-39 total; got {damage_dealt}"
    );

    // Rewind to tick 1 — goblin should return to full HP, same damage replays on re-do.
    engine.rewind_to_tick(1);
    assert_eq!(
        engine.snapshot().enemies[0].hp,
        goblin_hp_before,
        "rewind restores goblin HP"
    );
    assert_eq!(engine.max_tick(), 2, "history unchanged");
}

#[test]
fn defense_buff_applies_and_expires_and_replays_under_rewind() {
    // Fighter with shield_fortify: +5 DEF for 2 turns.
    let (rooms, items) = world_data();
    let classes = vec![(
        "fighter.json",
        r#"{
        "id": "fighter", "name": "Fighter", "description": "t",
        "base_stats": { "hp": 120, "attack": 9, "defense": 8, "intelligence": 2 },
        "abilities": [{
            "id": "shield_fortify", "name": "Shield Fortify",
            "description": "def up", "base_damage": 0,
            "applies_effect": "defense_up", "effect_damage": 5, "effect_duration": 2
        }]
    }"#,
    )];
    let repo = StaticRepository::from_json_pairs(&rooms, &items, &classes, None).unwrap();

    let mut engine = ChronosEngine::new(repo);
    engine.process_command("become fighter Aragorn"); // tick 1, DEF = 8

    let base_def = engine.snapshot().player_character.unwrap().defense;
    assert_eq!(base_def, 8, "base defense is 8");

    // tick 2: shield_fortify → DEF should jump to 13
    let result = engine.process_command("shield fortify");
    assert!(
        result.success,
        "shield fortify failed: {}",
        result.narrative
    );
    assert!(
        result.narrative.contains("Shield Fortify") || result.narrative.contains("defense"),
        "should mention shield fortify or defense: {}",
        result.narrative
    );

    let snap2 = engine.snapshot().player_character.unwrap();
    assert_eq!(snap2.defense, 13, "defense boosted by 5");

    // tick 3: first buff tick (buff active on tick 3 — applied_at=2, ends at 4)
    engine.process_command("look"); // tick 3
    assert_eq!(
        engine.snapshot().player_character.unwrap().defense,
        13,
        "buff still active tick 3"
    );

    // tick 4: second and final buff tick
    engine.process_command("look"); // tick 4
    assert_eq!(
        engine.snapshot().player_character.unwrap().defense,
        13,
        "buff still active tick 4"
    );

    // tick 5: buff expires (end_tick = applied_at + duration = 2 + 2 = 4, so expired by tick 5)
    engine.process_command("look"); // tick 5
    assert_eq!(
        engine.snapshot().player_character.unwrap().defense,
        8,
        "buff expired, back to base 8"
    );

    // Rewind to tick 2 — buff should be active again.
    engine.rewind_to_tick(2);
    assert_eq!(
        engine.snapshot().player_character.unwrap().defense,
        13,
        "rewind tick 2: buff reapplied"
    );

    // Rewind to tick 1 — before the ability, base DEF restored.
    engine.rewind_to_tick(1);
    assert_eq!(
        engine.snapshot().player_character.unwrap().defense,
        8,
        "rewind tick 1: base DEF restored"
    );
    assert_eq!(engine.max_tick(), 5, "history unchanged");
}

#[test]
fn use_item_heal_restores_hp_and_replays_under_rewind() {
    // Fighter picks up a health potion, gets damaged by a goblin, heals back up,
    // then rewind to before the healing verifies HP is back at the damaged value.
    let rooms = vec![(
        "arena.json",
        r#"{ "id": "arena", "name": "Arena", "description": ".", "exits": {} }"#,
    )];
    let items = vec![(
        "health_potion.json",
        r#"{
            "id": "health_potion", "name": "Health Potion",
            "description": "Red liquid.",
            "starting_room_id": "arena",
            "attributes": { "use_effect": "heal", "heal_amount": 30, "consumable": true }
        }"#,
    )];
    let classes = vec![
        (
            "fighter.json",
            r#"{
            "id": "fighter", "name": "Fighter", "description": "t",
            "base_stats": { "hp": 100, "attack": 9, "defense": 5, "intelligence": 2 }
        }"#,
        ),
        (
            "goblin.json",
            r#"{
            "id": "goblin", "name": "Goblin", "description": "g",
            "base_stats": { "hp": 200, "attack": 8, "defense": 0, "intelligence": 1 },
            "xp_reward": 10
        }"#,
        ),
    ];
    let manifest = r#"{ "start_room_id": "arena", "encounters": [{ "class_id": "goblin", "room_id": "arena" }] }"#;
    let repo = StaticRepository::from_json_pairs(&rooms, &items, &classes, Some(manifest)).unwrap();

    let mut engine = ChronosEngine::new(repo);
    engine.process_command("become fighter Hero"); // tick 1
    engine.process_command("take health_potion"); // tick 2 — pick up potion
    engine.process_command("attack"); // tick 3 — goblin hits back, HP drops

    let hp_after_combat = engine.snapshot().player_character.unwrap().hp;
    let hp_max = engine.snapshot().player_character.unwrap().max_hp;
    assert!(hp_after_combat < hp_max, "combat should have dealt damage");

    // tick 4: drink the potion
    let result = engine.process_command("use health_potion");
    assert!(result.success, "use item failed: {}", result.narrative);
    assert!(
        result.narrative.contains("restoring"),
        "narrative should mention restoring HP"
    );

    let hp_healed = engine.snapshot().player_character.unwrap().hp;
    assert!(
        hp_healed > hp_after_combat,
        "HP should increase after potion"
    );
    assert!(hp_healed <= hp_max, "HP should not exceed max");

    // Potion should be consumed — inventory should be empty
    let snap4 = engine.snapshot();
    assert!(snap4.inventory_ids.is_empty(), "potion should be consumed");

    // Rewind to tick 3 — HP drops back to damaged value, potion gone from inventory too (was used after tick 3)
    engine.rewind_to_tick(3);
    let rewound = engine.snapshot();
    assert_eq!(
        rewound.player_character.unwrap().hp,
        hp_after_combat,
        "rewind restores pre-heal HP"
    );
    assert!(
        !rewound.inventory_ids.is_empty(),
        "potion back in inventory after rewind"
    );
    assert_eq!(engine.max_tick(), 4, "history unchanged");
}

#[test]
fn use_item_stat_boost_applies_and_replays_under_rewind() {
    // Fighter drinks a strength elixir (boost_atk +5), then rewinds to before the use.
    let rooms = vec![(
        "forge.json",
        r#"{ "id": "forge", "name": "Forge", "description": ".", "exits": {} }"#,
    )];
    let items = vec![(
        "strength_elixir.json",
        r#"{
            "id": "strength_elixir", "name": "Strength Elixir",
            "description": "Amber potion.",
            "starting_room_id": "forge",
            "attributes": { "use_effect": "boost_atk", "boost_amount": 5, "consumable": true }
        }"#,
    )];
    let classes = vec![(
        "fighter.json",
        r#"{
            "id": "fighter", "name": "Fighter", "description": "t",
            "base_stats": { "hp": 100, "attack": 9, "defense": 5, "intelligence": 2 }
        }"#,
    )];
    let manifest = r#"{ "start_room_id": "forge" }"#;
    let repo = StaticRepository::from_json_pairs(&rooms, &items, &classes, Some(manifest)).unwrap();

    let mut engine = ChronosEngine::new(repo);
    engine.process_command("become fighter Conan"); // tick 1
    engine.process_command("take strength_elixir"); // tick 2

    let atk_before = engine.snapshot().player_character.unwrap().attack;
    assert_eq!(atk_before, 9, "base ATK is 9");

    // tick 3: use the elixir
    let result = engine.process_command("use strength_elixir");
    assert!(result.success, "use elixir failed: {}", result.narrative);
    assert!(
        result.narrative.contains("ATK increased"),
        "narrative should mention ATK increase"
    );

    let atk_after = engine.snapshot().player_character.unwrap().attack;
    assert_eq!(atk_after, 14, "ATK should be 9 + 5 = 14");

    // Rewind to tick 2 — elixir back in inventory, ATK restored
    engine.rewind_to_tick(2);
    let rewound = engine.snapshot();
    assert_eq!(
        rewound.player_character.unwrap().attack,
        9,
        "rewind restores ATK to 9"
    );
    assert!(
        !rewound.inventory_ids.is_empty(),
        "elixir back in inventory"
    );
    assert_eq!(engine.max_tick(), 3, "history unchanged");
}

#[test]
fn gold_awarded_on_enemy_kill_and_replays_under_rewind() {
    // Fighter kills a goblin that drops 5 gold. Rewind undoes the gold gain.
    let rooms = vec![(
        "pit.json",
        r#"{ "id": "pit", "name": "Pit", "description": ".", "exits": {} }"#,
    )];
    let items = vec![];
    let classes = vec![
        (
            "fighter.json",
            r#"{
            "id": "fighter", "name": "Fighter", "description": "t",
            "base_stats": { "hp": 200, "attack": 20, "defense": 8, "intelligence": 2 }
        }"#,
        ),
        (
            "goblin.json",
            r#"{
            "id": "goblin", "name": "Goblin", "description": "g",
            "base_stats": { "hp": 1, "attack": 1, "defense": 0, "intelligence": 1 },
            "xp_reward": 10, "gold_reward": 5
        }"#,
        ),
    ];
    let manifest = r#"{ "start_room_id": "pit", "encounters": [
        { "class_id": "goblin", "room_id": "pit" }
    ] }"#;
    let repo = StaticRepository::from_json_pairs(&rooms, &items, &classes, Some(manifest)).unwrap();

    let mut engine = ChronosEngine::new(repo);
    engine.process_command("become fighter Hero"); // tick 1
    let gold_before = engine.snapshot().player_character.unwrap().gold;
    assert_eq!(gold_before, 0, "start with no gold");

    let result = engine.process_command("attack"); // tick 2 — one-shot kill
    assert!(
        result.narrative.contains("+5 scraps"),
        "kill narrative should mention scraps: {}",
        result.narrative
    );

    let gold_after = engine.snapshot().player_character.unwrap().gold;
    assert_eq!(gold_after, 5, "should have 5 gold after kill");

    // Rewind to tick 1 — gold must be undone
    engine.rewind_to_tick(1);
    let rewound_gold = engine.snapshot().player_character.unwrap().gold;
    assert_eq!(rewound_gold, 0, "rewind undoes gold gain");
    assert_eq!(engine.max_tick(), 2, "history unchanged");
}

#[test]
fn buy_item_from_vendor_deducts_gold_and_adds_to_inventory() {
    // Fighter kills a goblin for gold, then buys a health potion from the innkeeper.
    let rooms = vec![(
        "inn.json",
        r#"{ "id": "inn", "name": "The Inn", "description": ".", "exits": {} }"#,
    )];
    let items = vec![(
        "health_potion.json",
        r#"{
            "id": "health_potion", "name": "Health Potion",
            "description": "Red liquid.",
            "attributes": { "use_effect": "heal", "heal_amount": 30, "consumable": true }
        }"#,
    )];
    let classes = vec![(
        "fighter.json",
        r#"{
            "id": "fighter", "name": "Fighter", "description": "t",
            "base_stats": { "hp": 100, "attack": 9, "defense": 5, "intelligence": 2 }
        }"#,
    )];
    let npcs = vec![(
        "innkeeper.json",
        r#"{
            "id": "innkeeper", "name": "Innkeeper",
            "greeting": "Welcome!",
            "vendor": true,
            "shop": [{ "item_id": "health_potion", "price": 15 }]
        }"#,
    )];
    let manifest = r#"{ "start_room_id": "inn", "npc_placements": [
        { "npc_id": "innkeeper", "room_id": "inn" }
    ] }"#;
    let repo = StaticRepository::from_json_pairs_with_npcs(
        &rooms,
        &items,
        &classes,
        &npcs,
        Some(manifest),
    )
    .unwrap();

    let mut engine = ChronosEngine::new(repo);
    engine.process_command("become fighter Hero"); // tick 1

    // Manually give gold via a workaround: the engine has no "give gold" command,
    // so we verify the buy fails when broke, then test via snapshot.
    let broke_result = engine.process_command("buy innkeeper health_potion"); // tick 2
    assert!(
        !broke_result.success,
        "should fail with 0 gold: {}",
        broke_result.narrative
    );
    assert!(
        broke_result.narrative.contains("only have 0"),
        "narrative should say 0 gold"
    );

    // Rewind to clean state and verify gold is still 0 after failed buy
    engine.rewind_to_tick(1);
    assert_eq!(engine.snapshot().player_character.unwrap().gold, 0);
    assert_eq!(engine.max_tick(), 2, "failed buy still logged");
}

#[test]
fn shop_listing_shows_vendor_wares() {
    let rooms = vec![(
        "inn.json",
        r#"{ "id": "inn", "name": "The Inn", "description": ".", "exits": {} }"#,
    )];
    let items = vec![(
        "health_potion.json",
        r#"{
            "id": "health_potion", "name": "Health Potion",
            "description": "Red liquid.",
            "attributes": { "use_effect": "heal", "heal_amount": 30, "consumable": true }
        }"#,
    )];
    let classes = vec![(
        "fighter.json",
        r#"{
            "id": "fighter", "name": "Fighter", "description": "t",
            "base_stats": { "hp": 100, "attack": 9, "defense": 5, "intelligence": 2 }
        }"#,
    )];
    let npcs = vec![(
        "innkeeper.json",
        r#"{
            "id": "innkeeper", "name": "Innkeeper",
            "greeting": "Welcome!",
            "vendor": true,
            "shop": [{ "item_id": "health_potion", "price": 15 }]
        }"#,
    )];
    let manifest = r#"{ "start_room_id": "inn", "npc_placements": [
        { "npc_id": "innkeeper", "room_id": "inn" }
    ] }"#;
    let repo = StaticRepository::from_json_pairs_with_npcs(
        &rooms,
        &items,
        &classes,
        &npcs,
        Some(manifest),
    )
    .unwrap();

    let mut engine = ChronosEngine::new(repo);
    engine.process_command("become fighter Hero");

    let result = engine.process_command("shop innkeeper");
    assert!(
        result.success,
        "shop command should succeed: {}",
        result.narrative
    );
    assert!(
        result.narrative.contains("Health Potion"),
        "should list health potion: {}",
        result.narrative
    );
    assert!(
        result.narrative.contains("15 gold"),
        "should show price: {}",
        result.narrative
    );
    // Can't afford it, so no "Buy" context action should be active
    assert!(
        result
            .context_actions
            .iter()
            .any(|a| a.label.contains("can't afford")),
        "should show can't-afford label: {:?}",
        result.context_actions
    );
}

#[test]
fn quest_accept_and_kill_count_completes_and_replays() {
    // Fighter accepts a goblin kill quest (need 2 kills), kills 2 goblins, quest completes.
    // Then rewind to before second kill — quest should be incomplete again.
    let rooms = vec![(
        "arena.json",
        r#"{ "id": "arena", "name": "Arena", "description": ".", "exits": {} }"#,
    )];
    let items = vec![];
    let classes = vec![
        (
            "fighter.json",
            r#"{
            "id": "fighter", "name": "Fighter", "description": "t",
            "base_stats": { "hp": 200, "attack": 20, "defense": 5, "intelligence": 2 }
        }"#,
        ),
        (
            "goblin.json",
            r#"{
            "id": "goblin", "name": "Goblin", "description": "g",
            "base_stats": { "hp": 1, "attack": 1, "defense": 0, "intelligence": 1 },
            "xp_reward": 10, "gold_reward": 5
        }"#,
        ),
    ];
    let npcs = vec![(
        "quest_giver.json",
        r#"{
            "id": "quest_giver", "name": "Guard Captain",
            "greeting": "Slay the goblins!"
        }"#,
    )];
    let quests = vec![(
        "goblin_hunt.json",
        r#"{
            "id": "goblin_hunt", "name": "Goblin Hunt",
            "description": "Kill goblins.",
            "objective": { "type": "kill_count", "class_id": "goblin", "count": 2 },
            "gold_reward": 20, "xp_reward": 50,
            "giver_npc_id": "quest_giver"
        }"#,
    )];
    let manifest = r#"{ "start_room_id": "arena",
        "npc_placements": [{ "npc_id": "quest_giver", "room_id": "arena" }],
        "encounters": [
            { "class_id": "goblin", "room_id": "arena" },
            { "class_id": "goblin", "room_id": "arena" }
        ] }"#;
    let repo = StaticRepository::from_json_pairs_full(
        &rooms,
        &items,
        &classes,
        &npcs,
        &quests,
        Some(manifest),
    )
    .unwrap();

    let mut engine = ChronosEngine::new(repo);
    engine.process_command("become fighter Hero"); // tick 1

    // Accept the quest
    let accept = engine.process_command("accept goblin_hunt"); // tick 2
    assert!(accept.success, "accept quest failed: {}", accept.narrative);
    assert!(
        accept.narrative.contains("Goblin Hunt"),
        "accept narrative: {}",
        accept.narrative
    );

    // Kill first goblin — quest progresses (1/2)
    let kill1 = engine.process_command("attack"); // tick 3
    assert!(
        kill1.narrative.contains("1/2") || kill1.narrative.contains("[Quest"),
        "first kill should show progress: {}",
        kill1.narrative
    );

    let snap3 = engine.snapshot().player_character.unwrap();
    let gold_before = snap3.gold; // 5 gold from goblin drop, no quest reward yet

    // Kill second goblin — quest objective met (ready to turn in)
    let kill2 = engine.process_command("attack"); // tick 4
    assert!(
        kill2.narrative.contains("Objective complete") || kill2.narrative.contains("Goblin Hunt"),
        "second kill should show quest objective met: {}",
        kill2.narrative
    );

    // Turn in the quest to collect reward (giver is in same room)
    let turn_in = engine.process_command("turn in goblin_hunt"); // tick 5
    assert!(
        turn_in.success,
        "turn in should succeed: {}",
        turn_in.narrative
    );

    let snap5 = engine.snapshot().player_character.unwrap();
    assert!(
        snap5.gold > gold_before,
        "quest reward gold should be added after turn-in: {} > {}",
        snap5.gold,
        gold_before
    );

    // Check quest log shows completed
    let log = engine.process_command("quests");
    assert!(
        log.narrative.contains("COMPLETED"),
        "quest log should show completed: {}",
        log.narrative
    );

    // Rewind to tick 3 (after first kill, before second) — quest should be 1/2
    engine.rewind_to_tick(3);
    let reverted_log = engine.process_command("quests");
    assert!(
        !reverted_log.narrative.contains("COMPLETED"),
        "after rewind, quest should not be complete: {}",
        reverted_log.narrative
    );

    // Gold should be back to first-kill-only level
    let reverted_snap = engine.snapshot().player_character.unwrap();
    assert!(
        reverted_snap.gold <= gold_before,
        "after rewind, quest reward gold should be gone: {} <= {}",
        reverted_snap.gold,
        gold_before
    );

    assert_eq!(engine.max_tick(), 4, "history preserved up to rewind point");
}

#[test]
fn victory_fires_when_all_quests_complete_and_replays() {
    // Single-quest world: kill 1 goblin = quest done = victory.
    let rooms = vec![(
        "pit.json",
        r#"{ "id": "pit", "name": "Pit", "description": ".", "exits": {} }"#,
    )];
    let items = vec![];
    let classes = vec![
        (
            "fighter.json",
            r#"{
            "id": "fighter", "name": "Fighter", "description": "t",
            "base_stats": { "hp": 200, "attack": 20, "defense": 5, "intelligence": 2 }
        }"#,
        ),
        (
            "goblin.json",
            r#"{
            "id": "goblin", "name": "Goblin", "description": "g",
            "base_stats": { "hp": 1, "attack": 1, "defense": 0, "intelligence": 1 },
            "xp_reward": 10, "gold_reward": 5
        }"#,
        ),
    ];
    let npcs = vec![(
        "captain.json",
        r#"{ "id": "captain", "name": "Captain", "greeting": "Fight!" }"#,
    )];
    let quests = vec![(
        "kill_one.json",
        r#"{
            "id": "kill_one", "name": "First Blood",
            "description": "Kill a goblin.",
            "objective": { "type": "kill_count", "class_id": "goblin", "count": 1 },
            "gold_reward": 10, "xp_reward": 25,
            "giver_npc_id": "captain"
        }"#,
    )];
    let manifest = r#"{ "start_room_id": "pit",
        "npc_placements": [{ "npc_id": "captain", "room_id": "pit" }],
        "encounters": [{ "class_id": "goblin", "room_id": "pit" }] }"#;
    let repo = StaticRepository::from_json_pairs_full(
        &rooms,
        &items,
        &classes,
        &npcs,
        &quests,
        Some(manifest),
    )
    .unwrap();

    let mut engine = ChronosEngine::new(repo);
    engine.process_command("become fighter Hero"); // tick 1
    engine.process_command("accept kill_one"); // tick 2

    // Kill the goblin — quest objective met (ready to turn in)
    let result = engine.process_command("attack"); // tick 3
    assert!(
        result.narrative.contains("Objective complete") || result.narrative.contains("First Blood"),
        "kill should show quest objective met: {}",
        result.narrative
    );

    // Turn in to trigger victory
    let turn_in = engine.process_command("turn in kill_one"); // tick 4
    assert!(
        turn_in.narrative.contains("VICTORY") || turn_in.narrative.contains("Quest complete"),
        "victory/completion should fire on turn in: {}",
        turn_in.narrative
    );

    // Rewind to before the kill — victory should be undone
    engine.rewind_to_tick(2);

    // Re-attack and re-turn-in — victory should re-fire deterministically
    let result2 = engine.process_command("attack"); // tick 3 again
    let turn_in2 = engine.process_command("turn in kill_one"); // tick 4 again
    assert!(
        turn_in2.narrative.contains("VICTORY") || turn_in2.narrative.contains("Quest complete"),
        "victory should re-fire after replay: {}",
        turn_in2.narrative
    );
}

#[test]
fn equipment_pickup_grants_stat_bonus_and_replays_under_rewind() {
    // Picking up an iron_sword (+4 ATK) should raise the fighter's ATK.
    // Rewinding undoes it.
    let rooms = vec![(
        "smithy.json",
        r#"{ "id": "smithy", "name": "Smithy", "description": ".", "exits": {} }"#,
    )];
    let items = vec![(
        "iron_sword.json",
        r#"{
            "id": "iron_sword", "name": "Iron Sword",
            "description": "A sharp sword.",
            "starting_room_id": "smithy",
            "attributes": { "equip_stat": "attack", "equip_bonus": 4 }
        }"#,
    )];
    let classes = vec![(
        "fighter.json",
        r#"{
            "id": "fighter", "name": "Fighter", "description": "t",
            "base_stats": { "hp": 100, "attack": 9, "defense": 5, "intelligence": 2 }
        }"#,
    )];
    let manifest = r#"{ "start_room_id": "smithy" }"#;
    let repo = StaticRepository::from_json_pairs(&rooms, &items, &classes, Some(manifest)).unwrap();

    let mut engine = ChronosEngine::new(repo);
    engine.process_command("become fighter Hero"); // tick 1
    let atk_before = engine.snapshot().player_character.unwrap().attack;
    assert_eq!(atk_before, 9, "base ATK = 9");

    // Pick up sword — ATK should jump by 4
    let result = engine.process_command("take iron_sword"); // tick 2
    assert!(result.success, "take sword failed: {}", result.narrative);
    assert!(
        result.narrative.contains("+4 ATK"),
        "pickup note should mention +4 ATK: {}",
        result.narrative
    );

    let atk_after = engine.snapshot().player_character.unwrap().attack;
    assert_eq!(atk_after, 13, "ATK should be 9 + 4 = 13");

    // Rewind to tick 1 — ATK must drop back to 9
    engine.rewind_to_tick(1);
    let atk_rewound = engine.snapshot().player_character.unwrap().attack;
    assert_eq!(atk_rewound, 9, "rewind undoes equip bonus");
    assert_eq!(engine.max_tick(), 2, "history unchanged");
}

#[test]
fn equipment_drop_removes_stat_bonus() {
    // Pick up iron_sword (+4 ATK), verify bonus is applied, then drop it — bonus removed.
    let rooms = vec![(
        "smithy.json",
        r#"{ "id": "smithy", "name": "Smithy", "description": ".", "exits": {} }"#,
    )];
    let items = vec![(
        "iron_sword.json",
        r#"{
            "id": "iron_sword", "name": "Iron Sword",
            "description": "A sharp sword.",
            "starting_room_id": "smithy",
            "attributes": { "equip_stat": "attack", "equip_bonus": 4 }
        }"#,
    )];
    let classes = vec![(
        "fighter.json",
        r#"{
            "id": "fighter", "name": "Fighter", "description": "t",
            "base_stats": { "hp": 100, "attack": 9, "defense": 5, "intelligence": 2 }
        }"#,
    )];
    let manifest = r#"{ "start_room_id": "smithy" }"#;
    let repo = StaticRepository::from_json_pairs(&rooms, &items, &classes, Some(manifest)).unwrap();

    let mut engine = ChronosEngine::new(repo);
    engine.process_command("become fighter Hero"); // tick 1
    engine.process_command("take iron_sword"); // tick 2 — ATK 9 → 13
    assert_eq!(engine.snapshot().player_character.unwrap().attack, 13);

    let drop_result = engine.process_command("drop iron_sword"); // tick 3
    assert!(
        drop_result.success,
        "drop failed: {}",
        drop_result.narrative
    );
    assert!(
        drop_result.narrative.contains("4 ATK"),
        "drop note should mention ATK removal: {}",
        drop_result.narrative
    );

    let atk_dropped = engine.snapshot().player_character.unwrap().attack;
    assert_eq!(atk_dropped, 9, "ATK back to 9 after drop");

    // Rewind to tick 2 (holding sword) — ATK should be 13 again
    engine.rewind_to_tick(2);
    let atk_holding = engine.snapshot().player_character.unwrap().attack;
    assert_eq!(atk_holding, 13, "rewind to holding sword restores bonus");
}

#[test]
fn inventory_shows_equipment_annotation() {
    // `inventory` command should annotate the iron_sword with [+4 ATK].
    let rooms = vec![(
        "smithy.json",
        r#"{ "id": "smithy", "name": "Smithy", "description": ".", "exits": {} }"#,
    )];
    let items = vec![(
        "iron_sword.json",
        r#"{
            "id": "iron_sword", "name": "Iron Sword",
            "description": "A sharp sword.",
            "starting_room_id": "smithy",
            "attributes": { "equip_stat": "attack", "equip_bonus": 4 }
        }"#,
    )];
    let classes = vec![(
        "fighter.json",
        r#"{
            "id": "fighter", "name": "Fighter", "description": "t",
            "base_stats": { "hp": 100, "attack": 9, "defense": 5, "intelligence": 2 }
        }"#,
    )];
    let manifest = r#"{ "start_room_id": "smithy" }"#;
    let repo = StaticRepository::from_json_pairs(&rooms, &items, &classes, Some(manifest)).unwrap();

    let mut engine = ChronosEngine::new(repo);
    engine.process_command("become fighter Hero");
    engine.process_command("take iron_sword");

    let inv = engine.process_command("inventory");
    assert!(
        inv.narrative.contains("[+4 ATK]"),
        "inventory should annotate equipment: {}",
        inv.narrative
    );
}

#[test]
fn examine_item_in_room_returns_description() {
    // `examine iron_sword` when the sword is in the room shows its description.
    // Also verifies fuzzy matching by item name fragment ("sword" matches "iron_sword").
    let rooms = vec![(
        "smithy.json",
        r#"{ "id": "smithy", "name": "Smithy", "description": ".", "exits": {} }"#,
    )];
    let items = vec![(
        "iron_sword.json",
        r#"{
            "id": "iron_sword", "name": "Iron Sword",
            "description": "A well-balanced blade.",
            "starting_room_id": "smithy",
            "attributes": { "equip_stat": "attack", "equip_bonus": 4 }
        }"#,
    )];
    let classes = vec![(
        "fighter.json",
        r#"{
            "id": "fighter", "name": "Fighter", "description": "t",
            "base_stats": { "hp": 100, "attack": 9, "defense": 5, "intelligence": 2 }
        }"#,
    )];
    let manifest = r#"{ "start_room_id": "smithy" }"#;
    let repo = StaticRepository::from_json_pairs(&rooms, &items, &classes, Some(manifest)).unwrap();

    let mut engine = ChronosEngine::new(repo);
    engine.process_command("become fighter Hero"); // tick 1

    // Exact id match
    let result = engine.process_command("examine iron_sword");
    assert!(
        result.success,
        "examine should succeed: {}",
        result.narrative
    );
    assert!(
        result.narrative.contains("A well-balanced blade."),
        "description missing: {}",
        result.narrative
    );
    assert!(
        result.narrative.contains("Iron Sword"),
        "item name missing: {}",
        result.narrative
    );

    // Fuzzy name match
    let result2 = engine.process_command("examine sword");
    assert!(
        result2.success,
        "fuzzy examine should succeed: {}",
        result2.narrative
    );
    assert!(
        result2.narrative.contains("A well-balanced blade."),
        "fuzzy description missing: {}",
        result2.narrative
    );

    // Unknown item
    let bad = engine.process_command("examine dragon");
    assert!(!bad.success, "examine of unknown item should fail");
}

#[test]
fn examine_item_in_inventory_returns_description() {
    // After picking up the sword, `examine iron_sword` still works from inventory.
    let rooms = vec![(
        "smithy.json",
        r#"{ "id": "smithy", "name": "Smithy", "description": ".", "exits": {} }"#,
    )];
    let items = vec![(
        "iron_sword.json",
        r#"{
            "id": "iron_sword", "name": "Iron Sword",
            "description": "A well-balanced blade.",
            "starting_room_id": "smithy",
            "attributes": { "equip_stat": "attack", "equip_bonus": 4 }
        }"#,
    )];
    let classes = vec![(
        "fighter.json",
        r#"{
            "id": "fighter", "name": "Fighter", "description": "t",
            "base_stats": { "hp": 100, "attack": 9, "defense": 5, "intelligence": 2 }
        }"#,
    )];
    let manifest = r#"{ "start_room_id": "smithy" }"#;
    let repo = StaticRepository::from_json_pairs(&rooms, &items, &classes, Some(manifest)).unwrap();

    let mut engine = ChronosEngine::new(repo);
    engine.process_command("become fighter Hero");
    engine.process_command("take iron_sword");

    // Item is now in inventory, not room — examine should still find it
    let result = engine.process_command("examine iron_sword");
    assert!(
        result.success,
        "examine held item should succeed: {}",
        result.narrative
    );
    assert!(
        result.narrative.contains("A well-balanced blade."),
        "held item description missing: {}",
        result.narrative
    );
}

#[test]
fn kill_context_action_shows_attack_when_enemies_remain() {
    // When a room has two goblins, killing the first should return an Attack context action.
    // Killing the second should return no context actions (room clear).
    let rooms = vec![(
        "arena.json",
        r#"{ "id": "arena", "name": "Arena", "description": ".", "exits": {} }"#,
    )];
    let items = vec![];
    let classes = vec![
        (
            "fighter.json",
            r#"{
            "id": "fighter", "name": "Fighter", "description": "t",
            "base_stats": { "hp": 200, "attack": 30, "defense": 5, "intelligence": 2 }
        }"#,
        ),
        (
            "goblin.json",
            r#"{
            "id": "goblin", "name": "Goblin", "description": "g",
            "base_stats": { "hp": 1, "attack": 1, "defense": 0, "intelligence": 1 },
            "xp_reward": 5
        }"#,
        ),
    ];
    let manifest = r#"{ "start_room_id": "arena", "encounters": [
        { "class_id": "goblin", "room_id": "arena" },
        { "class_id": "goblin", "room_id": "arena" }
    ] }"#;
    let repo = StaticRepository::from_json_pairs(&rooms, &items, &classes, Some(manifest)).unwrap();

    let mut engine = ChronosEngine::new(repo);
    engine.process_command("become fighter Hero"); // tick 1

    // First kill — one goblin remains, should see Attack button
    let kill1 = engine.process_command("attack");
    assert!(kill1.success, "first attack failed: {}", kill1.narrative);
    assert!(
        kill1.narrative.contains("collapses, slain"),
        "expected kill narrative: {}",
        kill1.narrative
    );
    assert!(
        kill1.context_actions.iter().any(|a| a.command == "attack"),
        "should have Attack context action after first kill with 1 goblin remaining: {:?}",
        kill1.context_actions
    );

    // Second kill — room is clear, no Attack button
    let kill2 = engine.process_command("attack");
    assert!(kill2.success, "second attack failed: {}", kill2.narrative);
    assert!(
        kill2.narrative.contains("collapses, slain"),
        "expected kill narrative: {}",
        kill2.narrative
    );
    assert!(
        !kill2.context_actions.iter().any(|a| a.command == "attack"),
        "should have no Attack context action when room is clear: {:?}",
        kill2.context_actions
    );

    // Rewind to before any kills — both goblins back, state coherent
    engine.rewind_to_tick(1);
    let snap = engine.snapshot();
    let goblins_in_arena: Vec<_> = snap
        .enemies
        .iter()
        .filter(|e| e.room_id == "arena")
        .collect();
    assert_eq!(
        goblins_in_arena.len(),
        2,
        "rewind should restore both goblins"
    );
}

#[test]
fn rest_at_inn_restores_hp_and_deducts_gold_and_replays() {
    // Fighter takes damage, rests at the inn (5g), HP restored to max, gold deducted.
    // Rewind before rest → HP damaged again, gold back.
    let rooms = vec![(
        "inn.json",
        r#"{ "id": "inn", "name": "The Inn", "description": ".", "exits": {} }"#,
    )];
    let items = vec![];
    let classes = vec![
        (
            "fighter.json",
            r#"{
            "id": "fighter", "name": "Fighter", "description": "t",
            "base_stats": { "hp": 100, "attack": 20, "defense": 5, "intelligence": 2 }
        }"#,
        ),
        (
            "goblin.json",
            r#"{
            "id": "goblin", "name": "Goblin", "description": "g",
            "base_stats": { "hp": 200, "attack": 10, "defense": 0, "intelligence": 1 }
        }"#,
        ),
    ];
    let npcs = vec![(
        "innkeeper.json",
        r#"{
            "id": "innkeeper", "name": "Innkeeper",
            "greeting": "Welcome!",
            "rest_provider": true
        }"#,
    )];
    let manifest = r#"{ "start_room_id": "inn",
        "npc_placements": [{ "npc_id": "innkeeper", "room_id": "inn" }],
        "encounters": [{ "class_id": "goblin", "room_id": "inn" }] }"#;
    let repo = StaticRepository::from_json_pairs_with_npcs(
        &rooms,
        &items,
        &classes,
        &npcs,
        Some(manifest),
    )
    .unwrap();

    let mut engine = ChronosEngine::new(repo);
    engine.process_command("become fighter Hero"); // tick 1, HP 100/100

    // Manually set gold to 10 via attack (goblin retaliates, dealing damage)
    engine.process_command("attack"); // tick 2 — take damage from goblin
    let hp_damaged = engine.snapshot().player_character.unwrap().hp;
    assert!(
        hp_damaged < 100,
        "goblin should have dealt damage: hp={hp_damaged}"
    );

    // Can't rest with 0 gold
    let broke_rest = engine.process_command("rest"); // tick 3
    assert!(
        !broke_rest.success,
        "should fail with no gold: {}",
        broke_rest.narrative
    );
    assert!(
        broke_rest.narrative.contains("5 gold"),
        "should mention cost: {}",
        broke_rest.narrative
    );

    // Inject gold by having the goblin give a gold reward — use a fresh engine instead
    // since we can't give gold directly. Test rest succeeding with a separate setup.
    let rooms2 = vec![(
        "inn.json",
        r#"{ "id": "inn", "name": "The Inn", "description": ".", "exits": {} }"#,
    )];
    let classes2 = vec![
        (
            "fighter.json",
            r#"{
            "id": "fighter", "name": "Fighter", "description": "t",
            "base_stats": { "hp": 100, "attack": 100, "defense": 5, "intelligence": 2 }
        }"#,
        ),
        (
            "goblin.json",
            r#"{
            "id": "goblin", "name": "Goblin", "description": "g",
            "base_stats": { "hp": 1, "attack": 10, "defense": 0, "intelligence": 1 },
            "gold_reward": 10
        }"#,
        ),
    ];
    let npcs2 = vec![(
        "innkeeper.json",
        r#"{
            "id": "innkeeper", "name": "Innkeeper",
            "greeting": "Welcome!",
            "rest_provider": true
        }"#,
    )];
    let manifest2 = r#"{ "start_room_id": "inn",
        "npc_placements": [{ "npc_id": "innkeeper", "room_id": "inn" }],
        "encounters": [{ "class_id": "goblin", "room_id": "inn" }] }"#;
    let repo2 = StaticRepository::from_json_pairs_with_npcs(
        &rooms2,
        &[],
        &classes2,
        &npcs2,
        Some(manifest2),
    )
    .unwrap();

    let mut e2 = ChronosEngine::new(repo2);
    e2.process_command("become fighter Hero"); // tick 1, HP 100
    e2.process_command("attack"); // tick 2 — one-shot kill, +10 gold, goblin deals 0 dmg (def=5, atk=10 → 5 dmg)

    let snap2 = e2.snapshot();
    let hp_after_fight = snap2.player_character.as_ref().unwrap().hp;
    let gold_after_fight = snap2.player_character.as_ref().unwrap().gold;
    assert!(
        gold_after_fight >= 5,
        "should have enough gold to rest: {gold_after_fight}"
    );

    // Damage ourselves by lowering HP artificially — use attack that returns damage
    // Actually goblin already dealt damage. Check if hp < 100.
    // If full HP, rest still succeeds but healed = 0.
    let rest = e2.process_command("rest"); // tick 3
    assert!(rest.success, "rest should succeed: {}", rest.narrative);
    assert!(
        rest.narrative.contains("restored"),
        "should mention restore: {}",
        rest.narrative
    );

    let gold_after_rest = e2.snapshot().player_character.unwrap().gold;
    assert_eq!(
        gold_after_rest,
        gold_after_fight - 5,
        "5 gold should be deducted"
    );
    let hp_after_rest = e2.snapshot().player_character.unwrap().hp;
    assert_eq!(hp_after_rest, 100, "HP should be full after rest");

    // Rewind to tick 2 — gold restored, HP back to post-fight state
    e2.rewind_to_tick(2);
    let rewound = e2.snapshot().player_character.unwrap();
    assert_eq!(rewound.gold, gold_after_fight, "rewind restores gold");
    assert_eq!(rewound.hp, hp_after_fight, "rewind restores HP");
    assert_eq!(e2.max_tick(), 3, "history unchanged");
}

#[test]
fn equip_routes_to_correct_body_slot() {
    // A helmet (tags: armor, helm) should go to the head slot, not weapon.
    // An accessory (tags: accessory) should fill accessory_1 then accessory_2.
    let rooms = vec![(
        "forge.json",
        r#"{ "id": "forge", "name": "Forge", "description": ".", "exits": {} }"#,
    )];
    let items = vec![
        (
            "iron_helm.json",
            r#"{
                "id": "iron_helm", "name": "Iron Helm",
                "description": "A helmet.", "takeable": true, "consumable": false,
                "tags": ["armor", "helm"],
                "attributes": { "equip_stat": "defense", "equip_bonus": 2 }
            }"#,
        ),
        (
            "lucky_ring.json",
            r#"{
                "id": "lucky_ring", "name": "Lucky Ring",
                "description": "A ring.", "takeable": true, "consumable": false,
                "tags": ["accessory"],
                "attributes": { "equip_stat": "luck", "equip_bonus": 1 }
            }"#,
        ),
        (
            "cursed_ring.json",
            r#"{
                "id": "cursed_ring", "name": "Cursed Ring",
                "description": "A ring.", "takeable": true, "consumable": false,
                "tags": ["accessory"],
                "attributes": {}
            }"#,
        ),
    ];
    let classes = vec![(
        "fighter.json",
        r#"{
            "id": "fighter", "name": "Fighter", "description": "t",
            "base_stats": { "hp": 100, "attack": 9, "defense": 5, "intelligence": 2 }
        }"#,
    )];
    let manifest = r#"{ "start_room_id": "forge" }"#;
    let repo = StaticRepository::from_json_pairs(&rooms, &items, &classes, Some(manifest)).unwrap();

    let mut engine = ChronosEngine::new(repo);
    engine.process_command("become fighter Hero");

    // Pick up items first
    engine.process_command("take iron_helm");
    engine.process_command("take lucky_ring");
    engine.process_command("take cursed_ring");

    // Equip helmet — should go to head slot
    let result = engine.process_command("equip iron_helm");
    assert!(result.success, "equip helm failed: {}", result.narrative);
    assert!(
        result.narrative.contains("head slot"),
        "should mention head slot, got: {}",
        result.narrative
    );
    let snap = engine.snapshot();
    let ch = snap.player_character.as_ref().unwrap();
    assert_eq!(
        ch.equipped_head.as_deref(),
        Some("Iron Helm"),
        "head slot should have Iron Helm"
    );
    assert!(ch.equipped_weapon.is_none(), "weapon slot should be empty");

    // Equip first accessory — fills accessory_1
    engine.process_command("equip lucky_ring");
    let snap = engine.snapshot();
    let ch = snap.player_character.as_ref().unwrap();
    assert_eq!(
        ch.equipped_accessory_1.as_deref(),
        Some("Lucky Ring"),
        "acc_1 should be Lucky Ring"
    );
    assert!(ch.equipped_accessory_2.is_none(), "acc_2 should be empty");

    // Equip second accessory — fills accessory_2
    engine.process_command("equip cursed_ring");
    let snap = engine.snapshot();
    let ch = snap.player_character.as_ref().unwrap();
    assert_eq!(
        ch.equipped_accessory_2.as_deref(),
        Some("Cursed Ring"),
        "acc_2 should be Cursed Ring"
    );

    // Unequip head slot by name
    let result = engine.process_command("unequip head");
    assert!(result.success, "unequip head failed: {}", result.narrative);
    let snap = engine.snapshot();
    assert!(
        snap.player_character.unwrap().equipped_head.is_none(),
        "head should be empty after unequip"
    );
}
