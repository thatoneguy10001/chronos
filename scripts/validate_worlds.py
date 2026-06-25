#!/usr/bin/env python3
"""
Validate all world JSON files — two phases:

  Phase 1 — Schema validation
    Every JSON file must parse and conform to its schema.

  Phase 2 — Static analysis
    Cross-reference integrity: every ID used anywhere must exist in the world.
    Room reachability: every room must be reachable from the start room.
    Quest DAG: requires_quest_complete chains must be acyclic and fully resolvable.

Usage:  python scripts/validate_worlds.py
Requires: jsonschema  (pip install jsonschema)
"""

import json
import sys
from collections import defaultdict, deque
from pathlib import Path

try:
    import jsonschema
except ImportError:
    print("ERROR: jsonschema not installed. Run: pip install jsonschema", file=sys.stderr)
    sys.exit(1)

ROOT        = Path(__file__).parent.parent
SCHEMAS_DIR = ROOT / "data" / "schemas"
WORLDS_DIR  = ROOT / "worlds"

SCHEMA_FILES = {
    "manifest": SCHEMAS_DIR / "world_manifest.schema.json",
    "rooms":    SCHEMAS_DIR / "room_template.schema.json",
    "items":    SCHEMAS_DIR / "item_template.schema.json",
    "classes":  SCHEMAS_DIR / "class_template.schema.json",
    "npcs":     SCHEMAS_DIR / "npc_template.schema.json",
    "quests":   SCHEMAS_DIR / "quest_template.schema.json",
    "passives": SCHEMAS_DIR / "passive_template.schema.json",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_json(path: Path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)

def load_schema(path: Path) -> dict:
    return load_json(path)

def load_dir(world_dir: Path, subdir: str) -> dict:
    """Load all *.json files in world_dir/subdir. Returns {id: data}."""
    result = {}
    d = world_dir / subdir
    if not d.is_dir():
        return result
    for f in sorted(d.glob("*.json")):
        try:
            data = load_json(f)
            if isinstance(data, dict) and "id" in data:
                result[data["id"]] = data
        except (json.JSONDecodeError, UnicodeDecodeError):
            pass  # parse errors are caught in phase 1
    return result


# ---------------------------------------------------------------------------
# Phase 1 — Schema validation
# ---------------------------------------------------------------------------

def validate_file(json_path: Path, schema: dict, validator_cls) -> list[str]:
    errors = []
    try:
        data = load_json(json_path)
    except json.JSONDecodeError as e:
        return [f"JSON parse error: {e}"]
    except UnicodeDecodeError as e:
        return [f"Encoding error (check for BOM or non-UTF-8): {e}"]

    for err in sorted(validator_cls(schema).iter_errors(data), key=lambda e: list(e.path)):
        loc = " > ".join(str(p) for p in err.absolute_path) or "(root)"
        errors.append(f"{loc}: {err.message}")
    return errors


def phase1_schema(world_dir: Path, schemas: dict, validator_cls) -> tuple[int, int]:
    """Returns (files_checked, error_count)."""
    total_files = 0
    total_errors = 0

    manifest_path = world_dir / "manifest.json"
    if manifest_path.exists() and "manifest" in schemas:
        total_files += 1
        errs = validate_file(manifest_path, schemas["manifest"], validator_cls)
        if errs:
            total_errors += len(errs)
            print(f"  FAIL  manifest.json")
            for e in errs:
                print(f"        {e}")
        else:
            print(f"  ok    manifest.json")

    for subdir, schema_key in [("rooms","rooms"),("items","items"),
                                ("classes","classes"),("npcs","npcs"),("quests","quests"),
                                ("passives","passives")]:
        d = world_dir / subdir
        if not d.is_dir() or schema_key not in schemas:
            continue
        schema = schemas[schema_key]
        files = sorted(d.glob("*.json"))
        dir_errors = 0
        for f in files:
            total_files += 1
            errs = validate_file(f, schema, validator_cls)
            if errs:
                dir_errors += len(errs)
                total_errors += len(errs)
                print(f"  FAIL  {subdir}/{f.name}")
                for e in errs:
                    print(f"        {e}")
        if not dir_errors:
            print(f"  ok    {subdir}/ ({len(files)} files)")

    return total_files, total_errors


# ---------------------------------------------------------------------------
# Phase 2 — Static analysis
# ---------------------------------------------------------------------------

def phase2_static(world_dir: Path) -> int:
    """Returns error count."""

    manifest_path = world_dir / "manifest.json"
    try:
        manifest = load_json(manifest_path) if manifest_path.exists() else {}
    except (json.JSONDecodeError, UnicodeDecodeError):
        return 0  # already reported in phase 1

    rooms    = load_dir(world_dir, "rooms")
    items    = load_dir(world_dir, "items")
    classes  = load_dir(world_dir, "classes")
    npcs     = load_dir(world_dir, "npcs")
    quests   = load_dir(world_dir, "quests")
    passives = load_dir(world_dir, "passives")

    errors: list[str] = []

    # --- Cross-reference integrity -------------------------------------------

    # manifest → rooms / classes / npcs
    start_room = manifest.get("start_room_id")
    if start_room and start_room not in rooms:
        errors.append(f"[manifest] start_room_id '{start_room}' not found in rooms/")

    for enc in manifest.get("encounters", []):
        if enc.get("class_id") and enc["class_id"] not in classes:
            errors.append(f"[manifest] encounter class_id '{enc['class_id']}' not found in classes/")
        if enc.get("room_id") and enc["room_id"] not in rooms:
            errors.append(f"[manifest] encounter room_id '{enc['room_id']}' not found in rooms/")

    for placement in manifest.get("npc_placements", []):
        if placement.get("npc_id") and placement["npc_id"] not in npcs:
            errors.append(f"[manifest] npc_placement npc_id '{placement['npc_id']}' not found in npcs/")
        if placement.get("room_id") and placement["room_id"] not in rooms:
            errors.append(f"[manifest] npc_placement room_id '{placement['room_id']}' not found in rooms/")

    # classes → passives (every referenced passive id must have a definition)
    for class_id, klass in classes.items():
        for passive_id in klass.get("passives", []):
            if passive_id not in passives:
                errors.append(f"[classes/{class_id}] passive '{passive_id}' not found in passives/")
        # classes → items (every loot drop must reference a real item)
        for drop in klass.get("loot_table", []):
            item_id = drop.get("item_id")
            if item_id and item_id not in items:
                errors.append(f"[classes/{class_id}] loot item '{item_id}' not found in items/")

    # rooms → rooms (exits)
    for room_id, room in rooms.items():
        for direction, exit_def in room.get("exits", {}).items():
            target = exit_def.get("target_room_id")
            if target and target not in rooms:
                errors.append(f"[rooms/{room_id}] exit '{direction}' → '{target}' not found in rooms/")

    # npcs → quests / items (shops)
    for npc_id, npc in npcs.items():
        for line in npc.get("dialogue", []):
            req = line.get("requires_quest_complete")
            if req and req not in quests:
                errors.append(f"[npcs/{npc_id}] dialogue keyword '{line.get('keyword')}': requires_quest_complete '{req}' not found in quests/")
        for entry in npc.get("shop", []):
            item_id = entry.get("item_id")
            if item_id and item_id not in items:
                errors.append(f"[npcs/{npc_id}] shop item_id '{item_id}' not found in items/")

    # quests → npcs / rooms / classes / quests
    for quest_id, quest in quests.items():
        giver = quest.get("giver_npc_id")
        if giver and giver not in npcs:
            errors.append(f"[quests/{quest_id}] giver_npc_id '{giver}' not found in npcs/")

        req = quest.get("requires_quest_complete")
        if req and req not in quests:
            errors.append(f"[quests/{quest_id}] requires_quest_complete '{req}' not found in quests/")

        obj = quest.get("objective", {})
        obj_type = obj.get("type")
        if obj_type == "talk_to":
            npc_id = obj.get("npc_id")
            if npc_id and npc_id not in npcs:
                errors.append(f"[quests/{quest_id}] objective npc_id '{npc_id}' not found in npcs/")
        elif obj_type == "reach_room":
            room_id = obj.get("room_id")
            if room_id and room_id not in rooms:
                errors.append(f"[quests/{quest_id}] objective room_id '{room_id}' not found in rooms/")
        elif obj_type == "kill_count":
            class_id = obj.get("class_id")
            if class_id and class_id not in classes:
                errors.append(f"[quests/{quest_id}] objective class_id '{class_id}' not found in classes/")

    # --- Room reachability ---------------------------------------------------

    if start_room and start_room in rooms:
        reachable = set()
        queue = deque([start_room])
        while queue:
            current = queue.popleft()
            if current in reachable:
                continue
            reachable.add(current)
            for exit_def in rooms[current].get("exits", {}).values():
                target = exit_def.get("target_room_id")
                if target and target in rooms and target not in reachable:
                    queue.append(target)

        orphaned = sorted(set(rooms.keys()) - reachable)
        for room_id in orphaned:
            errors.append(f"[rooms/{room_id}] unreachable from start room '{start_room}'")
    elif not start_room:
        pass  # no manifest, skip
    # (if start_room not in rooms, already reported above)

    # --- Quest DAG (cycle detection) ----------------------------------------

    # Build adjacency: quest → [quests that depend on it]
    # For cycle detection we need the reverse: quest → its prerequisite
    prereqs: dict[str, str] = {}
    for quest_id, quest in quests.items():
        req = quest.get("requires_quest_complete")
        if req and req in quests:
            prereqs[quest_id] = req

    # DFS colour: 0=white, 1=grey (in stack), 2=black (done)
    colour = defaultdict(int)

    def has_cycle(node: str, path: list) -> bool:
        colour[node] = 1
        path.append(node)
        dep = prereqs.get(node)
        if dep:
            if colour[dep] == 1:
                cycle_str = " -> ".join(path + [dep])
                errors.append(f"[quests] cycle detected: {cycle_str}")
                return True
            if colour[dep] == 0:
                if has_cycle(dep, path):
                    return True
        path.pop()
        colour[node] = 2
        return False

    for quest_id in quests:
        if colour[quest_id] == 0:
            has_cycle(quest_id, [])

    # --- Report --------------------------------------------------------------

    if errors:
        print(f"  -- Static analysis --")
        for e in errors:
            print(f"  FAIL  {e}")
    else:
        xref_count = (len(rooms) + len(npcs) + len(quests) +
                      len(manifest.get("encounters", [])) +
                      len(manifest.get("npc_placements", [])))
        print(f"  ok    static analysis ({xref_count} cross-references, "
              f"{len(rooms)} rooms reachable, {len(quests)} quests in DAG)")

    return len(errors)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    schemas = {}
    for key, path in SCHEMA_FILES.items():
        if not path.exists():
            print(f"WARNING: schema not found, skipping {key}: {path}", file=sys.stderr)
            continue
        schemas[key] = load_schema(path)

    validator_cls = jsonschema.Draft7Validator

    total_files = 0
    schema_errors = 0
    static_errors = 0

    worlds = sorted(p for p in WORLDS_DIR.iterdir() if p.is_dir())
    if not worlds:
        print("No worlds found -- nothing to validate.")
        return 0

    for world_dir in worlds:
        print(f"\n-- {world_dir.name} --")
        files, errs = phase1_schema(world_dir, schemas, validator_cls)
        total_files += files
        schema_errors += errs
        static_errors += phase2_static(world_dir)

    total_errors = schema_errors + static_errors
    print(f"\n{'-'*50}")
    if total_errors:
        print(f"FAILED -- {schema_errors} schema error(s), "
              f"{static_errors} static analysis error(s), "
              f"{total_files} files checked.")
        return 1
    else:
        print(f"All {total_files} file(s) valid. Static analysis clean.")
        return 0


if __name__ == "__main__":
    sys.exit(main())
