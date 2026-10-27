# Hasil pengujian revisi 26 Oktober 2026

## Lulus

- Delapan pengujian Node: parsing koma, nol/kosong/invalid; identifier teks; URL DQM; cakupan lima sumber; parser crawler dengan urutan header berubah/duplikasi/halaman kosong; validasi dan upsert backend; kecocokan seluruh 2.027 skor DQM dengan Sheets; dan pemisahan peringkat IKD menurut naungan.
- Edge headless: 30 slide pada 1366×768 dan 1920×1080; pemeriksaan horizontal overflow tambahan pada 390×844. Tidak ada pageerror atau overflow horizontal. Snapshot PNG setiap slide disimpan lokal di test-results, contact sheet ditinjau; koreksi tema navy, kontras kartu dan overlap kartu IKD diterapkan.
- Keyboard, swipe event, fullscreen melalui klik, auto-hide header, reduced motion, pencarian nama melewati filter dashboard, tautan NPSN tepat, sekolah tanpa DQM, catatan manual dan persistensi kehadiran setelah reload.
- Read API melalui fixture script JSONP lintas-origin: sukses memperbarui IKD wilayah; kegagalan koneksi menampilkan status dan mempertahankan snapshot.
- Crawler browser fixture: Next AJAX pada URL tetap, nomor halaman, retry saat kegagalan pertama, halaman kosong, stop/resume, reload/resume, perpindahan URL dengan pending state persisten, deteksi loop, timeout pagination yang tidak mengubah tabel. Duplikasi dan perubahan header diuji pada parser Node.
- Build menggunakan allowlist dan tidak menyertakan presenter/, backend/, data/sources/, tests/ atau konfigurasi token.

## Batas yang belum diverifikasi di produksi

- Dashboard asli Dapodik mengembalikan kegagalan/403 pada alat web. Struktur dan pagination situs asli, navigasi bertingkat sebenarnya, CAPTCHA dan cakupan seluruh sekolah belum diuji. Fixture tidak menyamakan implementasi dengan jaminan stabilitas produksi.
- Apps Script belum dipasang: izin spreadsheet, LockService nyata, quota, eksekusi bersamaan, POST Tampermonkey melewati redirect Google, serta JSONP dari GitHub Pages belum diuji terhadap deployment sungguhan. Fungsi normalisasi/upsert diuji terisolasi; pengguna perlu memeriksa hasil satu halaman sebelum crawl otomatis.
- Tujuh label histori sumber terpotong. Grafik perubahan sengaja tidak dibuat. Endpoint saat ini menyimpan nilai terakhir; histori longitudinal lengkap belum dibangun.
- Sinkronisasi UI memperbarui IKD wilayah saja. Bundel sekolah/DQM/residu/ATS harus dibangun ulang dari sumber terbaru; tidak ada klaim real-time seluruh sumber.
- Kehadiran dan tindak lanjut disimpan lokal, belum sinkron antarpengguna. Ekspor JSON tersedia; tidak ada rekonsiliasi hasil pengukuran otomatis untuk menyatakan tindak lanjut berhasil.
- Detail DQM 66.891 status dipertahankan dari repository. Verifikasi online pada revisi ini mencakup ringkasan skor dan master, bukan pembacaan ulang seluruh detail indikator.
- Konten panjang/tabel dapat digulir, terutama pada ponsel. Desktop telah diperiksa visual; perangkat sentuh fisik dan proyektor belum digunakan.

Tidak ada push GitHub, deployment, atau penulisan ke spreadsheet pengguna selama pengerjaan ini.

## Tambahan sesuai permintaan peringkat

Tiga slide peringkat baru membawa total menjadi 33 slide. Uji khusus tiga naungan pada 1366×768, 1920×1080, dan 390×844 lulus: top 3/bottom 10 kabupaten dan provinsi tepat, Kemenag kosong tanpa substitusi DQM, tidak ada pageerror/overflow horizontal, dan klik peringkat membuka sekolah yang benar. Pada kedua ukuran desktop seluruh 10 baris terlihat tanpa scroll tabel; pada ponsel tabel dan slide dapat digulir.

## Revisi fokus kabupaten · 27 Oktober 2026

- Sembilan unit test lulus, termasuk cakupan kabupaten, pengelompokan PAUD/SD/SMP/nonformal, mean yang mengecualikan null, 1.766 sekolah DQM kabupaten, 1.303 sekolah dengan indikator gagal, dan rerata DQM 93,24.
- Suite county-ui memeriksa 32 slide: default terang, tombol tema, persistensi gelap setelah reload, tidak ada kontrol kehadiran atau slide khusus peringkat provinsi/Kemenag, filter jenjang kabupaten, filter top 3/10 SD, filter masalah DQM SMP, tautan Dapodik/DQM tepat pada hasil pencarian, serta klik ke Klinik NPSN.
- Tidak ada pageerror atau overflow horizontal pada 1366×768, 1920×1080, dan 390×844. Pemeriksaan vertikal pada desktop 1366×768 tidak menemukan slide yang meluap setelah perbaikan kepadatan konten. Tabel panjang dan ponsel tetap dapat digulir.
- Screenshot seluruh slide terang ditinjau sebagai contact sheet; kedua tema diperiksa pada halaman analisis utama dan modal sekolah.
- Sheet IKD RESMI WILAYAH dibaca ulang pada revisi ini. Kolom peringkat tetap kosong. Peringkat 1 Jawa Tengah ditampilkan sebagai konfirmasi pengelola dari pesan pengguna 27 Oktober, terpisah dari angka komponen yang bersumber dari sheet.
- Branch origin/update-monitoring diperiksa: index.html dan modul presentasinya sama dengan baseline lokal sebelumnya. Git perangkat belum memiliki akun terautentikasi, sedangkan konektor menolak penulisan 403 pada percobaan sebelumnya; perubahan baru belum dipush.
