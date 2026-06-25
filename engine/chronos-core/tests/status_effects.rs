//! Integration tests for two previously-inert status effects now wired into
//! combat: Stun (a stunned enemy skips its retaliation) and Plague (spreads to
//! other enemies in the room when its host dies).

use chronos_core::{data::repository::StaticRepository, ChronosEngine};

const ARENA: (&str, &str) = (
    "arena.json",
    r#"{ "id": "arena", "name": "Arena", "description": "A pit.", "exits": {} }"#,
);

const FIGHTER: (&str, &str) = (
    "fighter.json",
    r#"{ "id": "fighter", "name": "Fighter", "description": "t",
        "base_stats": { "hp": 100, "attack": 10, "defense": 5, "hit": 10 } }"#,
);

/// Repo: a fighter plus one hard-hitting brute in the arena. The brute has no
/// tactics, so it falls back to BasicAttack and reliably retaliates.
fn stun_repo() -> StaticRepository {
    let classes = vec![
        FIGHTER,
        (
            "brute.json",
            r#"{ "id": "brute", "name": "Brute", "description": "t",
                "base_stats": { "hp": 100, "attack": 30, "defense": 0, "hit": 80 },
                "xp_reward": 0 }"#,
        ),
    ];
    let manifest = r#"{ "start_room_id": "arena",
        "encounters": [ { "class_id": "brute", "room_id": "arena" } ] }"#;
    StaticRepository::from_json_pairs(&[ARENA], &[], &classes, Some(manifest)).unwrap()
}

#[test]
fn unstunned_enemy_retaliates() {
    // Control: with no stun, the brute hits back and the fighter loses HP.
    let mut engine = ChronosEngine::new(stun_repo());
    engine.process_command("become fighter");
    engine.process_command("attack");
    let hp = engine.snapshot().player_character.unwrap().hp;
    assert!(
        hp < 100,
        "brute should have retaliated (fighter at {hp} HP)"
    );
}

#[test]
fn stunned_enemy_skips_its_turn() {
    let mut engine = ChronosEngine::new(stun_repo());
    engine.process_command("become fighter"); // tick 1
    engine.process_command("apply_effect stun brute 0 3"); // tick 2: stun active ticks 3..5
    let result = engine.process_command("attack"); // tick 3: brute is stunned

    // The fighter took no retaliation damage — full HP.
    assert_eq!(engine.snapshot().player_character.unwrap().hp, 100);
    assert!(
        result.narrative.contains("stunned"),
        "narrative should note the stun: {}",
        result.narrative
    );
}

const CARRIER_AND_BYSTANDER_MANIFEST: &str = r#"{ "start_room_id": "arena",
    "encounters": [
        { "class_id": "carrier",   "room_id": "arena" },
        { "class_id": "bystander", "room_id": "arena" }
    ] }"#;

/// Repo: a fighter, a near-dead "carrier" (spawned first → attacked first), and a
/// healthy "bystander". Neither enemy fights back, keeping the test focused on
/// the spread.
fn plague_repo() -> StaticRepository {
    let classes = vec![
        FIGHTER,
        (
            "carrier.json",
            r#"{ "id": "carrier", "name": "Carrier", "description": "t",
                "base_stats": { "hp": 5, "attack": 0, "defense": 0, "hit": 0 },
                "xp_reward": 0 }"#,
        ),
        (
            "bystander.json",
            r#"{ "id": "bystander", "name": "Bystander", "description": "t",
                "base_stats": { "hp": 100, "attack": 0, "defense": 0, "hit": 0 },
                "xp_reward": 0 }"#,
        ),
    ];
    StaticRepository::from_json_pairs(
        &[ARENA],
        &[],
        &classes,
        Some(CARRIER_AND_BYSTANDER_MANIFEST),
    )
    .unwrap()
}

#[test]
fn plague_spreads_to_other_enemies_when_host_dies() {
    let mut engine = ChronosEngine::new(plague_repo());
    engine.process_command("become fighter"); // tick 1
    engine.process_command("apply_effect plague carrier 3 10"); // tick 2: plague the carrier
    let result = engine.process_command("attack"); // tick 3: kill carrier → plague spreads

    let snap = engine.snapshot();
    // Carrier is dead; only the bystander remains.
    assert_eq!(snap.enemies.len(), 1);
    let bystander = &snap.enemies[0];
    assert_eq!(bystander.name, "Bystander");
    assert!(
        bystander.active_effects.iter().any(|e| e == "Plague"),
        "plague should have spread to the bystander: {:?}",
        bystander.active_effects
    );
    assert!(
        result.narrative.contains("plague leaps"),
        "narrative should note the spread: {}",
        result.narrative
    );
}

#[test]
fn plague_spread_replays_identically_under_rewind() {
    let mut engine = ChronosEngine::new(plague_repo());
    engine.process_command("become fighter"); // tick 1
    engine.process_command("apply_effect plague carrier 3 10"); // tick 2
    engine.process_command("attack"); // tick 3: spread happens

    // Sanity before rewind.
    assert!(engine.snapshot().enemies[0]
        .active_effects
        .iter()
        .any(|e| e == "Plague"));

    // Replaying through the kill must reproduce the spread, not lose or double it.
    engine.rewind_to_tick(3);
    let snap = engine.snapshot();
    assert_eq!(snap.enemies.len(), 1);
    assert!(
        snap.enemies[0].active_effects.iter().any(|e| e == "Plague"),
        "plague spread must replay under rewind: {:?}",
        snap.enemies[0].active_effects
    );
}
