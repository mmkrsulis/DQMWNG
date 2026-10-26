(function(root){
  'use strict';
  function score(v){
    if(v===null||v===undefined||String(v).trim()==='')return null;
    const s=String(v).trim().replace(/%$/,'').replace(',','.');
    if(!/^\d+(\.\d+)?$/.test(s))return null;
    const n=Number(s);return Number.isFinite(n)&&n>=0&&n<=100?n:null;
  }
  const npsn=v=>/^[A-Z0-9]{8}$/i.test(String(v??'').trim())?String(v).trim().toUpperCase():null;
  function safeDqmURL(v){try{const u=new URL(v);return u.protocol==='https:'&&u.hostname==='kualitas.data.kemendikdasmen.go.id'&&/^\/sekolah\/[A-Za-z0-9-]+\/?$/.test(u.pathname)?u.href:null;}catch{return null}}
  function validateOfficial(v){return v&&['score','complete','valid','current'].every(k=>score(v[k])!==null)&&typeof v.at==='string'&&Number.isFinite(Date.parse(v.at))&&/^https:\/\/dapo\.kemendikdasmen\.go\.id\/ikd\//.test(v.url||'')}
  function authority(s,master={}){const m=master[s.n]||s;if(m.ministry==='Kemenag')return 'kemenag';const level=m.level||s.level;if(['SMA','SMK','SLB'].includes(level))return 'prov';if(['TK','KB','SPS','TPA','SD','SMP','PKBM','SKB'].includes(level))return 'kab';return 'unknown';}
  function ranking(schools,master,scope){const rows=Object.values(schools).filter(s=>authority(s,master)===scope&&score(s.score)!==null);return {count:rows.length,top:[...rows].sort((a,b)=>b.score-a.score||a.n.localeCompare(b.n)).slice(0,3),bottom:[...rows].sort((a,b)=>a.score-b.score||a.n.localeCompare(b.n)).slice(0,10)};}
  const api={score,npsn,safeDqmURL,validateOfficial,authority,ranking};
  if(typeof module!=='undefined')module.exports=api;else root.Monitor=api;
})(typeof window!=='undefined'?window:globalThis);
