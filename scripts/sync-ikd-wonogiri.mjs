#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const BASE_URL = 'https://dapo.kemendikdasmen.go.id';
const PROVINSI = 'Prov. Jawa Tengah';
const KABUPATEN = 'Kab. Wonogiri';

const OUT_JSON_PATH = path.resolve('data/ikd-wonogiri-live.json');
const OUT_CSV_PATH = path.resolve('data/ikd-wonogiri-live.csv');
const OUT_HISTORY_DIR = path.resolve('data/history/ikd');

// Jika true, saat HTTP 403/429/5xx tetap memakai HAR/cache lokal tanpa throw error
const ALLOW_OFFLINE_FALLBACK = true;

export const ALLOWED_JENJANG = new Set(['PAUD', 'TK', 'KB', 'SPS', 'TPA', 'SD', 'SMP']);
export const EXCLUDED_JENJANG = new Set([
  'SMA',
  'SMK',
  'PKBM',
  'SLB',
  'SKB',
  'MA',
  'MTS',
  'MI',
  'LKP',
  'PONDOK PESANTREN',
  'PAUDQ',
  'SPM WUSTHA',
  'SPM ULYA',
]);

const HAR_CANDIDATES = [
  path.resolve('dapo.kemendikdasmen.go.id.har'),
  path.resolve('data/dapo.kemendikdasmen.go.id.har'),
  path.resolve('data/sources/dapo.kemendikdasmen.go.id.har'),
  path.resolve('har/dapo.kemendikdasmen.go.id.har'),
  path.resolve('../dapo.kemendikdasmen.go.id.har'),
  path.join(os.homedir(), 'Downloads', 'dapo.kemendikdasmen.go.id.har'),
];

const MASTER_CANDIDATES = [
  path.resolve('data/master-sekolah-live.json'),
  path.resolve('data/sources/master-binaan-disdik.json'),
  path.resolve('data/master-sekolah.json'),
  path.resolve('data/master-data.json'),
  path.resolve('data/master.json'),
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function wibTimestamp(date = new Date()) {
  return (
    new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .format(date)
      .replace(' ', 'T') + '+07:00'
  );
}

function extractArrayPayload(payload) {
  if (Array.isArray(payload?.schools)) return payload.schools;
  if (Array.isArray(payload?.sekolah)) return payload.sekolah;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload)) return payload;
  return null;
}

async function loadFromHarFallback(endpoint, params = {}) {
  for (const harPath of HAR_CANDIDATES) {
    try {
      const raw = await fs.readFile(harPath, 'utf8');
      const har = JSON.parse(raw);
      const entries = har?.log?.entries ?? [];

      const matched = entries.find((entry) => {
        const reqUrl = entry?.request?.url ?? '';
        if (!reqUrl.includes(`/api/${endpoint}`)) return false;

        const parsed = new URL(reqUrl);
        for (const [key, val] of Object.entries(params)) {
          if (parsed.searchParams.get(key) !== String(val)) return false;
        }

        const text = entry?.response?.content?.text;
        return typeof text === 'string' && text.trim().length > 0;
      });

      if (matched) {
        const parsedJson = JSON.parse(matched.response.content.text);
        const rows = extractArrayPayload(parsedJson);
        if (rows && rows.length > 0) {
          console.warn(
            `[FALLBACK HAR] Memakai ${harPath} untuk ${endpoint} (${rows.length} entri)`
          );
          return rows;
        }
      }
    } catch {
      // Lanjut ke kandidat HAR berikutnya
    }
  }
  return null;
}

async function loadFromExistingJsonFallback(endpoint) {
  try {
    const raw = await fs.readFile(OUT_JSON_PATH, 'utf8');
    const cached = JSON.parse(raw);
    if (
      endpoint === 'ikdByKabupaten' &&
      Array.isArray(cached?.peringkat_jateng) &&
      cached.peringkat_jateng.length > 0
    ) {
      console.warn(
        `[FALLBACK CACHE] Memakai peringkat_jateng dari ${OUT_JSON_PATH} (${cached.peringkat_jateng.length} entri)`
      );
      return cached.peringkat_jateng;
    }
    if (
      endpoint === 'ikdByKabupatenDetail' &&
      Array.isArray(cached?.sekolah) &&
      cached.sekolah.length > 0
    ) {
      console.warn(
        `[FALLBACK CACHE] Memakai sekolah dari ${OUT_JSON_PATH} (${cached.sekolah.length} entri)`
      );
      return cached.sekolah;
    }
  } catch {
    // Belum ada cache valid
  }
  return null;
}

