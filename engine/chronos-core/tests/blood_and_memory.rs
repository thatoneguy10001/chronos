//! Integration tests for the Blood and Memory quest chain.
//!
//! Loads the actual iron-and-blood world from disk and verifies:
//!   - The diary item exists and is placed in the field_hospital
//!   - Picking it up sets the diary_found_turned_in flag
//!   - Diary content expands after each quest turn-in
//!   - All 5 chain quests gate correctly and complete in sequence
//!   - The final entry ("last page") appears only after the full chain

use std::path::Path;
use chronos_core::{ChronosEngine, data::repository::StaticRepository};

fn load_dir(dir: &Path) -> Vec<(String, String)> {
    let mut pairs = Vec::new();
    for entry in std::fs::read_dir(dir).expect("dir should exist").flatten() {
        let p = entry.path();
        if p.extension().and_then(|e| e.to_str()) == Some("json") {
            let filename = p.file_name().unwrap().to_str().unwrap().to_string();
            let content = std::fs::read_to_string(&p)
                .unwrap_or_else(|_| panic!("failed to read {}", p.display()));
            pairs.push((filename, content));
        }
    }
    pairs
}

fn iron_blood_repo() -> StaticRepository {
    let base = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../worlds/iron-and-blood");
    let rooms   = load_dir(&base.join("rooms"));
    let items   = load_dir(&base.join("items"));
    let classes = load_dir(&base.join("classes"));
    let npcs    = load_dir(&base.join("npcs"));
    let quests  = load_dir(&base.join("quests"));
    let manifest = std::fs::read_to_string(base.join("manifest.json"))
        .expect("manifest.json should exist");
    let room_refs:  Vec<(&str, &str)> = rooms.iter().map(|(f, c)| (f.as_str(), c.as_str())).collect();
    let item_refs:  Vec<(&str, &str)> = items.iter().map(|(f, c)| (f.as_str(), c.as_str())).collect();
    let class_refs: Vec<(&str, &str)> = classes.iter().map(|(f, c)| (f.as_str(), c.as_str())).collect();
    let npc_refs:   Vec<(&str, &str)> = npcs.iter().map(|(f, c)| (f.as_str(), c.as_str())).collect();
    let quest_refs: Vec<(&str, &str)> = quests.iter().map(|(f, c)| (f.as_str(), c.as_str())).collect();
    StaticRepository::from_json_pairs_full(
        &room_refs, &item_refs, &class_refs, &npc_refs, &quest_refs, Some(&manifest),
    )
    .expect("iron-and-blood world should load without errors")
}

fn new_game() -> ChronosEngine {
    let mut engine = ChronosEngine::new(iron_blood_repo());
    let r = engine.process_command("become ironclad Ira");
    assert!(r.success, "character creation failed: {}", r.narrative);
    engine
}

// ── smoke ─────────────────────────────────────────────────────────────────────

#[test]
fn all_bam_quests_exist_in_repository() {
    let repo = iron_blood_repo();
    let chain = [
        "bam_before_silence",
        "bam_bone_fields",
        "bam_high_ground",
        "bam_arris",
        "bam_memory_enough",
    ];
    for id in &chain {
        assert!(repo.quest(id).is_some(), "quest '{id}' missing from repository");
    }
}

#[test]
fn diary_placed_in_field_hospital() {
    let repo = iron_blood_repo();
    let t = repo.item("ren_diary").expect("ren_diary item should exist");
    assert_eq!(
        t.starting_room_id.as_deref(), Some("field_hospital"),
        "diary should start in field_hospital"
    );
}

// ── diary pickup ──────────────────────────────────────────────────────────────

#[test]
fn picking_up_diary_shows_entry_one_only() {
    let mut engine = new_game();
    engine.process_command("dev goto field_hospital");
    let take = engine.process_command("take ren_diary");
    assert!(take.success, "should be able to pick up diary: {}", take.narrative);

    let read = engine.process_command("examine diary");
    assert!(read.success, "examine should succeed: {}", read.narrative);
    assert!(read.narrative.contains("Day 12"), "entry 1 should be present: {}", read.narrative);
    assert!(!read.narrative.contains("year two"), "entry 2 should not be present yet: {}", read.narrative);
    assert!(!read.narrative.contains("ground changed color"), "entry 3 should not be present yet: {}", read.narrative);
}

