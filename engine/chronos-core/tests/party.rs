//! Integration tests for the party roster: companions declared in the manifest
//! spawn alongside the lead, appear in the snapshot, and survive a rewind — the
//! data-model foundation the JRPG/SRPG combat layers build on.

use chronos_core::{data::repository::StaticRepository, ChronosEngine};

const CAMP: (&str, &str) = (
    "camp.json",
    r#"{ "id": "camp", "name": "Camp", "description": "A fire.", "exits": {} }"#,
);

const HERO: (&str, &str) = (
    "hero.json",
    r#"{ "id": "hero", "name": "Hero", "description": "t",
        "base_stats": { "hp": 100, "attack": 10, "defense": 5 } }"#,
);

const MEDIC: (&str, &str) = (
    "medic.json",
    r#"{ "id": "medic", "name": "Medic", "description": "t",
        "base_stats": { "hp": 70, "attack": 6, "defense": 4 } }"#,
);

const SCOUT: (&str, &str) = (
    "scout.json",
    r#"{ "id": "scout", "name": "Scout", "description": "t",
        "base_stats": { "hp": 60, "attack": 9, "defense": 2 } }"#,
);

/// A repo whose manifest declares a starting party (medic then scout).
fn party_repo() -> StaticRepository {
    let classes = vec![HERO, MEDIC, SCOUT];
    let manifest = r#"{ "start_room_id": "camp",
        "layers": [ { "id": "entity" }, { "id": "party" } ],
        "party": [ "medic", "scout" ] }"#;
    StaticRepository::from_json_pairs(&[CAMP], &[], &classes, Some(manifest)).unwrap()
}

#[test]
fn party_members_spawn_from_manifest_in_order() {
    let mut engine = ChronosEngine::new(party_repo());
    let party = engine.snapshot().party;

    assert_eq!(party.len(), 2, "both companions should be rostered");
    // Roster order follows the manifest list: medic (0), then scout (1).
    assert_eq!(party[0].name, "Medic");
    assert_eq!(party[0].order, 0);
    assert_eq!(party[0].max_hp, 70);
    assert_eq!(party[0].attack, 6);
    assert_eq!(party[1].name, "Scout");
    assert_eq!(party[1].order, 1);

    // Companions stand with the lead in the start room.
    assert_eq!(party[0].room_id, "camp");
}

#[test]
fn party_does_not_make_the_lead() {
    // The companions are not Controllable, so becoming a class still imprints the
    // single lead body — the party doesn't confuse who the player is.
    let mut engine = ChronosEngine::new(party_repo());
    engine.process_command("become hero");
    let snap = engine.snapshot();
    assert_eq!(snap.player_character.unwrap().name, "Hero");
    assert_eq!(
        snap.party.len(),
        2,
        "party persists after the lead is chosen"
    );
}

#[test]
fn empty_party_is_the_default() {
    // A world with no `party` in its manifest has no companions — solo worlds
    // (everything authored before the party layer) are unaffected.
    let manifest = r#"{ "start_room_id": "camp" }"#;
    let mut engine = ChronosEngine::new(
        StaticRepository::from_json_pairs(&[CAMP], &[], &[HERO], Some(manifest)).unwrap(),
    );
    assert!(engine.snapshot().party.is_empty());
}

#[test]
fn party_re_rosters_identically_under_rewind() {
    let mut engine = ChronosEngine::new(party_repo());
    engine.process_command("become hero"); // tick 1
    engine.process_command("look"); // tick 2
    assert_eq!(engine.snapshot().party.len(), 2);

    // Rewind replays the bootstrap, which re-spawns the party deterministically —
    // not duplicated, not lost.
    engine.rewind_to_tick(1);
    let party = engine.snapshot().party;
    assert_eq!(
        party.len(),
        2,
        "rewind must re-roster exactly the same party"
    );
    assert_eq!(party[0].name, "Medic");
    assert_eq!(party[1].name, "Scout");
}
