"""Refine the previously committed presentation; preserve data and existing working modules."""
import re,pathlib,subprocess
root=pathlib.Path(__file__).resolve().parents[1]
h=subprocess.check_output(['git','show','23a2919:index.html'],cwd=root).decode('utf-8')
def section(label): return r'<section\b[^>]*data-label="'+re.escape(label)+r'"[^>]*>.*?</section>'
for label in ['Sapaan pemateri','Peta kewenangan','Antar jenjang','Peringkat IKD prov','Peringkat IKD kemenag','Peserta dan tindak lanjut']:
 h=re.sub(section(label),'',h,flags=re.S)
# Keep the district-focused old SD analysis; add county-wide analysis before it.
extra=(root/'assets/county-slides.html').read_text(encoding='utf-8')
parts=re.findall(r'<section.*?</section>',extra,re.S)
h=h.replace('<section class="slide" data-label="Fokus SD">','\n'.join(parts[:4])+'<section class="slide" data-label="Fokus SD">')
h=h.replace('<section class="slide" data-label="Cakupan lima sumber">',parts[4]+'<section class="slide" data-label="Cakupan lima sumber">')
h=h.replace('<html lang="id">','<html lang="id" data-theme="light">')
h=h.replace('<head>','<head><script>try{document.documentElement.dataset.theme=localStorage.getItem("wonogiri-theme")==="dark"?"dark":"light";}catch{}</script>')
h=h.replace('</head>','<link rel="stylesheet" href="assets/county.css"/></head>')
h=h.replace('<button class="btn ghost icon-only" id="fullscreen"','<button class="btn" id="theme-toggle" type="button" aria-label="Ubah tema">Tema gelap</button><button class="btn ghost icon-only" id="fullscreen"')
h=h.replace('<script src="assets/revision.js"></script>','<script src="assets/revision.js"></script><script src="assets/county.js"></script>')
h=h.replace('const authCounts={kab:0,prov:0,kemenag:0,lain:0};S.forEach(s=>authCounts[authorityOf(s)]++);','')
h=h.replace('function bars(rows,target,options={}){','function bars(rows,target,options={}){\n  if(!el(target))return;')
h=re.sub(r"  \['kab','prov','kemenag'\].forEach.*?\n",'',h)
h=re.sub(r"  el\('authority-unclassified'\).*?\n",'',h)
h=re.sub(r"  bars\(\[\{label:'Kabupaten/Kota'.*?\n",'',h)
h=h.replace("scope==='all'||authorityOf(s)===scope","authorityOf(s)==='kab'")
h=h.replace("el('cover-all').textContent=fmt(S.length)","el('cover-all').textContent=fmt(S.filter(s=>authorityOf(s)==='kab').length)")
# Freeze the audience focus at kabupaten; the one comparison slide uses all sources explicitly.
h=re.sub(r'(<select[^>]*id="scope-filter"[^>]*>).*?(</select>)',r'\1<option value="kab" selected>Naungan kabupaten</option>\2',h,flags=re.S)
h=h.replace("el('scope-filter').value='all'","el('scope-filter').value='kab'")
h=h.replace('for(const scope of [','for(const scope of [')
h=h.replace('Potret kualitas data yang dapat dibaca bersama.','DQM sekolah naungan kabupaten')
h=h.replace('Sekolah Kemenag dan jenjang provinsi menindaklanjuti melalui institusi pembina serta aplikasi sumber yang berlaku.','Untuk sekolah naungan kabupaten, pilih aplikasi sesuai temuan dan koordinasikan kendala yang memerlukan bantuan dinas.')
h=h.replace('Potret seluruh satuan pendidikan di wilayah Wonogiri. Gunakan filter instansi dan jenjang untuk membandingkan kelompok yang sesuai; angka di bawah mengikuti pilihan.','Ringkasan sekolah naungan kabupaten. Filter jenjang mengubah kelompok yang dianalisis; sekolah naungan provinsi dan Kemenag tidak masuk perhitungan ini.')
h=h.replace('✓ 100% selesai','Snapshot DQM').replace('skor kabupaten adalah ringkasan hasil evaluasi saat data diambil','rata-rata DQM adalah ringkasan skor sekolah pada saat data diambil')
h=h.replace('Snapshot data 23 Oktober 2026','IKD 26 Oktober · DQM 22–23 Oktober 2026')
h=h.replace('Tekan Enter untuk membuka hasil DQM sekolah. Tombol Profil Dapodik membuka data resmi menurut NPSN pada tab baru.','Ketik NPSN atau nama, lalu pilih sekolah pada hasil pencarian. Profil Dapodik dan Profil DQM tersedia sebagai tombol terpisah.')
h=h.replace('Sumber: IKD/DQM Kab. Wonogiri · 2.027 sekolah, 33 indikator, 100% selesai di-crawl · 23 Oktober 2026','Fokus naungan kabupaten · IKD 26 Oktober 2026 · DQM 22–23 Oktober 2026')
h=h.replace('Perbandingan dihitung hanya dari sekolah pada kelompok yang sedang ditampilkan.','Ringkasan dihitung hanya dari sekolah naungan kabupaten pada jenjang yang dipilih.')
# Rank confirmation is attributed to the user; retain raw sheet rank=null.
h=h.replace('Peringkat terbaru: belum tersedia','Peringkat 1 · Jawa Tengah')
h=h.replace('Snapshot sumber · 26 Oktober 2026, 14:41 WIB. Peringkat 1/35 hanya tercatat pada baseline lama dari pengguna.','Skor: rekap IKD 26 Oktober 2026, 14:41 WIB. Peringkat 1: konfirmasi pengelola, 27 Oktober 2026; kolom peringkat sheet belum terisi.')
h=h.replace('Peringkat terbaru belum tersedia.','Peringkat 1 Jawa Tengah dikonfirmasi pengelola pada 27 Oktober 2026; kolom peringkat sheet belum terisi.')
h=h.replace('IKD Wonogiri <span class="accent">85,00%</span>','Wonogiri peringkat <span class="accent">1 di Jawa Tengah</span>')
# Ranking remains for kabupaten only, with an explicit group filter.
h=h.replace('<div class="rank-coverage badge" id="rank-count-kab"></div>','<div class="report-toolbar"><label>Kelompok sekolah <select id="county-ranking-group" class="county-group"><option value="all">Semua naungan kabupaten</option><option>PAUD</option><option>SD</option><option>SMP</option><option>Nonformal</option></select></label><span class="rank-coverage" id="rank-count-kab"></span></div>')
# Replace decorative orbital cover with two evidence blocks.
cover=re.search(section('Pembuka'),h,re.S)
if cover:
 s=cover[0]
 s=re.sub(r'<h1>.*?</h1>','<h1>Kualitas data pendidikan<br/><span class="accent">Kabupaten Wonogiri</span></h1>',s,flags=re.S)
 s=re.sub(r'<div class="orbital">.*?</div>\s*</div>', '<div class="cover-evidence"><article><span>IKD RESMI WILAYAH</span><strong>85,00<small>%</small></strong><p>Peringkat 1 di Jawa Tengah*</p></article><article><span>DQM NAUNGAN KABUPATEN</span><strong id="cover-county-score">—</strong><p>Rata-rata skor sekolah · skala 0–100</p></article><small>*Konfirmasi pengelola 27 Okt 2026. Skor IKD: sheet 26 Okt 2026.</small></div></div>',s,flags=re.S)
 s=s.replace('Seluruh Wonogiri','Naungan kabupaten').replace('Snapshot data: 23 Oktober 2026','IKD: 26 Oktober · DQM: 22–23 Oktober 2026')
 h=h[:cover.start()]+s+h[cover.end():]
