'use strict';
const countyIKD=Object.values(monitoring.schools).filter(s=>Monitor.authority(s,monitoring.master)==='kab');
const countyDQM=S.filter(s=>Monitor.authority(s,monitoring.master)==='kab');
const countyGroups=['PAUD','SD','SMP','Nonformal'];
const groupRows=(rows,group)=>group==='all'?rows:rows.filter(s=>Monitor.group(s,monitoring.master)===group);
const valueText=(n,d=2)=>n===null?'Belum tersedia':dec(n,d);
const districtOf=s=>String(monitoring.master[s.n]?.district||s.district||'').replace(/^Kec\.\s*/i,'').trim();
const themeButton=el('theme-toggle');
const themeNotice=document.createElement('div');themeNotice.className='theme-notice';themeNotice.setAttribute('role','status');document.body.append(themeNotice);let themeNoticeTimer;
function applyTheme(theme){
 document.documentElement.dataset.theme=theme;
 const dark=theme==='dark',label=dark?'Aktifkan tema terang':'Aktifkan tema gelap';
 themeButton.innerHTML=dark?'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="#ffbf36"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" stroke="#ffbf36" stroke-width="2" stroke-linecap="round"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z" fill="#6554d9"/><path d="M18 3v4m-2-2h4" stroke="#e89a13" stroke-width="1.7" stroke-linecap="round"/></svg>';
 themeButton.setAttribute('aria-label',label);themeButton.title=label;themeButton.dataset.tooltip=label;themeButton.setAttribute('aria-pressed',String(dark));
 try{localStorage.setItem('wonogiri-theme',theme);}catch{}
}
applyTheme(document.documentElement.dataset.theme||'light');
themeButton.onclick=()=>{const next=document.documentElement.dataset.theme==='dark'?'light':'dark';applyTheme(next);themeNotice.textContent=next==='dark'?'Tema gelap aktif':'Tema terang aktif';themeNotice.classList.add('visible');clearTimeout(themeNoticeTimer);themeNoticeTimer=setTimeout(()=>themeNotice.classList.remove('visible'),1800);};
if(el('cover-county-score'))el('cover-county-score').textContent=valueText(Monitor.mean(countyDQM,'score'));
const measuredDqm=new Set(countyDQM.map(s=>s.n));const both=countyIKD.filter(s=>measuredDqm.has(s.n)).length;
el('county-coverage').innerHTML=[['IKD sekolah',fmt(countyIKD.length),'26 Oktober 2026'],['DQM sekolah',fmt(countyDQM.length),'22–23 Oktober 2026'],['Rerata DQM',valueText(Monitor.mean(countyDQM,'score')),'Skala 0–100'],['Sekolah dengan indikator DQM gagal',fmt(countyDQM.filter(s=>s.fail>0).length),'Sedikitnya satu indikator gagal']].map(([label,v,note])=>`<article><span>${label}</span><strong>${v}</strong><small>${note}</small></article>`).join('');
el('county-overlap').textContent=`${fmt(both)} sekolah kabupaten tercatat dalam data IKD dan DQM. Jumlah sekolah pada setiap sumber dapat berbeda.`;
const groupSummary=countyGroups.map(name=>{const rows=groupRows(countyIKD,name);return {name,rows,count:rows.length,score:Monitor.mean(rows,'score'),complete:Monitor.mean(rows,'complete'),valid:Monitor.mean(rows,'valid'),current:Monitor.mean(rows,'current')}});
el('county-level-table').innerHTML=groupSummary.map(r=>`<tr><td><b>${r.name}</b></td><td class="num">${fmt(r.count)}</td>${['score','complete','valid','current'].map(k=>`<td class="num">${valueText(r[k])}${r[k]===null?'':'%'}</td>`).join('')}</tr>`).join('');
bars(groupSummary.filter(r=>r.score!==null).map(r=>({label:r.name,value:r.score,count:r.count})),'county-level-bars',{max:100,decimals:true});
const weakest=[...groupSummary].filter(r=>r.score!==null).sort((a,b)=>a.score-b.score)[0];
el('county-level-insight').textContent=weakest?`${weakest.name} memiliki rerata IKD sekolah terendah pada data 26 Oktober 2026: ${dec(weakest.score,2)}%, dari ${fmt(weakest.count)} sekolah. Pilih jenjang ini pada daftar peringkat, lalu periksa komponen IKD setiap sekolah.`:'Belum ada pengukuran IKD sekolah kabupaten.';
function renderCountyDistrict(){const group=el('county-district-group').value;const ik=groupRows(countyIKD,group),dq=groupRows(countyDQM,group);const names=[...new Set(ik.map(districtOf).filter(Boolean))];const rows=names.map(name=>{const a=ik.filter(s=>districtOf(s)===name),b=dq.filter(s=>districtOf(s)===name);return {name,ik:Monitor.mean(a,'score'),dqm:Monitor.mean(b,'score'),ni:a.length,nd:b.length,fail:b.filter(s=>s.fail>0).length}}).filter(r=>r.ik!==null).sort((a,b)=>a.ik-b.ik||a.name.localeCompare(b.name)).slice(0,10);el('county-district-table').innerHTML=rows.length?rows.map(r=>`<tr><td><b>${esc(r.name)}</b></td><td class="num">${fmt(r.ni)}</td><td class="num">${valueText(r.ik)}%</td><td class="num">${fmt(r.nd)}</td><td class="num">${valueText(r.dqm)}</td><td class="num">${fmt(r.fail)}</td></tr>`).join(''):'<tr><td colspan="6">Belum tersedia pada kelompok ini.</td></tr>';}
el('county-district-group').onchange=renderCountyDistrict;renderCountyDistrict();
function renderCountyIssues(){const group=el('county-issue-group').value,rows=groupRows(countyDQM,group);const issues=IND.map((ind,i)=>({...ind,fail:rows.filter(s=>s.status[i]==='F').length,evaluated:rows.filter(s=>s.status[i]==='F'||s.status[i]==='P').length})).filter(r=>r.fail>0).sort((a,b)=>b.fail-a.fail||a.title.localeCompare(b.title)).slice(0,6);el('county-issue-count').textContent=`${fmt(rows.length)} sekolah DQM · ${group==='all'?'seluruh naungan kabupaten':group}`;el('county-issues').innerHTML=issues.length?issues.map(r=>`<article><div><strong>${fmt(r.fail)}</strong><small>sekolah gagal</small></div><div><h3>${esc(r.title)}</h3><p>${fmt(r.fail)} dari ${fmt(r.evaluated)} sekolah dievaluasi (${dec(100*r.fail/r.evaluated,1)}%)</p></div><p><b>${esc(r.app||'Aplikasi sumber')}</b><br/>${esc(r.action||'Periksa rincian indikator pada sumber resmi.')}</p></article>`).join(''):'<div class="report-panel">Tidak ada indikator gagal pada data kelompok ini; indikator belum dievaluasi tetap perlu dipantau.</div>';}
el('county-issue-group').onchange=renderCountyIssues;renderCountyIssues();
el('brief-authority-table').innerHTML=[['kab','Kabupaten · fokus pembinaan'],['prov','Provinsi'],['kemenag','Kemenag']].map(([scope,label])=>{const ik=Object.values(monitoring.schools).filter(s=>Monitor.authority(s,monitoring.master)===scope),dq=S.filter(s=>Monitor.authority(s,monitoring.master)===scope);const a=Monitor.mean(ik,'score');return `<tr><td><b>${label}</b></td><td class="num">${fmt(ik.length)}</td><td class="num">${valueText(a)}${a===null?'':'%'}</td><td class="num">${fmt(dq.length)}</td><td class="num">${valueText(Monitor.mean(dq,'score'))}</td></tr>`}).join('');
function renderCountyRank(){const group=el('county-ranking-group').value;const rows=groupRows(countyIKD,group);const ranks=Monitor.ranking(Object.fromEntries(rows.map(s=>[s.n,s])),monitoring.master,'kab');el('rank-count-kab').textContent=`${fmt(ranks.count)} sekolah · ${group==='all'?'seluruh naungan kabupaten':group}`;el('rank-top-kab').innerHTML=ranks.top.length?ranks.top.map((s,i)=>`<button class="card ranking-school" data-npsn="${esc(s.n)}"><span class="ranking-position">${i+1}</span><span><b>${esc(s.name)}</b><small>${esc(s.n)} · ${esc(monitoring.master[s.n]?.level||s.level)}</small></span><strong>${dec(s.score,2)}<small>%</small></strong></button>`).join(''):'<div class="report-panel">Belum tersedia.</div>';el('rank-bottom-kab').innerHTML=ranks.bottom.length?ranks.bottom.map((s,i)=>`<tr class="clickable" data-npsn="${esc(s.n)}"><td>${i+1}</td><td class="rowname"><b>${esc(s.name)}</b><small>${esc(s.n)}</small></td><td>${esc(monitoring.master[s.n]?.level||s.level)}</td><td class="num"><b>${dec(s.score,2)}%</b></td></tr>`).join(''):'<tr><td colspan="4">Belum tersedia.</td></tr>';document.querySelector('[data-ikd-scope="kab"]').querySelectorAll('[data-npsn]').forEach(row=>row.onclick=()=>openSchool(CLINIC_BY_NPSN.get(row.dataset.npsn)||monitoring.schools[row.dataset.npsn]));}
el('county-ranking-group').onchange=renderCountyRank;renderCountyRank();
// Two explicit destinations with the selected school's identity visible beside each link.
const clinicSlide=el('clinic-search').closest('.slide');
const results=document.createElement('div');results.id='clinic-results';results.className='profile-results';results.setAttribute('aria-live','polite');el('clinic-search').closest('.clinic-hero').after(results);
const clinicSide=clinicSlide.querySelector('.clinic-hero>.card');if(clinicSide)clinicSide.innerHTML='<h3>Profil sekolah dan hasil evaluasi</h3><p><b>Profil Dapodik</b><br/>Identitas, rombel, peserta didik, PTK dan sarana prasarana sesuai sumber.</p><p><b>Profil DQM</b><br/>Skor, dimensi dan indikator kualitas data sekolah.</p><p class="source-notice">Pilih sekolah dari hasil pencarian. Nama dan NPSN tetap terlihat sebelum membuka sumber.</p>';
function profileRows(q){const rows=search(q);results.innerHTML=q.trim()?rows.length?rows.map(s=>{const dp=dapodikProfileURL(s.n),dq=Monitor.safeDqmURL(s.url);return `<article class="profile-result"><div><h3>${esc(s.name)}</h3><small>${esc(s.n)} · ${esc(s.level)} · ${esc(s.district||'Kecamatan belum tersedia')}</small></div><div class="profile-actions"><button class="btn" data-detail="${esc(s.n)}">Lihat IKD & DQM</button>${dp?`<a class="btn primary" href="${esc(dp)}" target="_blank" rel="noopener noreferrer">Profil Dapodik ↗</a>`:'<span class="source-notice">Profil Dapodik belum tersedia</span>'}${dq?`<a class="btn" href="${esc(dq)}" target="_blank" rel="noopener noreferrer">Profil DQM ↗</a>`:'<span class="source-notice">Profil DQM belum tersedia</span>'}</div></article>`}).join(''):'<article class="profile-result">Sekolah tidak ditemukan. Periksa NPSN atau nama sekolah.</article>':'';results.querySelectorAll('[data-detail]').forEach(b=>b.onclick=()=>openSchool(CLINIC_BY_NPSN.get(b.dataset.detail)));return rows;}
doClinic=function(){profileRows(el('clinic-search').value);};el('clinic-search-btn').onclick=doClinic;el('clinic-search').addEventListener('input',e=>profileRows(e.target.value));
const sourceButton=document.createElement('button');sourceButton.className='btn';sourceButton.id='clinic-dqm-btn';sourceButton.textContent='Profil DQM ↗';el('clinic-dapodik-btn').after(sourceButton);
function openSource(kind){const rows=profileRows(el('clinic-search').value);if(rows.length!==1){results.scrollIntoView({block:'nearest',behavior:'smooth'});return;}const s=rows[0];const url=kind==='dapodik'?dapodikProfileURL(s.n):Monitor.safeDqmURL(s.url);if(url)window.open(url,'_blank','noopener,noreferrer');}
el('clinic-dapodik-btn').textContent='Profil Dapodik ↗';el('clinic-dapodik-btn').onclick=()=>openSource('dapodik');el('clinic-dqm-btn').onclick=()=>openSource('dqm');
el('modal-official').textContent='Profil & indikator DQM ↗';el('modal-dapodik').textContent='Profil sekolah Dapodik ↗';
const sourceLinks=el('modal-official').closest('.official-links');if(sourceLinks)el('modal-meta').after(sourceLinks);
el('top-search').placeholder='Nama sekolah / NPSN';
const schoolOverview=document.querySelector('.slide[data-label="IKD sekolah"]');
if(schoolOverview){schoolOverview.querySelector('.slide-sub').textContent=`${fmt(countyIKD.length)} sekolah naungan kabupaten memiliki IKD resmi. Cakupan DQM kabupaten: ${fmt(countyDQM.length)} sekolah.`;const cards=schoolOverview.querySelectorAll('.grid.cols3>.card');cards[0].querySelector('.kpi').textContent=fmt(countyIKD.length);cards[0].querySelector('.kpi-label').textContent='Sekolah IKD naungan kabupaten';cards[1].querySelector('.kpi').textContent=fmt(Object.values(monitoring.master).filter(s=>Monitor.authority(s,monitoring.master)==='kab').length);cards[1].querySelector('.kpi-label').textContent='Sekolah dalam referensi kabupaten';}
// Consistent vector icons and section colors for the presentation.
const slideSymbols={
 trophy:'<path d="M7 3h10v5c0 4-2 6-5 6S7 12 7 8V3Z" fill="currentColor" stroke="none"/><path d="M7 5H3v3c0 3 2 4 5 4m9-7h4v3c0 3-2 4-5 4M12 14v5m-5 2h10m-8-2h6"/>',
 chart:'<path d="M4 3v17h17M8 16v-5m5 5V7m5 9V4"/>',
 school:'<path d="m3 10 9-7 9 7M5 9v12h14V9M10 21v-7h4v7M9 9h6"/>',
 check:'<rect x="4" y="3" width="16" height="18" rx="3"/><path d="m8 12 3 3 5-6"/>',
 search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
 people:'<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-17a3 3 0 0 1 0 6m2 5a5 5 0 0 1 3 4v2"/>',
 book:'<path d="M12 5v16M3 3c4-1 6 0 9 2 3-2 5-3 9-2v16c-4-1-6 0-9 2-3-2-5-3-9-2V3Z"/>'
};
function reportIcon(name){return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${slideSymbols[name]}</svg>`;}
document.querySelectorAll('.slide').forEach(slide=>{const label=slide.dataset.label;let type='book',tone='teal';if(/IKD/.test(label)){type='chart';tone='teal'}if(/DQM|dimensi|Fokus SD|Masalah|Kecamatan$|50 SD|Cara membaca/.test(label)){type='chart';tone='blue'}if(/Residu|residu|ATS|NUPTK/.test(label)){type='people';tone='amber'}if(/Praktik|Rencana|Checklist|Aplikasi/.test(label)){type='check';tone='violet'}if(/Klinik|Diskusi/.test(label)){type='search';tone='violet'}if(label==='Mengapa data penting')type='school';if(label==='Capaian IKD Jawa Tengah')type='trophy';slide.dataset.tone=tone;const eyebrow=slide.querySelector('.slide-header .eyebrow');if(eyebrow){const icon=document.createElement('span');icon.className='section-symbol';icon.innerHTML=reportIcon(type);eyebrow.prepend(icon);}});
const achievement=document.querySelector('.ikd-achievement');if(achievement){achievement.querySelector('span').innerHTML=reportIcon('trophy');const trophy=document.createElement('div');trophy.className='achievement-trophy';trophy.innerHTML=reportIcon('trophy');trophy.setAttribute('aria-hidden','true');achievement.closest('.ikd-official-hero').append(trophy);}

/* FOOTER_PDF_PRINT_EXPORT */
(function(){
  const root = document.documentElement, origTitle = document.title;
  let prevTheme = null;
  function showPdfToast(msg){
    let t = document.getElementById("pdf-export-toast");
    if(!t){ t = document.createElement("div"); t.id = "pdf-export-toast"; t.className = "pdf-export-toast"; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show"); clearTimeout(t._tm);
    t._tm = setTimeout(() => t.classList.remove("show"), 4500);
  }
  function injectPrintStyle(){
    let st = document.getElementById("dqmwng-print-style");
    if(!st){
      st = document.createElement("style");
      st.id = "dqmwng-print-style";
      st.textContent = `
        @media print {
          @page { size: A4 landscape; margin: 6mm 8mm; }
          html.printing-deck, html.printing-deck body {
            font-size: 13.5px !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            overflow: visible !important;
            background: #ffffff !important;
            color: #132538 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          html.printing-deck .topbar,
          html.printing-deck .footer,
          html.printing-deck .modal,
          html.printing-deck .suggestions,
          html.printing-deck #filter-popover,
          html.printing-deck #chrome-peek,
          html.printing-deck .speaker-panel,
          html.printing-deck .btn-speaker,
          html.printing-deck .slide-jump-drawer,
          html.printing-deck .pdf-export-toast {
            display: none !important;
          }
          html.printing-deck .stage {
            position: static !important;
            inset: auto !important;
            display: block !important;
            height: auto !important;
            max-height: none !important;
            overflow: visible !important;
          }
          html.printing-deck .slide,
          html.printing-deck .slide.active {
            position: static !important;
            inset: auto !important;
            display: flex !important;
            flex-direction: column !important;
            visibility: visible !important;
            opacity: 1 !important;
            transform: none !important;
            animation: none !important;
            overflow: visible !important;
            width: 100% !important;
            height: auto !important;
            min-height: 185mm !important;
            max-height: none !important;
            padding: 8mm 10mm !important;
            margin: 0 !important;
            box-sizing: border-box !important;
            page-break-after: always !important;
            break-after: page !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          html.printing-deck .slide:last-of-type {
            page-break-after: auto !important;
            break-after: auto !important;
          }
          html.printing-deck .slide-inner {
            max-width: 100% !important;
            margin: auto 0 !important;
          }
          html.printing-deck .ikd-official-score strong {
            background: none !important;
            -webkit-text-fill-color: var(--teal, #0f766e) !important;
            color: var(--teal, #0f766e) !important;
          }
          html.printing-deck .barfill {
            width: var(--target) !important;
            animation: none !important;
          }
          html.printing-deck .tablewrap,
          html.printing-deck .report-table,
          html.printing-deck .ranking-table {
            max-height: none !important;
            overflow: visible !important;
          }
        }
      `;
      document.head.appendChild(st);
    }
  }
  function prepExport(){
    injectPrintStyle();
    root.classList.add("printing-deck");
    prevTheme = root.dataset.theme || "light";
    root.dataset.theme = "light";
    const lv = document.getElementById("level-filter")?.value || "all";
    document.title = "Materi_IKD_DQM_Wonogiri" + (lv !== "all" ? "_" + lv : "") + "_Semua_Slide";
    document.querySelectorAll(".barfill").forEach(b => {
      const v = b.style.getPropertyValue("--target");
      if(v) b.style.width = v;
    });
  }
  function restoreExport(){
    root.classList.remove("printing-deck");
    document.getElementById("dqmwng-print-style")?.remove();
    document.title = origTitle;
    if(prevTheme){ root.dataset.theme = prevTheme; prevTheme = null; }
  }
  window.addEventListener("beforeprint", prepExport);
  window.addEventListener("afterprint", restoreExport);
  function runExport(pdf){
    prepExport();
    if(pdf) showPdfToast("Pilih Save as PDF pada jendela cetak untuk mengunduh semua 40 slide.");
    setTimeout(() => window.print(), pdf ? 200 : 50);
  }
  document.getElementById("export-pdf")?.addEventListener("click", () => runExport(true));
  document.getElementById("print-slides")?.addEventListener("click", () => runExport(false));
  document.addEventListener("keydown", e => {
    const tag = (e.target?.tagName || "").toLowerCase();
    const typing = tag === "input" || tag === "textarea" || tag === "select" || e.target?.isContentEditable;
    if(!typing && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === "p"){ e.preventDefault(); runExport(true); }
  });
})();
/* HERO_INDEPTH_SEARCH_CLEAN */
(function(){
  const ENTITIES = [
    ["sekolah","Sekolah","Periksa profil kelembagaan, SK pendirian/operasional, sanitasi, dan koordinat lintang-bujur pada menu Sekolah Dapodik."],
    ["tanah","Tanah","Lengkapi sertifikat tanah, nomor sertifikat, luas lahan, NJOP, dan kepemilikan pada menu Sarpras > Tanah."],
    ["bangunan","Bangunan","Pastikan data luas tapak, kondisi bangunan, tahun bangun, dan IMB/PBG terisi valid di menu Sarpras > Bangunan."],
    ["ruang","Ruang","Perbarui kondisi kerusakan ruang (atap, dinding, lantai, kusen) serta ukuran ruang kelas/penunjang di Sarpras > Ruang."],
    ["ptk","PTK","Lakukan pemadanan NIK/NUPTK di VervalPTK serta mutakhirkan riwayat pendidikan, kepangkatan, dan tugas tambahan guru/tendik."],
    ["pd","Peserta Didik","Tuntaskan residu NISN, NIK, nama ibu kandung, dan tanggal lahir di VervalPD serta lengkapi data periodik tinggi/berat badan & jarak tempuh."],
    ["rombel","Rombongan Belajar","Pastikan seluruh peserta didik masuk rombel aktif, wali kelas terisi, dan pembelajaran/jadwal mengajar sinkron dengan kurikulum."]
  ];
  function scoreClass(v){
    if(v===null||v===undefined||Number.isNaN(Number(v))) return "";
    return Number(v)>=98?"ok":(Number(v)>=85?"warn":"bad");
  }
  function fmtPct(v){
    if(v===null||v===undefined||Number.isNaN(Number(v))) return "-";
    return Number(v).toLocaleString("id-ID",{minimumFractionDigits:2,maximumFractionDigits:2})+"%";
  }
  function resolveSchoolRecord(q){
    const raw=String(q||"").trim();
    if(!raw) return null;
    const u=raw.toUpperCase();
    if(typeof CLINIC_BY_NPSN!=="undefined"&&CLINIC_BY_NPSN.has(u)) return CLINIC_BY_NPSN.get(u);
    const mon=window.MONITOR_SNAPSHOT||{};
    if(mon.schools&&mon.schools[u]) return mon.schools[u];
    if(mon.master&&mon.master[u]) return mon.master[u];
    if(typeof search==="function"){
      const h=search(raw);
      if(h&&h.length) return h[0];
    }
    return null;
  }
  function renderInDepthSections(npsn){
    const modalBox=document.querySelector("#school-modal .modal-box");
    if(!modalBox) return;
    document.getElementById("indepth-7entity-wrap")?.remove();
    const mon=window.MONITOR_SNAPSHOT||{};
    const allDetails=window.ikdDetails||mon.ikdDetails||{};
    const ikdDetail=allDetails[npsn]||allDetails[String(Number(npsn))]||null;
    const ikdSummary=(mon.schools&&mon.schools[npsn])||null;
    const residuRows=(mon.residu&&Array.isArray(mon.residu.records))
      ?mon.residu.records.filter(r=>String(r.npsn||r.n||"").trim().toUpperCase()===npsn):[];
    const remedies=[];
    if(ikdDetail){
      for(const [key,label,guide] of ENTITIES){
        const k=ikdDetail.kelengkapan?.[key],v=ikdDetail.validitas?.[key],m=ikdDetail.mutakhir?.[key],t=ikdDetail.total?.[key];
        const dims=[k,v,m].filter(x=>typeof x==="number");
        const low=dims.length?Math.min(...dims):t;
        if(typeof low==="number"&&low<98){
          const w=[];
          if(typeof k==="number"&&k<98) w.push("Kelengkapan "+fmtPct(k));
          if(typeof v==="number"&&v<98) w.push("Validitas "+fmtPct(v));
          if(typeof m==="number"&&m<98) w.push("Kemutakhiran "+fmtPct(m));
          remedies.push({score:low,title:"Prioritas Entitas "+label+" ("+(w.join(" | ")||"Skor "+fmtPct(t))+")",desc:guide});
        }
      }
      remedies.sort((a,b)=>a.score-b.score);
    } else if(ikdSummary){
      if((ikdSummary.complete??100)<98) remedies.push({score:ikdSummary.complete,title:"Tingkatkan Kelengkapan Data ("+fmtPct(ikdSummary.complete)+")",desc:"Isi seluruh atribut wajib pada entitas Sekolah, Sarpras, PTK, Peserta Didik, dan Rombel."});
      if((ikdSummary.valid??100)<98) remedies.push({score:ikdSummary.valid,title:"Perbaiki Validitas Data ("+fmtPct(ikdSummary.valid)+")",desc:"Padankan NIK/NISN di VervalPD & VervalPTK serta cek anomali isian Dapodik."});
      if((ikdSummary.current??100)<98) remedies.push({score:ikdSummary.current,title:"Mutakhirkan Data Semester ("+fmtPct(ikdSummary.current)+")",desc:"Perbarui data periodik peserta didik & kondisi sarpras semester berjalan."});
    }
    if(residuRows.length){
      remedies.unshift({score:0,title:"Tuntaskan Residu VervalPD ("+residuRows.length+" catatan)",desc:"Buka vervalpd.data.kemdikdasmen.go.id untuk memadankan identitas peserta didik residu."});
    }
    const wrap=document.createElement("div");
    wrap.id="indepth-7entity-wrap";
    wrap.style.cssText="margin-top:16px;padding:18px;border-radius:16px;border:1px solid #bdd3e3;background:var(--card,#f7fbff)";
    const rowsHtml=ENTITIES.map(([key,label])=>{
      const k=ikdDetail?.kelengkapan?.[key],v=ikdDetail?.validitas?.[key],m=ikdDetail?.mutakhir?.[key],t=ikdDetail?.total?.[key];
      return "<tr><td style='padding:8px;text-align:left;font-weight:700'>"+label+"</td>"
        +"<td style='padding:8px;text-align:right'><span class='indepth-score "+scoreClass(k)+"'>"+fmtPct(k)+"</span></td>"
        +"<td style='padding:8px;text-align:right'><span class='indepth-score "+scoreClass(v)+"'>"+fmtPct(v)+"</span></td>"
        +"<td style='padding:8px;text-align:right'><span class='indepth-score "+scoreClass(m)+"'>"+fmtPct(m)+"</span></td>"
        +"<td style='padding:8px;text-align:right'><span class='indepth-score "+scoreClass(t)+"'>"+fmtPct(t)+"</span></td></tr>";
    }).join("");
    const matrixHtml=ikdDetail
      ?"<div style='overflow-x:auto;margin-top:8px'><table style='width:100%;border-collapse:collapse;font-size:.82rem'><thead><tr><th style='text-align:left;padding:8px'>Entitas Dapodik</th><th style='text-align:right;padding:8px'>Kelengkapan</th><th style='text-align:right;padding:8px'>Validitas</th><th style='text-align:right;padding:8px'>Kemutakhiran</th><th style='text-align:right;padding:8px'>Total</th></tr></thead><tbody>"+rowsHtml+"</tbody></table></div>"
      :"<p class='note'>Rincian 7 entitas belum tersedia di snapshot untuk sekolah ini.</p>";
    const remedyHtml=remedies.length
      ?"<div style='display:grid;gap:10px;margin-top:10px'>"+remedies.map(r=>"<div style='padding:12px;border-radius:12px;border:1px solid #c6d9e7'><strong style='display:block;font-size:.88rem;margin-bottom:4px'>"+r.title+"</strong><p style='margin:0;font-size:.81rem'>"+r.desc+"</p></div>").join("")+"</div>"
      :"<div class='insight' style='margin-top:10px'>Seluruh dimensi IKD sekolah ini sudah optimal (>= 98%).</div>";
    wrap.innerHTML="<div style='display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap'><div><span class='eyebrow'>Analisis In-Depth IKD</span><h3 style='margin:0;font-size:1.05rem'>Matriks 3 Dimensi x 7 Entitas Dapodik</h3></div><button type='button' class='btn tinybtn' id='indepth-copy-link'>Salin Link Sekolah</button></div>"+matrixHtml+"<div style='margin-top:14px'><span class='eyebrow'>Rekomendasi Tindak Lanjut</span>"+remedyHtml+"</div>";
    const anchor=document.getElementById("clinic-extra")||document.getElementById("modal-metrics");
    if(anchor) anchor.after(wrap); else modalBox.appendChild(wrap);
    document.getElementById("indepth-copy-link")?.addEventListener("click",async()=>{
      try{await navigator.clipboard.writeText(window.location.href);document.getElementById("indepth-copy-link").textContent="Tautan Tersalin";}catch{}
    });
  }
  function openInDepthByCode(q){
    const rec=resolveSchoolRecord(q);
    if(!rec) return false;
    const npsn=String(rec.n||rec.npsn||"").trim().toUpperCase();
    try{const u=new URL(window.location.href);if(npsn)u.searchParams.set("npsn",npsn);window.history.replaceState({},'',u.toString());}catch{}
    if(typeof openSchool==="function") openSchool(rec);
    setTimeout(()=>renderInDepthSections(npsn),30);
    return true;
  }
  const input=document.getElementById("hero-npsn-input");
  const btn=document.getElementById("hero-npsn-btn");
  const sug=document.getElementById("hero-npsn-suggestions");
  function renderSuggestions(q){
    if(!sug) return;
    const text=String(q||"").trim();
    if(!text||typeof search!=="function"){sug.classList.remove("open");sug.innerHTML="";return;}
    const items=search(text).slice(0,7);
    if(!items.length){sug.innerHTML="<div class='suggestion'><b>Sekolah tidak ditemukan</b><span>Periksa kembali 8 digit NPSN atau nama sekolah.</span></div>";sug.classList.add("open");return;}
    sug.innerHTML=items.map(s=>{
      const code=String(s.n||s.npsn||"").toUpperCase();
      const ikd=window.MONITOR_SNAPSHOT?.schools?.[code]?.score;
      const badge=typeof ikd==="number"?" | IKD "+ikd.toFixed(2)+"%":"";
      return "<div class='suggestion' data-npsn='"+code+"'><b>"+(s.name||code)+"</b><span>NPSN "+code+" | "+(s.level||"")+" | "+(s.district||"Wonogiri")+badge+"</span></div>";
    }).join("");
    sug.classList.add("open");
    sug.querySelectorAll("[data-npsn]").forEach(el=>{
      el.addEventListener("click",()=>{
        const code=el.dataset.npsn;
        if(input) input.value=code;
        sug.classList.remove("open");
        openInDepthByCode(code);
      });
    });
  }
  input?.addEventListener("input",e=>renderSuggestions(e.target.value));
  input?.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();sug?.classList.remove("open");openInDepthByCode(input.value);}});
  btn?.addEventListener("click",()=>{sug?.classList.remove("open");openInDepthByCode(input?.value);});
  document.addEventListener("click",e=>{if(sug&&!e.target.closest("#hero-npsn-box"))sug.classList.remove("open");});
  const modalEl=document.getElementById("school-modal");
  if(modalEl){
    const re=new RegExp("\\b([A-Z0-9]{8})\\b");
    new MutationObserver(()=>{
      if(modalEl.classList.contains("open")){
        const m=(document.getElementById("modal-meta")?.textContent||"").match(re);
        if(m&&!document.getElementById("indepth-7entity-wrap")) renderInDepthSections(m[1]);
      }
    }).observe(modalEl,{attributes:true,attributeFilter:["class"]});
  }
  window.addEventListener("DOMContentLoaded",()=>{
    try{const p=new URL(window.location.href).searchParams.get("npsn");if(p)setTimeout(()=>openInDepthByCode(p),150);}catch{}
  });
})();