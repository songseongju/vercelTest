(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.BattleWorld=factory()})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
// The arena is 208m across. Every array below is both the collision source and the render recipe,
// so the server and the browser always agree on where cover actually is.
const EDGE=104;
const buildings=[[-70,-74,12,12],[-22,-78,14,12],[30,-80,12,12],[74,-70,12,12],[-78,-32,12,12],[-24,-38,12,12],[26,-34,14,12],[76,-30,12,12],[-76,28,12,12],[-28,26,14,12],[30,30,12,12],[78,26,12,12],[-66,76,14,12],[22,78,12,12]];
// Depots are large enough to fight inside: a door on the south face and one on the east.
const depots=[[24,-8,26,20],[-62,2,22,18],[62,64,22,18]];
const cargos=[[-46,-58,6,13,'#617e87'],[-38,-58,6,13,'#aa7556'],[44,-52,6,13,'#6f826b'],[52,-52,6,13,'#687ca0'],[-52,50,6,13,'#8a6f55'],[-44,50,6,13,'#5f7d86'],[46,-6,6,13,'#7a8463'],[-4,44,13,6,'#6d7f9c'],[-4,52,13,6,'#9c7a58'],[64,-62,6,13,'#617e87'],[-86,60,6,13,'#6f826b'],[88,-44,6,13,'#687ca0'],[8,-58,13,6,'#7c6f86'],[-88,-8,6,13,'#6a8072']];
const barriers=[[-12,-18,5],[6,-26,5],[-10,34,5],[40,-14,6],[-40,2,5],[10,-46,4],[-56,-30,5],[58,18,5],[-30,60,5],[34,56,6],[-72,50,5],[70,-6,5],[0,-30,6],[-14,68,5],[18,-66,5],[-64,-50,5],[62,40,5],[86,10,5]];
const crates=[[-16,-50],[18,-46],[-38,18],[34,20],[-14,46],[46,-36],[-58,-64],[60,-70],[-80,-50],[82,-58],[-84,44],[86,48],[6,-20],[-6,16],[24,-8],[-30,-8],[52,30],[-52,32],[14,64],[-20,-64],[70,68],[-72,-20],[40,84],[-46,86]];
// Sandbag lines are chest high: cover from a standing shot, but you can fire over them.
const sandbags=[[-20,-24,6,1.3],[20,-24,6,1.3],[0,-48,1.3,6],[0,20,6,1.3],[-44,-20,1.3,6],[44,-20,1.3,6],[-34,44,6,1.3],[36,44,6,1.3],[-66,10,6,1.3],[66,10,1.3,6],[12,-72,6,1.3],[-12,72,6,1.3],[54,-24,6,1.3],[-54,-40,6,1.3]];
// Wire fencing stops a sprint and a low shot; a marksman on a roof still has the angle.
const fences=[[-50,-34,28,.5],[50,-40,28,.5],[-50,58,28,.5],[52,52,28,.5],[-34,-2,.5,26],[34,6,.5,26],[-2,-66,.5,22],[6,66,.5,22],[-92,-40,.5,24],[92,40,.5,24]];
const towers=[[-88,-88],[88,-88],[-88,88],[88,88],[0,-52],[-48,52]];
const tanks=[[-56,-78,4],[-46,-78,4],[56,78,4],[66,78,4],[90,-8,4.5],[-90,30,4.5]];
const rocks=[[-62,-14,1.6],[64,-12,1.8],[-16,10,1.3],[18,8,1.5],[-42,-66,2],[44,66,2.1],[-84,6,1.7],[84,4,1.6],[-8,-88,1.9],[10,88,1.8],[-70,-40,1.4],[72,-42,1.5],[-30,-56,1.6],[30,-58,1.4],[-60,36,1.7],[58,-32,1.5]];
const ruins=[[-40,-44,10,.6,2.4],[40,-44,.6,10,2.4],[-40,44,.6,10,2.2],[42,46,10,.6,2.6],[-74,-6,8,.6,2.2],[76,-2,.6,8,2.4],[-8,32,9,.6,2],[8,-38,.6,9,2.3],[-90,-64,8,.6,2.2],[92,58,.6,8,2.4]];
const trees=[];
for(let i=0;i<48;i++){const a=i/48*Math.PI*2,r=96+(i%4)*1.6;trees.push([Math.sin(a)*r,Math.cos(a)*r,.9+(i%4)*.12])}
for(const[cx,cz]of [[-36,-16],[38,-4],[-18,58],[16,34],[-72,-58],[68,-52],[-82,70],[80,72]])
  for(let i=0;i<4;i++){const a=i/4*Math.PI*2+cx*.07;trees.push([cx+Math.sin(a)*4.6,cz+Math.cos(a)*4.6,.85+(i%3)*.16])}
