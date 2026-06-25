//! Integration tests for enemy loot drops: a slain enemy's loot_table is rolled
//! against the seeded RNG, drops land on the room floor, and the whole thing
//! replays identically under rewind.

use chronos_core::{data::repository::StaticRepository, ChronosEngine};

const ARENA: (&str, &str) = (
    "arena.json",
    r#"{ "id": "arena", "name": "Arena", "description": "A pit.", "exits": {} }"#,
);
const GEM: (&str, &str) = (
    "gem.json",
    r#"{ "id": "gem", "name": "Gem", "description": "A shiny gem." }"#,
);
// A fighter strong enough to one-shot the drop dummies below.
const FIGHTER: (&str, &str) = (
    "fighter.json",
    r#"{ "id": "fighter", "name": "Fighter", "description": "t",
        "base_stats": { "hp": 100, "attack": 50, "defense": 5, "hit": 50 } }"#,
);

/// Repo with a one-HP enemy whose loot_table is supplied by the caller.
fn repo_with_loot(loot_json: &str) -> StaticRepository {
    let dummy = format!(
        r#"{{ "id": "dummy", "name": "Dummy", "description": "t",
            "base_stats": {{ "hp": 1, "attack": 0, "defense": 0, "hit": 0 }},
            "xp_reward": 0, "loot_table": {loot_json} }}"#
    );
    let classes = vec![
        FIGHTER,
        ("dummy.json", Box::leak(dummy.into_boxed_str()) as &str),
    ];
    let manifest = r#"{ "start_room_id": "arena",
        "encounters": [ { "class_id": "dummy", "room_id": "arena" } ] }"#;
    StaticRepository::from_json_pairs(&[ARENA], &[GEM], &classes, Some(manifest)).unwrap()
}

#[test]
fn guaranteed_drop_lands_in_room_and_can_be_picked_up() {
    let mut engine = ChronosEngine::new(repo_with_loot(r#"[{ "item_id": "gem", "chance": 1.0 }]"#));
    engine.process_command("become fighter"); // tick 1
    let kill = engine.process_command("attack"); // tick 2: dummy dies, drops gem

    assert!(
        kill.narrative.contains("drops: Gem"),
        "kill narrative should announce the drop: {}",
        kill.narrative
    );

    // The gem is on the floor — picking it up puts it in inventory.
    engine.process_command("take gem"); // tick 3
    assert!(
        engine.snapshot().inventory_ids.iter().any(|id| id == "gem"),
        "picked-up gem should be in inventory"
    );
}

#[test]
fn zero_chance_never_drops() {
    let mut engine = ChronosEngine::new(repo_with_loot(r#"[{ "item_id": "gem", "chance": 0.0 }]"#));
    engine.process_command("become fighter");
    let kill = engine.process_command("attack");
    assert!(
        !kill.narrative.contains("drops:"),
        "a 0%-chance drop must never fire: {}",
        kill.narrative
    );
}

#[test]
fn loot_drop_replays_identically_under_rewind() {
    let mut engine = ChronosEngine::new(repo_with_loot(r#"[{ "item_id": "gem", "chance": 1.0 }]"#));
    engine.process_command("become fighter"); // tick 1
    engine.process_command("attack"); // tick 2: drop
    engine.process_command("take gem"); // tick 3: now in inventory
    assert!(engine.snapshot().inventory_ids.iter().any(|id| id == "gem"));

    // Replaying through the kill must re-drop the gem so the pickup still resolves.
    engine.rewind_to_tick(3);
    assert!(
        engine.snapshot().inventory_ids.iter().any(|id| id == "gem"),
        "loot drop + pickup must replay under rewind"
    );
}
