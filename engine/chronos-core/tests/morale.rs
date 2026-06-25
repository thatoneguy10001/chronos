//! Integration tests for the morale (Hope) system: fleeing saps morale, and
//! morale tiers feed a small attack modifier back into combat.

use chronos_core::{data::repository::StaticRepository, ChronosEngine};

const HERO: (&str, &str) = (
    "hero.json",
    r#"{ "id": "hero", "name": "Hero", "description": "t",
        "base_stats": { "hp": 100, "attack": 20, "defense": 5, "hit": 50 } }"#,
);
// A passive punching bag with enough HP to survive a hit, so we can read the
// damage it took. No retaliation, to keep the comparison clean.
const CRAB: (&str, &str) = (
    "crab.json",
    r#"{ "id": "crab", "name": "Crab", "description": "t",
        "base_stats": { "hp": 100, "attack": 0, "defense": 5, "hit": 0 },
        "xp_reward": 0 }"#,
);

/// Two identical rooms, each holding an identical crab. Fleeing the first lands
/// the player on the second — letting us compare an attack at Steady morale vs
/// Faltering morale (after the flee cost) against the same enemy.
fn repo() -> StaticRepository {
    let rooms = vec![
        (
            "room_a.json",
            r#"{ "id": "room_a", "name": "Room A", "description": ".",
                "exits": { "east": { "target_room_id": "room_b" } } }"#,
        ),
        (
            "room_b.json",
            r#"{ "id": "room_b", "name": "Room B", "description": ".",
                "exits": { "west": { "target_room_id": "room_a" } } }"#,
        ),
    ];
    let manifest = r#"{ "start_room_id": "room_a",
        "encounters": [
            { "class_id": "crab", "room_id": "room_a" },
            { "class_id": "crab", "room_id": "room_b" }
        ] }"#;
    StaticRepository::from_json_pairs(&rooms, &[], &[HERO, CRAB], Some(manifest)).unwrap()
}

#[test]
fn fleeing_drops_morale_to_faltering() {
    let mut engine = ChronosEngine::new(repo());
    engine.process_command("become hero"); // tick 1
    engine.process_command("flee"); // tick 2: room_a → room_b, hope 0 → -1

    let sheet = engine.process_command("sheet");
    assert!(
        sheet.narrative.contains("Faltering"),
        "after fleeing, morale should be Faltering: {}",
        sheet.narrative
    );
}

#[test]
fn faltering_morale_lowers_damage_by_one() {
    // Control: attack at Steady morale (hope 0).
    let mut control = ChronosEngine::new(repo());
    control.process_command("become hero"); // tick 1
    control.process_command("attack"); // tick 2: hits the room_a crab
    let steady_hp = control
        .snapshot()
        .enemies
        .iter()
        .find(|e| e.room_id == "room_a")
        .map(|e| e.hp)
        .unwrap();

    // Faltering: flee first (hope → -1), then attack the identical room_b crab.
    // Flee draws no RNG, so the attack's dice line up with the control's attack —
    // the only difference is the -1 morale modifier.
    let mut fled = ChronosEngine::new(repo());
    fled.process_command("become hero"); // tick 1
    fled.process_command("flee"); // tick 2: → room_b, Faltering
    fled.process_command("attack"); // tick 3
    let faltering_hp = fled
        .snapshot()
        .enemies
        .iter()
        .find(|e| e.room_id == "room_b")
        .map(|e| e.hp)
        .unwrap();

    // The crab took exactly 1 less damage at Faltering morale → 1 more HP left.
    assert_eq!(
        faltering_hp,
        steady_hp + 1,
        "Faltering morale should cost exactly 1 damage (steady {steady_hp}, faltering {faltering_hp})"
    );
}

#[test]
fn morale_change_replays_under_rewind() {
    let mut engine = ChronosEngine::new(repo());
    engine.process_command("become hero"); // tick 1
    engine.process_command("flee"); // tick 2: Faltering
    engine.process_command("look"); // tick 3
    assert!(engine
        .process_command("sheet")
        .narrative
        .contains("Faltering"));

    engine.rewind_to_tick(2);
    // Hope lives in WorldFlags (a resource), so it must be rebuilt by replay.
    assert!(
        engine
            .process_command("sheet")
            .narrative
            .contains("Faltering"),
        "morale must replay under rewind"
    );
}
