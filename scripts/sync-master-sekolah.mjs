#!/usr/bin/env node
/**
 * Sinkronisasi & konsolidasi Master Sekolah Kabupaten Wonogiri.
 * - Membaca array 2D Google Sheets (data/sources/master.json & data/sources/dqm-nilai.json),
 *   snapshot crawler (data/master-sekolah-live.json & data/sources/master-binaan-disdik.json),
 *   serta snapshot live tervalidasi (data/residu-live.json & data/dqm-live.json).
 * - Mendukung NPSN 8 karakter alfanumerik (termasuk awalan huruf P/K untuk lembaga nonformal/PAUD).
 * - Fail-closed: tidak pernah menimpa snapshot master bila hasil konsolidasi menyusut/tidak valid.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const MASTER_SOURCE_PATH = path.resolve("data/sources/master.json");
const MASTER_BINAAN_PATH = path.resolve("data/sources/master-binaan-disdik.json");
const DQM_SOURCE_PATH = path.resolve("data/sources/dqm-nilai.json");
const RESIDU_LIVE_PATH = path.resolve("data/residu-live.json");
const DQM_LIVE_PATH = path.resolve("data/dqm-live.json");
const OUT_LIVE = path.resolve("data/master-sekolah-live.json");
const OUT_HISTORY_DIR = path.resolve("data/history/master-sekolah");

export const BINAAN_BENTUK = new Set([
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
  "DIKMAS",
]);

export const PAUD_SD_SMP_BENTUK = new Set([
  "TK",
  "TKN",
  "TKS",
  "KB",
  "TPA",
  "SPS",
  "PAUD",
  "SD",
  "SMP",
]);

function getWibTimestamp(date = new Date()) {
  return (
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .format(date)
      .replace(" ", "T") + "+07:00"
  );
}

export function normalizeNpsn(val) {
  const cleaned = String(val ?? "").trim().toUpperCase();
  return /^[A-Z0-9]{8}$/.test(cleaned) ? cleaned : null;
}

function normalizeBentuk(raw) {
  const val = String(raw ?? "").trim().toUpperCase();
  if (!val) return null;
  if (val === "KURSUS") return "LKP";
  if (val === "PONPES") return "PONDOK PESANTREN";
  return val;
}

function inferKategori(bentuk, rawKategori = null) {
  const k = String(rawKategori ?? "").trim().toUpperCase();
  if (k && ["PAUD", "DIKDAS", "DIKMEN", "DIKMAS"].includes(k)) return k;
  const b = normalizeBentuk(bentuk);
  if (!b) return null;
  if (["TK", "TKN", "TKS", "KB", "TPA", "SPS", "PAUD", "PAUDQ"].includes(b)) return "PAUD";
  if (["SD", "SMP", "MI", "MTS", "SPM WUSTHA"].includes(b)) return "DIKDAS";
  if (["SMA", "SMK", "SLB", "MA", "MAK", "SPM ULYA", "SPM ULA"].includes(b)) return "DIKMEN";
  if (["PKBM", "SKB", "LKP", "KURSUS", "TBM", "DIKMAS", "PONDOK PESANTREN"].includes(b)) return "DIKMAS";
  return k || null;
}

export function isBinaanDisdikRecord(kementerianPembina, bentukPendidikan) {
  const kem = String(kementerianPembina ?? "").trim().toLowerCase();
  if (kem) {
    if (kem.includes("agama") || kem.includes("tinggi") || kem.includes("sains") || kem.includes("sosial")) {
      return false;
    }
    if (!kem.includes("dikdasmen") && !kem.includes("pendidikan") && !kem.includes("kemdikbud")) {
      return false;
    }
  }
  const bentuk = normalizeBentuk(bentukPendidikan);
  return Boolean(bentuk && BINAAN_BENTUK.has(bentuk));
}

function readJsonSafe(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Mengubah array 2D Google Sheets (`values`) menjadi array objek berbasis header.
 * Mendeteksi baris header secara otomatis (baik baris indeks 0 maupun indeks 1 bila baris 0 adalah judul).
 */
