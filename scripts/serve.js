#!/usr/bin/env node
/**
 * Development server: serves dist/ statically and accepts POST /save-buff
 * to persist buff icon screenshots to src/attuner-buffs/ as training data.
 *
 * Usage: node scripts/serve.js   (or: npm run serve)
 */

"use strict";

const http  = require("http");
const fs    = require("fs");
const path  = require("path");
const sharp = require("sharp");

const DIST_DIR      = path.resolve(__dirname, "../dist");
const BUFS_DIR      = path.resolve(__dirname, "../src/captured-buffs");
const UNCERTAIN_DIR = path.resolve(__dirname, "../src/captured-buffs/uncertain");
const PORT          = 8080;

const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js":   "application/javascript; charset=utf-8",
    ".css":  "text/css; charset=utf-8",
    ".png":  "image/png",
    ".json": "application/json; charset=utf-8",
    ".ico":  "image/x-icon",
};

fs.mkdirSync(BUFS_DIR,      { recursive: true });
fs.mkdirSync(UNCERTAIN_DIR, { recursive: true });

const server = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.method === "POST" && req.url === "/save-buff") {
        let body = "";
        req.on("data", chunk => { body += chunk; });
        req.on("end", async () => {
            try {
                const { rune, charge, pixels, uncertain } = JSON.parse(body);
                if (!rune || charge == null || !pixels) throw new Error("Missing rune/charge/pixels");

                // pixels is base64-encoded RGBA data for a 27×27 icon
                const buf = Buffer.from(pixels, "base64");
                if (buf.length !== 27 * 27 * 4) throw new Error(`Bad pixel length: ${buf.length}`);

                // Find next available index for this rune+charge combo
                const saveDir = uncertain ? UNCERTAIN_DIR : BUFS_DIR;
                const prefix = `${rune}_${charge}_`;
                const existing = fs.readdirSync(saveDir).filter(f => f.startsWith(prefix) && f.endsWith(".png"));
                const indices = existing.map(f => { const m = f.match(/_(\d+)\.png$/); return m ? parseInt(m[1], 10) : -1; });
                const nextIdx = indices.length > 0 ? Math.max(...indices) + 1 : 0;

                const outPath = path.join(saveDir, `${rune}_${charge}_${nextIdx}.png`);
                await sharp(buf, { raw: { width: 27, height: 27, channels: 4 } }).png().toFile(outPath);

                console.log(`[save-buff] ${path.basename(outPath)}`);
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ ok: true, file: path.basename(outPath) }));
            } catch (e) {
                console.error("[save-buff] error:", e.message);
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ ok: false, error: String(e.message) }));
            }
        });
        return;
    }

    // Static file serving from dist/
    let urlPath = (req.url || "/").split("?")[0];
    if (urlPath === "/") urlPath = "/index.html";

    const filePath = path.resolve(DIST_DIR, "." + urlPath);
    if (!filePath.startsWith(DIST_DIR + path.sep) && filePath !== DIST_DIR) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
    }

    try {
        const data = fs.readFileSync(filePath);
        const ext  = path.extname(filePath).toLowerCase();
        res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
        res.end(data);
    } catch {
        res.writeHead(404);
        res.end("Not found");
    }
});

server.listen(PORT, () => {
    console.log(`Serving  dist/            → http://localhost:${PORT}`);
    console.log(`Saving   POST /save-buff  → src/captured-buffs/  (move to src/attuner-buffs/ after labeling)`);
});
