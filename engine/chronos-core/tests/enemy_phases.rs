//! Integration tests for boss phase transitions: one-time changes that fire as
//! an enemy's HP crosses thresholds (announce + buff/heal), each exactly once,
//! and replay-safe.

use chronos_core::{data::repository::StaticRepository, ChronosEngine};

const HERO: (&str, &str) = (
    "hero.json",
    r#"{ "id": "hero", "name": "Hero", "description": "t",
        "base_stats": { "hp": 400, "attack": 20, "defense": 50, "hit": 50 } }"#,
);

const ARENA: (&str, &str) = (
    "arena.json",
    r#"{ "id": "arena", "name": "Arena", "description": ".", "exits": {} }"#,
);

fn repo(boss_json: &str) -> StaticRepository {
    let classes = vec![HERO, ("boss.json", boss_json)];
    let manifest = r#"{ "start_room_id": "arena",
        "encounters": [ { "class_id": "boss", "room_id": "arena" } ] }"#;
    StaticRepository::from_json_pairs(&[ARENA], &[], &classes, Some(manifest)).unwrap()
}

#[test]
fn phases_announce_once_each_in_threshold_order() {
    let boss = r#"{ "id": "boss", "name": "Boss", "description": "t",
        "base_stats": { "hp": 100, "attack": 1, "defense": 0, "hit": 0 },
        "xp_reward": 0,
        "phases": [
            { "hp_threshold": 0.5, "announce": "PHASE-TWO", "attack_bonus": 3 },
            { "hp_threshold": 0.2, "announce": "PHASE-THREE", "attack_bonus": 3 }
        ] }"#;
    let mut engine = ChronosEngine::new(repo(boss));
    engine.process_command("become hero");

    let mut transcript = String::new();
    for _ in 0..20 {
        let r = engine.process_command("attack");
        transcript.push_str(&r.narrative);
        transcript.push('\n');
        if engine.snapshot().enemies.is_empty() {
            break;
        }
    }

    assert_eq!(
        transcript.matches("PHASE-TWO").count(),
        1,
        "phase 2 fires once"
    );
    assert_eq!(
        transcript.matches("PHASE-THREE").count(),
        1,
        "phase 3 fires once"
    );
    assert!(
        transcript.find("PHASE-TWO").unwrap() < transcript.find("PHASE-THREE").unwrap(),
        "phase 2 must announce before phase 3"
    );
}

#[test]
fn heal_phase_restores_hp_when_crossed() {
    let boss = r#"{ "id": "boss", "name": "Boss", "description": "t",
        "base_stats": { "hp": 100, "attack": 1, "defense": 0, "hit": 0 },
        "xp_reward": 0,
        "phases": [ { "hp_threshold": 0.5, "announce": "RECOVERS", "heal": 50 } ] }"#;
    let mut engine = ChronosEngine::new(repo(boss));
    engine.process_command("become hero");

    for _ in 0..20 {
        let hp_before = engine.snapshot().enemies[0].hp;
        let r = engine.process_command("attack");
        if r.narrative.contains("RECOVERS") {
            // The healing hit: +50 heal outweighs the ~20 damage, so HP nets up.
            let hp_after = engine.snapshot().enemies[0].hp;
            assert!(
                hp_after > hp_before,
                "second wind should leave the boss healthier (before {hp_before}, after {hp_after})"
            );
            return;
        }
        if engine.snapshot().enemies.is_empty() {
            break;
        }
    }
    panic!("the heal phase never fired");
}

#[test]
fn phase_heal_replays_identically_under_rewind() {
    let boss = r#"{ "id": "boss", "name": "Boss", "description": "t",
        "base_stats": { "hp": 100, "attack": 1, "defense": 0, "hit": 0 },
        "xp_reward": 0,
        "phases": [ { "hp_threshold": 0.5, "announce": "RECOVERS", "heal": 50 } ] }"#;
    let mut engine = ChronosEngine::new(repo(boss));
    engine.process_command("become hero");

    // Attack until the heal fires, then record the boss HP and tick.
    let mut healed_tick = 0;
    for _ in 0..20 {
        let r = engine.process_command("attack");
        if r.narrative.contains("RECOVERS") {
            healed_tick = engine.current_tick();
            break;
        }
    }
    assert!(healed_tick > 0, "heal phase should have fired");
    let hp_at_heal = engine.snapshot().enemies[0].hp;

    engine.rewind_to_tick(healed_tick);
    assert_eq!(
        engine.snapshot().enemies[0].hp,
        hp_at_heal,
        "the phase heal must replay to the same HP under rewind"
    );
}
