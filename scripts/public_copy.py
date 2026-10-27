"""Plain Indonesian copy for the public presentation; never modifies embedded datasets."""
import re
COPY={
'Data pendidikan tidak berhenti sebagai isian aplikasi. Data dibaca untuk mengenali kebutuhan, menyusun prioritas, dan memantau layanan.':'Data sekolah membantu dinas menentukan kebutuhan guru, memperbaiki fasilitas, dan memastikan layanan bagi peserta didik.',
'Identitas, status sekolah, dan data peserta didik memengaruhi kualitas pemetaan sasaran layanan.':'Identitas dan status pendidikan siswa membantu menentukan siapa yang membutuhkan layanan.',
'Data rombongan belajar dan tenaga pendidik membantu membaca kebutuhan pelayanan pendidikan.':'Jumlah rombel dan guru menjadi bahan untuk menghitung kebutuhan tenaga pendidik.',
'Informasi kondisi ruang, fasilitas, dan sarpras menjadi masukan dalam perencanaan penanganan.':'Kondisi ruang dan fasilitas sekolah menjadi bahan penentuan prioritas perbaikan.',
'Prioritas intervensi':'Prioritas perbaikan',
'Contoh di atas menggambarkan bagaimana data digunakan sebagai masukan kebijakan; bukan berarti satu indikator DQM otomatis menentukan suatu bantuan atau keputusan.':'Data menjadi salah satu bahan pertimbangan kebijakan. Satu indikator DQM tidak otomatis menentukan bantuan untuk sekolah.',
'Hasil yang kita harapkan: setiap sekolah punya langkah perbaikan yang jelas.':'Setiap sekolah diharapkan memiliki rencana perbaikan.',
'Populasi dan waktu pengukuran keduanya berbeda.':'Jumlah sekolah yang dinilai dan tanggal datanya berbeda.',
'Rata-rata IKD sekolah pada analisis berikut merupakan hitungan deskriptif dari sekolah yang tersedia, bukan pengganti skor wilayah.':'Tabel berikut menampilkan rata-rata IKD sekolah yang datanya tersedia. Angka itu berbeda dari skor resmi wilayah.',
'Skor dan status indikator digunakan untuk memilih tindakan.':'Periksa indikator yang gagal untuk menentukan data yang perlu diperbaiki.',
'Dataset DQM':'Data DQM',
'Komponen terendah · fokus penguatan data semester berjalan':'Komponen terendah · perlu pembaruan data',
'Rata-rata sederhana sekolah per kelompok. Cakupan setiap kelompok ditampilkan agar perbandingan tetap terbaca dengan benar.':'Rata-rata dihitung dari nilai sekolah pada setiap jenjang. Jumlah sekolah yang dihitung dicantumkan dalam tabel.',
'Pemetaan memakai master sekolah; indikator masing-masing tetap diperiksa melalui Klinik NPSN.':'Jenjang mengikuti daftar referensi sekolah. Rincian setiap sekolah dapat dibuka melalui pencarian NPSN.',
'PAUD, SD, SMP dan pendidikan nonformal sesuai pemetaan jenjang. Kelompok ini terpisah dari naungan lainnya.':'Pilih PAUD, SD, SMP, atau pendidikan nonformal di bawah naungan kabupaten.',
'Nilai sama diurutkan menurut NPSN tanpa menyatakan perbedaan kualitas.':'Sekolah dengan nilai sama ditampilkan menurut urutan NPSN.',
'N = jumlah sekolah dengan nilai tersedia. Rata-rata IKD dan DQM memakai populasi masing-masing, bukan sekolah yang selalu sama. Nama kecamatan diambil dari master; data tanpa kecamatan tidak dipaksakan masuk wilayah.':'N adalah jumlah sekolah yang memiliki nilai. Sekolah yang dihitung pada IKD dan DQM dapat berbeda. Data tanpa nama kecamatan tidak masuk tabel.',
'IKD dan Hasil DQM ada pada kolom tersendiri':'Nilai IKD dan DQM ditampilkan terpisah',
'Pembacaan di Klinik NPSN':'Rincian sekolah',
'Dua status ini berbeda. Jangan langsung memperlakukan indikator yang belum dievaluasi sebagai kesalahan data.':'Status gagal berarti indikator belum memenuhi aturan. Status belum dievaluasi berarti hasil penilaiannya belum tersedia.',
'Contoh aktual pola evaluasi':'Contoh perhitungan pada data sekolah',
'Pada dataset ini, skor sesuai dengan proporsi':'Pada data ini, skor mengikuti perbandingan',
'Indikator belum dievaluasi dipisahkan dari penyebut, bukan dimasukkan sebagai gagal.':'Indikator yang belum dievaluasi tidak ikut dihitung dalam contoh ini.',
'Catatan pembacaan: rata-rata DQM adalah ringkasan skor sekolah pada saat data diambil. Kategori dan cakupan indikator dapat berbeda menurut karakteristik satuan pendidikan.':'Rata-rata dihitung dari skor sekolah pada tanggal pengambilan data. Indikator yang dinilai dapat berbeda menurut jenis sekolah.',
'Angka pembagi adalah sekolah yang sudah dievaluasi pada indikator tersebut.':'Persentase dihitung dari sekolah yang sudah dinilai pada setiap indikator.',
'Skor SD relatif tinggi, tetapi masih ada pekerjaan spesifik. Gunakan pencarian NPSN untuk menentukan tindakan tiap sekolah, bukan menerapkan satu solusi untuk semua.':'Buka rincian sekolah melalui pencarian NPSN. Tentukan perbaikan berdasarkan indikator yang gagal di sekolah tersebut.',
'Nilai ditampilkan sebagai rata-rata sederhana skor dimensi masing-masing sekolah, bukan skor dimensi agregat berbobot.':'Setiap sekolah memiliki bobot yang sama dalam perhitungan rata-rata dimensi ini.',
'Frekuensi sekolah yang tidak lolos per indikator. Satu sekolah dapat muncul pada beberapa indikator.':'Jumlah sekolah dengan status gagal pada setiap indikator. Satu sekolah dapat memiliki lebih dari satu indikator gagal.',
'Frekuensi temuan membantu menentukan materi pembinaan massal. Namun, keputusan perbaikan tetap harus berdasarkan rincian indikator sekolah masing-masing.':'Temuan yang sering muncul dapat dibahas dalam pendampingan bersama. Perbaikan tetap mengikuti masalah di setiap sekolah.',
'Perbedaan beberapa poin perlu ditafsirkan bersama jumlah dan jenis temuan.':'Periksa juga jumlah sekolah dan jenis indikator yang gagal.',
'Pada snapshot DQM sekolah, sejumlah metrik identitas peserta didik dan PTK masih ditandai belum dievaluasi. Itu berbeda dengan gagal validasi, dan tidak membuktikan data siswa sudah bersih.':'Pada data DQM ini, sejumlah indikator identitas peserta didik dan PTK belum dievaluasi. Data tersebut tetap perlu diperiksa melalui layanan terkait.',
'19 contoh metrik dievaluasi pada pola yang teramati':'Contoh: 19 indikator dievaluasi',
'14 metrik belum dievaluasi — bukan otomatis gagal':'14 indikator belum dievaluasi',
'Kesimpulan tersebut harus diuji melalui VervalPD.':'Periksa residu siswa melalui VervalPD.',
'Jumlah ini mengikuti rekap sumber dan belum dicocokkan dengan total pembanding.':'Jumlah mengikuti rekap yang tersedia; belum ada total pembanding untuk pengecekan.',
'Verifikasi sebelum intervensi':'Periksa sebelum menindaklanjuti',
'Tampilan ini hanya memuat agregat.':'Halaman ini hanya menampilkan jumlah per kelompok.',
'Kabupaten menjadi fokus pembinaan. Provinsi dan Kemenag disajikan sebagai pembanding wilayah pada halaman ini saja.':'Pembahasan utama mencakup sekolah naungan kabupaten. Tabel ini menambahkan gambaran sekolah naungan provinsi dan Kemenag.',
'Perbedaan jenis sekolah dan cakupan membatasi perbandingan langsung.':'Perhatikan perbedaan jenjang dan jumlah sekolah saat membaca tabel.',
'Pilih saluran perbaikan berdasarkan indikator dan kewenangan pengelola.':'Pilih aplikasi sesuai data yang perlu diperbaiki.',
'Pemetaan tindak lanjut berdasarkan data sekolah dan hasil klinik peserta yang benar-benar hadir, berikut indikator dan penanggung jawab tiap satuan pendidikan.':'Catat masalah setiap sekolah, indikator yang perlu diperbaiki, dan penanggung jawabnya.',
'Gunakan kartu NPSN sebagai daftar kerja sekolah, bukan sekadar papan peringkat.':'Pastikan masalah, langkah perbaikan, dan jadwal pemeriksaan ulang sudah dicatat.',
'Mari identifikasi satu masalah yang paling penting untuk diperbaiki setelah pertemuan ini.':'Pilih satu masalah data sekolah untuk dibahas bersama.',
'Perbarui snapshot IKD dari backend':'Pembaruan data IKD · pengelola',
'Masukkan URL read API publik yang telah dipasang pengelola. Snapshot offline tetap dipakai jika koneksi gagal.':'Masukkan alamat layanan pembaruan yang disiapkan pengelola. Jika koneksi gagal, data tersimpan tetap ditampilkan.',
'Mode snapshot offline · pengambilan 26 Oktober 2026':'Data tersimpan · 26 Oktober 2026',
'Jangan gunakan data sebagai pemberian label.':'Gunakan data untuk menentukan pendampingan.',
'Gunakan untuk menyusun pendampingan.':'Periksa masalah setiap sekolah sebelum mengambil tindakan.',
}
def polish(h):
 def section(m):
  text=m[0]
  for old,new in COPY.items():text=text.replace(old,new)
  if 'data-label="Capaian IKD Jawa Tengah"' in text:
   text=text.replace('<div class="badge warn">Peringkat 1 · Jawa Tengah</div>','<div class="ikd-achievement"><span aria-hidden="true">★</span> Peringkat 1 Jawa Tengah</div>')
   text=text.replace('INDEKS KUALITAS DATA · WONOGIRI','KABUPATEN WONOGIRI')
   text=text.replace('SKOR IKD RESMI','Indeks Kualitas Data')
   text=re.sub(r'<p>Skor: rekap IKD.*?</p>','<div class="ikd-data-caption">Data per 26 Oktober 2026</div>',text,flags=re.S)
   text=text.replace('↗ Sumber: dashboard IKD Dapodik','Sumber: Dapodik ↗')
   text=text.replace('Rekap IKD RESMI WILAYAH · 26 Okt 2026 · data per 26 Oktober 2026','IKD RESMI WILAYAH · 26 Oktober 2026')

  text=re.sub(r'>([^<>]+)<',lambda m:'>'+m[1].replace('snapshot','data tersimpan').replace('Snapshot','Data tersimpan').replace('sheet','rekap').replace('master referensi','daftar referensi')+'<',text)
  return text
 return re.sub(r'<section\b.*?</section>',section,h,flags=re.S)
