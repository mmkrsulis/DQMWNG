#!/usr/bin/env node
/**
 * Public DQM collector for Wonogiri PAUD/SD/SMP.
 * Reads the repository's consolidated master snapshot (data/master-sekolah-live.json)
 * as well as legacy sheet sources (data/sources/master.json & data/sources/dqm-nilai.json),
 * then queries the official public Portal DQM JSON API endpoint.
 * It never logs in, bypasses access controls, or modifies the legacy IKD dataset.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORTAL = "https://kualitas.data.kemendikdasmen.go.id";
const API_BASE = "https://qc.data.kemendikdasmen.go.id/portal-dqm/api/v1";
const KODE_KABUPATEN_WONOGIRI = "031200";
const MINISTRY = "Kementerian Pendidikan Dasar dan Menengah";
export const FORMS = new Set(["PAUD", "TK", "TKN", "TKS", "KB", "SPS", "TPA", "SD", "SMP"]);

const CONCURRENCY = 3;
const MIN_INTERVAL_MS = 700; // ~85 req/menit agar aman di bawah rate limit 120 req/menit
const REQUEST_TIMEOUT_MS = 15000;
const RETRIES = 5;
const PROGRESS_INTERVAL = 25;

let nextSlotAt = 0;
let cooldownUntil = 0;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function acquireRateSlot() {
  while (true) {
    const now = Date.now();
    const waitCooldown = cooldownUntil - now;
    if (waitCooldown > 0) {
      await sleep(waitCooldown);
      continue;
    }
    const scheduled = Math.max(now, nextSlotAt);
    nextSlotAt = scheduled + MIN_INTERVAL_MS;
    const delay = scheduled - now;
    if (delay > 0) {
      await sleep(delay);
    }
    if (Date.now() >= cooldownUntil) return;
  }
}

function triggerCooldown(ms, reason = "") {
  const target = Date.now() + ms;
  if (target > cooldownUntil) {
    cooldownUntil = target;
    const sec = Math.ceil(ms / 1000);
    console.log(`  [Rate Limit] ${reason} Menunggu ${sec}s sebelum lanjut...`);
  }
}

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

export function apiDetailUrlFor(uuid) {
  return `${API_BASE}/satuan-pendidikan/${encodeURIComponent(String(uuid ?? "").trim())}`;
}

export function buildTargetSchools(masterDoc, dqmDoc, masterLiveDoc = null) {
  const targets = new Map();
  const dqmByNpsn = new Map();

  // 1. Indeks UUID & baseline historis dari data/sources/dqm-nilai.json
  if (dqmDoc && Array.isArray(dqmDoc.values) && dqmDoc.values.length > 0) {
    const dh = dqmDoc.values[0] || [];
    const di = Object.fromEntries(dh.map((v, i) => [String(v).trim(), i]));
    for (const key of ["NPSN", "UUID", "Nama Sekolah", "Skor DQM", "Kategori", "Dievaluasi", "Lolos", "Gagal", "Belum Dievaluasi", "Total Aktif"]) {
      if (di[key] === undefined) throw new Error(`Kolom DQM tidak ditemukan: ${key}`);
    }
    for (const row of dqmDoc.values.slice(1)) {
      const npsn = normalizeId(row[di.NPSN]);
      const uuid = String(row[di.UUID] ?? "").trim();
      if (npsn && uuid) {
        dqmByNpsn.set(npsn, {
          uuid,
          name: String(row[di["Nama Sekolah"]] ?? "").trim(),
          district: String(row[di.Kecamatan] ?? "").trim(),
          previous: {
            score: parseNumber(row[di["Skor DQM"]]),
            category: String(row[di.Kategori] ?? ""),
            evaluated: Number(row[di.Dievaluasi] ?? 0),
            pass: Number(row[di.Lolos] ?? 0),
            fail: Number(row[di.Gagal] ?? 0),
            unevaluated: Number(row[di["Belum Dievaluasi"]] ?? 0),
            total: Number(row[di["Total Aktif"]] ?? 0)
          }
        });
      }
    }
  }

  // 2. Muat cakupan resmi PAUD/SD/SMP dari data/sources/master.json
  if (masterDoc && Array.isArray(masterDoc.values)) {
    const masterRows = masterDoc.values;
    const mh = masterRows[1] || [];
    const mi = Object.fromEntries(mh.map((v, i) => [String(v).trim(), i]));
    for (const key of ["BENTUK PENDIDIKAN", "NPSN", "NAMA SATUAN PENDIDIKAN", "KECAMATAN", "KEMENTERIAN PEMBINA"]) {
      if (mi[key] === undefined) throw new Error(`Kolom master tidak ditemukan: ${key}`);
    }

    for (const row of masterRows.slice(2)) {
      const npsn = normalizeId(row[mi.NPSN]);
      const form = String(row[mi["BENTUK PENDIDIKAN"]] ?? "").trim().toUpperCase();
      const ministry = String(row[mi["KEMENTERIAN PEMBINA"]] ?? "").trim();
      if (!npsn || ministry !== MINISTRY || !FORMS.has(form)) continue;
      const dqm = dqmByNpsn.get(npsn);
      if (!dqm || !dqm.uuid) continue;

      targets.set(npsn, {
        npsn,
        uuid: dqm.uuid,
        name: String(row[mi["NAMA SATUAN PENDIDIKAN"]] ?? dqm.name ?? "").trim(),
        form,
        district: String(row[mi.KECAMATAN] ?? dqm.district ?? "").trim(),
        profileUrl: `${PORTAL}/sekolah/${encodeURIComponent(dqm.uuid)}`,
        apiUrl: apiDetailUrlFor(dqm.uuid),
        previous: dqm.previous
      });
    }
  }

  // 3. Lengkapi dengan data/master-sekolah-live.json
  const liveSchools = Array.isArray(masterLiveDoc?.schools) ? masterLiveDoc.schools : [];
  for (const sc of liveSchools) {
    const npsn = normalizeId(sc?.npsn);
    const form = String(sc?.bentuk_pendidikan ?? sc?.jenjang ?? "").trim().toUpperCase();
    const ministry = String(sc?.kementerian_pembina ?? "").trim();
    if (!npsn || ministry !== MINISTRY || !FORMS.has(form)) continue;

    const existing = targets.get(npsn);
    const dqm = dqmByNpsn.get(npsn);
    const uuid = String(sc?.uuid ?? sc?.uuid_dqm ?? existing?.uuid ?? dqm?.uuid ?? "").trim();
    if (!uuid) continue;

    targets.set(npsn, {
      npsn,
      uuid,
      name: String(sc?.nama ?? existing?.name ?? dqm?.name ?? "").trim(),
      form,
      district: String(sc?.kecamatan ?? existing?.district ?? dqm?.district ?? "").trim(),
      profileUrl: `${PORTAL}/sekolah/${encodeURIComponent(uuid)}`,
      apiUrl: apiDetailUrlFor(uuid),
      previous: existing?.previous ?? dqm?.previous ?? null
    });
  }

  if (targets.size === 0 && !masterDoc && !masterLiveDoc) {
    throw new Error("Sumber master.json maupun master-sekolah-live.json tidak tersedia.");
  }

  return [...targets.values()].sort((a, b) => a.npsn.localeCompare(b.npsn));
}

function categoryFor(score) {
  if (score >= 100) return "Sangat Baik";
  if (score >= 80) return "Baik";
  if (score >= 50) return "Cukup Baik";
  return "Kurang Baik";
}

export function parseApiDetail(payload, expectedNpsn) {
  const envelope = typeof payload === "string" ? JSON.parse(payload) : payload;
  if (!envelope || typeof envelope !== "object") {
    throw new Error("Respons API DQM bukan objek JSON yang valid.");
  }
  if (envelope.statusCode !== undefined && envelope.statusCode !== 200) {
    throw new Error(`API DQM mengembalikan statusCode ${envelope.statusCode}: ${envelope.message ?? "gagal"}`);
  }

  const data = envelope.data && typeof envelope.data === "object" ? envelope.data : envelope;
  if (!data || typeof data !== "object") {
    throw new Error("Payload data satuan pendidikan kosong.");
  }

  if (data.npsn && expectedNpsn && normalizeId(data.npsn) !== normalizeId(expectedNpsn)) {
    throw new Error(`NPSN profil tidak cocok: ${data.npsn} bukan ${expectedNpsn}`);
  }

  const score = parseNumber(data.skor);
  if (score === null) {
    throw new Error("Skor DQM tidak ditemukan atau tidak valid pada respons JSON.");
  }

  const metric = data.metric && typeof data.metric === "object" ? data.metric : null;
  if (!metric) {
    throw new Error("Ringkasan metric tidak ditemukan pada respons JSON.");
  }

  const evaluated = Number(metric.evaluated);
  const pass = Number(metric.passed);
  const unevaluated = Number(metric.not_evaluated ?? 0);
  const fail = metric.failed !== undefined && metric.failed !== null
    ? Number(metric.failed)
    : evaluated - pass;
  const total = metric.total_active !== undefined && metric.total_active !== null
    ? Number(metric.total_active)
    : evaluated + unevaluated;

  if (
    ![pass, evaluated, fail, unevaluated, total].every(Number.isSafeInteger) ||
    pass < 0 ||
    evaluated < 0 ||
    fail < 0 ||
    unevaluated < 0 ||
    pass > evaluated
  ) {
    throw new Error("Ringkasan jumlah metrik JSON tidak valid.");
  }

  const apiCategory = String(data.category ?? "").trim();
  return {
    score,
    category: apiCategory || categoryFor(score),
    evaluated,
    pass,
    fail,
    unevaluated,
    total
  };
}

export function parseProfile(input, expectedNpsn) {
  if (input && typeof input === "object") {
    return parseApiDetail(input, expectedNpsn);
  }

  const raw = String(input ?? "");
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    return parseApiDetail(JSON.parse(trimmed), expectedNpsn);
  }

  // Dukungan Angular SSR ng-state apabila menerima dokumen HTML lengkap
  const ngStateMatch = raw.match(/<script id="ng-state"[^>]*>([\s\S]*?)<\/script>/i);
  if (ngStateMatch) {
    const state = JSON.parse(ngStateMatch[1]);
    const detailKey = Object.keys(state).find(k => k.startsWith("satdik.detail."));
    if (detailKey && state[detailKey]) {
      return parseApiDetail(state[detailKey], expectedNpsn);
    }
  }

  // Fallback parser HTML teks lama
  const text = htmlToText(raw);
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
  for (const pattern of scorePatterns) {
    const scoreMatch = text.match(pattern);
    if (scoreMatch) {
      score = parseNumber(scoreMatch[2] ?? scoreMatch[1]);
      if (score !== null) break;
    }
  }
  if (score === null) {
    const preview = text.slice(0, 180);
    throw new Error(`Skor DQM tidak ditemukan pada profil. Cuplikan: "${preview}"`);
  }

  const passMatch = text.match(/(\d+)\s+dari\s+(\d+)\s+metrik\s+(?:yang\s+)?(?:telah\s+)?lolos/i);
  const unevalMatch = text.match(/(\d+)\s+(?:metrik\s+)?belum\s+dievaluasi|belum\s+dievaluasi\s*[:：]?\s*(\d+)/i);
  if (!passMatch || !unevalMatch) {
    const preview = text.slice(0, 180);
    throw new Error(`Ringkasan jumlah metrik lolos/belum dievaluasi tidak dikenali. Cuplikan: "${preview}"`);
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

async function fetchJsonWithTimeout(url, timeoutMs) {
  await acquireRateSlot();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Timeout ${timeoutMs}ms`)), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "DQMWNG-public-monitor/1.0 (+https://github.com/mmkrsulis/DQMWNG)",
        "Accept": "application/json",
        "Origin": PORTAL,
        "Referer": `${PORTAL}/`
      },
      signal: controller.signal
    });
    if (response.status === 429) {
      const retryAfterSec = Number(response.headers.get("retry-after"));
      const waitMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0
        ? (retryAfterSec + 2) * 1000
        : 65000;
      triggerCooldown(waitMs, "HTTP 429 diterima dari server.");
      const err = new Error("HTTP 429 Too Many Requests");
      err.isRateLimit = true;
      throw err;
    }
    if (!response.ok) {
      const err = new Error(`HTTP ${response.status}`);
      if (response.status === 400 || response.status === 404) err.noRetry = true;
      throw err;
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchKabupatenBulkMap(kodeKabupaten = KODE_KABUPATEN_WONOGIRI) {
  const byKey = new Map();
  const limit = 100;
  try {
    const firstUrl = `${API_BASE}/satuan-pendidikan?kode_kabupaten=${encodeURIComponent(kodeKabupaten)}&page=1&limit=${limit}`;
    const firstPayload = await fetchJsonWithTimeout(firstUrl, REQUEST_TIMEOUT_MS);
    const items = firstPayload?.data?.items;
    const meta = firstPayload?.data?.meta;
    if (!Array.isArray(items) || items.length === 0) return byKey;

    // Pastikan item daftar kabupaten memuat skor & rincian metric lengkap
    parseApiDetail(items[0]);

    const addItems = list => {
      for (const item of list) {
        try {
          const parsed = parseApiDetail(item);
          const npsnKey = normalizeId(item.npsn);
          const uuidKey = normalizeId(item.sekolah_id);
          if (npsnKey) byKey.set(npsnKey, parsed);
          if (uuidKey) byKey.set(uuidKey, parsed);
        } catch {
          // Lewati item individual bila formatnya tidak lengkap; akan diambil via endpoint detail
        }
      }
    };

    addItems(items);
    const totalPages = Number(meta?.total_page ?? meta?.total_pages ?? meta?.totalPage ?? 1);
    console.log(`  Mode bulk kabupaten aktif: halaman 1/${totalPages} (${byKey.size / 2 | 0} sekolah terindeks)`);

    for (let page = 2; page <= Math.min(totalPages, 100); page++) {
      const url = `${API_BASE}/satuan-pendidikan?kode_kabupaten=${encodeURIComponent(kodeKabupaten)}&page=${page}&limit=${limit}`;
      const payload = await fetchJsonWithTimeout(url, REQUEST_TIMEOUT_MS);
      const pageItems = payload?.data?.items;
      if (!Array.isArray(pageItems) || pageItems.length === 0) break;
      addItems(pageItems);
      if (page % 5 === 0 || page === totalPages) {
        console.log(`  Bulk halaman ${page}/${totalPages} selesai...`);
      }
    }
  } catch (error) {
    console.log(`  Info bulk kabupaten: ${error.message} -> lanjut via endpoint detail per sekolah.`);
    byKey.clear();
  }
  return byKey;
}

async function fetchProfile(target, bulkMap = null) {
  if (bulkMap && bulkMap.size > 0) {
    const cached = bulkMap.get(normalizeId(target.npsn)) || bulkMap.get(normalizeId(target.uuid));
    if (cached) {
      return { ...target, ...cached, retrievedAt: new Date().toISOString() };
    }
  }

  const endpoint = target.apiUrl || apiDetailUrlFor(target.uuid);
  let lastError;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const payload = await fetchJsonWithTimeout(endpoint, REQUEST_TIMEOUT_MS);
      const parsed = parseApiDetail(payload, target.npsn);
      return { ...target, ...parsed, retrievedAt: new Date().toISOString() };
    } catch (error) {
      lastError = error;
      if (error?.noRetry) break;
      if (!error?.isRateLimit && attempt < RETRIES) {
        await sleep(attempt * 1200);
      }
    }
  }
  throw new Error(`${target.npsn}: ${lastError?.message ?? "gagal mengambil data API DQM"}`);
}

async function mapLimit(items, limit, worker, onProgress = null) {
  const results = new Array(items.length);
  let cursor = 0;
  let completed = 0;
  let okCount = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      const item = items[index];
      try {
        results[index] = { ok: true, value: await worker(item) };
        okCount++;
      } catch (error) {
        results[index] = { ok: false, error: error.message };
      }
      completed++;
      if (
        onProgress &&
        (completed === 1 || completed % PROGRESS_INTERVAL === 0 || completed === items.length)
      ) {
        onProgress({
          completed,
          total: items.length,
          ok: okCount,
          fail: completed - okCount,
          lastItem: item
        });
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

function readJsonOptional(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export async function runSync({ limit = 0, dryRun = false } = {}) {
  const startedAt = Date.now();

  console.log("[Step 1/4] Membaca file sumber master & baseline DQM...");
  const masterPath = path.join(ROOT, "data/sources/master.json");
  const dqmPath = path.join(ROOT, "data/sources/dqm-nilai.json");
  const masterLivePath = path.join(ROOT, "data/master-sekolah-live.json");

  const masterDoc = readJsonOptional(masterPath);
  const dqmDoc = readJsonOptional(dqmPath);
  const masterLiveDoc = readJsonOptional(masterLivePath);
  console.log(
    `  Sumber dimuat -> master.json: ${masterDoc ? "ya" : "tidak"}, ` +
    `dqm-nilai.json: ${dqmDoc ? "ya" : "tidak"}, ` +
    `master-sekolah-live.json: ${masterLiveDoc ? "ya" : "tidak"}`
  );

  console.log("[Step 2/4] Menyusun daftar target satuan pendidikan Wonogiri...");
  let targets = buildTargetSchools(masterDoc, dqmDoc, masterLiveDoc);
  if (targets.length < 1500) {
    throw new Error(`Cakupan target terlalu kecil: ${targets.length} (minimum 1.500 PAUD/SD/SMP).`);
  }
  const totalTargets = targets.length;
  if (limit > 0) targets = targets.slice(0, limit);
  console.log(
    `  Target siap: ${targets.length} sekolah${limit ? ` dari ${totalTargets} (mode uji terbatas)` : ""}`
  );

  console.log(`[Step 3/4] Menarik data JSON dari Portal DQM...`);
  const bulkMap = limit === 0 ? await fetchKabupatenBulkMap(KODE_KABUPATEN_WONOGIRI) : new Map();
  if (bulkMap.size === 0) {
    console.log(`  Mengambil per sekolah (${CONCURRENCY} jalur, batas aman ~85 req/menit agar lolos rate limit)...`);
  }

  const results = await mapLimit(
    targets,
    CONCURRENCY,
    target => fetchProfile(target, bulkMap),
    ({ completed, total, ok, fail, lastItem }) => {
      const pct = ((completed / total) * 100).toFixed(1);
      const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
      const label = lastItem ? `${lastItem.npsn} - ${lastItem.name}` : "-";
      console.log(`  [${completed}/${total} | ${pct}%] Berhasil: ${ok} | Gagal: ${fail} | ${elapsedSec}s | ${label}`);
    }
  );

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

  console.log("[Step 4/4] Memvalidasi cakupan & menyimpan snapshot...");
  console.log(`  Hasil akhir: ${records.length}/${targets.length} (${(coverage * 100).toFixed(1)}%)`);
  if (failures.length) {
    console.log("  Contoh gagal:", failures.slice(0, 10).join(" | "));
  }

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
    console.log(`  Snapshot tersimpan: data/dqm-live.json dan data/history/dqm/${date}.json`);
  } else {
    console.log("  DRY RUN: tidak ada file yang ditulis.");
    if (records.length > 0) {
      console.log("  Contoh hasil parser:", JSON.stringify(records[0]));
    }
  }
  return snapshot;
}

function parseLimitArg(args) {
  const eqArg = args.find(a => a.startsWith("--limit="));
  if (eqArg) return Number(eqArg.slice("--limit=".length));
  const limitIndex = args.indexOf("--limit");
  return limitIndex >= 0 ? Number(args[limitIndex + 1]) : 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const limit = parseLimitArg(args);
  if (!Number.isSafeInteger(limit) || limit < 0) throw new Error("Nilai --limit harus bilangan bulat >= 0.");
  runSync({ limit, dryRun: args.includes("--dry-run") }).catch(error => {
    console.error(`DQM SYNC FAILED: ${error.message}`);
    process.exitCode = 1;
  });
}
