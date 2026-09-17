'use strict';
const http=require('node:http'),path=require('node:path'),express=require('express');
const {configuredStore}=require('./store.cjs'),{attach}=require('./transport.cjs');
const {health}=require('./health.cjs');
function createApp({store=configuredStore(),staticFiles=true}={}){const app=express();app.disable('x-powered-by');
  app.get('/api/health',async(_req,res)=>{const result=await health(store);res.set('Cache-Control','no-store').status(result.ok?200:503).json(result)});
  app.get('/api/ws',(_req,res)=>res.status(426).json({error:'WebSocket connection required'}));
  if(staticFiles){const root=path.resolve(__dirname,'..');for(const dir of ['assets','vendor','shared'])app.use('/'+dir,express.static(path.join(root,dir),{dotfiles:'deny',index:false}));const files=['index.html','style.css','game.js','environment.js','rules.js','controls.js','loot-visuals.js','boot.js','online.js','diagnostics.html','star-dash.html'];app.get('/',(_req,res)=>res.sendFile(path.join(root,'index.html')));for(const file of files)app.get('/'+file,(_req,res)=>res.sendFile(path.join(root,file)));}
  const server=http.createServer(app),transport=attach(server,store,{origins:(process.env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean)});return{server,transport,store};}
module.exports={createApp};
