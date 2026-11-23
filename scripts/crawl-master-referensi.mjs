#!/usr/bin/env node
/**
 * Crawler Master Sekolah Wonogiri (Mode NPSN-First + /satpen/detail/{npsn})
 * Mengambil daftar NPSN langsung dari halaman level /3 per kecamatan (tanpa loop ?page=),
 * lalu memperkaya detail masing-masing NPSN melalui https://referensi.data.kemendikdasmen.go.id/satpen/detail/{npsn}.
 */

import fs from "node:fs";
import path from "node:path";

const INCLUDE_DIKMEN = process.env.REFERENSI_INCLUDE_DIKMEN !== "false";
const INCLUDE_DIKMAS = process.env.REFERENSI_INCLUDE_DIKMAS !== "false";
const ENRICH_DETAIL = process.env.REFERENSI_ENRICH_DETAIL !== "false";
const KODE_KAB = process.env.REFERENSI_KODE_KAB || "031200";
const CONCURRENCY = Number(process.env.REFERENSI_CONCURRENCY || 4);
const DELAY_MS = Number(process.env.REFERENSI_DELAY_MS || 250);
const TIMEOUT_MS = 35000;

const OUT_LIVE = path.resolve("data/master-sekolah-live.json");
const OUT_BINAAN = path.resolve("data/sources/master-binaan-disdik.json");
const OUT_REKAP_KEC = path.resolve("data/sources/referensi-rekap-kecamatan.json");
const OUT_GAP_REPORT = path.resolve("artifacts/gap-rekap-vs-crawl.json");
const OUT_HISTORY_DIR = path.resolve("data/history/master-sekolah");

const EXTRA_NPSN_FILES = [
  path.resolve("data/sources/extra-npsn.txt"),
  path.resolve("artifacts/missing-npsn.txt")
];

const BINAAN_BENTUK = new Set([
  "TK",
  "TKN",
  "TKS",
  "KB",
  "TPA",
  "SPS",
  "PAUD",
  "SD",
  "SMP",
  "PKBM",
  "SKB",
  "LKP",
  "KURSUS",
  "TBM",
  "DIKMAS"
]);

const NON_BINAAN_BENTUK = new Set([
  "MI",
  "MTS",
  "MA",
  "MAK",
  "RA",
  "PONPES",
  "PONDOK PESANTREN",
  "PAUDQ",
  "SPM WUSTHA",
  "SPM ULA",
  "SPM ULYA",
  "PDF",
  "SMA",
  "SMK",
  "SLB",
  "SPK",
  "PERGURUAN TINGGI"
]);

const KECAMATAN_CODES = Array.from({ length: 25 }, (_, i) => `0312${String(i + 1).padStart(2, "0")}`);

const CATEGORIES = [
  "paud",
  "dikdas",
  ...(INCLUDE_DIKMAS ? ["dikmas"] : []),
  ...(INCLUDE_DIKMEN ? ["dikmen"] : [])
];

function getQueryByKategori(kategori) {
  return kategori === "dikdas" ? "jalur=jf&status=all" : "jalur=all&status=all";
}

