const test = require("node:test");
const assert = require("node:assert/strict");
const { applyDqmLiveToHtml } = require("../scripts/apply-dqm-live.cjs");

let buildTargetSchools, parseProfile;
test("load DQM collector module", async () => {
  ({ buildTargetSchools, parseProfile } = await import("../scripts/sync-dqm.mjs"));
});

test("scope hanya PAUD, SD, SMP di bawah Kemendikdasmen (termasuk master-sekolah-live.json)", () => {
  const master = { values: [
    ["judul"],
    ["KATEGORI", "BENTUK PENDIDIKAN", "JENJANG RESMI", "KODE KECAMATAN", "KECAMATAN", "NPSN", "NAMA SATUAN PENDIDIKAN", "ALAMAT", "DESA", "STATUS", "DUPLIKAT", "KEMENTERIAN PEMBINA"],
    ["PAUD", "TK", "PAUD", "x", "Wonogiri", "12345678", "TK A", "", "", "", "", "Kementerian Pendidikan Dasar dan Menengah"],
    ["DIKDAS", "SD", "DIKDAS", "x", "Wonogiri", "12345679", "SD B", "", "", "", "", "Kementerian Pendidikan Dasar dan Menengah"],
    ["DIKDAS", "SMP", "DIKDAS", "x", "Wonogiri", "12345680", "SMP C", "", "", "", "", "Kementerian Pendidikan Dasar dan Menengah"],
    ["DIKDAS", "SLB", "DIKDAS", "x", "Wonogiri", "12345681", "SLB D", "", "", "", "", "Kementerian Pendidikan Dasar dan Menengah"],
    ["PAUD", "TK", "PAUD", "x", "Wonogiri", "12345682", "TK E", "", "", "", "", "Kementerian Agama"]
  ]};
  const dqm = { values: [
    ["NPSN", "UUID", "Nama Sekolah", "Jenjang", "Kecamatan", "Skor DQM", "Kategori", "Dievaluasi", "Lolos", "Gagal", "Belum Dievaluasi", "Total Aktif"],
    ...["12345678", "12345679", "12345680", "12345681", "12345682"].map((n, i) => [n, `uuid-${i}`, `School ${i}`, "SD", "Wonogiri", "80", "Baik", "10", "8", "2", "5", "15"])
  ]};
  const masterLive = {
    schools: [
      { npsn: "69806053", nama: "KB TUNAS BAKTI", bentuk_pendidikan: "KB", kecamatan: "Wonogiri", uuid: "uuid-new-paud", kementerian_pembina: "Kementerian Pendidikan Dasar dan Menengah" },
      { npsn: "20341364", nama: "SMK TEST", bentuk_pendidikan: "SMK", kecamatan: "Wonogiri", uuid: "uuid-smk", kementerian_pembina: "Kementerian Pendidikan Dasar dan Menengah" },
      { npsn: "P2970761", nama: "PKBM TEST", bentuk_pendidikan: "PKBM", kecamatan: "Wonogiri", uuid: "uuid-pkbm", kementerian_pembina: "Kementerian Pendidikan Dasar dan Menengah" }
    ]
  };

  const rows = buildTargetSchools(master, dqm, masterLive);
  assert.deepEqual(rows.map(r => r.npsn), ["12345678", "12345679", "12345680", "69806053"]);
  assert.equal(rows[3].uuid, "uuid-new-paud");
});

test("parser membaca skor desimal titik maupun koma dan ringkasan profil DQM", () => {
  const htmlDot = `<html><body><h1>SD CONTOH</h1><p>NPSN : 12345678</p><p>Baik 94.7%</p><p>18 dari 19 metrik lolos, 13 belum dievaluasi</p></body></html>`;
  assert.deepEqual(parseProfile(htmlDot, "12345678"), {
    score: 94.7, category: "Baik", evaluated: 19, pass: 18, fail: 1, unevaluated: 13, total: 32
  });

  const htmlComma = `<html><body><h1>KB CONTOH</h1><p>NPSN : P2963835</p><p>Cukup Baik 63,2%</p><p>12 dari 19 metrik yang telah lolos, 14 metrik belum dievaluasi</p></body></html>`;
  assert.deepEqual(parseProfile(htmlComma, "P2963835"), {
    score: 63.2, category: "Cukup Baik", evaluated: 19, pass: 12, fail: 7, unevaluated: 14, total: 33
  });
});

test("parser menolak profil NPSN yang tidak cocok", () => {
  const html = `<p>NPSN : 99999999</p><p>Baik 90%</p><p>8 dari 10 metrik lolos, 3 belum dievaluasi</p>`;
  assert.throws(() => parseProfile(html, "12345678"), /tidak cocok/);
});

test("build overlay memperbarui field DQM termasuk active dan mempertahankan struktur sekolah", () => {
  const html = `<html><script id="ikd-data" type="application/json">{"schools":[{"n":"12345678","score":70,"category":"Cukup Baik","evaluated":10,"pass":7,"fail":3,"unevaluated":5,"active":15}]}</script></html>`;
  const snapshot = { schemaVersion: 1, records: [{
    npsn: "12345678", score: 94.7, category: "Baik", evaluated: 19, pass: 18, fail: 1, unevaluated: 13, total: 32
  }]};
  const result = applyDqmLiveToHtml(html, snapshot);
  const json = JSON.parse(result.html.match(/<script id="ikd-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(json.schools[0].score, 94.7);
  assert.equal(json.schools[0].category, "Baik");
  assert.equal(json.schools[0].evaluated, 19);
  assert.equal(json.schools[0].pass, 18);
  assert.equal(json.schools[0].fail, 1);
  assert.equal(json.schools[0].unevaluated, 13);
  assert.equal(json.schools[0].active, 32);
});