const colliders=[];
function block(x,y,z,w,h,d,movement=true){colliders.push({x,y,z,w:w/2,h:h/2,d:d/2,movement})}
// A hut: three closed walls, a doorway in the south face, and a roof you can shoot from.
for(const [x,z,w,d]of buildings){block(x,1.8,z+d/2,w,3.6,.35);block(x-w/2,1.8,z,.35,3.6,d);block(x+w/2,1.8,z,.35,3.6,d);const piece=(w-3.6)/2;for(const s of [-1,1])block(x+s*(1.8+piece/2),1.8,z-d/2,piece,3.6,.35);block(x,3.3,z-d/2,3.6,.6,.35,false);block(x,3.75,z,w+1,.28,d+1,false)}
// A depot: taller shell with a wide south door and an east door, plus two interior pillars.
for(const[x,z,w,d]of depots){
  block(x,2.6,z+d/2,w,5.2,.4);block(x-w/2,2.6,z,.4,5.2,d);
  const side=(d-6)/2;for(const s of [-1,1])block(x+w/2,2.6,z+s*(3+side/2),.4,5.2,side);
  const piece=(w-6)/2;for(const s of [-1,1])block(x+s*(3+piece/2),2.6,z-d/2,piece,5.2,.4);
  block(x,4.6,z-d/2,6,1.2,.4,false);block(x+w/2,4.6,z,.4,1.2,6,false);
  block(x,5.45,z,w+1.4,.3,d+1.4,false);
  for(const s of [-1,1])block(x+s*w*.24,2.6,z,.6,5.2,.6);
}
for(const[x,z,w,d]of cargos)block(x,1.5,z,w,3,d);
for(const[x,z,w]of barriers)block(x,.65,z,w,1.3,1.2);
for(const[x,z]of crates)block(x,.6,z,1.4,1.2,1.4);
for(const[x,z,w,d]of sandbags)block(x,.55,z,w,1.1,d);
for(const[x,z,w,d]of fences)block(x,.9,z,w,1.8,d);
// A watchtower: four legs you can hide between and a platform overhead.
for(const[x,z]of towers){for(const sx of [-1,1])for(const sz of [-1,1])block(x+sx*1.7,2.6,z+sz*1.7,.45,5.2,.45);block(x,5.4,z,5.2,.4,5.2,false);for(const sx of [-1,1])block(x+sx*2.4,6.1,z,.25,1.4,5.2,false);for(const sz of [-1,1])block(x,6.1,z+sz*2.4,5.2,1.4,.25,false)}
for(const[x,z,r]of tanks)block(x,3.2,z,r*2,6.4,r*2);
for(const[x,z,s]of rocks)block(x,s*.8,z,s*1.9,s*1.6,s*1.8);
for(const[x,z,w,d,h]of ruins)block(x,h/2,z,w,h,d);
for(const[x,z,s]of trees)block(x,1.8*s,z,.6,3.6*s,.6);
function rng(seed){let a=(seed>>>0)||1;return()=>{a=(a+0x6D2B79F5)>>>0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296}}
function blocked(x,z,r=.4){return Math.abs(x)>EDGE-r||Math.abs(z)>EDGE-r||colliders.some(o=>o.movement&&Math.abs(x-o.x)<o.w+r&&Math.abs(z-o.z)<o.d+r)}
function move(p,dx,dz,r=.4){if(!blocked(p.x+dx,p.z,r))p.x+=dx;if(!blocked(p.x,p.z+dz,r))p.z+=dz}
function rayBox(origin,dir,o,max=Infinity){let near=0,far=max;for(const [axis,half]of [['x','w'],['y','h'],['z','d']]){if(Math.abs(dir[axis])<1e-8){if(origin[axis]<o[axis]-o[half]||origin[axis]>o[axis]+o[half])return Infinity}else{let a=(o[axis]-o[half]-origin[axis])/dir[axis],b=(o[axis]+o[half]-origin[axis])/dir[axis];if(a>b)[a,b]=[b,a];near=Math.max(near,a);far=Math.min(far,b);if(near>far)return Infinity}}return near}
function wallDistance(origin,dir,max=Infinity){let distance=max;for(const o of colliders)distance=Math.min(distance,rayBox(origin,dir,o,distance));if(dir.y<0){const t=(.02-origin.y)/dir.y;if(t>=0)distance=Math.min(distance,t)}return distance}
function visible(a,b){const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,length=Math.hypot(dx,dy,dz);return length<.01||wallDistance(a,{x:dx/length,y:dy/length,z:dz/length},length)>=length-.05}
// Sixteen drop points on a ring. A drop point needs elbow room and a clear run toward the
// middle of the map, not just a square metre nobody is standing in.
function runway(x,z,angle,want=9){let px=x,pz=z;for(let step=0;step<want/.3;step++){const nx=px+Math.sin(angle)*.3,nz=pz+Math.cos(angle)*.3;if(blocked(nx,nz,.5))return false;px=nx;pz=nz}return true}
const spawns=[];
for(let i=0;i<16;i++){const base=i/16*Math.PI*2;let best=null;
  outer:for(let r=93;r>44&&!best;r-=2)for(const drift of [0,.05,-.05,.1,-.1,.16,-.16]){
    const a=base+drift,x=Math.sin(a)*r,z=Math.cos(a)*r;
    if(blocked(x,z,3.4))continue;
    if(!runway(x,z,Math.atan2(-x,-z)))continue;
    best=[x,z];break outer}
  if(!best){let x=0,z=0;for(let r=92;r>40;r-=2){x=Math.sin(base)*r;z=Math.cos(base)*r;if(!blocked(x,z,1.4))break}best=[x,z]}
  spawns.push(best)}
