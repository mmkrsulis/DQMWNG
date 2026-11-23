import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isBinaanDisdik,
  filterBinaanDisdik,
  validateIkdSnapshot,
} from '../scripts/sync-ikd-wonogiri.mjs';

test('isBinaanDisdik only allows PAUD, SD, SMP under Kemendikdasmen', () => {
  const kemendikdasmen = 'Kementerian Pendidikan Dasar dan Menengah';
  assert.equal(isBinaanDisdik({ kementerian_pembina: kemendikdasmen }, { jenjang: 'PAUD' }), true);
  assert.equal(isBinaanDisdik({ kementerian_pembina: kemendikdasmen, bentuk_pendidikan: 'TK' }, { jenjang: 'PAUD' }), true);
  assert.equal(isBinaanDisdik({ kementerian_pembina: kemendikdasmen }, { jenjang: 'SD' }), true);
  assert.equal(isBinaanDisdik({ kementerian_pembina: kemendikdasmen }, { jenjang: 'SMP' }), true);

  // Exclude SMA, SMK, PKBM, SLB, SKB, and Kemenag
  for (const excluded of ['SMA', 'SMK', 'PKBM', 'SLB', 'SKB', 'MI', 'MTs', 'MA']) {
    assert.equal(
      isBinaanDisdik({ kementerian_pembina: kemendikdasmen }, { jenjang: excluded }),
      false,
      `Expected ${excluded} to be excluded`
    );
  }
  assert.equal(
    isBinaanDisdik({ kementerian_pembina: 'Kementerian Agama' }, { jenjang: 'SD' }),
    false
  );
});

test('filterBinaanDisdik excludes non-binaan schools and resolves kecamatan from kode_kecamatan', () => {
  const raw = [
    { npsn: '20311252', nama: 'SDN 5 Kepuhsari', jenjang: 'SD', kelengkapan: 88, validitas: 89, mutakhir: 83, total: 87 },
    { npsn: '69805688', nama: 'PAUD Permata Bangsa', jenjang: 'PAUD', kelengkapan: 93, validitas: 77, mutakhir: 86, total: 85 },
    { npsn: '20311090', nama: 'SMPN 4 Purwantoro', jenjang: 'SMP', kelengkapan: 92, validitas: 92, mutakhir: 91, total: 92 },
    { npsn: '20341364', nama: 'SMK Karya Media', jenjang: 'SMK', kelengkapan: 91, validitas: 72, mutakhir: 93, total: 84 },
    { npsn: '20311313', nama: 'SMAS Pancasila 1', jenjang: 'SMA', kelengkapan: 85, validitas: 79, mutakhir: 85, total: 83 },
    { npsn: 'P2970761', nama: 'PKBM Maarif', jenjang: 'PKBM', kelengkapan: 81, validitas: 83, mutakhir: 87, total: 83 },
    { npsn: '72192375', nama: 'SLB Dharma Bhakti', jenjang: 'SLB', kelengkapan: 84, validitas: 90, mutakhir: 98, total: 91 },
    { npsn: 'P9959913', nama: 'SKB Wonogiri', jenjang: 'SKB', kelengkapan: 89, validitas: 77, mutakhir: 86, total: 83 },
  ];

  const masterByNpsn = new Map([
    ['69805688', { npsn: '69805688', bentuk_pendidikan: 'KB', kode_kecamatan: '031215', kecamatan: null, kementerian_pembina: 'Kementerian Pendidikan Dasar dan Menengah' }],
  ]);
  const kecamatanByCode = new Map([['031215', 'Ngadirojo']]);

  const result = filterBinaanDisdik(raw, masterByNpsn, kecamatanByCode);
  assert.equal(result.sekolah.length, 3);
  assert.equal(result.excludedCount, 5);
  assert.deepEqual(result.excludedByJenjang, { SMK: 1, SMA: 1, PKBM: 1, SLB: 1, SKB: 1 });
  assert.equal(result.sekolah[1].kecamatan, 'Ngadirojo');
});

test('validateIkdSnapshot fails closed if excluded jenjang or invalid count is present', () => {
  const validSchools = Array.from({ length: 1500 }, (_, i) => ({
    npsn: String(20300000 + i),
    nama: `SD ${i}`,
    jenjang: 'SD',
    kelengkapan: 90,
    validitas: 90,
    mutakhir: 90,
    total: 90,
  }));

  const validSnapshot = {
    wonogiri_ringkasan: { kabupaten: 'Kab. Wonogiri', total: 85.1 },
    peringkat_jateng: Array.from({ length: 35 }, (_, i) => ({ kabupaten: `Kab ${i}`, total: 85 })),
    sekolah: validSchools,
  };

  const summary = validateIkdSnapshot(validSnapshot);
  assert.equal(summary.status, 'VALID');
  assert.equal(summary.total_sekolah_binaan, 1500);

  const invalidJenjangSnapshot = {
    ...validSnapshot,
    sekolah: [...validSchools, { npsn: '20341364', nama: 'SMK Test', jenjang: 'SMK', kelengkapan: 90, validitas: 90, mutakhir: 90, total: 90 }],
  };
  assert.throws(() => validateIkdSnapshot(invalidJenjangSnapshot), /di luar binaan/);
});
