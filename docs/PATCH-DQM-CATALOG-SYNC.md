# Modul Sinkronisasi Katalog Metrik DQM

Berdasarkan hasil `report.json` dari probe katalog DQM, portal menggunakan aplikasi Angular dengan endpoint API publik:
- `https://qc.data.kemendikdasmen.go.id/portal-dqm/api/v1/metric/catalog`

## File
- `scripts/sync-dqm-catalog.mjs`: mengambil seluruh halaman katalog metrik (`page` & `limit`) dan menyimpan snapshot ke `data/dqm-catalog-live.json` serta `data/history/dqm-catalog/YYYY-MM-DD.json`.
- `.github/workflows/dqm-catalog-probe.yml` / `.github/workflows/dqm-catalog-sync.yml`: workflow GitHub Actions.
