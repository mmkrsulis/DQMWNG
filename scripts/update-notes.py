import json,re,pathlib
root=pathlib.Path(__file__).resolve().parents[1]
p=root/'presenter/notes.html';h=p.read_text(encoding='utf-8')
old=json.loads(re.search(r'const notes=(.*?);let i=0;',h).group(1));by={x['label']:x['note'] for x in old}
labels=re.findall(r'<section class="slide"[^>]*data-label="([^"]+)"',(root/'index.html').read_text(encoding='utf-8'))
notes=[]
for i,label in enumerate(labels):
 note=by.get(label,'Jelaskan cakupan dan tanggal sumber pada slide. Jangan menyamakan IKD resmi dengan DQM.')
 if label.startswith('Peringkat IKD'):
  note='Peringkat menggunakan IKD resmi, bukan DQM. Tampilkan 3 tertinggi dan 10 terendah hanya pada kelompok kewenangan ini. Kabupaten memiliki 1.765 sekolah dengan IKD; provinsi 76; Kemenag belum memiliki nilai IKD pada sumber. Jangan mengisi kelompok kosong dengan DQM atau sekolah kelompok lain. Nilai sama diurutkan NPSN, bukan berarti kualitas berbeda. Daftar prioritas bukan daftar hadir.'
 notes.append(dict(slide=i+1,label=label,note=note))
h=re.sub(r'const notes=.*?;let i=0;',lambda m:'const notes='+json.dumps(notes,ensure_ascii=False)+';let i=0;',h)
p.write_text(h,encoding='utf-8')
