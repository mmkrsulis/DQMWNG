import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeNpsn,
  parseSheetRows,
  consolidateMasterSekolah,
  validateMasterSnapshot,
} from "../scripts/sync-master-sekolah.mjs";

test("normalizeNpsn preserves 8-character alphanumeric IDs and rejects 6-digit higher-ed codes", () => {
  assert.equal(normalizeNpsn("20310762"), "20310762");
  assert.equal(normalizeNpsn("01234567"), "01234567");
  assert.equal(normalizeNpsn("k5660824"), "K5660824");
  assert.equal(normalizeNpsn("P2963835"), "P2963835");
  assert.equal(normalizeNpsn("064075"), null);
  assert.equal(normalizeNpsn(""), null);
});

test("parseSheetRows parses Google Sheets 2D values with title row at index 0", () => {
  const sheetPayload = {
    values: [
      ["MASTER DATA SATUAN PENDIDIKAN KABUPATEN WONOGIRI"],
      ["KATEGORI", "BENTUK PENDIDIKAN", "KODE KECAMATAN", "KECAMATAN", "NPSN", "NAMA SATUAN PENDIDIKAN", "KEMENTERIAN PEMBINA"],
      ["DIKDAS", "SD", "031215", "Ngadirojo", "20310762", "SD Negeri 3 Ngadirojo", "Kementerian Pendidikan Dasar dan Menengah"],
      ["PAUD", "KB", "031215", "Ngadirojo", "K5660824", "KB Melati", "Kementerian Pendidikan Dasar dan Menengah"],
    ],
  };

  const parsed = parseSheetRows(sheetPayload, ["NPSN", "BENTUK PENDIDIKAN"]);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].NPSN, "20310762");
  assert.equal(parsed[1].NPSN, "K5660824");
});

test("consolidateMasterSekolah merges 2D sheets, enriches UUIDs, and fails closed if count shrinks", () => {
  const sheetRows = [
    ["MASTER DATA SATUAN PENDIDIKAN KABUPATEN WONOGIRI"],
    ["KATEGORI", "BENTUK PENDIDIKAN", "KODE KECAMATAN", "KECAMATAN", "NPSN", "NAMA SATUAN PENDIDIKAN", "STATUS", "KEMENTERIAN PEMBINA"],
    ...Array.from({ length: 1750 }, (_, i) => [
      "DIKDAS",
      "SD",
      "031215",
      "Ngadirojo",
      String(20300000 + i),
      `SD Negeri ${i}`,
      "NEGERI",
      "Kementerian Pendidikan Dasar dan Menengah",
    ]),
    ...Array.from({ length: 60 }, (_, i) => [
      "DIKMEN",
      "SMA",
      "031214",
      "Wonogiri",
      String(20400000 + i),
      `SMA Negeri ${i}`,
      "NEGERI",
      "Kementerian Pendidikan Dasar dan Menengah",
    ]),
    // Kode perguruan tinggi 6 karakter harus diabaikan dari daftar NPSN sekolah
    ["DIKTI", "Akademik", "031214", "Wonogiri", "064075", "Akademi Kebidanan", "SWASTA", "Kementerian Pendidikan Tinggi Sains dan Teknologi"],
  ];

  const dqmSheet = {
    values: [
      ["NPSN", "UUID", "Nama Sekolah", "Jenjang", "Kecamatan"],
      ["20300000", "E06ABF56-2DF5-E011-8BB3-83DE7388925F", "SD Negeri 0", "SD", "Ngadirojo"],
    ],
  };

  const { output, binaanOutput } = consolidateMasterSekolah({
    masterSheet: { values: sheetRows },
    dqmSheet,
    now: new Date("2026-11-23T09:30:00Z"),
  });

  assert.equal(output.summary.total_semua_satpen, 1810);
  assert.equal(output.summary.total_binaan_disdik, 1750);
  assert.equal(output.summary.total_binaan_paud_sd_smp, 1750);
  assert.equal(binaanOutput.schools.length, 1750);

  const first = output.schools.find((s) => s.npsn === "20300000");
  assert.equal(first.uuid, "E06ABF56-2DF5-E011-8BB3-83DE7388925F");
  assert.ok(first.urls.dqm.includes("E06ABF56-2DF5-E011-8BB3-83DE7388925F"));

  // Fail-closed: bila previousLive punya 2069 sekolah, hasil 1810 harus ditolak agar tidak menimpa snapshot lengkap
  const fakePrev = { schools: Array.from({ length: 2069 }, (_, i) => ({ npsn: String(20500000 + i) })) };
  assert.throws(() => validateMasterSnapshot(output, fakePrev), /menyusut drastis/);
});
