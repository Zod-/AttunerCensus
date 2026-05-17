#!/usr/bin/env node
/**
 * Generates 25×25 rune template images from the buff screenshots in src/attuner-buffs/.
 *
 * The buff icon in-game is 27×27px, but the outer 1px ring is always the green border
 * (90,150,25) — identical across all runes, useless for identification.  We strip it and
 * produce 25×25 templates.  This aligns with buff.countMatch() which calls
 *   BuffReader.countMatch(buffer, bufferx+1, buffery+1, template)
 * so template[0,0] matches icon position [1,1] — i.e. the first non-border pixel.
 *
 * The rune texture has transparent corners (background bleed shows through at those
 * positions).  We detect these by computing per-pixel variance across multiple captures
 * of the same rune.  Pixels with high variance are background and are output as
 * transparent (alpha=0); countMatch skips transparent template pixels.
 *
 * For runes with <3 images we fall back to a global background mask derived from the
 * runes with the most captures.
 */

"use strict";

const sharp  = require("sharp");
const fs     = require("fs");
const path   = require("path");

const SRC_DIR    = path.resolve(__dirname, "../src/attuner-buffs");
const OUT_DIR    = path.resolve(__dirname, "../src/templates");
const ICON_W     = 27;
const ICON_H     = 27;
const TMPL_W     = 25;   // inner 25 = ICON_W - 2 (strip 1px border each side)
const TMPL_H     = 25;
const VAR_THRESH = 225;  // variance threshold per channel: std < 15 → stable

// ---------------------------------------------------------------------------

async function loadRawImages(paths) {
  return Promise.all(paths.map(p =>
    sharp(p).raw().ensureAlpha().toBuffer()
  ));
}

/**
 * For each of the 27×27 pixel positions, compute mean RGB and whether the pixel
 * is stable (low variance) across all supplied images.
 */
function computePixelStats(buffers) {
  const n = buffers.length;
  const result = new Array(ICON_W * ICON_H);
  for (let r = 0; r < ICON_H; r++) {
    for (let c = 0; c < ICON_W; c++) {
      const px = r * ICON_W + c;
      const bi = px * 4;
      const Rs = buffers.map(d => d[bi]);
      const Gs = buffers.map(d => d[bi + 1]);
      const Bs = buffers.map(d => d[bi + 2]);
      const mR = Rs.reduce((a, b) => a + b, 0) / n;
      const mG = Gs.reduce((a, b) => a + b, 0) / n;
      const mB = Bs.reduce((a, b) => a + b, 0) / n;
      const vR = Rs.reduce((s, v) => s + (v - mR) ** 2, 0) / n;
      const vG = Gs.reduce((s, v) => s + (v - mG) ** 2, 0) / n;
      const vB = Bs.reduce((s, v) => s + (v - mB) ** 2, 0) / n;
      result[px] = {
        stable: vR < VAR_THRESH && vG < VAR_THRESH && vB < VAR_THRESH,
        r: Math.round(mR),
        g: Math.round(mG),
        b: Math.round(mB),
      };
    }
  }
  return result;
}

// ---------------------------------------------------------------------------

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Group images by rune name.
  // For "Any" (choice-level buffs), only include images whose charge is one of the
  // known choice levels — Any_22_0.png for example is a mislabelled regular rune.
  const CHOICE_CHARGES = new Set(["7", "14", "21", "28", "35", "42", "49"]);
  const files = fs.readdirSync(SRC_DIR).filter(f => f.endsWith(".png"));
  const groups = {};
  for (const f of files) {
    const parts = f.split("_");
    const rune   = parts[0];
    const charge = parts[1];
    if (rune === "Any" && !CHOICE_CHARGES.has(charge)) continue;
    (groups[rune] ??= []).push(path.join(SRC_DIR, f));
  }
  console.log(`Rune groups: ${Object.keys(groups).sort().join(", ")}\n`);

  // Build a global "background" mask: any pixel that is unstable in at least one
  // well-sampled rune (≥3 images) is background.  This handles runes with only 1-2 images.
  // "Any" is intentionally excluded from the global mask — its icon differs from all runes
  // and would mask out valid rune pixels.
  const globalUnstable = new Uint8Array(ICON_W * ICON_H); // 1 = background
  for (const [rune, paths] of Object.entries(groups)) {
    if (rune === "Any") continue;
    if (paths.length < 3) continue;
    const imgs = await loadRawImages(paths);
    const stats = computePixelStats(imgs);
    for (let i = 0; i < stats.length; i++) {
      if (!stats[i].stable) globalUnstable[i] = 1;
    }
  }

  // Generate one template per rune.
  for (const [rune, paths] of Object.entries(groups)) {
    const imgs   = await loadRawImages(paths);
    const stats  = computePixelStats(imgs);
    const useGlobal = paths.length < 3;

    // Build 25×25 RGBA buffer, cropping the outer 1px green border.
    // Template row T corresponds to icon row T+1 (border stripped).
    // The digit rectangle (rows 13–24, cols 2–14) is always forced transparent so
    // countMatch never tests charge-number pixels against the rune art.
    const CHARGE_TMPL_ROW0 = 13;
    const CHARGE_TMPL_COL0 = 2;
    const CHARGE_TMPL_COL1 = 14;
    const out = Buffer.alloc(TMPL_W * TMPL_H * 4, 0);
    let stableCount = 0;
    for (let r = 0; r < TMPL_H; r++) {
      for (let c = 0; c < TMPL_W; c++) {
        const srcPx = (r + 1) * ICON_W + (c + 1);  // +1 to skip outer border
        const dstOff = (r * TMPL_W + c) * 4;
        // Digit rectangle — always transparent regardless of stability
        if (r >= CHARGE_TMPL_ROW0 && c >= CHARGE_TMPL_COL0 && c <= CHARGE_TMPL_COL1) continue;
        const isStable = useGlobal ? !globalUnstable[srcPx] : stats[srcPx].stable;
        if (isStable) {
          out[dstOff]     = stats[srcPx].r;
          out[dstOff + 1] = stats[srcPx].g;
          out[dstOff + 2] = stats[srcPx].b;
          out[dstOff + 3] = 255;
          stableCount++;
        }
        // else: alpha=0 → transparent; countMatch skips these
      }
    }

    const outPath = path.join(OUT_DIR, `${rune}.data.png`);
    await sharp(out, { raw: { width: TMPL_W, height: TMPL_H, channels: 4 } })
      .png()
      .toFile(outPath);
    const maskLabel = useGlobal ? "global mask" : "per-rune variance";
    console.log(`  ${rune.padEnd(8)} → ${stableCount} stable pixels from ${paths.length} image(s)  [${maskLabel}]`);
  }

  console.log(`\nDone — templates written to ${path.relative(process.cwd(), OUT_DIR)}`);
}

main().catch(e => { console.error(e); process.exit(1); });
