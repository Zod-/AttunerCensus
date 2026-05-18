import * as a1lib from "alt1";
import * as BuffReaderModule from "alt1/buffs";
import { webpackImages } from "alt1/base";
import type * as OCR from "alt1/ocr";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pixel8Font: OCR.FontDefinition = require("../node_modules/alt1/src/fonts/pixel_8px_digits.fontmeta.json");

import "./index.html";
import "./appconfig.json";
import "./icon.png";
import "./style.css";

// ── Rune image URLs for table header display ──────────────────────────────────
const RUNE_IMAGE_URLS: Record<string, string> = {
	Air:    require("./rune-images/Air.png"),
	Water:  require("./rune-images/Water.png"),
	Earth:  require("./rune-images/Earth.png"),
	Fire:   require("./rune-images/Fire.png"),
	Mind:   require("./rune-images/Mind.png"),
	Body:   require("./rune-images/Body.png"),
	Chaos:  require("./rune-images/Chaos.png"),
	Death:  require("./rune-images/Death.png"),
	Cosmic: require("./rune-images/Cosmic.png"),
	Law:    require("./rune-images/Law.png"),
	Nature: require("./rune-images/Nature.png"),
	Blood:  require("./rune-images/Blood.png"),
	Astral: require("./rune-images/Astral.png"),
	Soul:   require("./rune-images/Soul.png"),
	Time:   require("./rune-images/Time.png"),
};

// ── Rune templates for pixel matching (25×25 ImageData, loaded via imagedata-loader) ─
// Templates are averaged from actual in-game buff screenshots with background-bleed
// pixels and charge-number areas set to transparent so countMatch skips them.
const RUNE_NAMES = [
	"Any",
	"Air", "Water", "Earth", "Fire", "Mind", "Body", "Chaos", "Death",
	"Cosmic", "Law", "Nature", "Blood", "Astral", "Soul", "Time",
] as const;

const RUNE_TEMPLATES = webpackImages({
	Any:    require("./templates/Any.data.png"),
	Air:    require("./templates/Air.data.png"),
	Water:  require("./templates/Water.data.png"),
	Earth:  require("./templates/Earth.data.png"),
	Fire:   require("./templates/Fire.data.png"),
	Mind:   require("./templates/Mind.data.png"),
	Body:   require("./templates/Body.data.png"),
	Chaos:  require("./templates/Chaos.data.png"),
	Death:  require("./templates/Death.data.png"),
	Cosmic: require("./templates/Cosmic.data.png"),
	Law:    require("./templates/Law.data.png"),
	Nature: require("./templates/Nature.data.png"),
	Blood:  require("./templates/Blood.data.png"),
	Astral: require("./templates/Astral.data.png"),
	Soul:   require("./templates/Soul.data.png"),
	Time:   require("./templates/Time.data.png"),
});

// ── Charge templates (25×15, white digit pixels on transparent background) ───
// Generated from actual buff screenshots via scripts/generate-charge-templates.js.
// Each template covers the digit region (icon rows 12-26) binarised at R/G/B > 190.
const CHARGE_TEMPLATES = webpackImages({
	n1:  require("./charge-templates/1.data.png"),
	n2:  require("./charge-templates/2.data.png"),
	n3:  require("./charge-templates/3.data.png"),
	n4:  require("./charge-templates/4.data.png"),
	n5:  require("./charge-templates/5.data.png"),
	n6:  require("./charge-templates/6.data.png"),
	n7:  require("./charge-templates/7.data.png"),
	n8:  require("./charge-templates/8.data.png"),
	n9:  require("./charge-templates/9.data.png"),
	n10: require("./charge-templates/10.data.png"),
	n11: require("./charge-templates/11.data.png"),
	n12: require("./charge-templates/12.data.png"),
	n13: require("./charge-templates/13.data.png"),
	n14: require("./charge-templates/14.data.png"),
	n15: require("./charge-templates/15.data.png"),
	n16: require("./charge-templates/16.data.png"),
	n17: require("./charge-templates/17.data.png"),
	n18: require("./charge-templates/18.data.png"),
	n19: require("./charge-templates/19.data.png"),
	n20: require("./charge-templates/20.data.png"),
	n21: require("./charge-templates/21.data.png"),
	n22: require("./charge-templates/22.data.png"),
	n23: require("./charge-templates/23.data.png"),
	n24: require("./charge-templates/24.data.png"),
	n25: require("./charge-templates/25.data.png"),
	n26: require("./charge-templates/26.data.png"),
	n27: require("./charge-templates/27.data.png"),
	n28: require("./charge-templates/28.data.png"),
	n29: require("./charge-templates/29.data.png"),
	n30: require("./charge-templates/30.data.png"),
	n31: require("./charge-templates/31.data.png"),
	n32: require("./charge-templates/32.data.png"),
	n33: require("./charge-templates/33.data.png"),
	n34: require("./charge-templates/34.data.png"),
	n35: require("./charge-templates/35.data.png"),
	n36: require("./charge-templates/36.data.png"),
	n37: require("./charge-templates/37.data.png"),
	n38: require("./charge-templates/38.data.png"),
	n39: require("./charge-templates/39.data.png"),
	n40: require("./charge-templates/40.data.png"),
	n41: require("./charge-templates/41.data.png"),
	n42: require("./charge-templates/42.data.png"),
	n43: require("./charge-templates/43.data.png"),
	n44: require("./charge-templates/44.data.png"),
	n45: require("./charge-templates/45.data.png"),
	n46: require("./charge-templates/46.data.png"),
	n47: require("./charge-templates/47.data.png"),
	n48: require("./charge-templates/48.data.png"),
	n49: require("./charge-templates/49.data.png"),
});

// ── Types ─────────────────────────────────────────────────────────────────────