#[test]
fn diary_unlocks_adra_topic() {
    let mut engine = new_game();
    engine.process_command("dev goto field_hospital");
    engine.process_command("take ren_diary");

    let talk = engine.process_command("talk sister_adra");
    assert!(
        talk.context_actions.iter().any(|a| a.command.contains("diary")),
        "diary topic should appear after pickup: {:?}", talk.context_actions
    );
}

#[test]
fn diary_unlocks_thorn_topic() {
    let mut engine = new_game();
    engine.process_command("dev goto field_hospital");
    engine.process_command("take ren_diary");
    engine.process_command("dev goto command_post");

    let talk = engine.process_command("talk commander_thorn");
    assert!(
        talk.context_actions.iter().any(|a| a.command.contains("diary")),
        "diary topic should appear on Thorn after pickup: {:?}", talk.context_actions
    );
}

// ── quest gates ───────────────────────────────────────────────────────────────

#[test]
fn bam_before_silence_blocked_without_diary() {
    let mut engine = new_game();
    engine.process_command("dev goto field_hospital");
    // Don't pick up the diary
    engine.process_command("talk sister_adra");
    let r = engine.process_command("accept bam_before_silence");
    assert!(!r.success, "bam_before_silence should be blocked without diary: {}", r.narrative);
}

#[test]
fn bam_before_silence_available_after_diary_pickup() {
    let mut engine = new_game();
    engine.process_command("dev goto field_hospital");
    engine.process_command("take ren_diary");
    engine.process_command("talk sister_adra");
    let r = engine.process_command("accept bam_before_silence");
    assert!(r.success, "bam_before_silence should unlock after picking up diary: {}", r.narrative);
}

#[test]
fn each_quest_gates_on_previous() {
    let repo = iron_blood_repo();
    let gates = [
        ("bam_bone_fields",    "bam_before_silence"),
        ("bam_high_ground",    "bam_bone_fields"),
        ("bam_arris",          "bam_high_ground"),
        ("bam_memory_enough",  "bam_arris"),
    ];
    for (quest_id, prereq) in &gates {
        let t = repo.quest(quest_id).unwrap_or_else(|| panic!("quest {quest_id} missing"));
        assert!(
            t.requires_quest_complete.iter().any(|r| r == prereq),
            "quest {quest_id} should require {prereq}"
        );
    }
}

// ── full chain ────────────────────────────────────────────────────────────────

