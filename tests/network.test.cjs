// Pin the map so the walk-to-loot run is reproducible: seed 58 puts a long-range rifle in sight of the spawn.
// Loot randomness itself is covered in simulation.test.cjs.
process.env.LOOT_SEED='58';
const test=require('node:test'),assert=require('node:assert/strict'),{WebSocket}=require('ws');
const{createApp}=require('../server/app.cjs'),{MemoryStore}=require('../server/store.cjs');
function client(url){const ws=new WebSocket(url),messages=[],waiters=[];ws.on('message',raw=>{const data=JSON.parse(raw.toString());messages.push(data);for(const w of [...waiters])if(w.predicate(data)){clearTimeout(w.timer);waiters.splice(waiters.indexOf(w),1);w.resolve(data)}});return{ws,messages,opened:new Promise((r,j)=>{ws.once('open',r);ws.once('error',j)}),send:msg=>ws.send(JSON.stringify(msg)),wait(predicate,timeout=6000){const existing=messages.find(predicate);if(existing)return Promise.resolve(existing);return new Promise((resolve,reject)=>{const w={predicate,resolve,timer:setTimeout(()=>{waiters.splice(waiters.indexOf(w),1);reject(Error('timeout '+messages.slice(-1).map(x=>JSON.stringify(x)).join()))},timeout)};waiters.push(w)})}}}
async function server(store){const a=createApp({store,staticFiles:false});await new Promise(r=>a.server.listen(0,'127.0.0.1',r));a.url='ws://127.0.0.1:'+a.server.address().port+'/api/ws';a.stop=async()=>{await a.transport.close();await new Promise(r=>a.server.close(r))};return a}
const R=require('../rules.js'),W=require('../shared/world.js');
const latest=(c,predicate)=>c.messages.filter(predicate).at(-1);
// Loot is randomised now, so the test walks the player to whatever the round generated.
async function walkTo(c,id,target,seq,reach=1.5){
  let previous=null,stuck=0;
  for(let attempt=0;attempt<600;attempt++){
    const state=latest(c,m=>m.type==='state')?.snapshot;
    const me=state?.players.find(p=>p.id===id);
    if(me){
      const goal=typeof target==='function'?target(state):target;
      if(!goal)return null;
      const dx=goal.x-me.x,dz=goal.z-me.z,distance=Math.hypot(dx,dz);
      if(distance<reach)return goal;
      // Steer with whiskers: the heading closest to the goal that has clear ground ahead.
      const want=Math.atan2(dx,dz);let yaw=want,best=-Infinity;
      for(const turn of [0,.3,-.3,.6,-.6,.9,-.9,1.3,-1.3,1.8,-1.8,2.4,-2.4,Math.PI]){
        const a=want+turn;let clear=0;
        for(let step=1;step<=8;step++){if(W.blocked(me.x+Math.sin(a)*step*1.2,me.z+Math.cos(a)*step*1.2,.7))break;clear=step}
        const score=clear*2-Math.abs(turn)*(stuck?.5:2.2);
        if(score>best){best=score;yaw=a}
      }
      if(previous&&Math.hypot(me.x-previous.x,me.z-previous.z)<.04){stuck++;yaw+=stuck%2?1.2:-1.2}else stuck=0;
      previous={x:me.x,z:me.z};
      c.send({type:'input',data:{x:0,z:1,yaw,pitch:0,sprint:true,seq:seq.n++}});
    }
    await new Promise(r=>setTimeout(r,50));
  }
  return null;
}
// The walker steers around cover now, so head for the nearest firearm whether or not it is in sight.
const nearestWeapon=(state,me)=>state.loot.filter(l=>l.type==='weapon'&&!R.weapons[l.weapon].melee)
  .map(l=>({...l,d:Math.hypot(l.x-me.x,l.z-me.z)})).sort((a,b)=>a.d-b.d)[0];