interface FrequencyData {
	counts: Record<number, Record<string, number>>;
	totalReadings: number;
	lastCharge: number;
	lastRecordedRune:   string | null;
	lastRecordedCharge: number | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_KEY   = "runic-attuner-v2";
const POLL_MS       = 600;
const MAX_CHARGE    = 49;
const CHOICE_LEVELS = new Set([7, 14, 21, 28, 35, 42, 49]);
const MATCH_SCORE   = 0.7;  // minimum passed/tested ratio to accept an identification
const STABLE_POLLS  = 3;    // consecutive polls a (rune, charge) must hold before recording

const RUNE_TIER_ORDER = [
	"Air", "Mind", "Water", "Earth", "Fire", "Body",
	"Cosmic", "Chaos", "Astral", "Nature", "Law", "Death",
	"Blood", "Soul", "Time",
];

const RUNE_COLORS: Record<string, string> = {
	Air: "#7dd3fc", Mind: "#f472b6", Water: "#3b82f6", Earth: "#a3855a",
	Fire: "#f97316", Body: "#4ade80", Cosmic: "#c084fc", Chaos: "#ef4444",
	Astral: "#818cf8", Nature: "#22c55e", Law: "#fbbf24", Death: "#64748b",
	Blood: "#dc2626", Soul: "#e2e8f0", Time: "#06b6d4", Any: "#fbbf24",
};

// ── State ─────────────────────────────────────────────────────────────────────

let data: FrequencyData = loadData();
let buffReader: InstanceType<typeof BuffReaderModule.default> | null = null;
let pollCount = 0;
let lastBuffCount = -1;
let lastSeenRune: string | null = data.lastRecordedRune ?? null;
let lastSeenCharge: number | null = data.lastRecordedCharge ?? null;
let lastAllIcons: { icon: ImageData; matched: boolean }[] = [];
const debugLog: string[] = [];
let lastMatchedBuff: any = null;
let lastMatchedTemplate: ImageData | null = null;
let lastBestCharge      = -1;
let lastBestChargeScore = -1;
let pendingRune:   string | null = null;
let pendingCharge: number | null = null;
let pendingCount   = 0;
let activePopover: HTMLElement | null = null;

const SNAPSHOT_BUFFER_SIZE = 10;
interface Snapshot { rune: string; charge: number | null; icon: ImageData; }
const snapshotBuffer: Snapshot[] = [];
let lastTrackedCharge: number | null = null;
let inUncertainMode = false;

// ── Persistence ───────────────────────────────────────────────────────────────

function loadData(): FrequencyData {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) return JSON.parse(raw) as FrequencyData;
	} catch { /* ignore */ }
	return { counts: {}, totalReadings: 0, lastCharge: 0, lastRecordedRune: null, lastRecordedCharge: null };
}

function saveData(): void {
	try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
}

// ── Buff reading ──────────────────────────────────────────────────────────────

function identifyRune(buff: any): { name: string; score: number } | null {
	if (!RUNE_TEMPLATES.loaded) return null;
	let bestName = "";
	let bestScore = 0;
	let bestTmpl: ImageData | null = null;
	for (const name of RUNE_NAMES) {
		const tmpl = (RUNE_TEMPLATES as any)[name] as ImageData | null;
		if (!tmpl) continue;
		// buff.countMatch calls BuffReader.countMatch(buffer, bufferx+1, buffery+1, template)
		// which aligns our 25×25 template at icon position (1,1) — the first non-border pixel.
		const r = buff.countMatch(tmpl) as { tested: number; passed: number };
		if (r.tested < 20) continue;
		const score = r.passed / r.tested;
		if (score > bestScore) { bestScore = score; bestName = name; bestTmpl = tmpl; }
	}
	if (bestScore >= MATCH_SCORE) {
		lastMatchedTemplate = bestTmpl;
		return { name: bestName, score: bestScore };
	}
	lastMatchedTemplate = null;
	return null;
}

function readCharge(buff: any): number | null {
	if (!CHARGE_TEMPLATES.loaded) return null;

	const buf = buff.buffer as ImageData;
	const bx  = buff.bufferx as number;
	const by  = buff.buffery as number;

	// Binarize icon rows 12–26 (25×15 region):
	//   1 = bright digit pixel (R/G/B > 190)
	//   2 = dark shadow pixel  (R/G/B < 80)
	//   0 = background
	const MW = 25, MH = 15;
	const mini = new Uint8Array(MW * MH);
	for (let r = 0; r < MH; r++) {
		for (let c = 0; c < MW; c++) {
			const si = ((by + 12 + r) * buf.width + (bx + c)) * 4;
			const R = buf.data[si], G = buf.data[si+1], B = buf.data[si+2];
			if (R > 190 && G > 190 && B > 190)   mini[r * MW + c] = 1;
			else if (R < 80 && G < 80 && B < 80) mini[r * MW + c] = 2;
		}
	}

	const miniWhite = mini.reduce((s, v) => s + (v === 1 ? 1 : 0), 0);

	// No white pixels in the digit region → no number shown → charge 0.
	if (miniWhite < 4) {
		lastBestCharge = 0; lastBestChargeScore = 1;
		return 0;
	}

	// F1 score combining bright and shadow pixels:
	//   precision = (white matches + shadow matches) / all active template pixels
	//   recall    = white matches / mini white pixels  (avoids dark-pixel inflation)
	let bestCharge = -1, bestScore = -1;
	for (let charge = 1; charge <= MAX_CHARGE; charge++) {
		const tmpl = (CHARGE_TEMPLATES as any)[`n${charge}`] as ImageData | null;
		if (!tmpl) continue;
		let templateWhite = 0, templateShadow = 0;
		let whiteMatches  = 0, shadowMatches  = 0;
		for (let i = 0; i < MW * MH; i++) {
			const alpha = tmpl.data[i * 4 + 3];
			if (alpha === 0) continue;
			if (alpha === 255) { templateWhite++;  if (mini[i] === 1) whiteMatches++;  }
			else               { templateShadow++; if (mini[i] === 2) shadowMatches++; }
		}
		const totalTemplate = templateWhite + templateShadow;
		const totalMatches  = whiteMatches + shadowMatches;
		const precision = totalTemplate > 0 ? totalMatches / totalTemplate : 0;
		const recall    = miniWhite     > 0 ? whiteMatches / miniWhite    : 0;
		const score     = (precision + recall) > 0 ? 2 * precision * recall / (precision + recall) : 0;
		if (score > bestScore) { bestScore = score; bestCharge = charge; }
	}

	lastBestCharge      = bestCharge;
	lastBestChargeScore = bestScore;

	if (bestScore >= 0.65 && bestCharge >= 1) {
		return bestCharge;
	}
	return null;
}

function extractFullIcon(buff: any): ImageData | null {
	const buf = buff.buffer as ImageData;
	const bx  = buff.bufferx as number;
	const by  = buff.buffery as number;
	if (bx + 27 > buf.width || by + 27 > buf.height) return null;
	const icon = new ImageData(27, 27);
	for (let y = 0; y < 27; y++) {
		for (let x = 0; x < 27; x++) {
			const si = ((by + y) * buf.width + (bx + x)) * 4;
			const di = (y * 27 + x) * 4;
			icon.data[di]     = buf.data[si];
			icon.data[di + 1] = buf.data[si + 1];
			icon.data[di + 2] = buf.data[si + 2];
			icon.data[di + 3] = buf.data[si + 3];
		}
	}
	return icon;
}

// ── Charge display ────────────────────────────────────────────────────────────

function nextCharge(): number {
	return data.lastCharge;
}

function updateChargeDisplay(): void {
	const el = document.getElementById("charge-display");
	if (el) el.textContent = String(nextCharge());
}

// ── Recording ─────────────────────────────────────────────────────────────────

function iconToPixels(icon: ImageData): string {
	const bytes = new Uint8Array(icon.data.buffer);
	let binary = "";
	for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
	return btoa(binary);
}

