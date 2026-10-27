# Monitoring IKD & DQM Kabupaten Wonogiri

Presentasi HTML interaktif, 32 slide, direvisi dari `602f299` tanpa menghapus dataset DQM lama. Buka **index.html** untuk presentasi; tidak perlu instalasi atau internet untuk snapshot. Salin seluruh folder, bukan hanya index.html, karena revisi menggunakan modul lokal `assets/` dan `data/monitoring.js`.

## Penggunaan

1. Buka `index.html` di Edge/Chrome. Gunakan panah kiri/kanan, PageUp/PageDown, atau swipe horizontal. Ikon pojok atas memunculkan menu; ikon fullscreen atau tombol F membuka layar penuh.
2. Filter jenjang berada pada panel ikon filter. Ringkasan hanya menghitung naungan kabupaten; grafik khusus SD tetap memakai 746 SD DQM.
3. Cari NPSN/nama di Klinik NPSN. Pencarian mencakup seluruh master dan DQM, terlepas dari filter dashboard. IKD sekolah, DQM dan waktu masing-masing ditampilkan terpisah. Data tidak tersedia tidak diperlakukan sebagai nol.
4. Buka rincian indikator gagal dan tautan sumber. Catat tahap Identifikasi → Perbaikan → Verifikasi → Sinkronisasi → Evaluasi melalui panel tindak lanjut di kartu sekolah.
5. Gunakan filter PAUD/SD/SMP/nonformal pada analisis kabupaten dan top 3/10 terendah. Rekap kehadiran tidak lagi ditampilkan. Catatan tindak lanjut sekolah tetap tersimpan lokal; menghapus data browser dapat menghapus catatan.
6. File **presenter/notes.html** berisi catatan pemateri dan tautan langsung per slide. File ini tidak ikut build publik. Jika repository sendiri publik, jangan menaruh informasi rahasia di dalamnya.

## Revisi fokus kabupaten · 27 Oktober 2026

Tema terang berwarna menjadi default; tombol Tema gelap/Tema terang pada menu menyimpan preferensi di perangkat. Desain memakai bidang warna datar dan tipografi laporan, tanpa dekorasi orbital atau gradient berulang. Slide pembuka menonjolkan IKD resmi 85,00% dan rata-rata DQM sekolah kabupaten 93,24.

Peringkat 1 Jawa Tengah ditampilkan berdasarkan konfirmasi pengelola 27 Oktober 2026. Komponen IKD bersumber dari sheet 26 Oktober; kolom peringkat yang dibaca ulang masih kosong sehingga atribusi konfirmasi pengelola tetap terlihat. Tidak mengubah nilai rank mentah menjadi klaim verifikasi otomatis.

Kabupaten dibahas melalui cakupan 1.765 IKD / 1.766 DQM, rata-rata dimensi per jenjang, prioritas kecamatan, frekuensi indikator gagal beserta penyebut sekolah yang dievaluasi, serta top 3 dan 10 terendah dengan filter kelompok. Provinsi dan Kemenag hanya muncul pada satu tabel pembanding; halaman peringkat tersendiri keduanya dihapus. Rerata sekolah bukan skor IKD resmi wilayah.

Pencarian menampilkan nama dan NPSN dengan tiga tombol berbeda: Lihat IKD & DQM, Profil Dapodik, Profil DQM. Profil DQM memakai URL yang benar-benar ada pada data. Tidak mengarahkan pencarian nama ambigu ke sekolah pertama tanpa pilihan pengguna.

## Data dan keterbatasan

| Sumber | Cakupan | Waktu sumber |
|---|---:|---|
| IKD resmi sekolah | 1.841 identifier unik | 26 Oktober 2026 |
| IKD Kabupaten Wonogiri | 85,00%; kelengkapan 91,37%; validitas 86,55%; kemutakhiran 76,57% | 26 Oktober 2026 14:41:02 WIB |
| DQM | 2.027 sekolah; 33 indikator | 22–23 Oktober 2026 |
| Master referensi | 2.068 identifier unik, termasuk kode lembaga nonformal dan perguruan tinggi | 15 Oktober 2026 |
| Residu PD | 333 baris sekolah | 26 Oktober 2026 09:23:22 |
| ATS | 3.059 catatan; 25 kecamatan | 16 Oktober 2026 |

Sumber lengkap dan tanggal akses disimpan di `data/sources/` dan ditautkan pada slide Cakupan lima sumber. Seluruh skor ringkasan DQM dibandingkan dengan sheet terbaru dan cocok; rincian 66.891 status indikator tetap berasal dari snapshot repository, tidak diklaim dibaca ulang saat revisi. Tujuh baris sejarah IKD memiliki label periode terpotong dan disimpan sebagai bukti, tetapi tidak diplot sebagai tren tervalidasi. Peringkat terbaru kosong; 1/35 hanya baseline pengguna sebelumnya. Master memuat enam kode perguruan tinggi enam karakter, sehingga tautan profil Dapodik tidak ditampilkan untuk kode tersebut. Identitas individual anak ATS tidak diambil.

## Instalasi backend Google Apps Script