async function fetchIkdData(endpoint, params = {}, referer = `${BASE_URL}/ikd`) {
  const url = new URL(`${BASE_URL}/api/${endpoint}`);
  for (const [key, val] of Object.entries(params)) {
    url.searchParams.set(key, val);
  }

  let lastStatus = 0;
  let lastBody = '';

  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:136.0) Gecko/20100101 Firefox/136.0',
  ];

  for (let i = 0; i < userAgents.length; i += 1) {
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': referer,
        'User-Agent': userAgents[i],
      },
    });

    lastStatus = res.status;
    if (res.ok) {
      const json = await res.json();
      return extractArrayPayload(json) ?? [];
    }

    lastBody = await res.text().catch(() => '');
    if (res.status !== 403 && res.status !== 429) {
      break;
    }

    if (i < userAgents.length - 1) {
      await sleep(500);
    }
  }

  if (ALLOW_OFFLINE_FALLBACK) {
    const harRows = await loadFromHarFallback(endpoint, params);
    if (harRows && harRows.length > 0) return harRows;

    const cacheRows = await loadFromExistingJsonFallback(endpoint);
    if (cacheRows && cacheRows.length > 0) return cacheRows;

    console.warn(
      `[WARN] Gagal HTTP ${lastStatus} pada ${endpoint} dan file HAR/cache berisi data tidak ditemukan; mengembalikan array kosong.`
    );
    return [];
  }

  throw new Error(
    `HTTP ${lastStatus} saat mengakses ${url}${lastBody ? ` | ${lastBody.slice(0, 140)}` : ''}`
  );
}

async function loadMasterSekolah() {
  for (const candidate of MASTER_CANDIDATES) {
    try {
      const raw = await fs.readFile(candidate, 'utf8');
      const parsed = JSON.parse(raw);
      const rows = extractArrayPayload(parsed);
      if (rows && rows.length > 0) {
        return { rows, source: candidate };
      }
    } catch {
      // Coba kandidat berikutnya
    }
  }
  return { rows: [], source: null };
}

export function normalizeJenjang(masterItem, ikdItem) {
  const candidates = [
    ikdItem?.jenjang,
    masterItem?.bentuk_pendidikan,
    masterItem?.BENTUK_PENDIDIKAN,
    masterItem?.jenjang,
  ];
  for (const raw of candidates) {
    const val = String(raw ?? '').trim().toUpperCase();
    if (val) return val;
  }
  return '';
}

export function isBinaanDisdik(masterItem, ikdItem) {
  const kementerian = String(
    masterItem?.kementerian_pembina ??
      masterItem?.KEMENTERIAN_PEMBINA ??
      ikdItem?.kementerian_pembina ??
      ''
  )
    .trim()
    .toLowerCase();

  if (kementerian) {
    if (kementerian.includes('agama') || kementerian.includes('sosial')) {
      return false;
    }
    const isKemendikdasmen =
      kementerian.includes('dikdasmen') ||
      kementerian.includes('pendidikan') ||
      kementerian.includes('kemdikbud');
    if (!isKemendikdasmen) {
      return false;
    }
  }

  const bentuk = normalizeJenjang(masterItem, ikdItem);
  if (!bentuk || EXCLUDED_JENJANG.has(bentuk)) {
    return false;
  }

  return ALLOWED_JENJANG.has(bentuk);
}

