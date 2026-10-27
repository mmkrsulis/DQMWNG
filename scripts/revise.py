"""One-time migration of the repository presentation; source tables retained for audit."""
import json,re,pathlib,html,subprocess
root=pathlib.Path(__file__).resolve().parents[1]
def read(n): return json.loads((root/'data/sources'/f'{n}.json').read_text(encoding='utf-8'))
def num(v): return None if v is None or str(v).strip()=='' else float(str(v).replace('%','').replace(',','.'))
h=subprocess.check_output(['git','show','602f299:index.html'],cwd=root).decode('utf-8')
old=json.loads(re.search(r'<script id="ikd-data" type="application/json">(.*?)</script>',h,re.S).group(1))
schools={r[0]:dict(n=r[0],name=r[1],level=r[2],district=r[3],complete=num(r[4]),valid=num(r[5]),current=num(r[6]),score=num(r[7]),url=r[8],at=r[9]) for r in read('ikd-sekolah')['values'][1:]}
master={r[5]:dict(n=r[5],name=r[6],level=r[1],district=r[4],ministry='Kemenag' if 'Agama' in r[11] else 'Kemendikdasmen') for r in read('master')['values'][2:] if len(r)>11 and r[5]}
levels={};resrows=read('residu')['values'][1:]
for r in resrows:
 l=levels.setdefault(r[2],dict(schools=0,values=[0]*9));l['schools']+=1
 l['values']=[a+int(b or 0) for a,b in zip(l['values'],r[5:14])]
res=dict(snapshot='2026-10-26',schoolRows=len(resrows),labels=['NISN','NIK Dukcapil','NIK ganda','Nama','Tempat lahir','Tanggal lahir','Ibu kandung','Desa/Kelurahan','Residu Validasi (rekap)'],levels=levels)
wr=read('ikd-wilayah')['values'];w=next(r for r in wr[1:] if r[0]=='Kabupaten' and r[1]=='Kab. Wonogiri')
monitor=dict(schemaVersion=1,retrievedAt=read('ikd-wilayah')['retrievedAt'],official=dict(score=num(w[7]),complete=num(w[4]),valid=num(w[5]),current=num(w[6]),rank=num(w[3]),at=w[9],url=w[8]),history=[dict(label=r[1],score=num(r[7]),at=r[9]) for r in wr[1:] if r[0]=='Wilayah'],schools=schools,master=master,residu=res,ats=dict(total=3059,do=702,ltm=1390,bpb=967,withoutNisn=967,at='16/10/2026',status='VALID_STRUKTUR',districts=[dict(name=r[1],total=int(r[2]),verified=int(r[6])) for r in read('ats-kecamatan')['values'][1:]]),sources=[dict(id=read(n)['spreadsheetId'],tab=read(n)['sheet'],at=read(n)['retrievedAt']) for n in ['ikd-wilayah','ikd-sekolah','residu','master','ats-dashboard','ats-kecamatan','dqm-nilai']],dqmDates={r[0]:r[13] for r in read('dqm-nilai')['values'][1:]})
# Public ATS destination: never expose the private spreadsheet identifier.
for source in monitor['sources']:
 if source['tab'] in ['DASHBOARD ATS','REKAP KECAMATAN']:
  source.pop('id',None)
  source['url']='https://script.google.com/macros/s/AKfycbwNkGx_xVtlVRCEh0X9kjmc0NC5K0MNkWbhrcFmp5_R0L2COUbk50q5PB4obnUeC4RUAA/exec'
