import json,re,pathlib
root=pathlib.Path(__file__).resolve().parents[1]
p=root/'presenter/notes.html';h=p.read_text(encoding='utf-8')
old=json.loads(re.search(r'const notes=(.*?);let i=0;',h).group(1));by={x['label']:x['note'] for x in old}
labels=re.findall(r'<section class="slide"[^>]*data-label="([^"]+)"',(root/'index.html').read_text(encoding='utf-8'))
notes=[]
for i,label in enumerate(labels):
 note=by.get(label,'Jelaskan cakupan dan tanggal sumber pada slide. Jangan menyamakan IKD resmi dengan DQM.')
 if label.startswith('Peringkat IKD'):
  note='Peringkat menggunakan IKD resmi, bukan DQM. Tampilkan 3 tertinggi dan 10 terendah pada naungan kabupaten; filter PAUD/SD/SMP/nonformal tersedia. Kabupaten memiliki 1.765 sekolah dengan IKD. Nilai sama diurutkan NPSN, bukan berarti kualitas berbeda. Daftar prioritas bukan daftar hadir.'
 if label=='Capaian IKD Jawa Tengah':
  note='Soroti Wonogiri peringkat 1 Jawa Tengah sesuai konfirmasi pengelola pada 27 Oktober 2026. Skor 85,00 dan tiga komponen bersumber dari sheet pada 26 Oktober. Kolom peringkat sheet yang dibaca pada revisi masih kosong; jangan menyebutnya hasil verifikasi peringkat otomatis. Prioritas terendah: kemutakhiran 76,57%.'
 if label=='Perbandingan naungan':
  note='Cukup jelaskan perbandingan singkat ini. Analisis dan pendampingan mendalam tetap fokus pada kabupaten. Kemenag belum memiliki IKD pada sumber; jangan menggantinya dengan DQM.'
 notes.append(dict(slide=i+1,label=label,note=note))
h=re.sub(r'const notes=.*?;let i=0;',lambda m:'const notes='+json.dumps(notes,ensure_ascii=False)+';let i=0;',h)
p.write_text(h,encoding='utf-8')
