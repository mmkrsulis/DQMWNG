#!/usr/bin/env node
/**
 * Sinkronisasi data Residu Peserta Didik (VervalPD) Kabupaten Wonogiri
 * Sumber staging: Google Sheets (akses publik CSV export)
 * Sumber asli: https://vervalpd.data.kemendikdasmen.go.id/index.php/Ckabupaten/rekap_data_residu
 */
import fs from "node:fs";
import path from "node:path";

const SHEET_ID = process.env.RESIDU_SHEET_ID || "1HZ2hBHOawj9thFiZBLGP5nA31UprFfS0Ez8Lyrr_lFQ";
const SHEET_GID = process.env.RESIDU_SHEET_GID || "1660030125";
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`;

const OUT_LIVE = path.resolve("data/residu-live.json");
const OUT_HISTORY_DIR = path.resolve("data/history/residu");
const TIMEOUT_MS = 45000;
const ALLOWED_JENJANG = new Set(["TK", "KB", "TPA", "SPS", "SD", "SMP", "PAUD"]);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(cell.trim());
        cell = "";
      } else if (ch === "\r" && next === "\n") {
        row.push(cell.trim());
        rows.push(row);
        row = [];
        cell = "";
        i++;
      } else if (ch === "\n" || ch === "\r") {
        row.push(cell.trim());
        rows.push(row);
        row = [];
        cell = "";
      } else {
        cell += ch;
      }
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows;
}

function toInt(val) {
  const cleaned = String(val ?? "").replace(/[^0-9-]/g, "");
  const num = parseInt(cleaned, 10);
  return Number.isFinite(num) ? num : 0;
}

function parseNpsnAndNama(rawNama) {
  const match = String(rawNama ?? "").match(/^\(?(\d{8})\)?\s*(.+)$/);
  if (match) {
    return { npsn: match[1], nama: match[2].trim() };
  }
  return { npsn: null, nama: String(rawNama ?? "").trim() };
}

function getWibTimestamp(date = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(date).replace(" ", "T") + "+07:00";
}

async function fetchWithRetry(url, retries = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "DQMWNG-Residu-Sync/1.0 (+https://github.com/mmkrsulis/DQMWNG)",
          "Accept": "text/csv,text/plain;q=0.9,*/*;q=0.8"
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: "follow"
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} saat mengambil CSV`);
      }
      if (text.trim().startsWith("<!DOCTYPE html") || text.includes("accounts.google.com")) {
        throw new Error("Respons berupa halaman login HTML. Pastikan Google Sheets sudah disetel 'Anyone with the link can view'.");
      }
      return text;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, attempt * 2000));
      }
    }
  }
  throw lastErr;
}

