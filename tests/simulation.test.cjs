const test=require('node:test'),assert=require('node:assert/strict');
const {Battle}=require('../server/simulation.cjs'),W=require('../shared/world.js');
function game(){const b=new Battle();b.add('a','Alpha');b.add('b','Bravo');b.action('a','ready',true);b.action('b','ready',true);assert.equal(b.action('a','start'),true);for(let i=0;i<61;i++)b.step();return b}
test('lobby requires two ready players and only host can start',()=>{const b=new Battle();b.add('a','A');assert.equal(b.action('a','start'),false);b.add('b','B');b.action('a','ready',true);assert.equal(b.action('a','start'),false);b.action('b','ready',true);assert.equal(b.action('b','start'),false);assert.equal(b.action('a','start'),true);assert.throws(()=>b.add('c','C'));});
test('server caps movement, rejects NaN/replayed input, times out held input',()=>{const b=game(),p=b.players.get('a'),z=p.z;assert.equal(b.input('a',{x:0,z:999,yaw:0,pitch:0,seq:1}),true);b.step();assert.ok(p.z-z<=.241);assert.equal(b.input('a',{x:0,z:1,yaw:0,pitch:0,seq:1}),false);assert.equal(b.input('a',{x:NaN,z:1,yaw:0,pitch:0,seq:2}),false);for(let i=0;i<10;i++)b.step();const stop=p.z;b.step();assert.equal(p.z,stop);});
test('shared world blocks walls but permits doors and respects ray cover',()=>{assert.equal(W.blocked(-17,-40.5),false);assert.equal(W.blocked(-21,-40.5),true);assert.equal(W.visible({x:-21,y:1.7,z:-42},{x:-21,y:1.7,z:-39}),false);assert.equal(W.visible({x:-17,y:1.7,z:-42},{x:-17,y:1.7,z:-39}),true);});
test('loot is awarded once; distance and walls prevent remote collection',()=>{const b=game(),a=b.players.get('a'),c=b.players.get('b');b.loot=[{id:'one',type:'weapon',weapon:'carbine',x:0,z:0}];a.x=c.x=0;a.z=c.z=0;assert.equal(b.action('a','collect'),true);assert.equal(b.action('b','collect'),false);assert.equal(a.weapons.carbine.ammo,30);b.loot=[{id:'far',type:'med',x:30,z:0}];assert.equal(b.action('a','collect'),false);});
test('server shoots, limits fire rate, cancels healing, ends the match',()=>{const b=game(),a=b.players.get('a'),p=b.players.get('b');a.x=p.x=0;a.z=0;p.z=5;a.equipped='carbine';a.weapons.carbine={ammo:30};a.yaw=0;a.pitch=.05;p.heal=3;b.shoot(a);assert.equal(a.weapons.carbine.ammo,29);assert.ok(p.hp<100);assert.equal(p.heal,0);b.shoot(a);assert.equal(a.weapons.carbine.ammo,29);for(let i=0;i<10&&p.hp>0;i++){a.cooldown=0;b.shoot(a)}b.checkWinner();assert.equal(p.hp,0);assert.equal(a.kills,1);assert.equal(b.phase,'finished');assert.equal(b.winner,'a');});
test('cover stops authoritative hits; disconnected input stops and host changes',()=>{const b=game(),a=b.players.get('a'),p=b.players.get('b');a.x=p.x=-21;a.z=-42;p.z=-39;a.yaw=0;a.pitch=0;a.equipped='carbine';a.weapons.carbine={ammo:30};b.shoot(a);assert.equal(p.hp,100);b.setConnected('a',false);assert.equal(b.host,'b');assert.equal(b.input('a',{x:1,z:0,yaw:0,pitch:0,seq:1}),false);});
test('server completes reload and healing, applies shrinking zone damage',()=>{const b=game(),a=b.players.get('a');a.equipped='carbine';a.weapons.carbine={ammo:1};a.reserve=40;assert.equal(b.action('a','reload'),true);for(let i=0;i<40;i++)b.step();assert.equal(a.weapons.carbine.ammo,30);assert.equal(a.reserve,11);a.hp=20;a.kits=1;b.action('a','heal');for(let i=0;i<61;i++)b.step();assert.equal(a.hp,85);assert.equal(a.kits,0);b.time=240;a.x=60;a.z=0;a.armor=100;b.step();assert.ok(a.hp<85);assert.equal(a.armor,100);});
test('a round can move to another process without losing authoritative state',()=>{const a=game();a.action('a','collect');a.step();const b=Battle.restore(a.serialize());assert.deepEqual(b.snapshot('a'),a.snapshot('a'));a.step();b.step();assert.deepEqual(b.snapshot('a'),a.snapshot('a'));});