1. Buka spreadsheet monitoring pertama → Extensions → Apps Script. Salin `backend/Code.gs`. ID spreadsheet sudah menunjuk sumber pengguna yang ada.
2. Pada Project Settings → Script Properties, buat `WRITE_TOKEN` berupa string acak panjang. Simpan nilainya hanya di properti server dan konfigurasi lokal Tampermonkey. Jangan menaruhnya di HTML atau Git.
3. Pasang sebagai Web App, berjalan sebagai pemilik spreadsheet. Akses baca publik hanya untuk nilai agregat IKD dan data sekolah publik. Endpoint tulis tetap menolak payload tanpa token. Lakukan deployment ini oleh pengelola sesuai kebijakan akun; revisi ini tidak memasang atau mengubah deployment produksi.
4. Salin URL `/exec`. Jalur `?action=snapshot` mengembalikan IKD wilayah; `?action=school&npsn=20311621` memberikan IKD sekolah; `?action=priority` memberikan 50 SD berdasarkan IKD yang tersedia.
5. Pada slide Cakupan lima sumber, buka panel pembaruan dan masukkan URL. Tombol sinkronisasi membaca **IKD wilayah saja** menggunakan JSONP yang dibatasi ke URL Apps Script. DQM, IKD sekolah dan residu tetap snapshot bundel. Tidak ada fetch lintas-origin yang mengandalkan header CORS Google yang tidak dapat dikendalikan.
6. Uji pengiriman satu halaman dari crawler, periksa sheet dan baca kembali sebelum memulai otomatis. Semua perubahan server memakai lock, validasi dan batch upsert; kegagalan/retry tidak menimpa nilai nonkosong dengan kosong. Log pengiriman berada di tab baru yang relevan `LOG IKD API`; kesalahan juga masuk execution log Apps Script tanpa payload/token.

Kuota, izin akun, redirect Google dan JSONP dari hosting nyata harus diuji setelah pemasangan. Fixture lokal tidak membuktikan koneksi produksi. Backend tidak memasukkan riwayat buatan; upsert menyimpan nilai terakhir dan tidak menyediakan histori perubahan lengkap.

## Instalasi crawler

1. Pasang Tampermonkey dan buat userscript dari `crawler/ikd.user.js`.
2. Buka dashboard IKD publik Dapodik yang relevan. Klik Konfigurasi; masukkan URL `/exec` dan token lokal.
3. Klik Diagnostik dan Kirim Halaman Ini. Periksa URL, header, baris valid, status HTTP dan hasil pada Sheets.
4. Klik Mulai Otomatis. Crawler mencari Next/nomor halaman, menunggu perubahan fingerprint isi tabel yang stabil, menyimpan antrean tautan IKD pada host sama, serta melakukan retry terbatas dengan backoff.
5. Pause/Resume/Stop mempertahankan posisi. Reset menghapus antrean dan hasil lokal setelah konfirmasi. JSON/CSV dan diagnostik dapat diekspor tanpa token/cookie.

Jika header tidak dikenali, halaman kosong, pagination macet atau terjadi loop, proses berhenti dengan status paused dan pesan diagnostik. Hasil lama dipertahankan. Jika CAPTCHA/login/pembatasan akses muncul, proses tidak mencoba melewatinya. Tabel wilayah tidak dikonversi secara spekulatif menjadi sekolah. Crawler belum diverifikasi pada situs asli karena dashboard menolak akses alat web saat revisi. Sebutan versi 1.0 menunjukkan versi implementasi, bukan sertifikasi stabilitas produksi.

## Struktur

```text
index.html                 Entrypoint; 32 slide: fokus kabupaten, materi operator, perbandingan singkat
assets/normalization.js     Validasi skor, identifier, URL sumber
assets/revision.js          Klinik, IKD, kehadiran, tindak lanjut, read API
assets/revision.css         Tema navy dan perbaikan layout
assets/additional-slides.html Template empat slide; tiga peringkat dibangun oleh revise.py
data/monitoring.js          Snapshot tambahan yang bisa dibuka offline
data/sources/*.json         Hasil baca sumber untuk audit (tidak di-publish)
crawler/ikd.user.js         Tampermonkey mandiri
backend/Code.gs             Endpoint Apps Script
presenter/notes.html        Halaman khusus pemateri
tests/                     Pengujian data, UI dan crawler
scripts/revise.py           Migrasi awal dari commit baseline
scripts/refine-county.py    Revisi tema dan fokus kabupaten dari commit 23a2919
assets/county.js            Analisis kabupaten dan pencarian dua profil
assets/county.css           Token tema terang/gelap dan tampilan laporan
scripts/build.cjs           Build dengan allowlist publik
scripts/update-notes.py     Menyesuaikan urutan catatan pemateri
docs/                      Audit, kontrak data dan hasil pengujian
```

`scripts/revise.py` adalah migrasi awal. Untuk versi kabupaten, jalankan `python scripts/refine-county.py` lalu `python scripts/update-notes.py`; keduanya memerlukan histori commit lokal. Jangan menjalankan migrasi awal untuk mengganti versi kabupaten. Tidak mengunduh ulang Sheets. Mengubah sumber saja tidak otomatis memperbarui seluruh materi; beberapa teks agregat memerlukan revisi dan verifikasi ulang.

## Pengujian dan deployment

Node 24 dan Microsoft Edge diperlukan untuk pengujian browser. Jalankan `npm install`, `npm test`, `npm run test:ui`, `npm run test:crawler`, `node tests/ranking-ui.cjs`, lalu `npm run build`. Browser test memakai fixture; tidak menulis ke Sheets asli. Hasil gambar dan JSON berada di test-results, diabaikan Git.

GitHub Actions yang ada kini membangun dan mengunggah **dist/** saja, bukan seluruh repository. Workflow akan menerbitkan saat perubahan masuk main; jangan merge/push ke main sebelum persetujuan deployment. Belum ada push atau deployment yang dilakukan dalam revisi ini. Untuk pratinjau lokal, buka index.html atau jalankan `python -m http.server 8080` dari folder repository lalu buka localhost:8080.

Lihat `docs/AUDIT.md`, `docs/DATA.md`, dan `docs/QA.md` untuk batas validasi.