// Roadside furniture and scrap, scattered from a fixed seed so every browser and the server
// agree on exactly where the cover is. Placed after the spawn ring so nobody lands on a wreck.
const wrecks=[],drums=[],pallets=[],tyres=[];
const hubs=[...depots.map(([x,z])=>[x,z]),...buildings.map(([x,z])=>[x,z]),...cargos.map(([x,z])=>[x,z]),...towers,[0,0],[0,42],[0,-42],[42,10],[-42,10],[58,-30],[-58,30],[0,72],[0,-76]];
const scatter=rng(20260917);
function scatterProp(list,count,reach,clearance,build){
  for(let made=0,guard=0;made<count&&guard<count*60;guard++){
    const[hx,hz]=hubs[Math.floor(scatter()*hubs.length)];
    const a=scatter()*Math.PI*2,r=7+scatter()*reach;
    const x=hx+Math.sin(a)*r,z=hz+Math.cos(a)*r;
    if(Math.abs(x)>EDGE-8||Math.abs(z)>EDGE-8||blocked(x,z,clearance))continue;
    if(spawns.some(([sx,sz])=>Math.hypot(x-sx,z-sz)<11))continue;
    list.push(build(x,z));made++;
  }
}
// A wreck is axis-aligned so its collision box is exactly the shape players see.
scatterProp(wrecks,12,16,3.6,(x,z)=>{const along=scatter()<.5,kind=scatter()<.45?'truck':scatter()<.75?'van':'car';
  const length=kind==='truck'?7.2:kind==='van'?5.2:4.3,width=kind==='truck'?2.6:2.1;
  const w=along?length:width,d=along?width:length;block(x,.95,z,w,1.9,d);return[x,z,w,d,kind,along?1:0]});
