#!/usr/bin/env node
/**
 * Public aggregate ATS sync for Kabupaten Wonogiri.
 * Reads official public aggregate APIs only; never requests child identities.
 * Fails closed: unrecognized/incomplete responses never replace the last snapshot.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const URLS = {
  dashboard: 'https://ats.data.kemendikdasmen.go.id/ats-v2/api/v1/publik/grafik?kode_wilayah=031200',
  districts: 'https://ats.data.kemendikdasmen.go.id/ats-v2/api/v1/publik/rekap-wilayah?id_level_wilayah=3&mst_kode_wilayah=031200&rinci=true'
};

const OUT = path.resolve('data/ats-live.json');
const HISTORY = path.resolve('data/history/ats');
const ARTIFACTS = path.resolve('artifacts/ats-sync');
const DISTRICT_CODE = /^0312\d{2}$/;

const ALIASES = {
  total: ['ats', 'total', 'total_ats', 'jumlah_ats', 'jml_ats', 'total_data', 'jumlah_data', 'jml_data', 'total_anak', 'jumlah_anak'],
  do: ['ats_do', 'do', 'drop_out', 'dropout', 'drop_out_ats', 'jumlah_do', 'jml_do', 'putus_sekolah'],
  ltm: ['ats_ltm', 'ltm', 'lulus_tidak_melanjutkan', 'lulus_tidak_melanjut', 'jumlah_ltm', 'jml_ltm'],
  bpb: ['ats_bpb', 'bpb', 'belum_pernah_bersekolah', 'belum_pernah_sekolah', 'jumlah_bpb', 'jml_bpb'],
  code: ['kode_wilayah', 'mst_kode_wilayah', 'kode_kecamatan', 'kode'],
  name: ['wilayah', 'nama_wilayah', 'nama_kecamatan', 'kecamatan', 'nama']
};

function normKey(value) {
  return String(value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function numeric(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const s = value.trim().replace(/\s/g, '');
  if (!s) return null;
  const cleaned = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '.');
  const n = Number(cleaned.replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function objectsDeep(value, out = [], seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return out;
  seen.add(value);
  if (!Array.isArray(value)) out.push(value);
  for (const child of Object.values(value)) objectsDeep(child, out, seen);
  return out;
}

function directMetric(obj, metric) {
  const wanted = new Set(ALIASES[metric].map(normKey));
  for (const [key, value] of Object.entries(obj ?? {})) {
    if (wanted.has(normKey(key))) {
      const n = numeric(value);
      if (n !== null) return n;
    }
  }
  const label = normKey(obj?.label ?? obj?.name ?? obj?.kategori ?? obj?.jenis ?? obj?.status);
  if (wanted.has(label)) {
    for (const key of ['value', 'jumlah', 'total', 'count', 'y', 'nilai']) {
      const n = numeric(obj?.[key]);
      if (n !== null) return n;
    }
    if (Array.isArray(obj?.data) && obj.data.length === 1) {
      const n = numeric(obj.data[0]);
      if (n !== null) return n;
    }
  }
  return null;
}

export function findMetric(payload, metric) {
  const root = payload?.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
    ? payload.data
    : null;
  if (root) {
    const topValue = directMetric(root, metric);
    if (topValue !== null) return topValue;
  }

  const all = objectsDeep(payload);
  for (const obj of all) {
    const value = directMetric(obj, metric);
    if (value !== null) return value;
  }
  for (const obj of all) {
    if (!Array.isArray(obj.labels) || !Array.isArray(obj.datasets)) continue;
    const wanted = new Set(ALIASES[metric].map(normKey));
    const index = obj.labels.findIndex(label => wanted.has(normKey(label)));
    if (index < 0) continue;
    for (const ds of obj.datasets) {
      const n = numeric(ds?.data?.[index]);
      if (n !== null) return n;
    }
  }
  return null;
}

function getField(obj, aliases) {
  const wanted = new Set(aliases.map(normKey));
  for (const [key, value] of Object.entries(obj ?? {})) {
    if (wanted.has(normKey(key))) return value;
  }
  return null;
}

export function extractDistricts(payload) {
  const rows = [];
  const used = new Set();
  const candidates = Array.isArray(payload?.data) ? payload.data : objectsDeep(payload);

  for (const obj of candidates) {
    if (!obj || typeof obj !== 'object') continue;
    const code = String(getField(obj, ALIASES.code) ?? '').trim();
    if (!DISTRICT_CODE.test(code) || used.has(code)) continue;

    const name = String(getField(obj, ALIASES.name) ?? '').trim();
    if (!name) continue;

    const doCount = directMetric(obj, 'do');
    const ltm = directMetric(obj, 'ltm');
    const bpb = directMetric(obj, 'bpb');
    let total = directMetric(obj, 'total');

    if (total === null && [doCount, ltm, bpb].every(v => v !== null)) {
      total = doCount + ltm + bpb;
    }
    if ([doCount, ltm, bpb, total].some(v => v === null)) continue;
    if (doCount + ltm + bpb !== total) {
      throw new Error(`Rekap kategori kecamatan ${name} (${code}) tidak sama dengan total: ${doCount}+${ltm}+${bpb} != ${total}`);
    }

    used.add(code);
    rows.push({ kode_kecamatan: code, kecamatan: name, total, do: doCount, ltm, bpb });
  }

  return rows.sort((a, b) => a.kode_kecamatan.localeCompare(b.kode_kecamatan));
}

function metadata(payload, names) {
  const wanted = new Set(names.map(normKey));
  for (const obj of objectsDeep(payload)) {
    for (const [key, value] of Object.entries(obj)) {
      if (wanted.has(normKey(key)) && (typeof value === 'string' || typeof value === 'number')) {
        return String(value);
      }
    }
  }
  return null;
}

function wib(date) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).format(date).replace(' ', 'T') + '+07:00';
}

async function fetchJson(url, filename) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'DQMWNG-ATS-Sync/1.0 (+https://github.com/mmkrsulis/DQMWNG)',
      'Accept': 'application/json, text/plain;q=0.9, */*;q=0.8',
      'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
      'Referer': 'https://ats.data.kemendikdasmen.go.id/dasbor/grafik-sebaran?wilayah=3312&tab=tabel'
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(45000)
  });
  const body = await response.text();
  fs.writeFileSync(path.join(ARTIFACTS, filename), body);
  if (!response.ok) throw new Error(filename + ': HTTP ' + response.status);
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(filename + ': respons bukan JSON; raw response disimpan sebagai artifact.');
  }
}