const R=require('../rules.js');
test('loot is scattered randomly, never inside geometry and never on top of a spawn',()=>{
  for(const seed of [3,11,404]){
    const items=W.loot(seed);
    assert.ok(items.filter(i=>i.type==='weapon').length>=10,'a round must hold enough guns for eight players');
    assert.ok(items.every(i=>!W.blocked(i.x,i.z,.4)),'every item must be reachable');
    assert.ok(items.every(i=>W.spawns.every(([x,z])=>Math.hypot(i.x-x,i.z-z)>=13)),'nothing may drop at a spawn point');
    assert.deepEqual(W.loot(seed),items,'a seed reproduces its layout');
  }
  assert.notDeepEqual(W.loot(3),W.loot(4));
  assert.notDeepEqual(W.loot(),W.loot(),'unseeded rounds differ');
});

test('every round moves the starter cache and nobody spawns holding a gun',()=>{
  const seen=new Set();
  for(let round=0;round<12;round++){
    const b=game(),p=b.players.get('a');
    assert.equal(p.equipped,'fists');assert.deepEqual(p.weapons,{});assert.equal(p.helmet,0);assert.equal(p.vest,0);
    const cache=b.loot.filter(l=>l.id.startsWith('spawn-a-'));
    assert.equal(cache.length,5,'weapon, ammo, medkit, vest and helmet');
    assert.deepEqual(cache.map(l=>l.type).sort(),['ammo','helmet','med','vest','weapon']);
    const weapon=cache.find(l=>l.type==='weapon');
    const reach=Math.hypot(weapon.x-p.x,weapon.z-p.z);
    assert.ok(reach>12&&reach<27,'the cache is a run away, not underfoot: '+reach.toFixed(1));
    assert.ok(R.weapons[weapon.weapon]&&!R.weapons[weapon.weapon].melee);
    seen.add(weapon.x.toFixed(3)+','+weapon.z.toFixed(3));
  }
  assert.ok(seen.size>8,'cache placement must not repeat every round, saw '+seen.size+' of 12');
});

test('bare hands fight, cost nothing and are never an item',()=>{
  const b=game(),a=b.players.get('a'),c=b.players.get('b');
  a.x=0;a.z=0;a.yaw=0;a.pitch=.62;c.x=0;c.z=1.5;c.hp=100;c.armor=0;
  assert.equal(b.action('a','reload'),false,'fists never reload');
  assert.equal(b.action('a','equip','fists'),false,'already in hand');
  assert.equal(b.action('a','equip','carbine'),false,'cannot equip a gun nobody picked up');
  b.shoot(a);assert.equal(c.hp,73,'a body blow lands for 27');
  assert.equal(a.reserve,0);assert.equal(a.weapons.fists,undefined,'fists use no magazine');
  b.shoot(a);assert.equal(c.hp,73,'the swing is on cooldown');
  a.cooldown=0;c.z=9;b.shoot(a);assert.equal(c.hp,73,'out of reach');
  a.cooldown=0;c.z=1.5;c.hp=5;b.shoot(a);
  assert.equal(c.hp,0);assert.equal(a.kills,1);
  assert.equal(b.loot.some(l=>l.id.startsWith('drop-')&&l.type==='weapon'),false,'fists are not dropped');
  assert.equal(b.loot.some(l=>l.type==='weapon'&&l.weapon==='fists'),false,'fists never spawn as loot');
  assert.equal(R.collect(a,{type:'weapon',weapon:'fists',taken:false}),false,'fists cannot be picked up');
});

