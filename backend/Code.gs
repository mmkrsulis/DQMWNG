/** Existing monitoring workbook. Set WRITE_TOKEN in Script Properties before accepting writes. */
const BOOK_ID='1EPPk7Vq5dhnHvn-l7_yjH7HD1P5q4CmE7N3NQkKQ2IE';
const SCHOOL_HEADERS=['NPSN','Nama Sekolah','Jenjang','Kecamatan','Kelengkapan','Validitas','Kemutakhiran','Skor IKD','URL Sumber','Waktu Crawl','Kunci'];
const REGION_HEADERS=['Tipe','Wilayah','Induk','Peringkat','Kelengkapan','Validitas','Kemutakhiran','Skor IKD','URL Sumber','Waktu Crawl','Kunci'];
function percent(v){if(v===null||v===undefined||String(v).trim()==='')return null;const s=String(v).trim().replace(/%$/,'').replace(',','.');if(!/^\d+(\.\d+)?$/.test(s))return null;const n=Number(s);return n>=0&&n<=100?n:null;}
function sourceOK(u){return /^https:\/\/dapo\.kemendikdasmen\.go\.id\/ikd\//.test(u||'');}
function textCell(v){const s=String(v||'').trim();return /^[=+@-]/.test(s)?"'"+s:s;}
function validRecord(r){
 if(!r||!['school','region'].includes(r.kind)||!sourceOK(r.sourceUrl)||!Number.isFinite(Date.parse(r.crawledAt)))throw Error('Invalid record provenance');
 if(percent(r.score)===null)throw Error('Missing/invalid IKD score');
 for(const k of ['complete','valid','current'])if(r[k]!=null&&r[k]!==''&&percent(r[k])===null)throw Error('Invalid dimension');
 if(r.kind==='school'&&(!/^[A-Z0-9]{8}$/i.test(String(r.npsn))||!r.name))throw Error('Missing school identifier/name');
 if(r.kind==='region'&&(!r.name||!r.parent||!r.regionType))throw Error('Missing region identifier');
 if(r.kind==='region'&&(/semester|ganjil|genap/i.test(r.name)||/^\//.test(r.name)))throw Error('Period rows are not geographic regions');
 const key=r.kind==='school'?String(r.npsn).toUpperCase():[r.regionType,r.parent,r.name].map(x=>String(x).trim().toLowerCase()).join('|');
 const dim=k=>r[k]==null||r[k]===''?'':percent(r[k]).toFixed(2).replace('.',',')+'%';
 return {kind:r.kind,key,row:r.kind==='school'?[key,textCell(r.name),textCell(r.level),textCell(r.district),dim('complete'),dim('valid'),dim('current'),dim('score'),r.sourceUrl,r.crawledAt,key]:[textCell(r.regionType),textCell(r.name),textCell(r.parent),Number.isInteger(r.rank)&&r.rank>0?r.rank:'',dim('complete'),dim('valid'),dim('current'),dim('score'),r.sourceUrl,r.crawledAt,key]};
}
function json(value,callback){const body=JSON.stringify(value);if(callback){if(!/^ikdRead_\d+$/.test(callback))throw Error('Invalid callback');return ContentService.createTextOutput(callback+'('+body+');').setMimeType(ContentService.MimeType.JAVASCRIPT);}return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);}
function table(book,name,headers){let s=book.getSheetByName(name);if(!s){s=book.insertSheet(name);s.getRange(1,1,1,headers.length).setValues([headers]);}const actual=s.getRange(1,1,1,headers.length).getDisplayValues()[0];if(JSON.stringify(actual)!==JSON.stringify(headers))throw Error('Header mismatch: '+name);return s;}
function mergeRows(existing,records){
 const map=new Map();for(const row of existing){const key=String(row[10]||'');if(key&&(!map.has(key)||Date.parse(row[9])>=Date.parse(map.get(key)[9])))map.set(key,row);}
 for(const r of records){const old=map.get(r.key);if(old&&Date.parse(old[9])>Date.parse(r.row[9]))continue;const row=r.row.map((v,i)=>v===''&&old?old[i]:v);map.set(r.key,row);}
 return [...map.values()];
}
function doPost(e){
 const lock=LockService.getScriptLock();let locked=false;
 try{
  const payload=JSON.parse(e.postData.contents||'{}');const secret=PropertiesService.getScriptProperties().getProperty('WRITE_TOKEN');
  if(!secret||payload.token!==secret)return json({ok:false,error:'Unauthorized'});
  if(payload.schemaVersion!==1||!Array.isArray(payload.records)||!payload.records.length||payload.records.length>500)throw Error('Expected 1–500 records, schemaVersion 1');
  const normalized=payload.records.map(validRecord);lock.waitLock(20000);locked=true;
  const book=SpreadsheetApp.openById(BOOK_ID);
  for(const kind of ['school','region']){const records=normalized.filter(r=>r.kind===kind);if(!records.length)continue;
   const sheet=table(book,kind==='school'?'IKD RESMI SEKOLAH':'IKD RESMI WILAYAH',kind==='school'?SCHOOL_HEADERS:REGION_HEADERS);
   const old=sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,11).getDisplayValues():[];
   const merged=mergeRows(old,records);if(merged.length+1>sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),merged.length+1-sheet.getMaxRows());
   // Text format preserves identifiers and prevents formula interpretation.
   sheet.getRange(2,1,merged.length,11).setNumberFormat('@').setValues(merged);
   if(old.length>merged.length)sheet.getRange(merged.length+2,1,old.length-merged.length,11).clearContent();
  }
  SpreadsheetApp.flush();
  let log=book.getSheetByName('LOG IKD API');if(!log){log=book.insertSheet('LOG IKD API');log.appendRow(['Waktu','Status','Jumlah']);}log.appendRow([new Date().toISOString(),'OK',normalized.length]);
  return json({ok:true,accepted:normalized.length});
 }catch(err){console.error('IKD write failed: '+String(err.message).slice(0,200));return json({ok:false,error:String(err.message).slice(0,200),retryable:/quota|lock|timeout|too many|service invoked/i.test(err.message)});}
 finally{if(locked)lock.releaseLock();}
}
function doGet(e){
 const p=e?.parameter||{};
 try{
  const book=SpreadsheetApp.openById(BOOK_ID);const sheet=book.getSheetByName('IKD RESMI WILAYAH');
  const rows=sheet&&sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,11).getDisplayValues():[];
  const r=rows.filter(r=>r[0]==='Kabupaten'&&r[1]==='Kab. Wonogiri').sort((a,b)=>Date.parse(b[9])-Date.parse(a[9]))[0];
  const official=r?{score:percent(r[7]),complete:percent(r[4]),valid:percent(r[5]),current:percent(r[6]),rank:percent(r[3]),at:r[9],url:r[8]}:null;
  if(p.action==='school'||p.action==='priority'){
   const s=book.getSheetByName('IKD RESMI SEKOLAH');let data=s&&s.getLastRow()>1?s.getRange(2,1,s.getLastRow()-1,11).getDisplayValues():[];
   if(p.action==='school'){if(!/^[A-Z0-9]{8}$/i.test(p.npsn||''))throw Error('Invalid NPSN');data=data.filter(r=>r[0].toUpperCase()===p.npsn.toUpperCase());}
   else data=data.filter(r=>r[2]==='SD'&&percent(r[7])!==null).sort((a,b)=>percent(a[7])-percent(b[7])).slice(0,50);
   return json({ok:true,metric:'IKD',rows:data.map(r=>({n:r[0],name:r[1],level:r[2],district:r[3],complete:percent(r[4]),valid:percent(r[5]),current:percent(r[6]),score:percent(r[7]),url:r[8],at:r[9]}))},p.callback);
  }
  if(p.action&&p.action!=='snapshot')throw Error('Unknown action');
  return json({ok:!!official,official,error:official?null:'IKD wilayah belum tersedia'},p.callback);
 }catch(err){return json({ok:false,error:String(err.message).slice(0,200)},/^ikdRead_\d+$/.test(p.callback||'')?p.callback:null);}
}
