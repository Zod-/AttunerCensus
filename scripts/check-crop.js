#!/usr/bin/env node
/**
 * Compares color stats for the full image vs the top-crop used at runtime.
 * Prints side-by-side so we can verify the crop still captures the rune's colour.
 */
const sharp = require("sharp");
const path  = require("path");

const RUNES = [
	"Air", "Water", "Earth", "Fire", "Mind", "Body",
	"Chaos", "Death", "Cosmic", "Law", "Nature",
	"Blood", "Astral", "Soul", "Time",
];

const IMG_DIR      = path.join(__dirname, "..", "src", "rune-images");
const RESIZE       = 32;
const SAMPLE_ROWS  = 18;   // top 18 of 32 — matches analyze-rune-colors.js
const SAT_THRESH   = 0.15;
const BRIGHT_THRESH = 20;
const HUE_BUCKETS  = 12;

function rgbToHsl(r, g, b) {
	r /= 255; g /= 255; b /= 255;
	const max = Math.max(r, g, b), min = Math.min(r, g, b);
	const l = (max + min) / 2;
	if (max === min) return [0, 0, l];
	const d = max - min;
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
	let h = 0;
	if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
	else if (max === g) h = ((b - r) / d + 2) / 6;
	else h = ((r - g) / d + 4) / 6;
	return [h * 360, s, l];
}

function stats(data, rows) {
	const stride = RESIZE * 4;
	let total = 0, colored = 0, wSum = 0, hueWSum = 0;
	const buckets = new Array(HUE_BUCKETS).fill(0);
	for (let row = 0; row < rows; row++) {
		for (let col = 0; col < RESIZE; col++) {
			const i = row * stride + col * 4;
			if (data[i + 3] < 128) continue;
			const r = data[i], g = data[i+1], b = data[i+2];
			total++;
			const [h, s] = rgbToHsl(r, g, b);
			if (s > SAT_THRESH) {
				colored++;
				const bk = Math.min(Math.floor(h / 30), HUE_BUCKETS - 1);
				buckets[bk] += s;
				hueWSum += h * s;
				wSum += s;
			}
		}
	}
	const colorRatio = total > 0 ? colored / total : 0;
	const meanHue    = wSum > 0 ? hueWSum / wSum : 0;
	const topBucket  = buckets.indexOf(Math.max(...buckets)) * 30;
	return { total, colorRatio, meanHue: Math.round(meanHue), topBucket };
}

async function main() {
	console.log(
		"Rune     ".padEnd(10),
		"FULL colorRatio  meanHue  topBucket".padEnd(36),
		"CROP colorRatio  meanHue  topBucket"
	);
	console.log("-".repeat(80));

	for (const rune of RUNES) {
		const file = path.join(IMG_DIR, `${rune}.png`);
		const { data } = await sharp(file)
			.resize(RESIZE, RESIZE, { fit: "fill" })
			.ensureAlpha()
			.raw()
			.toBuffer({ resolveWithObject: true });

		const full = stats(data, RESIZE);
		const crop = stats(data, SAMPLE_ROWS);

		const fmt = s =>
			`ratio=${s.colorRatio.toFixed(3).padStart(5)}  hue=${String(s.meanHue).padStart(3)}°  top=${s.topBucket}°`;

		const ok = crop.colorRatio > 0.05 ? "✓" : "✗ LOW";
		console.log(rune.padEnd(10), fmt(full).padEnd(36), fmt(crop), ok);
	}
}

main().catch(e => { console.error(e); process.exit(1); });