test('picking up a gun takes it out of bare hands and death returns it to the map',()=>{
  const b=game(),a=b.players.get('a');
  const cache=b.loot.find(l=>l.id==='spawn-a-weapon');
  a.x=cache.x;a.z=cache.z;
  assert.equal(b.action('a','collect'),true);
  assert.equal(a.equipped,cache.weapon);
  assert.equal(a.weapons[cache.weapon].ammo,R.weapons[cache.weapon].mag);
  assert.equal(b.action('a','equip','fists'),true,'players can go back to their fists');
  assert.equal(a.equipped,'fists');
  assert.equal(b.action('a','equip',cache.weapon),true);
  b.kill(a,null,'테스트');
  assert.ok(b.loot.some(l=>l.id.startsWith('drop-')&&l.type==='weapon'&&l.weapon===cache.weapon),'the gun drops, the fists do not');
});

test('a helmet stops head shots and a vest stops body shots, each wearing down on its own',()=>{
  const b=game(),a=b.players.get('a'),c=b.players.get('b');
  c.helmet=100;c.vest=100;c.hp=100;
  a.x=0;a.z=0;a.yaw=0;a.pitch=0;c.x=0;c.z=1.5;
  b.shoot(a);                                   // fists at eye level land on the head
  assert.ok(c.helmet<100,'the helmet takes the hit');
  assert.equal(c.vest,100,'the vest is untouched by a head shot');
  const worn=c.helmet;
  a.cooldown=0;a.pitch=.62;b.shoot(a);           // aimed low, this is a body blow
  assert.equal(c.helmet,worn,'a body blow leaves the helmet alone');
  assert.ok(c.vest<100,'the vest takes the hit');
  // The zone ignores armour entirely.
  const before={h:c.helmet,v:c.vest};R.damage(c,10,true);
  assert.deepEqual({h:c.helmet,v:c.vest},before);
});

test('helmet and vest drop as separate pickups and are refused when already full',()=>{
  const b=game(),a=b.players.get('a');
  assert.equal(R.collect(a,{type:'helmet',taken:false}),true);
  assert.equal(a.helmet,100);
  assert.equal(R.collect(a,{type:'helmet',taken:false}),false,'a full helmet slot refuses another');
  assert.equal(R.collect(a,{type:'vest',taken:false}),true);
  assert.equal(a.vest,100);
  b.kill(a,null,'테스트');
  const dropped=b.loot.filter(l=>l.id.startsWith('drop-')).map(l=>l.type);
  assert.ok(dropped.includes('helmet')&&dropped.includes('vest'),'both pieces come off the body: '+dropped);
});

test('blades are lootable melee weapons, unlike fists',()=>{
  const b=game(),a=b.players.get('a'),c=b.players.get('b');
  assert.equal(R.collect(a,{type:'weapon',weapon:'knife',taken:false}),true);
  assert.equal(a.equipped,'knife');
  assert.equal(a.weapons.knife.ammo,0,'a blade carries no rounds');
  assert.equal(b.action('a','reload'),false,'blades never reload');
  assert.equal(R.collect(a,{type:'weapon',weapon:'knife',taken:false}),false,'a duplicate blade is left on the ground');
  // Aim at the chest from 2.7m: inside the knife's 2.9m reach but beyond a fist's 2.4m.
  a.x=0;a.z=0;a.yaw=0;a.pitch=Math.atan2(1.7-.84,2.7);c.x=0;c.z=2.7;c.hp=100;c.helmet=c.vest=0;
  b.shoot(a);
  assert.equal(c.hp,100-R.weapons.knife.damage,'a knife reaches further than a fist');
  const reached=c.hp;a.cooldown=0;a.equipped='fists';b.shoot(a);
  assert.equal(c.hp,reached,'a fist cannot reach that far');
  a.equipped='knife';
  b.kill(a,null,'테스트');
  assert.ok(b.loot.some(l=>l.id.startsWith('drop-')&&l.weapon==='knife'),'a blade drops on death');
});
