# Patch Slide 2 & Pop-Up UI (DQMWNG)

## Isi Patch
1. `assets/popup-polish.css` — Efek elevasi bayangan kartu, *hover lift*, animasi *staggered pop-up*, sorotan gradien + piala melayang + titik indikator *Live Sync* pada Slide 2 (`Capaian IKD Jawa Tengah`), serta gaya menu lompat slide.
2. `assets/popup-polish.js` — Animasi angka *count-up* saat slide dibuka dan menu lompat cepat daftar slide (klik label nomor slide di footer atau tekan tombol `G`).
3. `scripts/apply-popup-patch.cjs` — Menggeser Slide 14 (`Capaian IKD Jawa Tengah`) ke urutan Slide 2 tepat setelah cover (`Pembuka`) dan merapikan seluruh nomor urut `02 / 40` s.d. `39 / 40`.
4. `scripts/build.cjs` — Memastikan urutan Slide 2 dan efek pop-up otomatis ikut terpasang pada setiap proses *build* maupun *auto-sync* mingguan.

## Cara Pasang
Ekstrak isi zip ini ke root folder `D:\DEV\DQMWNG` (timpa `scripts/build.cjs`), lalu jalankan:

```powershell
node scripts/apply-popup-patch.cjs
node scripts/build.cjs
git add .
git commit -m "feat: geser capaian IKD Jateng ke slide 2 dan aktifkan UI pop-up"
git push origin main
```
