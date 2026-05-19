#!/usr/bin/env node
/**
 * Generates 25×25 combined (rune+charge) templates for each (rune, charge) pair
 * that has at least one screenshot in src/attuner-buffs/.
 *
 * Unlike the rune-only templates (which blank the digit area), these include
 * the digit overlay so they can be used to simultaneously confirm the rune and
 * the charge level.
 *
 * Background exclusion strategy:
 * - A "round mask" is derived from the rune templates: for rows 0–12 the union of
 *   all rune template opaque pixels gives the true circle extent per row; rows 13–24
 *   are filled by mirroring the opposite row about the vertical centre (row 12).
 *   Every combined template pixel that falls outside this mask is forced transparent.
 * - ≥2 screenshots: per-pixel variance within the group additionally prunes unstable
 *   pixels inside the circle (background bleed from screen captures).
 * - 1 screenshot: rune template opacity identifies stable art pixels; the digit area
 *   (rows 13–24, cols 2–14) is always included so charge strokes are present.
 *
 * Output: src/combined-templates/{Rune}_{Charge}.data.png  (25×25 RGBA)
 */
"use strict";

const sharp = require("sharp");
const fs    = require("fs");
const path  = require("path");

const SRC_DIR    = path.resolve(__dirname, "../src/attuner-buffs");
const RUNE_TMPL  = path.resolve(__dirname, "../src/templates");
const OUT_DIR    = path.resolve(__dirname, "../src/combined-templates");
const ICON_W     = 27;
const TMPL_W     = 25;   // inner 25×25 (strip 1px green border each side)
const TMPL_H     = 25;
const VAR_THRESH = 225;  // std² < 15² → stable pixel (same as generate-templates.js)

// Digit rectangle in the 25×25 template (matches generate-templates.js).
const DIGIT_ROW0 = 13;
const DIGIT_COL0 = 2;
const DIGIT_COL1 = 14;

async function loadRaw(p) {
    return sharp(p).raw().ensureAlpha().toBuffer();
}

function pixelStats(bufs, si) {
    const n   = bufs.length;
    const Rs  = bufs.map(b => b[si]);
    const Gs  = bufs.map(b => b[si + 1]);
    const Bs  = bufs.map(b => b[si + 2]);
    const mR  = Rs.reduce((a, b) => a + b, 0) / n;
    const mG  = Gs.reduce((a, b) => a + b, 0) / n;
    const mB  = Bs.reduce((a, b) => a + b, 0) / n;
    const vR  = Rs.reduce((s, v) => s + (v - mR) ** 2, 0) / n;
    const vG  = Gs.reduce((s, v) => s + (v - mG) ** 2, 0) / n;
    const vB  = Bs.reduce((s, v) => s + (v - mB) ** 2, 0) / n;
    return { stable: vR < VAR_THRESH && vG < VAR_THRESH && vB < VAR_THRESH,
             mR, mG, mB };
}

