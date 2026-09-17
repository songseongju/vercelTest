/* Shared gameplay rules; also exercised by the headless regression checks. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.BattleRules=factory()})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const weapons={
  fists:{name:'맨손',label:'근접 공격',mag:0,damage:27,interval:.44,reload:0,range:2.4,color:'#cfd8d2',melee:true},
  carbine:{name:'AR-4',label:'돌격소총',mag:30,damage:32,interval:.12,reload:1.9,range:110,color:'#e5b949'},
  smg:{name:'V-9',label:'기관단총',mag:35,damage:23,interval:.075,reload:1.5,range:70,color:'#62b9e5'},
  marksman:{name:'DMR-7',label:'지정사수소총',mag:10,damage:65,interval:.48,reload:2.3,range:150,color:'#c39bea'}
};
const stages=[{wait:35,shrink:40,radius:50,dps:2},{wait:25,shrink:35,radius:30,dps:4},{wait:20,shrink:30,radius:15,dps:7},{wait:15,shrink:30,radius:4,dps:11},{wait:10,shrink:25,radius:0,dps:18}];
function zoneAt(time){let remaining=Math.max(0,time),radius=78;for(let i=0;i<stages.length;i++){const s=stages[i];if(remaining<s.wait)return{radius,target:s.radius,phase:i+1,closing:false,seconds:s.wait-remaining,dps:s.dps};remaining-=s.wait;if(remaining<s.shrink){return{radius:radius+(s.radius-radius)*remaining/s.shrink,target:s.radius,phase:i+1,closing:true,seconds:s.shrink-remaining,dps:s.dps}}remaining-=s.shrink;radius=s.radius}return{radius:0,target:0,phase:5,closing:true,seconds:0,dps:24}}
function outsideZone(x,z,zone){return Math.hypot(x,z)>zone.radius}
function damage(actor,amount,bypassArmor=false){amount=Math.max(0,amount);const absorbed=bypassArmor?0:Math.min(actor.armor||0,amount*.65);actor.armor=Math.max(0,(actor.armor||0)-absorbed);actor.hp=Math.max(0,actor.hp-(amount-absorbed));return amount-absorbed}
function newPlayer(){return{hp:100,armor:0,kits:0,reserve:0,weapons:{},equipped:'fists',kills:0}}
// Fists are always held, are never loot, and are never dropped on death.
function melee(id){return weapons[id]?.melee===true}
function held(p,id){return melee(id)||!!p.weapons[id]}
function collect(p,item){if(item.taken)return false;if(item.type==='weapon'){const w=weapons[item.weapon];if(!w||w.melee)return false;if(p.weapons[item.weapon])p.reserve+=w.mag;else{p.weapons[item.weapon]={ammo:w.mag};p.equipped=item.weapon}}else if(item.type==='ammo')p.reserve+=item.amount||60;else if(item.type==='med'){if(p.kits>=5)return false;p.kits++}else if(item.type==='armor'){if(p.armor>=100)return false;p.armor=100}else return false;item.taken=true;return true}
function reload(p){const w=weapons[p.equipped],slot=p.weapons[p.equipped];if(!w||w.melee||!slot)return 0;const amount=Math.min(w.mag-slot.ammo,p.reserve);slot.ammo+=amount;p.reserve-=amount;return amount}
function heal(p){if(!p.kits||p.hp>=100)return false;p.kits--;p.hp=Math.min(100,p.hp+65);return true}
return{weapons,stages,zoneAt,outsideZone,damage,newPlayer,melee,held,collect,reload,heal};
});
