#!/usr/bin/env python3
"""
Validate all world JSON files against their schemas.
Fails with a non-zero exit code if any file fails to parse or validate.

Usage: python scripts/validate_worlds.py
Requires: jsonschema  (pip install jsonschema)
"""

import json
import sys
from pathlib import Path

try:
    import jsonschema
except ImportError:
    print("ERROR: jsonschema is not installed. Run: pip install jsonschema", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).parent.parent
SCHEMAS_DIR = ROOT / "data" / "schemas"
WORLDS_DIR = ROOT / "worlds"

SCHEMA_FILES = {
    "manifest":  SCHEMAS_DIR / "world_manifest.schema.json",
    "rooms":     SCHEMAS_DIR / "room_template.schema.json",
    "items":     SCHEMAS_DIR / "item_template.schema.json",
    "classes":   SCHEMAS_DIR / "class_template.schema.json",
    "npcs":      SCHEMAS_DIR / "npc_template.schema.json",
    "quests":    SCHEMAS_DIR / "quest_template.schema.json",
}

MANIFEST_FILENAME = "manifest.json"


def load_schema(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def validate_file(json_path: Path, schema: dict, validator_cls) -> list[str]:
    errors = []
    try:
        with open(json_path, encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        errors.append(f"JSON parse error: {e}")
        return errors
    except UnicodeDecodeError as e:
        errors.append(f"Encoding error (check for BOM or non-UTF-8): {e}")
        return errors

    v = validator_cls(schema)
    for err in sorted(v.iter_errors(data), key=lambda e: list(e.path)):
        path = " > ".join(str(p) for p in err.absolute_path) or "(root)"
        errors.append(f"{path}: {err.message}")
    return errors


def main() -> int:
    schemas = {}
    for key, path in SCHEMA_FILES.items():
        if not path.exists():
            print(f"WARNING: schema not found, skipping {key}: {path}", file=sys.stderr)
            continue
        schemas[key] = load_schema(path)

    validator_cls = jsonschema.Draft7Validator

    total_files = 0
    total_errors = 0

    worlds = sorted(WORLDS_DIR.iterdir())
    if not worlds:
        print("No worlds found — nothing to validate.")
        return 0

    for world_dir in worlds:
        if not world_dir.is_dir():
            continue
        world_name = world_dir.name
        print(f"\n-- {world_name} --")

        # manifest.json
        manifest_path = world_dir / MANIFEST_FILENAME
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

        # per-category subdirectories
        category_map = {
            "rooms":   "rooms",
            "items":   "items",
            "classes": "classes",
            "npcs":    "npcs",
            "quests":  "quests",
        }
        for subdir_name, schema_key in category_map.items():
            subdir = world_dir / subdir_name
            if not subdir.is_dir():
                continue
            if schema_key not in schemas:
                continue
            schema = schemas[schema_key]
            files = sorted(subdir.glob("*.json"))
            dir_errors = 0
            for f in files:
                total_files += 1
                errs = validate_file(f, schema, validator_cls)
                if errs:
                    dir_errors += len(errs)
                    total_errors += len(errs)
                    print(f"  FAIL  {subdir_name}/{f.name}")
                    for e in errs:
                        print(f"        {e}")
            if not dir_errors:
                print(f"  ok    {subdir_name}/ ({len(files)} files)")

    print(f"\n{'-'*50}")
    if total_errors:
        print(f"FAILED — {total_errors} error(s) across {total_files} file(s).")
        return 1
    else:
        print(f"All {total_files} file(s) valid.")
        return 0


if __name__ == "__main__":
    sys.exit(main())