function sendIconToServer(rune: string, charge: number | null, icon: ImageData, uncertain: boolean): void {
	fetch("http://localhost:8080/save-buff", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ rune, charge: charge ?? "unknown", pixels: iconToPixels(icon), uncertain }),
	}).then(r => r.json()).then((j: any) => {
		if (j.ok) addDebug(`Saved${uncertain ? " (uncertain)" : ""}: ${j.file}`);
	}).catch(() => {});
}

function saveBuffScreenshot(runeName: string, chargeLevel: number | null, uncertain = false): void {
	if (!lastMatchedBuff) return;
	const icon = extractFullIcon(lastMatchedBuff);
	if (!icon) return;
	sendIconToServer(runeName, chargeLevel, icon, uncertain);
}

function recordReading(runeName: string, chargeLevel: number): void {
	if (!data.counts[chargeLevel]) data.counts[chargeLevel] = {};
	data.counts[chargeLevel][runeName] = (data.counts[chargeLevel][runeName] ?? 0) + 1;
	data.totalReadings++;
	data.lastCharge         = chargeLevel;
	data.lastRecordedRune   = runeName;
	data.lastRecordedCharge = chargeLevel;

	saveData();
	updateChargeDisplay();
	setStatus(`Recorded: ${runeName} at charge ${chargeLevel} (total: ${data.totalReadings})`);
	addDebug(`Recorded ${runeName} @ charge ${chargeLevel}`);
	renderAll();
	saveBuffScreenshot(runeName, chargeLevel);
}

// ── Preview ───────────────────────────────────────────────────────────────────

function updateBuffPreviews(): void {
	const container = document.getElementById("buff-previews");
	if (!container) return;
	container.innerHTML = "";

	for (const { icon, matched } of lastAllIcons) {
		const canvas = document.createElement("canvas");
		canvas.width  = 27;
		canvas.height = 27;
		canvas.getContext("2d")!.putImageData(icon, 0, 0);
		canvas.className = "buff-thumb" + (matched ? " buff-thumb--matched" : "");
		container.appendChild(canvas);
	}
}

// ── Polling ───────────────────────────────────────────────────────────────────

