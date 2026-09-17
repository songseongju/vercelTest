'use strict';
const {Battle}=require('./simulation.cjs'),crypto=require('node:crypto');
const hash=token=>crypto.createHash('sha256').update(String(token)).digest('hex');
function makeState(id,name,token,owner,now=Date.now()){const game=new Battle();game.add(id,name);return{revision:0,updatedAt:now,game:game.serialize(),sessions:{[id]:{hash:hash(token),owner,seen:now,drop:0}},receipts:{},events:[],eventId:0}}
function authorize(state,id,token){return typeof token==='string'&&token.length===48&&state.sessions[id]?.hash===hash(token)}
function evolve(state,commands,now=Date.now()){
  const game=Battle.restore(state.game);state.events=(state.events||[]).filter(e=>now-e.at<3000);
  // Expire sessions before queued reconnects can revive an abandoned player.
  for(const[id,s]of Object.entries(state.sessions)){if(!s.drop&&now-s.seen>5000){s.drop=s.seen+5000;game.setConnected(id,false)}if(s.drop&&now-s.drop>15000){game.remove(id);delete state.sessions[id]}}
  for(const c of commands){const session=state.sessions[c.id];
    if(c.op==='join'){if(state.receipts[c.request])continue;try{game.add(c.id,c.name);state.sessions[c.id]={hash:c.hash,owner:c.owner,seen:now,drop:0};state.receipts[c.request]={ok:true,at:now}}catch{state.receipts[c.request]={ok:false,at:now,error:'이미 시작했거나 가득 찬 방입니다.'}}continue}
    if(c.op==='reconnect'){if(!session||session.hash!==c.hash){state.receipts[c.request]={ok:false,at:now,error:'재접속 시간이 지났습니다.'};continue}session.owner=c.owner;session.seen=now;session.drop=0;game.setConnected(c.id,true);state.receipts[c.request]={ok:true,at:now};continue}
    if(!session||session.owner!==c.owner)continue;
    if(c.op==='leave'){game.remove(c.id);delete state.sessions[c.id];continue}
    if(c.op==='drop'){session.drop=now;game.setConnected(c.id,false);continue}
    if(now-c.at>2000)continue;
    session.seen=now;if(session.drop){session.drop=0;game.setConnected(c.id,true)}
    if(c.op==='input')game.input(c.id,c.data);
    if(c.op==='action')game.action(c.id,c.type,c.data);
  }
  // Advance by wall time, including short function handoffs, in bounded physics steps.
  let elapsed=Math.min(20,Math.max(0,(now-state.updatedAt)/1000));while(elapsed>1e-7){const dt=Math.min(.05,elapsed);game.step(dt);elapsed-=dt}
  for(const[key,r]of Object.entries(state.receipts))if(now-r.at>30000)delete state.receipts[key];
  state.events.push(...game.events.map(e=>({...e,eventId:++state.eventId,at:now})));state.events=state.events.slice(-128);state.game=game.serialize();state.updatedAt=now;state.revision++;return state;
}
module.exports={hash,makeState,authorize,evolve};
