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
 * Rune art masking: for runes that have charge-0 screenshots ({Rune}_0_*.png),
 * a per-rune art mask is built from those images (pixels bright in ≥50% of charge-0
 * images are rune art).  That mask is subtracted from all charge-N screenshots of that
 * rune before contributing to the majority vote, keeping only the digit pixels.
 * Masks are also saved to src/charge-templates/{RuneName}.mask.data.png for use
 * during live charge reading in index.ts.
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
const ART_MASK_THRESH  = 0.50; // fraction of charge-0 images where a pixel must be bright to be masked
const ALL_MASK_THRESH  = 0.90; // for runes without charge-0 images: fraction of ALL screenshots
const ALL_MASK_MIN_IMG = 8;    // minimum screenshots required to build an all-images mask
const DIGIT_COL0 = 2;          // leftmost column digits ever occupy
const DIGIT_COL1 = 14;         // rightmost column digits ever occupy

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
        if (charge >= 0 && charge <= 49) {
            if (charge >= 1) (byCharge[charge] ??= []).push(path.join(SRC_DIR, f));
            (byRune[rune] ??= []).push(path.join(SRC_DIR, f));
        }
    }

    // ── Build per-rune art masks from charge-0 screenshots ────────────────────
    // Charge-0 = buff icon with no digit overlay, so every bright pixel is rune art.
    // Only runes where rune art is bright (passes the R/G/B > 190 threshold) need a
    // mask; runes with coloured (non-white) art produce an empty mask automatically.
    const runeArtMasks = {}; // rune → Uint8Array(TMPL_W * TMPL_H); applied at gen time + saved for runtime
    const runeNames = Object.keys(byRune).sort();
    for (const rune of runeNames) {
        const charge0Paths = (byRune[rune] ?? []).filter(p => path.basename(p).split("_")[1] === "0");
        if (charge0Paths.length === 0) continue;

        const buffers = await Promise.all(charge0Paths.map(p => sharp(p).raw().ensureAlpha().toBuffer()));
        const hitCount = new Int32Array(TMPL_W * TMPL_H);
        for (const buf of buffers) {
            for (let r = 0; r < TMPL_H; r++) {
                for (let c = 0; c < TMPL_W; c++) {
                    const si = ((CHARGE_ROW0 + r) * ICON_W + c) * 4;
                    if (buf[si] > WHITE_THRESHOLD && buf[si+1] > WHITE_THRESHOLD && buf[si+2] > WHITE_THRESHOLD)
                        hitCount[r * TMPL_W + c]++;
                }
            }
        }
        const mask = new Uint8Array(TMPL_W * TMPL_H);
        let maskedPixels = 0;
        for (let i = 0; i < TMPL_W * TMPL_H; i++) {
            if (hitCount[i] / buffers.length >= ART_MASK_THRESH) { mask[i] = 1; maskedPixels++; }
        }
        runeArtMasks[rune] = mask;
        console.log(`  Art mask: ${rune.padEnd(8)} — ${maskedPixels} pixels from ${charge0Paths.length} charge-0 image(s)`);

        // Save mask for runtime use in index.ts
        const maskOut = Buffer.alloc(TMPL_W * TMPL_H * 4, 0);
        for (let i = 0; i < TMPL_W * TMPL_H; i++) {
            if (mask[i]) { maskOut[i*4] = maskOut[i*4+1] = maskOut[i*4+2] = 255; maskOut[i*4+3] = 255; }
        }
        await sharp(maskOut, { raw: { width: TMPL_W, height: TMPL_H, channels: 4 } })
            .png()
            .toFile(path.join(OUT_DIR, `${rune}.mask.data.png`));
    }

    // ── Fallback: all-images masks for runes without charge-0 screenshots ────
    // Pixels bright in ≥ ALL_MASK_THRESH of ALL screenshots are rune art (digits
    // appear in at most ~60% of a diverse screenshot set, well below the threshold).
    // Applied both at template generation time AND saved for runtime readCharge() use.
    for (const rune of runeNames) {
        if (runeArtMasks[rune]) continue; // already have a charge-0 mask
        const allPaths = (byRune[rune] ?? []).filter(p => path.basename(p).split("_")[1] !== "0");
        if (allPaths.length < ALL_MASK_MIN_IMG) continue;

        const buffers  = await Promise.all(allPaths.map(p => sharp(p).raw().ensureAlpha().toBuffer()));
        const hitCount = new Int32Array(TMPL_W * TMPL_H);
        for (const buf of buffers) {
            for (let r = 0; r < TMPL_H; r++) {
                for (let c = 0; c < TMPL_W; c++) {
                    const si = ((CHARGE_ROW0 + r) * ICON_W + c) * 4;
                    if (buf[si] > WHITE_THRESHOLD && buf[si+1] > WHITE_THRESHOLD && buf[si+2] > WHITE_THRESHOLD)
                        hitCount[r * TMPL_W + c]++;
                }
            }
        }
        const mask = new Uint8Array(TMPL_W * TMPL_H);
        let maskedPixels = 0;
        for (let i = 0; i < TMPL_W * TMPL_H; i++) {
            if (hitCount[i] / buffers.length >= ALL_MASK_THRESH) { mask[i] = 1; maskedPixels++; }
        }
        if (maskedPixels === 0) continue; // no persistent art detected

        runeArtMasks[rune] = mask;
        console.log(`  All-img mask: ${rune.padEnd(8)} — ${maskedPixels} pixels from ${allPaths.length} images (≥${(ALL_MASK_THRESH*100).toFixed(0)}% threshold)`);

        const maskOut = Buffer.alloc(TMPL_W * TMPL_H * 4, 0);
        for (let i = 0; i < TMPL_W * TMPL_H; i++) {
            if (mask[i]) { maskOut[i*4] = maskOut[i*4+1] = maskOut[i*4+2] = 255; maskOut[i*4+3] = 255; }
        }
        await sharp(maskOut, { raw: { width: TMPL_W, height: TMPL_H, channels: 4 } })
            .png()
            .toFile(path.join(OUT_DIR, `${rune}.mask.data.png`));
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

        // Map each path to its source rune for mask lookup
        const pathRunes = paths.map(p => path.basename(p).split("_")[0]);

        // Accumulate how many images have a white pixel at each position,
        // subtracting any rune art pixels for the source rune.
        // Only consider the digit column range to avoid rune art outside the digit area.
        const hitCount = new Int32Array(TMPL_W * TMPL_H);
        for (let bi = 0; bi < buffers.length; bi++) {
            const buf  = buffers[bi];
            const mask = runeArtMasks[pathRunes[bi]] ?? null;
            for (let r = 0; r < TMPL_H; r++) {
                for (let c = DIGIT_COL0; c <= DIGIT_COL1; c++) {
                    const i  = r * TMPL_W + c;
                    if (mask && mask[i]) continue; // pixel is rune art — skip
                    const si = ((CHARGE_ROW0 + r) * ICON_W + c) * 4;
                    if (
                        buf[si]     > WHITE_THRESHOLD &&
                        buf[si + 1] > WHITE_THRESHOLD &&
                        buf[si + 2] > WHITE_THRESHOLD
                    ) {
                        hitCount[i]++;
                    }
                }
            }
        }

        // Majority vote: pixel is white in template if >50% of images agreed.
        const out = Buffer.alloc(TMPL_W * TMPL_H * 4, 0);
        const whiteMask = new Uint8Array(TMPL_W * TMPL_H);
        let whitePixels = 0;
        for (let i = 0; i < TMPL_W * TMPL_H; i++) {
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
        for (let bi = 0; bi < buffers.length; bi++) {
            const buf  = buffers[bi];
            const mask = runeArtMasks[pathRunes[bi]] ?? null;
            for (let r = 0; r < TMPL_H; r++) {
                for (let c = DIGIT_COL0; c <= DIGIT_COL1; c++) {
                    const i = r * TMPL_W + c;
                    if (!dilated[i] || whiteMask[i]) continue;
                    if (mask && mask[i]) continue;
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

        const runesHere = [...new Set(pathRunes)].sort().join("+");
        const masked = pathRunes.filter(r => runeArtMasks[r]).length;
        const maskNote = masked > 0 ? ` [${masked}/${buffers.length} masked]` : "";
        console.log(`  charge ${String(charge).padStart(2)}: ${String(buffers.length).padStart(2)} image(s), ${String(whitePixels).padStart(3)} white + ${String(shadowPixels).padStart(3)} shadow → ${charge}.data.png  [${runesHere}]${maskNote}`);
    }

    // ── Full rune-art masks (25×25) ──────────────────────────────────────────
    // Composite: copy the existing 25×25 rune template (stable colored pixels
    // outside the digit rectangle) then fill the transparent digit rectangle
    // (rows 13–24, cols 2–14) with mean pixel values from charge-0 images.
    // If no charge-0 images exist for a rune, fall back to all-image means.
    // Output: src/charge-templates/{Rune}.fullmask.data.png
    const TMPL_SRC_DIR     = path.resolve(__dirname, "../src/templates");
    const FULL_DIGIT_ROW0  = 13;   // first template row of the digit rectangle
    const FULL_DIGIT_COL0  = 2;    // leftmost template col
    const FULL_DIGIT_COL1  = 14;   // rightmost template col
    const FULL_W = 25, FULL_H = 25;

    console.log("\nGenerating full rune-art masks (25×25)...");
    const allRunes = Object.keys(byRune)
        .filter(r => fs.existsSync(path.join(TMPL_SRC_DIR, `${r}.data.png`)))
        .sort();

    for (const rune of allRunes) {
        const tmplPath = path.join(TMPL_SRC_DIR, `${rune}.data.png`);
        const tmplBuf  = await sharp(tmplPath).raw().ensureAlpha().toBuffer();
        const out      = Buffer.from(tmplBuf); // mutable copy of template

        // Choose fill source: charge-0 images preferred, else all images
        const charge0Paths = (byRune[rune] ?? []).filter(p => path.basename(p).split("_")[1] === "0");
        const fillPaths    = charge0Paths.length > 0
            ? charge0Paths
            : (byRune[rune] ?? []);

        if (fillPaths.length > 0) {
            const buffers = await Promise.all(fillPaths.map(p => sharp(p).raw().ensureAlpha().toBuffer()));
            for (let r = FULL_DIGIT_ROW0; r < FULL_H; r++) {
                for (let c = FULL_DIGIT_COL0; c <= FULL_DIGIT_COL1; c++) {
                    const dstOff = (r * FULL_W + c) * 4;
                    if (out[dstOff + 3] !== 0) continue; // already opaque — keep template pixel
                    // Icon position: template[r][c] → icon[r+1][c+1]
                    const iconRow = r + 1, iconCol = c + 1;
                    let sumR = 0, sumG = 0, sumB = 0;
                    for (const buf of buffers) {
                        const si = (iconRow * ICON_W + iconCol) * 4;
                        sumR += buf[si]; sumG += buf[si + 1]; sumB += buf[si + 2];
                    }
                    out[dstOff]     = Math.round(sumR / buffers.length);
                    out[dstOff + 1] = Math.round(sumG / buffers.length);
                    out[dstOff + 2] = Math.round(sumB / buffers.length);
                    out[dstOff + 3] = 255;
                }
            }
        }

        const outPath = path.join(OUT_DIR, `${rune}.fullmask.data.png`);
        await sharp(out, { raw: { width: FULL_W, height: FULL_H, channels: 4 } }).png().toFile(outPath);
        const src = charge0Paths.length > 0 ? `${charge0Paths.length} charge-0` : `${fillPaths.length} all-img`;
        console.log(`  Full mask: ${rune.padEnd(8)} — digit rect filled from ${src} image(s)`);
    }

    console.log(`\nDone — templates written to ${path.relative(process.cwd(), OUT_DIR)}`);
}

main().catch(e => { console.error(e); process.exit(1); });
