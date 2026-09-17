'use strict';
const R=require('../rules.js'),W=require('../shared/world.js');
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
// LOOT_SEED makes a round's map reproducible for tests and for debugging a reported layout.
const seed=Number.isFinite(Number(process.env.LOOT_SEED))&&process.env.LOOT_SEED!==''?Number(process.env.LOOT_SEED):null;
const emptyInput=()=>({x:0,z:0,yaw:0,pitch:0,sprint:false,aim:false,fire:false,seq:0});
class Battle {
  constructor(){this.players=new Map();this.phase='lobby';this.host='';this.time=0;this.now=0;this.countdown=0;this.round=0;this.loot=[];this.grenades=[];this.events=[];this.serial=0;this.winner='';}
  add(id,name){if(this.phase!=='lobby'||this.players.size>=16||this.players.has(id))throw Error('입장할 수 없는 방입니다.');const p={...R.newPlayer(),id,name:String(name||'생존자').replace(/[<>\x00-\x1f]/g,'').trim().slice(0,16)||'생존자',x:0,z:0,yaw:0,pitch:0,connected:true,ready:false,input:emptyInput(),inputAt:0,reload:0,heal:0,cooldown:0,collectAt:-1,throwAt:-1,lastSeq:0};this.players.set(id,p);if(!this.host)this.host=id;return p;}
  setConnected(id,value){const p=this.players.get(id);if(!p)return;p.connected=value;p.input=emptyInput();p.ready=false;if(!value&&this.host===id)this.host=[...this.players.values()].find(x=>x.connected&&x.id!==id)?.id||'';if(value&&!this.host)this.host=id;}
  remove(id){const p=this.players.get(id);if(!p)return;if(this.phase==='playing'&&p.hp>0)this.kill(p,null,'연결 종료');this.players.delete(id);if(this.host===id)this.host=[...this.players.values()].find(x=>x.connected)?.id||'';this.checkWinner();}
  input(id,data){const p=this.players.get(id);if(!p||!p.connected||this.phase!=='playing'||p.hp<=0||!data||typeof data!=='object')return false;for(const key of ['x','z','yaw','pitch','seq'])if(!Number.isFinite(data[key]))return false;if(!Number.isSafeInteger(data.seq)||data.seq<=p.lastSeq||Math.abs(data.yaw)>1e6)return false;p.lastSeq=data.seq;p.input={x:clamp(data.x,-1,1),z:clamp(data.z,-1,1),yaw:data.yaw%(Math.PI*2),pitch:clamp(data.pitch,-1.25,1.25),sprint:data.sprint===true,aim:data.aim===true,fire:data.fire===true,seq:data.seq};p.inputAt=this.now;return true;}
  action(id,type,data){const p=this.players.get(id);if(!p||!p.connected)return false;
    if(type==='ready'&&this.phase==='lobby'){p.ready=data===true;return true}
    if(type==='start'&&this.phase==='lobby'){const joined=[...this.players.values()];if(id!==this.host||joined.length<2||joined.some(x=>!x.connected||!x.ready))return false;this.phase='countdown';this.countdown=3;return true}
    if(type==='rematch'&&this.phase==='finished'&&id===this.host){this.phase='lobby';this.winner='';for(const q of this.players.values()){q.ready=false;q.input=emptyInput()}return true}
    if(this.phase!=='playing'||p.hp<=0)return false;
    if(type==='shoot'){if(!data||!Number.isFinite(data.yaw)||!Number.isFinite(data.pitch)||Math.abs(data.yaw)>1e6)return false;p.yaw=data.yaw%(Math.PI*2);p.pitch=clamp(data.pitch,-1.25,1.25);this.shoot(p);this.checkWinner();return true}
    if(type==='collect'){if(this.now-p.collectAt<.15)return false;p.collectAt=this.now;let closest=null,distance=3.1;for(const item of this.loot){if(item.taken)continue;const d=Math.hypot(item.x-p.x,item.z-p.z);if(d<distance&&W.visible({x:p.x,y:1.7,z:p.z},{x:item.x,y:.45,z:item.z})){closest=item;distance=d}}const old=p.equipped;if(closest&&R.collect(p,closest)){if(old!==p.equipped)p.reload=p.heal=0;this.events.push({type:'collect',id:p.id,item:closest.id});return true}return false}
    if(type==='equip'&&typeof data==='string'&&Object.hasOwn(R.weapons,data)&&R.held(p,data)&&data!==p.equipped){p.equipped=data;p.reload=p.heal=0;return true}
    if(type==='reload'){const w=R.weapons[p.equipped],s=p.weapons[p.equipped];if(!w||w.melee||!s||p.reload||s.ammo>=w.mag||p.reserve<=0)return false;p.reload=w.reload;p.heal=0;return true}
    if(type==='heal'){if(p.heal||p.kits<=0||p.hp>=100)return false;p.heal=3;p.reload=0;return true}
    if(type==='throw'){if(!data||!R.throwables[data.kind]||!Number.isFinite(data.yaw)||!Number.isFinite(data.pitch)||Math.abs(data.yaw)>1e6)return false;
      if(this.now-p.throwAt<.45)return false;p.yaw=data.yaw%(Math.PI*2);p.pitch=clamp(data.pitch,-1.25,1.25);
      if(!R.takeThrowable(p,data.kind))return false;p.throwAt=this.now;p.heal=0;
      const spec=R.throwables[data.kind],g=W.throwGrenade(data.kind,p.x,1.55,p.z,p.yaw,p.pitch,spec.fuse);
      g.id='nade-'+(++this.serial);g.owner=p.id;this.grenades.push(g);this.events.push({type:'throw',id:p.id,kind:data.kind,nade:g.id});return true}
    return false;
  }
  startRound(){this.phase='playing';this.time=0;this.round++;this.winner='';this.loot=W.loot(seed??undefined);this.grenades=[];const roll=seed===null?Math.random:W.rng(seed);let i=0;for(const p of this.players.values()){Object.assign(p,R.newPlayer(),{reload:0,heal:0,cooldown:0,throwAt:-1,input:emptyInput(),lastSeq:0});const[x,z]=W.spawns[i++];p.x=x;p.z=z;p.yaw=Math.atan2(-x,-z)||0;p.pitch=0;
    // Everyone starts bare-handed; the guaranteed cache is a sprint away in a direction nobody can predict.
    const[cx,cz]=W.cacheSpot(x,z,roll);const drops=[['weapon',0,0,W.randomWeapon(roll)],['ammo',.9,.5,null],['med',-.9,.5,null],['vest',0,-1.1,null],['helmet',-1.5,-.6,null]];
    for(const[type,ox,oz,weapon]of drops){let lx=cx+ox,lz=cz+oz;if(W.blocked(lx,lz,.1)){lx=cx;lz=cz}this.loot.push({id:'spawn-'+p.id+'-'+type,type,x:lx,z:lz,weapon,amount:60,taken:false})}}
    this.events.push({type:'round',round:this.round});}
  shoot(p){const w=R.weapons[p.equipped],slot=p.weapons[p.equipped];if(!w||p.cooldown>0||p.reload>0)return;if(!w.melee){if(!slot)return;if(slot.ammo<=0){this.action(p.id,'reload');return}slot.ammo--}p.cooldown=w.interval;p.heal=0;const origin={x:p.x,y:1.7,z:p.z},cos=Math.cos(p.pitch),dir={x:Math.sin(p.yaw)*cos,y:-Math.sin(p.pitch),z:Math.cos(p.yaw)*cos};let distance=W.wallDistance(origin,dir,w.range),victim=null,head=false;
    for(const q of this.players.values()){if(q===p||q.hp<=0)continue;const body=W.rayBox(origin,dir,{x:q.x,y:.84,z:q.z,w:.25,h:.675,d:.25},distance),top=W.rayBox(origin,dir,{x:q.x,y:1.67,z:q.z,w:.16,h:.16,d:.16},distance);const hit=Math.min(body,top);if(hit<distance){distance=hit;victim=q;head=top<body}}
    const endpoint={x:origin.x+dir.x*distance,y:origin.y+dir.y*distance,z:origin.z+dir.z*distance};this.events.push({type:'shot',id:p.id,from:origin,to:endpoint,hit:victim?.id||'',head,melee:!!w.melee});if(victim){R.damage(victim,w.damage*(head?(w.melee?1.5:2.5):1),false,head);victim.heal=0;if(victim.hp<=0)this.kill(victim,p,'사격');}
  }
  kill(p,killer,cause){p.hp=0;p.input=emptyInput();p.reload=p.heal=0;if(killer)killer.kills++;this.events.push({type:'death',id:p.id,name:p.name,killer:killer?.id||'',killerName:killer?.name||cause});const add=(type,offset,weapon=null,amount=30)=>this.loot.push({id:'drop-'+(++this.serial),type,x:p.x+offset,z:p.z,weapon,amount,taken:false});if(p.equipped&&!R.innate(p.equipped))add('weapon',0,p.equipped);if(p.reserve)add('ammo',.65,null,Math.min(p.reserve,180));if(p.kits)add('med',-.65);if(p.frags)add('frag',.35);if(p.flashes)add('flash',-.35);if(p.helmet>0)add('helmet',1.1);if(p.vest>0)add('vest',-1.1);}
  checkWinner(){if(this.phase!=='playing')return;const alive=[...this.players.values()].filter(p=>p.hp>0);if(alive.length<=1){this.phase='finished';this.winner=alive[0]?.id||'';for(const p of this.players.values())p.input=emptyInput();this.events.push({type:'finished',winner:this.winner});}}
  step(dt=.05){dt=clamp(dt,0,.05);this.now+=dt;if(this.phase==='countdown'){const all=[...this.players.values()];if(all.length<2||all.some(p=>!p.connected)){this.phase='lobby';return}this.countdown-=dt;if(this.countdown<=0)this.startRound();return}if(this.phase!=='playing')return;this.time+=dt;const zone=R.zoneAt(this.time);
    for(const p of this.players.values()){if(p.hp<=0)continue;p.cooldown=Math.max(0,p.cooldown-dt);if(R.outsideZone(p.x,p.z,zone)){R.damage(p,zone.dps*dt,true);if(p.hp<=0){this.kill(p,null,'자기장');continue}}if(p.blind>0)p.blind=Math.max(0,p.blind-dt);if(p.reload>0){p.reload=Math.max(0,p.reload-dt);if(p.reload<1e-6){p.reload=0;R.reload(p)}}if(p.heal>0){p.heal=Math.max(0,p.heal-dt);if(p.heal<1e-6){p.heal=0;R.heal(p)}}const input=p.connected&&this.now-p.inputAt<.3?p.input:emptyInput();p.yaw=input===p.input?input.yaw:p.yaw;p.pitch=input===p.input?input.pitch:p.pitch;let x=input.x,z=input.z,len=Math.hypot(x,z);if(len>1){x/=len;z/=len}const speed=p.heal?1.8:input.aim?2.7:input.sprint?7:4.8;W.move(p,(x*Math.cos(p.yaw)+z*Math.sin(p.yaw))*speed*dt,(-x*Math.sin(p.yaw)+z*Math.cos(p.yaw))*speed*dt);if(input.fire)this.shoot(p);
    }
    this.stepGrenades(dt);this.checkWinner();
  }
  // Ordnance runs after movement so a blast lands where the fuse actually ran out.
  stepGrenades(dt){for(let i=this.grenades.length-1;i>=0;i--){const g=this.grenades[i];if(W.stepGrenade(g,dt))continue;this.grenades.splice(i,1);this.detonate(g)}}
  detonate(g){this.events.push({type:'blast',kind:g.kind,x:g.x,y:g.y,z:g.z,id:g.owner||''});
    for(const q of this.players.values()){if(q.hp<=0)continue;const{distance,clear}=W.blastExposure(g,q);if(!clear)continue;
      const hurt=R.blastDamage(g.kind,distance);if(hurt>0){R.damage(q,hurt);q.heal=0;if(q.hp<=0){const killer=g.owner&&g.owner!==q.id?this.players.get(g.owner):null;this.kill(q,killer||null,'폭발')}}
      const blind=R.blastBlind(g.kind,distance,W.facing(q,g));if(blind>q.blind)q.blind=blind;}}
  snapshot(id){const me=this.players.get(id);return{version:1,phase:this.phase,host:this.host,time:this.time,countdown:Math.max(0,this.countdown),round:this.round,winner:this.winner,players:[...this.players.values()].map(p=>({id:p.id,name:p.name,x:p.x,z:p.z,yaw:p.yaw,pitch:p.pitch,hp:p.hp,connected:p.connected,ready:p.ready,equipped:p.equipped,kills:p.kills,helmet:p.helmet>0,vest:p.vest>0})),me:me?{...R.newPlayer(),hp:me.hp,helmet:me.helmet,vest:me.vest,kits:me.kits,reserve:me.reserve,weapons:me.weapons,equipped:me.equipped,kills:me.kills,frags:me.frags,flashes:me.flashes,blind:me.blind,reload:me.reload,heal:me.heal,seq:me.lastSeq}:null,loot:this.loot.filter(l=>!l.taken),grenades:this.grenades.map(g=>({id:g.id,kind:g.kind,x:g.x,y:g.y,z:g.z}))};}
}
module.exports={Battle};
// Round state can be saved/restored without rendering objects or browser APIs.
Battle.prototype.serialize=function(){return JSON.stringify({players:[...this.players],phase:this.phase,host:this.host,time:this.time,now:this.now,countdown:this.countdown,round:this.round,loot:this.loot,grenades:this.grenades,serial:this.serial,winner:this.winner})};
Battle.restore=function(json){const data=typeof json==='string'?JSON.parse(json):json,b=new Battle();for(const key of ['phase','host','time','now','countdown','round','loot','grenades','serial','winner'])if(data[key]!==undefined)b[key]=data[key];b.players=new Map(data.players);return b};