async function exerciseRoom(t,store){const a=await server(store),b=await server(store);t.after(async()=>{await a.stop();await b.stop()});const one=client(a.url),two=client(b.url);await Promise.all([one.opened,two.opened]);one.send({type:'create',name:'Alpha'});const first=await one.wait(m=>m.type==='joined');assert.match(first.room,/^[A-Z2-9]{6}$/);two.send({type:'join',room:first.room,name:'Bravo'});const second=await two.wait(m=>m.type==='joined');assert.notEqual(first.id,second.id);await one.wait(m=>m.type==='state'&&m.snapshot.players.length===2);one.send({type:'action',action:'ready',data:true});two.send({type:'action',action:'ready',data:true});await one.wait(m=>m.type==='state'&&m.snapshot.players.every(p=>p.ready));one.send({type:'action',action:'start'});await Promise.all([one.wait(m=>m.type==='state'&&m.snapshot.phase==='playing'),two.wait(m=>m.type==='state'&&m.snapshot.phase==='playing')]);
const beats=[one,two].map(c=>setInterval(()=>c.send({type:'ping',at:Date.now()}),1200));t.after(()=>beats.forEach(clearInterval));
const seq={n:1},spawn=latest(one,m=>m.type==='state').snapshot.players.find(p=>p.id===first.id);
assert.equal(latest(one,m=>m.type==='state').snapshot.me.equipped,'fists','a round starts bare-handed');
// Walking to the gun proves movement replicates through the shared store as well.
const target=await walkTo(one,first.id,state=>nearestWeapon(state,state.players.find(p=>p.id===first.id)),seq,2.2);
assert.ok(target,'player one reached a weapon on the randomised map, last position '+JSON.stringify(latest(one,m=>m.type==='state').snapshot.players.find(p=>p.id===first.id)));
await two.wait(m=>m.type==='state'&&m.snapshot.players.some(p=>p.id===first.id&&Math.hypot(p.x-spawn.x,p.z-spawn.z)>3),12000);
const firearm=()=>{const held=latest(one,m=>m.type==='state')?.snapshot.me.equipped;return held&&!R.weapons[held].melee&&held!=='fists'};
for(let grab=0;grab<30&&!firearm();grab++){one.send({type:'action',action:'collect'});await new Promise(r=>setTimeout(r,200))}
const looted=await one.wait(m=>m.type==='state'&&m.snapshot.me.equipped!=='fists'&&!R.weapons[m.snapshot.me.equipped].melee,12000);
const gun=looted.snapshot.me.equipped;
assert.ok(R.weapons[gun]&&!R.weapons[gun].melee,'picked up a real firearm');
assert.equal(looted.snapshot.me.weapons[gun].ammo,R.weapons[gun].mag);
clearInterval(beats[0]);one.ws.terminate();const again=client(b.url);await again.opened;const revived=setInterval(()=>again.send({type:'ping',at:Date.now()}),1200);t.after(()=>clearInterval(revived));
again.send({type:'reconnect',room:first.room,id:first.id,token:first.token});const resumed=await again.wait(m=>m.type==='joined');assert.equal(resumed.id,first.id);
const restored=await again.wait(m=>m.type==='state'&&m.snapshot.me.equipped===gun,12000);assert.equal(restored.snapshot.me.weapons[gun].ammo,R.weapons[gun].mag,'reconnect keeps the magazine');
const attack=client(a.url);await attack.opened;attack.send({type:'reconnect',room:first.room,id:first.id,token:'0'.repeat(48)});assert.match((await attack.wait(m=>m.type==='error')).message,/재접속/);attack.ws.close();
// Aim from the live positions: a metre of drift at 100m is a clean miss past a 0.3m hitbox.
// Drops are on opposite sides of a 208m field full of cover, so close in until the shot is real.
const inSight=()=>{const players=latest(again,m=>m.type==='state')?.snapshot.players||[];
  const me=players.find(p=>p.id===first.id),foe=players.find(p=>p.id===second.id);
  return !!(me&&foe&&W.visible({x:me.x,y:1.7,z:me.z},{x:foe.x,y:.84,z:foe.z}))};
// Stand off on an arc around Bravo, tightening the circle until nothing is in the way.
const closeIn=(angle,distance)=>walkTo(again,first.id,state=>{
  const foe=state.players.find(p=>p.id===second.id),me=state.players.find(p=>p.id===first.id);
  if(!foe||!me)return null;
  const bearing=Math.atan2(me.x-foe.x,me.z-foe.z)+angle;
  return{x:foe.x+Math.sin(bearing)*distance,z:foe.z+Math.cos(bearing)*distance}},seq,3);
for(const[angle,distance]of [[0,20],[0,11],[.8,9],[-.8,9],[0,6],[1.6,6]]){
  await closeIn(angle,distance);
  if(inSight())break;
}
assert.ok(inSight(),'player one closed to a firing position with line of sight');
let fired=0;
while(fired<60&&!latest(again,m=>m.type==='state')?.snapshot.winner){
  const players=latest(again,m=>m.type==='state')?.snapshot.players||[];
  const me=players.find(p=>p.id===first.id),foe=players.find(p=>p.id===second.id);
  if(me&&foe){const dx=foe.x-me.x,dz=foe.z-me.z;
    again.send({type:'action',action:'shoot',data:{yaw:Math.atan2(dx,dz),pitch:Math.atan2(1.7-.84,Math.hypot(dx,dz))}});fired++}
  await new Promise(r=>setTimeout(r,Math.max(140,R.weapons[gun].interval*1000+60)));
}
const ended=await again.wait(m=>m.type==='state'&&m.snapshot.phase==='finished'&&m.snapshot.winner===first.id,12000);
assert.ok(ended.snapshot.me.weapons[gun].ammo<R.weapons[gun].mag,'firing spent rounds');
assert.equal((await two.wait(m=>m.type==='state'&&m.snapshot.me.hp===0,12000)).snapshot.me.hp,0);
again.send({type:'leave'});two.send({type:'leave'});
}
test('two independent server instances share a room, start, loot, move and reconnect',t=>exerciseRoom(t,new MemoryStore()));

