# Patch IKD Wonogiri (`DQMWNG`)

## Isi Paket Patch
- `scripts/sync-ikd-wonogiri.mjs`: Skrip sinkronisasi IKD Kab. Wonogiri dengan endpoint resmi `/api/ikdByKabupaten` dan `/api/ikdByKabupatenDetail`, fallback otomatis ke `.har` / cache lokal saat `HTTP 403`, serta pencocokan dengan `data/master-sekolah-live.json` (`schools`).
- `data/dapo.kemendikdasmen.go.id.har`: File capture HAR terbaru (35 kab/kota Jateng & 1.857 sekolah Kab. Wonogiri) sebagai sumber fallback offline.

## Cara Penerapan
1. Ekstrak seluruh isi file ZIP ini ke root folder proyek `D:\DEV\DQMWNG\` (timpa `scripts\sync-ikd-wonogiri.mjs`).
2. Jalankan perintah berikut di terminal:
   ```powershell
   node .\scripts\sync-ikd-wonogiri.mjs
   ```
