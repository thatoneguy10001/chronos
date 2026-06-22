# Chronos

A text adventure engine built on Rust + WebAssembly, with a React terminal UI.

**[Play Iron & Blood →](https://thatoneguy10001.github.io/chronos/)**

[![CI](https://github.com/thatoneguy10001/chronos/actions/workflows/ci.yml/badge.svg)](https://github.com/thatoneguy10001/chronos/actions/workflows/ci.yml)

---

## What it is

Chronos is a moddable text RPG engine where the game logic runs entirely in the browser via WebAssembly — no server required to play. Worlds are defined in JSON, the engine is written in Rust (compiled to WASM), and the UI is React.

**Iron & Blood** is the first world: a dieselpunk war setting with factions, NPCs, branching quests, a day/night cycle, and a full main questline.

---

## Architecture

```
engine/
  chronos-core/     — game logic: rooms, combat, quests, NPCs, abilities
  chronos-wasm/     — wasm-bindgen bindings (runs in the browser)
  chronos-server/   — optional WebSocket dev server (axum) for faster iteration
ui/
  src/bridge/       — engine-wasm.ts (production) / engine-ws.ts (dev WS)
  src/store/        — zustand game state
  src/components/   — React terminal UI
worlds/
  iron-and-blood/   — rooms, NPCs, quests, items, classes, lore
```

In production the WASM bridge bundles all world data at build time via `import.meta.glob` — no network requests needed. In dev you can run the Rust server over WebSocket for faster rebuild cycles.

---

## Running locally

**Prerequisites:** Rust, wasm-pack, Node 22+

```bash
# One-time WASM build
cd ui && npm run build:wasm

# Dev server (UI hot-reload + Rust server over WebSocket)
cd ui && npm run dev

# Or production preview (fully WASM, no server)
cd ui && npm run build && npm run preview
```

---

## Testing

```bash
# Rust unit tests
cd engine && cargo test

# Vitest unit tests (store, WASM bridge)
cd ui && npm test

# Playwright E2E (requires a production build)
cd ui && npm run build && npm run e2e
```

CI runs all of the above on every PR via GitHub Actions.

---

## World format

Worlds live in `worlds/<id>/` as plain JSON files — rooms, NPCs, items, quests, classes. The engine loads them at init time. See `worlds/iron-and-blood/` for a complete example.

---

## Project status

Active development. One world (Iron & Blood) is complete and playable. Engine supports: movement, combat, quests, dialogue, save/load, day/night, abilities, inventory, and time-travel rewind.
