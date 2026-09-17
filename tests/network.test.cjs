const test=require('node:test'),assert=require('node:assert/strict'),{WebSocket}=require('ws');
const{createApp}=require('../server/app.cjs'),{MemoryStore}=require('../server/store.cjs');
function client(url){const ws=new WebSocket(url),messages=[],waiters=[];ws.on('message',raw=>{const data=JSON.parse(raw.toString());messages.push(data);for(const w of [...waiters])if(w.predicate(data)){clearTimeout(w.timer);waiters.splice(waiters.indexOf(w),1);w.resolve(data)}});return{ws,messages,opened:new Promise((r,j)=>{ws.once('open',r);ws.once('error',j)}),send:msg=>ws.send(JSON.stringify(msg)),wait(predicate,timeout=6000){const existing=messages.find(predicate);if(existing)return Promise.resolve(existing);return new Promise((resolve,reject)=>{const w={predicate,resolve,timer:setTimeout(()=>{waiters.splice(waiters.indexOf(w),1);reject(Error('timeout '+messages.slice(-1).map(x=>JSON.stringify(x)).join()))},timeout)};waiters.push(w)})}}}
async function server(store){const a=createApp({store,staticFiles:false});await new Promise(r=>a.server.listen(0,'127.0.0.1',r));a.url='ws://127.0.0.1:'+a.server.address().port+'/api/ws';a.stop=async()=>{await a.transport.close();await new Promise(r=>a.server.close(r))};return a}
async function exerciseRoom(t,store){const a=await server(store),b=await server(store);t.after(async()=>{await a.stop();await b.stop()});const one=client(a.url),two=client(b.url);await Promise.all([one.opened,two.opened]);one.send({type:'create',name:'Alpha'});const first=await one.wait(m=>m.type==='joined');assert.match(first.room,/^[A-Z2-9]{6}$/);two.send({type:'join',room:first.room,name:'Bravo'});const second=await two.wait(m=>m.type==='joined');assert.notEqual(first.id,second.id);await one.wait(m=>m.type==='state'&&m.snapshot.players.length===2);one.send({type:'action',action:'ready',data:true});two.send({type:'action',action:'ready',data:true});await one.wait(m=>m.type==='state'&&m.snapshot.players.every(p=>p.ready));one.send({type:'action',action:'start'});await Promise.all([one.wait(m=>m.type==='state'&&m.snapshot.phase==='playing'),two.wait(m=>m.type==='state'&&m.snapshot.phase==='playing')]);one.send({type:'action',action:'collect'});const looted=await one.wait(m=>m.type==='state'&&m.snapshot.me.equipped==='carbine');assert.equal(looted.snapshot.me.weapons.carbine.ammo,30);one.send({type:'input',data:{x:0,z:1,yaw:0,pitch:0,seq:1}});await two.wait(m=>m.type==='state'&&m.snapshot.players.some(p=>p.id===first.id&&p.z>-51.9));const heartbeat=setInterval(()=>two.send({type:'ping',at:Date.now()}),1500);t.after(()=>clearInterval(heartbeat));one.ws.terminate();const again=client(b.url);await again.opened;again.send({type:'reconnect',room:first.room,id:first.id,token:first.token});const resumed=await again.wait(m=>m.type==='joined');assert.equal(resumed.id,first.id);const restored=await again.wait(m=>m.type==='state'&&m.snapshot.me.equipped==='carbine');assert.equal(restored.snapshot.me.weapons.carbine.ammo,30);
const attack=client(a.url);await attack.opened;attack.send({type:'reconnect',room:first.room,id:first.id,token:'0'.repeat(48)});assert.match((await attack.wait(m=>m.type==='error')).message,/재접속/);attack.ws.close();again.send({type:'action',action:'shoot',data:{yaw:0,pitch:0}});await two.wait(m=>m.type==='state'&&m.snapshot.me.hp<100);await new Promise(r=>setTimeout(r,180));again.send({type:'action',action:'shoot',data:{yaw:0,pitch:0}});await again.wait(m=>m.type==='state'&&m.snapshot.phase==='finished'&&m.snapshot.winner===first.id);assert.equal((await two.wait(m=>m.type==='state'&&m.snapshot.me.hp===0)).snapshot.me.hp,0);again.send({type:'leave'});two.send({type:'leave'});
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
