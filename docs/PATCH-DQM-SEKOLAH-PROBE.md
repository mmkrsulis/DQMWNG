# Diagnostic Endpoint API Sekolah Portal DQM (`DQMWNG`)

## Latar Belakang
Halaman `https://kualitas.data.kemendikdasmen.go.id/sekolah/{uuid}` merender cangkang aplikasi Angular SPA (`Aktifkan JavaScript agar Portal DQM Pendidikan dapat berjalan optimal...`) tanpa teks skor DQM pada HTML awal. Data skor dan status metrik dimuat melalui REST API `https://qc.data.kemendikdasmen.go.id/portal-dqm/api/v1/...`.

## Cara Menjalankan
1. Jika `node scripts/sync-dqm.mjs` masih berjalan di terminal, hentikan dengan `Ctrl + C`.
2. Jalankan skrip diagnostik:
   ```powershell
   node scripts/probe-dqm-sekolah.mjs
   ```
3. Kirimkan output terminalnya agar `scripts/sync-dqm.mjs` dapat langsung dihubungkan ke endpoint JSON resmi Portal DQM.