function decodeEntities(s) {
  return String(s ?? "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function stripTags(s) {
  return decodeEntities(
    String(s ?? "")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
  ).trim();
}

function toInt(val) {
  const n = parseInt(String(val ?? "").replace(/[^0-9-]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

function getWibTimestamp(date = new Date()) {
  return (
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    })
      .format(date)
      .replace(" ", "T") + "+07:00"
  );
}

function normalizeBentuk(rawBentuk, nama, kategori) {
  const b = String(rawBentuk ?? "").toUpperCase().trim();
  const upper = String(nama ?? "").toUpperCase().trim();
  const cat = String(kategori ?? "").toLowerCase();

  if (b === "PONDOK PESANTREN" || b === "PONPES" || /PONDOK PESANTREN/i.test(upper)) {
    return "PONDOK PESANTREN";
  }
  if (b === "PAUDQ" || /^PAUDQ\b/i.test(upper)) {
    return "PAUDQ";
  }
  if (/^SPM\s+WUSTHA/i.test(b) || /^SPM\s+WUSTHA/i.test(upper)) {
    return "SPM WUSTHA";
  }

  if (
    b === "TK" ||
    b === "TKN" ||
    b === "TKS" ||
    /^TK\b/.test(b) ||
    /^TAMAN KANAK/.test(b) ||
    /(?:^|\s)(TK|TKN|TKS)(?:\s|$)/i.test(upper) ||
    /TAMAN KANAK-KANAK|TAMAN KANAK KANAK/i.test(upper)
  ) {
    return "TK";
  }

  if (b === "KB" || /^KB\b/.test(b) || /(?:^|\s)(KB|KOBER)(?:\s|$)/i.test(upper) || /KELOMPOK BERMAIN/i.test(upper)) return "KB";
  if (b === "TPA" || /^TPA\b/.test(b) || /(?:^|\s)TPA(?:\s|$)/i.test(upper) || /TAMAN PENITIPAN ANAK/i.test(upper)) return "TPA";
  if (b === "SPS" || /^SPS\b/.test(b) || /(?:^|\s)(SPS|POS PAUD)(?:\s|$)/i.test(upper) || /SATUAN PAUD SEJENIS/i.test(upper)) return "SPS";

  if (
    b === "SD" ||
    /^SD\b/.test(b) ||
    (/(?:^|\s)(SD|SDN|SDS|SDIT|SDK)(?:\s|$)/i.test(upper) && !/(?:^|\s)(MI|MIN|MIS)(?:\s|$)/i.test(upper))
  ) {
    return "SD";
  }
  if (
    b === "SMP" ||
    /^SMP\b/.test(b) ||
    (/(?:^|\s)(SMP|SMPN|SMPS|SMPIT|SMPK)(?:\s|$)/i.test(upper) && !/(?:^|\s)(MTS|MTSS|MTSN)(?:\s|$)/i.test(upper))
  ) {
    return "SMP";
  }

  if (b === "PKBM" || /(?:^|\s)PKBM(?:\s|$)/i.test(upper)) return "PKBM";
  if (b === "SKB" || /(?:^|\s)(SKB|SPNF SKB)(?:\s|$)/i.test(upper)) return "SKB";
  if (b === "LKP" || b === "KURSUS" || /(?:^|\s)(LKP|KURSUS)(?:\s|$)/i.test(upper) || /LEMBAGA KURSUS/i.test(upper)) return "LKP";
  if (b === "TBM" || /(?:^|\s)TBM(?:\s|$)/i.test(upper) || /TAMAN BACAAN MASYARAKAT/i.test(upper)) return "TBM";

  if (b === "MI" || b === "RA" || /(?:^|\s)(MI|MIN|MIS|RA)(?:\s|$)/i.test(upper)) return "MI";
  if (b === "MTS" || /(?:^|\s)(MTS|MTSS|MTSN)(?:\s|$)/i.test(upper)) return "MTs";
  if (b === "SMA" || /(?:^|\s)(SMA|SMAN|SMAS|SMAIT)(?:\s|$)/i.test(upper)) return "SMA";
  if (b === "SMK" || /(?:^|\s)(SMK|SMKN|SMKS)(?:\s|$)/i.test(upper)) return "SMK";
  if (b === "MA" || b === "MAK" || /(?:^|\s)(MA|MAN|MAS|MAK)(?:\s|$)/i.test(upper)) return "MA";
  if (b === "SLB" || /(?:^|\s)(SLB|SLBN|SLBS)(?:\s|$)/i.test(upper)) return "SLB";

  if (b) return b;
  if (cat === "paud") return "PAUD";
  if (cat === "dikmas") return "DIKMAS";
  return null;
}

async function fetchWithRetry(url, retries = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "DQMWNG-Referensi-Crawler/3.4-level3 (+https://github.com/mmkrsulis/DQMWNG)",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8",
          "Referer": "https://referensi.data.kemendikdasmen.go.id/"
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: "follow"
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} untuk ${url}`);
      }
      return text;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, attempt * 1500));
      }
    }
  }
  throw lastErr;
}

function parseRekapWilayahTable(html, kategori) {
  const rowsOut = [];
  const tableMatch = html.match(/<table\b[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) return rowsOut;

  const headers = [...tableMatch[1].matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map((m) =>
    stripTags(m[1]).toLowerCase()
  );

  const trMatches = tableMatch[1].matchAll(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/gi);
  for (const body of trMatches) {
    for (const tr of body[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const rowHtml = tr[1];
      const cells = [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => stripTags(m[1]));
      if (cells.length < 2) continue;

      const hrefMatch = rowHtml.match(/href=["']([^"']*\/satpen\/[^"']*\/(\d{6})\/3[^"']*)["']/i);
      const kodeWilayah = hrefMatch?.[2] ?? null;
      const namaWilayah = cells[1] || "";
      if (!namaWilayah) continue;

      const breakdown = {};
      for (let i = 2; i < cells.length; i++) {
        const colName = headers[i] || `kolom_${i}`;
        breakdown[colName] = toInt(cells[i]);
      }

      rowsOut.push({
        kategori: kategori.toUpperCase(),
        kode_wilayah: kodeWilayah,
        nama_wilayah: namaWilayah,
        total: toInt(cells[cells.length - 1]),
        rincian: breakdown
      });
    }
  }
  return rowsOut;
}

function extractNpsnListFromHtml(html, metaInfo) {
  const records = [];
  const trMatches = html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi);

  for (const trMatch of trMatches) {
    const rowHtml = trMatch[1];
    const cells = [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
    if (cells.length < 3) continue;

    const cellTexts = cells.map(stripTags);
    const linkMatch = rowHtml.match(/href=["']([^"']*(?:satpen\/detail|npsn)\/([A-Za-z0-9]{7,10}))["']/i);
    const npsnFromCol1 = cellTexts[1]?.match(/\b([A-Z0-9]{7,10})\b/i)?.[1]?.toUpperCase() ?? null;
    const npsn = linkMatch?.[2] ?? npsnFromCol1 ?? null;
    if (!npsn) continue;

    const nama = cellTexts[2] || null;
    const rawBentuk = cellTexts[3] || null;
    const statusRaw = cellTexts[4] || null;
    const alamat = cellTexts[5] || null;
    const desa = cellTexts[6] || null;

    const detailUrl = linkMatch?.[1]
      ? linkMatch[1].startsWith("http")
        ? linkMatch[1]
        : `https://referensi.data.kemendikdasmen.go.id${linkMatch[1].startsWith("/") ? "" : "/"}${linkMatch[1]}`
      : `https://referensi.data.kemendikdasmen.go.id/satpen/detail/${npsn}`;

    records.push({
      npsn,
      nama,
      kategori: metaInfo.kategori.toUpperCase(),
      bentuk_pendidikan: normalizeBentuk(rawBentuk, nama, metaInfo.kategori),
      status: statusRaw && /^(NEGERI|SWASTA)$/i.test(statusRaw.trim()) ? statusRaw.trim().toUpperCase() : null,
      kode_kabupaten: KODE_KAB,
      kode_kecamatan: metaInfo.kodeKecamatan,
      kecamatan: metaInfo.namaKecamatan || null,
      desa_kelurahan: desa,
      alamat,
      urls: {
        sumber_daftar: metaInfo.sourceUrl,
        detail_satpen: detailUrl
      }
    });
  }
  return records;
}

