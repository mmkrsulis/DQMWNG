#!/usr/bin/env node
/**
 * Public DQM collector for Wonogiri PAUD/SD/SMP.
 * Reads the repository's existing master and UUID snapshot, then visits only
 * public school profile pages. It never logs in, bypasses access controls,
 * or writes into the legacy IKD dataset.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORTAL = "https://kualitas.data.kemendikdasmen.go.id";
const MINISTRY = "Kementerian Pendidikan Dasar dan Menengah";
const FORMS = new Set(["TK", "KB", "SPS", "TPA", "SD", "SMP"]);
const CONCURRENCY = 6;
const REQUEST_TIMEOUT_MS = 30000;
const RETRIES = 3;

function normalizeId(value) {
  return String(value ?? "").trim().toUpperCase();
}

function parseNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const n = Number(String(value).trim().replace("%", "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

function decodeEntities(value) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

export function htmlToText(html) {
  return decodeEntities(
    String(html)
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
  ).trim();
}

export function buildTargetSchools(masterDoc, dqmDoc) {
  const masterRows = masterDoc?.values;
  const dqmRows = dqmDoc?.values;
  if (!Array.isArray(masterRows) || !Array.isArray(dqmRows)) {
    throw new Error("Format master.json atau dqm-nilai.json tidak sesuai.");
  }

  const mh = masterRows[1] || [];
  const dh = dqmRows[0] || [];
  const mi = Object.fromEntries(mh.map((v, i) => [String(v).trim(), i]));
  const di = Object.fromEntries(dh.map((v, i) => [String(v).trim(), i]));
  for (const key of ["BENTUK PENDIDIKAN", "NPSN", "NAMA SATUAN PENDIDIKAN", "KECAMATAN", "KEMENTERIAN PEMBINA"]) {
    if (mi[key] === undefined) throw new Error(`Kolom master tidak ditemukan: ${key}`);
  }
  for (const key of ["NPSN", "UUID", "Nama Sekolah", "Skor DQM", "Kategori", "Dievaluasi", "Lolos", "Gagal", "Belum Dievaluasi", "Total Aktif"]) {
    if (di[key] === undefined) throw new Error(`Kolom DQM tidak ditemukan: ${key}`);
  }

  const dqmByNpsn = new Map();
  for (const row of dqmRows.slice(1)) {
    const npsn = normalizeId(row[di.NPSN]);
    if (npsn && row[di.UUID]) dqmByNpsn.set(npsn, row);
  }

  const targets = new Map();
  for (const row of masterRows.slice(2)) {
    const npsn = normalizeId(row[mi.NPSN]);
    const form = String(row[mi["BENTUK PENDIDIKAN"]] ?? "").trim().toUpperCase();
    const ministry = String(row[mi["KEMENTERIAN PEMBINA"]] ?? "").trim();
    if (!npsn || ministry !== MINISTRY || !FORMS.has(form)) continue;
    const dqm = dqmByNpsn.get(npsn);
    if (!dqm) continue;
    const uuid = String(dqm[di.UUID] ?? "").trim();
    if (!uuid) continue;
    targets.set(npsn, {
      npsn,
      uuid,
      name: String(row[mi["NAMA SATUAN PENDIDIKAN"]] ?? dqm[di["Nama Sekolah"]] ?? "").trim(),
      form,
      district: String(row[mi.KECAMATAN] ?? dqm[di.Kecamatan] ?? "").trim(),
      profileUrl: `${PORTAL}/sekolah/${encodeURIComponent(uuid)}`,
      previous: {
        score: parseNumber(dqm[di["Skor DQM"]]),
        category: String(dqm[di.Kategori] ?? ""),
        evaluated: Number(dqm[di.Dievaluasi] ?? 0),
        pass: Number(dqm[di.Lolos] ?? 0),
        fail: Number(dqm[di.Gagal] ?? 0),
        unevaluated: Number(dqm[di["Belum Dievaluasi"]] ?? 0),
        total: Number(dqm[di["Total Aktif"]] ?? 0)
      }
    });
  }
  return [...targets.values()].sort((a, b) => a.npsn.localeCompare(b.npsn));
}

function categoryFor(score) {
  if (score >= 100) return "Sangat Baik";
  if (score >= 80) return "Baik";
  if (score >= 50) return "Cukup Baik";
  return "Kurang Baik";
}

export function parseProfile(html, expectedNpsn) {
  const text = htmlToText(html);
  const npsnMatch = text.match(/\bNPSN\s*[:：]?\s*([A-Z0-9]{8})\b/i);
  if (npsnMatch && normalizeId(npsnMatch[1]) !== normalizeId(expectedNpsn)) {
    throw new Error(`NPSN profil tidak cocok: ${npsnMatch[1]} bukan ${expectedNpsn}`);
  }

  let score = null;
  const scorePatterns = [
    /\b(Sangat\s+Baik|Cukup\s+Baik|Kurang\s+Baik|Baik)\s*(\d{1,3}(?:[.,]\d+)?)\s*%/i,
    /(\d{1,3}(?:[.,]\d+)?)\s*%\s*(Sangat\s+Baik|Cukup\s+Baik|Kurang\s+Baik|Baik)\b/i,
    /\bSkor(?:\s+DQM)?\s*[:：-]?\s*(\d{1,3}(?:[.,]\d+)?)/i
  ];
  let scoreMatch = null;
  for (const pattern of scorePatterns) {
    scoreMatch = text.match(pattern);
    if (scoreMatch) {
      score = parseNumber(scoreMatch[2] ?? scoreMatch[1]);
      if (score !== null) break;
    }
  }
  if (score === null) throw new Error("Skor DQM tidak ditemukan pada profil.");

  const passMatch = text.match(/(\d+)\s+dari\s+(\d+)\s+metrik\s+(?:yang\s+)?(?:telah\s+)?lolos/i);
  const unevalMatch = text.match(/(\d+)\s+(?:metrik\s+)?belum\s+dievaluasi|belum\s+dievaluasi\s*[:：]?\s*(\d+)/i);
  if (!passMatch || !unevalMatch) {
    throw new Error("Ringkasan jumlah metrik lolos/belum dievaluasi tidak dikenali.");
  }
  const pass = Number(passMatch[1]);
  const evaluated = Number(passMatch[2]);
  const unevaluated = Number(unevalMatch[1] ?? unevalMatch[2]);
  if (![pass, evaluated, unevaluated].every(Number.isSafeInteger) || pass > evaluated || evaluated < 0 || unevaluated < 0) {
    throw new Error("Ringkasan jumlah metrik tidak valid.");
  }

  return {
    score,
    category: categoryFor(score),
    evaluated,
    pass,
    fail: evaluated - pass,
    unevaluated,
    total: evaluated + unevaluated
  };
}

async function fetchProfile(target) {
  let lastError;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const response = await fetch(target.profileUrl, {
        headers: {
          "User-Agent": "DQMWNG-public-monitor/1.0 (+https://github.com/mmkrsulis/DQMWNG)",
          "Accept": "text/html,application/xhtml+xml"
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      if (html.length < 1000) throw new Error("Respons profil terlalu pendek.");
      const parsed = parseProfile(html, target.npsn);
      return { ...target, ...parsed, retrievedAt: new Date().toISOString() };
    } catch (error) {
      lastError = error;
      if (attempt < RETRIES) await new Promise(resolve => setTimeout(resolve, attempt * 1200));
    }
  }
  throw new Error(`${target.npsn}: ${lastError?.message ?? "gagal mengambil profil"}`);
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      try {
        results[index] = { ok: true, value: await worker(items[index]) };
      } catch (error) {
        results[index] = { ok: false, error: error.message };
      }
    }
  });
  await Promise.all(runners);
  return results;
}

function jakartaDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date());
}

export async function runSync({ limit = 0, dryRun = false } = {}) {
  const masterPath = path.join(ROOT, "data/sources/master.json");
  const dqmPath = path.join(ROOT, "data/sources/dqm-nilai.json");
  const masterDoc = JSON.parse(fs.readFileSync(masterPath, "utf8"));
  const dqmDoc = JSON.parse(fs.readFileSync(dqmPath, "utf8"));
  let targets = buildTargetSchools(masterDoc, dqmDoc);
  if (targets.length < 100) throw new Error(`Cakupan target terlalu kecil: ${targets.length}.`);
  const totalTargets = targets.length;
  if (limit > 0) targets = targets.slice(0, limit);

  console.log(`Target DQM Wonogiri: ${targets.length}${limit ? ` dari ${totalTargets} (uji terbatas)` : ""}`);
  const results = await mapLimit(targets, CONCURRENCY, fetchProfile);
  const records = results.filter(r => r?.ok).map(r => {
    const v = r.value;
    return {
      npsn: v.npsn,
      uuid: v.uuid,
      name: v.name,
      form: v.form,
      district: v.district,
      score: v.score,
      category: v.category,
      evaluated: v.evaluated,
      pass: v.pass,
      fail: v.fail,
      unevaluated: v.unevaluated,
      total: v.total,
      profileUrl: v.profileUrl,
      retrievedAt: v.retrievedAt
    };
  });
  const failures = results.filter(r => !r?.ok).map(r => r.error);
  const coverage = records.length / targets.length;
  console.log(`Berhasil: ${records.length}/${targets.length} (${(coverage * 100).toFixed(1)}%)`);
  if (failures.length) console.log("Contoh gagal:", failures.slice(0, 10).join(" | "));

  if (limit === 0 && coverage < 0.9) {
    throw new Error(`Cakupan hanya ${(coverage * 100).toFixed(1)}%; snapshot tidak disimpan (minimum 90%).`);
  }
  if (limit > 0 && !dryRun) {
    throw new Error("--limit hanya boleh dipakai bersama --dry-run agar snapshot parsial tidak tersimpan.");
  }

  const snapshot = {
    schemaVersion: 1,
    source: PORTAL,
    scope: {
      district: "Kabupaten Wonogiri",
      ministry: MINISTRY,
      forms: [...FORMS],
      requested: targets.length,
      succeeded: records.length,
      failed: failures.length,
      coverage: Number((coverage * 100).toFixed(2))
    },
    retrievedAt: new Date().toISOString(),
    records
  };

  if (!dryRun) {
    const date = jakartaDate();
    const historyDir = path.join(ROOT, "data/history/dqm");
    fs.mkdirSync(historyDir, { recursive: true });
    fs.writeFileSync(path.join(ROOT, "data/dqm-live.json"), JSON.stringify(snapshot, null, 2) + "\n");
    fs.writeFileSync(path.join(historyDir, `${date}.json`), JSON.stringify(snapshot, null, 2) + "\n");
    console.log(`Snapshot disimpan: data/dqm-live.json dan data/history/dqm/${date}.json`);
  } else {
    console.log("DRY RUN: tidak ada file yang ditulis.");
  }
  return snapshot;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const limitIndex = args.indexOf("--limit");
  const limit = limitIndex >= 0 ? Number(args[limitIndex + 1]) : 0;
  if (!Number.isSafeInteger(limit) || limit < 0) throw new Error("Nilai --limit harus bilangan bulat >= 0.");
  runSync({ limit, dryRun: args.includes("--dry-run") }).catch(error => {
    console.error(`DQM SYNC FAILED: ${error.message}`);
    process.exitCode = 1;
  });
}
