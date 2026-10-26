const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
const crawler=fs.readFileSync('crawler/ikd.user.js','utf8');
const url='https://dapo.kemendikdasmen.go.id/ikd/Prov.%20Jawa%20Tengah/Kab.%20Wonogiri';
async function fixture(browser,mode){
 const context=await browser.newContext();const page=await context.newPage();
 await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><table><thead><tr><th>NPSN</th><th>Nama Sekolah</th><th>Jenjang</th><th>Skor IKD</th><th>Kelengkapan</th><th>Validitas</th><th>Kemutakhiran</th></tr></thead><tbody></tbody></table><nav class="pagination"><button class="active" aria-current="page">1</button><button id="next">${mode==='numeric'?'2':'Next'}</button></nav>`}));
 await page.goto(url);
 await page.evaluate(mode=>{
  window.mode=mode;window.pageNumber=1;window.calls=0;
  window.GM_getValue=(k,f)=>{const raw=localStorage.getItem(k);return raw===null?f:JSON.parse(raw)};
  window.GM_setValue=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
  GM_setValue('ikd-endpoint','https://script.google.com/macros/s/fixture/exec');GM_setValue('ikd-token','fixture-only-not-a-secret');
  window.GM_xmlhttpRequest=o=>{calls++;setTimeout(()=>{if(mode==='retry'&&calls===1)o.onerror();else o.onload({status:200,responseText:JSON.stringify({ok:true})});},mode==='stop'?600:20)};
  window.draw=()=>{document.querySelector('tbody').innerHTML=mode==='empty'?'':`<tr><td>${pageNumber===1?'01234567':'01234568'}</td><td>Sekolah ${pageNumber}</td><td>SD</td><td>85,00%</td><td>90%</td><td>85%</td><td>80%</td></tr>`;document.querySelector('[aria-current]').textContent=pageNumber;};draw();
  document.getElementById('next').onclick=()=>{if(mode==='stuck')return;if(mode==='url'){location.assign('?page=2');return;}setTimeout(()=>{pageNumber=mode==='loop'&&pageNumber===2?1:pageNumber+1;draw();if(mode!=='loop')document.getElementById('next').disabled=true;},200)};
 },mode);
 await page.addScriptTag({content:crawler});return {context,page};
}
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});const results=[];
 for(const mode of ['ajax','numeric','retry','empty','stop','loop','stuck']){
  const {context,page}=await fixture(browser,mode);await page.getByRole('button',{name:'Mulai Otomatis',exact:true}).click();
  if(mode==='stop'){
   await page.waitForTimeout(100);await page.getByRole('button',{name:'Stop',exact:true}).click();await page.waitForTimeout(800);assert.equal(await page.evaluate(()=>GM_getValue('wonogiri-ikd-state-v1').status),'stopped');await page.getByRole('button',{name:'Resume',exact:true}).click();
  }
  await page.waitForFunction(expected=>GM_getValue('wonogiri-ikd-state-v1').status===expected,['empty','loop','stuck'].includes(mode)?'paused':'complete',{timeout:22000});
  const state=await page.evaluate(()=>GM_getValue('wonogiri-ikd-state-v1'));if(mode==='empty')assert.equal(state.success,0);else if(mode==='loop'){assert.equal(state.success,2);assert.ok(state.logs.at(-1).message.includes('berulang'));}else if(mode==='stuck'){assert.equal(state.success,1);assert.ok(state.pending);}else{assert.equal(state.success,2);assert.equal(Object.keys(state.records).length,2);assert.equal(state.transitions,1);}
  if(mode==='retry')assert.equal(await page.evaluate(()=>calls),3);
  results.push({mode,status:state.status,pages:state.success});await context.close();
 }
 // Resume a pending transition after reload with the same URL and preserved GM state.
 const {context,page}=await fixture(browser,'ajax');await page.evaluate(()=>{GM_setValue('wonogiri-ikd-state-v1',{version:1,status:'running',queue:[],visited:[],sent:[],records:{},success:0,failed:0,skipped:0,transitions:0,logs:[],pending:null});});
 await page.reload();await page.evaluate(()=>{window.GM_getValue=(k,f)=>{const r=localStorage.getItem(k);return r===null?f:JSON.parse(r)};window.GM_setValue=(k,v)=>localStorage.setItem(k,JSON.stringify(v));window.GM_xmlhttpRequest=o=>o.onload({status:200,responseText:'{"ok":true}'});document.querySelector('tbody').innerHTML='<tr><td>01234567</td><td>School</td><td>SD</td><td>85%</td><td>90%</td><td>85%</td><td>80%</td></tr>';document.getElementById('next').disabled=true;});await page.addScriptTag({content:crawler});await page.waitForFunction(()=>GM_getValue('wonogiri-ikd-state-v1').status==='complete');results.push({mode:'reload-resume',status:'complete'});await context.close();
 const urlContext=await browser.newContext();const urlPage=await urlContext.newPage();
 await urlPage.route('**/*',route=>{const second=new URL(route.request().url()).searchParams.get('page')==='2';route.fulfill({contentType:'text/html',body:`<!doctype html><table><thead><tr><th>NPSN</th><th>Nama Sekolah</th><th>Skor IKD</th></tr></thead><tbody><tr><td>${second?'01234568':'01234567'}</td><td>School ${second?2:1}</td><td>85%</td></tr></tbody></table>${second?'':'<a rel="next" href="?page=2">Next</a>'}<script>window.GM_getValue=(k,f)=>{const r=localStorage.getItem(k);return r===null?f:JSON.parse(r)};window.GM_setValue=(k,v)=>localStorage.setItem(k,JSON.stringify(v));window.GM_xmlhttpRequest=o=>setTimeout(()=>o.onload({status:200,responseText:'{"ok":true}'}),50);GM_setValue('ikd-endpoint','https://script.google.com/macros/s/fixture/exec');GM_setValue('ikd-token','fixture');</script><script>${crawler}</script>`});});
 await urlPage.goto(url);await urlPage.getByRole('button',{name:'Mulai Otomatis',exact:true}).click();await urlPage.waitForURL(u=>u.searchParams.get('page')==='2');
 await urlPage.waitForFunction(()=>GM_getValue('wonogiri-ikd-state-v1').status==='complete',null,{timeout:20000});const urlState=await urlPage.evaluate(()=>GM_getValue('wonogiri-ikd-state-v1'));assert.equal(urlState.success,2);assert.equal(urlState.transitions,1);results.push({mode:'url-navigation-pending-resume',status:urlState.status,pages:urlState.success});await urlContext.close();
 fs.writeFileSync('test-results/crawler.json',JSON.stringify(results,null,2));console.log(results);await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
