#!/usr/bin/env node
/**
 * Downloads rune images from the RuneScape wiki and saves them to src/rune-images/.
 * Skips files that already exist so re-running is fast.
 */
const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");

const RUNES = [
	"Air", "Water", "Earth", "Fire", "Mind", "Body",
	"Chaos", "Death", "Cosmic", "Law", "Nature",
	"Blood", "Astral", "Soul", "Time",
];

const OUT_DIR = path.join(__dirname, "..", "src", "rune-images");
fs.mkdirSync(OUT_DIR, { recursive: true });

function download(url, dest) {
	return new Promise((resolve, reject) => {
		if (fs.existsSync(dest)) {
			console.log(`  Skipping ${path.basename(dest)} (already exists)`);
			return resolve();
		}
		const proto = url.startsWith("https") ? https : http;
		proto.get(url, { headers: { "User-Agent": "RunicAttunerTracker/1.0" } }, res => {
			if (res.statusCode === 301 || res.statusCode === 302) {
				return download(res.headers.location, dest).then(resolve).catch(reject);
			}
			if (res.statusCode !== 200) {
				return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
			}
			const out = fs.createWriteStream(dest);
			res.pipe(out);
			out.on("finish", () => { out.close(); resolve(); });
			out.on("error", reject);
		}).on("error", reject);
	});
}

async function main() {
	const failures = [];
	for (const rune of RUNES) {
		const url = `https://runescape.wiki/images/${rune}_rune.png`;
		const dest = path.join(OUT_DIR, `${rune}.png`);
		process.stdout.write(`Downloading ${rune} rune... `);
		try {
			await download(url, dest);
			console.log("OK");
		} catch (e) {
			console.log(`FAILED: ${e.message}`);
			failures.push(rune);
		}
	}
	if (failures.length) {
		console.warn(`\nFailed to download: ${failures.join(", ")}`);
		process.exit(1);
	}
	console.log("\nAll rune images downloaded.");
}

main();