h=h.replace('id="clinic-search-btn">⌕ Cari sekolah','id="clinic-search-btn">Tampilkan hasil pencarian')
h=h.replace('id="modal-official"','id="modal-official"')
h=h.replace('Buka DQM Resmi','Profil & indikator DQM ↗').replace('↗ Profil Dapodik','Profil sekolah Dapodik ↗')
h=h.replace('const hash=location.hash.match','const hash=location.hash.match')
# Lead with the two measurements and county analysis, then operator practice.
matches=list(re.finditer(r'<section\b[^>]*class="slide(?: active)?"[^>]*>.*?</section>',h,re.S))
by={re.search(r'data-label="([^"]+)"',m[0])[1]:m[0] for m in matches}
order=['Pembuka','Capaian IKD Jawa Tengah','Potret Wonogiri','Cakupan kabupaten','IKD menurut jenjang','Peringkat IKD kab','Kecamatan kabupaten','Masalah DQM kabupaten','Fokus SD','Empat dimensi','Masalah prioritas','Kecamatan','50 SD prioritas','IKD sekolah','Klinik NPSN','Cara membaca skor','Batas DQM PD dan PTK','Potret Residu PD','Residu per jenjang','Perbaikan residu siswa','Penerbitan NUPTK','Aplikasi sumber','Praktik 20 menit','Rencana 30 hari','Checklist','Perbandingan naungan','Rekap ATS','Cakupan lima sumber','Mengapa data penting','Alur kebijakan','Tujuan','Diskusi']
assert set(order)==set(by), (set(by)-set(order),set(order)-set(by))
h=h[:matches[0].start()]+'\n'.join(by[k] for k in order)+h[matches[-1].end():]
(root/'index.html').write_text(re.sub(r'[ \t]+\n','\n',h),encoding='utf-8')
print('County presentation refined')