function startPolling(): void {
	buffReader = new BuffReaderModule.default();
	addDebug("Polling started");

	setInterval(() => {
		try {
			pollCount++;
			const isHeartbeat = pollCount === 1 || pollCount % 10 === 0;

			if (!window.alt1 || !alt1.permissionPixel) {
				if (isHeartbeat) addDebug(`Poll ${pollCount}: no pixel permission`);
				return;
			}
			if (pollCount % 10 === 0) {
				const el = document.getElementById("poll-count");
				if (el) el.textContent = `Polls: ${pollCount}`;
			}

			const br = buffReader!;
			let found: true | null = null;
			try { found = br.find(); } catch (e) { addDebug(`find() error: ${e}`); return; }

			if (!found) {
				if (lastSeenRune !== null || pendingCount > 0) {
					addDebug("Buff lost");
					pendingRune   = null;
					pendingCharge = null;
					pendingCount      = 0;
					lastTrackedCharge = null;
					inUncertainMode   = false;
					snapshotBuffer.length = 0;
					lastAllIcons = [];
					updateBuffPreviews();
				} else if (isHeartbeat) {
					addDebug(`Poll ${pollCount}: no buff`);
				}
				return;
			}

			let buffs: any[] | null = null;
			try { buffs = br.read(); } catch (e) { addDebug(`read() error: ${e}`); return; }
			if (!buffs || buffs.length === 0) return;

			if (buffs.length !== lastBuffCount) {
				addDebug(`BuffReader: ${buffs.length} buff(s)`);
				lastBuffCount = buffs.length;
			}

			// Extract icons for all non-debuff slots and find the Runic Attuner among them.
			const nonDebuffs = (buffs as any[]).filter(b => !b.isdebuff);
			if (nonDebuffs.length === 0) return;

			let matchedBuff: any = null;
			let matchedResult: { name: string; score: number } | null = null;
			for (const buff of nonDebuffs) {
				const m = identifyRune(buff);
				if (m) { matchedBuff = buff; matchedResult = m; break; }
			}

			// Rebuild preview list — all icons, with the matched one highlighted.
			lastAllIcons = nonDebuffs.map(b => ({
				icon:    extractFullIcon(b) ?? new ImageData(27, 27),
				matched: b === matchedBuff,
			}));
			updateBuffPreviews();

			if (!matchedResult) {
				if (isHeartbeat) addDebug(`Poll ${pollCount}: ${nonDebuffs.length} buff(s) visible, none matched (templates loading?)`);
				return;
			}

			const { name: runeName, score } = matchedResult;
			lastMatchedBuff = matchedBuff;
			const charge = readCharge(matchedBuff);
			updateDebugCanvas(matchedBuff);

			if (!inUncertainMode) {
				const snapshotIcon = extractFullIcon(matchedBuff);
				const last = snapshotBuffer[snapshotBuffer.length - 1];
				if (snapshotIcon && (!last || last.rune !== runeName || last.charge !== charge)) {
					snapshotBuffer.push({ rune: runeName, charge, icon: snapshotIcon });
					if (snapshotBuffer.length > SNAPSHOT_BUFFER_SIZE) snapshotBuffer.shift();
				}
			}

			// Stability gate: only commit a (rune, charge) pair after it has been
			// seen consistently for STABLE_POLLS consecutive polls.
			if (runeName === pendingRune && charge === pendingCharge) {
				pendingCount++;
			} else {
				pendingRune   = runeName;
				pendingCharge = charge;
				pendingCount  = 1;
				if (runeName !== lastSeenRune || charge !== lastSeenCharge) {
					addDebug(`Detected: ${runeName} (score=${score.toFixed(3)}) charge=${charge ?? "?"} — waiting for stability (${STABLE_POLLS} polls)`);
				}
			}

			if (pendingCount === STABLE_POLLS && (runeName !== lastSeenRune || charge !== lastSeenCharge)) {
				addDebug(`Stable: ${runeName} charge=${charge ?? "?"}`);

				const expectedNext = lastTrackedCharge !== null
					? (lastTrackedCharge % MAX_CHARGE) + 1
					: null;
				const isSequential = charge !== null && charge > 0
					&& (expectedNext === null || charge === expectedNext);

				if (charge !== null && charge > 0) lastTrackedCharge = charge;

				if (charge !== null) {
					data.lastCharge = charge === MAX_CHARGE ? 0 : charge;
					updateChargeDisplay();

					if (charge !== lastSeenCharge && charge !== 0) {
						if (!inUncertainMode && !isSequential && expectedNext !== null) {
							inUncertainMode = true;
							const n = snapshotBuffer.length;
							addDebug(`Gap: expected charge ${expectedNext}, got ${charge}` +
								(n > 0 ? ` — saving ${n} buffered frame(s) as uncertain` : " — entering uncertain mode"));
							for (const s of snapshotBuffer) sendIconToServer(s.rune, s.charge, s.icon, true);
							snapshotBuffer.length = 0;
						} else if (inUncertainMode) {
							if (isSequential) {
								inUncertainMode = false;
								addDebug(`Sequence resumed at charge ${charge}`);
								snapshotBuffer.length = 0;
								if (runeName !== "Any") recordReading(runeName, charge);
								else saveBuffScreenshot("Any", charge);
							} else {
								saveBuffScreenshot(runeName, charge, true);
							}
						} else {
							if (runeName !== "Any") recordReading(runeName, charge);
							else saveBuffScreenshot("Any", charge);
							snapshotBuffer.length = 0;
						}
					}
				} else {
					if (!inUncertainMode) {
						inUncertainMode = true;
						const n = snapshotBuffer.length;
						addDebug(`Charge unreadable` +
							(n > 0 ? ` — flushing ${n} frame(s) as uncertain` : " — entering uncertain mode"));
						for (const s of snapshotBuffer) sendIconToServer(s.rune, s.charge, s.icon, true);
						snapshotBuffer.length = 0;
					}
					saveBuffScreenshot(runeName, null, true);
				}

				lastSeenRune   = runeName;
				lastSeenCharge = charge;
			} else if (isHeartbeat && pendingCount >= STABLE_POLLS) {
				addDebug(`Poll ${pollCount}: holding ${runeName} charge=${charge ?? "?"}`);
			}
		} catch (err) {
			addDebug(`Poll ${pollCount} error: ${String(err)}`);
		}
	}, POLL_MS);
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function updateDebugCanvas(buff: any): void {
	const buf = buff.buffer as ImageData;
	const bx  = buff.bufferx as number;
	const by  = buff.buffery as number;
	const SCALE_ICON = 4;
	const SCALE_OCR  = 8;
	// OCR region: rows 14-24 (11px tall), cols 1-15 (15px wide) of the 27×27 icon
	const OCR_ROW0 = 14, OCR_ROWS = 11;
	const OCR_COL0 =  1, OCR_COLS = 15;

	const iconCanvas = document.getElementById("debug-icon") as HTMLCanvasElement | null;
	if (iconCanvas) {
		const ctx = iconCanvas.getContext("2d")!;
		ctx.clearRect(0, 0, iconCanvas.width, iconCanvas.height);
		// Draw the 27×27 icon at 4× scale
		for (let y = 0; y < 27; y++) {
			for (let x = 0; x < 27; x++) {
				const si = ((by + y) * buf.width + (bx + x)) * 4;
				ctx.fillStyle = `rgb(${buf.data[si]},${buf.data[si+1]},${buf.data[si+2]})`;
				ctx.fillRect(x * SCALE_ICON, y * SCALE_ICON, SCALE_ICON, SCALE_ICON);
			}
		}
		// Overlay the OCR scan region in semi-transparent yellow
		ctx.fillStyle = "rgba(255,220,0,0.25)";
		ctx.fillRect(OCR_COL0 * SCALE_ICON, OCR_ROW0 * SCALE_ICON, OCR_COLS * SCALE_ICON, OCR_ROWS * SCALE_ICON);
		ctx.strokeStyle = "rgba(255,220,0,0.8)";
		ctx.lineWidth = 1;
		ctx.strokeRect(OCR_COL0 * SCALE_ICON + 0.5, OCR_ROW0 * SCALE_ICON + 0.5, OCR_COLS * SCALE_ICON - 1, OCR_ROWS * SCALE_ICON - 1);
	}

	const ocrCanvas = document.getElementById("debug-ocr") as HTMLCanvasElement | null;
	if (ocrCanvas) {
		const ctx = ocrCanvas.getContext("2d")!;
		ctx.clearRect(0, 0, ocrCanvas.width, ocrCanvas.height);
		for (let y = 0; y < OCR_ROWS; y++) {
			for (let x = 0; x < OCR_COLS; x++) {
				const si = ((by + OCR_ROW0 + y) * buf.width + (bx + OCR_COL0 + x)) * 4;
				ctx.fillStyle = `rgb(${buf.data[si]},${buf.data[si+1]},${buf.data[si+2]})`;
				ctx.fillRect(x * SCALE_OCR, y * SCALE_OCR, SCALE_OCR, SCALE_OCR);
			}
		}
	}

	// ── Rune template + match diff ─────────────────────────────────────────────
	// Template pixels are matched at (bufferx+1, buffery+1) — the inner 25×25 area.
	const tmpl = lastMatchedTemplate;
	const TMPL_W = tmpl ? tmpl.width  : 25;
	const TMPL_H = tmpl ? tmpl.height : 25;
	const SCALE_TMPL = 4;

	const tmplCanvas = document.getElementById("debug-rune-tmpl") as HTMLCanvasElement | null;
	if (tmplCanvas) {
		const ctx = tmplCanvas.getContext("2d")!;
		ctx.clearRect(0, 0, tmplCanvas.width, tmplCanvas.height);
		for (let ty = 0; ty < TMPL_H; ty++) {
			for (let tx = 0; tx < TMPL_W; tx++) {
				const iconSi = ((by + 1 + ty) * buf.width + (bx + 1 + tx)) * 4;
				const iR = buf.data[iconSi], iG = buf.data[iconSi+1], iB = buf.data[iconSi+2];
				if (tmpl) {
					const ti = (ty * TMPL_W + tx) * 4;
					const tA = tmpl.data[ti + 3];
					if (tA === 255) {
						// Opaque template pixel — show template colour
						ctx.fillStyle = `rgb(${tmpl.data[ti]},${tmpl.data[ti+1]},${tmpl.data[ti+2]})`;
					} else {
						// Transparent (skipped) — show icon pixel dimmed
						ctx.fillStyle = `rgba(${iR},${iG},${iB},0.35)`;
					}
				} else {
					ctx.fillStyle = `rgb(${iR},${iG},${iB})`;
				}
				ctx.fillRect(tx * SCALE_TMPL, ty * SCALE_TMPL, SCALE_TMPL, SCALE_TMPL);
			}
		}
	}

	const diffCanvas = document.getElementById("debug-rune-diff") as HTMLCanvasElement | null;
	if (diffCanvas) {
		const ctx = diffCanvas.getContext("2d")!;
		ctx.clearRect(0, 0, diffCanvas.width, diffCanvas.height);
		for (let ty = 0; ty < TMPL_H; ty++) {
			for (let tx = 0; tx < TMPL_W; tx++) {
				const iconSi = ((by + 1 + ty) * buf.width + (bx + 1 + tx)) * 4;
				const iR = buf.data[iconSi], iG = buf.data[iconSi+1], iB = buf.data[iconSi+2];
				if (tmpl) {
					const ti = (ty * TMPL_W + tx) * 4;
					const tA = tmpl.data[ti + 3];
					if (tA !== 255) {
						// Transparent template pixel — show icon pixel dimmed
						ctx.fillStyle = `rgba(${iR},${iG},${iB},0.35)`;
					} else if (iR === 255 && iG === 255 && iB === 255) {
						// White icon pixel — countMatch skips these (buff time text)
						ctx.fillStyle = "rgba(255,200,0,0.9)";
					} else if (iR === 0 && iG === 0 && iB === 0) {
						// Black icon pixel — countMatch skips these
						ctx.fillStyle = "rgba(255,200,0,0.9)";
					} else {
						// Tested pixel — pass (green) or fail (red)
						const tR = tmpl.data[ti], tG = tmpl.data[ti+1], tB = tmpl.data[ti+2];
						const coldif = Math.abs(iR-tR) + Math.abs(iG-tG) + Math.abs(iB-tB);
						ctx.fillStyle = coldif <= 35 ? "rgba(0,200,80,0.85)" : "rgba(220,40,40,0.85)";
					}
				} else {
					ctx.fillStyle = `rgb(${iR},${iG},${iB})`;
				}
				ctx.fillRect(tx * SCALE_TMPL, ty * SCALE_TMPL, SCALE_TMPL, SCALE_TMPL);
			}
		}
	}

	// ── Charge detection debug ─────────────────────────────────────────────────
	// Region: icon rows 12–26, cols 0–24 (25×15), displayed at 4× scale = 100×60.
	const CMW = 25, CMH = 15, SCALE_CHARGE = 4;

	// Binarize charge region for display: 1=bright, 2=dark/shadow, 0=background.
	const chargeMini = new Uint8Array(CMW * CMH);
	for (let r = 0; r < CMH; r++) {
		for (let c = 0; c < CMW; c++) {
			const si = ((by + 12 + r) * buf.width + (bx + c)) * 4;
			const R = buf.data[si], G = buf.data[si+1], B = buf.data[si+2];
			if (R > 190 && G > 190 && B > 190)   chargeMini[r * CMW + c] = 1;
			else if (R < 80 && G < 80 && B < 80) chargeMini[r * CMW + c] = 2;
		}
	}

	// Canvas 1: binarized mini — white=bright, mid-grey=dark/shadow, dark=background
	const miniCanvas = document.getElementById("debug-charge-mini") as HTMLCanvasElement | null;
	if (miniCanvas) {
		const ctx = miniCanvas.getContext("2d")!;
		ctx.clearRect(0, 0, miniCanvas.width, miniCanvas.height);
		for (let r = 0; r < CMH; r++) {
			for (let c = 0; c < CMW; c++) {
				const v = chargeMini[r * CMW + c];
				ctx.fillStyle = v === 1 ? "#ffffff" : v === 2 ? "#888888" : "#2a2a2a";
				ctx.fillRect(c * SCALE_CHARGE, r * SCALE_CHARGE, SCALE_CHARGE, SCALE_CHARGE);
			}
		}
	}

	// Canvas 2: best matching charge template — white=bright pixel, grey=shadow pixel
	const chargeTmplCanvas = document.getElementById("debug-charge-tmpl") as HTMLCanvasElement | null;
	if (chargeTmplCanvas) {
		const ctx = chargeTmplCanvas.getContext("2d")!;
		ctx.clearRect(0, 0, chargeTmplCanvas.width, chargeTmplCanvas.height);
		const cTmpl = lastBestCharge >= 1
			? (CHARGE_TEMPLATES as any)[`n${lastBestCharge}`] as ImageData | null
			: null;
		for (let r = 0; r < CMH; r++) {
			for (let c = 0; c < CMW; c++) {
				const i = r * CMW + c;
				const alpha = cTmpl ? cTmpl.data[i * 4 + 3] : 0;
				ctx.fillStyle = alpha === 255 ? "#ffffff" : alpha === 128 ? "#666666" : "#2a2a2a";
				ctx.fillRect(c * SCALE_CHARGE, r * SCALE_CHARGE, SCALE_CHARGE, SCALE_CHARGE);
			}
		}
		if (lastBestCharge >= 1) {
			ctx.fillStyle = lastBestChargeScore >= 0.65 ? "#00e060" : "#ff4040";
			ctx.font = "bold 9px monospace";
			ctx.fillText(`${lastBestCharge} (${(lastBestChargeScore * 100).toFixed(0)}%)`, 2, CMH * SCALE_CHARGE - 2);
		}
	}

	// Canvas 3: diff
	//   green  = white template pixel, white mini (bright hit)
	//   red    = white template pixel, not white mini (bright miss)
	//   teal   = shadow template pixel, dark mini (shadow hit)
	//   orange = shadow template pixel, not dark mini (shadow miss)
	//   #555   = transparent template, but mini has a bright pixel
	//   #2a2a2a = transparent template, background
	const chargeDiffCanvas = document.getElementById("debug-charge-diff") as HTMLCanvasElement | null;
	if (chargeDiffCanvas) {
		const ctx = chargeDiffCanvas.getContext("2d")!;
		ctx.clearRect(0, 0, chargeDiffCanvas.width, chargeDiffCanvas.height);
		const cTmpl = lastBestCharge >= 1
			? (CHARGE_TEMPLATES as any)[`n${lastBestCharge}`] as ImageData | null
			: null;
		for (let r = 0; r < CMH; r++) {
			for (let c = 0; c < CMW; c++) {
				const i     = r * CMW + c;
				const alpha = cTmpl ? cTmpl.data[i * 4 + 3] : 0;
				const mv    = chargeMini[i];
				let color: string;
				if (alpha === 255) {
					color = mv === 1 ? "rgba(0,200,80,0.9)"  : "rgba(220,40,40,0.9)";
				} else if (alpha === 128) {
					color = mv === 2 ? "rgba(0,200,200,0.9)" : "rgba(255,140,0,0.9)";
				} else {
					color = mv === 1 ? "#555" : "#2a2a2a";
				}
				ctx.fillStyle = color;
				ctx.fillRect(c * SCALE_CHARGE, r * SCALE_CHARGE, SCALE_CHARGE, SCALE_CHARGE);
			}
		}
	}
}

function setStatus(msg: string): void {
	const el = document.getElementById("status");
	if (el) el.textContent = msg;
}

function addDebug(msg: string): void {
	const time = new Date().toLocaleTimeString();
	debugLog.unshift(`[${time}] ${msg}`);
	if (debugLog.length > 60) debugLog.pop();
	const el = document.getElementById("debug-log");
	if (el) el.innerHTML = debugLog.map(l => `<div>${l}</div>`).join("");
}

// ── Cell editor popover ───────────────────────────────────────────────────────

function closePopover(): void {
	if (activePopover) { activePopover.remove(); activePopover = null; }
}

function showCellEditor(charge: number, runeName: string, anchorEl: HTMLElement): void {
	closePopover();

	const pop = document.createElement("div");
	pop.className = "cell-popover";

	function render(): void {
		const count = data.counts[charge]?.[runeName] ?? 0;
		pop.innerHTML = `
			<div class="cell-popover-title">Charge ${charge} — ${runeName}</div>
			<div class="cell-popover-count">Count: <strong>${count}</strong></div>
			<div class="cell-popover-actions">
				<button id="pop-dec" ${count <= 0 ? "disabled" : ""}>−1</button>
				<button id="pop-inc">+1</button>
				<button id="pop-clear" ${count <= 0 ? "disabled" : ""}>Clear</button>
			</div>`;

		pop.querySelector("#pop-dec")?.addEventListener("click", (e) => {
			e.stopPropagation();
			adjustCount(-1);
		});
		pop.querySelector("#pop-inc")?.addEventListener("click", (e) => {
			e.stopPropagation();
			adjustCount(+1);
		});
		pop.querySelector("#pop-clear")?.addEventListener("click", (e) => {
			e.stopPropagation();
			const c = data.counts[charge]?.[runeName] ?? 0;
			if (c > 0) adjustCount(-c);
		});
	}

	function adjustCount(delta: number): void {
		if (!data.counts[charge]) data.counts[charge] = {};
		const current = data.counts[charge][runeName] ?? 0;
		const newCount = current + delta;
		if (newCount <= 0) {
			delete data.counts[charge][runeName];
			if (Object.keys(data.counts[charge]).length === 0) delete data.counts[charge];
		} else {
			data.counts[charge][runeName] = newCount;
		}
		data.totalReadings = Object.values(data.counts)
			.flatMap(r => Object.values(r))
			.reduce((s, c) => s + c, 0);
		saveData();
		renderAll();
	}

	render();
	document.body.appendChild(pop);
	activePopover = pop;

	const rect = anchorEl.getBoundingClientRect();
	pop.style.left = `${Math.max(0, Math.min(rect.left, window.innerWidth - 160))}px`;
	pop.style.top  = `${rect.bottom + 4}px`;

	pop.addEventListener("click", (e) => e.stopPropagation());
	setTimeout(() => document.addEventListener("click", closePopover, { once: true }), 0);
}

function renderTable(): void {
	closePopover();
	const container = document.getElementById("table-container")!;

	const runeNames = Array.from(
		new Set(Object.values(data.counts).flatMap(l => Object.keys(l)))
	).sort();

	if (runeNames.length === 0) {
		container.innerHTML = '<p class="hint">No data yet — start runecrafting with the Runic Attuner equipped.</p>';
		updateStats();
		return;
	}

	const table = document.createElement("table");

	// Header
	const thead = document.createElement("thead");
	const hrow  = document.createElement("tr");
	const levelTh = document.createElement("th");
	levelTh.className = "level-col";
	levelTh.textContent = "Charge";
	hrow.appendChild(levelTh);

	for (const runeName of runeNames) {
		const th  = document.createElement("th");
		const div = document.createElement("div");
		div.className = "rune-header";

		const imgUrl = RUNE_IMAGE_URLS[runeName];
		if (imgUrl) {
			const img = document.createElement("img");
			img.src = imgUrl;
			img.alt = runeName;
			img.width = 27;
			img.height = 27;
			div.appendChild(img);
		}

		const nameSpan = document.createElement("span");
		nameSpan.className = "rune-name";
		nameSpan.textContent = runeName;
		div.appendChild(nameSpan);
		th.appendChild(div);
		hrow.appendChild(th);
	}
	thead.appendChild(hrow);
	table.appendChild(thead);

	// Body
	const tbody = document.createElement("tbody");
	for (let level = 0; level <= MAX_CHARGE; level++) {
		const row = document.createElement("tr");
		if (CHOICE_LEVELS.has(level)) row.className = "choice-row";

		const levelTd = document.createElement("td");
		levelTd.className = "level-col";
		levelTd.textContent = String(level);
		if (CHOICE_LEVELS.has(level)) {
			const badge = document.createElement("span");
			badge.className = "choice-badge";
			badge.title = "Player-choice level";
			badge.textContent = "C";
			levelTd.appendChild(badge);
		}
		row.appendChild(levelTd);

		const levelCounts = data.counts[level] ?? {};
		const total    = Object.values(levelCounts).reduce((s, c) => s + c, 0);
		const maxCount = total > 0 ? Math.max(...Object.values(levelCounts)) : 0;

		for (const runeName of runeNames) {
			const td    = document.createElement("td");
			const count = levelCounts[runeName] ?? 0;
			if (count > 0) {
				const pct = Math.round((count / total) * 100);
				td.className = count === maxCount ? "has-data top-rune" : "has-data";
				td.innerHTML = `<span class="count">${count}</span>` +
					(total > 1 ? `<span class="pct">${pct}%</span>` : "");
				const capturedLevel = level;
				const capturedRune  = runeName;
				td.addEventListener("click", (e) => {
					e.stopPropagation();
					showCellEditor(capturedLevel, capturedRune, td);
				});
			}
			row.appendChild(td);
		}
		tbody.appendChild(row);
	}
	table.appendChild(tbody);

	container.innerHTML = "";
	container.appendChild(table);
	updateStats();
}

function updateStats(): void {
	const el = document.getElementById("stats");
	if (!el) return;
	const tracked = Object.keys(data.counts).length;
	el.textContent =
		`${data.totalReadings} readings · ${tracked}/${MAX_CHARGE} charge levels seen · last charge: ${data.lastCharge ?? "—"}`;
}

// ── Visualizations ────────────────────────────────────────────────────────────

function vizActiveRunes(includeAny = false): string[] {
	const seen = new Set<string>(
		Object.values(data.counts).flatMap(lvl => Object.keys(lvl))
	);
	const runes = RUNE_TIER_ORDER.filter(r => seen.has(r));
	if (includeAny && seen.has("Any")) runes.push("Any");
	return runes;
}

function getVizCtx(containerId: string, w: number, h: number): CanvasRenderingContext2D | null {
	const el = document.getElementById(containerId);
	if (!el) return null;
	let cv = el.querySelector<HTMLCanvasElement>("canvas");
	if (!cv) { cv = document.createElement("canvas"); cv.className = "viz-canvas"; el.appendChild(cv); }
	cv.width = w; cv.height = h;
	const ctx = cv.getContext("2d")!;
	ctx.clearRect(0, 0, w, h);
	return ctx;
}

function renderHeatmap(): void {
	const runes = vizActiveRunes();
	if (!runes.length) return;
	const ML = 52, MT = 18, CW = 7, CH = 15;
	const W = ML + 50 * CW + 4, H = MT + runes.length * CH + 4;
	const ctx = getVizCtx("heatmap-container", W, H);
	if (!ctx) return;

	ctx.fillStyle = "#1a1a2e";
	ctx.fillRect(0, 0, W, H);

	ctx.font = "9px monospace"; ctx.textAlign = "center"; ctx.fillStyle = "#64748b";
	for (let c = 0; c <= 49; c++)
		if (c === 0 || c % 7 === 0)
			ctx.fillText(String(c), ML + c * CW + CW / 2, MT - 5);

	for (let ri = 0; ri < runes.length; ri++) {
		const rune = runes[ri];
		const y = MT + ri * CH;
		ctx.font = "9px sans-serif"; ctx.textAlign = "right"; ctx.fillStyle = "#94a3b8";
		ctx.fillText(rune, ML - 3, y + CH - 3);

		for (let c = 0; c <= 49; c++) {
			const lvl = data.counts[c] ?? {};
			const tot = Object.values(lvl).reduce((s, v) => s + v, 0);
			const pct = tot > 0 ? (lvl[rune] ?? 0) / tot : 0;
			const x   = ML + c * CW;
			ctx.fillStyle = CHOICE_LEVELS.has(c) ? "#0e2a45" : "#10101e";
			ctx.fillRect(x, y, CW - 1, CH - 1);
			if (pct > 0) {
				ctx.fillStyle = `rgba(192,132,252,${(tot < 3 ? pct * 0.3 : pct).toFixed(3)})`;
				ctx.fillRect(x, y, CW - 1, CH - 1);
				if (pct > 0.5) {
					ctx.fillStyle = `rgba(251,191,36,${(((pct - 0.5) / 0.5) * 0.55).toFixed(3)})`;
					ctx.fillRect(x, y, CW - 1, CH - 1);
				}
			}
		}
	}
}

function renderDistributionStrips(): void {
	const runes = vizActiveRunes(true);
	if (!runes.length) return;
	const COLS = 3, PW = 130, PH = 65;
	const ctx = getVizCtx("strips-container", COLS * PW, Math.ceil(runes.length / COLS) * PH);
	if (!ctx) return;
	ctx.fillStyle = "#1a1a2e";
	ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

	for (let ri = 0; ri < runes.length; ri++) {
		const rune  = runes[ri];
		const ox    = (ri % COLS) * PW, oy = Math.floor(ri / COLS) * PH;
		const color = RUNE_COLORS[rune] ?? "#c084fc";
		const PL = 4, PR = 4, PT = 13, PB = 13;
		const cW = PW - PL - PR, cH = PH - PT - PB;

		ctx.fillStyle = "#16213e";
		ctx.fillRect(ox + 2, oy + 2, PW - 4, PH - 4);
		ctx.fillStyle = color; ctx.font = "bold 9px sans-serif"; ctx.textAlign = "left";
		ctx.fillText(rune, ox + PL, oy + 10);

		let maxC = 0;
		for (let c = 0; c <= 49; c++) maxC = Math.max(maxC, data.counts[c]?.[rune] ?? 0);
		if (!maxC) continue;

		ctx.fillStyle = "#2a2a3a";
		ctx.fillRect(ox + PL, oy + PT + cH, cW, 1);
		ctx.fillStyle = "#555"; ctx.font = "7px monospace"; ctx.textAlign = "center";
		const bw = cW / 50;
		for (const c of [0, 14, 28, 42, 49])
			ctx.fillText(String(c), ox + PL + c * bw + bw / 2, oy + PH - 2);

		for (let c = 0; c <= 49; c++) {
			const count = data.counts[c]?.[rune] ?? 0;
			if (!count) continue;
			const bh = Math.max(1, (count / maxC) * cH);
			ctx.fillStyle = CHOICE_LEVELS.has(c) ? "#fbbf24" : color;
			ctx.fillRect(ox + PL + c * bw, oy + PT + cH - bh, Math.max(1, bw - 0.5), bh);
		}
	}
}

function renderStackedBar(): void {
	const ML = 28, MR = 4, MT = 8, MB = 16, BARW = 7, CHART_H = 120;
	const allRunes = [...RUNE_TIER_ORDER, "Any"];
	const LG_COLS = 3, LG_ROW_H = 12;
	const LG_H = Math.ceil(allRunes.length / LG_COLS) * LG_ROW_H + 8;
	const W = ML + 50 * BARW + MR;
	const ctx = getVizCtx("stacked-container", W, MT + CHART_H + MB + LG_H);
	if (!ctx) return;

	let maxTotal = 0;
	for (let c = 0; c <= 49; c++) {
		const t = Object.values(data.counts[c] ?? {}).reduce((s, v) => s + v, 0);
		maxTotal = Math.max(maxTotal, t);
	}
	if (!maxTotal) return;

	ctx.fillStyle = "#1a1a2e";
	ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

	for (const frac of [0, 0.5, 1]) {
		const y = MT + CHART_H - Math.round(frac * CHART_H);
		ctx.fillStyle = "#1e2a3a"; ctx.fillRect(ML, y, 50 * BARW, 1);
		ctx.fillStyle = "#64748b"; ctx.font = "8px monospace"; ctx.textAlign = "right";
		ctx.fillText(String(Math.round(maxTotal * frac)), ML - 2, y + 3);
	}

	ctx.fillStyle = "#64748b"; ctx.font = "9px monospace"; ctx.textAlign = "center";
	for (let c = 0; c <= 49; c++)
		if (c === 0 || c % 7 === 0)
			ctx.fillText(String(c), ML + c * BARW + BARW / 2, MT + CHART_H + MB - 2);

	for (let c = 0; c <= 49; c++) {
		const lvl = data.counts[c] ?? {};
		let stackY = MT + CHART_H;
		for (const rune of allRunes) {
			const count = lvl[rune] ?? 0;
			if (!count) continue;
			const bh = Math.max(1, Math.round((count / maxTotal) * CHART_H));
			stackY -= bh;
			ctx.fillStyle = RUNE_COLORS[rune] ?? "#c084fc";
			ctx.fillRect(ML + c * BARW, stackY, BARW - 1, bh);
		}
	}

	const LG_Y0 = MT + CHART_H + MB + 2;
	const LG_ITEM_W = W / LG_COLS;
	for (let i = 0; i < allRunes.length; i++) {
		const rune = allRunes[i];
		const lx = (i % LG_COLS) * LG_ITEM_W;
		const ly = LG_Y0 + Math.floor(i / LG_COLS) * LG_ROW_H;
		ctx.fillStyle = RUNE_COLORS[rune] ?? "#c084fc";
		ctx.fillRect(lx + 2, ly, 8, 8);
		ctx.fillStyle = "#94a3b8"; ctx.font = "9px sans-serif"; ctx.textAlign = "left";
		ctx.fillText(rune, lx + 13, ly + 8);
	}
}

function renderAll(): void {
	renderTable();
	renderHeatmap();
	renderDistributionStrips();
	renderStackedBar();
}

function exportData(): void {
	const json = JSON.stringify(data, null, 2);
	const blob = new Blob([json], { type: "application/json" });
	const url  = URL.createObjectURL(blob);
	const a    = document.createElement("a");
	a.href     = url;
	a.download = "runic-attuner-data.json";
	a.click();
	URL.revokeObjectURL(url);
}

// ── Init ──────────────────────────────────────────────────────────────────────

function setupAlt1(): void {
	alt1.identifyAppUrl("./appconfig.json");
	if (!alt1.permissionPixel) {
		setStatus("Pixel capture permission not granted — enable it in Alt1 app settings.");
		return;
	}
	setStatus("Monitoring buff bar for Runic Attuner...");
	startPolling();
}

function init(): void {
	document.getElementById("export-btn")?.addEventListener("click", exportData);

	const resetBtn = document.getElementById("reset-btn")!;
	let resetPending = false;
	resetBtn.addEventListener("click", () => {
		if (!resetPending) {
			resetPending = true;
			resetBtn.textContent = "Confirm reset?";
			setTimeout(() => { resetPending = false; resetBtn.textContent = "Reset Data"; }, 3000);
			return;
		}
		resetPending = false;
		resetBtn.textContent = "Reset Data";
		data = { counts: {}, totalReadings: 0, lastCharge: 0, lastRecordedRune: null, lastRecordedCharge: null };
		lastSeenRune   = null;
		lastSeenCharge = null;
		saveData();
		updateChargeDisplay();
		renderAll();
		setStatus("Data reset.");
	});

	document.getElementById("charge-dec")?.addEventListener("click", () => {
		data.lastCharge = data.lastCharge <= 0 ? MAX_CHARGE : data.lastCharge - 1;
		saveData();
		updateChargeDisplay();
		addDebug(`Manual charge → next: ${nextCharge()}`);
	});

	document.getElementById("charge-inc")?.addEventListener("click", () => {
		data.lastCharge = data.lastCharge >= MAX_CHARGE ? 0 : data.lastCharge + 1;
		saveData();
		updateChargeDisplay();
		addDebug(`Manual charge → next: ${nextCharge()}`);
	});

	document.getElementById("log-btn")?.addEventListener("click", () => {
		if (!lastSeenRune) { addDebug("Log now: no buff detected"); return; }
		const charge = lastSeenCharge ?? nextCharge();
		recordReading(lastSeenRune, charge);
		addDebug(`Manual log: ${lastSeenRune} @ charge ${charge}`);
	});

	document.getElementById("save-btn")?.addEventListener("click", () => {
		if (!lastMatchedBuff) { addDebug("Save buff: no buff detected"); return; }
		const rune   = lastSeenRune;
		const charge = lastSeenCharge;
		saveBuffScreenshot(rune ?? "unknown", charge);
		addDebug(`Manual save: ${rune ?? "unknown"} charge=${charge ?? "unknown"}`);
	});


	updateChargeDisplay();
	renderAll();

	if (window.alt1) { setupAlt1(); return; }

	setStatus("Waiting for Alt1...");
	const wait = setInterval(() => {
		if (!window.alt1) return;
		clearInterval(wait);
		setupAlt1();
	}, 200);
}

// ── Console debug helper ──────────────────────────────────────────────────────
// Call window.__debugCharge() in the dev console to dump mini-buffer pixel data
// and per-digit scores for the currently-visible buff.
(window as any).__debugCharge = function () {
	const buff = lastMatchedBuff;
	if (!buff) { console.log("No buff captured yet"); return; }

	const buf = buff.buffer as ImageData;
	const bx  = buff.bufferx as number;
	const by  = buff.buffery as number;
	const MW = 25, MH = 15;

	// Raw pixels
	const rawRows: string[] = [];
	const mini = new ImageData(MW, MH);
	for (let r = 0; r < MH; r++) {
		const row: string[] = [];
		for (let c = 0; c < MW; c++) {
			const si = ((by + 12 + r) * buf.width + (bx + c)) * 4;
			const R = buf.data[si], G = buf.data[si+1], B = buf.data[si+2];
			const brightness = (R + G + B) / 3;
			const colorfulness = Math.max(Math.abs(R-G), Math.abs(G-B), Math.abs(R-B));
			const val = (brightness > 190 && colorfulness < 80) ? 255 : 0;
			const di = (r * MW + c) * 4;
			mini.data[di] = mini.data[di+1] = mini.data[di+2] = val;
			mini.data[di+3] = 255;
			row.push(val ? "X" : (brightness > 150 ? "." : " "));
		}
		rawRows.push(`r${String(r).padStart(2,"0")}: ${row.join("")}   [raw brightnesses: ${
			Array.from({length: MW}, (_, c) => {
				const si2 = ((by + 12 + r) * buf.width + (bx + c)) * 4;
				return Math.round((buf.data[si2]+buf.data[si2+1]+buf.data[si2+2])/3);
			}).join(",")
		}]`);
	}
	console.log("=== Mini buffer (X=binarized white, .=dim, ' '=dark) ===");
	rawRows.forEach(l => console.log(l));

	// Score each digit at multiple positions
	const digits = pixel8Font.chars.filter((c: any) => c.chr >= "0" && c.chr <= "9");
	function scoreAt(yTop: number, x: number, tmpl: any): number {
		let bright = 0, hit = 0;
		for (let i = 0; i + 3 < tmpl.pixels.length; i += 4) {
			if (tmpl.pixels[i+3] === 0) continue;
			bright++;
			const px = tmpl.pixels[i], py = tmpl.pixels[i+1];
			if (yTop + py >= MH || x + px >= MW) continue;
			if (mini.data[((yTop + py) * MW + (x + px)) * 4] > 200) hit++;
		}
		return bright > 0 ? hit / bright : 0;
	}

	console.log("\n=== Digit scores at yTop=4 (rows, x positions 0..14) ===");
	for (const d of digits) {
		const scores = Array.from({length: 15}, (_, x) => scoreAt(4, x, d).toFixed(2));
		console.log(`  ${d.chr} (w=${d.width}): [${scores.join(", ")}]`);
	}

	// Also dump specific positions with actual pixel values
	console.log("\n=== Raw pixel values at charge digit rows (icon rows 15-23 = mini rows 3-11, cols 0-20) ===");
	for (let r = 3; r <= 11; r++) {
		const cells = Array.from({length: 21}, (_, c) => {
			const si = ((by + 12 + r) * buf.width + (bx + c)) * 4;
			const R = buf.data[si], G = buf.data[si+1], B = buf.data[si+2];
			return `${String(R).padStart(3)}/${String(G).padStart(3)}/${String(B).padStart(3)}`;
		});
		console.log(`r${String(r).padStart(2,"0")}: ${cells.join("  ")}`);
	}

	return { rune: lastSeenRune, charge: lastSeenCharge };
};

init();
