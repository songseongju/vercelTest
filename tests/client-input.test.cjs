const test=require('node:test');const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');const B=require('../vendor/babylon.js');
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../vendor/babylonjs.loaders.min.js'),'utf8'),{BABYLON:B,console,TextDecoder,TextEncoder,URL,Blob,AbortController,setTimeout,clearTimeout});
B.SceneLoader.OnPluginActivatedObservable.add(p=>{p.skipMaterials=true});
class TestEngine extends B.NullEngine{constructor(){super({renderWidth:1000,renderHeight:600,textureSize:512});this.getCaps().maxVertexUniformVectors=1024}runRenderLoop(cb){this.loop=cb}resize(){}}
const noop=()=>{},ctx=new Proxy({measureText:()=>({width:50})},{get:(o,k)=>o[k]||noop,set:(o,k,v)=>(o[k]=v,true)});
class TestImage extends B.Texture{constructor(name,scene){super(null,scene)}}
class TestTexture extends B.Texture{constructor(name,size,scene){super(null,scene)}getContext(){return ctx}update(){}}
const listeners={};function listen(type,fn){(listeners[type]??=[]).push(fn)};const els={};const element=id=>els[id]??={style:{},textContent:'',hidden:false,classList:{toggle:noop,add:noop,remove:noop},getContext:()=>ctx,querySelector:()=>element(id+'child'),addEventListener(type,fn){(this.events??={})[type]=fn},setPointerCapture(){throw Object.assign(Error('capturing under lock'),{name:'InvalidStateError'})},getBoundingClientRect:()=>({left:0,top:0,width:100,height:100})};
const bytes=new Uint8Array(fs.readFileSync(require('node:path').join(__dirname,'../assets/soldier.glb')));
const sandbox={console,Math,Map,Set,Float32Array,Int16Array,Uint8Array,performance:{now:()=>0},setTimeout,clearTimeout,window:{devicePixelRatio:1,BABYLON:true,BattleRules:require('../rules.js'),BattleWorld:require('../shared/world.js')},BABYLON:{...B,Engine:TestEngine,DynamicTexture:TestTexture,Texture:TestImage,SceneLoader:{LoadAssetContainerAsync:(_root,_name,scene)=>B.LoadAssetContainerAsync(bytes,scene,{pluginExtension:'.glb'})}},document:{getElementById:element,body:{classList:{toggle:noop,add:noop,remove:noop}},addEventListener:noop,querySelector:()=>element('desktop-help')},navigator:{},matchMedia:()=>({matches:true}),addEventListener:listen};
const BOTS=23;
test('client gameplay survives pointer-lock shooting and mobile controls',async(t)=>{sandbox.window.createFieldEnvironment=()=>({materials:{},quality:noop,mapBox:noop,tree:noop,surface:()=>new B.StandardMaterial('fixture')});const BINDINGS={collect:'KeyF',reload:'KeyR',heal:'Digit4',flash:'Digit5',frag:'Digit6',swap:'KeyQ',view:'KeyV',fists:'Digit1',melee:'Digit2',gun:'Digit3',forward:'KeyW',back:'KeyS',left:'KeyA',right:'KeyD',sprint:'ShiftLeft',jump:'Space',crouch:'KeyC',prone:'KeyZ'};
const KEYLABEL=code=>code.startsWith('Key')?code.slice(3):code.startsWith('Digit')?code.slice(5):code;
sandbox.window.GameControls={isTouch:()=>true,keyLabel:a=>KEYLABEL(BINDINGS[a]||''),code:a=>BINDINGS[a],actionFor:code=>Object.keys(BINDINGS).find(a=>BINDINGS[a]===code)||null,connect:hooks=>hooks.changed()};vm.createContext(sandbox);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../loot-visuals.js'),'utf8'),sandbox);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../viewmodel.js'),'utf8'),sandbox);let src=fs.readFileSync(require('node:path').join(__dirname,'../game.js'),'utf8');src=src.replace('loadCharacters();','globalThis.characterLoading=loadCharacters();').replace(/\}\)\(\);\s*$/,'globalThis.api={run:code=>eval(code)};})();');vm.runInContext(src,sandbox);await sandbox.characterLoading;const run=sandbox.api.run;t.after(()=>run('scene.dispose();engine.dispose()'));assert.equal(run('charactersReady'),true);assert.equal(run('highQuality'),false);assert.equal(run('scene.shadowsEnabled'),false);assert.equal(run('engine.getHardwareScalingLevel()'),1);run('resetRound();scene.render()');assert.equal(run('enemies.length'),BOTS);assert.ok(run('enemies.every(e=>e.rig.Head&&e.rig.RightHand&&e.rig.LeftHand)'));assert.equal(run('new Set(enemies.map(e=>e.skeletons[0])).size'),BOTS,'independent skeletons');assert.equal(run('Object.keys(enemies[0].animations).length'),3);
assert.equal(run("player.equipped"),'fists','everyone starts bare-handed');
assert.ok(run("enemies.every(e=>e.equipped==='fists'&&!e.helmet&&!e.vest&&!e.frags)"),'and so do the bots');
assert.ok(run("enemies.every(e=>!e.rifle.isEnabled()&&!e.blade.isEnabled())"),'nobody holds a gun at the drop');
// Bare hands must fight: swing at a bot standing within arm's reach.
run('enemies[0].root.position.set(0,0,-50);enemies[0].hp=100;enemies[0].armor=0;camera.position.set(0,1.7,-51.6);yaw=0;pitch=0;camera.rotation.set(0,0,0);shotTimer=0;scene.render();shoot()');
assert.ok(run('enemies[0].hp<100'),'fists damage a bot in reach');assert.equal(run('player.reserve'),0,'fists consume no ammo');
run('globalThis.dented=enemies[0].hp;enemies[0].root.position.set(0,0,-20);shotTimer=0;camera.position.set(0,1.7,-51.6);camera.rotation.set(0,0,0);scene.render();shoot()');
assert.equal(run('enemies[0].hp'),run('dented'),'a punch with nobody in reach lands on nothing');
// Randomised loot: find the carbine this round actually placed instead of assuming a fixed spot.
run("const g=loot.find(l=>l.type==='weapon'&&l.weapon==='carbine'&&!l.taken);camera.position.set(g.x,1.7,g.z);camera.rotation.set(0,0,0);shotTimer=0;scene.render();collect();shoot()");
assert.equal(run('player.weapons.carbine.ammo'),29);assert.equal(run("player.equipped"),'carbine');
sandbox.document.pointerLockElement=element('world');run('touch=false;shotTimer=0');assert.doesNotThrow(()=>element('world').events.pointerdown({button:0,pointerId:1,clientX:50,clientY:50}));run('tick(.02)');for(const fn of listeners.pointerup||[])fn({button:0,pointerId:1});assert.equal(run('player.weapons.carbine.ammo'),28);assert.equal(run('held'),false);sandbox.document.pointerLockElement=null;run('touch=true');
run('player.reserve=60;reload();for(let i=0;i<41;i++){tick(.05);scene.render()}');assert.equal(run('player.weapons.carbine.ammo'),30);
// Hitboxes remain aligned with the animated head and register on an invisible collision mesh.
run('enemies[0].root.position.set(0,0,-40);enemies[0].root.rotation.y=Math.PI;scene.render()');assert.ok(run('enemies[0].headHit.position.y>1.45&&enemies[0].headHit.position.y<2'));
assert.equal(run('scene.pickWithRay(new B.Ray(new V(0,enemies[0].headHit.position.y,-44),new V(0,0,1),5),m=>m===enemies[0].headHit).hit'),true);
run('pause()');const old=run('time');run('tick(1);scene.render()');assert.equal(run('time'),old);run('resume();modelAnimation(enemies[0],"Run");scene.render()');assert.equal(run('enemies[0].motion'),'Run');
run('die(enemies[0],"player");scene.render()');assert.equal(run('corpses.length'),1);assert.equal(run('corpses[0].e.headHit.isPickable'),false);run('resetRound();scene.render()');assert.equal(run('corpses.length'),0);assert.equal(run('enemies.length'),BOTS);assert.equal(run('scene.animationGroups.filter(a=>a.name.startsWith("bot")&& !a.name.startsWith("bot0_")).length'),BOTS*4,'restart must not leak animation groups');
run('for(const e of [...enemies])die(e,"player")');
assert.equal(run('state'),'outro','the round plays out before the results screen');
assert.equal(run("$('outro').hidden"),false,'the victory card is up');
assert.equal(run("$('outro-tag').textContent"),'#1 LAST SURVIVOR');
run('for(let i=0;i<140&&state==="outro";i++){tick(.05);scene.render()}');
assert.equal(run('state'),'won','and hands over to the results screen when it finishes');
assert.equal(run("$('outro').hidden"),true);
// A placed pickup is merged down to one draw call, so the detail is checked on the builder itself.
assert.ok(run("loot.every(l=>l.root.getChildMeshes().length===1)"),'every pickup is a single mesh');
const parts=type=>run("(()=>{const r=lootVisuals.create("+JSON.stringify(type)+");const n=r.getChildMeshes().map(m=>m.name);r.dispose();return n})()");
assert.ok(parts('med').includes('carry handle'),'medkits keep their carry handle');
assert.equal(parts('vest').filter(n=>n==='shoulder strap').length,2,'vests keep their straps');
assert.ok(parts('helmet').includes('helmet shell'),'helmets render as helmets');
assert.ok(parts('frag').includes('frag body')&&parts('frag').includes('pull ring'),'frags look like frags');
assert.ok(parts('flash').includes('stun canister'),'flashbangs look like flashbangs');
assert.ok(run("loot.some(l=>l.type==='frag')||loot.some(l=>l.type==='flash')"),'throwables reach the ground');
assert.equal(run("loot.some(l=>l.type==='armor')"),false,'the old single armour item is gone');run("resetRound();scene.render();const m=loot.find(l=>l.type==='med'&&!l.taken);camera.position.set(m.x,1.7,m.z);scene.render();searchLoot();");element('pickup').onclick();assert.equal(run('player.kits'),1,'tap pickup card collects med');run("const v=loot.find(l=>l.type==='vest'&&!l.taken);camera.position.set(v.x,1.7,v.z);scene.render();searchLoot();");element('loot').onclick();assert.equal(run('player.vest'),100,'touch button collects the vest');
run("const h=loot.find(l=>l.type==='helmet'&&!l.taken);camera.position.set(h.x,1.7,h.z);scene.render();searchLoot();collect();");assert.equal(run('player.helmet'),100,'helmets are a separate pickup');
// Worn gear has to show up on the body, not just in the numbers.
run('state="playing";ads=false;thirdPerson=false;toggleView();placeView(false)');
assert.equal(run('selfBody.gearHelmet.isEnabled()'),true,'the helmet appears on your own body');
assert.equal(run('selfBody.gearVest.isEnabled()'),true,'so does the vest');
run("const k=loot.find(l=>l.type==='weapon'&&l.weapon==='knife'&&!l.taken);if(k){camera.position.set(k.x,1.7,k.z);scene.render();collect()}");
if(run("player.equipped==='knife'")){
  run('placeView(false)');
  assert.equal(run('selfBody.blade.isEnabled()'),true,'a drawn blade shows in the hands');
  assert.equal(run('selfBody.rifle.isEnabled()'),false,'and the rifle goes away');
  run('thirdPerson=false;updateGun()');
  assert.equal(run('bladeView.isEnabled()'),true,'first person shows the blade view model');
  const before=run('punchTimer');run('shotTimer=0;shoot()');
  assert.ok(run('punchTimer')>before,'swinging drives the arm animation');
}
run('thirdPerson=false;ads=false;updateGun();placeView(false)');
// Third person must swap the rendering camera without moving the eye the shot ray comes from.
run('state="playing";ads=false;camera.position.set(0,1.7,-51.6);camera.rotation.set(0,0,0);const eye=camera.position.clone();toggleView();placeView(false);');assert.equal(run('thirdPerson'),true);assert.equal(run('scene.activeCamera===viewCam'),true);assert.ok(run('V.Distance(viewCam.position,camera.position)>1'),'shoulder camera sits behind the eye');run('ads=true;placeView(false)');assert.equal(run('scene.activeCamera===camera'),true,'aiming snaps back to first person');run('ads=false;toggleView();placeView(false)');assert.equal(run('scene.activeCamera===camera'),true);
// The drop ring sits 92m out; the client used to fence the world at 68m and freeze everyone there.
run('resetRound();scene.render()');
assert.ok(run('Math.hypot(camera.position.x,camera.position.z)>80'),'players drop on the outer ring');
assert.equal(run('blocked(camera.position.x,camera.position.z,.4)'),false,'the drop point is walkable');
for(const[x,z]of sandbox.window.BattleWorld.spawns)assert.equal(run(`blocked(${x},${z},.4)`),false,'every spawn uses shared collision bounds');
run('touch=false;move.x=move.y=0;globalThis.from=camera.position.clone();keys.add(controls.code("forward"));for(let i=0;i<14;i++)tick(.05);keys.delete(controls.code("forward"))');
assert.ok(run('V.Distance(from,camera.position)')>2,'holding forward has to actually move the player');
run('globalThis.side=camera.position.clone();keys.add(controls.code("right"));for(let i=0;i<10;i++)tick(.05);keys.clear()');
assert.ok(run('V.Distance(side,camera.position)')>1,'strafing works from the bound key too');
// Test actual input handlers: repeat key events must restore held movement after a reset.
run('resetRound();globalThis.inputStart=camera.position.clone();touch=false');
const press={code:'KeyW',repeat:false,preventDefault(){}};
for(const fn of listeners.keydown)fn(press);
run('for(let i=0;i<8;i++)tick(.05)');
assert.ok(run('V.Distance(inputStart,camera.position)>1'),'keydown moves the character');
run('clearInput();globalThis.inputStart=camera.position.clone()');
for(const fn of listeners.keydown)fn({...press,repeat:true});
run('for(let i=0;i<8;i++)tick(.05)');
assert.ok(run('V.Distance(inputStart,camera.position)>1'),'holding a key recovers after input reset');
for(const fn of listeners.keyup)fn(press);
assert.equal(run('pressed("forward")'),false,'releasing W stops movement');
// Mobile pad uses the very same walkable spawn and collision rules.
run('resetRound();touch=true;globalThis.padStart=camera.position.clone()');
sandbox.window.GameControls.capturePointer=()=>false;
element('stick').events.pointerdown({pointerId:8,clientX:50,clientY:14,preventDefault(){}});
run('for(let i=0;i<8;i++)tick(.05)');
assert.ok(run('V.Distance(padStart,camera.position)>1'),'touch stick moves away from spawn');
for(const fn of listeners.pointerup)fn({pointerId:8});
assert.equal(run('move.y'),0,'releasing the stick stops movement');
// Worn armour hangs off the skeleton now, facing the way the soldier faces.
run("player.helmet=100;player.vest=100;state='playing';ads=false;thirdPerson=false;toggleView();placeView(false);scene.render()");
assert.equal(run('selfBody.gearHelmet.isEnabled()'),true);
assert.equal(run('selfBody.gearVest.isEnabled()'),true);
assert.ok(run('selfBody.gearHelmet.position.y>1.5&&selfBody.gearHelmet.position.y<2'),'the helmet rides the head bone');
assert.ok(run('selfBody.gearVest.position.y>1&&selfBody.gearVest.position.y<1.65'),'the vest rides the chest bone');
assert.ok(run("selfBody.gearVest.getChildMeshes().find(m=>m.name==='chest plate').position.z>0"),'the chest plate is on the chest, not the back');
assert.ok(run("selfBody.gearHelmet.getChildMeshes().find(m=>m.name==='nape guard').position.z<0"),'the nape guard is behind the head');
assert.ok(run('!!selfBody.socketChest&&!!selfBody.socketHead'),'both sockets resolved to real bones');
run('thirdPerson=false;ads=false;updateGun();placeView(false)');
// Throwables: a frag leaves the pouch, flies, detonates and leaves a blast behind.
run("resetRound();scene.render();player.frags=1;player.flashes=1;yaw=0;pitch=0;throwItem('frag')");
assert.equal(run('grenades.length'),1,'the frag is in the air');
assert.equal(run('player.frags'),0,'and out of the pouch');
run('for(let i=0;i<90&&grenades.length;i++){tick(.05);scene.render()}');
assert.equal(run('grenades.length'),0,'the fuse runs out');
assert.ok(run('effects.length')>0,'a detonation leaves a blast behind');
run("player.blind=0;detonate({kind:'flash',x:camera.position.x+2,y:.5,z:camera.position.z,owner:'other'})");
assert.ok(run('player.blind')>0,'a flash at your feet blinds you');
run("player.flashes=0;throwItem('flash')");
assert.equal(run('grenades.length'),0,'an empty pouch throws nothing');
// Impact roll must expire, even when the player changes pitch/yaw after the blast.
run('resetRound();camera.position.set(0,1.7,-60);yaw=.3;pitch=.2;thirdPerson=false;recoil=0;detonate({kind:"flash",x:2,y:.5,z:-60});');
assert.ok(run('shake')>0);
run('for(let i=0;i<16;i++){clock+=.05;orientView(.05);camera.getViewMatrix(true)}');
assert.equal(run('shake'),0);assert.equal(run('camera.rotation.z'),0);assert.equal(run('yaw'),.3);assert.equal(run('pitch'),.2);
for(const [y,p]of [[2,.85],[-2,-.8],[0,0]]){
 run(`yaw=${y};pitch=${p};orientView(.05);camera.getViewMatrix(true)`);
 assert.ok(run('V.Distance(camera.upVector,V.TransformNormal(V.Up(),B.Matrix.RotationYawPitchRoll(yaw,pitch,0)))<.00001'),'view up vector follows the new aim after a blast');
}
run('shake=.07;pause();scene.render()');assert.equal(run('camera.rotation.z'),0);run('resume()');
// Real key and touch handlers, not just the movement helper.
const motionKey=code=>{for(const fn of listeners.keydown)fn({code,repeat:false,preventDefault(){}});for(const fn of listeners.keyup)fn({code});};
motionKey('KeyC');run('tick(.05)');assert.equal(run('player.stance'),'crouch');assert.ok(run('camera.position.y<1.2'));
motionKey('KeyC');assert.equal(run('player.stance'),'stand');
motionKey('KeyZ');run('tick(.05)');assert.equal(run('player.stance'),'prone');assert.ok(run('camera.position.y<.6'));
element('prone').onclick();assert.equal(run('player.stance'),'stand');
motionKey('Space');run('tick(.05)');assert.ok(run('player.feet>0'));const velocity=run('player.vy');motionKey('Space');assert.equal(run('player.vy'),velocity);
run('for(let i=0;i<22;i++)tick(.05)');assert.equal(run('player.grounded'),true);assert.equal(run('player.feet'),0);
element('crouch').onclick();assert.equal(run('player.stance'),'crouch');element('jump').onclick();assert.equal(run('player.stance'),'stand');assert.ok(run('player.vy>0'));
run('for(let i=0;i<22;i++)tick(.05);thirdPerson=true;motionAction("crouch");placeView(false);scene.render()');assert.ok(run('selfBody.posture.position.y<-.5'));
run('motionAction("prone");placeView(false);scene.render()');assert.ok(run('selfBody.posture.rotation.x>1.5'));assert.ok(run('selfBody.rig.LeftFoot.getAbsolutePosition().y<.65&&selfBody.rig.RightFoot.getAbsolutePosition().y<.65'),'prone must release the bent crouch legs');
run('motionAction("prone");placeView(false);scene.render()');assert.equal(run('selfBody.posture.rotation.x'),0);assert.equal(run('selfBody.posture.position.y'),0);
run('thirdPerson=false;updateGun();placeView(false)');

