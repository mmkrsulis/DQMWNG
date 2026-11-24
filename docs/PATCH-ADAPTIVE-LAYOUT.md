# Patch Adaptive Layout + Pop-Up UI Semua 40 Slide (DQMWNG)

## Cakupan Penuh 40 Slide
1. **`assets/adaptive-layout.css`** — Menyesuaikan tata letak secara otomatis di **seluruh 40 slide** pada semua ukuran & orientasi layar (HP portrait/landscape, tablet, laptop 1366x768, proyektor 4:3, hingga layar besar/4K), termasuk tinggi tabel dinamis (`100dvh`) dan kolom pertama tabel menempel (*sticky left*) di layar sempit.
2. **`assets/popup-polish.css` & `assets/popup-polish.js`** — Menerapkan efek elevasi kartu, *hover lift*, animasi masuk bertahap (*staggered pop-up*) pada seluruh `.card`, `.report-panel`, `.process-step`, `.split-card`, `.dimbox`, dan `.mini-kpi`, animasi *count-up* pada seluruh angka `.kpi` di setiap slide, menu lompat slide (klik footer atau tekan `G`), serta sorotan juara khusus di Slide 2.
3. **`scripts/apply-popup-patch.cjs` & `scripts/build.cjs`** — Menggeser Slide `Capaian IKD Jawa Tengah` ke urutan **Slide 2** dan menjaga seluruh aset otomatis terpasang saat *build* maupun *auto-sync* mingguan.

## Cara Pasang
Ekstrak isi zip ke root folder `D:\DEV\DQMWNG` (timpa file lama), lalu jalankan:

```powershell
node scripts/apply-popup-patch.cjs
node scripts/build.cjs
git add .
git commit -m "feat: adaptive layout dan pop-up UI penuh untuk semua 40 slide"
git push origin main
```
