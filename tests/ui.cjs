const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 fs.mkdirSync('test-results',{recursive:true});const browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('file:///'+path.resolve('index.html').replaceAll('\\','/'));await page.waitForTimeout(500);
 const count=await page.locator('.slide').count();console.log('Slides',count);
 const overflow=[];
 for(const size of [{width:1366,height:768},{width:1920,height:1080}]){
  await page.setViewportSize(size);
  for(let i=0;i<count;i++){await page.evaluate(n=>showSlide(n),i);await page.waitForTimeout(900);const measure=await page.locator('.slide.active').evaluate(s=>({label:s.dataset.label,w:s.clientWidth,sw:s.scrollWidth,h:s.clientHeight,sh:s.scrollHeight}));if(measure.sw>measure.w+2)overflow.push({...size,...measure});await page.screenshot({path:`test-results/${size.width}-${i+1}.png`});}
 }
 await page.evaluate(()=>showSlide(0));await page.keyboard.press('ArrowRight');if(await page.evaluate(()=>slideIndex)!==1)throw Error('Keyboard navigation failed');
 await page.evaluate(()=>{el('scope-filter').value='prov';updateLevels();refreshComparisons();});
 if(!await page.evaluate(()=>search('Kulurejo').some(s=>s.n==='20311621')))throw Error('Clinic search should ignore dashboard scope');
 await page.evaluate(()=>openSchool(CLINIC_BY_NPSN.get('20311621')));await page.waitForTimeout(50);if(!await page.locator('#clinic-extra').innerText().then(t=>t.includes('97,27')))throw Error('Official score absent');
 if(!(await page.locator('#modal-dapodik').getAttribute('href')).endsWith('20311621'))throw Error('Dapodik link mismatch');
 await page.click('#clinic-extra summary');await page.fill('#follow-note','Verifikasi pengujian');await page.click('#save-follow');await page.keyboard.press('Escape');
 await page.evaluate(()=>{showSlide(slides.findIndex(x=>x.dataset.label==='Peserta dan tindak lanjut'));});await page.fill('#attendance-npsn','20311621');await page.click('#add-attendee');await page.reload();
 if(!await page.evaluate(()=>localRecords.attendance.includes('20311621')))throw Error('Attendance persistence failed');
 await page.evaluate(()=>openSchool(CLINIC_BY_NPSN.get('233349')));if(!(await page.locator('#modal-metrics').innerText()).includes('Belum tersedia'))throw Error('Missing DQM must stay missing');await page.keyboard.press('Escape');
 await page.evaluate(()=>{showSlide(0);document.activeElement.blur();});await page.mouse.move(1000,500);await page.waitForTimeout(2700);if(await page.locator('body').evaluate(b=>b.classList.contains('chrome-visible')))throw Error('Header did not auto-hide');
 await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>showSlide(7));await page.screenshot({path:'test-results/reduced-motion.png'});
 await page.evaluate(()=>{showSlide(0);const stage=el('stage');stage.dispatchEvent(new TouchEvent('touchstart',{touches:[new Touch({identifier:1,target:stage,clientX:600,clientY:300})]}));stage.dispatchEvent(new TouchEvent('touchend',{changedTouches:[new Touch({identifier:1,target:stage,clientX:300,clientY:300})]}));});if(await page.evaluate(()=>slideIndex)!==1)throw Error('Swipe failed');
 await page.click('#chrome-peek');await page.click('#fullscreen');await page.waitForTimeout(200);if(!await page.evaluate(()=>!!document.fullscreenElement))throw Error('Fullscreen failed');await page.evaluate(()=>document.exitFullscreen());
 await page.evaluate(()=>showSlide(slides.findIndex(s=>s.dataset.label==='Cakupan lima sumber')));await page.locator('.slide.active summary').click();await page.fill('#read-api-url','https://script.google.com/macros/s/fixture/exec');
 await page.route('https://script.google.com/**',route=>{const callback=new URL(route.request().url()).searchParams.get('callback');route.fulfill({contentType:'text/javascript',body:callback+'('+JSON.stringify({ok:true,official:{score:85,complete:91.37,valid:86.55,current:76.57,at:'2026-10-26T14:41:02+07:00',url:'https://dapo.kemendikdasmen.go.id/ikd/Prov.%20Jawa%20Tengah'}})+');'});});
 await page.click('#sync-official');await page.waitForFunction(()=>el('sync-status').textContent.includes('diperbarui'));await page.unroute('https://script.google.com/**');await page.route('https://script.google.com/**',r=>r.abort());await page.click('#sync-official');await page.waitForFunction(()=>el('sync-status').textContent.includes('dipertahankan'));
 await page.setViewportSize({width:390,height:844});for(let i=0;i<count;i++){await page.evaluate(n=>showSlide(n),i);const measure=await page.locator('.slide.active').evaluate(s=>({label:s.dataset.label,w:s.clientWidth,sw:s.scrollWidth}));if(measure.sw>measure.w+2)overflow.push({width:390,...measure});}
 const report={slides:count,errors,horizontalOverflow:overflow};fs.writeFileSync('test-results/ui.json',JSON.stringify(report,null,2));console.log(report);await browser.close();if(errors.length||overflow.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1)});
