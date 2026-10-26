// ==UserScript==
// @name         Wonogiri IKD Monitor
// @namespace    https://github.com/mmkrsulis/DQMWNG
// @version      1.0.0
// @description  Crawl tabel IKD dengan fingerprint, antrean persisten, dan pengiriman terproteksi.
// @match        https://dapo.kemendikdasmen.go.id/ikd/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @run-at       document-idle
// ==/UserScript==
(function(){
 'use strict';
 const norm=s=>String(s??'').replace(/\s+/g,' ').trim();
 const percent=v=>{const s=norm(v).replace(/%$/,'').replace(',','.');return /^\d+(\.\d+)?$/.test(s)&&Number(s)<=100?Number(s):null;};
 function fingerprint(rows){let h=2166136261;for(const c of JSON.stringify(rows)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return (h>>>0).toString(16);}
 function parse(headers,rows,sourceUrl,at=new Date().toISOString()){
  const names=headers.map(s=>norm(s).toLowerCase());const idx=pattern=>names.findIndex(h=>pattern.test(h));
  const col={n:idx(/^npsn$/),name:idx(/nama.*sekolah|satuan pendidikan|nama.*wilayah|kabupaten|kecamatan|provinsi|^wilayah$/),score:idx(/skor.*ikd|nilai.*ikd|^ikd$|^indeks kualitas data$/),complete:idx(/kelengkapan/),valid:idx(/validitas/),current:idx(/kemutakhiran/),level:idx(/jenjang|bentuk pendidikan/)};
  if(col.name<0||col.score<0)throw Error('Header IKD tidak dikenali: perlu nama dan skor IKD.');
  const records=[],errors=[];
  for(const row of rows){if(!row.some(x=>norm(x)))continue;const name=norm(row[col.name]);const score=percent(row[col.score]);if(!name||score===null){errors.push('Baris tanpa nama/skor valid');continue;}
   const base={name,score,complete:percent(row[col.complete]),valid:percent(row[col.valid]),current:percent(row[col.current]),sourceUrl,crawledAt:at};
   if(col.n>=0){const npsn=norm(row[col.n]).toUpperCase();if(!/^[A-Z0-9]{8}$/.test(npsn)){errors.push('Identifier sekolah tidak valid');continue;}records.push({...base,kind:'school',npsn,level:norm(row[col.level]),district:''});}
   else {
    if(/semester|ganjil|genap/i.test(name)||/^\//.test(name)){errors.push('Baris periode dilewati; bukan wilayah');continue;}
    const parts=new URL(sourceUrl).pathname.split('/').filter(Boolean).slice(1).map(decodeURIComponent);const parent=parts.at(-1)||'';
    const regionType=/kabupaten|kota/i.test(names[col.name])?'Kabupaten':/kecamatan/i.test(names[col.name])?'Kecamatan':/provinsi/i.test(names[col.name])?'Provinsi':'Wilayah';
    if(!parent){errors.push('Induk wilayah tidak tersedia');continue;}records.push({...base,kind:'region',parent,regionType});
   }
  }
  const unique=new Map(records.map(r=>[r.kind==='school'?r.npsn:[r.regionType,r.parent,r.name].join('|'),r]));
  return {records:[...unique.values()],errors};
 }
 if(typeof module!=='undefined'){module.exports={norm,percent,fingerprint,parse};return;}
 const KEY='wonogiri-ikd-state-v1';
 const fresh=()=>({version:1,status:'idle',queue:[],visited:[],sent:[],records:{},success:0,failed:0,skipped:0,transitions:0,logs:[],lastSuccess:null,lastHttp:null,pending:null});
 let state=GM_getValue(KEY,null)||fresh(),running=false,epoch=0;
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const safeURL=()=>location.origin+location.pathname;
 const save=()=>{GM_setValue(KEY,state);paint();};
 const log=message=>{state.logs.push({at:new Date().toISOString(),message});state.logs=state.logs.slice(-100);save();};
 function tables(){return [...document.querySelectorAll('table')].filter(t=>!t.closest('#ikd-monitor-panel'));}
 function read(){
  const candidates=[];for(const t of tables()){
   const header=t.querySelector('thead tr')||t.querySelector('tr');if(!header)continue;const headers=[...header.children].map(c=>norm(c.textContent));
   const rows=[...t.querySelectorAll('tbody tr')].filter(r=>r!==header).map(r=>[...r.children].map(c=>norm(c.textContent)));
   if(!rows.length)for(const r of [...t.querySelectorAll('tr')].slice(1))rows.push([...r.children].map(c=>norm(c.textContent)));
   try{const parsed=parse(headers,rows,safeURL());candidates.push({table:t,headers,rows,fp:fingerprint(rows),...parsed});}catch{}
  }
  const found=candidates.sort((a,b)=>b.records.length-a.records.length)[0];if(!found)throw Error('Struktur tabel IKD tidak dikenali. Buka Diagnostik.');return found;
 }
 function nextButton(t){
  const scope=t.closest('.dataTables_wrapper,.dt-container,[data-table-container]')||document;
  const items=[...scope.querySelectorAll('a,button,[role="button"]')].filter(b=>!b.closest('#ikd-monitor-panel')&&b.getClientRects().length&&!b.disabled&&b.getAttribute('aria-disabled')!=='true'&&!b.closest('.disabled'));
  const next=items.find(b=>/^(next|berikutnya|selanjutnya|›|»|>)$/i.test(norm(b.textContent))||/next|berikutnya/i.test(b.getAttribute('aria-label')||'')||b.matches('[rel="next"],.paginate_button.next,.dt-paging-button.next'));
  if(next)return next;
  const active=scope.querySelector('.pagination .active,[aria-current="page"],.paginate_button.current,.dt-paging-button.current');const n=Number(norm(active?.textContent));
  return n?items.find(b=>norm(b.textContent)===String(n+1)):null;
 }
 async function waitChanged(before,token){const start=Date.now();let stable=null,count=0;while(Date.now()-start<16000){if(token!==epoch)throw Error('Dibatalkan');await sleep(400);let d;try{d=read();}catch{continue;}if(d.fp!==before&&d.records.length){if(d.fp===stable)count++;else{stable=d.fp;count=1;}if(count>=2)return d;}}throw Error('Pagination tidak mengubah tabel dalam 16 detik.');}
 function enqueue(){for(const a of document.querySelectorAll('a[href]')){try{const u=new URL(a.href);if(u.origin!==location.origin||!u.pathname.startsWith('/ikd/')||u.search||u.hash)continue;const url=u.origin+u.pathname;if(url!==safeURL()&&!state.visited.includes(url)&&!state.queue.includes(url))state.queue.push(url);}catch{}}}
 function credentials(){const endpoint=GM_getValue('ikd-endpoint',''),token=GM_getValue('ikd-token','');if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint)||!token)throw Error('Atur endpoint dan token lokal dahulu.');return {endpoint,token};}
 function send(records){const c=credentials();return new Promise((resolve,reject)=>GM_xmlhttpRequest({method:'POST',url:c.endpoint,headers:{'Content-Type':'application/json'},data:JSON.stringify({schemaVersion:1,token:c.token,records}),timeout:20000,onload:r=>{state.lastHttp=r.status;let data;try{data=JSON.parse(r.responseText);}catch{reject(Error('Respons backend bukan JSON'));return;}if(r.status>=200&&r.status<300&&data.ok)resolve(data);else{const e=Error(data.error||'HTTP '+r.status);e.retryable=data.retryable||r.status===429||r.status>=500;reject(e);}},onerror:()=>reject(Error('Jaringan gagal')),ontimeout:()=>reject(Error('Timeout pengiriman'))}));}
 async function upload(d,token){
  for(let i=0;i<d.records.length;i+=250){let done=false;for(let attempt=0;attempt<4;attempt++){
   if(token!==epoch||state.status!=='running')throw Error('Dibatalkan');
   try{await send(d.records.slice(i,i+250));done=true;break;}catch(e){if(e.retryable===false||attempt===3)throw e;log('Retry pengiriman '+(attempt+1));await sleep(1000*2**attempt);}
  }if(!done)throw Error('Pengiriman gagal');}
 }
 function remember(d){for(const r of d.records){const k=r.kind==='school'?r.npsn:[r.regionType,r.parent,r.name].join('|');state.records[k]=r;}}
 async function run(single=false){if(running)return;running=true;state.status='running';const token=++epoch;save();try{
  credentials();
  while(state.status==='running'&&token===epoch){
   const d=read();remember(d);if(!d.records.length)throw Error('Tidak ada baris IKD valid; data lama dipertahankan.');
   const pageKey=safeURL()+'|'+d.fp;
   // A pending transition survives URL navigation and reload.
   if(state.pending){if(d.fp===state.pending.fp){const b=nextButton(d.table);if(!b)throw Error('Tidak dapat melanjutkan pagination yang tertunda.');b.click();await waitChanged(d.fp,token);state.transitions++;state.pending=null;save();continue;}state.pending=null;state.transitions++;save();}
   if(state.sent.includes(pageKey)){if(!single&&state.lastUploaded!==pageKey)throw Error('Halaman berulang terdeteksi. Periksa pagination sebelum Resume.');state.skipped++;}
   else {await upload(d,token);if(token!==epoch)return;state.sent.push(pageKey);state.lastUploaded=pageKey;state.success++;state.lastSuccess=new Date().toISOString();log('Terkirim '+d.records.length+' baris; fingerprint '+d.fp);}
   if(single){state.status='paused';break;}
   enqueue();const next=nextButton(d.table);
   if(next){state.pending={url:safeURL(),fp:d.fp};save();next.click();await waitChanged(d.fp,token);state.pending=null;state.transitions++;save();await sleep(1300);continue;}
   if(!state.visited.includes(safeURL()))state.visited.push(safeURL());const url=state.queue.shift();save();
   if(url){location.assign(url);return;}state.status='complete';log('Antrean selesai. Cakupan sesuai halaman yang ditemukan, bukan jaminan seluruh data resmi.');break;
  }
 }catch(e){if(token===epoch){state.status='paused';state.failed++;log(e.message);}}finally{running=false;save();}}
 function diagnostics(){let d=null,error=null;try{d=read();}catch(e){error=e.message;}return {url:safeURL(),status:state.status,tables:tables().length,validRows:d?.records.length||0,headers:d?.headers||[],pagination:d&&nextButton(d.table)?'Next/nomor; URL atau AJAX':'Tidak terdeteksi',activePage:norm(document.querySelector('[aria-current="page"],.pagination .active,.paginate_button.current')?.textContent),fingerprint:d?.fp,transitions:state.transitions,success:state.success,failed:state.failed,skipped:state.skipped,records:Object.keys(state.records).length,http:state.lastHttp,parserErrors:d?.errors||[error],lastSuccess:state.lastSuccess,queue:state.queue,logs:state.logs};}
 function download(name,text,type='application/json'){const u=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
 const panel=document.createElement('aside');panel.id='ikd-monitor-panel';panel.style.cssText='position:fixed;right:12px;bottom:12px;z-index:2147483647;background:#10283d;color:white;border:1px solid #55ddbd;border-radius:14px;padding:14px;width:320px;max-height:70vh;overflow:auto;font:13px system-ui;box-shadow:0 10px 40px #0008';
 panel.innerHTML='<strong>IKD Wonogiri · Monitor</strong><p id="ikd-monitor-status"></p><div id="ikd-monitor-buttons" style="display:flex;gap:6px;flex-wrap:wrap"></div><pre id="ikd-monitor-diag" style="white-space:pre-wrap;font-size:11px"></pre>';document.body.appendChild(panel);
 function paint(){const p=document.getElementById('ikd-monitor-status');if(p)p.textContent=`${state.status} · Berhasil ${state.success} · Gagal ${state.failed} · Lewat ${state.skipped}`;}
 function button(label,fn){const b=document.createElement('button');b.textContent=label;b.style.cssText='padding:6px;cursor:pointer';b.onclick=()=>Promise.resolve().then(fn).catch(e=>log(e.message));panel.querySelector('#ikd-monitor-buttons').appendChild(b);}
 button('Konfigurasi',()=>{const endpoint=prompt('URL Apps Script /exec',GM_getValue('ikd-endpoint',''));if(endpoint===null)return;const token=prompt('Token lokal (jangan commit atau bagikan)');if(token===null)return;if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint)||!token)throw Error('Konfigurasi tidak valid');GM_setValue('ikd-endpoint',endpoint);GM_setValue('ikd-token',token);});
 button('Mulai Otomatis',()=>run());button('Pause',()=>{epoch++;state.status='paused';save();});button('Resume',()=>run());button('Stop',()=>{epoch++;state.status='stopped';save();});
 button('Reset',()=>{if(!confirm('Reset antrean dan hasil lokal crawler?'))return;epoch++;state=fresh();save();});button('Kirim Halaman Ini',()=>run(true));
 button('Uji Pagination',async()=>{if(running)throw Error('Pause proses sebelum menguji pagination');const d=read(),b=nextButton(d.table);if(!b)throw Error('Tombol berikutnya tidak ditemukan');b.click();await waitChanged(d.fp,epoch);log('Uji pagination: isi tabel berubah.');});
 button('Diagnostik',()=>{panel.querySelector('#ikd-monitor-diag').textContent=JSON.stringify(diagnostics(),null,2);download('diagnostik-ikd.json',JSON.stringify(diagnostics(),null,2));});
 button('Ekspor JSON',()=>download('ikd-crawl.json',JSON.stringify({schemaVersion:1,records:Object.values(state.records)},null,2)));
 button('Ekspor CSV',()=>{const keys=['kind','npsn','name','level','parent','score','complete','valid','current','sourceUrl','crawledAt'];const quote=v=>'"'+String(v??'').replace(/^[=+@-]/,"'").replace(/"/g,'""')+'"';download('ikd-crawl.csv',[keys.join(','),...Object.values(state.records).map(r=>keys.map(k=>quote(r[k])).join(','))].join('\r\n'),'text/csv;charset=utf-8');});
 paint();if(state.status==='running')setTimeout(()=>run(),1600);
})();
