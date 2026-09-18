'use strict';
const {WebSocketServer}=require('ws'),crypto=require('node:crypto');
const {Battle}=require('./simulation.cjs');
const {hash,makeState,authorize,evolve}=require('./room-state.cjs');
const random=bytes=>crypto.randomBytes(bytes).toString('hex');
const CODE=/^[A-HJ-NP-Z2-9]{6}$/;
function code(){const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return Array.from({length:6},()=>alphabet[crypto.randomInt(alphabet.length)]).join('')}
function attach(httpServer,store,{origins=[],tickMs=100}={}){
  const wss=new WebSocketServer({noServer:true,maxPayload:4096,perMessageDeflate:false});
  const groups=new Map(),owner=random(16),ipBudget=new Map();let closing=false;
  const send=(ws,data)=>{if(ws.readyState===1&&ws.bufferedAmount<128000)ws.send(JSON.stringify(data))};
  const error=(ws,message)=>send(ws,{type:'error',message});
  function group(room){let g=groups.get(room);if(!g){g={clients:new Set(),running:false};groups.set(room,g);g.timer=setInterval(()=>cycle(room,g),tickMs);g.timer.unref?.()}return g}
  async function cycle(room,g){if(closing||g.running)return;g.running=true;try{const batch=await store.begin(room,owner);if(!batch){for(const ws of g.clients){error(ws,'방이 만료됐습니다. 새 방을 만들어 주세요.');ws.close(4004)}return}let state=batch.state;if(batch.leader){const old=state.revision;state=evolve(state,batch.commands);if(!await store.commit(room,owner,old,state,batch.commands.length))return}const game=Battle.restore(state.game);for(const ws of g.clients){const c=ws.context;if(!c)continue;if(c.request){const receipt=state.receipts[c.request];if(!receipt){if(Date.now()-c.since>12000){error(ws,'입장 응답이 늦습니다. 다시 시도해 주세요.');ws.close(4008)}continue}if(!receipt.ok){error(ws,receipt.error);ws.close(4003);continue}c.request=null;send(ws,{type:'joined',room,id:c.id,token:c.token});}
      const session=state.sessions[c.id];if(!session||session.owner!==c.owner){error(ws,'접속이 만료됐거나 다른 창에서 다시 연결했습니다.');ws.close(4004);continue}if(c.revision===state.revision)continue;c.revision=state.revision;send(ws,{type:'state',room,id:c.id,snapshot:game.snapshot(c.id),events:state.events});}
    }catch(e){console.error('Room sync:',e.message);for(const ws of g.clients)send(ws,{type:'status',message:'경기 서버 연결을 복구하고 있습니다…'});}finally{g.running=false;if(!g.clients.size){if(!g.emptySince)g.emptySince=Date.now();if(Date.now()-g.emptySince>20000){clearInterval(g.timer);groups.delete(room)}}else g.emptySince=0}}
  httpServer.on('upgrade',(req,socket,head)=>{const path=new URL(req.url,'http://localhost').pathname;if(path!=='/api/ws'){socket.destroy();return}const origin=req.headers.origin,host=req.headers['x-forwarded-host']||req.headers.host;let same=false;try{same=new URL(origin).host===host}catch{}if(origin&&!same&&!origins.includes(origin)){socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');socket.destroy();return}if(!store){socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');socket.destroy();return}const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0],now=Date.now();const budget=ipBudget.get(ip)||{at:now,count:0};if(now-budget.at>60000){budget.at=now;budget.count=0}if(++budget.count>40){socket.destroy();return}ipBudget.set(ip,budget);if(ipBudget.size>2000)for(const[key,value]of ipBudget)if(now-value.at>60000)ipBudget.delete(key);wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));});
  wss.on('connection',ws=>{let busy=false,joined=false,windowAt=Date.now(),count=0;const deadline=setTimeout(()=>{if(!joined)ws.close(4008)},15000);ws.on('error',()=>{});
    ws.on('message',async raw=>{try{const now=Date.now();if(now-windowAt>=1000){windowAt=now;count=0}if(++count>45){ws.close(4008);return}const message=JSON.parse(raw.toString());if(!message||typeof message!=='object')return;
      if(!joined){if(busy)return;busy=true;try{const own=random(16);let room,id,token,request=null;
        if(message.type==='create'){id=random(8);token=random(24);for(let attempt=0;attempt<5;attempt++){room=code();if(await store.create(room,makeState(id,message.name,token,own)))break;room=null}if(!room)throw Error('방을 만들지 못했습니다. 다시 시도해 주세요.')}
        else if(message.type==='join'||message.type==='reconnect'){room=String(message.room||'').toUpperCase();if(!CODE.test(room))throw Error('초대 코드는 영문·숫자 6자리입니다.');const state=await store.read(room);if(!state)throw Error('방을 찾을 수 없습니다. 코드를 확인해 주세요.');request=random(12);
          if(message.type==='reconnect'){id=message.id;token=message.token;if(!authorize(state,id,token))throw Error('재접속 시간이 지났습니다.');if(await store.append(room,{op:'reconnect',id,hash:hash(token),owner:own,request,at:now})!==1)throw Error('방이 만료됐습니다.');}
          else{id=random(8);token=random(24);const game=Battle.restore(state.game);if(game.phase!=='lobby'||game.players.size>=16)throw Error('이미 시작했거나 가득 찬 방입니다.');if(await store.append(room,{op:'join',id,name:message.name,hash:hash(token),owner:own,request,at:now})!==1)throw Error('입장 요청이 많습니다. 다시 시도해 주세요.');}
        }else throw Error('먼저 방에 입장해 주세요.');
        if(ws.readyState!==1)return;joined=true;clearTimeout(deadline);ws.context={room,id,token,owner:own,request,since:now,revision:-1};group(room).clients.add(ws);if(!request)send(ws,{type:'joined',room,id,token});await cycle(room,group(room));
      }finally{busy=false}return}
      const c=ws.context;if(c.request)return;
      if(message.type==='ping'){send(ws,{type:'pong',at:message.at});await store.append(c.room,{op:'heartbeat',id:c.id,owner:c.owner,at:now});return}
      if(message.type==='input'){await store.append(c.room,{op:'input',id:c.id,owner:c.owner,data:message.data,at:now});return}
      if(message.type==='action'&&['ready','start','rematch','collect','reload','heal','equip','shoot','throw','jump','stance'].includes(message.action)){await store.append(c.room,{op:'action',id:c.id,owner:c.owner,type:message.action,data:message.data,at:now});return}
      if(message.type==='leave'){await store.append(c.room,{op:'leave',id:c.id,owner:c.owner,at:now});ws.close(1000)}
    }catch(e){error(ws,e instanceof SyntaxError?'잘못된 메시지입니다.':e.message);if(!joined)ws.close(4003)}});
    ws.on('close',()=>{clearTimeout(deadline);const c=ws.context;if(c){groups.get(c.room)?.clients.delete(ws);store.append(c.room,{op:'drop',id:c.id,owner:c.owner,at:Date.now()}).catch(()=>{})}});
  });
  return{wss,groups,close:async()=>{closing=true;const active=[...groups.values()];for(const g of active)clearInterval(g.timer);for(const ws of wss.clients)ws.terminate();await new Promise(resolve=>wss.close(resolve));while(active.some(g=>g.running))await new Promise(r=>setTimeout(r,10));groups.clear()}};
}
module.exports={attach,CODE};
