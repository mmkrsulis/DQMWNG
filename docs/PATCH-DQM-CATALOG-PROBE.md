# Patch DQMWNG — Diagnostic Katalog Metrik DQM (v2)

Patch ini menambahkan workflow GitHub Actions **manual** untuk memeriksa struktur halaman katalog metrik DQM Kabupaten Wonogiri:

`https://kualitas.data.kemendikdasmen.go.id/katalog?sort=judul&kode_provinsi=030000&kode_kabupaten=031200&view=list`

## Isi patch
- `scripts/probe-dqm-catalog.mjs`: skrip diagnostik Node.js (zero-dependency) untuk mengunduh HTML, mengecek struktur DOM/SPA, mengekstrak kandidat endpoint, dan menyusun `report.json`.
- `.github/workflows/dqm-catalog-probe.yml`: workflow `workflow_dispatch` (Node.js 22 LTS) yang mengunggah hasil pemeriksaan sebagai artifact selama 14 hari.
- `docs/PATCH-DQM-CATALOG-PROBE.md`: dokumentasi teknis patch ini.