(root/'data/monitoring.js').write_text('window.MONITOR_SNAPSHOT = '+json.dumps(monitor,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
h=h.replace('<!DOCTYPE html>\n\n<!DOCTYPE html>','<!DOCTYPE html>',1)
h=h.replace('</head>','<link rel="stylesheet" href="assets/revision.css"/>\n</head>')
h=h.replace('const DATA=','const DATA=',1)
h=h.replace('<script id="ikd-data"','<script src="data/monitoring.js"></script><script src="assets/normalization.js"></script>\n<script id="ikd-data"',1)
h=re.sub(r'(<script id="residu-data" type="application/json">).*?(</script>)',lambda m:m[1]+json.dumps(res,ensure_ascii=False)+m[2],h,flags=re.S)
h=h.replace('5 Oktober 2026','26 Oktober 2026').replace('05/10/2026','26/10/2026').replace('dari 5 Oktober','dari 26 Oktober')
# Only replace old residu counters within their own section.
def residues(m):
 s=m[0]
 for a,b in [('359','333'),('1.202','1.194'),('334','358'),('147','152')]: s=s.replace('>'+a+'<','>'+b+'<')
 return s
h=re.sub(r'<section class="slide" data-label="Potret Residu PD">.*?</section>',residues,h,flags=re.S)
def official(m):
 s=m[0].replace('Wonogiri <span class="accent">peringkat pertama.</span>','IKD Wonogiri <span class="accent">85,00%</span>')
 s=s.replace('Posisi teratas menjadi apresiasi bagi operator sekolah sekaligus pengingat: masih ada aspek data yang perlu ditingkatkan.','Kemutakhiran menjadi fokus perbaikan. Nilai bersumber dari rekap IKD resmi, terpisah dari skor DQM sekolah.')
 s=re.sub(r'<div class="ikd-official-rank">.*?</div>','<div class="badge warn">Peringkat terbaru: belum tersedia</div>',s)
 s=s.replace('Teratas dari 35 kabupaten/kota di Jawa Tengah pada tangkapan layar dashboard.','Snapshot sumber · 26 Oktober 2026, 14:41 WIB. Peringkat 1/35 hanya tercatat pada baseline lama dari pengguna.')
 s=s.replace('<strong>Pesan untuk 50 operator SD:</strong> kita sudah peringkat 1, tetapi pekerjaan kita belum selesai.','<strong>Prioritas pembinaan:</strong> kemutakhiran 76,57% merupakan komponen terendah.')
 s=s.replace('Snapshot tangkapan layar pengguna · 23 Okt 2026 · bukan skor DQM','Rekap IKD RESMI WILAYAH · 26 Okt 2026 · bukan data live')
 return s
h=re.sub(r'<section class="slide" data-label="Capaian IKD Jawa Tengah">.*?</section>',official,h,flags=re.S)
# Clinic searches all known schools; dashboard filter remains independent.
h=h.replace('for(const s of visibleSchools())','for(const s of CLINIC_SCHOOLS)')
h=h.replace('let exact=byNPSN.get(q);','let exact=CLINIC_BY_NPSN.get(q);')
h=h.replace('CLINIC_BY_NPSN.get(q);','CLINIC_BY_NPSN.get(q.toUpperCase());').replace('s.n.startsWith(q)','s.n.toLowerCase().startsWith(q)')
h=h.replace('openSchool(byNPSN.get(item.dataset.npsn))','openSchool(CLINIC_BY_NPSN.get(item.dataset.npsn))')
h=h.replace('Crawl ${esc(s.crawl)}','DQM ${esc(window.MONITOR_SNAPSHOT.dqmDates[s.n]||s.computed||"Belum tersedia")}')
h=h.replace("let url=s.url||('https://kualitas.data.kemendikdasmen.go.id/sekolah/'+s.u);el('modal-official').href=url;","let url=Monitor.safeDqmURL(s.url);el('modal-official').hidden=!url;if(url)el('modal-official').href=url;")
h=h.replace("function openSchool(s){if(!s)return;","function openSchool(s){if(!s)return;if(!byNPSN.has(s.n)){openMasterSchool(s);return;}")
h=h.replace("renderIndicators();el('school-modal').classList.add('open');","renderIndicators();enhanceClinic(s);el('school-modal').classList.add('open');")
h=h.replace("if(typeof updateNotes==='function')updateNotes()","if(typeof updateNotes==='function')updateNotes();window.dispatchEvent(new CustomEvent('slidechange',{detail:slideIndex}))")
# Add slides before closing stage, by positioning before the existing last section.
extra=(root/'assets/additional-slides.html').read_text(encoding='utf-8')
ranking_slides=''
for scope,title,coverage in [('kab','Dinas Pendidikan Kabupaten','PAUD, SD, SMP dan pendidikan nonformal sesuai pemetaan jenjang'),('prov','Dinas Pendidikan Provinsi','SMA, SMK dan SLB di wilayah Kabupaten Wonogiri'),('kemenag','Kementerian Agama','Sekolah dengan kementerian pembina Kemenag pada master')]:
 ranking_slides+=f'''<section class="slide" data-label="Peringkat IKD {scope}" data-ikd-scope="{scope}"><div class="slide-inner">
<div class="slide-header"><div><div class="eyebrow">Peringkat IKD resmi · {title}</div><h2 class="slide-title">3 tertinggi &amp; <span class="goldtext">10 terendah</span></h2><p class="slide-sub">{coverage}. Kelompok ini terpisah dari naungan lainnya.</p></div><div class="slide-no"></div></div>
<div class="rank-coverage badge" id="rank-count-{scope}"></div><div class="ranking-layout"><div><h3 class="rank-heading">3 IKD tertinggi</h3><div class="ranking-top" id="rank-top-{scope}"></div></div><div><h3 class="rank-heading">10 IKD terendah</h3><div class="tablewrap ranking-table"><table><thead><tr><th>No.</th><th>Sekolah / NPSN</th><th>Jenjang</th><th class="num">IKD</th></tr></thead><tbody id="rank-bottom-{scope}"></tbody></table></div></div></div>
<div class="insight warn">Peringkat hanya mencakup sekolah dengan IKD resmi yang tersedia dalam kelompok ini; bukan daftar peserta. Nilai sama diurutkan menurut NPSN tanpa menyatakan perbedaan kualitas.</div><p class="note">Sumber: IKD RESMI SEKOLAH · 26 Oktober 2026; pemetaan naungan dari master referensi · 15 Oktober 2026. Klik sekolah untuk membuka klinik.</p>
</div></section>'''
extra=extra.replace('<section class="slide" data-label="IKD sekolah">',ranking_slides+'<section class="slide" data-label="IKD sekolah">')
h=h.replace('<section class="slide" data-label="Diskusi">',extra+'\n<section class="slide" data-label="Diskusi">')
h=h.replace("const slides=[...document.querySelectorAll('.slide')]", "const CLINIC_BY_NPSN=new Map([...Object.values(window.MONITOR_SNAPSHOT.master),...S].map(s=>[s.n,s]));const CLINIC_SCHOOLS=[...CLINIC_BY_NPSN.values()];\nconst slides=[...document.querySelectorAll('.slide')]")
h=h.replace('</body>','<script src="assets/revision.js"></script></body>')
h=h.replace('Skor ${dec(s.score,1)}','DQM ${s.score==null?"Belum tersedia":dec(s.score,1)}')
h=h.replace('/^\\d{8}$/','/^[A-Z0-9]{8}$/i').replace('8 digit','8 karakter').replace('NPSN 8 digit','NPSN 8 karakter')
(root/'index.html').write_text(h,encoding='utf-8')
print('Updated presentation, '+str(len(schools))+' official school scores; '+str(len(master))+' master schools')