export function parseSheetRows(payload, requiredColumns = ["NPSN"]) {
  const values = Array.isArray(payload?.values) ? payload.values : Array.isArray(payload) ? payload : null;
  if (!values || values.length < 2 || !Array.isArray(values[0])) return [];

  const requiredUpper = requiredColumns.map((c) => c.trim().toUpperCase());
  let headerIdx = -1;

  for (let i = 0; i < Math.min(values.length, 5); i += 1) {
    const row = values[i];
    if (!Array.isArray(row)) continue;
    const upperCells = new Set(row.map((cell) => String(cell ?? "").trim().toUpperCase()));
    if (requiredUpper.every((col) => upperCells.has(col))) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx < 0) return [];

  const headers = values[headerIdx].map((h) => String(h ?? "").trim());
  const records = [];

  for (let r = headerIdx + 1; r < values.length; r += 1) {
    const row = values[r];
    if (!Array.isArray(row) || row.length === 0) continue;
    const obj = {};
    for (let c = 0; c < headers.length; c += 1) {
      const key = headers[c];
      if (!key) continue;
      obj[key] = row[c] ?? null;
    }
    records.push(obj);
  }

  return records;
}

export function extractSchoolRows(data, requiredSheetCols = ["NPSN"]) {
  if (!data) return [];
  if (Array.isArray(data?.values)) {
    return parseSheetRows(data, requiredSheetCols);
  }
  if (Array.isArray(data)) {
    if (data.length > 0 && Array.isArray(data[0])) {
      return parseSheetRows(data, requiredSheetCols);
    }
    return data;
  }
  if (typeof data === "object") {
    for (const key of ["schools", "sekolah", "data", "items", "records", "master"]) {
      if (Array.isArray(data[key])) return data[key];
    }
  }
  return [];
}

function buildUrls(npsn, uuid, existingUrls = {}) {
  const cleanUuid = uuid ? String(uuid).trim() : null;
  return {
    sumber_daftar: existingUrls?.sumber_daftar ?? null,
    detail_satpen:
      existingUrls?.detail_satpen ??
      `https://referensi.data.kemendikdasmen.go.id/satpen/detail/${encodeURIComponent(npsn)}`,
    profil_sekolah:
      existingUrls?.profil_sekolah ??
      (cleanUuid
        ? `https://sekolah.data.kemendikdasmen.go.id/profil-sekolah/${encodeURIComponent(cleanUuid)}`
        : null),
    dqm:
      existingUrls?.dqm ??
      (cleanUuid
        ? `https://kualitas.data.kemendikdasmen.go.id/sekolah/${encodeURIComponent(cleanUuid)}`
        : null),
  };
}

function cleanStr(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s && s.toUpperCase() !== "NONE" && s.toUpperCase() !== "NULL" ? s : null;
}

function createEmptySchool(npsn) {
  return {
    npsn,
    nama: null,
    kategori: null,
    bentuk_pendidikan: null,
    jenjang_pendidikan: null,
    status: null,
    status_ods: null,
    status_kepemilikan: null,
    uuid: null,
    kementerian_pembina: null,
    yayasan: null,
    npyp: null,
    akreditasi: null,
    sk_izin_operasional: null,
    kode_kabupaten: "031200",
    kode_kecamatan: null,
    kecamatan: null,
    desa_kelurahan: null,
    rt_rw: null,
    kode_pos: null,
    alamat: null,
    lintang: null,
    bujur: null,
    urls: {
      sumber_daftar: null,
      detail_satpen: null,
      profil_sekolah: null,
      dqm: null,
    },
    is_binaan_disdik: false,
  };
}

