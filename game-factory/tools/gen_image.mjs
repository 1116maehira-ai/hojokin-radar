#!/usr/bin/env node
// game-factory 用 画像生成ツール（Gemini API）
// 使い方:
//   node tools/gen_image.mjs --prompt "..." --out assets/foo.png [--model gemini-3.1-flash-image]
//   複数枚: --prompt を複数回、または --jobs '[{"prompt":"..","out":".."}]'
//
// キーは環境変数 GEMINI_API_KEY、無ければ game-factory/.env.local から読む。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// --- APIキー読み込み ---
function loadKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const envPath = path.join(ROOT, ".env.local");
  if (fs.existsSync(envPath)) {
    const line = fs.readFileSync(envPath, "utf8")
      .split("\n").find((l) => l.startsWith("GEMINI_API_KEY="));
    if (line) return line.slice("GEMINI_API_KEY=".length).trim();
  }
  throw new Error("GEMINI_API_KEY が見つかりません（環境変数 or game-factory/.env.local）");
}

// --- 引数パース ---
function parseArgs(argv) {
  const a = { model: "gemini-3.1-flash-image", jobs: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--prompt") a._prompt = argv[++i];
    else if (k === "--out") a._out = argv[++i];
    else if (k === "--model") a.model = argv[++i];
    else if (k === "--jobs") a.jobs = JSON.parse(argv[++i]);
  }
  if (a._prompt && a._out) a.jobs.push({ prompt: a._prompt, out: a._out });
  return a;
}

// --- 1枚生成 ---
async function generateOne(key, model, prompt, outPath) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${data?.error?.message || JSON.stringify(data)}`);
  }
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const img = parts.find((p) => p.inlineData);
  if (!img) {
    const txt = parts.find((p) => p.text)?.text || "(no image returned)";
    throw new Error(`画像が返りませんでした: ${txt.slice(0, 120)}`);
  }
  const buf = Buffer.from(img.inlineData.data, "base64");
  fs.mkdirSync(path.dirname(path.resolve(ROOT, outPath)), { recursive: true });
  const abs = path.resolve(ROOT, outPath);
  fs.writeFileSync(abs, buf);
  return { out: outPath, bytes: buf.length, mime: img.inlineData.mimeType };
}

async function main() {
  const key = loadKey();
  const args = parseArgs(process.argv.slice(2));
  if (args.jobs.length === 0) {
    console.error('使い方: node tools/gen_image.mjs --prompt "..." --out assets/foo.png');
    process.exit(1);
  }
  const results = [];
  for (const job of args.jobs) {
    try {
      const r = await generateOne(key, args.model, job.prompt, job.out);
      console.log(`✅ ${r.out}  (${r.bytes} bytes, ${r.mime})`);
      results.push({ ok: true, ...r });
    } catch (e) {
      console.log(`❌ ${job.out}  -> ${e.message}`);
      results.push({ ok: false, out: job.out, error: e.message });
    }
  }
  const ok = results.filter((r) => r.ok).length;
  console.log(`\n完了: ${ok}/${results.length} 枚`);
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
