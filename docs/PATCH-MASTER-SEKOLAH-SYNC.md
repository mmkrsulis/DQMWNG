# Patch Konsolidasi Master Sekolah Wonogiri (`DQMWNG`)

## Isi Paket Patch
- `scripts/sync-master-sekolah.mjs`:
  - Menambahkan `parseSheetRows()` untuk membaca array 2D Google Sheets (`data/sources/master.json` dan `data/sources/dqm-nilai.json`) yang memiliki baris judul di indeks `0` dan header di indeks `1`.
  - Memperbarui `normalizeNpsn()` agar menerima NPSN 8 karakter alfanumerik (`/^[A-Z0-9]{8}$/`, termasuk awalan `P` dan `K` untuk lembaga PAUD/nonformal) dan menyaring kode perguruan tinggi 6 karakter.
  - Menggabungkan baseline `data/master-sekolah-live.json` (2.069 satpen hasil crawler) dan `data/sources/master-binaan-disdik.json` dengan `data/sources/master.json`, `data/sources/dqm-nilai.json` (`UUID` & URL DQM), `data/residu-live.json`, serta `data/dqm-live.json`.
  - Menerapkan validasi *fail-closed* (`validateMasterSnapshot()`) agar snapshot lengkap tidak tertimpa apabila jumlah satuan menyusut atau tidak valid.
- `tests/master-sekolah-sync.test.mjs`: Unit test untuk parser array 2D Google Sheets, normalisasi NPSN alfanumerik, dan validasi *fail-closed*.
- `.github/workflows/master-sekolah-sync.yml`: Menggeser jadwal cron 30 menit setelah `master-referensi-direct.yml` (`30 22 * * 0` = Senin 05:30 WIB) agar tidak terjadi tabrakan penulisan snapshot.
- `docs/PATCH-MASTER-SEKOLAH-SYNC.md`: Dokumentasi teknis patch Master Sekolah.

## Cara Penerapan
1. Ekstrak seluruh isi file ZIP ini ke root folder proyek `D:\DEV\DQMWNG` (timpa berkas yang ada).
2. Jalankan pengujian dan konsolidasi lokal:
   ```powershell
   node --test tests/master-sekolah-sync.test.mjs
   node scripts/sync-master-sekolah.mjs
   ```
