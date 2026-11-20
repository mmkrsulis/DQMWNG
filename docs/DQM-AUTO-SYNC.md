# Sinkronisasi otomatis DQM Wonogiri

Patch ini menambahkan pengambilan snapshot DQM mingguan melalui GitHub Actions. Sumber yang dibaca adalah halaman profil sekolah publik pada Portal DQM Kemendikdasmen. Tidak ada login, token, scraping data pribadi PTK/peserta didik, atau pengiriman payload ke backend IKD.

## Cakupan

Target ditentukan dari `data/sources/master.json` dengan syarat:
- `KEMENTERIAN PEMBINA` = `Kementerian Pendidikan Dasar dan Menengah`
- `BENTUK PENDIDIKAN` = TK, KB, SPS, TPA, SD, atau SMP
- NPSN memiliki UUID pada `data/sources/dqm-nilai.json`

Dengan snapshot repository saat patch disusun, cakupan yang diharapkan sekitar 1.766 sekolah (PAUD 911, SD 746, SMP 109). Angka dihitung ulang dari sumber setiap workflow berjalan; tidak di-hardcode.

## Hasil

- `data/dqm-live.json`: snapshot DQM terbaru.
- `data/history/dqm/YYYY-MM-DD.json`: snapshot harian untuk histori.
- `data/sources/dqm-nilai.json` dan data IKD lama tidak diubah.
- Saat GitHub Pages build, `scripts/apply-dqm-live.cjs` menimpa field DQM pada blok `ikd-data` di salinan `dist/index.html`. File sumber `index.html` tidak diubah.
- `scripts/build.cjs` tetap menerbitkan allowlist yang sama; file sumber dan histori tidak ikut dipublikasikan.

Field yang diperbarui pada sekolah yang cocok: skor, kategori, jumlah dievaluasi, lolos, gagal, belum dievaluasi, dan total aktif (hanya field yang memang tersedia pada objek sekolah). IKD tidak disentuh.

## Jadwal dan uji manual

Jadwal: Senin pukul 02.00 WIB (`19.00 UTC` hari Minggu).

Untuk uji aman:
1. Buka GitHub → Actions → **Sync DQM Wonogiri**.
2. Klik **Run workflow**.
3. Isi `limit` = `5` dan aktifkan `dry_run`.
4. Periksa log: jumlah target, jumlah berhasil, dan contoh kegagalan.
5. Jika parser cocok, jalankan uji penuh dengan `limit` = `0`, `dry_run` tetap aktif.
6. Setelah hasil uji penuh wajar, jalankan lagi dengan `dry_run` nonaktif. Workflow akan menyimpan snapshot dan membuat commit otomatis.

Jangan jalankan dengan `limit` terbatas dan `dry_run` nonaktif; script memang menolak penyimpanan snapshot parsial.

## Pengamanan

- Maksimal 6 permintaan paralel, timeout 30 detik, retry 3 kali.
- Snapshot penuh ditolak jika keberhasilan kurang dari 90%.
- Respons yang NPSN-nya tidak cocok ditolak.
- Jika parser tidak mengenali format halaman, data lama tidak ditimpa.
- IKD, `data/monitoring.js`, sumber DQM lama, dan backend IKD tetap terpisah.
- Workflow memerlukan izin Actions untuk `contents: write` agar dapat menyimpan hasil ke repository. Ini izin `GITHUB_TOKEN` pada workflow, bukan izin konektor ChatGPT.

## Batas verifikasi patch

Parser dibuat berdasarkan struktur informasi yang tampil pada Portal DQM publik: skor/kategori, jumlah metrik lolos, dan jumlah belum dievaluasi. Patch ini belum dapat menguji seluruh 1.766 halaman dari lingkungan penyusunan. Karena itu, lakukan `limit=5` dan uji penuh `dry_run` terlebih dahulu. Jika teks ringkasan portal berubah, collector akan gagal tertutup dan tidak menyimpan snapshot yang tidak tervalidasi.
