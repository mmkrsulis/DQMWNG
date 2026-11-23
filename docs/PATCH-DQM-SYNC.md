# Patch Sinkronisasi & Build Overlay DQM Wonogiri (`DQMWNG`)

## Isi Paket Patch
- `scripts/apply-dqm-live.cjs`:
  - Memperbaiki pembaruan field `"active"` pada objek sekolah di dalam blok `<script id="ikd-data">` saat `node scripts/build.cjs` membuat `dist/index.html` (sebelumnya hanya memperbarui `"total"`, padahal skema JSON menggunakan `"active"`).
- `scripts/sync-dqm.mjs`:
  - Memperluas cakupan target dari `data/master-sekolah-live.json` selain `data/sources/master.json` + `data/sources/dqm-nilai.json`, sehingga seluruh **1.769 sekolah PAUD/SD/SMP** binaan Dinas Pendidikan Kabupaten Wonogiri yang memiliki UUID (termasuk 3 satuan PAUD baru) ikut terpantau tanpa memasukkan SMA/SMK/PKBM/SLB/SKB maupun Kemenag.
  - Menyertakan cuplikan teks diagnostik apabila format halaman profil Portal DQM gagal di-parse saat uji `--dry-run`, serta mendukung argumen `--limit=N` maupun `--limit N`.
- `tests/dqm-sync.test.cjs`: Unit test untuk cakupan target 1.769 sekolah, parser profil DQM (desimal titik & koma), dan pembaruan properti `"active"` pada build overlay.
- `docs/PATCH-DQM-SYNC.md`: Dokumentasi penerapan dan pengujian DQM.

## Cara Penerapan & Pengujian
1. Ekstrak seluruh isi file ZIP ini ke root folder proyek `D:\DEV\DQMWNG` (timpa berkas yang ada).
2. Jalankan unit test dan uji aman 5 sekolah pertama (`--dry-run`):
   ```powershell
   node --test tests/dqm-sync.test.cjs
   node scripts/sync-dqm.mjs --dry-run --limit 5
   ```
3. Jika uji 5 sekolah berhasil, jalankan penarikan penuh (1.769 sekolah), build dashboard, lalu push ke `main`:
   ```powershell
   node scripts/sync-dqm.mjs
   node scripts/build.cjs
   node --test tests/data.test.cjs
   ```