test('real Redis Lua and HTTP transport preserve multiplayer state across servers',{skip:!process.env.TEST_REDIS_URL},async t=>{
  const {createClient}=require('redis'),http=require('node:http');
  const{RedisStore}=require('../server/store.cjs');
  const redis=createClient({url:process.env.TEST_REDIS_URL});redis.on('error',()=>{});await redis.connect();
  const keys=new Set();
  // Local HTTP adapter exercises the same Redis commands and Lua scripts as Upstash REST.
  const rest=http.createServer(async(req,res)=>{let body='';for await(const part of req)body+=part;
    if(req.headers.authorization!=='Bearer local-test'){res.writeHead(401).end();return}
    try{const args=JSON.parse(body).map(String);for(const arg of args)if(/^lf:\{[A-Z2-9]{6}\}:/.test(arg))keys.add(arg);
      const result=await redis.sendCommand(args);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({result}));
    }catch(error){res.end(JSON.stringify({error:error.message}))}
  });
  await new Promise(r=>rest.listen(0,'127.0.0.1',r));
  const store=new RedisStore('http://127.0.0.1:'+rest.address().port,'local-test');
  // Close heartbeat and room transports before removing only this test's keys.
  const cleanup=[];try{await exerciseRoom({after(fn){cleanup.push(fn)}},store)}finally{
    for(const fn of cleanup.reverse())await fn();
    await new Promise(r=>rest.close(r));if(keys.size)await redis.del([...keys]);await redis.quit();
  }
});

test('a real redis:// endpoint drives a full match through the socket store',{skip:!process.env.TEST_REDIS_URL},async t=>{
  const {createClient}=require('redis');const{RedisSocketStore}=require('../server/store.cjs');
  const store=new RedisSocketStore(process.env.TEST_REDIS_URL);
  const probe=createClient({url:process.env.TEST_REDIS_URL});probe.on('error',()=>{});await probe.connect();
  const before=new Set(await probe.keys('lf:*'));
  const cleanup=[];try{await exerciseRoom({after(fn){cleanup.push(fn)}},store)}finally{
    for(const fn of cleanup.reverse())await fn();await store.close();
    const mine=(await probe.keys('lf:*')).filter(key=>!before.has(key));
    if(mine.length)await probe.del(mine);await probe.quit();
  }
});
