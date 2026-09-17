'use strict';
// Creates a temporary two-player match using the same public protocol as browsers.
const {WebSocket}=require('ws'),assert=require('node:assert/strict');
const base=new URL(process.argv[2]||'http://127.0.0.1:8780/');
const clients=[];
function client(){
  const url=new URL('/api/ws',base);url.protocol=base.protocol==='https:'?'wss:':'ws:';
  const ws=new WebSocket(url,{origin:base.origin}),messages=[],pending=[];
  const send=data=>{if(ws.readyState===1)ws.send(JSON.stringify(data))};
  ws.on('message',raw=>{const msg=JSON.parse(raw);messages.push(msg);if(messages.length>500)messages.shift();for(const w of [...pending])if(w.accept(msg)){pending.splice(pending.indexOf(w),1);clearTimeout(w.timer);w.resolve(msg)}});
  const heartbeat=setInterval(()=>send({type:'ping',at:Date.now()}),1500);
  ws.on('close',()=>clearInterval(heartbeat));ws.on('error',()=>{});
  const c={ws,send,opened:new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject)}),wait(accept){const found=messages.find(accept);if(found)return Promise.resolve(found);return new Promise((resolve,reject)=>{const w={accept,resolve,timer:setTimeout(()=>reject(Error('게임 응답 시간 초과. WebSocket/Redis 연결을 확인해 주세요.')),15000)};pending.push(w)})},close(){clearInterval(heartbeat);for(const w of pending)clearTimeout(w.timer);send({type:'leave'});ws.close()}};
  clients.push(c);return c;
}
(async()=>{
  const response=await fetch(new URL('/api/health',base),{signal:AbortSignal.timeout(10000)});
  if(response.status===404)throw Error('/api/health 404: 멀티플레이 API가 포함된 새 코드를 먼저 배포해 주세요.');
  const health=await response.json();if(!response.ok||!health.ok)throw Error(health.message||'서버 준비 실패');
  console.log('PASS server health:',health.version,health.storage);
  for(const file of ['environment.js','assets/environment/asphalt-color.jpg','assets/environment/daylight.hdr']){
    const asset=await fetch(new URL('/'+file,base),{method:'HEAD',signal:AbortSignal.timeout(10000)});
    assert.ok(asset.ok&&!asset.headers.get('content-type')?.includes('text/html'),'Missing asset '+file);
  }
  console.log('PASS visual assets');
  const a=client(),b=client();await Promise.all([a.opened,b.opened]);
  a.send({type:'create',name:'검증 A'});const joined=await a.wait(m=>m.type==='joined');
  b.send({type:'join',name:'검증 B',room:joined.room});await b.wait(m=>m.type==='joined');
  a.send({type:'action',action:'ready',data:true});b.send({type:'action',action:'ready',data:true});
  await a.wait(m=>m.type==='state'&&m.snapshot.players.length===2&&m.snapshot.players.every(p=>p.ready));
  a.send({type:'action',action:'start'});await a.wait(m=>m.type==='state'&&m.snapshot.phase==='playing');
  a.send({type:'action',action:'collect'});await a.wait(m=>m.type==='state'&&m.snapshot.me.equipped==='carbine');
  a.ws.terminate();const resumed=client();await resumed.opened;
  resumed.send({type:'reconnect',room:joined.room,id:joined.id,token:joined.token});await resumed.wait(m=>m.type==='joined');
  await resumed.wait(m=>m.type==='state'&&m.snapshot.me.weapons.carbine?.ammo===30);
  for(let shot=0;shot<2;shot++){
    resumed.send({type:'action',action:'shoot',data:{yaw:0,pitch:0}});
    await resumed.wait(m=>m.type==='state'&&m.snapshot.me.weapons.carbine?.ammo===29-shot);
    if(shot===0)await new Promise(r=>setTimeout(r,250));
  }
  await resumed.wait(m=>m.type==='state'&&m.snapshot.phase==='finished'&&m.snapshot.winner===joined.id);
  console.log('PASS room creation, join, ready, start, loot, reconnect, damage and winner');
})().catch(error=>{console.error('FAIL:',error.message);process.exitCode=1}).finally(()=>{for(const c of clients)c.close()});
