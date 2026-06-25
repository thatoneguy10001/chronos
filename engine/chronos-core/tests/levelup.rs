//! Integration tests for class-specific level-up gains and the consolidated
//! level-up path shared by combat and quest rewards.

use chronos_core::{data::repository::StaticRepository, ChronosEngine};

// An enemy worth exactly one level (level 2 needs 100 XP), one-shot-able.
const XPBAG: (&str, &str) = (
    "xpbag.json",
    r#"{ "id": "xpbag", "name": "XP Bag", "description": "t",
        "base_stats": { "hp": 1, "attack": 0, "defense": 0, "hit": 0 },
        "xp_reward": 100 }"#,
);

fn repo(player_class_json: &str) -> StaticRepository {
    let classes = vec![("hero.json", player_class_json), XPBAG];
    let manifest = r#"{ "start_room_id": "arena",
        "encounters": [ { "class_id": "xpbag", "room_id": "arena" } ] }"#;
    let rooms = vec![(
        "arena.json",
        r#"{ "id": "arena", "name": "Arena", "description": "A pit.", "exits": {} }"#,
    )];
    StaticRepository::from_json_pairs(&rooms, &[], &classes, Some(manifest)).unwrap()
}

/// Attack until the XP bag is dead (guards against the occasional RNG miss),
/// returning the narrative of the killing blow.
fn kill_xpbag(engine: &mut ChronosEngine) -> String {
    for _ in 0..6 {
        let r = engine.process_command("attack");
        if engine.snapshot().enemies.is_empty() {
            return r.narrative;
        }
    }
    panic!("could not kill the XP bag in 6 attacks");
}

#[test]
fn class_without_gains_uses_engine_default() {
    let plain = r#"{ "id": "hero", "name": "Hero", "description": "t",
        "base_stats": { "hp": 100, "attack": 50, "defense": 5, "hit": 50 } }"#;
    let mut engine = ChronosEngine::new(repo(plain));
    engine.process_command("become hero");
    let narrative = kill_xpbag(&mut engine);

    let pc = engine.snapshot().player_character.unwrap();
    assert_eq!(pc.level, 2);
    assert_eq!(pc.defense, 6, "default DEF+1"); // 5 + 1
    assert_eq!(pc.max_hp, 105, "default HP+5"); // 100 + 5
    assert!(
        narrative.contains("ATK+1, DEF+1, HP+5"),
        "default level-up text: {narrative}"
    );
}

#[test]
fn class_with_gains_uses_its_own_growth() {
    let tank = r#"{ "id": "hero", "name": "Hero", "description": "t",
        "base_stats": { "hp": 100, "attack": 50, "defense": 5, "hit": 50 },
        "level_up_gains": { "hp": 9, "attack": 1, "defense": 2 } }"#;
    let mut engine = ChronosEngine::new(repo(tank));
    engine.process_command("become hero");
    let narrative = kill_xpbag(&mut engine);

    let pc = engine.snapshot().player_character.unwrap();
    assert_eq!(pc.level, 2);
    assert_eq!(pc.defense, 7, "DEF+2 from gains"); // 5 + 2
    assert_eq!(pc.max_hp, 109, "HP+9 from gains"); // 100 + 9
    assert_eq!(pc.attack, 51, "ATK+1 from gains"); // 50 + 1
                                                   // Stats are listed in sorted key order: attack, defense, then hp.
    assert!(
        narrative.contains("ATK+1, DEF+2, HP+9"),
        "custom level-up text: {narrative}"
    );
}

#[test]
fn level_up_replays_identically_under_rewind() {
    let tank = r#"{ "id": "hero", "name": "Hero", "description": "t",
        "base_stats": { "hp": 100, "attack": 50, "defense": 5, "hit": 50 },
        "level_up_gains": { "hp": 9, "attack": 1, "defense": 2 } }"#;
    let mut engine = ChronosEngine::new(repo(tank));
    engine.process_command("become hero");
    kill_xpbag(&mut engine);
    let tick = engine.current_tick();
    let before = engine.snapshot().player_character.unwrap();
    assert_eq!(before.defense, 7);

    engine.rewind_to_tick(tick);
    let after = engine.snapshot().player_character.unwrap();
    assert_eq!(
        after.defense, 7,
        "DEF gain must replay, not double or vanish"
    );
    assert_eq!(after.max_hp, 109);
    assert_eq!(after.level, 2);
}
