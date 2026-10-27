"""Public-facing editorial pass; called by refine-county.py after data assembly."""
import re

def edit(h):
 replacements={
 'DQM ditampilkan terpisah sebagai konteks tindak lanjut.':'Kolom DQM menunjukkan hasil evaluasi sekolah di kecamatan yang sama.',
 ' · Navigasi dengan tombol panah':'',
 'DQM ditampilkan terpisah':'Hasil DQM ada pada kolom tersendiri',
 'Jenjang mana yang perlu didampingi?':'Hasil IKD menurut jenjang',
 'Dua profil, dua kebutuhan':'Profil sekolah dan hasil evaluasi',
 'Tiga naungan, cakupan yang berbeda':'Perbandingan data menurut naungan',
 'Lima sumber, cakupan berbeda':'Sumber dan tanggal data',

 'Arah peningkatan mutu data. Digunakan dalam konteks pembinaan kualitas data. Angka pada paparan ini berasal dari skor DQM dan tidak otomatis identik dengan indeks pada sistem lain.':'Indeks resmi dari dashboard IKD Dapodik, dengan komponen kelengkapan, validitas, dan kemutakhiran. Skor IKD wilayah dan sekolah disajikan dari sumber IKD; tidak dihitung dari skor DQM.',
 'Sekolah terpetakan':'Sekolah DQM kabupaten',
 'Indikator terpantau':'Indikator DQM',
 '33 indikator terpantau':'33 indikator DQM',
 'Rata-rata skor SD menurut kecamatan':'Rata-rata DQM SD menurut kecamatan',
 'Delapan kecamatan dengan rata-rata skor SD terendah pada snapshot ini; digunakan untuk prioritas pendampingan, bukan pemeringkatan kinerja wilayah.':'Delapan kecamatan dengan rata-rata DQM SD terendah pada data 22–23 Oktober 2026. Urutan dihitung dari skor sekolah, bukan skor IKD wilayah.',
 'Rata-rata skor per dimensi pada 746 SD. Nilai dimensi tidak sama dengan skor gabungan sekolah.':'Rata-rata empat dimensi DQM pada 746 SD. Dimensi DQM berbeda dari tiga komponen IKD.',
 'Perbandingan antarperiode ditunda sampai label diverifikasi.':'Skor antarsemester tidak dibandingkan karena variabel penilaian berubah, sesuai keterangan pengelola. Penurunan persentase tidak langsung menunjukkan penurunan kualitas data.',
 'Data identitas anak tidak disertakan.':'Identitas anak tidak ditampilkan.',
 'Angka ATS tidak menjadi komponen perhitungan IKD atau DQM.':'Rekap ATS ini disajikan terpisah dan tidak digunakan untuk menghitung skor IKD atau DQM pada presentasi.',
 'Status sumber: VALID_STRUKTUR; total pembanding dari sumber belum tersedia.':'Jumlah ini mengikuti rekap sumber dan belum dicocokkan dengan total pembanding.',
 'Batasan data: hasil ini adalah snapshot 23 Oktober 2026. Skor resmi dan status terkini tetap merujuk ke halaman DQM masing-masing sekolah.':'Tanggal data: IKD 26 Oktober 2026; DQM 22–23 Oktober 2026. Periksa sumber resmi untuk mengetahui hasil evaluasi terbaru.',
 'NPSN dalam master':'Sekolah dalam referensi',
 'Identifier master kabupaten':'Sekolah dalam referensi kabupaten',
 'PIC':'penanggung jawab',
 'baseline':'data awal',
 'Output praktik peserta':'Catatan hasil praktik',
 'Snapshot DQM':'Data DQM tersimpan',
 'bukan data live':'data per 26 Oktober 2026',
 'bukan kondisi live hari ini':'bukan kondisi terkini',
 }
 for a,b in replacements.items(): h=h.replace(a,b)
 titles={
 'Alur kebijakan':'Perbedaan IKD dan DQM',
 'Tujuan':'Tujuan dan urutan pembahasan',
 'Cakupan kabupaten':'Cakupan data IKD dan DQM kabupaten',
 'IKD menurut jenjang':'Rata-rata IKD sekolah menurut jenjang',
 'Peringkat IKD kab':'3 IKD tertinggi dan 10 terendah',
 'IKD sekolah':'50 SD dengan IKD terendah',
 'Cara membaca skor':'Cara membaca skor dan status DQM',
 'Fokus SD':'Hasil DQM pada 746 SD',
 'Empat dimensi':'Empat dimensi DQM pada SD',
 'Masalah prioritas':'Indikator DQM yang paling sering gagal pada SD',
 'Kecamatan':'Prioritas kecamatan berdasarkan DQM SD',
 'Klinik NPSN':'Pencarian sekolah dan pemeriksaan sumber',
 'Batas DQM PD dan PTK':'Batas cakupan DQM sekolah',
 'Potret Residu PD':'Rekap residu peserta didik',
 'Aplikasi sumber':'Aplikasi untuk menindaklanjuti temuan',
 'Praktik 20 menit':'Praktik pemeriksaan data sekolah · 20 menit',
 'Rencana 30 hari':'Rencana tindak lanjut · 30 hari',
 'Checklist':'Daftar pemeriksaan sebelum tindak lanjut',
 'Mengapa data penting':'Mengapa data pendidikan penting?',
 'Diskusi':'Diskusi dan pemeriksaan sekolah',
 }
 subs={
 'Tujuan':'Paparan dimulai dari capaian dan prioritas IKD, dilanjutkan hasil DQM, lalu pemeriksaan sumber dan rencana perbaikan sekolah.',
 '50 SD prioritas':'Daftar 50 SD dengan skor DQM terendah pada data 22–23 Oktober 2026. Klik sekolah untuk melihat indikator yang perlu diperiksa.',
 'Klinik NPSN':'Cari dengan NPSN atau nama sekolah. Pencarian mencakup seluruh data Wonogiri; naungan sekolah ditampilkan pada rincian.',
 'Alur kebijakan':'IKD dan DQM menggunakan ukuran yang berbeda. Skor, komponen, populasi, dan tanggal sumber harus dibaca sesuai jenis pengukurannya.',
 }
 matches=list(re.finditer(r'<section\b[^>]*class="slide(?: active)?"[^>]*>.*?</section>',h,re.S));by={}
 for m in matches:
  s=m[0];label=re.search(r'data-label="([^"]+)"',s)[1]
  if label in titles: s=re.sub(r'(<h2 class="slide-title">).*?(</h2>)',lambda m:m[1]+titles[label]+m[2],s,flags=re.S)
  if label in subs:s=re.sub(r'(<p class="slide-sub">).*?(</p>)',lambda m:m[1]+subs[label]+m[2],s,flags=re.S)
  if label=='Alur kebijakan':
   s='<section class="slide" data-label="Alur kebijakan"><div class="slide-inner"><div class="slide-header"><div><div class="eyebrow">Panduan membaca data</div><h2 class="slide-title">Perbedaan IKD dan DQM</h2><p class="slide-sub">Keduanya membantu pemeriksaan kualitas data, tetapi skor dan komponennya harus dibaca secara terpisah.</p></div><div class="slide-no"></div></div><div class="county-two"><article class="report-panel"><h3>IKD · Indeks Kualitas Data</h3><p>Nilai resmi dari dashboard IKD Dapodik untuk wilayah dan sekolah.</p><p><b>Tiga komponen:</b> kelengkapan, validitas, dan kemutakhiran.</p><p>Skor wilayah Wonogiri: <b>85,00%</b>. Rata-rata IKD sekolah pada tabel analisis bukan pengganti skor wilayah.</p><p class="note">Sumber IKD: 26 Oktober 2026.</p></article><article class="report-panel"><h3>DQM · Data Quality Monitoring</h3><p>Hasil evaluasi indikator sekolah: lolos, gagal, atau belum dievaluasi.</p><p><b>Empat dimensi pada data ini:</b> kelengkapan, koherensi, keunikan, dan validitas.</p><p>Skor sekolah dan rincian indikator membantu menentukan data yang perlu diperiksa pada aplikasi sumber.</p><p class="note">Sumber DQM: 22–23 Oktober 2026.</p></article></div><div class="insight">Skor IKD tidak dihitung dari DQM. Selisih kedua skor bukan ukuran kenaikan atau penurunan kualitas data. Perhatikan jenis ukuran, cakupan sekolah, dan tanggal sumber.</div></div></section>'
  if label=='50 SD prioritas':
   s=s.replace('Referensi pembinaan · bukan daftar peserta','Prioritas berdasarkan DQM')
   s=re.sub(r'<div class="insight">.*?</div>','<div class="insight">Gunakan indikator gagal untuk menentukan tindakan setiap sekolah. Peringkat DQM ini berbeda dari peringkat IKD pada bagian sebelumnya.</div>',s,flags=re.S)
  if label=='Peringkat IKD kab':s=s.replace('; bukan daftar peserta','').replace('Klik sekolah untuk membuka klinik.','Klik sekolah untuk melihat rincian IKD dan DQM.')
  if label=='IKD sekolah':s=s.replace('Cakupan sheet IKD, bukan peringkat seluruh SD dan bukan peserta kegiatan. Daftar DQM tetap tersedia pada slide tersendiri.','Urutan berdasarkan IKD resmi yang tersedia. Daftar 50 SD berdasarkan DQM disajikan terpisah pada bagian DQM.')
  if label=='Tujuan':s=s.replace('Fokus bukan mengubah angka pada dashboard, melainkan memperbaiki data di sumber resmi agar hasil evaluasi ikut membaik.','Perbaikan dilakukan pada aplikasi sumber, kemudian hasilnya diperiksa pada evaluasi berikutnya.')
  # Remove old chapter numbers; slide numbers remain automatic.
  s=re.sub(r'(<div class="eyebrow">)\d{2}\s*·\s*',r'\1',s)
  by[label]=s
 order=['Pembuka','Mengapa data penting','Tujuan','Alur kebijakan','Cakupan kabupaten','Capaian IKD Jawa Tengah','IKD menurut jenjang','Peringkat IKD kab','Kecamatan kabupaten','IKD sekolah','Cara membaca skor','Potret Wonogiri','Masalah DQM kabupaten','Fokus SD','Empat dimensi','Masalah prioritas','Kecamatan','50 SD prioritas','Batas DQM PD dan PTK','Potret Residu PD','Residu per jenjang','Perbaikan residu siswa','Penerbitan NUPTK','Rekap ATS','Perbandingan naungan','Cakupan lima sumber','Klinik NPSN','Aplikasi sumber','Praktik 20 menit','Rencana 30 hari','Checklist','Diskusi']
 assert set(order)==set(by)
 h=h[:matches[0].start()]+'\n'.join(by[x] for x in order)+h[matches[-1].end():]
 # Static numbering is correct even before JavaScript initializes.
 count=0
 def numbering(m):
  nonlocal count
  count+=1
  return m[1]+f'{count+1:02} / {len(order)}'+m[2]
 h=re.sub(r'(<div class="slide-no">).*?(</div>)',numbering,h)
 # Final copy pass after section assembly; only visible HTML text is edited.
 from public_copy import polish
 return polish(h)
