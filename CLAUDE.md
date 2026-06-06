# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Related Repositories

- **`C:\dev\private\alt1`** — The Alt1 library itself. Contains the source and documentation for all screen-reading APIs (`alt1/base`, `alt1/buffs`, `alt1/ocr`, etc.), the `ImgRef` system, custom webpack loaders, and the `docs/` folder. Read this when you need to understand how any Alt1 API works or what arguments it accepts.
- **`C:\dev\private\job-gauges`** — A mature Alt1 plugin using the same stack. Use it as a reference implementation for patterns like buff reading, overlay rendering, Redux state, A1Sauce settings UI, and webpack/TypeScript configuration.

## Commands

```bash
npm run build     # prebuild (5 scripts) then webpack
npm run watch     # webpack watch mode (skips prebuild)
npm run serve     # serve dist/ at localhost:8080 for local testing
```

The `prebuild` step runs five scripts in sequence: `generate-icon.js`, `download-rune-images.js`, `generate-templates.js`, `generate-charge-templates.js`, `generate-combined-templates.js`. These only need to re-run if rune images or buff screenshots change; use `npm run watch` during normal development to skip them.

To test template accuracy:
```bash
node scripts/test-recognition.js                # rune identification (751 samples, 100%)
node scripts/test-recognition.js --verbose      # shows per-rune scores
node scripts/test-charge-detection.js           # charge reading accuracy
node scripts/test-combined-templates.js         # combined rune+charge template matching
```

## Architecture

A single-page Alt1 plugin that polls the player's buff bar to identify which rune the Runic Attuner is attuned to at each charge level, then builds a frequency table across 49 charge levels × 15 rune types.

All logic lives in **`src/index.ts`** (~1610 lines). There is no framework or state management library — state is a single `data: FrequencyData` object persisted to `localStorage` under key `"runic-attuner-v2"`.

### Rune Identification Pipeline

1. **Buff detection** — `BuffReaderModule` (from `alt1/buffs`) finds the Runic Attuner buff icon in the player's buff bar.
2. **Rune template matching** — `buff.countMatch(template)` compares the live 25×25 inner icon against pre-built `ImageData` templates in `src/templates/*.data.png`. Templates are generated from 751 actual in-game buff screenshots using per-pixel variance: pixels that vary across captures (background bleed or charge-number text) are set transparent so `countMatch` skips them. Accuracy against all 751 labelled samples: **100%**.
3. **Charge reading** — Two-stage approach:
   - **Combined templates** (`readCombined`): Tries to match 335 pre-built 25×25 templates in `src/combined-templates/` that encode both rune art *and* the digit overlay simultaneously. Each template is keyed `Rune_Charge` (e.g. `Death_13`). If score ≥ 0.80, this result is used.
   - **Digit template fallback** (`readCharge`): Binarises icon rows 12–26 (25×15 region) at R/G/B > 190 for digit pixels. A per-rune art mask (`src/charge-templates/{Rune}.mask.data.png`, built from charge-0 screenshots) suppresses rune art pixels that would otherwise inflate the white count. If fewer than 4 white pixels remain the charge is 0; otherwise the region is matched against 49 digit templates (`src/charge-templates/1.data.png` … `49.data.png`) using F1 of pixel precision and recall.
4. **Stability gate** — A `(rune, charge)` pair must hold for 3 consecutive polls before being recorded. A sequential-gap detector flags non-sequential charge transitions as uncertain and saves those frames for later labelling.
5. **Recording** — Confirmed readings are stored in `data.counts[charge][rune]` and persisted to `localStorage`. `saveBuffScreenshot()` POSTs the 27×27 icon to a local dev server (`serve.js`) for capture collection.

### Capture Conventions (`src/attuner-buffs/`)

Files are named `{Rune}_{charge}_{n}.png`, e.g. `Death_13_2.png`. Special case: **charge-0 files** (`Death_0_0.png`, etc.) show the icon with no digit overlay. `generate-charge-templates.js` uses them to build per-rune art masks — pixels bright in ≥ 50% of charge-0 images are treated as rune art and suppressed during live charge detection. After adding new charge-0 screenshots, re-run `generate-charge-templates.js` and `generate-combined-templates.js` before committing.

### Prebuild Scripts (`scripts/`)

| Script | Purpose |
|---|---|
| `generate-icon.js` | Procedurally generates `src/icon.png` (pure Node, no deps) |
| `download-rune-images.js` | Fetches 15 rune PNGs from the RS wiki into `src/rune-images/` |
| `generate-templates.js` | Reads `src/attuner-buffs/*.png`, computes per-pixel variance per rune, writes 25×25 `src/templates/*.data.png` (rune identification templates) |
| `generate-charge-templates.js` | Builds 49 digit templates (`src/charge-templates/{N}.data.png`, 25×15) from binarised screenshots, and 16 per-rune art masks (`{Rune}.mask.data.png`) from charge-0 captures |
| `generate-combined-templates.js` | Builds 335 combined rune+charge templates (`src/combined-templates/{Rune}_{charge}.data.png`, 25×25) from averaged screenshots with digit overlay intact |
| `test-recognition.js` | Validates rune identification against all 751 buff screenshots |
| `test-charge-detection.js` | Validates `readCharge()` digit-template logic against labelled screenshots |
| `test-combined-templates.js` | Validates combined template matching |
| `serve.js` | Dev server at `localhost:8080` — serves `dist/` and receives `POST /save-buff` to write captured icons to `src/attuner-buffs/` |
| `debug-server.js` | Minimal receiver at `localhost:8081` for raw debug payloads |

`src/templates/`, `src/charge-templates/`, and `src/combined-templates/` are all regenerated by the prebuild and committed. `src/attuner-buffs/` is the ground truth for all template quality.

### Build Output

Webpack bundles everything to `dist/main.js` (UMD, name `RunicAttuner`). The `appconfig.json` manifest declares `pixel` and `overlay` Alt1 permissions and a default window of 420×620px.
