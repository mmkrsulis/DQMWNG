# Kontrak data

IKD dan DQM adalah metrik terpisah. Nilai IKD resmi disalin dari sumber; tidak dihitung ulang dari dimensi atau dari skor DQM. Angka kosong menjadi null, bukan nol. Persentase boleh memakai koma desimal, tetapi nilai di luar 0–100 ditolak. Identifier selalu string: NPSN dapat berupa delapan karakter alfanumerik untuk lembaga nonformal. Master juga memuat kode perguruan tinggi enam karakter; pencarian didukung, tetapi profil Dapodik dan pencatatan NPSN delapan karakter tidak diterapkan pada kode tersebut.

`MONITOR_SNAPSHOT`: schemaVersion, retrievedAt, official, history, schools (peta identifier → IKD), master (peta identifier → profil), residu (agregat jenjang), ats (agregat kecamatan), sources, dqmDates. Dataset DQM lama tetap inline di script JSON `ikd-data`. `history` mempertahankan label sumber apa adanya; label terpotong tidak dinormalisasi secara spekulatif.

Payload write: `{schemaVersion:1, token:<lokal>, records:[...]}`. Tiap record memuat kind `school` atau `region`, name, score, complete, valid, current, sourceUrl dan crawledAt ISO-8601. Sekolah memerlukan npsn; wilayah memerlukan regionType dan parent. Maksimal 500 record per request, crawler mengirim batch 250. Payload DQM ditolak endpoint IKD ini. Identitas sekolah tidak diturunkan dari data wilayah.

Kunci sekolah = identifier; kunci wilayah = regionType|parent|name huruf kecil. Baris periode tidak diterima sebagai wilayah baru. Header tab lama harus cocok dengan 11 kolom yang sudah diperiksa; jika berubah, penulisan ditolak. Nilai nonkosong lama dipertahankan saat field baru kosong; snapshot yang lebih tua tidak menggantikan snapshot yang lebih baru. Sumber dan tanggal tetap disimpan pada kolom 9/10. Lock membatasi penulisan bersamaan, upsert membuat retry idempotent untuk nilai terakhir.

Read API hanya mengembalikan data publik; callback JSONP hanya pola `ikdRead_<angka>`. Parameter action: snapshot, school, priority. Snapshot tidak mengirim token. Aplikasi hanya memuat script dari deployment Apps Script yang dimasukkan pengelola; URL read endpoint harus dipercaya karena JSONP mengeksekusi JavaScript.

Catatan manual: attendance berisi identifier yang dikonfirmasi pengguna; followup keyed by identifier, memuat stage/date/note/help/savedAt/baseline. Tidak dikirim ke Google Sheets otomatis. Tombol simpan tidak mengubah status indikator otomatis dan tidak menyatakan perbaikan berhasil.
