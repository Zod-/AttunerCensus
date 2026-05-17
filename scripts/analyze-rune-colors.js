#!/usr/bin/env node
/**
 * Reads each rune PNG, computes a color signature (hue-bucket histogram of
 * non-grey pixels), and writes src/rune-signatures.json.
 * Requires the 'sharp' dev-dependency.
 */
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const RUNES = [
	"Air", "Water", "Earth", "Fire", "Mind", "Body",
	"Chaos", "Death", "Cosmic", "Law", "Nature",
	"Blood", "Astral", "Soul", "Time",
];

const IMG_DIR = path.join(__dirname, "..", "src", "rune-images");
const OUT = path.join(__dirname, "..", "src", "rune-signatures.json");

const HUE_BUCKETS = 12;          // 30° per bucket
const SAT_THRESHOLD = 0.15;      // below this = grey, ignore for hue histogram
const RESIZE = 32;               // normalise all images to 32×32
const SAMPLE_ROWS = RESIZE;      // full height — saturation filter handles number/ring pixels

function rgbToHsl(r, g, b) {
	r /= 255; g /= 255; b /= 255;
	const max = Math.max(r, g, b), min = Math.min(r, g, b);
	const l = (max + min) / 2;
	if (max === min) return [0, 0, l];
	const d = max - min;
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
	let h;
	if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
	else if (max === g) h = ((b - r) / d + 2) / 6;
	else h = ((r - g) / d + 4) / 6;
	return [h * 360, s, l];
}

async function analyze(name) {
	const file = path.join(IMG_DIR, `${name}.png`);
	const { data } = await sharp(file)
		.resize(RESIZE, RESIZE, { fit: "fill" })
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });

	const buckets = new Array(HUE_BUCKETS).fill(0);
	let coloredPixels = 0;
	let totalPixels = 0;
	let weightedHueSum = 0;
	let weightSum = 0;
	let rSum = 0, gSum = 0, bSum = 0;

	const stride = RESIZE * 4;
	for (let row = 0; row < SAMPLE_ROWS; row++) {
	for (let col = 0; col < RESIZE; col++) {
		const i = row * stride + col * 4;
		const a = data[i + 3];
		if (a < 128) continue;
		const r = data[i], g = data[i + 1], b = data[i + 2];
		totalPixels++;

		rSum += r; gSum += g; bSum += b;

		const [h, s] = rgbToHsl(r, g, b);
		if (s > SAT_THRESHOLD) {
			coloredPixels++;
			const bucket = Math.min(Math.floor(h / (360 / HUE_BUCKETS)), HUE_BUCKETS - 1);
			buckets[bucket] += s;
			weightedHueSum += h * s;
			weightSum += s;
		}
	}
	}

	const colorRatio = totalPixels > 0 ? coloredPixels / totalPixels : 0;
	const meanHue = weightSum > 0 ? weightedHueSum / weightSum : 0;
	const normBuckets = buckets.map(v => weightSum > 0 ? v / weightSum : 0);
	const meanR = totalPixels > 0 ? rSum / totalPixels : 0;
	const meanG = totalPixels > 0 ? gSum / totalPixels : 0;
	const meanB = totalPixels > 0 ? bSum / totalPixels : 0;

	return { name, colorRatio, meanHue, hueBuckets: normBuckets, meanR, meanG, meanB };
}

async function main() {
	console.log("Analyzing rune color signatures...\n");
	const sigs = {};

	for (const rune of RUNES) {
		const sig = await analyze(rune);
		sigs[rune] = sig;

		const dominant = sig.hueBuckets
			.map((v, i) => ({ bucket: i * 30, v }))
			.sort((a, b) => b.v - a.v)
			.slice(0, 2)
			.map(x => `${x.bucket}°`)
			.join(", ");

		console.log(
			`${rune.padEnd(8)} ` +
			`colorRatio=${sig.colorRatio.toFixed(2)}  ` +
			`meanHue=${String(Math.round(sig.meanHue)).padStart(3)}°  ` +
			`avgRGB=(${Math.round(sig.meanR)},${Math.round(sig.meanG)},${Math.round(sig.meanB)})  ` +
			`dominant hues: ${dominant}`
		);
	}

	fs.writeFileSync(OUT, JSON.stringify(sigs, null, 2));
	console.log(`\nWrote ${OUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });
