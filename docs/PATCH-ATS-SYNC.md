# Patch Sinkronisasi ATS Wonogiri (`DQMWNG`)

## Isi Paket Patch
- `scripts/sync-ats.mjs`: Penyesuaian parser `ALIASES`, `findMetric()`, `extractDistricts()`, dan `buildSnapshot()` agar membaca struktur aktual API publik ATS Kemendikdasmen (`data.ats`, `data.ats_do`, `data.ats_ltm`, `data.ats_bpb`), mengabaikan `cutoff_total_ats`, serta mempertahankan validasi 25 kecamatan dan kecocokan agregat.
- `tests/ats-sync.test.mjs`: Unit test untuk struktur respons aktual API ATS Wonogiri.
- `index.html`: Penambahan `<script src="assets/ats-live.js"></script>` sebelum `</body>` agar dashboard membaca `data/ats-live.json`.
- `docs/PATCH-ATS-SYNC.md`: Dokumentasi teknis patch ATS.

## Cara Penerapan
1. Ekstrak seluruh isi file ZIP ini ke root folder proyek `DQMWNG` (timpa berkas yang ada).
2. Jalankan pengujian dan sinkronisasi lokal:
   ```bash
   node --test tests/ats-sync.test.mjs
   node scripts/sync-ats.mjs
   node scripts/build.cjs
   ```