function assertCount(name, value) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error('Nilai ' + name + ' tidak valid: ' + value);
  }
}

export function buildSnapshot(dashboard, districtPayload, now = new Date()) {
  const totals = {
    total: findMetric(dashboard, 'total'),
    do: findMetric(dashboard, 'do'),
    ltm: findMetric(dashboard, 'ltm'),
    bpb: findMetric(dashboard, 'bpb')
  };

  if (totals.total === null && [totals.do, totals.ltm, totals.bpb].every(v => v !== null)) {
    totals.total = totals.do + totals.ltm + totals.bpb;
  }

  for (const [key, value] of Object.entries(totals)) {
    if (value === null) {
      throw new Error('Metrik ' + key.toUpperCase() + ' tidak ditemukan pada respons API grafik.');
    }
    assertCount(key, value);
  }

  if (totals.do + totals.ltm + totals.bpb !== totals.total) {
    throw new Error('Rekap kategori tidak sama dengan total ATS: ' + totals.do + '+' + totals.ltm + '+' + totals.bpb + ' != ' + totals.total);
  }

  const districts = extractDistricts(districtPayload);
  if (districts.length !== 25) {
    throw new Error('Ditemukan ' + districts.length + '/25 kecamatan unik. Snapshot lama dipertahankan; periksa raw artifact.');
  }

  const sums = Object.fromEntries(
    ['total', 'do', 'ltm', 'bpb'].map(k => [k, districts.reduce((n, row) => n + row[k], 0)])
  );

  for (const key of ['total', 'do', 'ltm', 'bpb']) {
    if (sums[key] !== totals[key]) {
      throw new Error('Validasi agregat gagal untuk ' + key + ': total API=' + totals[key] + ', jumlah kecamatan=' + sums[key]);
    }
  }

  return {
    meta: {
      domain: 'ats',
      schema_version: '1.0.0',
      wilayah: 'Kabupaten Wonogiri',
      kode_wilayah: '031200',
      source_dashboard: 'https://ats.data.kemendikdasmen.go.id/dasbor/grafik-sebaran?wilayah=3312&tab=tabel',
      source_api: URLS,
      fetched_at_utc: now.toISOString(),
      fetched_at_wib: wib(now),
      tahun_ajaran: metadata(dashboard, ['tahun_ajaran', 'ta', 'tahunAjaran']),
      cut_off: metadata(dashboard, ['cut_off', 'cutoff', 'tanggal_cutoff', 'tanggal_data']),
      tanggal_pemutakhiran: metadata(dashboard, ['tanggal_pemutakhiran', 'updated_at']),
      record_count_kecamatan: districts.length,
      privacy: 'Agregat wilayah saja; tidak memuat identitas anak.'
    },
    totals,
    kecamatan: districts,
    validation: {
      status: 'VALID',
      categories_sum_to_total: true,
      kecamatan_count: 25,
      district_sums_match_dashboard: true,
      district_sums: sums
    }
  };
}

async function main() {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const dashboard = await fetchJson(URLS.dashboard, 'grafik-response.json');
  const districtPayload = await fetchJson(URLS.districts, 'rekap-wilayah-response.json');
  const snapshot = buildSnapshot(dashboard, districtPayload);

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.mkdirSync(HISTORY, { recursive: true });
  const day = snapshot.meta.fetched_at_wib.slice(0, 10);
  const json = JSON.stringify(snapshot, null, 2) + '\n';
  fs.writeFileSync(OUT, json);
  fs.writeFileSync(path.join(HISTORY, day + '.json'), json);
  fs.writeFileSync(path.join(ARTIFACTS, 'validation-report.json'), JSON.stringify({
    ok: true,
    fetched_at_wib: snapshot.meta.fetched_at_wib,
    totals: snapshot.totals,
    kecamatan: snapshot.kecamatan.length,
    validation: snapshot.validation
  }, null, 2) + '\n');

  console.log('ATS sync OK: ' + snapshot.totals.total + ' ATS; DO ' + snapshot.totals.do + '; LTM ' + snapshot.totals.ltm + '; BPB ' + snapshot.totals.bpb + '; ' + snapshot.kecamatan.length + ' kecamatan.');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    fs.mkdirSync(ARTIFACTS, { recursive: true });
    fs.writeFileSync(path.join(ARTIFACTS, 'validation-report.json'), JSON.stringify({
      ok: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }, null, 2) + '\n');
    console.error('ATS SYNC FAILED: ' + (error.stack || error.message));
    process.exitCode = 1;
  });
}
