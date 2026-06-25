//! Integration tests for fleeing combat: escaping through a passable exit, the
//! failure cases (nothing to flee from / cornered), and replay safety.

use chronos_core::{data::repository::StaticRepository, ChronosEngine};

const FIGHTER: (&str, &str) = (
    "fighter.json",
    r#"{ "id": "fighter", "name": "Fighter", "description": "t",
        "base_stats": { "hp": 100, "attack": 10, "defense": 5 } }"#,
);
const GOBLIN: (&str, &str) = (
    "goblin.json",
    r#"{ "id": "goblin", "name": "Goblin", "description": "t",
        "base_stats": { "hp": 100, "attack": 5, "defense": 0 }, "xp_reward": 0 }"#,
);

/// Two connected rooms with a goblin in the start room.
fn two_room_repo() -> StaticRepository {
    let rooms = vec![
        (
            "arena.json",
            r#"{ "id": "arena", "name": "Arena", "description": "A pit.",
                "exits": { "east": { "target_room_id": "safe_room" } } }"#,
        ),
        (
            "safe_room.json",
            r#"{ "id": "safe_room", "name": "Safe Room", "description": "Quiet.",
                "exits": { "west": { "target_room_id": "arena" } } }"#,
        ),
    ];
    let manifest = r#"{ "start_room_id": "arena",
        "encounters": [ { "class_id": "goblin", "room_id": "arena" } ] }"#;
    StaticRepository::from_json_pairs(&rooms, &[], &[FIGHTER, GOBLIN], Some(manifest)).unwrap()
}

/// One room, a goblin, and no exits — the cornered case.
fn dead_end_repo() -> StaticRepository {
    let rooms = vec![(
        "cell.json",
        r#"{ "id": "cell", "name": "Cell", "description": "Walls.", "exits": {} }"#,
    )];
    let manifest = r#"{ "start_room_id": "cell",
        "encounters": [ { "class_id": "goblin", "room_id": "cell" } ] }"#;
    StaticRepository::from_json_pairs(&rooms, &[], &[FIGHTER, GOBLIN], Some(manifest)).unwrap()
}

#[test]
fn flee_escapes_to_an_adjacent_room_and_enemy_stays() {
    let mut engine = ChronosEngine::new(two_room_repo());
    engine.process_command("become fighter"); // tick 1
    let result = engine.process_command("flee"); // tick 2

    assert!(result.success, "flee should succeed: {}", result.narrative);
    assert!(result.narrative.to_lowercase().contains("flee"));

    let snap = engine.snapshot();
    assert_eq!(snap.player_room_id, "safe_room", "player escaped east");
    // The goblin is unharmed and still in the arena — fleeing buys distance only.
    assert_eq!(snap.enemies.len(), 1);
    assert_eq!(snap.enemies[0].room_id, "arena");
    assert_eq!(snap.enemies[0].hp, 100);
}

#[test]
fn flee_with_no_enemy_is_rejected() {
    let mut engine = ChronosEngine::new(two_room_repo());
    engine.process_command("become fighter"); // tick 1
    engine.process_command("go east"); // tick 2: move to the empty safe_room
    let result = engine.process_command("flee"); // tick 3: nothing to flee from

    assert!(!result.success);
    assert!(result.narrative.contains("nothing here to flee from"));
    // Player did not move.
    assert_eq!(engine.snapshot().player_room_id, "safe_room");
}

#[test]
fn flee_when_cornered_is_rejected() {
    let mut engine = ChronosEngine::new(dead_end_repo());
    engine.process_command("become fighter"); // tick 1
    let result = engine.process_command("flee"); // tick 2: no exits

    assert!(!result.success);
    assert!(result.narrative.contains("nowhere to run"));
    assert_eq!(engine.snapshot().player_room_id, "cell");
}

#[test]
fn flee_replays_identically_under_rewind() {
    let mut engine = ChronosEngine::new(two_room_repo());
    engine.process_command("become fighter"); // tick 1
    engine.process_command("flee"); // tick 2: arena → safe_room
    engine.process_command("look"); // tick 3
    assert_eq!(engine.snapshot().player_room_id, "safe_room");

    engine.rewind_to_tick(2);
    assert_eq!(
        engine.snapshot().player_room_id,
        "safe_room",
        "flee must replay to the same room under rewind"
    );
}