export function filterBinaanDisdik(sekolahIkd, masterByNpsn = new Map(), kecamatanByCode = new Map()) {
  const included = [];
  const excludedByJenjang = {};
  let cocokMaster = 0;

  for (const item of sekolahIkd) {
    const npsn = String(item?.npsn ?? item?.NPSN ?? '').trim();
    const masterMatch = masterByNpsn.get(npsn) ?? null;
    const isCocok = Boolean(masterMatch);
    const jenjangNorm = normalizeJenjang(masterMatch, item);

    if (!isBinaanDisdik(masterMatch, item)) {
      const key = jenjangNorm || 'TIDAK_DIKETAHUI';
      excludedByJenjang[key] = (excludedByJenjang[key] ?? 0) + 1;
      continue;
    }

    if (isCocok) cocokMaster += 1;
    const kodeKec = masterMatch?.kode_kecamatan ?? item?.kode_kecamatan ?? null;
    const namaKec =
      masterMatch?.kecamatan ??
      item?.kecamatan ??
      (kodeKec ? kecamatanByCode.get(String(kodeKec).trim()) ?? null : null);

    included.push({
      ...item,
      npsn,
      cocok_master: isCocok,
      binaan_disdik: true,
      bentuk_pendidikan: masterMatch?.bentuk_pendidikan ?? item?.bentuk_pendidikan ?? jenjangNorm,
      kecamatan: namaKec,
      desa_kelurahan: masterMatch?.desa_kelurahan ?? item?.desa_kelurahan ?? null,
      kode_kecamatan: kodeKec,
      kementerian_pembina: masterMatch?.kementerian_pembina ?? item?.kementerian_pembina ?? null,
    });
  }

  return {
    sekolah: included,
    cocokMaster,
    excludedCount: sekolahIkd.length - included.length,
    excludedByJenjang,
  };
}

function isValidScore(val) {
  return typeof val === 'number' && Number.isFinite(val) && val >= 0 && val <= 100;
}

export function validateIkdSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('Payload snapshot IKD tidak valid.');
  }
  if (!Array.isArray(snapshot.peringkat_jateng) || snapshot.peringkat_jateng.length < 35) {
    throw new Error(
      `Validasi IKD gagal: peringkat_jateng hanya ${snapshot.peringkat_jateng?.length ?? 0}/35 kab/kota.`
    );
  }
  if (!snapshot.wonogiri_ringkasan || !isValidScore(snapshot.wonogiri_ringkasan.total)) {
    throw new Error('Validasi IKD gagal: ringkasan capaian Kab. Wonogiri tidak valid.');
  }
  if (!Array.isArray(snapshot.sekolah) || snapshot.sekolah.length < 1500) {
    throw new Error(
      `Validasi IKD gagal: jumlah sekolah binaan terlalu sedikit (${snapshot.sekolah?.length ?? 0}).`
    );
  }

  const seenNpsn = new Set();
  const byJenjang = {};

  for (const row of snapshot.sekolah) {
    const npsn = String(row?.npsn ?? '').trim();
    if (!/^[A-Za-z0-9]{8}$/.test(npsn)) {
      throw new Error(`Validasi IKD gagal: NPSN tidak valid (${npsn}).`);
    }
    if (seenNpsn.has(npsn)) {
      throw new Error(`Validasi IKD gagal: duplikat NPSN (${npsn}).`);
    }
    seenNpsn.add(npsn);

    const jenjang = normalizeJenjang(null, row);
    if (!ALLOWED_JENJANG.has(jenjang) || EXCLUDED_JENJANG.has(jenjang)) {
      throw new Error(
        `Validasi IKD gagal: jenjang di luar binaan PAUD/SD/SMP terdeteksi (${jenjang} - ${npsn}).`
      );
    }

    const kem = String(row?.kementerian_pembina ?? '').toLowerCase();
    if (kem.includes('agama')) {
      throw new Error(`Validasi IKD gagal: satuan Kemenag tidak boleh masuk (${npsn}).`);
    }

    for (const metric of ['kelengkapan', 'validitas', 'mutakhir', 'total']) {
      if (!isValidScore(row?.[metric])) {
        throw new Error(`Validasi IKD gagal: skor ${metric} tidak valid pada NPSN ${npsn}.`);
      }
    }

    const groupKey = ['TK', 'KB', 'SPS', 'TPA', 'PAUD'].includes(jenjang) ? 'PAUD' : jenjang;
    byJenjang[groupKey] = (byJenjang[groupKey] ?? 0) + 1;
  }

  return {
    status: 'VALID',
    total_sekolah_binaan: snapshot.sekolah.length,
    by_jenjang: byJenjang,
    only_paud_sd_smp: true,
    unique_npsn: seenNpsn.size,
  };
}

