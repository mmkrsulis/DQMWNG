# Patch Filter & Validasi IKD Wonogiri (`DQMWNG`)

## Isi Paket Patch
- `scripts/sync-ikd-wonogiri.mjs`:
  - Menyaring daftar sekolah IKD agar hanya mencakup jenjang binaan Dinas Pendidikan Kabupaten (`PAUD`, `TK`, `KB`, `SPS`, `TPA`, `SD`, `SMP`) dan menolak `SMA`, `SMK`, `PKBM`, `SLB`, `SKB`, serta satuan di luar Kemendikdasmen.
  - Melengkapi nama kecamatan berdasarkan `kode_kecamatan` bila entri master memiliki `kecamatan: null`.
  - Menambahkan `validateIkdSnapshot()` (*fail-closed*) sebelum menimpa `data/ikd-wonogiri-live.json`, `data/ikd-wonogiri-live.csv`, dan arsip harian `data/history/ikd/YYYY-MM-DD.json`.
- `tests/ikd-sync.test.mjs`: Unit test untuk penyaringan jenjang binaan dan validasi snapshot IKD.
- `docs/PATCH-IKD-SYNC.md`: Dokumentasi penerapan patch IKD.

## Cara Penerapan
1. Ekstrak seluruh isi file ZIP ini ke root folder proyek `DQMWNG` (timpa berkas yang ada).
2. Jalankan pengujian dan sinkronisasi lokal:
   ```powershell
   node --test tests/ikd-sync.test.mjs
   node scripts/sync-ikd-wonogiri.mjs
   ```
