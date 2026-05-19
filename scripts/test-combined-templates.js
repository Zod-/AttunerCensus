#!/usr/bin/env node
/**
 * Tests combined (rune+charge) template accuracy against the buff screenshots.
 * For each screenshot, loads the matching combined template for its rune, scores
 * every combined template of that rune, and reports whether the correct charge wins.
 *
 * Run:  node scripts/test-combined-templates.js
 *       node scripts/test-combined-templates.js --rune Death
 *       node scripts/test-combined-templates.js --verbose
 */
"use strict";

const sharp = require("sharp");
const fs    = require("fs");
const path  = require("path");

const SRC_DIR    = path.resolve(__dirname, "../src/attuner-buffs");
const TMPL_DIR   = path.resolve(__dirname, "../src/combined-templates");
const ICON_W     = 27;
const COLOR_THRESH = 35;   // per-channel max diff to consider a pixel "matched"
const SCORE_THRESH = 0.75; // minimum combined score to accept a detection

const FILTER_RUNE = process.argv.includes("--rune")
    ? process.argv[process.argv.indexOf("--rune") + 1]
    : null;
const VERBOSE = process.argv.includes("--verbose");

async function loadRaw(p) {
    return sharp(p).raw().ensureAlpha().toBuffer();
}

async function main() {
    // Load combined templates, keyed as "Rune_Charge".
    const templates = {};
    for (const f of fs.readdirSync(TMPL_DIR).filter(f => f.endsWith(".data.png"))) {
        const key  = f.replace(".data.png", "");
        const meta = await sharp(path.join(TMPL_DIR, f)).metadata();
        const buf  = await loadRaw(path.join(TMPL_DIR, f));
        templates[key] = { buf, width: meta.width, height: meta.height };
    }
    console.log(`Loaded ${Object.keys(templates).length} combined templates.\n`);

    const files = fs.readdirSync(SRC_DIR).filter(f => f.endsWith(".png")).sort();

    let correct = 0, wrong = 0, uncertain = 0, total = 0;
    const failures = [];

    for (const f of files) {
        const parts      = f.split("_");
        const rune       = parts[0];
        const trueCharge = parseInt(parts[1], 10);
        if (isNaN(trueCharge) || trueCharge === 0) continue;
        if (FILTER_RUNE && rune !== FILTER_RUNE) continue;

        // Only test screenshots for which a combined template exists.
        const trueKey = `${rune}_${trueCharge}`;
        if (!templates[trueKey]) continue;

        const liveBuf = await loadRaw(path.join(SRC_DIR, f));

        // Score every combined template for this rune.
        const scores = [];
        for (const [key, tmpl] of Object.entries(templates)) {
            if (!key.startsWith(`${rune}_`)) continue;
            const charge = parseInt(key.split("_")[1], 10);
            if (isNaN(charge)) continue;

            let tested = 0, passed = 0;
            for (let r = 0; r < tmpl.height; r++) {
                for (let c = 0; c < tmpl.width; c++) {
                    const ti = (r * tmpl.width + c) * 4;
                    if (tmpl.buf[ti + 3] === 0) continue;
                    tested++;
                    // Live pixel is at icon row r+1, col c+1 (skip 1px border)
                    const si = ((r + 1) * ICON_W + (c + 1)) * 4;
                    const dR = Math.abs(liveBuf[si]     - tmpl.buf[ti]);
                    const dG = Math.abs(liveBuf[si + 1] - tmpl.buf[ti + 1]);
                    const dB = Math.abs(liveBuf[si + 2] - tmpl.buf[ti + 2]);
                    if (Math.max(dR, dG, dB) <= COLOR_THRESH) passed++;
                }
            }
            const score = tested > 0 ? passed / tested : 0;
            scores.push({ key, charge, score, tested, passed });
        }

        scores.sort((a, b) => b.score - a.score);
        const best = scores[0];
        const detected = best && best.score >= SCORE_THRESH ? best.charge : null;
        total++;

        const ok = detected === trueCharge;
        if (ok) correct++;
        else if (detected === null) uncertain++;
        else wrong++;

        const status = ok ? "OK" : detected === null ? "??" : "WRONG";

        if (VERBOSE || status !== "OK") {
            const trueScore = scores.find(s => s.charge === trueCharge);
            const margin    = scores.length > 1 ? scores[0].score - scores[1].score : 0;
            const top3      = scores.slice(0, 3).map(s =>
                `${s.key.padEnd(12)}=${s.score.toFixed(3)}`
            ).join("  ");
            console.log(`[${status}] ${f.padEnd(24)} true=${String(trueCharge).padStart(2)}` +
                ` det=${detected !== null ? String(detected).padStart(2) : " ?"}` +
                ` true_score=${trueScore ? trueScore.score.toFixed(3) : "n/a"}` +
                ` margin=${margin.toFixed(3)}  top3: ${top3}`);
        }

        if (status === "WRONG") failures.push({ f, rune, trueCharge, detected, scores: scores.slice(0, 5) });
    }

    console.log(`\nResults: ${correct}/${total} correct, ${wrong} wrong, ${uncertain} uncertain (threshold=${SCORE_THRESH})`);
    console.log(`Coverage: tested ${total} screenshots with matching combined templates`);

    if (failures.length) {
        console.log(`\n── Wrong detections ─────────────────────────────────────────`);
        for (const { f, trueCharge, detected, scores } of failures) {
            console.log(`  ${f}: true=${trueCharge} detected=${detected}`);
            const trueS  = scores.find(s => s.charge === trueCharge);
            const wrongS = scores.find(s => s.charge === detected);
            if (trueS)  console.log(`    true  (${trueCharge}): score=${trueS.score.toFixed(3)} passed=${trueS.passed}/${trueS.tested}`);
            if (wrongS) console.log(`    wrong (${detected}): score=${wrongS.score.toFixed(3)} passed=${wrongS.passed}/${wrongS.tested}`);
        }
    }

    // Summary statistics
    const allScores = [];
    for (const f of files) {
        const parts = f.split("_");
        const rune = parts[0];
        const trueCharge = parseInt(parts[1], 10);
        if (isNaN(trueCharge) || trueCharge === 0) continue;
        if (FILTER_RUNE && rune !== FILTER_RUNE) continue;
        const trueKey = `${rune}_${trueCharge}`;
        if (!templates[trueKey]) continue;

        const liveBuf = await loadRaw(path.join(SRC_DIR, f));
        const tmpl = templates[trueKey];
        let tested = 0, passed = 0;
        for (let r = 0; r < tmpl.height; r++) {
            for (let c = 0; c < tmpl.width; c++) {
                const ti = (r * tmpl.width + c) * 4;
                if (tmpl.buf[ti + 3] === 0) continue;
                tested++;
                const si = ((r + 1) * ICON_W + (c + 1)) * 4;
                const dR = Math.abs(liveBuf[si]     - tmpl.buf[ti]);
                const dG = Math.abs(liveBuf[si + 1] - tmpl.buf[ti + 1]);
                const dB = Math.abs(liveBuf[si + 2] - tmpl.buf[ti + 2]);
                if (Math.max(dR, dG, dB) <= COLOR_THRESH) passed++;
            }
        }
        allScores.push(tested > 0 ? passed / tested : 0);
    }
    allScores.sort((a, b) => a - b);
    if (allScores.length > 0) {
        const p5  = allScores[Math.floor(allScores.length * 0.05)];
        const p25 = allScores[Math.floor(allScores.length * 0.25)];
        const p50 = allScores[Math.floor(allScores.length * 0.50)];
        const p75 = allScores[Math.floor(allScores.length * 0.75)];
        const p95 = allScores[Math.floor(allScores.length * 0.95)];
        console.log(`\nSelf-match score distribution (correct template vs its own screenshots):`);
        console.log(`  p5=${p5.toFixed(3)} p25=${p25.toFixed(3)} p50=${p50.toFixed(3)} p75=${p75.toFixed(3)} p95=${p95.toFixed(3)}`);
    }
}

main().catch(e => { console.error(e); process.exit(1); });
