#!/usr/bin/env node
/**
 * Generates 25×15 charge-number templates for charges 1–49.
 *
 * Source: the 27×27 buff screenshots in src/attuner-buffs/.
 * The charge number is rendered in white text at the bottom of the icon,
 * occupying rows 12–26 of the icon image (cols 0–24).
 *
 * For each charge level, all screenshots for that charge (across all runes) are
 * combined: a pixel becomes white in the template if R>190 && G>190 && B>190 in
 * the majority (>50%) of the source images.  This removes rune-specific background
 * bleed while keeping the white digit strokes.
 *
 * Output: src/charge-templates/{N}.data.png  (25×15, RGBA, white digit / transparent bg)
 */

"use strict";

const sharp = require("sharp");
const fs    = require("fs");
const path  = require("path");

const SRC_DIR         = path.resolve(__dirname, "../src/attuner-buffs");
const OUT_DIR         = path.resolve(__dirname, "../src/charge-templates");
const ICON_W          = 27;
const CHARGE_ROW0     = 12;   // first icon row containing charge-number pixels
const TMPL_W          = 25;
const TMPL_H          = 15;   // rows 12–26 → 15 rows
const WHITE_THRESHOLD  = 190;  // R, G, B all above this → digit pixel
const SHADOW_THRESHOLD = 80;   // R, G, B all below this → shadow pixel
const DIGIT_COL0 = 2;          // leftmost column digits ever occupy (measured from templates)
const DIGIT_COL1 = 14;         // rightmost column digits ever occupy

// Pixels that are bright in ≥ this fraction of a rune's screenshots across all charges
// are treated as rune-art background, not digit pixels.
const BG_VOTE_THRESH  = 0.70;
const MIN_IMGS_FOR_BG = 4;   // need at least this many shots of a rune to build a mask

