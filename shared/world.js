(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.BattleWorld=factory()})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const buildings=[[-17,-35,10,11],[20,-30,12,10],[-25,22,13,12],[25,31,10,12]];
const cargos=[[-19,-4,6,12,'#617e87'],[20,2,6,12,'#aa7556'],[-43,-22,6,10,'#6f826b'],[44,23,6,10,'#687ca0']];
const barriers=[[-8,-15,5],[10,18,5],[-8,34,5],[36,-12,6],[-36,0,5],[9,-40,4]];
const crates=[[-13,-46],[16,-42],[-35,15],[31,18],[-12,42],[43,-32]];
const trees=[];for(let i=0;i<32;i++){const a=i/32*Math.PI*2,r=57+(i%3)*5;trees.push([Math.sin(a)*r,Math.cos(a)*r,.85+(i%4)*.14])}for(const p of [[-35,-42],[40,-47],[-43,34],[40,45],[-11,12],[13,42]])trees.push([...p,.9]);
const colliders=[];
function block(x,y,z,w,h,d,movement=true){colliders.push({x,y,z,w:w/2,h:h/2,d:d/2,movement})}
for(const [x,z,w,d]of buildings){block(x,1.8,z+d/2,w,3.6,.35);block(x-w/2,1.8,z,.35,3.6,d);block(x+w/2,1.8,z,.35,3.6,d);const piece=(w-3.6)/2;for(const s of [-1,1])block(x+s*(1.8+piece/2),1.8,z-d/2,piece,3.6,.35);block(x,3.3,z-d/2,3.6,.6,.35,false);block(x,3.75,z,w+1,.28,d+1,false)}
for(const[x,z,w,d]of cargos)block(x,1.5,z,w,3,d);
for(const[x,z,w]of barriers)block(x,.65,z,w,1.3,1.2);
for(const[x,z]of crates)block(x,.6,z,1.4,1.2,1.4);
for(const[x,z,s]of trees)block(x,1.8*s,z,.6,3.6*s,.6);
function blocked(x,z,r=.4){return Math.abs(x)>68-r||Math.abs(z)>68-r||colliders.some(o=>o.movement&&Math.abs(x-o.x)<o.w+r&&Math.abs(z-o.z)<o.d+r)}
function move(p,dx,dz,r=.4){if(!blocked(p.x+dx,p.z,r))p.x+=dx;if(!blocked(p.x,p.z+dz,r))p.z+=dz}
function rayBox(origin,dir,o,max=Infinity){let near=0,far=max;for(const [axis,half]of [['x','w'],['y','h'],['z','d']]){if(Math.abs(dir[axis])<1e-8){if(origin[axis]<o[axis]-o[half]||origin[axis]>o[axis]+o[half])return Infinity}else{let a=(o[axis]-o[half]-origin[axis])/dir[axis],b=(o[axis]+o[half]-origin[axis])/dir[axis];if(a>b)[a,b]=[b,a];near=Math.max(near,a);far=Math.min(far,b);if(near>far)return Infinity}}return near}
function wallDistance(origin,dir,max=Infinity){let distance=max;for(const o of colliders)distance=Math.min(distance,rayBox(origin,dir,o,distance));if(dir.y<0){const t=(.02-origin.y)/dir.y;if(t>=0)distance=Math.min(distance,t)}return distance}
function visible(a,b){const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,length=Math.hypot(dx,dy,dz);return length<.01||wallDistance(a,{x:dx/length,y:dy/length,z:dz/length},length)>=length-.05}
const spawns=[[0,-52],[0,52],[-52,0],[52,0],[-38,-38],[38,38],[-38,38],[38,-38]];
function loot(){let serial=0;const items=[],add=(type,x,z,weapon=null,amount=60)=>items.push({id:'map-'+serial++,type,x,z,weapon,amount,taken:false});add('weapon',0,-48,'carbine');add('ammo',1.1,-47.5);add('med',-1.1,-47.5);add('armor',0,-46.1);for(const[x,z,id]of [[-17,-34,'marksman'],[20,-29,'smg'],[-25,23,'carbine'],[25,32,'marksman'],[-39,-17,'smg'],[42,17,'carbine'],[-5,27,'marksman'],[5,3,'smg']]){add('weapon',x,z,id);add('ammo',x+1.3,z);add('med',x-1.3,z);add('armor',x,z+1.7)}for(const[x,z]of [[-7,-18],[9,-37],[37,-16],[-35,4],[-12,43],[12,16]])add('ammo',x,z);return items}
return{buildings,cargos,barriers,crates,trees,colliders,spawns,blocked,move,rayBox,wallDistance,visible,loot};
});