// Dying plays out too, then falls through to the defeat screen.
run("resetRound();scene.render();player.blind=0;hurt(500,'테스트')");
assert.equal(run('state'),'outro');
assert.equal(run("$('outro-tag').textContent"),'ELIMINATED');
run('for(let i=0;i<120&&state==="outro";i++){tick(.05);scene.render()}');
assert.equal(run('state'),'lost');
assert.equal(run("$('outro').hidden"),true);
// Supplies are indoors only, and a bot has to walk into a building to arm itself.
run('resetRound();scene.render()');
assert.ok(run("loot.length>60"),'the buildings are stocked');
assert.ok(run("loot.every(l=>W.interiors.some(r=>Math.abs(l.x-r.x)<=r.w/2&&Math.abs(l.z-r.z)<=r.d/2))"),'nothing spawns in the open');
assert.ok(run("scene.meshes.some(m=>m.name==='shelf deck')&&scene.meshes.some(m=>m.name==='locker body')"),'rooms are furnished');
assert.ok(run("scene.meshes.filter(m=>m.name==='lamp tube').length>=W.interiors.length"),'every room is lit');
// Stand a bot on a rifle: it should pick it up, hold it, and show it on the body.
run("globalThis.scav=enemies[0];globalThis.shelved=loot.find(l=>l.type==='weapon'&&!R.melee(l.weapon)&&!l.taken);scav.root.position.set(shelved.x,0,shelved.z);scav.hunt=null;scav.huntTimer=5;scav.target=null");
run('for(let i=0;i<8;i++){tick(.05);scene.render()}');
assert.equal(run('shelved.taken'),true,'the bot took the rifle off the shelf');
assert.equal(run('scav.equipped'),run('shelved.weapon'),'and is holding it');
assert.equal(run('scav.rifle.isEnabled()'),true,'the rifle shows on the body');
// Bare hands cannot reach across the map; an unarmed bot has to close in first.
run("globalThis.brawler=enemies[1];brawler.equipped='fists';brawler.weapons={};brawler.hp=100;brawler.blind=0;brawler.attack=0;brawler.hunt=null;brawler.huntTimer=99;camera.position.set(brawler.root.position.x,1.7,brawler.root.position.z+34);time=40;globalThis.untouched=player.hp");
run('for(let i=0;i<12;i++)tick(.05)');
assert.equal(run('player.hp'),run('untouched'),'fists do nothing at thirty metres');
// A dead bot hands its gear back to the field.
run("globalThis.stock=loot.length;scav.helmet=100;scav.kits=1;die(scav,'player')");
assert.ok(run('loot.length')>run('stock'),'a dead bot drops what it carried');
console.log('PASS: fists, randomised loot, third-person camera, actual GLB load, 23 independent skeletons, idle/walk/run clips, posed hands/head bounds, head hit detection, loot/fire/reload, pause, corpse cleanup, restart without animation leaks, win.');});