function toCsv(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const headers = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((k) => set.add(k));
      return set;
    }, new Set())
  );

  const escapeCsv = (val) => {
    if (val === null || val === undefined) return '';
    const str = String(val).replaceAll('"', '""');
    return /[",\n\r]/.test(str) ? `"${str}"` : str;
  };

  return [
    headers.map(escapeCsv).join(','),
    ...rows.map((row) => headers.map((h) => escapeCsv(row[h])).join(',')),
  ].join('\n');
}

async function main() {
  const provReferer = `${BASE_URL}/ikd/${encodeURIComponent(PROVINSI)}`;
  const kabReferer = `${BASE_URL}/ikd/${encodeURIComponent(PROVINSI)}/${encodeURIComponent(KABUPATEN)}`;

  const [kabJateng, sekolahIkd] = await Promise.all([
    fetchIkdData('ikdByKabupaten', { provinsi: PROVINSI }, provReferer),
    fetchIkdData('ikdByKabupatenDetail', { kabupaten: KABUPATEN }, kabReferer),
  ]);

  const wonogiriSummary =
    kabJateng.find((item) =>
      String(item?.kabupaten ?? '').toLowerCase().includes('wonogiri')
    ) ?? null;

  const { rows: masterList } = await loadMasterSekolah();
  const masterByNpsn = new Map();
  const kecamatanByCode = new Map();

  for (const item of masterList) {
    const rawNpsn = item?.npsn ?? item?.NPSN;
    if (rawNpsn !== undefined && rawNpsn !== null) {
      masterByNpsn.set(String(rawNpsn).trim(), item);
    }
    const kodeKec = String(item?.kode_kecamatan ?? '').trim();
    const namaKec = String(item?.kecamatan ?? '').trim();
    if (kodeKec && namaKec && !kecamatanByCode.has(kodeKec)) {
      kecamatanByCode.set(kodeKec, namaKec);
    }
  }

  const {
    sekolah: mergedSekolah,
    cocokMaster,
    excludedCount,
    excludedByJenjang,
  } = filterBinaanDisdik(sekolahIkd, masterByNpsn, kecamatanByCode);

  const now = new Date();
  const fetchedAtWib = wibTimestamp(now);

  const snapshot = {
    synced_at: now.toISOString(),
    synced_at_wib: fetchedAtWib,
    provinsi: PROVINSI,
    kabupaten: KABUPATEN,
    cakupan_jenjang: ['PAUD', 'SD', 'SMP'],
    filter_summary: {
      total_api_kabupaten: sekolahIkd.length,
      total_binaan_disdik: mergedSekolah.length,
      excluded_non_binaan: excludedCount,
      excluded_by_jenjang: excludedByJenjang,
      cocok_master: cocokMaster,
    },
    validation: null,
    wonogiri_ringkasan: wonogiriSummary,
    peringkat_jateng: kabJateng,
    sekolah: mergedSekolah,
  };

  snapshot.validation = validateIkdSnapshot(snapshot);

  await fs.mkdir(path.dirname(OUT_JSON_PATH), { recursive: true });
  await fs.mkdir(OUT_HISTORY_DIR, { recursive: true });

  const jsonText = JSON.stringify(snapshot, null, 2) + '\n';
  await fs.writeFile(OUT_JSON_PATH, jsonText, 'utf8');
  await fs.writeFile(OUT_CSV_PATH, toCsv(mergedSekolah), 'utf8');
  await fs.writeFile(
    path.join(OUT_HISTORY_DIR, `${fetchedAtWib.slice(0, 10)}.json`),
    jsonText,
    'utf8'
  );

  console.log('Selesai ambil data IKD (tervalidasi PAUD, SD, SMP):');
  console.log(
    `- Peringkat Jateng: ${kabJateng.length} kab/kota (Wonogiri: ${wonogiriSummary ? 'ditemukan' : 'tidak ditemukan'})`
  );
  console.log(
    `- Sekolah IKD Binaan Disdik: ${mergedSekolah.length} entri dari ${sekolahIkd.length} total API (dikeluarkan: ${excludedCount}, cocok master: ${cocokMaster})`
  );
  console.log(`- Rincian jenjang: ${JSON.stringify(snapshot.validation.by_jenjang)}`);
  console.log(`- Output JSON: ${OUT_JSON_PATH}`);
  console.log(`- Output CSV : ${OUT_CSV_PATH}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error('GAGAL SYNC IKD (snapshot lama dipertahankan):', err.message || err);
    process.exit(1);
  });
}
