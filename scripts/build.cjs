const fs=require('node:fs');
// Deliberate allowlist: presenter material, raw sources and backend never enter Pages.
fs.mkdirSync('dist',{recursive:true});
for(const p of ['index.html','assets','data/monitoring.js']){
  fs.mkdirSync(require('node:path').dirname('dist/'+p),{recursive:true});
  fs.cpSync(p,'dist/'+p,{recursive:true});
}
console.log('Public presentation built in dist; presenter notes excluded.');
