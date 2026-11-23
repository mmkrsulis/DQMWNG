import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const BASE_URL = 'https://dapo.kemendikdasmen.go.id';
const PROVINSI = 'Prov. Jawa Tengah';
const KABUPATEN = 'Kab. Wonogiri';

const OUT_JSON_PATH = path.resolve('data/ikd-wonogiri-live.json');
const OUT_CSV_PATH = path.resolve('data/ikd-wonogiri-live.csv');

// Jika true, saat HTTP 403/429/5xx tetap memakai HAR/cache lokal tanpa throw error
const ALLOW_OFFLINE_FALLBACK = true;

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
  path.resolve('data/master-sekolah.json'),
  path.resolve('data/master-data.json'),
  path.resolve('data/master.json'),
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function extractArrayPayload(payload) {
  if (Array.isArray(payload?.schools)) return payload.schools;
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

function isBinaanDisdik(masterItem, ikdItem) {
  const kementerian = String(
    masterItem?.kementerian_pembina ??
      masterItem?.KEMENTERIAN_PEMBINA ??
      ikdItem?.kementerian_pembina ??
      ''
  ).toLowerCase();

  if (kementerian) {
    if (kementerian.includes('agama')) return false;
    if (
      kementerian.includes('dikdasmen') ||
      kementerian.includes('pendidikan') ||
      kementerian.includes('kemdikbud')
    ) {
      return true;
    }
  }

  const bentuk = String(
    masterItem?.bentuk_pendidikan ??
      masterItem?.BENTUK_PENDIDIKAN ??
      ikdItem?.jenjang ??
      ''
  )
    .trim()
    .toUpperCase();

  return [
    'PAUD',
    'TK',
    'KB',
    'SPS',
    'TPA',
    'SD',
    'SMP',
    'SMA',
    'SMK',
    'SLB',
    'PKBM',
    'SKB',
  ].includes(bentuk);
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
  for (const item of masterList) {
    const rawNpsn = item?.npsn ?? item?.NPSN;
    if (rawNpsn !== undefined && rawNpsn !== null) {
      masterByNpsn.set(String(rawNpsn).trim(), item);
    }
  }

  let cocokMaster = 0;
  let binaanDisdik = 0;

  const mergedSekolah = sekolahIkd.map((item) => {
    const npsn = String(item?.npsn ?? item?.NPSN ?? '').trim();
    const masterMatch = masterByNpsn.get(npsn) ?? null;
    const isCocok = Boolean(masterMatch);
    const isDisdik = isBinaanDisdik(masterMatch, item);

    if (isCocok) cocokMaster += 1;
    if (isDisdik) binaanDisdik += 1;

    return {
      ...item,
      cocok_master: isCocok,
      binaan_disdik: isDisdik,
      kecamatan: masterMatch?.kecamatan ?? null,
      desa_kelurahan: masterMatch?.desa_kelurahan ?? null,
      kode_kecamatan: masterMatch?.kode_kecamatan ?? null,
      kementerian_pembina: masterMatch?.kementerian_pembina ?? null,
    };
  });

  await fs.mkdir(path.dirname(OUT_JSON_PATH), { recursive: true });

  await fs.writeFile(
    OUT_JSON_PATH,
    JSON.stringify(
      {
        synced_at: new Date().toISOString(),
        provinsi: PROVINSI,
        kabupaten: KABUPATEN,
        wonogiri_ringkasan: wonogiriSummary,
        peringkat_jateng: kabJateng,
        sekolah: mergedSekolah,
      },
      null,
      2
    ),
    'utf8'
  );
  await fs.writeFile(OUT_CSV_PATH, toCsv(mergedSekolah), 'utf8');

  console.log('Selesai ambil data IKD:');
  console.log(
    `- Peringkat Jateng: ${kabJateng.length} kab/kota (Wonogiri: ${wonogiriSummary ? 'ditemukan' : 'tidak ditemukan'})`
  );
  console.log(
    `- Sekolah IKD Wonogiri: ${mergedSekolah.length} entri (cocok master JSON: ${cocokMaster}, binaan Disdik: ${binaanDisdik})`
  );
  console.log(`- Output JSON: ${OUT_JSON_PATH}`);
  console.log(`- Output CSV : ${OUT_CSV_PATH}`);
}

main().catch((err) => {
  console.error('Gagal sync IKD:', err);
  process.exit(1);
});
