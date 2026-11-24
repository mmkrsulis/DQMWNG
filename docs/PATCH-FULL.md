# Patch Lengkap: Adaptive Typography, Copywriting Cleanup, Slide 2 & Pop-Up UI

## Isi Paket Patch
1. **`assets/adaptive-layout.css`** — Skala huruf dasar (`html { font-size: clamp(...) }`) dan angka besar yang *fluid* di seluruh 40 slide untuk HP, tablet, laptop, proyektor 4:3, hingga TV/layar aula 4K, ditambah tinggi tabel dinamis dan kolom pertama tabel *sticky* di layar sempit.
2. **`assets/popup-polish.css` & `assets/popup-polish.js`** — Elevasi kartu, *hover lift*, animasi kartu masuk bertahap, *count-up* angka KPI di seluruh 40 slide, sorotan juara di Slide 2, serta menu lompat cepat daftar slide (klik footer atau tekan `G`).
3. **`assets/ats-live.js`** — Memformat tanggal sumber ATS ke format Bahasa Indonesia (`23 November 2026`, bukan timestamp ISO mentah) dan menyelaraskan keterangan agregat untuk peserta.
4. **`scripts/apply-popup-patch.cjs` & `scripts/build.cjs`** — Menggeser `Capaian IKD Jawa Tengah` ke Slide 2, membersihkan seluruh catatan internal/editorial pada materi peserta, dan otomatis menerapkannya setiap kali *build* maupun *auto-sync* berjalan.

## Cara Pasang
Ekstrak isi zip ini ke root folder `D:\DEV\DQMWNG` (timpa file lama), lalu jalankan:

```powershell
node scripts/apply-popup-patch.cjs
node scripts/build.cjs
git add .
git commit -m "feat: fluid typography, pembersihan copywriting peserta, slide 2, dan pop-up UI"
git push origin main
```