function parseSatpenDetailPage(html, npsn) {
  const kv = new Map();
  for (const m of html.matchAll(/<div\b[^>]*>\s*<div>([\s\S]*?)<\/div>\s*<div>([\s\S]*?)<\/div>\s*<\/div>/gi)) {
    const k = stripTags(m[1]).toLowerCase();
    const v = stripTags(m[2]);
    if (k && v && !kv.has(k)) {
      kv.set(k, v);
    }
  }

  const uuidMatch = html.match(/profil-sekolah\/([0-9a-fA-F-]{36})/i);
  const uuid = uuidMatch?.[1] ?? null;

  const lintangStr = kv.get("lintang");
  const bujurStr = kv.get("bujur");
  const lintang = lintangStr && !Number.isNaN(Number(lintangStr)) ? Number(lintangStr) : null;
  const bujur = bujurStr && !Number.isNaN(Number(bujurStr)) ? Number(bujurStr) : null;

  const akreditasiMatch = html.match(/ban-pdm\.id\/satuanpendidikan\/\d+[^>]*>\s*([A-Z0-9+-]+)/i);
  const akreditasi = akreditasiMatch?.[1]?.trim() || null;

  const kecRaw = kv.get("kecamatan") || null;
  const kecamatan = kecRaw ? kecRaw.replace(/^Kec\.\s*/i, "").trim() : null;

  return {
    uuid,
    nama_detail: kv.get("nama") || null,
    bentuk_detail: kv.get("bentuk pendidikan") || null,
    jenjang_detail: kv.get("jenjang pendidikan") || null,
    status_detail: kv.get("status sekolah") || null,
    status_ods: kv.get("status satuan pendidikan ods") || null,
    status_kepemilikan: kv.get("status kepemilikan") || null,
    kementerian_pembina: kv.get("kementerian pembina") || null,
    yayasan: kv.get("naungan/yayasan") || null,
    npyp: kv.get("npyp") || null,
    alamat_detail: kv.get("alamat") || null,
    rt_rw: kv.get("rt/rw") || null,
    desa_detail: kv.get("desa/kelurahan") || null,
    kecamatan_detail: kecamatan,
    kode_pos: kv.get("kode pos") || null,
    sk_izin_operasional: kv.get("nomor sk izin operasional") || null,
    akreditasi,
    lintang,
    bujur
  };
}