async function main() {
  console.log(`Mengambil data Residu PD dari Google Sheets (GID: ${SHEET_GID})...`);
  const csvText = await fetchWithRetry(CSV_URL);
  const rows = parseCsv(csvText);

  if (rows.length < 10) {
    throw new Error(`Data CSV terlalu sedikit (${rows.length} baris). Proses dibatalkan agar data lama aman.`);
  }

  const headers = rows[0].map((h) => h.toLowerCase());
  const idxNama = headers.findIndex((h) => h === "nama");
  const idxJenjang = headers.findIndex((h) => h === "jenjang");
  const idxStatus = headers.findIndex((h) => h === "status");
  const idxKecamatan = headers.findIndex((h) => h === "kecamatan");
  const idxNisn = headers.findIndex((h) => h.includes("nisn"));
  const idxNikDukcapil = headers.findIndex((h) => h.includes("nik dukcapil"));
  const idxNikGanda = headers.findIndex((h) => h.includes("nik ganda"));
  const idxResNama = headers.findIndex((h) => h.includes("validasi - nama"));
  const idxTempatLahir = headers.findIndex((h) => h.includes("tempat lahir"));
  const idxTanggalLahir = headers.findIndex((h) => h.includes("tanggal lahir"));
  const idxIbuKandung = headers.findIndex((h) => h.includes("ibu kandung"));
  const idxDesa = headers.findIndex((h) => h.includes("desa/kelurahan"));
  const idxResiduValidasi = headers.findIndex((h) => h === "residu validasi");
  const idxWaktu = headers.findIndex((h) => h.includes("waktu pembaruan"));
  const idxSumber = headers.findIndex((h) => h === "sumber");

  if (idxNama === -1 || idxJenjang === -1 || idxKecamatan === -1) {
    throw new Error(`Header kolom wajib tidak ditemukan. Header terbaca: ${rows[0].join(" | ")}`);
  }

  const seenNpsn = new Set();
  const records = [];
  let skippedEmpty = 0;
  let skippedJenjang = 0;
  let duplicateCount = 0;
  let latestSourceUpdate = "";
  let sourceOriginUrl = "https://vervalpd.data.kemendikdasmen.go.id/index.php/Ckabupaten/rekap_data_residu";

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 5 || !r[idxNama]) {
      skippedEmpty++;
      continue;
    }

    const { npsn, nama } = parseNpsnAndNama(r[idxNama]);
    if (!npsn) {
      skippedEmpty++;
      continue;
    }

    const jenjang = String(r[idxJenjang] ?? "").trim().toUpperCase();
    if (!ALLOWED_JENJANG.has(jenjang)) {
      skippedJenjang++;
      continue;
    }

    if (seenNpsn.has(npsn)) {
      duplicateCount++;
      continue;
    }
    seenNpsn.add(npsn);

    const waktuPembaruan = idxWaktu !== -1 ? String(r[idxWaktu] ?? "").trim() : "";
    if (waktuPembaruan && waktuPembaruan > latestSourceUpdate) {
      latestSourceUpdate = waktuPembaruan;
    }
    if (idxSumber !== -1 && r[idxSumber] && r[idxSumber].startsWith("http")) {
      sourceOriginUrl = r[idxSumber].trim();
    }

    const residu = {
      nisn: idxNisn !== -1 ? toInt(r[idxNisn]) : 0,
      nik_dukcapil: idxNikDukcapil !== -1 ? toInt(r[idxNikDukcapil]) : 0,
      nik_ganda: idxNikGanda !== -1 ? toInt(r[idxNikGanda]) : 0,
      nama: idxResNama !== -1 ? toInt(r[idxResNama]) : 0,
      tempat_lahir: idxTempatLahir !== -1 ? toInt(r[idxTempatLahir]) : 0,
      tanggal_lahir: idxTanggalLahir !== -1 ? toInt(r[idxTanggalLahir]) : 0,
      ibu_kandung: idxIbuKandung !== -1 ? toInt(r[idxIbuKandung]) : 0,
      desa_kelurahan: idxDesa !== -1 ? toInt(r[idxDesa]) : 0,
      residu_validasi: idxResiduValidasi !== -1 ? toInt(r[idxResiduValidasi]) : 0
    };

    const totalIndikator =
      residu.nisn +
      residu.nik_dukcapil +
      residu.nik_ganda +
      residu.nama +
      residu.tempat_lahir +
      residu.tanggal_lahir +
      residu.ibu_kandung +
      residu.desa_kelurahan +
      residu.residu_validasi;

    records.push({
      npsn,
      nama,
      jenjang,
      status: idxStatus !== -1 ? String(r[idxStatus] ?? "").trim() : "",
      kecamatan: String(r[idxKecamatan] ?? "").trim(),
      residu,
      total_flag_indikator: totalIndikator,
      waktu_pembaruan_sumber: waktuPembaruan
    });
  }

  if (records.length < 50) {
    throw new Error(`Jumlah sekolah valid terlalu sedikit (${records.length}). Snapshot lama tidak ditimpa.`);
  }

  if (fs.existsSync(OUT_LIVE)) {
    try {
      const prev = JSON.parse(fs.readFileSync(OUT_LIVE, "utf8"));
      const prevCount = prev?.meta?.record_count ?? 0;
      if (prevCount > 0 && records.length < prevCount * 0.7) {
        throw new Error(`Anomali jumlah sekolah turun >30% (${records.length} vs ${prevCount} sebelumnya).`);
      }
    } catch (e) {
      if (e.message.includes("Anomali")) throw e;
    }
  }

  const summary = {
    total_sekolah_terdata: records.length,
    sekolah_dengan_residu: 0,
    sekolah_bersih_residu: 0,
    indikator: {
      nisn: 0,
      nik_dukcapil: 0,
      nik_ganda: 0,
      nama: 0,
      tempat_lahir: 0,
      tanggal_lahir: 0,
      ibu_kandung: 0,
      desa_kelurahan: 0,
      residu_validasi: 0
    },
    by_jenjang: {},
    by_kecamatan: {}
  };

  for (const item of records) {
    if (item.total_flag_indikator > 0) summary.sekolah_dengan_residu++;
    else summary.sekolah_bersih_residu++;

    for (const k of Object.keys(summary.indikator)) {
      summary.indikator[k] += item.residu[k];
    }

    if (!summary.by_jenjang[item.jenjang]) {
      summary.by_jenjang[item.jenjang] = { sekolah: 0, sekolah_bermasalah: 0, total_flag: 0 };
    }
    summary.by_jenjang[item.jenjang].sekolah++;
    if (item.total_flag_indikator > 0) summary.by_jenjang[item.jenjang].sekolah_bermasalah++;
    summary.by_jenjang[item.jenjang].total_flag += item.total_flag_indikator;

    const kec = item.kecamatan || "Tidak Diketahui";
    if (!summary.by_kecamatan[kec]) {
      summary.by_kecamatan[kec] = { sekolah: 0, sekolah_bermasalah: 0, total_flag: 0 };
    }
    summary.by_kecamatan[kec].sekolah++;
    if (item.total_flag_indikator > 0) summary.by_kecamatan[kec].sekolah_bermasalah++;
    summary.by_kecamatan[kec].total_flag += item.total_flag_indikator;
  }

  const now = new Date();
  const output = {
    meta: {
      domain: "residu_pd",
      schema_version: "1.0.0",
      source_origin: sourceOriginUrl,
      source_staging: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit#gid=${SHEET_GID}`,
      source_updated_at: latestSourceUpdate || null,
      fetched_at_utc: now.toISOString(),
      fetched_at_wib: getWibTimestamp(now),
      record_count: records.length,
      validation: {
        duplicate_npsn_ignored: duplicateCount,
        skipped_non_binaan_jenjang: skippedJenjang,
        skipped_empty_or_invalid: skippedEmpty
      }
    },
    summary,
    schools: records
  };

  fs.mkdirSync(path.dirname(OUT_LIVE), { recursive: true });
  fs.writeFileSync(OUT_LIVE, JSON.stringify(output, null, 2) + "\n");

  const dateWib = getWibTimestamp(now).slice(0, 10);
  fs.mkdirSync(OUT_HISTORY_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_HISTORY_DIR, `${dateWib}.json`), JSON.stringify(output, null, 2) + "\n");

  console.log(`Sukses sinkronisasi Residu PD: ${records.length} sekolah valid.`);
  console.log(`Sekolah dengan residu: ${summary.sekolah_dengan_residu} | Bersih: ${summary.sekolah_bersih_residu}`);
  console.log(`Output tersimpan di: ${OUT_LIVE}`);
}

main().catch((err) => {
  console.error(`RESIDU SYNC FAILED: ${err.message}`);
  process.exitCode = 1;
});