scatterProp(drums,26,14,1.1,(x,z)=>{block(x,.46,z,.92,.92,.92);return[x,z,scatter()<.5?'#7d5a3a':'#4d6473']});
scatterProp(pallets,16,13,1.6,(x,z)=>{const h=.55+Math.floor(scatter()*3)*.28;block(x,h/2,z,1.35,h,1.15);return[x,z,h]});
scatterProp(tyres,12,13,1.3,(x,z)=>{const stack=3+Math.floor(scatter()*3);block(x,stack*.14,z,1.12,stack*.28,1.12);return[x,z,stack]});
// Utility poles and lamp standards follow the two main roads and carry the skyline.
// Everything here keeps well clear of a drop point: nobody should land facing a guard rail.
const poles=[],lamps=[],rails=[];
const clearOfSpawns=(x,z,min=13)=>spawns.every(([sx,sz])=>Math.hypot(x-sx,z-sz)>=min);
function furniture(list,x,z,y,w,h,d,extra=[]){if(!clearOfSpawns(x,z)||blocked(x,z,Math.min(w,d)/2+.7))return;list.push([x,z,...extra]);block(x,y,z,w,h,d)}
for(let i=-4;i<=4;i++){const z=i*22;if(Math.abs(z)<=84)furniture(poles,-8.6,z,4.4,.4,8.8,.4)}
for(let i=-4;i<=4;i++){const x=i*24;if(Math.abs(x)<=84)furniture(poles,x,20.6,4.4,.4,8.8,.4)}
for(let i=-5;i<=5;i++){const z=i*15+7;if(Math.abs(z)<=82)furniture(lamps,7.4,z,3,.28,6,.28,[1])}
for(const[x,z,w,d]of [[0,-78,26,.4],[0,80,26,.4],[-30,10,.4,22],[30,10,.4,22],[-74,10,26,.4],[74,10,26,.4]])furniture(rails,x,z,.6,w,1.2,d,[w,d]);
// Thrown ordnance: one physics step shared by the browser round and the authoritative server.
const GRAVITY=17,GRENADE_TOP=4.4;
function throwGrenade(kind,x,y,z,yaw,pitch,fuse,power=21){
  const cos=Math.cos(pitch);
  return{kind,x,y,z,vx:Math.sin(yaw)*cos*power,vy:-Math.sin(pitch)*power+3.2,vz:Math.cos(yaw)*cos*power,fuse,spin:0};
}
// Returns false on the tick the fuse runs out, so both sides detonate at the same place.
function stepGrenade(g,dt){
  g.fuse-=dt;g.spin+=dt*8.5;g.vy-=GRAVITY*dt;
  let nx=g.x+g.vx*dt,ny=g.y+g.vy*dt,nz=g.z+g.vz*dt;
  if(ny<.14){ny=.14;if(g.vy<0){g.vy=-g.vy*.34;g.vx*=.6;g.vz*=.6;if(g.vy<1.2){g.vy=0;g.vx*=.4;g.vz*=.4}}}
  if(Math.abs(nx)>EDGE-.3){nx=g.x;g.vx*=-.4}
  if(Math.abs(nz)>EDGE-.3){nz=g.z;g.vz*=-.4}
  if(ny<GRENADE_TOP&&blocked(nx,nz,.2)){
    if(!blocked(nx,g.z,.2)){nz=g.z;g.vz*=-.42}
    else if(!blocked(g.x,nz,.2)){nx=g.x;g.vx*=-.42}
    else{nx=g.x;nz=g.z;g.vx*=-.35;g.vz*=-.35}
  }
  g.x=nx;g.y=ny;g.z=nz;
  return g.fuse>0;
}
// How exposed an actor is to a blast: 0 when a wall is in the way or it is out of range.
function blastExposure(g,actor,eye=1.15){
  const dx=actor.x-g.x,dy=eye-g.y,dz=actor.z-g.z,distance=Math.hypot(dx,dy,dz);
  if(!visible({x:g.x,y:Math.max(.25,g.y),z:g.z},{x:actor.x,y:eye,z:actor.z}))return{distance,clear:false};
  return{distance,clear:true};
}
// 1 when the actor is staring straight at the flash, 0 when it is behind them.
function facing(actor,g){
  const cos=Math.cos(actor.pitch||0),view={x:Math.sin(actor.yaw||0)*cos,y:-Math.sin(actor.pitch||0),z:Math.cos(actor.yaw||0)*cos};
  const dx=g.x-actor.x,dy=g.y-1.15,dz=g.z-actor.z,length=Math.hypot(dx,dy,dz)||1;
  const dot=(view.x*dx+view.y*dy+view.z*dz)/length;
  return Math.max(0,Math.min(1,(dot+.35)/1.35));
}
const weaponPool=['carbine','carbine','smg','smg','marksman'];
const groundPool=['carbine','carbine','smg','smg','marksman','knife','knife','machete'];
const pick=(list,random)=>list[Math.min(list.length-1,Math.floor(random()*list.length))];
// The guaranteed starter cache always holds a firearm; blades are a map find.
function randomWeapon(random=Math.random){return pick(weaponPool,random)}
function randomGroundWeapon(random=Math.random){return pick(groundPool,random)}
// A spot players can actually walk onto: inside the field, clear of geometry and away from every spawn.
function freeSpot(random,cx,cz,spread,clearSpawns=13,tries=30){
  for(let i=0;i<tries;i++){
    const angle=random()*Math.PI*2,radius=Math.sqrt(random())*spread;
    const x=cx+Math.sin(angle)*radius,z=cz+Math.cos(angle)*radius;
    if(Math.abs(x)>EDGE-6||Math.abs(z)>EDGE-6||blocked(x,z,.8))continue;
    if(clearSpawns&&spawns.some(([sx,sz])=>Math.hypot(x-sx,z-sz)<clearSpawns))continue;
    return[x,z];
  }
  return null;
}
// Each player gets a guaranteed starter cache, but it is a run away and in a random direction.
function cacheSpot(x,z,random=Math.random){
  for(let i=0;i<40;i++){
    const angle=random()*Math.PI*2,radius=14+random()*10;
    const cx=x+Math.sin(angle)*radius,cz=z+Math.cos(angle)*radius;
    if(Math.abs(cx)>EDGE-4||Math.abs(cz)>EDGE-4||blocked(cx,cz,1.1))continue;
    return[cx,cz];
  }
  const fallback=freeSpot(random,x,z,22,0);return fallback||[x,z];
}
function loot(seed){
  const random=typeof seed==='number'?rng(seed):Math.random;
  let serial=0;const items=[];
  const add=(type,x,z,weapon=null,amount=60)=>items.push({id:'map-'+serial++,type,x,z,weapon,amount,taken:false});
  const hotspots=[...buildings.map(([x,z])=>[x,z,7]),...depots.map(([x,z,w])=>[x,z,w*.45]),...cargos.map(([x,z])=>[x,z,5.5]),...towers.map(([x,z])=>[x,z,6]),[0,0,13],[-86,-84,10],[86,84,10],[-86,84,10],[86,-84,10]];
  for(const[cx,cz,spread]of hotspots){
    const count=1+Math.floor(random()*2);
    for(let i=0;i<count;i++){
      const spot=freeSpot(random,cx,cz,spread);if(!spot)continue;
      const roll=random();
      if(roll<.32)add('weapon',spot[0],spot[1],randomGroundWeapon(random));
      else if(roll<.54)add('ammo',spot[0],spot[1],null,45+Math.floor(random()*4)*15);
      else if(roll<.7)add('med',spot[0],spot[1]);
      else if(roll<.83)add(random()<.5?'helmet':'vest',spot[0],spot[1]);
      else add(random()<.5?'frag':'flash',spot[0],spot[1]);
    }
  }
  for(let i=0;i<34;i++){
    const spot=freeSpot(random,0,0,94);if(!spot)continue;
    const roll=random();
    if(roll<.24)add('weapon',spot[0],spot[1],randomGroundWeapon(random));
    else if(roll<.5)add('ammo',spot[0],spot[1],null,45+Math.floor(random()*4)*15);
    else if(roll<.68)add('med',spot[0],spot[1]);
    else if(roll<.84)add(random()<.5?'helmet':'vest',spot[0],spot[1]);
    else add(random()<.5?'frag':'flash',spot[0],spot[1]);
  }
  // A round is unplayable if the map is short of guns, so top up whatever the rolls missed.
  for(let guard=0;items.filter(x=>x.type==='weapon').length<22&&guard<90;guard++){
    const spot=freeSpot(random,0,0,94);if(spot)add('weapon',spot[0],spot[1],randomGroundWeapon(random));
  }
  return items;
}
return{EDGE,buildings,depots,cargos,barriers,crates,sandbags,fences,towers,tanks,rocks,ruins,trees,wrecks,drums,pallets,tyres,poles,lamps,rails,colliders,spawns,blocked,move,rayBox,wallDistance,visible,loot,rng,randomWeapon,randomGroundWeapon,freeSpot,cacheSpot,throwGrenade,stepGrenade,blastExposure,facing};
});
