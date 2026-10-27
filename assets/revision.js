'use strict';
let monitoring=window.MONITOR_SNAPSHOT;
const storageKey='wonogiri-followup-v1';
let localRecords={followup:{}};
try{const v=JSON.parse(localStorage.getItem(storageKey));if(v&&v.followup&&typeof v.followup==='object')localRecords={followup:v.followup};}catch{}
function persistRecords(){try{localStorage.setItem(storageKey,JSON.stringify(localRecords));return true;}catch{alert('Penyimpanan perangkat tidak tersedia. Ekspor catatan sebelum menutup halaman.');return false;}}
function enhanceClinic(s){
  el('modal-dapodik').hidden=!Monitor.npsn(s.n);
  document.getElementById('clinic-extra')?.remove();
  const o=monitoring.schools[s.n];
  const extra=document.createElement('div');extra.id='clinic-extra';
  extra.innerHTML=`<div class="official-clinic"><h3>IKD resmi sekolah · terpisah dari DQM</h3><div class="grid cols4">${[['Skor IKD',o?.score],['Kelengkapan',o?.complete],['Validitas',o?.valid],['Kemutakhiran',o?.current]].map(([name,value])=>`<div><div class="note">${name}</div><strong>${value===undefined||value===null?'Belum tersedia':dec(value,2)+'%'}</strong></div>`).join('')}</div><p class="note">${o?'Waktu sumber: '+esc(o.at)+' · ':''}${o?`<a target="_blank" rel="noopener noreferrer" href="${esc(o.url)}">Dashboard IKD sumber ↗</a>`:'Tidak ada nilai IKD dalam snapshot untuk NPSN ini.'}</p></div>
  <details class="card"><summary>Catatan tindak lanjut manual</summary><p class="note">Tersimpan pada perangkat ini. Status manual tidak mengubah skor atau status indikator otomatis.</p><div class="manual-form"><label>Tahap<select id="follow-stage">${['Identifikasi','Perbaikan','Verifikasi','Sinkronisasi','Evaluasi'].map(x=>`<option>${x}</option>`).join('')}</select></label><label>Tanggal penyelesaian manual<input id="follow-date" type="date"/></label><label class="wide">Masalah dan tindakan<textarea id="follow-note" maxlength="2000" placeholder="Catat indikator, tindakan dan bukti yang perlu diperiksa"></textarea></label><label><span><input id="follow-help" type="checkbox"/> Memerlukan bantuan dinas</span></label><button class="btn primary" id="save-follow">Simpan catatan</button></div><p class="note" id="follow-status" role="status"></p></details>`;
  document.getElementById('modal-metrics').after(extra);
  const r=localRecords.followup[s.n]||{};
  el('follow-stage').value=r.stage||'Identifikasi';el('follow-date').value=r.date||'';el('follow-note').value=r.note||'';el('follow-help').checked=!!r.help;
  el('save-follow').onclick=()=>{localRecords.followup[s.n]={stage:el('follow-stage').value,date:el('follow-date').value,note:el('follow-note').value,help:el('follow-help').checked,savedAt:new Date().toISOString(),baseline:{dqm:s.score??null,ikd:o?.score??null,ikdAt:o?.at??null}};const ok=persistRecords();el('follow-status').textContent=ok?'Catatan manual disimpan. Hasil perbaikan menunggu pengukuran berikutnya.':'Catatan hanya tersedia selama halaman ini terbuka. Silakan ekspor.';};
}
function openMasterSchool(s){
  selectedSchool=null;el('modal-name').textContent=s.name;
  el('modal-meta').textContent=`NPSN ${s.n} · ${s.level} · ${s.district||'Kecamatan belum tersedia'}`;
  el('modal-metrics').innerHTML='<div class="metric-tile"><strong>Belum tersedia</strong><span>Skor DQM</span></div>';
  el('modal-dimensions').textContent='Dimensi DQM belum tersedia.';el('modal-advice').textContent='Periksa sumber resmi sebelum menentukan perbaikan.';el('modal-indicators').textContent='Indikator DQM belum tersedia.';el('modal-official').hidden=true;const profile=dapodikProfileURL(s.n);el('modal-dapodik').hidden=!profile;if(profile)el('modal-dapodik').href=profile;enhanceClinic(s);el('school-modal').classList.add('open');
}
function renderOfficialPriority(){const list=Object.values(monitoring.schools).filter(x=>x.level==='SD'&&Monitor.score(x.score)!==null).sort((a,b)=>a.score-b.score||a.n.localeCompare(b.n)).slice(0,50);el('official-priority').innerHTML=list.map((s,i)=>`<tr class="clickable" data-npsn="${s.n}"><td>${i+1}</td><td>${s.n}</td><td class="rowname">${esc(s.name)}</td><td>${dec(s.score,2)}%</td><td>${s.current==null?'Belum tersedia':dec(s.current,2)+'%'}</td></tr>`).join('');el('official-priority').querySelectorAll('tr').forEach(r=>r.onclick=()=>openSchool(CLINIC_BY_NPSN.get(r.dataset.npsn)||monitoring.schools[r.dataset.npsn]));}
const sourceLabels=[['IKD resmi','1.841','sekolah · 26 Okt 2026',0],['DQM','2.027','sekolah · 22–23 Okt 2026',6],['Master sekolah','2.068','identifier · 15 Okt 2026',3],['Residu PD','333','baris · 26 Okt 2026',2],['ATS','3.059','catatan · 16 Okt 2026',4]];
el('source-cards').innerHTML=sourceLabels.map(([label,n,note,index])=>`<div class="card"><h3>${label}</h3><div class="kpi accent">${n}</div><p>${note}</p><a class="small" target="_blank" rel="noopener noreferrer" href="${esc(monitoring.sources[index].url || `https://docs.google.com/spreadsheets/d/${monitoring.sources[index].id}/edit`)}">Buka sumber ↗</a></div>`).join('');
bars([...monitoring.ats.districts].sort((a,b)=>b.total-a.total).slice(0,8).map(r=>({label:r.name,value:r.total})),'ats-bars');
const verified=monitoring.ats.districts.reduce((sum,r)=>sum+r.verified,0);
el('ats-verification').textContent=`${fmt(verified)} catatan berstatus sudah verifikasi ATS dalam rekap kecamatan. Verifikasi tidak berarti anak sudah kembali bersekolah.`;
function paintOfficial(){const o=monitoring.official;const slide=document.querySelector('[data-label="Capaian IKD Jawa Tengah"]');slide.querySelector('.slide-title').textContent=`IKD Wonogiri ${dec(o.score,2)}%`;slide.querySelector('.ikd-number-count').textContent=dec(o.score,2);slide.querySelector('.ikd-number-count').dataset.number=dec(o.score,2);slide.querySelector('.ikd-official-progress span').style.setProperty('--target',o.score+'%');slide.querySelector('.ikd-official-progress').setAttribute('aria-label',`Skor IKD ${dec(o.score,2)} persen`);['complete','valid','current'].forEach(k=>{const c=slide.querySelector('.ikd-indicator-card.'+k);c.querySelector('strong').textContent=dec(o[k],2)+'%';c.querySelector('.ikd-mini-track span').style.setProperty('--target',o[k]+'%');});slide.querySelector('.ikd-source-links span').textContent='Waktu sumber: '+o.at+' · IKD resmi';}
// JSONP is read-only and restricted to Google Apps Script. No write token enters HTML.
el('sync-official').onclick=async()=>{
 let url;try{url=new URL(el('read-api-url').value);if(url.protocol!=='https:'||url.hostname!=='script.google.com'||!/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname))throw Error();}catch{el('sync-status').textContent='Gunakan URL deployment Google Apps Script yang valid.';return;}
 el('sync-official').disabled=true;el('sync-status').textContent='Mengambil snapshot IKD…';
 try{const payload=await new Promise((resolve,reject)=>{const cb='ikdRead_'+Date.now();const script=document.createElement('script');let timeout;const clean=()=>{clearTimeout(timeout);script.remove();delete window[cb];};window[cb]=data=>{clean();resolve(data);};timeout=setTimeout(()=>{clean();reject(Error('Batas waktu koneksi.'));},15000);script.onerror=()=>{clean();reject(Error('Koneksi gagal.'));};url.searchParams.set('callback',cb);url.searchParams.set('action','snapshot');script.src=url.href;document.head.appendChild(script);});
 if(!payload.ok||!Monitor.validateOfficial(payload.official))throw Error(payload.error||'Data IKD tidak lengkap atau tidak valid.');
 if(Date.parse(payload.official.at)<Date.parse(monitoring.official.at))throw Error('Snapshot server lebih lama; data yang valid dipertahankan.');
 monitoring={...monitoring,official:payload.official};paintOfficial();el('sync-status').textContent='IKD wilayah diperbarui dari Sheets. IKD sekolah dan DQM tetap snapshot offline masing-masing.';
 }catch(e){el('sync-status').textContent=e.message+' Snapshot offline dipertahankan.';}finally{el('sync-official').disabled=false;}
};
renderOfficialPriority();
for(const scope of ['kab']){
 const ranks=Monitor.ranking(monitoring.schools,monitoring.master,scope);
 el('rank-count-'+scope).textContent=ranks.count?`${fmt(ranks.count)} sekolah dengan IKD resmi · snapshot 26 Oktober 2026`:'Belum tersedia · tidak ada IKD resmi Kemenag pada sumber';
 el('rank-top-'+scope).innerHTML=ranks.top.length?ranks.top.map((s,i)=>`<button class="card ranking-school" data-npsn="${esc(s.n)}"><span class="ranking-position">${i+1}</span><span><b>${esc(s.name)}</b><small>${esc(s.n)} · ${esc(s.level)}</small></span><strong>${dec(s.score,2)}<small>%</small></strong></button>`).join(''):'<div class="card rank-empty"><h3>Belum tersedia</h3><p>Tiga sekolah dengan IKD tertinggi belum dapat ditentukan. Sumber belum memuat nilai IKD resmi untuk sekolah naungan Kemenag.</p></div>';
 el('rank-bottom-'+scope).innerHTML=ranks.bottom.length?ranks.bottom.map((s,i)=>`<tr class="clickable" data-npsn="${esc(s.n)}"><td>${i+1}</td><td class="rowname"><b>${esc(s.name)}</b><small>${esc(s.n)}</small></td><td>${esc(s.level)}</td><td class="num"><b>${dec(s.score,2)}%</b></td></tr>`).join(''):'<tr><td colspan="4" class="rank-empty">Belum tersedia. Skor DQM Kemenag tidak digunakan sebagai pengganti IKD resmi.</td></tr>';
 document.querySelector(`[data-ikd-scope="${scope}"]`).querySelectorAll('[data-npsn]').forEach(row=>row.addEventListener('click',()=>openSchool(CLINIC_BY_NPSN.get(row.dataset.npsn)||monitoring.schools[row.dataset.npsn])));
}
// Focus remains in an open dialog; underlying slide is not exposed to keyboard traversal.
const modal=el('school-modal');modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-labelledby','modal-name');
let focusBeforeModal=null;
new MutationObserver(()=>{const open=modal.classList.contains('open');el('stage').inert=open;el('main-header').inert=open;if(open){focusBeforeModal=document.activeElement;el('close-modal').focus();}else if(focusBeforeModal?.isConnected){focusBeforeModal.focus();}}).observe(modal,{attributes:true,attributeFilter:['class']});
modal.addEventListener('keydown',e=>{if(e.key!=='Tab')return;const nodes=[...modal.querySelectorAll('button,a[href],input,select,textarea,summary')].filter(n=>!n.disabled&&n.getClientRects().length);if(!nodes.length)return;const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}});
