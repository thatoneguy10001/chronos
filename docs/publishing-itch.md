# Publishing to itch.io

Iron & Blood is a browser game, so itch.io hosts it as an **HTML5 project** that plays
embedded in the page. No upfront fee, no approval queue, no review — unlike Steam
Direct's $100 per title. Revenue share on itch is creator-set (you can set it to 0%).

Verified working 2026-08-13: the build below boots, loads the WASM engine, and plays
from relative paths with zero console errors.

## Build

```bash
cd ui && npm run build:itch
```

This differs from `npm run build` in exactly one way that matters: `--base=./`.

The normal build and the GitHub Pages deploy emit **absolute** asset paths
(`/chronos/assets/…`, set by `VITE_BASE` in `.github/workflows/deploy.yml`). itch serves
each game from a randomised subdirectory, so absolute paths 404 there. `--base=./`
makes every reference relative. Output goes to `ui/dist-itch/` so it never collides
with the Pages build in `ui/dist/`; both are gitignored.

If `src/wasm/` is missing or stale, run `npm run build:wasm` first.

## Check it locally before uploading

```bash
cd ui && npm run preview:itch
```

Open the URL it prints. If the engine loads and a class start puts you in Gate of Fort
Iron, the relative paths are correct.

## Package

itch requires `index.html` at the **root of the zip** — zip the *contents* of
`dist-itch/`, not the folder itself.

```bash
cd ui/dist-itch && powershell -c "Compress-Archive -Path * -DestinationPath ../iron-and-blood-itch.zip -Force"
```

Current payload: ~4.2 MB (1.6 MB of that is the WASM engine). Well inside itch's limits.

## Upload

On the itch project page:

1. **Kind of project** → HTML
2. Upload the zip, then tick **"This file will be played in the browser"**
3. **Embed options** → set a viewport around **1280×720**, enable fullscreen button
4. **Mobile friendly** → the UI has a mobile viewport fix and a UI scale knob, so this
   is worth enabling once tested on a phone
5. Pricing → free, or paid, or pay-what-you-want with a suggested price

## Load profile

`manualChunks` in `ui/vite.config.ts` groups world JSON into one chunk per
(world, category). Before that grouping the build emitted one chunk per quest, NPC and
room, so first load fired ~400 requests.

Measured on a full boot → world select → class select → first room:

| | Before | After |
|---|---|---|
| JS chunks in build | 400+ | **23** |
| Requests to reach the first room | ~400 | **17** |

Per-world laziness is intact: starting Iron & Blood fetches 7 chunks and pulls nothing
belonging to Millbrook. A world added later gets its own chunks with no config change.

This applies to both builds — `manualChunks` is not build-specific, so the GitHub Pages
deploy gets the same reduction.

The `world-iron-and-blood-npcs` chunk (576 KB raw / 186 KB gzipped) trips Vite's 500 KB
warning. That's expected and fine — `initEngine` needs every NPC in the world anyway,
so splitting it would only restore the request count it was grouped to remove.

## Known issues to weigh before launch

**Google Fonts is an external request.** `index.html` pulls Caveat, EB Garamond and
Special Elite from `fonts.googleapis.com`. Fine on itch, which allows external
requests. It would break in an offline downloadable build — self-host the fonts if you
ever ship a desktop version.

## Note on the two builds

`npm run build` / the Pages deploy are untouched by this. GitHub Pages keeps working
exactly as before, with `VITE_BASE=/chronos/` supplied by the workflow.
