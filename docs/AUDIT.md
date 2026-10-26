# Audit 26 Oktober 2026

Baseline Git: 602f299. Repository awal hanya index.html, README satu baris dan workflow Pages. Tidak ada AGENTS.md, crawler, Apps Script, pengujian atau catatan pemateri terpisah. Implementasi HTML berisi 26 slide, CSS, 2.027 sekolah, 33 indikator, rincian dimensi dan 50 SD prioritas dalam JSON inline. Tidak memakai framework/CDN sehingga dapat dibuka offline.

Fitur ditemukan dalam kode: pencarian NPSN, rincian indikator, filter kewenangan/jenjang, tautan Dapodik, ekspor CSV prioritas, keyboard, swipe, fullscreen, header auto-hide dan reduced motion. Validasi runtime dilakukan setelah perubahan, bukan diasumsikan dari kode.

Masalah: doctype ganda; peringkat 1/35 tanpa penanda snapshot lama; residu masih 5 Oktober; pencarian nama mengikuti filter meskipun klinik menjanjikan semua sekolah; crawl ditampilkan sebagai OK alih-alih waktu; URL DQM dibentuk saat tidak tersedia; seluruh repository dipublikasikan oleh Pages; catatan pemateri yang disebut komentar tidak ada. Detail DQM inline perlu dipertahankan agar tidak kehilangan 66.891 status indikator.

Sumber dibaca melalui konektor Google Sheets. Monitoring resmi: 1.841 NPSN unik, delapan baris wilayah termasuk tujuh label periode yang terpotong. Baris Kabupaten Wonogiri lengkap memiliki nilai 85,00 / 91,37 / 86,55 / 76,57 dan waktu 26 Oktober 14:41:02 WIB, tetapi peringkat kosong. DQM: 2.027 baris; seluruh skor cocok dengan snapshot repository. Master: 2.068 NPSN unik. Residu: 333 baris, waktu 26 Oktober 09:23:22. ATS: 3.059 catatan, 25 kecamatan, status VALID_STRUKTUR; total pembanding sumber belum tersedia.

Risiko kompatibilitas: JavaScript lama memakai const global dan elemen ID tetap; revisi mempertahankan ID dan fungsi serta menambahkan modul. Rincian DQM tetap snapshot lama, tidak dianggap pembacaan ulang seluruh detail. Pembaruan IKD tidak boleh mengubah DQM. Data ATS individu tidak diambil atau disertakan. Halaman resmi Dapodik gagal diakses alat web (403); verifikasi crawler pada situs asli tetap diperlukan.