async function main() {
    fs.mkdirSync(OUT_DIR, { recursive: true });

    const files = fs.readdirSync(SRC_DIR).filter(f => f.endsWith(".png"));

    // Group by charge (for building templates) and by rune (for background masks).
    const byCharge = {};
    const byRune   = {};
    for (const f of files) {
        const parts  = f.split("_");
        const rune   = parts[0];
        const charge = parseInt(parts[1], 10);
        if (charge >= 1 && charge <= 49) {
            (byCharge[charge] ??= []).push(path.join(SRC_DIR, f));
            (byRune[rune]     ??= []).push(path.join(SRC_DIR, f));
        }
    }

    // Build per-rune background masks: pixels that are always bright on a rune
    // regardless of which digit is shown are rune-art artefacts, not digit pixels.
    // Only built for runes with enough screenshots to be reliable.
    const runeBgMasks = {};
    for (const [rune, paths] of Object.entries(byRune)) {
        if (paths.length < MIN_IMGS_FOR_BG) continue;
        const buffers = await Promise.all(paths.map(p => sharp(p).raw().ensureAlpha().toBuffer()));
        const hitCount = new Int32Array(TMPL_W * TMPL_H);
        for (const buf of buffers) {
            for (let r = 0; r < TMPL_H; r++) {
                for (let c = DIGIT_COL0; c <= DIGIT_COL1; c++) {
                    const si = ((CHARGE_ROW0 + r) * ICON_W + c) * 4;
                    if (buf[si] > WHITE_THRESHOLD && buf[si+1] > WHITE_THRESHOLD && buf[si+2] > WHITE_THRESHOLD) {
                        hitCount[r * TMPL_W + c]++;
                    }
                }
            }
        }
        const mask = new Uint8Array(TMPL_W * TMPL_H);
        let bgPixels = 0;
        for (let i = 0; i < TMPL_W * TMPL_H; i++) {
            if (hitCount[i] / buffers.length >= BG_VOTE_THRESH) { mask[i] = 1; bgPixels++; }
        }
        runeBgMasks[rune] = mask;
        console.log(`  BG mask: ${rune.padEnd(8)} — ${bgPixels} background pixels from ${paths.length} images`);
    }
    console.log();

    for (let charge = 1; charge <= 49; charge++) {
        const paths = byCharge[charge];
        if (!paths || paths.length === 0) {
            console.warn(`  charge ${charge}: no screenshots — skipping`);
            continue;
        }

        const buffers = await Promise.all(
            paths.map(p => sharp(p).raw().ensureAlpha().toBuffer())
        );

        // If every screenshot for this charge comes from the same rune, apply that
        // rune's background mask to strip art-bleed pixels from the template.
        const runesHere = new Set(paths.map(p => path.basename(p).split("_")[0]));
        const singleRune = runesHere.size === 1 ? [...runesHere][0] : null;
        const bgMask = singleRune ? (runeBgMasks[singleRune] ?? null) : null;

        // Accumulate how many images have a white pixel at each position.
        const hitCount = new Int32Array(TMPL_W * TMPL_H);
        for (const buf of buffers) {
            for (let r = 0; r < TMPL_H; r++) {
                for (let c = DIGIT_COL0; c <= DIGIT_COL1; c++) {
                    const si = ((CHARGE_ROW0 + r) * ICON_W + c) * 4;
                    if (
                        buf[si]     > WHITE_THRESHOLD &&
                        buf[si + 1] > WHITE_THRESHOLD &&
                        buf[si + 2] > WHITE_THRESHOLD
                    ) {
                        hitCount[r * TMPL_W + c]++;
                    }
                }
            }
        }

        // Majority vote: pixel is white in template if >50% of images agreed,
        // unless it is flagged as background art for the sole rune in this batch.
        const out = Buffer.alloc(TMPL_W * TMPL_H * 4, 0);
        const whiteMask = new Uint8Array(TMPL_W * TMPL_H);
        let whitePixels = 0;
        for (let i = 0; i < TMPL_W * TMPL_H; i++) {
            if (bgMask && bgMask[i]) continue; // rune-art background — skip
            if (hitCount[i] / buffers.length > 0.5) {
                out[i * 4]     = 255;
                out[i * 4 + 1] = 255;
                out[i * 4 + 2] = 255;
                out[i * 4 + 3] = 255;   // alpha=255 → bright digit pixel
                whiteMask[i]   = 1;
                whitePixels++;
            }
            // else: alpha=0 → transparent; matching code skips transparent pixels
        }

        // Shadow pixels: dark pixels (R/G/B < SHADOW_THRESHOLD) in the 1-pixel
        // neighbourhood of white pixels, via majority vote across screenshots.
        // Encoded as alpha=128 so the matcher can treat them separately.
        const dilated = new Uint8Array(TMPL_W * TMPL_H);
        for (let r = 0; r < TMPL_H; r++) {
            for (let c = DIGIT_COL0; c <= DIGIT_COL1; c++) {
                if (!whiteMask[r * TMPL_W + c]) continue;
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        const nr = r + dr, nc = c + dc;
                        if (nr >= 0 && nr < TMPL_H && nc >= DIGIT_COL0 && nc <= DIGIT_COL1)
                            dilated[nr * TMPL_W + nc] = 1;
                    }
                }
            }
        }
        const shadowHit = new Int32Array(TMPL_W * TMPL_H);
        for (const buf of buffers) {
            for (let r = 0; r < TMPL_H; r++) {
                for (let c = DIGIT_COL0; c <= DIGIT_COL1; c++) {
                    const i = r * TMPL_W + c;
                    if (!dilated[i] || whiteMask[i]) continue; // only shadow candidates
                    if (bgMask && bgMask[i]) continue;
                    const si = ((CHARGE_ROW0 + r) * ICON_W + c) * 4;
                    if (buf[si] < SHADOW_THRESHOLD && buf[si+1] < SHADOW_THRESHOLD && buf[si+2] < SHADOW_THRESHOLD)
                        shadowHit[i]++;
                }
            }
        }
        let shadowPixels = 0;
        for (let i = 0; i < TMPL_W * TMPL_H; i++) {
            if (dilated[i] && !whiteMask[i] && shadowHit[i] / buffers.length > 0.5) {
                out[i * 4]     = 0;
                out[i * 4 + 1] = 0;
                out[i * 4 + 2] = 0;
                out[i * 4 + 3] = 128;   // alpha=128 → shadow pixel
                shadowPixels++;
            }
        }

        const outPath = path.join(OUT_DIR, `${charge}.data.png`);
        await sharp(out, { raw: { width: TMPL_W, height: TMPL_H, channels: 4 } })
            .png()
            .toFile(outPath);

        const maskNote = bgMask ? ` [bg-masked: ${singleRune}]` : "";
        console.log(`  charge ${String(charge).padStart(2)}: ${String(buffers.length).padStart(2)} image(s), ${String(whitePixels).padStart(3)} white + ${String(shadowPixels).padStart(3)} shadow → ${charge}.data.png${maskNote}`);
    }

    console.log(`\nDone — templates written to ${path.relative(process.cwd(), OUT_DIR)}`);
}

main().catch(e => { console.error(e); process.exit(1); });
