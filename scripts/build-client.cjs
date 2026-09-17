'use strict';
const fs=require('node:fs'),path=require('node:path');const root=path.resolve(__dirname,'..'),out=path.join(root,'dist');
fs.mkdirSync(out,{recursive:true});
// Explicit public asset list: server code, tests and secrets must never be static downloads.
for(const file of ['index.html','style.css','game.js','environment.js','rules.js','controls.js','loot-visuals.js','boot.js','online.js','diagnostics.html','star-dash.html'])fs.copyFileSync(path.join(root,file),path.join(out,file));
for(const dir of ['assets','vendor','shared'])fs.cpSync(path.join(root,dir),path.join(out,dir),{recursive:true});
console.log('Static client written to dist/; Vercel api/ functions remain server-side.');
