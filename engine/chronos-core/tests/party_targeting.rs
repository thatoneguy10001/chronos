//! Integration tests for enemies targeting the party: an enemy's retaliation can
//! land on a companion instead of the lead, a felled companion leaves the roster
//! while the lead fights on, and it all replays identically.

use chronos_core::{data::repository::StaticRepository, ChronosEngine};

const ARENA: (&str, &str) = (
    "arena.json",
    r#"{ "id": "arena", "name": "Arena", "description": "A pit.", "exits": {} }"#,
);

// A tanky lead who can soak many rounds, so the fight runs long enough to observe
// the enemy spreading its hits onto companions.
const HERO: (&str, &str) = (
    "hero.json",
    r#"{ "id": "hero", "name": "Hero", "description": "t",
        "base_stats": { "hp": 400, "attack": 5, "defense": 10, "hit": 50 } }"#,
);

const GRUNT: (&str, &str) = (
    "grunt.json",
    r#"{ "id": "grunt", "name": "Grunt", "description": "t",
        "base_stats": { "hp": 90, "attack": 8, "defense": 2 } }"#,
);

// A durable, hard-hitting brute that reliably connects (hit 100) and survives long
// enough to take many turns.
const BRUTE: (&str, &str) = (
    "brute.json",
    r#"{ "id": "brute", "name": "Brute", "description": "t",
        "base_stats": { "hp": 2000, "attack": 30, "defense": 0, "hit": 100 },
        "xp_reward": 0 }"#,
);

fn targeting_repo(grunt_json: (&'static str, &'static str)) -> StaticRepository {
    let classes = vec![HERO, grunt_json, BRUTE];
    let manifest = r#"{ "start_room_id": "arena",
        "party": [ "grunt" ],
        "encounters": [ { "class_id": "brute", "room_id": "arena" } ] }"#;
    StaticRepository::from_json_pairs(&[ARENA], &[], &classes, Some(manifest)).unwrap()
}

#[test]
fn enemy_can_strike_a_companion() {
    let mut engine = ChronosEngine::new(targeting_repo(GRUNT));
    engine.process_command("become hero");

    // Over several rounds the brute's retaliation should land on the grunt at least
    // once (target is chosen each round; the seed makes this deterministic).
    let mut hit_companion = false;
    for _ in 0..12 {
        let r = engine.process_command("attack");
        if r.narrative.contains("hits the Grunt")
            || r.narrative.contains("strikes desperately at the Grunt")
        {
            hit_companion = true;
            break;
        }
    }
    assert!(
        hit_companion,
        "the enemy should have targeted the companion at least once over 12 rounds"
    );

    // And that damage is real — the grunt isn't at full health anymore.
    let grunt = engine
        .snapshot()
        .party
        .into_iter()
        .find(|m| m.name == "Grunt");
    if let Some(g) = grunt {
        assert!(g.hp < g.max_hp, "the grunt should have taken damage");
    }
}

#[test]
fn a_felled_companion_leaves_the_party_but_the_lead_fights_on() {
    // A fragile grunt the brute one-shots, so it falls within a few rounds.
    const FRAGILE: (&str, &str) = (
        "grunt.json",
        r#"{ "id": "grunt", "name": "Grunt", "description": "t",
            "base_stats": { "hp": 20, "attack": 8, "defense": 0 } }"#,
    );
    let mut engine = ChronosEngine::new(targeting_repo(FRAGILE));
    engine.process_command("become hero");

    let mut fell = false;
    for _ in 0..16 {
        let r = engine.process_command("attack");
        if r.narrative.contains("Grunt has fallen") {
            fell = true;
            break;
        }
    }
    assert!(fell, "the fragile grunt should fall within 16 rounds");

    let snap = engine.snapshot();
    assert!(
        snap.party.iter().all(|m| m.name != "Grunt"),
        "the fallen grunt should be off the roster"
    );
    // The tanky lead is still standing and the run continues.
    let lead = snap.player_character.unwrap();
    assert!(lead.hp > 0, "the lead fights on after a companion falls");
}

#[test]
fn party_targeting_replays_identically_under_rewind() {
    let mut engine = ChronosEngine::new(targeting_repo(GRUNT));
    engine.process_command("become hero");
    for _ in 0..5 {
        engine.process_command("attack");
    }
    let lead_hp = engine.snapshot().player_character.unwrap().hp;
    let grunt_hp = engine
        .snapshot()
        .party
        .iter()
        .find(|m| m.name == "Grunt")
        .map(|m| m.hp);
    let tick = engine.current_tick();

    engine.rewind_to_tick(tick);
    let snap = engine.snapshot();
    assert_eq!(
        snap.player_character.unwrap().hp,
        lead_hp,
        "lead HP must replay"
    );
    assert_eq!(
        snap.party.iter().find(|m| m.name == "Grunt").map(|m| m.hp),
        grunt_hp,
        "companion HP must replay — same target choices, same damage"
    );
}
