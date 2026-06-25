//! Integration test for the character sheet's equipped-gear section: equipping a
//! bonus item shows it (with its stat bonus) on the sheet.

use chronos_core::{data::repository::StaticRepository, ChronosEngine};

fn repo() -> StaticRepository {
    let rooms = vec![(
        "arena.json",
        r#"{ "id": "arena", "name": "Arena", "description": "A pit.", "exits": {} }"#,
    )];
    let items = vec![(
        "iron_sword.json",
        r#"{ "id": "iron_sword", "name": "Iron Sword", "description": "A blade.",
            "starting_room_id": "arena", "tags": ["weapon", "sword"],
            "attributes": { "equip_stat": "attack", "equip_bonus": 3 } }"#,
    )];
    let classes = vec![(
        "fighter.json",
        r#"{ "id": "fighter", "name": "Fighter", "description": "t",
            "base_stats": { "hp": 100, "attack": 10, "defense": 5 } }"#,
    )];
    let manifest = r#"{ "start_room_id": "arena" }"#;
    StaticRepository::from_json_pairs(&rooms, &items, &classes, Some(manifest)).unwrap()
}

#[test]
fn character_sheet_shows_equipped_item_with_bonus() {
    let mut engine = ChronosEngine::new(repo());
    engine.process_command("become fighter");

    // Before equipping anything, the sheet has no Equipped section.
    let bare = engine.process_command("sheet");
    assert!(
        !bare.narrative.contains("Equipped:"),
        "no gear yet, so no Equipped section: {}",
        bare.narrative
    );

    engine.process_command("take iron sword");
    // Equip by exact id — the form the UI's context-action buttons send.
    engine.process_command("equip iron_sword");

    let sheet = engine.process_command("sheet");
    assert!(
        sheet.narrative.contains("Equipped:"),
        "sheet should have an Equipped section: {}",
        sheet.narrative
    );
    assert!(
        sheet.narrative.contains("Weapon: Iron Sword (+3 ATK)"),
        "sheet should show the weapon and its bonus: {}",
        sheet.narrative
    );
}
