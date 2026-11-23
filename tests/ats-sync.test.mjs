import test from 'node:test';
import assert from 'node:assert/strict';
import { findMetric, extractDistricts, buildSnapshot } from '../scripts/sync-ats.mjs';

const districtRows = Array.from({ length: 25 }, (_, i) => {
  const code = '0312' + String(i + 1).padStart(2, '0');
  return { kode_wilayah: code, nama_wilayah: 'Kecamatan ' + (i + 1), do: 1, ltm: 2, bpb: 1, total: 4 };
});
const dashboard = { data: { total: 100, do: 25, ltm: 50, bpb: 25, tahun_ajaran: '2026/2027' } };
const districts = { data: districtRows };

test('findMetric reads nested count values', () => {
  assert.equal(findMetric(dashboard, 'total'), 100);
  assert.equal(findMetric(dashboard, 'ltm'), 50);
});

test('findMetric reads actual ATS API fields and ignores cutoff_total_ats', () => {
  const actualDashboard = {
    status_code: 200,
    data: {
      kode_wilayah: '031200',
      wilayah: 'Kab. Wonogiri',
      ats: 2643,
      cutoff_total_ats: 3512,
      cutoff_total_do: 755,
      cutoff_total_ltm: 1788,
      cutoff_total_bpb: 969,
      ats_do: 631,
      ats_ltm: 1193,
      ats_bpb: 819,
      kelompok_usia: [
        { kode: '7-12', ats_do: 47, ats_ltm: 56, ats_bpb: 330 }
      ]
    },
    meta: {
      tahun_ajaran: '2026/2027',
      tanggal_cutoff: '2026-09-30'
    }
  };

  assert.equal(findMetric(actualDashboard, 'total'), 2643);
  assert.equal(findMetric(actualDashboard, 'do'), 631);
  assert.equal(findMetric(actualDashboard, 'ltm'), 1193);
  assert.equal(findMetric(actualDashboard, 'bpb'), 819);
});

test('extractDistricts returns 25 unique Wonogiri kecamatan', () => {
  assert.equal(extractDistricts(districts).length, 25);
});

test('buildSnapshot requires category and district totals to reconcile', () => {
  const snapshot = buildSnapshot(dashboard, districts, new Date('2026-11-23T00:00:00Z'));
  assert.equal(snapshot.totals.total, 100);
  assert.equal(snapshot.validation.status, 'VALID');
  assert.equal(snapshot.kecamatan.length, 25);

  assert.throws(() => buildSnapshot({ data: { total: 99, do: 25, ltm: 50, bpb: 25 } }, districts), /tidak sama/);
  assert.throws(() => buildSnapshot(dashboard, { data: districtRows.slice(0, 24) }), /24\/25/);
  assert.throws(() => {
    const mismatchDistricts = districtRows.map((r, idx) => (idx === 0 ? { ...r, do: 2, total: 5 } : r));
    buildSnapshot(dashboard, { data: mismatchDistricts });
  }, /Validasi agregat gagal/);
});