export function consolidateMasterSekolah({
  existingLive = null,
  existingBinaan = null,
  masterSheet = null,
  dqmSheet = null,
  residuLive = null,
  dqmLive = null,
  now = new Date(),
}) {
  const byNpsn = new Map();
  const sourcesUsed = [];
  const kecamatanByCode = new Map();

  const upsert = (raw) => {
    const npsn = normalizeNpsn(raw.npsn);
    if (!npsn) return;

    const current = byNpsn.get(npsn) ?? createEmptySchool(npsn);
    const bentuk = normalizeBentuk(raw.bentuk_pendidikan) ?? current.bentuk_pendidikan;
    const kategori = inferKategori(bentuk, raw.kategori) ?? current.kategori;
    const kementerian = cleanStr(raw.kementerian_pembina) ?? current.kementerian_pembina;
    const uuid = cleanStr(raw.uuid) ?? current.uuid;
    const kodeKec = cleanStr(raw.kode_kecamatan) ?? current.kode_kecamatan;
    const namaKec = cleanStr(raw.kecamatan) ?? current.kecamatan;

    if (kodeKec && namaKec && !kecamatanByCode.has(kodeKec)) {
      kecamatanByCode.set(kodeKec, namaKec);
    }

    const mergedUrls = buildUrls(npsn, uuid, {
      sumber_daftar: cleanStr(raw.urls?.sumber_daftar) ?? current.urls?.sumber_daftar,
      detail_satpen: cleanStr(raw.urls?.detail_satpen) ?? current.urls?.detail_satpen,
      profil_sekolah: cleanStr(raw.urls?.profil_sekolah) ?? current.urls?.profil_sekolah,
      dqm: cleanStr(raw.urls?.dqm) ?? current.urls?.dqm,
    });

    const merged = {
      ...current,
      npsn,
      nama: cleanStr(raw.nama) ?? current.nama,
      kategori,
      bentuk_pendidikan: bentuk,
      jenjang_pendidikan: cleanStr(raw.jenjang_pendidikan) ?? current.jenjang_pendidikan,
      status: cleanStr(raw.status)?.toUpperCase() ?? current.status,
      status_ods: cleanStr(raw.status_ods) ?? current.status_ods,
      status_kepemilikan: cleanStr(raw.status_kepemilikan) ?? current.status_kepemilikan,
      uuid,
      kementerian_pembina: kementerian,
      yayasan: cleanStr(raw.yayasan) ?? current.yayasan,
      npyp: cleanStr(raw.npyp) ?? current.npyp,
      akreditasi: cleanStr(raw.akreditasi) ?? current.akreditasi,
      sk_izin_operasional: cleanStr(raw.sk_izin_operasional) ?? current.sk_izin_operasional,
      kode_kabupaten: cleanStr(raw.kode_kabupaten) ?? current.kode_kabupaten ?? "031200",
      kode_kecamatan: kodeKec,
      kecamatan: namaKec,
      desa_kelurahan: cleanStr(raw.desa_kelurahan) ?? current.desa_kelurahan,
      rt_rw: cleanStr(raw.rt_rw) ?? current.rt_rw,
      kode_pos: cleanStr(raw.kode_pos) ?? current.kode_pos,
      alamat: cleanStr(raw.alamat) ?? current.alamat,
      lintang: raw.lintang ?? current.lintang ?? null,
      bujur: raw.bujur ?? current.bujur ?? null,
      urls: mergedUrls,
      is_binaan_disdik: isBinaanDisdikRecord(kementerian, bentuk),
    };

    byNpsn.set(npsn, merged);
  };

  // 1. Baseline dari snapshot crawler master-sekolah-live.json (bila tersedia)
  const liveRows = extractSchoolRows(existingLive);
  if (liveRows.length > 0) {
    sourcesUsed.push({ file: "data/master-sekolah-live.json", count: liveRows.length });
    for (const s of liveRows) {
      upsert(s);
    }
  }

  // 2. Baseline tambahan dari data/sources/master-binaan-disdik.json (bila tersedia)
  const binaanRows = extractSchoolRows(existingBinaan);
  if (binaanRows.length > 0) {
    sourcesUsed.push({ file: "data/sources/master-binaan-disdik.json", count: binaanRows.length });
    for (const s of binaanRows) {
      upsert(s);
    }
  }

  // 3. Sumber resmi Google Sheets 2D: data/sources/master.json
  const masterRows = extractSchoolRows(masterSheet, ["NPSN", "BENTUK PENDIDIKAN"]);
  if (masterRows.length > 0) {
    sourcesUsed.push({ file: "data/sources/master.json", count: masterRows.length });
    for (const row of masterRows) {
      upsert({
        npsn: row.NPSN ?? row.npsn,
        nama: row["NAMA SATUAN PENDIDIKAN"] ?? row.nama,
        kategori: row.KATEGORI ?? row.kategori,
        bentuk_pendidikan: row["BENTUK PENDIDIKAN"] ?? row.bentuk_pendidikan,
        jenjang_pendidikan: row["JENJANG RESMI"] ?? row.jenjang_pendidikan,
        status: row.STATUS ?? row.status,
        kementerian_pembina: row["KEMENTERIAN PEMBINA"] ?? row.kementerian_pembina,
        yayasan: row.NAUNGAN ?? row.yayasan,
        akreditasi: row.AKREDITASI ?? row.akreditasi,
        kode_kecamatan: row["KODE KECAMATAN"] ?? row.kode_kecamatan,
        kecamatan: row.KECAMATAN ?? row.kecamatan,
        desa_kelurahan: row["DESA/KELURAHAN"] ?? row.desa_kelurahan,
        alamat: row.ALAMAT ?? row.alamat,
        urls: {
          sumber_daftar: row["SUMBER DAFTAR"] ?? null,
          detail_satpen: row["SUMBER DETAIL"] ?? null,
        },
      });
    }
  }

  // 4. Perkaya UUID & URL DQM dari data/sources/dqm-nilai.json (Google Sheets 2D)
  const dqmSheetRows = extractSchoolRows(dqmSheet, ["NPSN", "UUID"]);
  if (dqmSheetRows.length > 0) {
    sourcesUsed.push({ file: "data/sources/dqm-nilai.json", count: dqmSheetRows.length });
    for (const row of dqmSheetRows) {
      const npsn = normalizeNpsn(row.NPSN ?? row.npsn);
      if (!npsn || !byNpsn.has(npsn)) continue;
      upsert({
        npsn,
        uuid: row.UUID ?? row.uuid,
        nama: row["Nama Sekolah"] ?? row.nama,
        bentuk_pendidikan: row.Jenjang ?? row.jenjang,
        kecamatan: row.Kecamatan ?? row.kecamatan,
      });
    }
  }

  // 5. Perkaya dengan data/residu-live.json (hanya untuk NPSN yang sudah terdaftar atau valid)
  const residuRows = extractSchoolRows(residuLive);
  if (residuRows.length > 0) {
    sourcesUsed.push({ file: "data/residu-live.json", count: residuRows.length });
    for (const s of residuRows) {
      const npsn = normalizeNpsn(s.npsn);
      if (!npsn) continue;
      upsert({
        npsn,
        nama: s.nama,
        bentuk_pendidikan: s.jenjang,
        status: s.status,
        kecamatan: s.kecamatan,
        kementerian_pembina: byNpsn.get(npsn)?.kementerian_pembina ?? "Kementerian Pendidikan Dasar dan Menengah",
      });
    }
  }

  // 6. Perkaya dengan data/dqm-live.json bila tersedia
  const dqmLiveRows = extractSchoolRows(dqmLive);
  if (dqmLiveRows.length > 0) {
    sourcesUsed.push({ file: "data/dqm-live.json", count: dqmLiveRows.length });
    for (const d of dqmLiveRows) {
      const npsn = normalizeNpsn(d.npsn);
      if (!npsn || !byNpsn.has(npsn)) continue;
      upsert({
        npsn,
        uuid: d.uuid,
        nama: d.name ?? d.nama,
        bentuk_pendidikan: d.form ?? d.bentuk_pendidikan,
        kecamatan: d.district ?? d.kecamatan,
      });
    }
  }

  // Lengkapi nama kecamatan yang masih null berdasarkan kode_kecamatan
  const schools = [...byNpsn.values()]
    .map((sc) => ({
      ...sc,
      kecamatan: sc.kecamatan ?? (sc.kode_kecamatan ? kecamatanByCode.get(sc.kode_kecamatan) ?? null : null),
    }))
    .sort((a, b) => a.npsn.localeCompare(b.npsn));

  const byKategoriSemua = {};
  const byKategoriBinaan = {};
  const byBentukSemua = {};
  const byBentukBinaan = {};
  let totalBinaanDisdik = 0;
  let totalBinaanPaudSdSmp = 0;

  for (const sc of schools) {
    const kat = sc.kategori || "LAINNYA";
    const btk = sc.bentuk_pendidikan || "TIDAK_DIKETAHUI";
    byKategoriSemua[kat] = (byKategoriSemua[kat] ?? 0) + 1;
    byBentukSemua[btk] = (byBentukSemua[btk] ?? 0) + 1;

    if (sc.is_binaan_disdik) {
      totalBinaanDisdik += 1;
      byKategoriBinaan[kat] = (byKategoriBinaan[kat] ?? 0) + 1;
      byBentukBinaan[btk] = (byBentukBinaan[btk] ?? 0) + 1;
      if (PAUD_SD_SMP_BENTUK.has(btk)) {
        totalBinaanPaudSdSmp += 1;
      }
    }
  }

  const fetchedAtWib = getWibTimestamp(now);
  const binaanSchools = schools.filter((sc) => sc.is_binaan_disdik);

  const output = {
    meta: {
      domain: "master_sekolah",
      schema_version: "3.5.0-consolidated",
      source_mode: existingLive?.meta?.source_mode ?? "consolidated_master_sources",
      kode_kabupaten: "031200",
      wilayah: "Kabupaten Wonogiri",
      categories_crawled: existingLive?.meta?.categories_crawled ?? ["paud", "dikdas", "dikmas", "dikmen"],
      detail_enriched: true,
      sources_used: sourcesUsed,
      fetched_at_utc: now.toISOString(),
      fetched_at_wib: fetchedAtWib,
      total_semua_satpen: schools.length,
      total_binaan_disdik: totalBinaanDisdik,
      total_binaan_paud_sd_smp: totalBinaanPaudSdSmp,
    },
    summary: {
      total_semua_satpen: schools.length,
      total_binaan_disdik: totalBinaanDisdik,
      total_binaan_paud_sd_smp: totalBinaanPaudSdSmp,
      by_kategori_semua: byKategoriSemua,
      by_kategori_binaan_disdik: byKategoriBinaan,
      by_bentuk_semua: byBentukSemua,
      by_bentuk_binaan_disdik: byBentukBinaan,
    },
    schools,
  };

  const binaanOutput = {
    meta: {
      generated_at_wib: fetchedAtWib,
      source_mode: "consolidated_master_sources",
      categories_crawled: ["paud", "dikdas", "dikmas"],
      total_binaan_disdik: binaanSchools.length,
      total_binaan_paud_sd_smp: totalBinaanPaudSdSmp,
    },
    summary_by_bentuk: byBentukBinaan,
    schools: binaanSchools,
  };

  validateMasterSnapshot(output, existingLive);
  return { output, binaanOutput };
}

