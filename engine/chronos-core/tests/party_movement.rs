//! Integration tests for companions following the lead: when the lead walks (or
//! flees) to another room, the party comes along — so the roster is still there
//! for the next room's encounter — and it replays identically.

use chronos_core::{data::repository::StaticRepository, ChronosEngine};

const CAMP: (&str, &str) = (
    "camp.json",
    r#"{ "id": "camp", "name": "Camp", "description": "A fire.",
        "exits": { "north": { "target_room_id": "field" } } }"#,
);

const FIELD: (&str, &str) = (
    "field.json",
    r#"{ "id": "field", "name": "Field", "description": "Open ground.", "exits": {} }"#,
);

const HERO: (&str, &str) = (
    "hero.json",
    r#"{ "id": "hero", "name": "Hero", "description": "t",
        "base_stats": { "hp": 100, "attack": 10, "defense": 5, "hit": 50 } }"#,
);

const ALLY: (&str, &str) = (
    "ally.json",
    r#"{ "id": "ally", "name": "Ally", "description": "t",
        "base_stats": { "hp": 80, "attack": 8, "defense": 4 } }"#,
);

fn two_room_party_repo(manifest: &str) -> StaticRepository {
    let classes = vec![HERO, ALLY, GUARD];
    StaticRepository::from_json_pairs(&[CAMP, FIELD], &[], &classes, Some(manifest)).unwrap()
}

const GUARD: (&str, &str) = (
    "guard.json",
    r#"{ "id": "guard", "name": "Guard", "description": "t",
        "base_stats": { "hp": 50, "attack": 4, "defense": 0, "hit": 50 }, "xp_reward": 0 }"#,
);

#[test]
fn companion_follows_the_lead_through_an_exit() {
    let manifest = r#"{ "start_room_id": "camp", "party": [ "ally" ] }"#;
    let mut engine = ChronosEngine::new(two_room_party_repo(manifest));
    engine.process_command("become hero");

    // Companion starts in the camp with the lead.
    assert_eq!(engine.snapshot().party[0].room_id, "camp");

    engine.process_command("go north");

    let snap = engine.snapshot();
    assert_eq!(snap.player_room_id, "field", "the lead moved");
    assert_eq!(
        snap.party[0].room_id, "field",
        "the companion should follow the lead to the field"
    );
}

#[test]
fn companion_follows_the_lead_when_fleeing() {
    // A guard in the camp to flee from; an exit north to escape through.
    let manifest = r#"{ "start_room_id": "camp",
        "party": [ "ally" ],
        "encounters": [ { "class_id": "guard", "room_id": "camp" } ] }"#;
    let mut engine = ChronosEngine::new(two_room_party_repo(manifest));
    engine.process_command("become hero");
    engine.process_command("flee");

    let snap = engine.snapshot();
    assert_eq!(snap.player_room_id, "field", "the lead fled to the field");
    assert_eq!(
        snap.party[0].room_id, "field",
        "the companion flees with the lead"
    );
    // The guard stays put — fleeing buys distance, it doesn't move the enemy.
    assert_eq!(snap.enemies[0].room_id, "camp");
}

#[test]
fn companion_follow_replays_identically_under_rewind() {
    let manifest = r#"{ "start_room_id": "camp", "party": [ "ally" ] }"#;
    let mut engine = ChronosEngine::new(two_room_party_repo(manifest));
    engine.process_command("become hero"); // tick 1
    engine.process_command("go north"); // tick 2
    let tick = engine.current_tick();
    assert_eq!(engine.snapshot().party[0].room_id, "field");

    engine.rewind_to_tick(tick);
    assert_eq!(
        engine.snapshot().party[0].room_id,
        "field",
        "the companion's room must replay, not snap back to the start"
    );
}
