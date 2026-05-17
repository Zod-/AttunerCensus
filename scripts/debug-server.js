#!/usr/bin/env node
// Simple HTTP debug receiver. Accepts POST /debug, writes to debug-output.json.
// Run: node scripts/debug-server.js
const http = require("http");
const fs   = require("fs");
const path = require("path");

const PORT    = 8081;
const OUTFILE = path.join(__dirname, "..", "debug-output.json");

const server = http.createServer((req, res) => {
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type");

	if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
	if (req.method !== "POST" || req.url !== "/debug") {
		res.writeHead(404); res.end(); return;
	}

	let body = "";
	req.on("data", chunk => { body += chunk; });
	req.on("end", () => {
		try {
			const data = JSON.parse(body);
			fs.writeFileSync(OUTFILE, JSON.stringify(data, null, 2));
			console.log(`[${new Date().toLocaleTimeString()}] received debug dump (charge=${data.charge ?? "?"}, rune=${data.rune ?? "?"})`);
			res.writeHead(200); res.end("ok");
		} catch (e) {
			console.error("parse error:", e.message);
			res.writeHead(400); res.end("bad json");
		}
	});
});

server.listen(PORT, () => {
	console.log(`Debug server listening on http://localhost:${PORT}/debug`);
	console.log(`Output → ${OUTFILE}`);
});
