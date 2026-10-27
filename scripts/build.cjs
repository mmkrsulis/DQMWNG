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
console.log('Public presentation built in dist; presenter notes excluded.');