export function validateMasterSnapshot(snapshot, previousLive = null) {
  if (!snapshot || !Array.isArray(snapshot.schools)) {
    throw new Error("Payload snapshot Master Sekolah tidak valid.");
  }
  if (snapshot.schools.length < 1800) {
    throw new Error(
      `Validasi Master Sekolah gagal: total satpen (${snapshot.schools.length}) di bawah ambang minimum 1.800.`
    );
  }
  if ((snapshot.summary?.total_binaan_paud_sd_smp ?? 0) < 1700) {
    throw new Error(
      `Validasi Master Sekolah gagal: total PAUD/SD/SMP binaan (${snapshot.summary?.total_binaan_paud_sd_smp ?? 0}) di bawah ambang 1.700.`
    );
  }

  const prevCount = Array.isArray(previousLive?.schools) ? previousLive.schools.length : 0;
  if (prevCount > 0 && snapshot.schools.length < Math.floor(prevCount * 0.95)) {
    throw new Error(
      `Validasi Master Sekolah gagal (fail-closed): jumlah satpen menyusut drastis dari ${prevCount} menjadi ${snapshot.schools.length}.`
    );
  }

  const seen = new Set();
  for (const sc of snapshot.schools) {
    const npsn = normalizeNpsn(sc?.npsn);
    if (!npsn) {
      throw new Error(`Validasi Master Sekolah gagal: NPSN tidak valid (${sc?.npsn}).`);
    }
    if (seen.has(npsn)) {
      throw new Error(`Validasi Master Sekolah gagal: duplikat NPSN (${npsn}).`);
    }
    seen.add(npsn);
  }
}

