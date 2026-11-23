#!/usr/bin/env node
/**
 * Sinkronisasi / konsolidasi Master Sekolah Kabupaten Wonogiri (PAUD, SD, SMP)
 * Menggabungkan referensi lokal yang sudah ada (data/sources/master.json) serta
 * snapshot terverifikasi (data/residu-live.json, data/dqm-live.json bila ada)
 * ke keluaran terstandar data/master-sekolah-live.json tanpa menimpa data/sources/master.json secara gegabah.
 *
 * Catatan: jika endpoint daftar Referensi Kemendikdasmen terverifikasi aktif,
 * tambahkan sumber URL lewat env MASTER_LIST_URLS (dipisah koma).
 */
import fs from "node:fs";
import path from "node:path";

const MASTER_SOURCE_PATH = path.resolve("data/sources/master.json");
const RESIDU_LIVE_PATH = path.resolve("data/residu-live.json");
const DQM_LIVE_PATH = path.resolve("data/dqm-live.json");
const OUT_LIVE = path.resolve("data/master-sekolah-live.json");
const OUT_HISTORY_DIR = path.resolve("data/history/master-sekolah");

const ALLOWED_JENJANG = new Set(["TK", "KB", "TPA", "SPS", "SD", "SMP", "PAUD"]);

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

function normalizeNpsn(val) {
  const digits = String(val ?? "").replace(/\D/g, "");
  return /^\d{8}$/.test(digits) ? digits : null;
}

function readJsonSafe(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function extractArrayCandidates(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (typeof data === "object") {
    for (const key of ["schools", "data", "items", "records", "master"]) {
      if (Array.isArray(data[key])) return data[key];
    }
  }
  return [];
}

function main() {
  const byNpsn = new Map();
  const sourcesUsed = [];

  // 1. Muat data/sources/master.json jika tersedia
  const masterSrc = readJsonSafe(MASTER_SOURCE_PATH);
  const masterRows = extractArrayCandidates(masterSrc);
  if (masterRows.length > 0) {
    sourcesUsed.push({ file: "data/sources/master.json", count: masterRows.length });
    for (const row of masterRows) {
      const npsn = normalizeNpsn(row.npsn ?? row.kode_npsn ?? row.id);
      if (!npsn) continue;
      const jenjang = String(row.jenjang ?? row.bentuk_pendidikan ?? row.tingkat ?? "").trim().toUpperCase();
      if (jenjang && !ALLOWED_JENJANG.has(jenjang)) continue;

      byNpsn.set(npsn, {
        npsn,
        nama: String(row.nama ?? row.nama_sekolah ?? row.satpen ?? "").trim() || null,
        jenjang: jenjang || null,
        status: String(row.status ?? row.status_sekolah ?? "").trim() || null,
        kecamatan: String(row.kecamatan ?? row.nama_kecamatan ?? "").trim() || null,
        uuid_dqm: row.uuid_dqm ?? row.uuid ?? null,
        sources: ["master.json"]
      });
    }
  }

  // 2. Perkaya/sinkronkan dengan data/residu-live.json (309 sekolah tervalidasi)
  const residuData = readJsonSafe(RESIDU_LIVE_PATH);
  const residuSchools = Array.isArray(residuData?.schools) ? residuData.schools : [];
  if (residuSchools.length > 0) {
    sourcesUsed.push({ file: "data/residu-live.json", count: residuSchools.length });
    for (const s of residuSchools) {
      const npsn = normalizeNpsn(s.npsn);
      if (!npsn) continue;
      const jenjang = String(s.jenjang ?? "").trim().toUpperCase();
      if (jenjang && !ALLOWED_JENJANG.has(jenjang)) continue;

      const existing = byNpsn.get(npsn) ?? {
        npsn,
        nama: null,
        jenjang: null,
        status: null,
        kecamatan: null,
        uuid_dqm: null,
        sources: []
      };

      existing.nama = existing.nama || s.nama || null;
      existing.jenjang = existing.jenjang || jenjang || null;
      existing.status = existing.status || s.status || null;
      existing.kecamatan = existing.kecamatan || s.kecamatan || null;
      if (!existing.sources.includes("residu-live.json")) {
        existing.sources.push("residu-live.json");
      }
      byNpsn.set(npsn, existing);
    }
  }

  // 3. Perkaya dengan data/dqm-live.json jika tersedia
  const dqmData = readJsonSafe(DQM_LIVE_PATH);
  const dqmRows = extractArrayCandidates(dqmData);
  if (dqmRows.length > 0) {
    sourcesUsed.push({ file: "data/dqm-live.json", count: dqmRows.length });
    for (const d of dqmRows) {
      const npsn = normalizeNpsn(d.npsn);
      if (!npsn) continue;
      const existing = byNpsn.get(npsn) ?? {
        npsn,
        nama: null,
        jenjang: null,
        status: null,
        kecamatan: null,
        uuid_dqm: null,
        sources: []
      };
      existing.nama = existing.nama || d.nama || null;
      existing.uuid_dqm = existing.uuid_dqm || d.uuid || null;
      if (!existing.sources.includes("dqm-live.json")) {
        existing.sources.push("dqm-live.json");
      }
      byNpsn.set(npsn, existing);
    }
  }

  const schools = [...byNpsn.values()].sort((a, b) => a.npsn.localeCompare(b.npsn));
  if (schools.length === 0) {
    throw new Error("Tidak ada data sekolah valid yang dapat dikonsolidasikan. Snapshot lama tidak ditimpa.");
  }

  const byJenjang = {};
  const byKecamatan = {};
  for (const sc of schools) {
    const j = sc.jenjang || "TIDAK_DIKETAHUI";
    byJenjang[j] = (byJenjang[j] ?? 0) + 1;

    const k = sc.kecamatan || "TIDAK_DIKETAHUI";
    byKecamatan[k] = (byKecamatan[k] ?? 0) + 1;
  }

  const now = new Date();
  const output = {
    meta: {
      domain: "master_sekolah",
      schema_version: "1.0.0",
      wilayah: "Kabupaten Wonogiri (031200)",
      cakupan_jenjang: ["PAUD", "TK", "KB", "TPA", "SPS", "SD", "SMP"],
      sources_used: sourcesUsed,
      fetched_at_utc: now.toISOString(),
      fetched_at_wib: getWibTimestamp(now),
      record_count: schools.length
    },
    summary: {
      total_sekolah: schools.length,
      by_jenjang: byJenjang,
      by_kecamatan: byKecamatan
    },
    schools
  };

  fs.mkdirSync(path.dirname(OUT_LIVE), { recursive: true });
  fs.writeFileSync(OUT_LIVE, JSON.stringify(output, null, 2) + "\n");

  const dateWib = getWibTimestamp(now).slice(0, 10);
  fs.mkdirSync(OUT_HISTORY_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_HISTORY_DIR, `${dateWib}.json`), JSON.stringify(output, null, 2) + "\n");

  console.log(`Sukses konsolidasi Master Sekolah Wonogiri: ${schools.length} sekolah unik berdasarkan NPSN.`);
  console.log(`Output tersimpan di: ${OUT_LIVE}`);
}

main();
