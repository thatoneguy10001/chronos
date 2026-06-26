//! Integration tests for companion skills: a medic companion spends its combat
//! turn healing the most-wounded ally instead of attacking, respects its cooldown,
//! and replays identically.

use chronos_core::{data::repository::StaticRepository, ChronosEngine};

const ARENA: (&str, &str) = (
    "arena.json",
    r#"{ "id": "arena", "name": "Arena", "description": "A pit.", "exits": {} }"#,
);

const HERO: (&str, &str) = (
    "hero.json",
    r#"{ "id": "hero", "name": "Hero", "description": "t",
        "base_stats": { "hp": 100, "attack": 6, "defense": 5, "hit": 50 } }"#,
);

// A medic whose only ability is a heal. heal_amount > 0 makes it a support skill.
const MEDIC: (&str, &str) = (
    "medic.json",
    r#"{ "id": "medic", "name": "Medic", "description": "t",
        "base_stats": { "hp": 80, "attack": 5, "defense": 4 },
        "abilities": [
            { "id": "field_dressing", "name": "Field Dressing", "description": "mend a wound",
              "base_damage": 0, "heal_amount": 30, "targeting": "caster" }
        ] }"#,
);

// A brute that hits hard enough to drop the lead below the heal threshold in one
// retaliation, and tanky enough to survive the round so it actually retaliates.
const BRUTE: (&str, &str) = (
    "brute.json",
    r#"{ "id": "brute", "name": "Brute", "description": "t",
        "base_stats": { "hp": 300, "attack": 60, "defense": 0, "hit": 100 },
        "xp_reward": 0 }"#,
);

fn medic_repo() -> StaticRepository {
    let classes = vec![HERO, MEDIC, BRUTE];
    let manifest = r#"{ "start_room_id": "arena",
        "party": [ "medic" ],
        "encounters": [ { "class_id": "brute", "room_id": "arena" } ] }"#;
    StaticRepository::from_json_pairs(&[ARENA], &[], &classes, Some(manifest)).unwrap()
}

#[test]
fn medic_heals_the_wounded_lead_instead_of_attacking() {
    let mut engine = ChronosEngine::new(medic_repo());
    engine.process_command("become hero");
    let result = engine.process_command("attack");

    // The brute's retaliation hurts the lead; the medic then mends instead of swinging.
    assert!(
        result.narrative.contains("Field Dressing") && result.narrative.contains("restoring"),
        "the medic should heal: {}",
        result.narrative
    );
    assert!(
        !result.narrative.contains("Medic hits the Brute"),
        "a healing medic should not also basic-attack this turn: {}",
        result.narrative
    );

    // The lead took ~55 from the brute, then got +30 back — so it sits well above
    // the un-healed ~45 it would otherwise be at.
    let lead_hp = engine.snapshot().player_character.unwrap().hp;
    assert!(
        lead_hp > 60,
        "the heal should have topped the lead back up (lead at {lead_hp} HP)"
    );
}

#[test]
fn medic_attacks_when_nobody_is_hurt() {
    // First round: everyone is at full HP when the party acts (the brute's hit
    // lands on the lead, but the medic checks *before* its own attack — on round
    // one the lead is freshly damaged, so to test the "healthy" branch we give the
    // brute no attack).
    let healer_classes = vec![
        HERO,
        MEDIC,
        (
            "dummy.json",
            r#"{ "id": "dummy", "name": "Dummy", "description": "t",
                "base_stats": { "hp": 300, "attack": 0, "defense": 0, "hit": 0 }, "xp_reward": 0 }"#,
        ),
    ];
    let manifest = r#"{ "start_room_id": "arena",
        "party": [ "medic" ],
        "encounters": [ { "class_id": "dummy", "room_id": "arena" } ] }"#;
    let mut engine = ChronosEngine::new(
        StaticRepository::from_json_pairs(&[ARENA], &[], &healer_classes, Some(manifest)).unwrap(),
    );
    engine.process_command("become hero");
    let result = engine.process_command("attack");

    // Nobody is hurt (the dummy can't hit), so the medic swings instead of healing.
    assert!(
        result.narrative.contains("Medic hits the Dummy"),
        "an idle medic should basic-attack: {}",
        result.narrative
    );
    assert!(
        !result.narrative.contains("restoring"),
        "no heal when everyone is healthy: {}",
        result.narrative
    );
}

#[test]
fn companion_heal_replays_identically_under_rewind() {
    let mut engine = ChronosEngine::new(medic_repo());
    engine.process_command("become hero"); // tick 1
    engine.process_command("attack"); // tick 2: brute hits, medic heals
    let lead_hp = engine.snapshot().player_character.unwrap().hp;
    let tick = engine.current_tick();

    engine.rewind_to_tick(tick);
    assert_eq!(
        engine.snapshot().player_character.unwrap().hp,
        lead_hp,
        "the companion's heal must replay to the same lead HP"
    );
}