function main() {
  const existingLive = readJsonSafe(OUT_LIVE);
  const existingBinaan = readJsonSafe(MASTER_BINAAN_PATH);
  const masterSheet = readJsonSafe(MASTER_SOURCE_PATH);
  const dqmSheet = readJsonSafe(DQM_SOURCE_PATH);
  const residuLive = readJsonSafe(RESIDU_LIVE_PATH);
  const dqmLive = readJsonSafe(DQM_LIVE_PATH);

  const { output, binaanOutput } = consolidateMasterSekolah({
    existingLive,
    existingBinaan,
    masterSheet,
    dqmSheet,
    residuLive,
    dqmLive,
  });

  fs.mkdirSync(path.dirname(OUT_LIVE), { recursive: true });
  fs.writeFileSync(OUT_LIVE, JSON.stringify(output, null, 2) + "\n");

  fs.mkdirSync(path.dirname(MASTER_BINAAN_PATH), { recursive: true });
  fs.writeFileSync(MASTER_BINAAN_PATH, JSON.stringify(binaanOutput, null, 2) + "\n");

  const dateWib = output.meta.fetched_at_wib.slice(0, 10);
  fs.mkdirSync(OUT_HISTORY_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_HISTORY_DIR, `${dateWib}.json`), JSON.stringify(output, null, 2) + "\n");

  console.log(
    `Sukses konsolidasi Master Sekolah Wonogiri: ${output.summary.total_semua_satpen} satpen unik (${output.summary.total_binaan_disdik} binaan Disdik; ${output.summary.total_binaan_paud_sd_smp} PAUD/SD/SMP).`
  );
  console.log(`Output tersimpan di: ${OUT_LIVE}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    main();
  } catch (err) {
    console.error("GAGAL SYNC MASTER SEKOLAH (snapshot lama dipertahankan):", err.message || err);
    process.exit(1);
  }
}
