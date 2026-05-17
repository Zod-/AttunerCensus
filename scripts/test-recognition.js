#!/usr/bin/env node
/**
 * Tests rune identification accuracy against the 117 buff screenshots.
 *
 * Reproduces exactly what buff.countMatch() does at runtime:
 *   - template pixel (x,y) is compared against test-image pixel (x+1, y+1)
 *     (the +1 matches BuffReader.countMatch's bufferx+1/buffery+1 offsets)
 *   - transparent template pixels (alpha < 255) are skipped
 *   - pure white (255,255,255) or black (0,0,0) live pixels are skipped
 *     (these are the charge-number text pixels)
 *   - colour distance = L1(R,G,B), threshold 35 (same as alt1's coldif + 35 limit)
 *
 * Run:  node scripts/test-recognition.js
 * Or:   node scripts/test-recognition.js --verbose   (show per-rune scores)
 */

"use strict";

const sharp = require("sharp");
const fs    = require("fs");
const path  = require("path");

const TMPL_DIR       = path.resolve(__dirname, "../src/templates");
const TEST_DIR       = path.resolve(__dirname, "../src/attuner-buffs");
const ICON_W         = 27;
const TMPL_W         = 25;
const COLDIF_THRESH  = 35;
const VERBOSE        = process.argv.includes("--verbose");
const CHOICE_CHARGES = new Set(["7", "14", "21", "28", "35", "42", "49"]);

function coldif(r1, g1, b1, r2, g2, b2) {
  // L1 (Manhattan) distance – matches alt1's coldif with a2=255 (alpha scaling cancels)
  return Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
}

async function loadRaw(p) {
  return sharp(p).raw().ensureAlpha().toBuffer();
}

function countMatch(testImg, tmpl) {
  let tested = 0, failed = 0, passed = 0;
  for (let r = 0; r < TMPL_W; r++) {
    for (let c = 0; c < TMPL_W; c++) {
      const ti = (r * TMPL_W + c) * 4;
      if (tmpl[ti + 3] !== 255) continue;  // transparent → skip

      // Test-image pixel at (r+1, c+1) — simulates countMatch's +1 offset
      const li = ((r + 1) * ICON_W + (c + 1)) * 4;
      const lR = testImg[li], lG = testImg[li + 1], lB = testImg[li + 2];

      // Skip pure white or black (charge-number text)
      if (lR === 255 && lG === 255 && lB === 255) continue;
      if (lR === 0   && lG === 0   && lB === 0)   continue;

      const d = coldif(lR, lG, lB, tmpl[ti], tmpl[ti + 1], tmpl[ti + 2]);
      tested++;
      if (d > COLDIF_THRESH) failed++;
      else passed++;
    }
  }
  return { tested, failed, passed, score: tested > 0 ? passed / tested : 0 };
}

async function main() {
  // Load templates
  const tmplFiles = fs.readdirSync(TMPL_DIR).filter(f => f.endsWith(".data.png"));
  if (tmplFiles.length === 0) {
    console.error("No templates found in src/templates/.  Run generate-templates.js first.");
    process.exit(1);
  }
  const templates = {};
  for (const f of tmplFiles) {
    templates[path.basename(f, ".data.png")] = await loadRaw(path.join(TMPL_DIR, f));
  }
  console.log(`Loaded ${Object.keys(templates).length} templates: ${Object.keys(templates).sort().join(", ")}\n`);

  // Run test images
  const testFiles = fs.readdirSync(TEST_DIR).filter(f => f.endsWith(".png")).sort();
  let correct = 0, incorrect = 0, skipped = 0;
  const errors = [];

  for (const testFile of testFiles) {
    const parts = testFile.split("_");
    const expectedRune = parts[0];
    const charge       = parts[1];

    // Any_<charge>_<n>.png at non-choice charges are mislabelled regular runes — skip them.
    if (expectedRune === "Any" && !CHOICE_CHARGES.has(charge)) { skipped++; continue; }

    const testImg = await loadRaw(path.join(TEST_DIR, testFile));

    // Match against every template
    let bestRune = null, bestScore = -1;
    const scores = {};
    for (const [runeName, tmpl] of Object.entries(templates)) {
      const { score, tested } = countMatch(testImg, tmpl);
      scores[runeName] = { score, tested };
      if (tested > 20 && score > bestScore) { bestScore = score; bestRune = runeName; }
    }

    const ok = bestRune === expectedRune;
    if (ok) correct++; else {
      incorrect++;
      errors.push(`  ✗ ${testFile}  expected=${expectedRune}  got=${bestRune}  score=${bestScore.toFixed(3)}`);
    }

    const marker = ok ? "✓" : "✗";
    console.log(`${marker} ${testFile.padEnd(28)} → ${String(bestRune).padEnd(8)} score=${bestScore.toFixed(3)}`);
    if (VERBOSE) {
      const sorted = Object.entries(scores).sort((a, b) => b[1].score - a[1].score).slice(0, 5);
      for (const [rune, { score, tested }] of sorted) {
        console.log(`      ${rune.padEnd(8)}  score=${score.toFixed(3)}  tested=${tested}`);
      }
    }
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`Correct:   ${correct} / ${correct + incorrect}`);
  console.log(`Incorrect: ${incorrect}`);
  console.log(`Skipped:   ${skipped}  (Any / choice-level images)`);
  if (errors.length) { console.log("\nFailed:"); errors.forEach(e => console.log(e)); }
  console.log(`Accuracy:  ${((correct / (correct + incorrect)) * 100).toFixed(1)}%`);
}

main().catch(e => { console.error(e); process.exit(1); });