#[test]
fn blood_and_memory_full_chain_diary_expands_at_each_step() {
    let mut engine = new_game();

    // ── ACT 1: pick up the diary ──────────────────────────────────────────
    engine.process_command("dev goto field_hospital");
    let take = engine.process_command("take ren_diary");
    assert!(take.success, "take diary: {}", take.narrative);

    let d = engine.process_command("examine diary");
    assert!(d.narrative.contains("Day 12"), "entry 1 after pickup: {}", d.narrative);

    // ── ACT 2: bam_before_silence — talk to Thorn ─────────────────────────
    engine.process_command("talk sister_adra");
    let accept1 = engine.process_command("accept bam_before_silence");
    assert!(accept1.success, "accept bam_before_silence: {}", accept1.narrative);

    engine.process_command("dev goto command_post");
    let thorn_talk = engine.process_command("talk commander_thorn");
    assert!(thorn_talk.success, "talk to Thorn: {}", thorn_talk.narrative);

    engine.process_command("dev goto field_hospital");
    let turnin1 = engine.process_command("turn in bam_before_silence");
    assert!(turnin1.success, "turn in bam_before_silence: {}", turnin1.narrative);

    let d = engine.process_command("examine diary");
    assert!(d.narrative.contains("year two"), "entry 2 (year two) after act 1: {}", d.narrative);
    assert!(d.narrative.contains("Showed it to the Commander"), "player entry 1 after act 1: {}", d.narrative);

    // ── ACT 3: bam_bone_fields — reach the Bone Fields ───────────────────
    engine.process_command("talk sister_adra");
    let accept2 = engine.process_command("accept bam_bone_fields");
    assert!(accept2.success, "accept bam_bone_fields: {}", accept2.narrative);

    engine.process_command("dev goto bone_fields");

    engine.process_command("dev goto field_hospital");
    let turnin2 = engine.process_command("turn in bam_bone_fields");
    assert!(turnin2.success, "turn in bam_bone_fields: {}", turnin2.narrative);

    let d = engine.process_command("examine diary");
    assert!(d.narrative.contains("ground changed color"), "entry 3 after act 2: {}", d.narrative);
    assert!(d.narrative.contains("stood here too"), "player entry 2 after act 2: {}", d.narrative);

    // ── ACT 4: bam_high_ground — talk to Kehl ────────────────────────────
    engine.process_command("talk sister_adra");
    let accept3 = engine.process_command("accept bam_high_ground");
    assert!(accept3.success, "accept bam_high_ground: {}", accept3.narrative);

    engine.process_command("dev goto windward_approach");
    let kehl_talk = engine.process_command("talk sergeant_kehl");
    assert!(kehl_talk.success, "talk to Kehl: {}", kehl_talk.narrative);

    engine.process_command("dev goto field_hospital");
    let turnin3 = engine.process_command("turn in bam_high_ground");
    assert!(turnin3.success, "turn in bam_high_ground: {}", turnin3.narrative);

    let d = engine.process_command("examine diary");
    assert!(d.narrative.contains("Something happened in the ruins"), "entry 4 after act 3: {}", d.narrative);
    assert!(d.narrative.contains("measuring you back"), "player entry 3 after act 3: {}", d.narrative);

    // ── ACT 5: bam_arris — talk to Sevyas about Arris ────────────────────
    engine.process_command("talk sister_adra");
    let accept4 = engine.process_command("accept bam_arris");
    assert!(accept4.success, "accept bam_arris: {}", accept4.narrative);

    let sevyas_talk = engine.process_command("talk corporal_sevyas");
    assert!(sevyas_talk.success, "talk to Sevyas: {}", sevyas_talk.narrative);

    let turnin4 = engine.process_command("turn in bam_arris");
    assert!(turnin4.success, "turn in bam_arris: {}", turnin4.narrative);

    let d = engine.process_command("examine diary");
    assert!(d.narrative.contains("what's left of me that isn't this war"), "Ren final entry after act 4: {}", d.narrative);
    assert!(d.narrative.contains("shape of the loss"), "player entry 4 after act 4: {}", d.narrative);

    // ── ACT 6: bam_memory_enough — reach the Hollow ──────────────────────
    engine.process_command("talk sister_adra");
    let accept5 = engine.process_command("accept bam_memory_enough");
    assert!(accept5.success, "accept bam_memory_enough: {}", accept5.narrative);

    engine.process_command("dev goto abomination_lair");

    engine.process_command("dev goto field_hospital");
    let turnin5 = engine.process_command("turn in bam_memory_enough");
    assert!(turnin5.success, "turn in bam_memory_enough: {}", turnin5.narrative);

    let d = engine.process_command("examine diary");
    assert!(d.narrative.contains("last page"), "final player entry after chain complete: {}", d.narrative);
    assert!(d.narrative.contains("That's the whole plan"), "closing line after chain complete: {}", d.narrative);

    // Verify all 5 entries and 5 player entries are now present
    assert!(d.narrative.contains("Day 12"),                           "entry 1 present at end");
    assert!(d.narrative.contains("year two"),                         "entry 2 present at end");
    assert!(d.narrative.contains("ground changed color"),             "entry 3 present at end");
    assert!(d.narrative.contains("Something happened in the ruins"),  "entry 4 present at end");
    assert!(d.narrative.contains("what's left of me that isn't this war"), "entry 5 present at end");
}

#[test]
fn look_output_has_entity_links() {
    // Verify that room descriptions emit [[display|command]] inline links
    // for NPCs, items, and exits — this is what the frontend parses for clickable spans.
    let mut engine = new_game();
    let look = engine.process_command("look");
    assert!(
        look.narrative.contains("[["),
        "look output should contain [[ entity links; got: {}",
        &look.narrative[..look.narrative.len().min(400)]
    );
    assert!(
        look.narrative.contains("go "),
        "look output should contain exit link commands; got: {}",
        &look.narrative[..look.narrative.len().min(400)]
    );
}
