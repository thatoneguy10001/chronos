//! Integration tests for the passive system: class-declared passive traits that
//! fire automatically (stat bonuses at spawn, bonus damage on hit).

use chronos_core::{data::repository::StaticRepository, ChronosEngine};

fn rooms() -> Vec<(&'static str, &'static str)> {
    vec![(
        "arena.json",
        r#"{ "id": "arena", "name": "Arena", "description": "A pit.", "exits": {} }"#,
    )]
}

/// A repo whose player class optionally carries a passive, with a punching-bag
/// enemy in the start room so one `attack` resolves immediately.
fn repo_with(class_json: &str, passive_jsons: &[(&str, &str)]) -> StaticRepository {
    let classes = vec![
        ("hero.json", class_json),
        (
            "dummy.json",
            r#"{ "id": "dummy", "name": "Dummy", "description": "t",
                "base_stats": { "hp": 200, "attack": 1, "defense": 0 }, "xp_reward": 0 }"#,
        ),
    ];
    let manifest = r#"{ "start_room_id": "arena",
        "encounters": [ { "class_id": "dummy", "room_id": "arena" } ] }"#;
    StaticRepository::from_json_pairs_complete(
        &rooms(),
        &[],
        &classes,
        &[],
        &[],
        passive_jsons,
        Some(manifest),
    )
    .unwrap()
}

const HERO_PLAIN: &str = r#"{ "id": "hero", "name": "Hero", "description": "t",
    "base_stats": { "hp": 100, "attack": 10, "defense": 5 } }"#;

const HERO_WITH_SHIELD: &str = r#"{ "id": "hero", "name": "Hero", "description": "t",
    "base_stats": { "hp": 100, "attack": 10, "defense": 5 },
    "passives": ["shield_mastery"] }"#;

const HERO_WITH_VENOM: &str = r#"{ "id": "hero", "name": "Hero", "description": "t",
    "base_stats": { "hp": 100, "attack": 10, "defense": 5 },
    "passives": ["venom"] }"#;

const SHIELD_PASSIVE: (&str, &str) = (
    "shield_mastery.json",
    r#"{ "id": "shield_mastery", "name": "Shield Mastery", "description": "d",
        "type": "stat_bonus", "stat": "defense", "amount": 3 }"#,
);

const VENOM_PASSIVE: (&str, &str) = (
    "venom.json",
    r#"{ "id": "venom", "name": "Venom", "description": "d",
        "type": "damage_on_hit", "amount": 5 }"#,
);

#[test]
fn stat_bonus_passive_raises_stat_on_spawn() {
    let mut plain = ChronosEngine::new(repo_with(HERO_PLAIN, &[]));
    plain.process_command("become hero");
    let plain_def = plain.snapshot().player_character.unwrap().defense;

    let mut buffed = ChronosEngine::new(repo_with(HERO_WITH_SHIELD, &[SHIELD_PASSIVE]));
    buffed.process_command("become hero");
    let buffed_def = buffed.snapshot().player_character.unwrap().defense;

    // base defense 5; shield_mastery adds +3.
    assert_eq!(plain_def, 5);
    assert_eq!(buffed_def, 8);
}

#[test]
fn damage_on_hit_passive_increases_damage_dealt() {
    // Same seed, same draws — the only difference is the passive, so the venom
    // hero must leave the dummy on strictly less HP after one identical attack.
    let mut plain = ChronosEngine::new(repo_with(HERO_PLAIN, &[]));
    plain.process_command("become hero");
    plain.process_command("attack");
    let plain_hp = plain.snapshot().enemies[0].hp;

    let mut venomous = ChronosEngine::new(repo_with(HERO_WITH_VENOM, &[VENOM_PASSIVE]));
    venomous.process_command("become hero");
    venomous.process_command("attack");
    let venom_hp = venomous.snapshot().enemies[0].hp;

    assert!(
        venom_hp < plain_hp,
        "venom hero should deal more damage (venom {venom_hp} HP vs plain {plain_hp} HP)"
    );
    // The dummy has 200 HP and 0 defense; the +5 passive is the exact gap.
    assert_eq!(plain_hp - venom_hp, 5);
}

#[test]
fn unknown_passive_id_is_ignored_not_fatal() {
    // A class referencing a passive with no definition still loads and spawns —
    // the missing passive simply does nothing (the validator flags the dangling ref).
    let class = r#"{ "id": "hero", "name": "Hero", "description": "t",
        "base_stats": { "hp": 100, "attack": 10, "defense": 5 },
        "passives": ["does_not_exist"] }"#;
    let mut engine = ChronosEngine::new(repo_with(class, &[]));
    let result = engine.process_command("become hero");
    assert!(result.success);
    assert_eq!(engine.snapshot().player_character.unwrap().defense, 5);
}

#[test]
fn passive_stat_bonus_replays_under_rewind() {
    let mut engine = ChronosEngine::new(repo_with(HERO_WITH_SHIELD, &[SHIELD_PASSIVE]));
    engine.process_command("become hero"); // tick 1
    engine.process_command("look"); // tick 2
    assert_eq!(
        engine.snapshot().player_character.as_ref().unwrap().defense,
        8
    );

    engine.rewind_to_tick(1);
    // After replaying the spawn, the passive bonus must be reapplied, not doubled.
    assert_eq!(engine.snapshot().player_character.unwrap().defense, 8);
}
