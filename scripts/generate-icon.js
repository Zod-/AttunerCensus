#!/usr/bin/env node
/**
 * Generates a minimal 32x32 PNG icon for the Runic Attuner Tracker.
 * Runs as the prebuild step (no external deps needed).
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

function crc32(buf) {
	const table = new Uint32Array(256);
	for (let i = 0; i < 256; i++) {
		let c = i;
		for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[i] = c;
	}
	let crc = 0xffffffff;
	for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(name, data) {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length, 0);
	const type = Buffer.from(name, "ascii");
	const body = Buffer.concat([type, data]);
	const checksum = Buffer.alloc(4);
	checksum.writeUInt32BE(crc32(body), 0);
	return Buffer.concat([len, body, checksum]);
}

function createPNG(width, height, drawPixel) {
	const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

	const ihdrData = Buffer.alloc(13);
	ihdrData.writeUInt32BE(width, 0);
	ihdrData.writeUInt32BE(height, 4);
	ihdrData[8] = 8; // bit depth
	ihdrData[9] = 2; // RGB color type
	const ihdr = pngChunk("IHDR", ihdrData);

	const raw = [];
	for (let y = 0; y < height; y++) {
		raw.push(0); // filter: None
		for (let x = 0; x < width; x++) {
			const [r, g, b] = drawPixel(x, y, width, height);
			raw.push(r, g, b);
		}
	}
	const idat = pngChunk("IDAT", zlib.deflateSync(Buffer.from(raw)));
	const iend = pngChunk("IEND", Buffer.alloc(0));

	return Buffer.concat([sig, ihdr, idat, iend]);
}

function drawIcon(x, y, w, h) {
	const cx = w / 2, cy = h / 2;
	const r = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);

	// Purple background circle
	if (r < cx - 1) {
		// Inner rune symbol: a simple cross / plus shape in gold
		const inCross =
			(Math.abs(x - cx) < 3 && Math.abs(y - cy) < 10) ||
			(Math.abs(y - cy) < 3 && Math.abs(x - cx) < 10);
		if (inCross) return [255, 215, 0]; // gold
		return [80, 0, 140]; // purple
	}
	// Thin border ring
	if (r < cx) return [160, 80, 255]; // lighter purple rim
	return [0, 0, 0]; // transparent (background) — opaque black here for PNG
}

const png = createPNG(32, 32, drawIcon);
const outPath = path.join(__dirname, "..", "src", "icon.png");
fs.writeFileSync(outPath, png);
console.log("Generated src/icon.png");