async function main() {
    fs.mkdirSync(OUT_DIR, { recursive: true });

    // ── Load per-rune templates ────────────────────────────────────────────────
    const runeTemplates = {};
    for (const f of fs.readdirSync(RUNE_TMPL).filter(f => f.endsWith(".data.png"))) {
        const rune = f.replace(".data.png", "");
        runeTemplates[rune] = await loadRaw(path.join(RUNE_TMPL, f));
    }
    console.log(`Loaded rune templates: ${Object.keys(runeTemplates).sort().join(", ")}`);

    // ── Build round mask ───────────────────────────────────────────────────────
    // For rows 0–12: union of all rune template opaque pixels gives the real circle
    // extent (rune art has already been variance-masked to exclude background corners).
    // For rows 13–24: mirror from the opposite row about the centre (row 12).
    //   row 13 ↔ row 11, row 14 ↔ row 10, …, row 24 ↔ row 0.
    // This fills in the bottom half where rune templates are blank (digit area
    // was forcibly cleared by generate-templates.js).
    const roundMask = new Uint8Array(TMPL_W * TMPL_H); // 1 = inside circle

    // Step 1: union of rune templates for rows 0–12.
    for (const buf of Object.values(runeTemplates)) {
        for (let r = 0; r <= 12; r++) {
            for (let c = 0; c < TMPL_W; c++) {
                const i = r * TMPL_W + c;
                if (buf[i * 4 + 3] === 255) roundMask[i] = 1;
            }
        }
    }

    // Step 2: for each row in the top half, find left/right extents, then mirror.
    for (let r = 0; r <= 12; r++) {
        let left = -1, right = -1;
        for (let c = 0; c < TMPL_W; c++) {
            if (roundMask[r * TMPL_W + c]) { if (left === -1) left = c; right = c; }
        }
        if (left === -1) continue; // no data for this row

        const mirrorRow = 24 - r; // row 0 ↔ row 24, row 12 ↔ row 12
        for (let c = left; c <= right; c++) {
            roundMask[mirrorRow * TMPL_W + c] = 1;
        }
    }

    // Print mask shape for reference.
    let maskPx = 0;
    for (let r = 0; r < TMPL_H; r++) {
        let row = "";
        for (let c = 0; c < TMPL_W; c++) {
            const inMask = roundMask[r * TMPL_W + c];
            row += inMask ? "#" : ".";
            if (inMask) maskPx++;
        }
        console.log("  " + row);
    }
    console.log(`  Round mask: ${maskPx} pixels inside circle\n`);

    // ── Group screenshots ──────────────────────────────────────────────────────
    const files = fs.readdirSync(SRC_DIR).filter(f => f.endsWith(".png"));
    const byRuneCharge = {};
    for (const f of files) {
        const parts  = f.split("_");
        const rune   = parts[0];
        const charge = parseInt(parts[1], 10);
        if (isNaN(charge) || charge === 0) continue;
        const key = `${rune}_${charge}`;
        (byRuneCharge[key] ??= []).push(path.join(SRC_DIR, f));
    }

    // ── Per-(rune, charge) templates ───────────────────────────────────────────
    const keys = Object.keys(byRuneCharge).sort();
    for (const key of keys) {
        const paths  = byRuneCharge[key];
        const rune   = key.split("_")[0];
        const bufs   = await Promise.all(paths.map(loadRaw));
        const n      = bufs.length;
        const useVariance = n >= 2;
        const runeTmpl    = runeTemplates[rune] ?? null;

        const out = Buffer.alloc(TMPL_W * TMPL_H * 4, 0);
        let stableCount = 0;

        for (let r = 0; r < TMPL_H - 1; r++) {   // skip bottom row (background bleed)
            for (let c = 0; c < TMPL_W; c++) {
                const i      = r * TMPL_W + c;
                if (!roundMask[i]) continue;        // outside circular icon → skip

                const srcPx  = (r + 1) * ICON_W + (c + 1);  // +1 to skip outer 1px border
                const dstOff = i * 4;
                const si     = srcPx * 4;

                let stable, mR, mG, mB;

                if (useVariance) {
                    const ps = pixelStats(bufs, si);
                    stable   = ps.stable;
                    mR = ps.mR; mG = ps.mG; mB = ps.mB;
                } else {
                    const inDigitArea = r >= DIGIT_ROW0 && c >= DIGIT_COL0 && c <= DIGIT_COL1;
                    if (inDigitArea) {
                        stable = true;
                    } else if (runeTmpl) {
                        stable = runeTmpl[dstOff + 3] === 255;
                    } else {
                        stable = false;
                    }
                    mR = bufs[0][si]; mG = bufs[0][si + 1]; mB = bufs[0][si + 2];
                }

                if (stable) {
                    out[dstOff]     = Math.round(mR);
                    out[dstOff + 1] = Math.round(mG);
                    out[dstOff + 2] = Math.round(mB);
                    out[dstOff + 3] = 255;
                    stableCount++;
                }
            }
        }

        const outPath = path.join(OUT_DIR, `${key}.data.png`);
        await sharp(out, { raw: { width: TMPL_W, height: TMPL_H, channels: 4 } })
            .png()
            .toFile(outPath);

        const maskLabel = useVariance ? `variance (${n} imgs)` : "rune tmpl + digit area";
        console.log(`  ${key.padEnd(16)} → ${String(stableCount).padStart(4)} stable px  [${maskLabel}]`);
    }

    console.log(`\nDone — ${keys.length} combined templates written to ${path.relative(process.cwd(), OUT_DIR)}`);
}

main().catch(e => { console.error(e); process.exit(1); });