function classifyBinaanDisdik(school) {
  const bentuk = (school.bentuk_pendidikan || "").toUpperCase().trim();
  const pembina = (school.kementerian_pembina || "").toLowerCase();

  if (pembina.includes("agama")) return false;
  if (NON_BINAAN_BENTUK.has(bentuk)) return false;
  if (BINAAN_BENTUK.has(bentuk)) return true;

  return false;
}

async function runPool(tasks, concurrency) {
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const current = idx++;
      results[current] = await tasks[current]();
      if (DELAY_MS > 0) {
        await new Promise((r) => setTimeout(r, DELAY_MS));
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
  return results;
}

async function main() {
  const existingMap = new Map();
  for (const existingPath of [OUT_LIVE, OUT_BINAAN, path.resolve("data/sources/master.json")]) {
    if (!fs.existsSync(existingPath)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(existingPath, "utf8"));
      const list = Array.isArray(raw) ? raw : raw?.schools ?? raw?.data ?? [];
      for (const item of list) {
        const npsn = String(item?.npsn ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
        if (/^[A-Z0-9]{7,10}$/.test(npsn) && !existingMap.has(npsn)) {
          existingMap.set(npsn, item);
        }
      }
    } catch {
      // abaikan jika file belum ada
    }
  }

  const rekapKecamatan = {};
  const kecamatanTasks = [];
  const perKecamatanStats = [];

  for (const kategori of CATEGORIES) {
    const qs = getQueryByKategori(kategori);
    const kabUrl = `https://referensi.data.kemendikdasmen.go.id/satpen/${kategori}/${KODE_KAB}/2?${qs}`;
    let kecRowsFromKab = [];
    try {
      const kabHtml = await fetchWithRetry(kabUrl);
      kecRowsFromKab = parseRekapWilayahTable(kabHtml, kategori);
      rekapKecamatan[kategori] = kecRowsFromKab;
      console.log(`[REKAP ${kategori.toUpperCase()}] Terbaca ${kecRowsFromKab.length} kecamatan dari ${kabUrl}`);
    } catch (err) {
      console.warn(`[WARN] Gagal membaca rekap kabupaten ${kabUrl}: ${err.message}`);
      rekapKecamatan[kategori] = [];
    }

    const kecMap = new Map();
    for (const code of KECAMATAN_CODES) kecMap.set(code, null);
    for (const r of kecRowsFromKab) {
      if (r.kode_wilayah) kecMap.set(r.kode_wilayah, r);
    }

    for (const [kodeKecamatan, rekapInfo] of kecMap.entries()) {
      if (rekapInfo && rekapInfo.total === 0) continue;
      kecamatanTasks.push(async () => {
        const baseUrl = `https://referensi.data.kemendikdasmen.go.id/satpen/${kategori}/${kodeKecamatan}/3?${qs}`;
        const namaKec = rekapInfo?.nama_wilayah ? rekapInfo.nama_wilayah.replace(/^Kec\.\s*/i, "") : null;

        try {
          const html = await fetchWithRetry(baseUrl);
          const rows = extractNpsnListFromHtml(html, {
            kategori,
            kodeKecamatan,
            namaKecamatan: namaKec,
            sourceUrl: baseUrl
          });

          perKecamatanStats.push({
            kategori: kategori.toUpperCase(),
            kode_kecamatan: kodeKecamatan,
            kecamatan: namaKec,
            rekap_total: rekapInfo?.total ?? null,
            harvested_count: rows.length,
            remaining_gap: typeof rekapInfo?.total === "number" ? Math.max(0, rekapInfo.total - rows.length) : null
          });

          return { ok: true, rows };
        } catch (err) {
          console.warn(`  [WARN] Gagal ambil daftar NPSN ${baseUrl}: ${err.message}`);
          perKecamatanStats.push({
            kategori: kategori.toUpperCase(),
            kode_kecamatan: kodeKecamatan,
            kecamatan: namaKec,
            rekap_total: rekapInfo?.total ?? null,
            harvested_count: 0,
            remaining_gap: rekapInfo?.total ?? null,
            error: err.message
          });
          return { ok: false, rows: [] };
        }
      });
    }
  }

  console.log(`Tahap 1: Mengumpulkan daftar NPSN dari ${kecamatanTasks.length} halaman level /3...`);
  const listResults = await runPool(kecamatanTasks, CONCURRENCY);

  const byNpsn = new Map();
  for (const res of listResults) {
    for (const row of res.rows) {
      if (!byNpsn.has(row.npsn)) {
        byNpsn.set(row.npsn, row);
      }
    }
  }

  for (const filePath of EXTRA_NPSN_FILES) {
    if (!fs.existsSync(filePath)) continue;
    const rawText = fs.readFileSync(filePath, "utf8");
    const matches = rawText.matchAll(/\b([A-Z0-9]{7,10})\b/gi);
    for (const m of matches) {
      const npsn = m[1].toUpperCase();
      if (!byNpsn.has(npsn)) {
        const prev = existingMap.get(npsn) ?? {};
        byNpsn.set(npsn, {
          npsn,
          nama: prev.nama || null,
          kategori: prev.kategori || "LAINNYA",
          bentuk_pendidikan: prev.bentuk_pendidikan || null,
          status: prev.status || null,
          kode_kabupaten: KODE_KAB,
          kode_kecamatan: prev.kode_kecamatan || null,
          kecamatan: prev.kecamatan || null,
          desa_kelurahan: prev.desa_kelurahan || null,
          alamat: prev.alamat || null,
          urls: {
            sumber_daftar: filePath,
            detail_satpen: `https://referensi.data.kemendikdasmen.go.id/satpen/detail/${npsn}`
          }
        });
      }
    }
  }

  for (const [npsn, prev] of existingMap.entries()) {
    if (!byNpsn.has(npsn)) {
      byNpsn.set(npsn, {
        npsn,
        nama: prev.nama || null,
        kategori: prev.kategori || "LAINNYA",
        bentuk_pendidikan: prev.bentuk_pendidikan || null,
        status: prev.status || null,
        kode_kabupaten: KODE_KAB,
        kode_kecamatan: prev.kode_kecamatan || null,
        kecamatan: prev.kecamatan || null,
        desa_kelurahan: prev.desa_kelurahan || null,
        alamat: prev.alamat || null,
        urls: {
          sumber_daftar: prev.urls?.sumber_daftar || null,
          detail_satpen: `https://referensi.data.kemendikdasmen.go.id/satpen/detail/${npsn}`
        }
      });
    }
  }

  const allNpsn = [...byNpsn.keys()].sort();
  console.log(`Tahap 1 selesai: ${allNpsn.length} NPSN unik terkumpul.`);

  if (ENRICH_DETAIL) {
    console.log(`Tahap 2: Mengambil detail per NPSN dari /satpen/detail/{npsn} (concurrency=${CONCURRENCY})...`);
    let doneCount = 0;
    const detailTasks = allNpsn.map((npsn) => async () => {
      const base = byNpsn.get(npsn);
      const prev = existingMap.get(npsn) ?? {};
      try {
        const detailUrl = `https://referensi.data.kemendikdasmen.go.id/satpen/detail/${npsn}`;
        const html = await fetchWithRetry(detailUrl);
        const parsed = parseSatpenDetailPage(html, npsn);

        const namaFinal = parsed.nama_detail || base.nama || prev.nama || "";
        const bentukFinal = normalizeBentuk(
          parsed.bentuk_detail || base.bentuk_pendidikan || prev.bentuk_pendidikan,
          namaFinal,
          base.kategori
        );
        const statusFinal = (parsed.status_detail || base.status || prev.status || "").toUpperCase() || null;
        const uuidFinal = parsed.uuid || prev.uuid || null;

        const merged = {
          npsn,
          nama: namaFinal,
          kategori: base.kategori,
          bentuk_pendidikan: bentukFinal,
          jenjang_pendidikan: parsed.jenjang_detail || prev.jenjang_pendidikan || null,
          status: statusFinal,
          status_ods: parsed.status_ods || prev.status_ods || null,
          status_kepemilikan: parsed.status_kepemilikan || prev.status_kepemilikan || null,
          uuid: uuidFinal,
          kementerian_pembina:
            parsed.kementerian_pembina ||
            prev.kementerian_pembina ||
            (["MI", "MTS", "MA", "MAK", "RA", "PONDOK PESANTREN", "PAUDQ", "SPM WUSTHA"].includes(
              (bentukFinal || "").toUpperCase()
            )
              ? "Kementerian Agama"
              : "Kementerian Pendidikan Dasar dan Menengah"),
          yayasan: parsed.yayasan || prev.yayasan || null,
          npyp: parsed.npyp || prev.npyp || null,
          akreditasi: parsed.akreditasi || prev.akreditasi || null,
          sk_izin_operasional: parsed.sk_izin_operasional || prev.sk_izin_operasional || null,
          kode_kabupaten: KODE_KAB,
          kode_kecamatan: base.kode_kecamatan || prev.kode_kecamatan || null,
          kecamatan: parsed.kecamatan_detail || base.kecamatan || prev.kecamatan || null,
          desa_kelurahan: parsed.desa_detail || base.desa_kelurahan || prev.desa_kelurahan || null,
          rt_rw: parsed.rt_rw || prev.rt_rw || null,
          kode_pos: parsed.kode_pos || prev.kode_pos || null,
          alamat: parsed.alamat_detail || base.alamat || prev.alamat || null,
          lintang: parsed.lintang ?? prev.lintang ?? null,
          bujur: parsed.bujur ?? prev.bujur ?? null,
          urls: {
            sumber_daftar: base.urls?.sumber_daftar || prev.urls?.sumber_daftar || null,
            detail_satpen: detailUrl,
            profil_sekolah: uuidFinal ? `https://sekolah.data.kemendikdasmen.go.id/profil-sekolah/${uuidFinal}` : null,
            dqm: uuidFinal ? `https://kualitas.data.kemendikdasmen.go.id/sekolah/${uuidFinal}` : null
          }
        };

        doneCount++;
        if (doneCount % 250 === 0 || doneCount === allNpsn.length) {
          console.log(`  [DETAIL] ${doneCount}/${allNpsn.length} NPSN diproses...`);
        }
        return merged;
      } catch (err) {
        doneCount++;
        console.warn(`  [WARN] Gagal detail NPSN ${npsn}: ${err.message}`);
        return {
          ...base,
          uuid: prev.uuid ?? null,
          kementerian_pembina: prev.kementerian_pembina ?? null,
          akreditasi: prev.akreditasi ?? null,
          lintang: prev.lintang ?? null,
          bujur: prev.bujur ?? null
        };
      }
    });

    const enrichedList = await runPool(detailTasks, CONCURRENCY);
    for (const item of enrichedList) {
      byNpsn.set(item.npsn, item);
    }
  }

  const schools = [...byNpsn.values()]
    .map((s) => ({
      ...s,
      is_binaan_disdik: classifyBinaanDisdik(s)
    }))
    .sort((a, b) => a.npsn.localeCompare(b.npsn));

  if (schools.length < 1000) {
    throw new Error(`Hasil crawl satpen terlalu sedikit (${schools.length} satuan pendidikan). Snapshot lama tidak ditimpa.`);
  }

  const binaanSchools = schools.filter((s) => s.is_binaan_disdik);
  const byBentukAll = {};
  const byBentukBinaan = {};
  const byKategoriAll = {};
  const byKategoriBinaan = {};

  for (const s of schools) {
    const b = s.bentuk_pendidikan || "LAINNYA";
    const k = s.kategori || "LAINNYA";
    byBentukAll[b] = (byBentukAll[b] ?? 0) + 1;
    byKategoriAll[k] = (byKategoriAll[k] ?? 0) + 1;
    if (s.is_binaan_disdik) {
      byBentukBinaan[b] = (byBentukBinaan[b] ?? 0) + 1;
      byKategoriBinaan[k] = (byKategoriBinaan[k] ?? 0) + 1;
    }
  }

  fs.mkdirSync(path.dirname(OUT_GAP_REPORT), { recursive: true });
  fs.writeFileSync(
    OUT_GAP_REPORT,
    JSON.stringify(
      {
        generated_at_wib: getWibTimestamp(new Date()),
        note: "Halaman /3 hanya 1 laman per kecamatan; selisih dengan rekap kabupaten mencerminkan perbedaan tampilan/filter pada respons HTML level /3.",
        hasil_binaan_disdik: {
          total: binaanSchools.length,
          sd: byBentukBinaan.SD ?? 0,
          smp: byBentukBinaan.SMP ?? 0,
          tk: byBentukBinaan.TK ?? 0,
          kb: byBentukBinaan.KB ?? 0,
          tpa: byBentukBinaan.TPA ?? 0,
          sps: byBentukBinaan.SPS ?? 0
        },
        per_kecamatan_stats: perKecamatanStats.filter((x) => (x.remaining_gap ?? 0) > 0)
      },
      null,
      2
    ) + "\n"
  );

  const now = new Date();
  const output = {
    meta: {
      domain: "master_sekolah",
      schema_version: "3.4.0-level3-only",
      source_mode: "npsn_first_satpen_detail",
      kode_kabupaten: KODE_KAB,
      wilayah: "Kabupaten Wonogiri",
      categories_crawled: CATEGORIES,
      detail_enriched: ENRICH_DETAIL,
      fetched_at_utc: now.toISOString(),
      fetched_at_wib: getWibTimestamp(now),
      total_semua_satpen: schools.length,
      total_binaan_disdik: binaanSchools.length
    },
    summary: {
      total_semua_satpen: schools.length,
      total_binaan_disdik: binaanSchools.length,
      by_kategori_semua: byKategoriAll,
      by_kategori_binaan_disdik: byKategoriBinaan,
      by_bentuk_semua: byBentukAll,
      by_bentuk_binaan_disdik: byBentukBinaan
    },
    schools
  };

  fs.mkdirSync(path.dirname(OUT_LIVE), { recursive: true });
  fs.writeFileSync(OUT_LIVE, JSON.stringify(output, null, 2) + "\n");

  fs.mkdirSync(path.dirname(OUT_BINAAN), { recursive: true });
  fs.writeFileSync(
    OUT_BINAAN,
    JSON.stringify(
      {
        meta: {
          generated_at_wib: getWibTimestamp(now),
          source_mode: "npsn_first_satpen_detail",
          categories_crawled: CATEGORIES,
          total_binaan_disdik: binaanSchools.length
        },
        summary_by_bentuk: byBentukBinaan,
        schools: binaanSchools
      },
      null,
      2
    ) + "\n"
  );

  fs.mkdirSync(path.dirname(OUT_REKAP_KEC), { recursive: true });
  fs.writeFileSync(
    OUT_REKAP_KEC,
    JSON.stringify(
      {
        meta: {
          generated_at_wib: getWibTimestamp(now),
          kode_kabupaten: KODE_KAB,
          wilayah: "Kabupaten Wonogiri"
        },
        rekap_per_kategori: rekapKecamatan
      },
      null,
      2
    ) + "\n"
  );

  const dateWib = getWibTimestamp(now).slice(0, 10);
  fs.mkdirSync(OUT_HISTORY_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_HISTORY_DIR, `${dateWib}.json`), JSON.stringify(output, null, 2) + "\n");

  console.log(`Sukses crawl mode NPSN-first level /3 (${CATEGORIES.join(", ")}):`);
  console.log(`  - Total satpen unik: ${schools.length}`);
  console.log(`  - Total binaan Disdik: ${binaanSchools.length}`);
  console.log(`  - Rincian bentuk binaan Disdik: ${JSON.stringify(byBentukBinaan)}`);
}

main().catch((err) => {
  console.error(`SATPEN CRAWL FAILED: ${err.message}`);
  process.exitCode = 1;
});
