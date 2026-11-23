const fs=require('node:fs'),path=require('node:path');
// Verify the generated directory belongs to this workspace before clearing it.
const root=path.resolve('.'),out=path.resolve(root,'dist');
if(path.dirname(out)!==root||path.basename(out)!=='dist')throw Error('Invalid build target');
fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});
// Publish runtime assets only; exclude authoring templates and presenter notes.
const assets=fs.readdirSync('assets').filter(p=>/\.(css|js)$/.test(p)).map(p=>'assets/'+p);
for(const p of ['index.html',...assets,'data/monitoring.js']){
  fs.mkdirSync(path.dirname(path.join(out,p)),{recursive:true});fs.copyFileSync(p,path.join(out,p));
}
// Publish the aggregate ATS snapshot only when a validated sync has created it.
const atsSnapshot=path.join(root,'data/ats-live.json');
if(fs.existsSync(atsSnapshot)){
  const target=path.join(out,'data/ats-live.json');
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.copyFileSync(atsSnapshot,target);
}
// Overlay only DQM fields in the public presentation; IKD remains untouched.
require('./apply-dqm-live.cjs').applyDqmLiveFile(
  path.join(out,'index.html'),
  path.join(root,'data/dqm-live.json')
);
// Load the ATS renderer after DQM overlay, preserving the existing presentation.
const indexPath=path.join(out,'index.html');
let html=fs.readFileSync(indexPath,'utf8');
if(!html.includes('assets/ats-live.js')){
  const tag='<script src="assets/ats-live.js"></script>';
  if(html.includes('</body>')) html=html.replace('</body>',tag+'</body>');
  else html=html.replace('</html>',tag+'</html>');
  fs.writeFileSync(indexPath,html);
}
console.log('Public presentation built in dist; presenter notes excluded.');
