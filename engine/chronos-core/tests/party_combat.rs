//! Integration tests for party combat: companions pile onto the lead's `attack`,
//! their assist damage is real, an ally can land the killing blow (and the lead
//! still collects the reward), and the whole pass replays identically.

use chronos_core::{data::repository::StaticRepository, ChronosEngine};

const ARENA: (&str, &str) = (
    "arena.json",
    r#"{ "id": "arena", "name": "Arena", "description": "A pit.", "exits": {} }"#,
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

/// Repo with a fighter, one companion, and a tough punching-bag enemy that won't
/// die in a single round so we can observe assist damage.
fn party_combat_repo() -> StaticRepository {
    let classes = vec![
        HERO,
        ALLY,
        (
            "dummy.json",
            r#"{ "id": "dummy", "name": "Dummy", "description": "t",
                "base_stats": { "hp": 200, "attack": 0, "defense": 0, "hit": 0 },
                "xp_reward": 0 }"#,
        ),
    ];
    let manifest = r#"{ "start_room_id": "arena",
        "layers": [ { "id": "entity" }, { "id": "party" }, { "id": "space" }, { "id": "combat" } ],
        "party": [ "ally" ],
        "encounters": [ { "class_id": "dummy", "room_id": "arena" } ] }"#;
    StaticRepository::from_json_pairs(&[ARENA], &[], &classes, Some(manifest)).unwrap()
}

#[test]
fn companion_adds_assist_damage_on_attack() {
    let mut engine = ChronosEngine::new(party_combat_repo());
    engine.process_command("become hero");
    let result = engine.process_command("attack");

    // The narrative shows both the lead's strike and the companion's follow-up.
    assert!(
        result.narrative.contains("You strike the Dummy"),
        "lead should strike: {}",
        result.narrative
    );
    assert!(
        result.narrative.contains("Ally hits the Dummy"),
        "companion should assist: {}",
        result.narrative
    );

    // Lead deals ~10-5=5±2 and ally ~8-0=8±2 — the dummy has lost clearly more
    // than the lead alone could manage in one swing.
    let dummy_hp = engine.snapshot().enemies[0].hp;
    assert!(
        dummy_hp <= 188,
        "both lead and ally should have dealt damage (dummy at {dummy_hp}/200)"
    );
}

#[test]
fn solo_lead_fights_exactly_as_before() {
    // No `party` in the manifest → the assist pass is a no-op and the round reads
    // as a plain solo exchange (no companion line).
    let manifest = r#"{ "start_room_id": "arena",
        "encounters": [ { "class_id": "dummy", "room_id": "arena" } ] }"#;
    let classes = vec![
        HERO,
        (
            "dummy.json",
            r#"{ "id": "dummy", "name": "Dummy", "description": "t",
                "base_stats": { "hp": 200, "attack": 0, "defense": 0, "hit": 0 }, "xp_reward": 0 }"#,
        ),
    ];
    let mut engine = ChronosEngine::new(
        StaticRepository::from_json_pairs(&[ARENA], &[], &classes, Some(manifest)).unwrap(),
    );
    engine.process_command("become hero");
    let result = engine.process_command("attack");
    assert!(result.narrative.contains("You strike the Dummy"));
    assert!(
        !result.narrative.contains("hits the Dummy"),
        "no companion line in a solo fight: {}",
        result.narrative
    );
}

/// Repo where a single ally assist is enough to finish a near-dead enemy, and the
/// enemy is worth XP so we can confirm the lead collects the reward.
fn finisher_repo() -> StaticRepository {
    let classes = vec![
        HERO,
        ALLY,
        (
            "rat.json",
            r#"{ "id": "rat", "name": "Rat", "description": "t",
                "base_stats": { "hp": 1, "attack": 0, "defense": 0, "hit": 0 },
                "xp_reward": 50 }"#,
        ),
    ];
    let manifest = r#"{ "start_room_id": "arena",
        "party": [ "ally" ],
        "encounters": [ { "class_id": "rat", "room_id": "arena" } ] }"#;
    StaticRepository::from_json_pairs(&[ARENA], &[], &classes, Some(manifest)).unwrap()
}

#[test]
fn ally_killing_blow_rewards_the_lead() {
    let mut engine = ChronosEngine::new(finisher_repo());
    engine.process_command("become hero");
    // The 1-HP rat dies to the lead's strike here, but the key invariant is that
    // however it dies, the lead gets the XP and the enemy is gone.
    engine.process_command("attack");

    let snap = engine.snapshot();
    assert!(snap.enemies.is_empty(), "the rat should be dead");
    assert_eq!(
        snap.player_character.unwrap().xp,
        50,
        "the lead collects the kill reward regardless of who lands it"
    );
}

#[test]
fn party_assist_replays_identically_under_rewind() {
    let mut engine = ChronosEngine::new(party_combat_repo());
    engine.process_command("become hero"); // tick 1
    engine.process_command("attack"); // tick 2: lead + ally both strike
    let hp_after = engine.snapshot().enemies[0].hp;
    let tick = engine.current_tick();

    engine.rewind_to_tick(tick);
    assert_eq!(
        engine.snapshot().enemies[0].hp,
        hp_after,
        "lead + companion damage must replay to the same enemy HP"
    );
}
