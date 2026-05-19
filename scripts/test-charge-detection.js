#!/usr/bin/env node
/**
 * Tests charge-detection accuracy against the buff screenshots.
 * Reproduces the readCharge() logic from src/index.ts.
 *
 * Run:  node scripts/test-charge-detection.js
 *       node scripts/test-charge-detection.js --rune Death
 *       node scripts/test-charge-detection.js --verbose
 */

"use strict";

const sharp = require("sharp");
const fs    = require("fs");
const path  = require("path");

const SRC_DIR     = path.resolve(__dirname, "../src/attuner-buffs");
const TMPL_DIR    = path.resolve(__dirname, "../src/charge-templates");
const ICON_W      = 27;
const CHARGE_ROW0 = 12;
const CMW = 25, CMH = 15;
const WHITE_THRESH  = 190;
const SHADOW_THRESH = 80;
const MAX_CHARGE    = 49;
const ACCEPT_SCORE  = 0.65;

const FILTER_RUNE   = process.argv.includes("--rune")
    ? process.argv[process.argv.indexOf("--rune") + 1]
    : null;
const VERBOSE       = process.argv.includes("--verbose");
const FP_PENALTY    = process.argv.includes("--fp-penalty"); // test proposed fix

async function loadRaw(p) {
    return sharp(p).raw().ensureAlpha().toBuffer();
}

async function main() {
    // Load charge templates.
    const templates = {};
    for (let c = 1; c <= MAX_CHARGE; c++) {
        const p = path.join(TMPL_DIR, `${c}.data.png`);
        if (!fs.existsSync(p)) continue;
        const meta = await sharp(p).metadata();
        const buf  = await sharp(p).raw().ensureAlpha().toBuffer();
        templates[c] = { buf, width: meta.width, height: meta.height };
    }
    console.log(`Loaded ${Object.keys(templates).length} charge templates.\n`);

    // Load rune art masks.
    const artMasks = {};
    for (const f of fs.readdirSync(TMPL_DIR).filter(f => f.endsWith(".mask.data.png"))) {
        const rune = f.replace(".mask.data.png", "");
        const buf  = await loadRaw(path.join(TMPL_DIR, f));
        artMasks[rune] = buf;
        console.log(`Loaded art mask for ${rune}`);
    }
    if (Object.keys(artMasks).length) console.log();

    // Load buff screenshots.
    const files = fs.readdirSync(SRC_DIR).filter(f => f.endsWith(".png")).sort();

    let correct = 0, wrong = 0, uncertain = 0, total = 0;
    const failures = [];

    for (const f of files) {
        const parts      = f.split("_");
        const rune       = parts[0];
        const trueCharge = parseInt(parts[1], 10);
        if (isNaN(trueCharge) || trueCharge === 0) continue; // skip charge-0 (no digit)
        if (FILTER_RUNE && rune !== FILTER_RUNE) continue;

        const buf  = await loadRaw(path.join(SRC_DIR, f));
        const mask = artMasks[rune] ?? null;

        // Binarize the charge region (icon rows 12–26).
        const mini = new Uint8Array(CMW * CMH);
        for (let r = 0; r < CMH; r++) {
            for (let c = 0; c < CMW; c++) {
                const i  = r * CMW + c;
                if (mask && mask[i * 4 + 3] === 255) continue; // rune art → skip
                const si = ((CHARGE_ROW0 + r) * ICON_W + c) * 4;
                const R = buf[si], G = buf[si+1], B = buf[si+2];
                if (R > WHITE_THRESH  && G > WHITE_THRESH  && B > WHITE_THRESH)  mini[i] = 1;
                else if (R < SHADOW_THRESH && G < SHADOW_THRESH && B < SHADOW_THRESH) mini[i] = 2;
            }
        }

        const miniWhite = mini.reduce((s, v) => s + (v === 1 ? 1 : 0), 0);

        // Score against every template.
        const scores = [];
        for (const [chargeStr, tmpl] of Object.entries(templates)) {
            const charge = parseInt(chargeStr, 10);
            let templateWhite = 0, templateShadow = 0;
            let whiteMatches  = 0, shadowMatches  = 0;
            for (let i = 0; i < CMW * CMH; i++) {
                const alpha = tmpl.buf[i * 4 + 3];
                if (alpha === 0) continue;
                if (alpha === 255) { templateWhite++;  if (mini[i] === 1) whiteMatches++;  }
                else               { templateShadow++; if (mini[i] === 2) shadowMatches++; }
            }
            const totalTemplate = templateWhite + templateShadow;
            const totalMatches  = whiteMatches + shadowMatches;
            const precision = totalTemplate > 0 ? totalMatches / totalTemplate : 0;
            const recall    = miniWhite > 0 ? whiteMatches / miniWhite : 0;
            let f1 = (precision + recall) > 0 ? 2 * precision * recall / (precision + recall) : 0;
            if (FP_PENALTY) {
                // Penalise unmatched bright mini pixels (rune art contamination).
                const fpRate = miniWhite > 0 ? (miniWhite - whiteMatches) / miniWhite : 0;
                f1 = f1 * (1 - fpRate * 0.5);
            }
            scores.push({ charge, f1, precision, recall, whiteMatches, shadowMatches, templateWhite, templateShadow });
        }
        scores.sort((a, b) => b.f1 - a.f1);

        const best  = scores[0];
        const detected = best && best.f1 >= ACCEPT_SCORE ? best.charge : null;
        total++;

        const ok = detected === trueCharge;
        if (ok) correct++;
        else if (detected === null) uncertain++;
        else wrong++;

        const status = ok ? "OK" : detected === null ? "??" : "WRONG";

        if (VERBOSE || status !== "OK") {
            const top3 = scores.slice(0, 3).map(s =>
                `${String(s.charge).padStart(2)}=${s.f1.toFixed(3)}(p=${s.precision.toFixed(2)},r=${s.recall.toFixed(2)},wm=${s.whiteMatches}/${s.templateWhite})`
            ).join("  ");
            console.log(`[${status}] ${f.padEnd(24)} true=${String(trueCharge).padStart(2)} det=${detected !== null ? String(detected).padStart(2) : " ?"} miniW=${String(miniWhite).padStart(3)}  top3: ${top3}`);
        }

        if (status === "WRONG") failures.push({ f, rune, trueCharge, detected, miniWhite, scores: scores.slice(0, 5) });
    }

    console.log(`\nResults: ${correct}/${total} correct, ${wrong} wrong, ${uncertain} uncertain`);

    if (failures.length) {
        console.log(`\n── Wrong detections ─────────────────────────────────────────`);
        for (const { f, trueCharge, detected, miniWhite, scores } of failures) {
            console.log(`  ${f}: true=${trueCharge} detected=${detected} miniWhite=${miniWhite}`);
            const trueScore  = scores.find(s => s.charge === trueCharge);
            const wrongScore = scores.find(s => s.charge === detected);
            if (trueScore)  console.log(`    true   (${trueCharge}): f1=${trueScore.f1.toFixed(3)} p=${trueScore.precision.toFixed(3)} r=${trueScore.recall.toFixed(3)} wm=${trueScore.whiteMatches}/${trueScore.templateWhite}`);
            if (wrongScore) console.log(`    wrong  (${detected}): f1=${wrongScore.f1.toFixed(3)} p=${wrongScore.precision.toFixed(3)} r=${wrongScore.recall.toFixed(3)} wm=${wrongScore.whiteMatches}/${wrongScore.templateWhite}`);
        }
    }
}

main().catch(e => { console.error(e); process.exit(1); });
