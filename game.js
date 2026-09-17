'use strict';
(() => {
const $=id=>document.getElementById(id),canvas=$('world'),start=$('start'),R=window.BattleRules,controls=window.GameControls,boot=window.GameBoot,W=window.BattleWorld;
function startupFailure(message,error){$('error').textContent=message;boot?.fail(message,error?.message||'')}
if(!window.BABYLON||!R||!controls||!window.createLootVisuals||!window.createFirstPersonRig||!W){startupFailure('게임 파일을 불러오지 못했습니다. 페이지를 새로고침해 주세요.');return}
const B=BABYLON,V=B.Vector3,C=B.Color3;const mobileDevice=matchMedia('(pointer:coarse)').matches||(navigator.maxTouchPoints||0)>0;let fieldEnvironment=null;const detail=!(mobileDevice||boot?.safe);let touch=controls.isTouch(),highQuality=!mobileDevice&&!boot?.safe,engine,scene;
try{engine=new B.Engine(canvas,highQuality,{stencil:false,powerPreference:mobileDevice?'default':'high-performance'});scene=new B.Scene(engine)}catch(error){startupFailure('3D 화면을 시작할 수 없습니다. 실행 진단에서 3D 기능을 확인해 주세요.',error);return}
function quality(){const dpr=Math.min(window.devicePixelRatio||1,highQuality?(mobileDevice?1.25:2):1);scene.shadowsEnabled=highQuality;fieldEnvironment?.quality(highQuality);engine.setHardwareScalingLevel(1/dpr);$('quality').textContent=highQuality?'화질: 선명':'화질: 성능';engine.resize()}
quality();$('quality').onclick=()=>{highQuality=!highQuality;quality()};
scene.clearColor=new B.Color4(.54,.62,.67,1);scene.fogMode=B.Scene.FOGMODE_LINEAR;scene.fogStart=135;scene.fogEnd=620;scene.fogColor=new C(.62,.67,.68);scene.skipPointerMovePicking=true;
scene.imageProcessingConfiguration.toneMappingEnabled=true;scene.imageProcessingConfiguration.toneMappingType=B.ImageProcessingConfiguration.TONEMAPPING_ACES;scene.imageProcessingConfiguration.contrast=1.08;scene.imageProcessingConfiguration.exposure=1.15;
const camera=new B.FreeCamera('player',new V(-11,6,-61),scene);camera.minZ=.06;camera.maxZ=700;camera.fov=1.08;camera.rotation.set(.05,.28,0);scene.activeCamera=camera;
// `camera` stays the player's eye and keeps driving movement, aiming and every gameplay query.
// Third person only swaps which camera renders, so the authoritative shot ray never changes.
const viewCam=new B.FreeCamera('shoulder',new V(-11,6,-61),scene);viewCam.minZ=.06;viewCam.maxZ=700;viewCam.fov=1.08;
let thirdPerson=false,selfBody=null,netMoving=false;
const sky=new B.HemisphericLight('daylight',new V(0,1,0),scene);sky.intensity=.32;sky.diffuse=new C(.8,.87,1);sky.groundColor=new C(.19,.18,.15);
const sun=new B.DirectionalLight('sun',new V(-.6,-1,.4),scene);sun.position.set(40,65,-40);sun.intensity=2.1;sun.diffuse=new C(1,.91,.77);
// A 208m field cannot afford a shadow pass over the whole map: keep a tight box around the player
// so everything else is frustum-culled out of the shadow render.
sun.autoUpdateExtends=false;sun.autoCalcShadowZBounds=false;sun.shadowMinZ=1;sun.shadowMaxZ=190;
for(const [key,value] of [['orthoLeft',-42],['orthoRight',42],['orthoTop',42],['orthoBottom',-42]])sun[key]=value;
function followSun(target){sun.position.set(target.x+50,84,target.z-34)}
const shadow=new B.ShadowGenerator(mobileDevice||boot?.safe?512:1024,sun);shadow.usePercentageCloserFiltering=true;shadow.filteringQuality=B.ShadowGenerator.QUALITY_LOW;shadow.bias=.0015;shadow.normalBias=.035;
function mat(name,hex,emission=0){const m=new B.StandardMaterial(name,scene);m.diffuseColor=C.FromHexString(hex);m.specularColor=new C(.08,.08,.08);if(emission)m.emissiveColor=m.diffuseColor.scale(emission);m.freeze();return m}
const M={grass:mat('grass','#7c925b'),road:mat('road','#737b7a'),concrete:mat('concrete','#c5c6b5'),cream:mat('plaster','#e7dfc4'),roof:mat('roof','#567c85'),dark:mat('gunmetal','#26333b'),steel:mat('steel','#637885'),wood:mat('wood','#a67c4d'),leaf:mat('leaf','#557b45'),leaf2:mat('leaf light','#769954'),bark:mat('bark','#806c4c'),yellow:mat('paint','#f2c660'),white:mat('white','#f0f1e3'),skin:mat('skin','#cda17f'),cloth:mat('enemy jacket','#bb7b4e'),pants:mat('enemy pants','#4b6056'),helmet:mat('helmet','#626e54'),glass:mat('glass','#456c7b'),ammo:mat('ammo','#dbb351',.15),med:mat('medical','#6bb4a2',.1),armor:mat('armor','#75bada',.1),purple:mat('rare','#b599d2',.15),flash:mat('muzzle','#ffe2a6',1.4)};
fieldEnvironment=window.createFieldEnvironment(B,scene,shadow,mobileDevice||boot?.safe);Object.assign(M,fieldEnvironment.materials);fieldEnvironment.quality(highQuality);
for(const [key,color,metal,rough]of [['dark','#353b40',.8,.36],['steel','#929b9d',.8,.43],['glass','#263b43',.65,.2],['puddle','#2e3a38',.12,.06]]){const m=new B.PBRMaterial(key,scene);m.albedoColor=C.FromHexString(color);m.metallic=metal;m.roughness=rough;M[key]=m}
const obstacles=[],staticHits=new Set(),enemies=[],loot=[],effects=[],grenades=[];
// Blast visuals animate their own alpha, so each one owns a throwaway material.
function glow(name,hex,power){const m=new B.StandardMaterial(name,scene);m.diffuseColor=C.FromHexString(hex);m.emissiveColor=C.FromHexString(hex).scale(power);m.specularColor=new C(0,0,0);m.disableLighting=true;m.backFaceCulling=false;m.alpha=.9;return m}
function stepEffects(dt){for(let i=effects.length-1;i>=0;i--){const fx=effects[i];fx.life-=dt;fx.update?.(fx,dt);if(fx.life<=0){fx.mesh.dispose(false,!!fx.own);effects.splice(i,1)}}}
// Trim that neither stops a bullet nor casts a shadow is batched later into a handful of meshes.
const decor=[];let batching=true;
function box(name,x,y,z,w,h,d,m,solid=false,casts=true){const a=B.MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene);a.position.set(x,y,z);a.material=m;fieldEnvironment.mapBox(a);a.receiveShadows=true;a.isPickable=solid;if(solid){obstacles.push({x,z,w:w/2,d:d/2});staticHits.add(a)}if(casts)shadow.addShadowCaster(a);else if(batching&&!solid)decor.push(a);return a}
function occlude(m){m.isPickable=true;staticHits.add(m);return m}
function cylinder(name,x,y,z,d,h,m){const a=B.MeshBuilder.CreateCylinder(name,{diameter:d,height:h,tessellation:10},scene);a.position.set(x,y,z);a.material=m;a.isPickable=false;shadow.addShadowCaster(a);return a}
function label(text,x,y,z,w=4,h=1,color='#263b42',rotation=0){const t=new B.DynamicTexture('sign',{width:512,height:128},scene,false);t.hasAlpha=true;const c=t.getContext();c.clearRect(0,0,512,128);c.fillStyle=color;c.font='bold 56px Arial';c.textAlign='center';c.fillText(text,256,84);t.update();const m=new B.StandardMaterial('sign',scene);m.diffuseTexture=t;m.opacityTexture=t;m.emissiveColor=new C(.25,.25,.25);m.backFaceCulling=false;const a=B.MeshBuilder.CreatePlane('sign',{width:w,height:h},scene);a.position.set(x,y,z);a.rotation.y=rotation;a.material=m;a.isPickable=false;return a}
const floor=box('terrain',0,-.22,0,300,.4,300,M.grass,false,false);floor.isPickable=true;staticHits.add(floor);
for(const [name,x,y,z,w,d] of [['main road',0,.002,0,12,212],['coast road',0,.004,10,212,10],['west lane',-56,.006,0,8,212],['east lane',56,.008,0,8,212],['south lane',0,.01,-62,212,8],['north lane',0,.012,64,212,8]])box(name,x,y,z,w,.02,d,M.road,false,false);
for(let z=-100;z<104;z+=8)box('lane paint',0,.026,z,.16,.018,3.4,M.yellow,false,false);
for(let x=-100;x<104;x+=8)box('lane paint',x,.028,10,3.4,.018,.16,M.yellow,false,false);
// Enterable structures: front doors and open interiors hold equipment.
const wallTints=['#d0cbc0','#c6bda8','#bdc2bb','#d6c7ac','#b9b3a6'].map((tint,i)=>fieldEnvironment.surface('hut plaster '+i,'concrete',3,tint));
let hutIndex=0;
function building(x,z,w=10,d=10){const wall=wallTints[hutIndex++%wallTints.length];box('foundation',x,.02,z,w+.4,.05,d+.4,M.concrete,false,false);box('rear wall',x,1.8,z+d/2,w,3.6,.35,wall,true);box('left wall',x-w/2,1.8,z,.35,3.6,d,wall,true);box('right wall',x+w/2,1.8,z,.35,3.6,d,wall,true);const piece=(w-3.6)/2;box('front left',x-(1.8+piece/2),1.8,z-d/2,piece,3.6,.35,wall,true);box('front right',x+(1.8+piece/2),1.8,z-d/2,piece,3.6,.35,wall,true);occlude(box('door lintel',x,3.3,z-d/2,3.6,.6,.35,wall,false));const roof=box('flat roof',x,3.75,z,w+1,.28,d+1,M.roof,false);roof.isPickable=true;staticHits.add(roof);for(const side of [-1,1]){box('window',x+side*w*.3,2,z-d/2-.2,1.6,1.25,.025,M.glass,false,false);box('window sill',x+side*w*.3,1.32,z-d/2-.25,1.9,.15,.2,M.concrete)}for(const side of [-1,1]){const wx=x+side*w*.3;for(const dx of [-.85,.85])box('window frame',wx+dx,2,z-d/2-.24,.065,1.36,.09,M.steel,false,false);for(const yy of [1.35,2.65])box('window frame',wx,yy,z-d/2-.24,1.76,.06,.09,M.steel,false,false);box('window mullion',wx,2,z-d/2-.26,.055,1.3,.04,M.steel,false,false);box('concrete footing',x+side*(w/2-.08),.22,z,.46,.42,d,M.concrete,false,false)}
box('roof fascia',x,3.72,z-d/2-.5,w+1,.2,.12,M.steel,false,false);
for(const side of [-1,1]){const pipe=cylinder('drain pipe',x+side*(w/2+.13),1.8,z-d/2+.35,.11,3.6,M.steel);pipe.isPickable=false}
box('door frame top',x,3.02,z-d/2-.2,3.75,.12,.14,M.steel,false,false);
for(const side of [-1,1])box('door frame',x+side*1.83,1.5,z-d/2-.2,.09,3,.14,M.steel,false,false);
label('SUPPLY / '+String(Math.abs(x)),x,3.38,z-d/2-.22,3.2,.45,'#343a37');
if(detail){box('door step',x,.09,z-d/2-.75,3.8,.18,1.5,M.concrete,false,false);
 for(const side of [-1,1])box('roof parapet',x+side*(w/2+.5),4.02,z,.16,.34,d+1,M.concrete,false,false);
 box('roof parapet',x,4.02,z+d/2+.5,w+1,.34,.16,M.concrete,false,false);
 box('roof vent',x+w*.25,4.15,z+d*.2,1.1,.6,1.1,M.steel,false,false);
 box('roof hatch',x-w*.25,3.96,z-d*.15,1.3,.14,1.3,M.dark,false,false);
 for(let i=0;i<5;i++)box('wall stain',x-w/2-.2,1+i*.6,z+d*.3,.04,.5,.9,M.concrete,false,false)}}
for(const args of W.buildings)building(...args);
function cargo(x,z,w,d,color){const m=fieldEnvironment.surface('painted container','metal',3,color,.35);box('container',x,1.5,z,w,3,d,m,true);for(let k=-d/2+.5;k<d/2;k+=.65)box('rib',x-w/2-.04,1.5,z+k,.08,2.8,.06,M.steel,false,false);label('09',x,1.8,z-d/2-.06,2,1,'#dbe6de')}
for(const args of W.cargos)cargo(...args);
for(const [x,z,w] of W.barriers){box('barrier',x,.65,z,w,1.3,1.2,M.concrete,true);box('warning stripe',x,.95,z-.62,w,.16,.03,M.yellow,false,false)}
for(const [x,z] of W.crates){box('crate',x,.6,z,1.4,1.2,1.4,M.wood,true);box('band',x,.65,z-.71,1.4,.12,.02,M.steel,false,false)}
function tree(x,z,scale=1){const trunk=cylinder('trunk',x,1.8*scale,z,.48*scale,3.6*scale,M.bark);trunk.isPickable=true;staticHits.add(trunk);obstacles.push({x,z,w:.3*scale,d:.3*scale});fieldEnvironment.tree(x,z,scale)}
for(const args of W.trees)tree(...args);
// A depot is a fight in itself: wide doors on two faces, pillars inside and a roof lip for cover.
function depot(x,z,w,d){
  box('depot slab',x,.03,z,w+1.2,.07,d+1.2,M.concrete,false,false);
  const shell=fieldEnvironment.surface('depot cladding','metal',3.4,'#9aa59d',.4,.62);
  box('depot back',x,2.6,z+d/2,w,5.2,.4,shell,true);box('depot west',x-w/2,2.6,z,.4,5.2,d,shell,true);
  const side=(d-6)/2;for(const s of [-1,1])box('depot east',x+w/2,2.6,z+s*(3+side/2),.4,5.2,side,shell,true);
  const piece=(w-6)/2;for(const s of [-1,1])box('depot front',x+s*(3+piece/2),2.6,z-d/2,piece,5.2,.4,shell,true);
  occlude(box('depot south lintel',x,4.6,z-d/2,6,1.2,.4,shell,false));occlude(box('depot east lintel',x+w/2,4.6,z,.4,1.2,6,shell,false));
  const roof=box('depot roof',x,5.45,z,w+1.4,.3,d+1.4,M.roof,false);roof.isPickable=true;staticHits.add(roof);
  for(const s of [-1,1])box('depot pillar',x+s*w*.24,2.6,z,.6,5.2,.6,M.concrete,true);
  if(detail){
    for(let i=-2;i<3;i++)box('roof truss',x,5.15,z+i*(d/6),w-.6,.16,.2,M.steel,false,false);
    for(const s of [-1,1])box('roof gutter',x+s*(w/2+.75),5.3,z,.3,.22,d+1.4,M.steel,false,false);
    for(let i=0;i<4;i++)box('wall rib',x-w/2-.22,2.6,z-d/2+2+i*(d-4)/3,.12,5,.5,M.steel,false,false);
    box('dock apron',x,.09,z-d/2-1.8,w*.7,.18,3.4,M.concrete,false,false);
    for(const s of [-1,1])box('dock marking',x+s*w*.2,.19,z-d/2-1.8,.3,.02,3.2,M.yellow,false,false);
  }
  label('DEPOT '+String(Math.abs(Math.round(x))).padStart(2,'0'),x,4.9,z-d/2-.24,5,.7,'#2c3a3a');
}
for(const args of W.depots)depot(...args);
// Watchtower: climbable-looking lattice, a platform that casts long shade and a railing.
function tower(x,z){
  for(const sx of [-1,1])for(const sz of [-1,1]){
    box('tower leg',x+sx*1.7,2.6,z+sz*1.7,.45,5.2,.45,M.steel,true);
    if(detail)for(let i=0;i<3;i++)box('leg brace',x+sx*1.7,1.4+i*1.6,z,.3,.12,3.4,M.steel,false,false);
  }
  occlude(box('tower deck',x,5.4,z,5.2,.4,5.2,M.wood,false));
  for(const sx of [-1,1])occlude(box('deck rail',x+sx*2.4,6.1,z,.25,1.4,5.2,M.steel,false));
  for(const sz of [-1,1])occlude(box('deck rail',x,6.1,z+sz*2.4,5.2,1.4,.25,M.steel,false));
  box('tower cap',x,7.15,z,5.8,.22,5.8,M.roof,false);
  if(detail)for(let i=0;i<7;i++)box('ladder rung',x+2.05,1+i*.6,z-2.4,.9,.08,.08,M.steel,false,false);
}
for(const args of W.towers)tower(...args);
// Fuel silos read as landmarks from across the field and stop a rifle round dead.
function tank(x,z,r){
  const body=B.MeshBuilder.CreateCylinder('fuel silo',{diameter:r*2,height:6.4,tessellation:20},scene);
  body.position.set(x,3.2,z);body.material=M.steel;body.isPickable=true;staticHits.add(body);shadow.addShadowCaster(body);body.receiveShadows=true;
  obstacles.push({x,z,w:r,d:r});
  const cap=B.MeshBuilder.CreateCylinder('silo cap',{diameterTop:r*.6,diameterBottom:r*2.05,height:1.1,tessellation:20},scene);
  cap.position.set(x,6.8,z);cap.material=M.roof;cap.isPickable=false;shadow.addShadowCaster(cap);
  for(let i=0;i<3;i++){const hoop=B.MeshBuilder.CreateTorus('silo hoop',{diameter:r*2.06,thickness:.13,tessellation:20},scene);hoop.position.set(x,1.4+i*2.1,z);hoop.material=M.dark;hoop.isPickable=false}
  if(detail){box('silo pipe',x+r,1.2,z,.3,2.4,.3,M.steel,false,false);box('silo valve',x+r,2.5,z,.7,.35,.7,M.yellow,false,false)}
  label('FUEL',x,4.4,z-r-.06,3,.8,'#f2e7c2');
}
for(const args of W.tanks)tank(...args);
// Boulders break long sightlines in the open ground between compounds.
function rock(x,z,s){
  const m=B.MeshBuilder.CreatePolyhedron('boulder',{type:1,size:s},scene);
  m.position.set(x,s*.62,z);m.rotation.set(s*.7,x*.11,z*.09);m.scaling.set(1.15,.78,1.05);
  m.material=M.concrete;m.isPickable=true;staticHits.add(m);m.receiveShadows=true;shadow.addShadowCaster(m);
  obstacles.push({x,z,w:s*.95,d:s*.9});
  if(detail){const chip=B.MeshBuilder.CreatePolyhedron('rock chip',{type:2,size:s*.35},scene);chip.position.set(x+s*.9,s*.24,z-s*.7);chip.material=M.concrete;chip.isPickable=false;chip.receiveShadows=true}
}
for(const args of W.rocks)rock(...args);
// Half-collapsed walls: real cover with a ragged top edge you can peek over.
function ruin(x,z,w,d,h){
  box('ruined wall',x,h/2,z,w,h,d,M.cream,true);
  const along=w>d,span=along?w:d;
  for(let i=0;i<4;i++){
    const t=(i+.5)/4-.5,ox=along?t*span:0,oz=along?0:t*span;
    box('broken crown',x+ox,h+.18+(i%2)*.16,z+oz,along?span/4.4:d,.36,along?d:span/4.4,M.cream,false,false);
  }
  if(detail)for(let i=0;i<3;i++)box('rubble',x+(i-1)*1.4,.16,z+(along?1.1:0),along?1:.6,.32,along?.6:1,M.concrete,false,false);
  box('exposed rebar',x,h+.4,z,along?span*.8:.06,.06,along?.06:span*.8,M.steel,false,false);
}
for(const args of W.ruins)ruin(...args);
// Sandbag lines are chest high, so they change how a firefight is fought rather than blocking it.
function sandbagLine(x,z,w,d){
  const along=w>d,count=Math.max(3,Math.round((along?w:d)/.95));
  for(let row=0;row<3;row++)for(let i=0;i<count-row%2;i++){
    const t=(i+.5+(row%2)*.5)/count-.5;
    const bag=box('sandbag',x+(along?t*w:0),.19+row*.36,z+(along?0:t*d),along?w/count*.92:1.05,.34,along?1.05:d/count*.92,M.bark,false,row===2);
    bag.rotation.y=(i%2?.05:-.05)+row*.03;bag.receiveShadows=true;
  }
  obstacles.push({x,z,w:w/2,d:d/2});
  if(detail)box('ammo tin',x+(along?w*.42:0),1.24,z+(along?0:d*.42),.5,.3,.34,M.dark,false,false);
}
for(const args of W.sandbags)sandbagLine(...args);
// Chain-link: it stops a sprint and a low shot, but you can see and shoot over the top.
function fence(x,z,w,d){
  const along=w>d,span=along?w:d;
  box('fence mesh',x,.9,z,w,1.8,d,M.steel,true,false).visibility=.34;
  for(let i=0;i<=Math.round(span/4);i++){
    const t=i/Math.round(span/4)-.5;
    box('fence post',x+(along?t*span:0),.95,z+(along?0:t*span),.13,1.9,.13,M.steel,false,false);
  }
  for(const y of [.18,1.74])box('fence rail',x,y,z,along?span:.08,.07,along?.08:span,M.steel,false,false);
}
for(const args of W.fences)fence(...args);
for(let i=0;i<20;i++){const a=i/20*Math.PI*2,r=205;const m=B.MeshBuilder.CreateSphere('distant ridge',{diameter:96,segments:16},scene);m.position.set(Math.sin(a)*r,-16,Math.cos(a)*r);m.scaling.set(1.45,.62+(i%3)*.16,1);m.material=M.grass;m.isPickable=false;m.receiveShadows=true}
// Scrap and roadside furniture. Every solid piece here has a matching collider in shared/world.js.
function wreck(x,z,w,d,kind,along){
  const long=along?w:d,wide=along?d:w,shell=fieldEnvironment.surface('wreck paint','metal',2.4,kind==='truck'?'#7d6c52':kind==='van'?'#8b8478':'#6f5f5a',.45,.72);
  const axis=(dx,dz)=>along?[dx,dz]:[dz,dx];
  const put=(name,ox,y,oz,sw,h,sd,material,solid=false)=>{const[px,pz]=axis(ox,oz),[bw,bd]=axis(sw,sd);return box(name,x+px,y,z+pz,bw,h,bd,material,solid)};
  occlude(put('chassis',0,.55,0,long*.96,.55,wide*.9,M.rust));
  if(kind==='car'){
    occlude(put('car body',0,1,0,long*.92,.62,wide*.88,shell));
    occlude(put('cabin',-.1,1.5,0,long*.42,.42,wide*.78,M.glass));
    put('bonnet',long*.34,1.24,0,long*.26,.12,wide*.84,shell);
  }else{
    occlude(put('cab',long*.32,1.35,0,long*.3,1.1,wide*.9,shell));
    occlude(put('cargo box',-long*.16,1.55,0,long*.6,1.5,wide*.94,kind==='truck'?M.rust:shell));
    put('windscreen',long*.46,1.6,0,.1,.55,wide*.72,M.glass);
    for(let i=0;i<4;i++)put('box rib',-long*.42+i*long*.16,1.55,wide*.48,.09,1.4,.06,M.dark);
  }
  for(const sx of [-1,1])for(const sz of [-1,1]){
    const[px,pz]=axis(sx*long*.34,sz*wide*.42);
    const wheel=B.MeshBuilder.CreateCylinder('wheel',{diameter:.86,height:.3,tessellation:12},scene);
    wheel.position.set(x+px,.38,z+pz);wheel.rotation.z=Math.PI/2;if(!along)wheel.rotation.y=Math.PI/2;
    wheel.material=M.dark;wheel.isPickable=false;shadow.addShadowCaster(wheel);
  }
  if(detail){put('bumper',long*.5,.75,0,.14,.3,wide*.9,M.steel);put('rear bumper',-long*.5,.7,0,.14,.26,wide*.86,M.steel)}
}
for(const args of W.wrecks)wreck(...args);
function drum(x,z,color){
  const body=B.MeshBuilder.CreateCylinder('oil drum',{diameter:.86,height:1.1,tessellation:14},scene);
  body.position.set(x,.55,z);body.material=fieldEnvironment.surface('drum paint','metal',1.2,color,.4,.7);
  body.isPickable=true;staticHits.add(body);body.receiveShadows=true;shadow.addShadowCaster(body);
  for(const y of [.32,.78]){const hoop=B.MeshBuilder.CreateTorus('drum hoop',{diameter:.9,thickness:.05,tessellation:14},scene);hoop.position.set(x,y,z);hoop.material=M.dark;hoop.isPickable=false}
  box('drum lid',x,1.12,z,.8,.05,.8,M.steel,false,false);
}
for(const args of W.drums)drum(...args);
function palletStack(x,z,h){
  const levels=Math.max(1,Math.round(h/.28));
  for(let i=0;i<levels;i++){
    const y=.09+i*.28;
    box('pallet deck',x,y+.11,z,1.3,.07,1.1,M.wood,i===0,false).receiveShadows=true;
    for(const ox of [-.5,0,.5])box('pallet block',x+ox,y,z,.22,.14,1.05,M.wood,false,false);
  }
  const hit=box('pallet stack',x,h/2,z,1.35,h,1.15,M.wood,true,false);hit.visibility=0;
  if(detail)box('shrink wrap',x,h+.2,z,1.15,.36,.95,M.glass,false,false);
}
for(const args of W.pallets)palletStack(...args);
function tyreStack(x,z,count){
  for(let i=0;i<count;i++){
    const tyre=B.MeshBuilder.CreateTorus('tyre',{diameter:.94,thickness:.28,tessellation:14},scene);
    tyre.position.set(x+(i%2?.04:-.03),.16+i*.28,z+(i%2?-.03:.04));tyre.rotation.x=Math.PI/2;tyre.rotation.y=i*.7;
    tyre.material=M.dark;tyre.isPickable=false;tyre.receiveShadows=true;shadow.addShadowCaster(tyre);
  }
  const hit=box('tyre stack',x,count*.14,z,1.12,count*.28,1.12,M.dark,true,false);hit.visibility=0;
}
for(const args of W.tyres)tyreStack(...args);
// Utility poles carry the skyline; the catenary between them is one merged, unpickable mesh.
const cableSag=[];
function pole(x,z){
  occlude(box('utility pole',x,4.4,z,.36,8.8,.36,M.bark,true,false));
  box('crossarm',x,8.1,z,2.6,.16,.18,M.bark,false,false);
  for(const ox of [-1.1,0,1.1]){const insulator=B.MeshBuilder.CreateCylinder('insulator',{diameter:.14,height:.2,tessellation:8},scene);insulator.position.set(x+ox,8.3,z);insulator.material=M.glass;insulator.isPickable=false}
  if(detail)for(let i=0;i<4;i++)box('pole step',x+(i%2?.24:-.24),2+i*.9,z,.5,.06,.06,M.steel,false,false);
}
for(const args of W.poles)pole(...args);
function cables(list,vertical){
  for(let i=0;i<list.length-1;i++){
    const a=list[i],b=list[i+1];
    if(Math.hypot(a[0]-b[0],a[1]-b[1])>34)continue;
    for(const ox of [-1.1,0,1.1]){
      const points=[];
      for(let t=0;t<=8;t++){const f=t/8;
        points.push(new V(a[0]+(b[0]-a[0])*f+(vertical?ox:0),8.3-Math.sin(f*Math.PI)*.85,a[1]+(b[1]-a[1])*f+(vertical?0:ox)));
      }
      const line=B.MeshBuilder.CreateLines('power line',{points},scene);line.color=new C(.16,.18,.19);line.isPickable=false;cableSag.push(line);
    }
  }
}
cables(W.poles.filter(p=>p[0]===-8.6),true);cables(W.poles.filter(p=>p[1]===20.6),false);
function lamp(x,z,side){
  occlude(box('lamp column',x,3,z,.24,6,.24,M.steel,true,false));
  box('lamp arm',x-side*.7,5.95,z,1.5,.16,.16,M.steel,false,false);
  const head=box('lamp head',x-side*1.4,5.8,z,.9,.22,.36,M.dark,false,false);head.receiveShadows=false;
  box('lamp lens',x-side*1.4,5.66,z,.8,.06,.3,M.flash,false,false);
}
for(const args of W.lamps)lamp(...args);
function guardRail(x,z,w,d){
  const along=w>d,span=along?w:d;
  box('rail beam',x,.78,z,along?w:.12,.32,along?.12:d,M.steel,false,false);
  box('rail beam',x,.46,z,along?w:.12,.24,along?.12:d,M.steel,false,false);
  for(let i=0;i<=Math.round(span/2.6);i++){const t=i/Math.round(span/2.6)-.5;box('rail post',x+(along?t*span:0),.45,z+(along?0:t*span),.14,.9,.14,M.steel,false,false)}
  const hit=box('rail body',x,.6,z,w,1.2,d,M.steel,true,false);hit.visibility=0;
}
for(const args of W.rails)guardRail(...args);
// Cargo containers get doors, so both ends read differently at a distance.
for(const [cx,cz,cw,cd] of W.cargos){
  const along=cw>cd,doorZ=along?cz:cz-cd/2-.06,doorX=along?cx-cw/2-.06:cx;
  for(const s of [-1,1])box('container door',doorX,1.5,doorZ,along?.06:cw*.46,2.7,along?cd*.46:.06,M.steel,false,false).position[along?'z':'x']+=s*(along?cd:cw)*.24;
  for(const s of [-1,1]){const bar=B.MeshBuilder.CreateCylinder('door bar',{diameter:.09,height:2.6,tessellation:8},scene);bar.position.set(doorX+(along?-.08:s*cw*.2),1.5,doorZ+(along?s*cd*.2:-.08));bar.material=M.dark;bar.isPickable=false}
}
// --- surface wear and ground cover: dense visual detail that blocks nothing ---
(function dressGround(){
  // Skipped wholesale when the environment pack is unavailable, and thinned out on phones.
  if(!(M.dirt&&M.gravel&&M.mud&&M.puddle))return;
  const density=detail?1:.4;
  let seed=20260917;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
  const groups=new Map();
  const patch=(material,x,z,w,d,y)=>{const m=box('ground wear',x,y,z,w,.04,d,material,false,false);m.receiveShadows=true;
    const key=material.name+'|'+(Math.floor((x+104)/70)*4+Math.floor((z+104)/70));(groups.get(key)||groups.set(key,[]).get(key)).push(m)};
  // Worn earth around everything players walk to, gravel hardstanding at the compounds.
  for(const [x,z] of [...W.buildings,...W.depots,...W.towers,...W.cargos]){
    patch(M.gravel,x,z,14+rnd()*10,13+rnd()*9,.014);
    for(let i=0;i<3;i++)patch(M.dirt,x+(rnd()-.5)*22,z+(rnd()-.5)*22,4+rnd()*9,4+rnd()*9,.02);
  }
  for(let i=0;i<Math.round(90*density);i++){const x=(rnd()*2-1)*100,z=(rnd()*2-1)*100;patch(M.dirt,x,z,3+rnd()*11,3+rnd()*11,.018)}
  // Ruts either side of the two main roads, and standing water in the low spots.
  for(let i=0;i<46;i++){const z=-100+i*4.4;for(const x of [-3.4,3.4])patch(M.mud,x+(rnd()-.5)*.6,z,.55,4.2,.024)}
  for(let i=0;i<40;i++){const x=-100+i*5;for(const z of [6.6,13.4])patch(M.mud,x,z+(rnd()-.5)*.6,4.4,.55,.026)}
  for(let i=0;i<Math.round(26*density);i++){const x=(rnd()*2-1)*96,z=(rnd()*2-1)*96;if(W.blocked(x,z,1))continue;
    const pool=box('standing water',x,.03,z,1.6+rnd()*3.4,.03,1.4+rnd()*3,M.puddle,false,false);pool.receiveShadows=true;
    const key='puddle|'+(Math.floor((x+104)/70)*4+Math.floor((z+104)/70));(groups.get(key)||groups.set(key,[]).get(key)).push(pool)}
  for(const [key,list] of groups){if(list.length<2)continue;const merged=B.Mesh.MergeMeshes(list,true,true,undefined,false,false);if(merged){merged.name='ground wear '+key;merged.isPickable=false;merged.receiveShadows=true;merged.alwaysSelectAsActiveMesh=false}}
  // Dry grass clumps: crossed alpha cards, merged into spatial chunks so culling still works.
  const cover=fieldEnvironment.groundCover,chunks=new Map();
  if(cover)for(let i=0;i<Math.round(1500*density);i++){
    const x=(rnd()*2-1)*102,z=(rnd()*2-1)*102;
    if(Math.hypot(x,z)<6||W.blocked(x,z,1.1))continue;
    if(Math.abs(x)<7||(z>4&&z<16))continue;
    const scale=.55+rnd()*.6;
    for(let card=0;card<2;card++){
      const tuft=B.MeshBuilder.CreatePlane('grass tuft',{width:.9*scale,height:.46*scale},scene);
      tuft.position.set(x,.22*scale,z);tuft.rotation.y=rnd()*Math.PI+card*Math.PI/2;
      const key=Math.floor((x+104)/34)*7+Math.floor((z+104)/34);
      (chunks.get(key)||chunks.set(key,[]).get(key)).push(tuft);
    }
  }
  for(const [key,list] of chunks){const merged=B.Mesh.MergeMeshes(list,true,true,undefined,false,false);
    if(merged){merged.name='ground cover '+key;merged.material=cover;merged.isPickable=false;merged.receiveShadows=true}}
  // Low scrub against walls and rocks fills the join between props and the ground.
  const bushes=[];
  if(cover)for(let i=0;i<Math.round(150*density);i++){
    const x=(rnd()*2-1)*100,z=(rnd()*2-1)*100;
    if(W.blocked(x,z,1.3)||!W.blocked(x,z,4.5))continue;
    const size=.9+rnd()*.7;
    for(let card=0;card<3;card++){
      const leaf=B.MeshBuilder.CreatePlane('scrub',{width:1.5*size,height:.8*size},scene);
      leaf.position.set(x,.38*size,z);leaf.rotation.y=card*Math.PI/3+rnd();bushes.push(leaf);
    }
  }
  if(bushes.length>1){const merged=B.Mesh.MergeMeshes(bushes,true,true,undefined,false,false);
    if(merged){
      // Share the blade sheet rather than cloning it: a cloned dynamic texture never reports ready.
      const scrub=new B.StandardMaterial('dusty scrub',scene);
      scrub.diffuseTexture=cover.diffuseTexture;scrub.useAlphaFromDiffuseTexture=true;
      scrub.transparencyMode=B.Material.MATERIAL_ALPHATEST;scrub.alphaCutOff=.42;
      scrub.backFaceCulling=false;scrub.twoSidedLighting=true;scrub.specularColor=new C(0,0,0);scrub.diffuseColor=new C(.74,.78,.56);
      merged.name='scrub line';merged.material=scrub;merged.isPickable=false;merged.receiveShadows=true}}
})();
fieldEnvironment.quality(highQuality);
// One draw call per material per 48m cell beats several thousand little ones.
(function batchDecor(){
  const groups=new Map();
  for(const mesh of decor){
    if(mesh.parent||mesh.isDisposed()||!mesh.material)continue;
    const key=mesh.material.uniqueId+'|'+Math.floor((mesh.position.x+120)/48)+'|'+Math.floor((mesh.position.z+120)/48);
    (groups.get(key)||groups.set(key,[]).get(key)).push(mesh);
  }
  for(const list of groups.values()){
    if(list.length<3)continue;
    const merged=B.Mesh.MergeMeshes(list,true,true,undefined,false,false);
    if(merged){merged.name='field trim';merged.isPickable=false;merged.receiveShadows=true}
  }
  decor.length=0;batching=false;
})();
// Nothing built so far ever moves, so stop recomputing its world matrix every frame.
for(const mesh of scene.meshes)if(!mesh.parent&&!mesh.infiniteDistance)mesh.freezeWorldMatrix();
// Blue field is a translucent volume with a bright ground boundary.
const zoneMat=new B.StandardMaterial('blue field',scene);zoneMat.diffuseColor=new C(.15,.5,1);zoneMat.emissiveColor=new C(.08,.32,.9);zoneMat.alpha=.13;zoneMat.backFaceCulling=false;zoneMat.disableLighting=true;zoneMat.depthFunction=B.Constants.LEQUAL;
const wall=B.MeshBuilder.CreateCylinder('zone wall',{diameter:2,height:22,tessellation:96,cap:B.Mesh.NO_CAP,sideOrientation:B.Mesh.DOUBLESIDE},scene);wall.position.y=11;wall.material=zoneMat;wall.isPickable=false;
function ring(name,color){const points=[];for(let i=0;i<=128;i++){const a=i/128*Math.PI*2;points.push(new V(Math.sin(a),.075,Math.cos(a)))}const m=B.MeshBuilder.CreateLines(name,{points},scene);m.color=color;m.isPickable=false;return m}
const zoneRing=ring('current circle',new C(.15,.55,1)),nextRing=ring('next circle',new C(1,1,.92));
// Use the same map boundary and solid geometry as the online simulation.
function blocked(x,z,r=.4){return W.blocked(x,z,r)}
function advance(p,dx,dz,r=.4){if(!blocked(p.x+dx,p.z,r))p.x+=dx;if(!blocked(p.x,p.z+dz,r))p.z+=dz}
function visible(a,b){const delta=b.subtract(a),length=delta.length();if(length<.01)return true;const ray=new B.Ray(a,delta.scale(1/length),Math.max(0,length-.2));return !scene.pickWithRay(ray,m=>staticHits.has(m))?.hit}
// A* on a shared collision grid keeps bots out of walls and sends them through doors.
const cellSize=2.6,cols=80,origin=-104,nav=new Uint8Array(cols*cols);
for(let z=0;z<cols;z++)for(let x=0;x<cols;x++)nav[z*cols+x]=blocked(origin+(x+.5)*cellSize,origin+(z+.5)*cellSize,.45)?1:0;
function cell(p){return{x:Math.max(0,Math.min(cols-1,Math.floor((p.x-origin)/cellSize))),z:Math.max(0,Math.min(cols-1,Math.floor((p.z-origin)/cellSize)))}}
function route(from,to){const s=cell(from),g=cell(to),startIdx=s.z*cols+s.x;let end=g.z*cols+g.x;
 if(nav[end]){let best=Infinity;for(let dz=-3;dz<=3;dz++)for(let dx=-3;dx<=3;dx++){let x=g.x+dx,z=g.z+dz;if(x<0||x>=cols||z<0||z>=cols)continue;let i=z*cols+x;if(!nav[i]&&dx*dx+dz*dz<best){best=dx*dx+dz*dz;end=i}}}
 if(nav[startIdx]||nav[end])return[];
 const cost=new Float32Array(cols*cols);cost.fill(Infinity);cost[startIdx]=0;const parent=new Int32Array(cols*cols);parent.fill(-1);const closed=new Uint8Array(cols*cols);
 const gx=end%cols,gz=(end/cols)|0,heur=i=>Math.abs(i%cols-gx)+Math.abs(((i/cols)|0)-gz);
 // A binary heap keeps pathfinding cheap enough for two dozen bots on a 208m field.
 const heap=[],score=[];
 const push=(node,f)=>{heap.push(node);score.push(f);let i=heap.length-1;while(i>0){const p=(i-1)>>1;if(score[p]<=score[i])break;[heap[p],heap[i]]=[heap[i],heap[p]];[score[p],score[i]]=[score[i],score[p]];i=p}};
 const pop=()=>{const top=heap[0];const n=heap.pop(),f=score.pop();if(heap.length){heap[0]=n;score[0]=f;let i=0;for(;;){const l=i*2+1,r=l+1;let m=i;if(l<heap.length&&score[l]<score[m])m=l;if(r<heap.length&&score[r]<score[m])m=r;if(m===i)break;[heap[m],heap[i]]=[heap[i],heap[m]];[score[m],score[i]]=[score[i],score[m]];i=m}}return top};
 push(startIdx,heur(startIdx));let guard=0;
 while(heap.length&&guard++<9000){const current=pop();if(closed[current])continue;
  if(current===end){const path=[];let n=end;while(n!==startIdx&&n>=0){path.unshift(new V(origin+(n%cols+.5)*cellSize,0,origin+(((n/cols)|0)+.5)*cellSize));n=parent[n]}return path}
  closed[current]=1;const x=current%cols,z=(current/cols)|0;
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,zz=z+dz;if(xx<0||xx>=cols||zz<0||zz>=cols)continue;const n=zz*cols+xx;if(nav[n]||closed[n])continue;const c=cost[current]+1;if(c<cost[n]){cost[n]=c;parent[n]=current;push(n,c+heur(n))}}}
 return[]}

const lootVisuals=window.createLootVisuals(B,scene,M);
function lootItem(type,x,z,weapon=null,amount=60){const root=lootVisuals.create(type,weapon),color=type==='weapon'?(R.melee(weapon)?M.steel:weapon==='marksman'?M.purple:weapon==='smg'?M.armor:M.ammo):type==='helmet'?M.helmet:type==='vest'?M.armor:M[type]||M.ammo;
const halo=B.MeshBuilder.CreateTorus('supply ground ring',{diameter:1.12,thickness:.023,tessellation:24},scene);halo.parent=root;halo.position.y=.04;halo.material=color;halo.isPickable=false;
// A pickup is scenery, never a hit target, so collapse it to a single draw before it is placed.
const parts=root.getChildMeshes();
if(parts.length>1){const merged=B.Mesh.MergeMeshes(parts,true,true,undefined,false,true);if(merged){merged.name='supply drop '+type;merged.parent=root;merged.isPickable=false;merged.receiveShadows=true;shadow.addShadowCaster(merged)}}
root.position.set(x,0,z);loot.push({type,x,z,weapon,amount,root,taken:false});return loot[loot.length-1]}
function populateLoot(spawn){for(const l of loot)l.root.dispose();loot.length=0;for(const item of W.loot()){const l=lootItem(item.type,item.x,item.z,item.weapon,item.amount);l.id=item.id}
if(!spawn)return;
// Solo gets the same guaranteed cache as an online round: a run away, in a direction that changes every time.
const[cx,cz]=W.cacheSpot(spawn[0],spawn[1]);let n=0;
for(const[type,ox,oz,weapon]of [['weapon',0,0,W.randomWeapon()],['ammo',.9,.5,null],['med',-.9,.5,null],['vest',0,-1.1,null],['helmet',-1.5,-.6,null]]){let lx=cx+ox,lz=cz+oz;if(W.blocked(lx,lz,.1)){lx=cx;lz=cz}lootItem(type,lx,lz,weapon,60).id='spawn-solo-'+(n++)}}
populateLoot();
// Thrown ordnance uses the same physics the server runs, so a lobbed frag lands in the same place.
function grenadeMesh(kind){const root=lootVisuals.create(kind);for(const m of root.getChildMeshes()){m.isPickable=false;shadow.addShadowCaster(m)}return root}
function blastEffect(g){
  const stun=g.kind==='flash',height=Math.max(.45,g.y),life=stun?.55:.46;
  const core=B.MeshBuilder.CreateSphere('blast core',{diameter:1,segments:10},scene);
  core.position.set(g.x,height,g.z);core.material=glow('blast core',stun?'#ffffff':'#ffc061',stun?2.6:1.8);core.isPickable=false;
  effects.push({mesh:core,life,own:true,update(fx){const t=1-fx.life/life;core.scaling.setAll(.7+t*(stun?11:8.5));core.material.alpha=Math.max(0,.95-t*1.1)}});
  const ring=B.MeshBuilder.CreateTorus('shockwave',{diameter:1,thickness:.1,tessellation:28},scene);
  ring.position.set(g.x,.24,g.z);ring.material=glow('shockwave',stun?'#dceaff':'#ffd79a',1.6);ring.isPickable=false;
  effects.push({mesh:ring,life:.6,own:true,update(fx){const t=1-fx.life/.6;ring.scaling.set(1+t*(stun?30:21),1,1+t*(stun?30:21));ring.material.alpha=Math.max(0,.85-t)}});
  if(!stun)for(let i=0;i<8;i++){
    const puff=B.MeshBuilder.CreateSphere('smoke',{diameter:1,segments:6},scene);
    const a=i/8*Math.PI*2,reach=1.6+Math.random()*2.2;
    puff.position.set(g.x+Math.sin(a)*.5,height,g.z+Math.cos(a)*.5);puff.material=glow('smoke','#57544e',.05);puff.material.alpha=.7;puff.isPickable=false;
    effects.push({mesh:puff,life:1.1+Math.random()*.5,own:true,update(fx,step){const t=1-fx.life/1.5;puff.position.x+=Math.sin(a)*reach*step;puff.position.z+=Math.cos(a)*reach*step;puff.position.y+=step*1.1;puff.scaling.setAll(.8+t*3.1);puff.material.alpha=Math.max(0,.62-t*.72)}});
  }
  boom(stun?.22:.4);
}
// Damage and blinding are resolved exactly as the server resolves them, from the same rules module.
function detonate(g){
  blastEffect(g);
  const self={x:camera.position.x,z:camera.position.z,yaw,pitch};
  const near=Math.hypot(self.x-g.x,self.z-g.z);
  if(near<30)shake=Math.max(shake,.075*(1-near/30));
  const mine=W.blastExposure(g,self);
  if(mine.clear&&(state==='playing'||state==='outro')){
    const blinding=R.blastBlind(g.kind,mine.distance,W.facing(self,g));
    if(blinding>player.blind)player.blind=blinding;
    const amount=R.blastDamage(g.kind,mine.distance);
    if(amount>0&&state==='playing')hurt(amount,g.owner==='player'?'자신이 던진 폭탄에 당했습니다.':'폭발에 휘말렸습니다.');
  }
  for(const e of [...enemies]){
    const spot={x:e.root.position.x,z:e.root.position.z,yaw:e.root.rotation.y,pitch:0};
    const view=W.blastExposure(g,spot);if(!view.clear)continue;
    const blinding=R.blastBlind(g.kind,view.distance,W.facing(spot,g));
    if(blinding>(e.blind||0))e.blind=blinding;
    const amount=R.blastDamage(g.kind,view.distance);
    if(amount>0){R.damage(e,amount);if(e.hp<=0)die(e,g.owner==='player'?'player':'폭발')}
  }
  ui();
}
function launch(kind,x,z,yawTo,pitchTo,owner,power){
  const g=W.throwGrenade(kind,x,1.52,z,yawTo,pitchTo,R.throwables[kind].fuse,power);
  g.owner=owner;g.mesh=grenadeMesh(kind);grenades.push(g);return g;
}
function updateGrenades(dt){
  for(let i=grenades.length-1;i>=0;i--){
    const g=grenades[i],alive=W.stepGrenade(g,dt);
    g.mesh.position.set(g.x,g.y,g.z);g.mesh.rotation.set(g.spin,g.spin*.73,g.spin*.41);
    if(alive)continue;
    grenades.splice(i,1);g.mesh.dispose();detonate(g);
  }
}
function clearGrenades(){for(const g of grenades)g.mesh.dispose();grenades.length=0;for(const mesh of netNades.values())mesh.dispose();netNades.clear()}
function throwItem(kind){
  if(!R.throwables[kind])return;
  if(netMode){netThrow(kind);return}
  if(state!=='playing'||throwTimer>0)return;
  if(!R.takeThrowable(player,kind)){notify(R.throwables[kind].name+'이(가) 없습니다',1.4);return}
  throwTimer=.5;healing=0;swingHands();
  launch(kind,camera.position.x,camera.position.z,yaw,pitch-.12,'player',21);
  beep(250,.09,.05,'square');ui();
}
const viewRig=window.createFirstPersonRig(B,scene,camera,M,fieldEnvironment);fieldEnvironment.quality(highQuality);
const {gun,hands,rightArm,leftArm,bladeView,bladeSteel,bladeEdge,barrel,mag,scope,muzzle}=viewRig;
let punchTimer=0,punchSide=1,punchSpan=.34,shake=0,throwTimer=0;
let outro=null;const netNades=new Map();
function swingHands(){const w=R.weapons[player.equipped];punchSpan=Math.max(.2,(w?.interval||.44)*.85);punchTimer=punchSpan;punchSide=R.innate(player.equipped)?-punchSide:1}
// One swing curve drives both the jab and the blade arc: 0 at rest, 1 fully extended.
function poseHands(moving){
  if(!hands.isEnabled())return;
  const blade=bladeView.isEnabled(),bob=moving?Math.sin(step)*.01:0;
  hands.position.y=-.34+bob-(healing?.16:0);hands.position.z=.58;
  // A real punch cocks back before it lands, so the curve dips negative first.
  const phase=punchTimer>0?1-punchTimer/punchSpan:0;
  const reach=punchTimer<=0?0:phase<.24?-Math.sin(phase/.24*Math.PI)*.28:Math.sin((phase-.24)/.76*Math.PI);
  for(const[side,arm]of [[1,rightArm],[-1,leftArm]]){
    const push=side===punchSide?reach:reach*.12;
    arm.setEnabled(side>0||!blade);
    arm.position.set(side*.205-side*push*.115,(side===punchSide?push*.045:0)-(blade&&side>0?.03:0),push*(blade?.2:.46));
    arm.rotation.set(-push*(blade?.15:.34),-side*.13+side*push*.11,blade&&side>0?-.5+reach*1.7:0);
  }
  if(blade){bladeSteel.scaling.z=bladeEdge.scaling.z=player.equipped==='machete'?1.5:1;bladeView.rotation.set(reach*.5,-.2+reach*.4,0)}
}
const pressed=action=>keys.has(controls.code(action));
let player=R.newPlayer(),state='ready',time=0,clock=0,zone=R.zoneAt(0),yaw=0,pitch=0,reloading=0,healing=0,shotTimer=0,recoil=0,hitTimer=0,damageFade=0,noticeTimer=0,feedTimer=0,held=false,ads=false,nearest=null,step=0,hudTimer=0;
const keys=new Set(),move={x:0,y:0};let audio=null,soundOn=true,dragLook=null;const pointers={stick:null,look:null,fire:null};
function beep(freq,duration,volume=.07,type='sine'){if(!audio||!soundOn)return;const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.setValueAtTime(freq,audio.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(20,freq*.5),audio.currentTime+duration);g.gain.setValueAtTime(volume,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+duration)}
function shotSound(volume=.2){if(!audio||!soundOn)return;const n=audio.createBuffer(1,Math.floor(audio.sampleRate*.12),audio.sampleRate),d=n.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*(1-i/d.length)**3;const s=audio.createBufferSource(),g=audio.createGain(),f=audio.createBiquadFilter();s.buffer=n;g.gain.value=volume;f.type='lowpass';f.frequency.value=1800;s.connect(f);f.connect(g);g.connect(audio.destination);s.start();beep(90,.09,volume*.5,'triangle')}
function boom(volume=.3){if(!audio||!soundOn)return;const n=audio.createBuffer(1,Math.floor(audio.sampleRate*.9),audio.sampleRate),d=n.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*(1-i/d.length)**2.2;const src=audio.createBufferSource(),g=audio.createGain(),f=audio.createBiquadFilter();src.buffer=n;g.gain.value=volume;f.type='lowpass';f.frequency.setValueAtTime(900,audio.currentTime);f.frequency.exponentialRampToValueAtTime(90,audio.currentTime+.7);src.connect(f);f.connect(g);g.connect(audio.destination);src.start();beep(58,.6,volume*.7,'triangle')}
function audioStart(){try{if(!audio)audio=new(window.AudioContext||window.webkitAudioContext)();audio.resume().catch(()=>{})}catch{}}
function notify(text,seconds=2.5){$('notice').textContent=text;noticeTimer=seconds}
function feed(text){$('killfeed').textContent=text;feedTimer=5}
function inputMode(){document.body.classList.toggle('touch-mode',touch);$('inputmode').textContent=touch?'터치 조작':'마우스 조작'}inputMode();$('inputmode').onclick=()=>controls.toggleMode();$('sound').onclick=()=>{soundOn=!soundOn;$('sound').textContent='사운드 '+(soundOn?'ON':'OFF');if(soundOn)audioStart()};
function clearInput(){keys.clear();held=ads=false;move.x=move.y=0;dragLook=null;pointers.stick=pointers.look=pointers.fire=null;$('knob').style.transform='translate(0,0)'}
function lock(){if(touch||document.pointerLockElement===canvas)return;try{const p=canvas.requestPointerLock?.();p?.catch?.(()=>notify('마우스를 누른 채 드래그해 조준할 수도 있습니다',4))}catch{}}
function format(t){const seconds=Math.max(0,Math.ceil(t));return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0')}
function thirdView(){return thirdPerson&&!ads&&(state==='playing'||state==='finished')}
function updateGun(){const melee=R.melee(player.equipped),first=!thirdView();gun.setEnabled(first&&!!player.equipped&&!melee);hands.setEnabled(first&&melee);bladeView.setEnabled(melee&&!R.innate(player.equipped));viewRig.equip(player.equipped)}
function ensureSelfBody(){if(selfBody||!soldierAssets)return;selfBody=makeSoldier('self',0,0);selfBody.bodyHit.isPickable=false;selfBody.headHit.isPickable=false;selfBody.root.setEnabled(false)}
function dropSelfBody(){if(!selfBody)return;disposeSoldier(selfBody);selfBody=null}
// Pull straight out along the view axis, then swing to the shoulder, stopping short of any wall behind.
function placeView(moving){
  if(!thirdView()){if(scene.activeCamera!==camera)scene.activeCamera=camera;selfBody?.root.setEnabled(false);return}
  ensureSelfBody();
  const matrix=B.Matrix.RotationYawPitchRoll(camera.rotation.y,camera.rotation.x,0);
  const delta=V.TransformCoordinates(new V(.78,.34,-4.1),matrix),span=delta.length();
  let reach=span;const pick=scene.pickWithRay(new B.Ray(camera.position,delta.scale(1/span),span),m=>staticHits.has(m));
  if(pick?.hit)reach=Math.max(.55,pick.distance-.3);
  viewCam.position.copyFrom(camera.position).addInPlace(delta.scale(reach/span));
  viewCam.rotation.copyFrom(camera.rotation);viewCam.fov=camera.fov;
  if(scene.activeCamera!==viewCam)scene.activeCamera=viewCam;
  if(selfBody){selfBody.root.setEnabled(player.hp>0);selfBody.root.position.set(camera.position.x,0,camera.position.z);selfBody.root.rotation.y=yaw;dressSoldier(selfBody,{helmet:player.helmet>0,vest:player.vest>0,equipped:player.equipped});modelAnimation(selfBody,moving?'Run':'Idle')}
}
// A round should not just stop. Death pulls the camera off the body; a win orbits it.
function flare(center){
  const spark=B.MeshBuilder.CreateSphere('victory spark',{diameter:.18,segments:6},scene);
  const a=Math.random()*Math.PI*2,r=.6+Math.random()*3.4;
  spark.position.set(center.x+Math.sin(a)*r,.2+Math.random()*.5,center.z+Math.cos(a)*r);
  spark.material=glow('victory spark','#ffd479',2.2);spark.isPickable=false;
  const rise=1.6+Math.random()*1.9;
  effects.push({mesh:spark,life:1.7,own:true,update(fx,dt){spark.position.y+=rise*dt;spark.rotation.y+=dt*3;fx.mesh.material.alpha=Math.max(0,fx.life/1.7);spark.scaling.setAll(.6+(1-fx.life/1.7)*1.5)}});
}
function startOutro(mode,done){
  outro={mode,t:0,done,duration:mode==='win'?5.4:3.7,center:new V(camera.position.x,0,camera.position.z),yaw,next:0};
  state='outro';clearInput();ads=false;held=false;throwTimer=0;
  if(document.pointerLockElement)document.exitPointerLock();
  $('touch').hidden=true;$('pickup').hidden=true;$('actionprogress').hidden=true;
  gun.setEnabled(false);hands.setEnabled(false);
  ensureSelfBody();
  if(selfBody){
    selfBody.root.setEnabled(true);selfBody.root.position.set(outro.center.x,0,outro.center.z);selfBody.root.rotation.set(0,yaw,0);
    dressSoldier(selfBody,{helmet:player.helmet>0,vest:player.vest>0,equipped:player.equipped});
    selfBody.motion=null;modelAnimation(selfBody,'Idle');
    if(mode!=='win')for(const a of selfBody.animationGroups)a.pause();
  }
  $('hud').classList.add('cinematic');const card=$('outro');card.hidden=false;card.className=mode;
  $('outro-tag').textContent=mode==='win'?'#1 LAST SURVIVOR':'ELIMINATED';
  $('outro-title').textContent=mode==='win'?'최후의 생존자':'전사했습니다';
  $('outro-line').textContent=player.kills+'명 처치 · '+Math.floor(time)+'초 생존';
  beep(mode==='win'?720:120,mode==='win'?.45:.75,.09,mode==='win'?'sine':'sawtooth');
  if(mode==='win')for(const delay of [190,430,700,980])setTimeout(()=>beep(520+Math.random()*430,.32,.055),delay);
}
function endOutro(){const done=outro?.done;outro=null;$('outro').hidden=true;$('outro').className='';$('hud').classList.remove('cinematic');$('damage').style.opacity=0;if(done)done()}
function outroTick(dt){
  if(!outro){state='ready';return}
  outro.t+=dt;const t=outro.t,c=outro.center,ease=x=>1-Math.pow(1-Math.min(1,Math.max(0,x)),3);
  if(outro.mode==='lose'){
    const fall=ease(t/.75);
    if(selfBody){selfBody.root.rotation.x=-fall*1.45;selfBody.root.position.y=-fall*.08}
    const k=ease(t/2.9),angle=outro.yaw+Math.PI+k*.9,reach=2.5+k*3.7;
    viewCam.position.set(c.x+Math.sin(angle)*reach,.45+k*1.75,c.z+Math.cos(angle)*reach);
    viewCam.setTarget(new V(c.x,.4+k*.25,c.z));viewCam.fov=1.08-k*.18;
    $('damage').style.opacity=String(Math.max(0,.6-t*.16));
  }else{
    const k=ease(t/outro.duration),angle=outro.yaw+.5+t*.5;
    if(selfBody){selfBody.root.rotation.y=outro.yaw+Math.sin(t*1.25)*.24;selfBody.root.rotation.x=0}
    viewCam.position.set(c.x+Math.sin(angle)*(4+k*3.6),1.05+k*2.5,c.z+Math.cos(angle)*(4+k*3.6));
    viewCam.setTarget(new V(c.x,1.1,c.z));viewCam.fov=1.02;
    if(t>outro.next){outro.next=t+.11;flare(c)}
  }
  followSun(c);
  if(scene.activeCamera!==viewCam)scene.activeCamera=viewCam;
  if(player.blind>0){player.blind=Math.max(0,player.blind-dt);$('flashwash').style.opacity=String(Math.min(1,player.blind/1.6))}
  stepEffects(dt);
  for(let i=corpses.length-1;i>=0;i--){const corpse=corpses[i];corpse.age+=dt;corpse.e.root.rotation.x=-Math.min(1,corpse.age/.45)*Math.PI/2}
  if(t>=outro.duration)endOutro();
}
function toggleView(){thirdPerson=!thirdPerson;updateGun();placeView(false);notify(thirdPerson?'3인칭 시점 · 조준하면 1인칭으로 전환됩니다':'1인칭 시점',2)}
// The bar is a quick-slot row now: three weapon groups and three pouch items.
function quickSlots(){const melee=['knife','machete'].filter(id=>R.held(player,id)),guns=['carbine','smg','marksman'].filter(id=>R.held(player,id));
 const label=(list,fallback)=>{const current=list.find(id=>id===player.equipped);return list.length?R.weapons[current||list[0]].name:fallback};
 return[['fists','맨손',true,player.equipped==='fists'],['melee',label(melee,'근접 없음'),!!melee.length,melee.includes(player.equipped)],
  ['gun',label(guns,'총기 없음'),!!guns.length,guns.includes(player.equipped)],
  ['heal','구급팩 '+player.kits,player.kits>0,false],['flash','섬광탄 '+(player.flashes||0),(player.flashes||0)>0,false],['frag','폭탄 '+(player.frags||0),(player.frags||0)>0,false]]}
function ui(){const w=R.weapons[player.equipped],slot=player.weapons[player.equipped],out=R.outsideZone(camera.position.x,camera.position.z,zone);$('health').textContent=Math.ceil(player.hp);$('healthbar').style.width=player.hp+'%';$('healthbar').style.background=player.hp<30?'#f56f53':'#f1efdc';$('armor').textContent='헬멧 '+Math.ceil(player.helmet)+' · 조끼 '+Math.ceil(player.vest);$('helmetbar').style.width=player.helmet+'%';$('armorbar').style.width=player.vest+'%';$('kits').textContent=player.kits;$('ammo').textContent=slot?slot.ammo:'—';$('reserve').textContent=player.reserve;$('weapon').textContent=w?w.name+' / '+w.label:'맨손 · 무기를 찾으세요';$('reloadstatus').textContent=reloading>0?'재장전 중':healing>0?'치료 중':w?'공용 탄약':(touch?'획득 버튼으로 무기 확보':controls.keyLabel('collect')+'로 무기 획득');$('kills').textContent=player.kills;$('alive').textContent=netMode&&netState?netState.players.filter(p=>p.hp>0).length:enemies.length+(player.hp>0?1:0);$('phase').textContent='PHASE 0'+zone.phase;$('zonetimer').textContent=(zone.closing?'자기장 축소 중 ':'안전구역 축소까지 ')+format(zone.seconds);$('zonehint').textContent=out?'구역 밖! 초당 '+zone.dps+' 피해':'안전구역 반경 '+Math.round(zone.radius)+'m → '+zone.target+'m';$('zonehint').style.color=out?'#ffbb94':'#d1e1e6';$('zoneprogress').style.width=Math.max(0,zone.seconds/(zone.closing?R.stages[zone.phase-1].shrink:R.stages[zone.phase-1].wait)*100)+'%';$('slots').innerHTML=quickSlots().map(([action,text,has,active])=>`<span class="${active?'active':''}" style="opacity:${has?1:.42}">${controls.keyLabel(action)} ${text}</span>`).join('');$('meds').textContent=player.kits;$('flashes').textContent=player.flashes||0;$('frags').textContent=player.frags||0;$('flashcount').textContent=player.flashes||0;$('fragcount').textContent=player.frags||0;$('actionprogress').hidden=!(reloading||healing);$('actionprogress').textContent=healing?'치료 '+healing.toFixed(1)+'초':reloading?'재장전 '+reloading.toFixed(1)+'초':'';$('aim').style.borderColor=ads?'#efbf56':'';drawMap()}
const map=$('minimap').getContext('2d');function drawMap(){const size=320,s=size/222,c=size/2;map.clearRect(0,0,size,size);map.fillStyle='#455b46';map.fillRect(0,0,size,size);map.fillStyle='#84928a';
for(const[x,z,w,d]of [[0,0,12,212],[0,10,212,10],[-56,0,8,212],[56,0,8,212],[0,-62,212,8],[0,64,212,8]])map.fillRect(c+(x-w/2)*s,c-(z+d/2)*s,w*s,d*s);map.fillStyle='#b3b7a6';for(const o of obstacles)map.fillRect(c+(o.x-o.w)*s,c-(o.z+o.d)*s,o.w*2*s,o.d*2*s);map.fillStyle='#196ccf50';map.beginPath();map.rect(0,0,size,size);map.arc(c,c,Math.max(0,zone.radius*s),0,Math.PI*2,true);map.fill('evenodd');map.strokeStyle='#68b7ff';map.lineWidth=3;map.beginPath();map.arc(c,c,Math.max(0,zone.radius*s),0,Math.PI*2);map.stroke();map.strokeStyle='#fff';map.lineWidth=2;map.setLineDash([7,5]);map.beginPath();map.arc(c,c,Math.max(0,zone.target*s),0,Math.PI*2);map.stroke();map.setLineDash([]);for(const l of loot)if(!l.taken){map.fillStyle=l.type==='weapon'?'#f5c65c':l.type==='frag'||l.type==='flash'?'#9fe08a':'#d5eadc';map.fillRect(c+l.x*s-1.5,c-l.z*s-1.5,3,3)}
for(const g of grenades){map.fillStyle='#ff9c5c';map.fillRect(c+g.x*s-2,c-g.z*s-2,4,4)}map.save();map.translate(c+camera.position.x*s,c-camera.position.z*s);map.rotate(yaw);map.fillStyle='#fff';map.strokeStyle='#182b31';map.lineWidth=2;map.beginPath();map.moveTo(0,-9);map.lineTo(-6,6);map.lineTo(0,3);map.lineTo(6,6);map.closePath();map.fill();map.stroke();map.restore()}
let soldierAssets=null,lobbySoldier=null,charactersReady=false;
const VEST_REST=new V(0,1.3,0),HELMET_REST=new V(0,1.7,-.008);
const corpses=[];
function modelAnimation(e,name){if(e.motion===name)return;e.motion=name;for(const [key,a] of Object.entries(e.animations)){if(key===name){a.play(true);a.speedRatio=name==='Run'?1:name==='Walk'?1.25:1}else a.stop()}}
// Gear is authored in root space and then carried by a bone, so a vest breathes with the chest
// and a helmet turns with the head instead of floating at a fixed height.
const socketScale=new B.Vector3(),socketRotation=new B.Quaternion(),socketPosition=new B.Vector3();
function boneRest(e,boneName){const bone=e.rig[boneName];if(!bone)return null;bone.computeWorldMatrix(true);e.root.computeWorldMatrix(true);
  const local=bone.getWorldMatrix().multiply(e.root.getWorldMatrix().clone().invert());return{bone,inverse:local.clone().invert()}}
function socketTo(e,node,socket,offset,rootInverse){
  if(!node||!socket)return;socket.bone.computeWorldMatrix(true);
  const local=socket.bone.getWorldMatrix().multiply(rootInverse),m=socket.inverse.multiply(local);
  m.decompose(socketScale,socketRotation,socketPosition);
  node.rotationQuaternion=socketRotation.clone();
  node.position.copyFrom(B.Vector3.TransformCoordinates(offset,m));
}
function updateWorld(e){const nodes=e.nodes||(e.nodes=e.model.getDescendants(false));for(const child of nodes)child.computeWorldMatrix(true);e.model.computeWorldMatrix(true)}
// Rotate joints in parent space, so the imported glTF coordinate conversion stays intact.
function pointJoint(joint,child,target){const parent=joint.parent,inv=parent.getWorldMatrix().clone().invert();const origin=V.TransformCoordinates(joint.getAbsolutePosition(),inv),current=V.TransformCoordinates(child.getAbsolutePosition(),inv).subtract(origin).normalize(),desired=V.TransformCoordinates(target,inv).subtract(origin).normalize();const dot=Math.max(-1,Math.min(1,V.Dot(current,desired)));if(dot>.99999)return;let axis=V.Cross(current,desired);if(axis.lengthSquared()<1e-8)axis=V.Cross(current,new V(1,0,0));if(axis.lengthSquared()<1e-8)axis=V.Cross(current,new V(0,0,1));const delta=B.Quaternion.RotationAxis(axis.normalize(),Math.acos(dot));joint.rotationQuaternion=delta.multiply(joint.rotationQuaternion||B.Quaternion.FromEulerVector(joint.rotation));joint.computeWorldMatrix(true);child.computeWorldMatrix(true)}
function solveArm(upper,lower,hand,target,pole){if(!upper||!lower||!hand)return;upper.computeWorldMatrix(true);lower.computeWorldMatrix(true);hand.computeWorldMatrix(true);const a=upper.getAbsolutePosition().clone(),b=lower.getAbsolutePosition().clone(),c=hand.getAbsolutePosition().clone(),l1=V.Distance(a,b),l2=V.Distance(b,c),delta=target.subtract(a),distance=Math.min(delta.length(),(l1+l2)*.97);if(distance<.001)return;const dir=delta.normalize(),perp=pole.subtract(a);perp.subtractInPlace(dir.scale(V.Dot(perp,dir))).normalize();const along=(l1*l1-l2*l2+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,l1*l1-along*along));const elbow=a.add(dir.scale(along)).add(perp.scale(height));pointJoint(upper,lower,elbow);hand.computeWorldMatrix(true);pointJoint(lower,hand,a.add(dir.scale(distance)))}
// Two dozen rigs cannot each run IK every frame; distant soldiers keep their clip pose.
function poseSoldier(e){if(!e.rig||!e.root.isEnabled())return;
if(V.DistanceSquared(e.root.position,scene.activeCamera.position)>3600&&e!==selfBody&&e!==lobbySoldier)return;
updateWorld(e);const world=e.root.getWorldMatrix(),local=p=>V.TransformCoordinates(p,world),bob=e.motion==='Idle'?0:Math.sin(e.phase)*.012;
solveArm(e.rig.RightArm,e.rig.RightForeArm,e.rig.RightHand,local(new V(.14,1.27+bob,.31)),local(new V(.65,1.1,.02)));
solveArm(e.rig.LeftArm,e.rig.LeftForeArm,e.rig.LeftHand,local(new V(-.07,1.29+bob,.57)),local(new V(-.6,1.08,.05)));
e.rifle.position.y=1.29+bob;e.rifle.position.z=.42-(e.flashTime>0?.025:0);
if(e.rig.Head){e.rig.Head.computeWorldMatrix(true);const center=e.rig.Head.getAbsolutePosition(),inv=world.clone().invert();e.headHit.position.copyFrom(V.TransformCoordinates(center,inv));e.headHit.position.y+=.08}
const rootInverse=world.clone().invert();
if(e.gearVest?.isEnabled()){if(e.socketChest)socketTo(e,e.gearVest,e.socketChest,VEST_REST,rootInverse);else e.gearVest.position.set(0,1.29+bob,0)}
if(e.gearHelmet?.isEnabled()){if(e.socketHead)socketTo(e,e.gearHelmet,e.socketHead,HELMET_REST,rootInverse);else{e.gearHelmet.position.copyFrom(e.headHit.position);e.gearHelmet.position.y+=.03}}
if(e.blade)e.blade.position.y=1.22+bob;
}
function dressSoldier(e,{helmet,vest,equipped}){
  e.gearHelmet?.setEnabled(!!helmet);e.gearVest?.setEnabled(!!vest);
  const melee=R.melee(equipped);
  e.rifle.setEnabled(!!equipped&&!melee);
  e.blade?.setEnabled(melee&&!R.innate(equipped));
}
function disposeSoldier(e){for(const a of e.animationGroups)a.dispose();for(const sk of e.skeletons)sk.dispose();e.root.dispose()}
function makeSoldier(id,x,z){const root=new B.TransformNode('soldier '+id,scene);root.position.set(x,0,z);const e={id,root,hp:100,helmet:0,vest:0,equipped:'carbine',speed:2.4+Math.random()*.5,attack:2+Math.random()*2,phase:Math.random()*6,target:null,path:[],plan:Math.random(),rethink:Math.random(),fireCount:0,flashTime:0,motion:null,blind:0,frags:0,nadeTimer:99};
const instance=soldierAssets.instantiateModelsToScene(name=>'bot'+id+'_'+name,false,{doNotInstantiate:true});e.animationGroups=instance.animationGroups;e.skeletons=instance.skeletons;e.model=new B.TransformNode('body rig',scene);e.model.parent=root;e.model.rotation.y=Math.PI;
for(const node of instance.rootNodes){node.parent=e.model;node.setEnabled(true)}
// Normalize height once; preserve the skinning rig and shared geometry/materials.
let low=Infinity,high=-Infinity;for(const mesh of e.model.getChildMeshes()){mesh.computeWorldMatrix(true);if(mesh.getTotalVertices()){const b=mesh.getBoundingInfo().boundingBox;low=Math.min(low,b.minimumWorld.y);high=Math.max(high,b.maximumWorld.y)}}
const scale=1.82/(high-low);e.model.scaling.setAll(scale);e.model.position.y=-low*scale;
e.rig={};for(const node of e.model.getDescendants()){const name=node.name.split(':').pop();if(['Head','Neck','Spine','Spine1','Spine2','Hips','RightArm','RightForeArm','RightHand','LeftArm','LeftForeArm','LeftHand'].includes(name))e.rig[name]=node}
for(const mesh of e.model.getChildMeshes()){mesh.isPickable=false;mesh.receiveShadows=true;mesh.alwaysSelectAsActiveMesh=true;if(mesh.getTotalVertices())shadow.addShadowCaster(mesh)}
e.animations={};for(const a of e.animationGroups){const name=['Idle','Walk','Run'].find(n=>a.name.endsWith(n));if(name)e.animations[name]=a;for(const t of a.targetedAnimations){t.animation.enableBlending=true;t.animation.blendingSpeed=.12}}
function hitbox(name,y,height,radius,head=false){const m=B.MeshBuilder.CreateCapsule(name,{height,radius,tessellation:8,subdivisions:1},scene);m.parent=root;m.position.y=y;m.visibility=0;m.isPickable=true;m.metadata={enemy:e,head};return m}
e.bodyHit=hitbox('body hitbox',.85,1.35,.25);e.headHit=hitbox('head hitbox',1.67,.31,.15,true);
e.rifle=new B.TransformNode('rifle',scene);e.rifle.parent=root;e.rifle.position.set(.12,1.29,.42);
for(const [name,px,py,pz,w,h,d,material] of [['receiver',0,0,0,.085,.09,.32,M.dark],['stock',0,0,-.24,.07,.11,.2,M.pants],['barrel',0,.015,.35,.028,.028,.37,M.dark],['handguard',0,.005,.18,.075,.085,.2,M.steel],['magazine',0,-.09,.01,.055,.16,.08,M.dark],['rail',0,.057,.07,.055,.018,.29,M.steel],['grip',0,-.075,-.09,.055,.14,.05,M.dark]]){const m=box(name,px,py,pz,w,h,d,material,false,false);m.parent=e.rifle}
// Picked-up gear is worn on the body, so what a player carries is what everyone sees.
// +z is the direction the soldier faces, so plates, pouches and the nape guard are placed against that.
e.gearHelmet=new B.TransformNode('worn helmet',scene);e.gearHelmet.parent=root;
const shell=B.MeshBuilder.CreateSphere('worn helmet shell',{diameter:.31,segments:14,slice:.56},scene);
shell.parent=e.gearHelmet;shell.scaling.set(1.03,1,1.14);shell.material=M.helmetShell;shell.isPickable=false;shell.receiveShadows=true;shadow.addShadowCaster(shell);
const rim=B.MeshBuilder.CreateTorus('worn helmet rim',{diameter:.312,thickness:.024,tessellation:18},scene);
rim.parent=e.gearHelmet;rim.position.y=-.014;rim.scaling.z=1.14;rim.material=M.helmetShell;rim.isPickable=false;
for(const[name,x,y,z,w,h,d,material]of [['nape guard',0,-.045,-.145,.21,.09,.05,M.helmetShell],['brow brim',0,-.03,.155,.19,.05,.05,M.helmetShell],['left ear cover',-.145,-.055,0,.04,.09,.16,M.kevlar],['right ear cover',.145,-.055,0,.04,.09,.16,M.kevlar],['helmet rail',.13,.03,.02,.028,.05,.16,M.dark],['night mount',0,.035,.145,.06,.05,.05,M.dark]]){
  const piece=box(name,x,y,z,w,h,d,material,false,false);piece.parent=e.gearHelmet;piece.receiveShadows=true;
}
e.gearHelmet.setEnabled(false);
e.gearVest=new B.TransformNode('worn vest',scene);e.gearVest.parent=root;
// Cut close to the torso: a carrier covers the ribs, not the throat.
for(const[name,x,y,z,w,h,d,material]of [
  ['chest plate',0,-.02,.125,.33,.33,.07,M.kevlar],['back plate',0,-.02,-.125,.31,.31,.065,M.kevlar],
  ['left side panel',-.155,-.04,0,.05,.24,.2,M.kevlar],['right side panel',.155,-.04,0,.05,.24,.2,M.kevlar],
  ['left shoulder strap',-.115,.17,.01,.075,.1,.24,M.kevlar],['right shoulder strap',.115,.17,.01,.075,.1,.24,M.kevlar],
  ['cummerbund',0,-.185,0,.32,.11,.25,M.kevlar],
  ['radio pouch',-.15,.01,-.155,.08,.12,.05,M.dark],['left buckle',-.115,.11,.155,.06,.035,.02,M.steel],['right buckle',.115,.11,.155,.06,.035,.02,M.steel]]){
  const piece=box(name,x,y,z,w,h,d,material,false,false);piece.parent=e.gearVest;piece.receiveShadows=true;shadow.addShadowCaster(piece);
}
for(const x of [-.09,0,.09]){const pouch=box('mag pouch',x,-.07,.175,.075,.13,.055,M.kevlar,false,false);pouch.parent=e.gearVest;pouch.receiveShadows=true;
  const flap=box('pouch flap',x,-.005,.18,.08,.025,.06,M.dark,false,false);flap.parent=e.gearVest}
e.gearVest.setEnabled(false);
// A drawn blade replaces the rifle in the hands.
e.blade=new B.TransformNode('held blade',scene);e.blade.parent=root;e.blade.position.set(.17,1.22,.4);e.blade.rotation.set(-.25,0,0);
const heldBlade=box('held blade steel',0,0,.22,.06,.014,.42,M.blade,false,false);heldBlade.parent=e.blade;
const heldGuard=box('held cross guard',0,0,.02,.11,.03,.035,M.dark,false,false);heldGuard.parent=e.blade;
const heldGrip=B.MeshBuilder.CreateCylinder('held grip',{height:.17,diameter:.05,tessellation:8},scene);
heldGrip.parent=e.blade;heldGrip.rotation.x=Math.PI/2;heldGrip.position.z=-.09;heldGrip.material=M.grip;heldGrip.isPickable=false;
e.blade.setEnabled(false);
e.socketChest=boneRest(e,'Spine1')||boneRest(e,'Spine');e.socketHead=boneRest(e,'Head');
const flash=B.MeshBuilder.CreateSphere('enemy muzzle flash',{diameter:.15,segments:5},scene);flash.parent=e.rifle;flash.position.set(0,.015,.57);flash.material=M.flash;flash.isPickable=false;flash.setEnabled(false);e.flash=flash;modelAnimation(e,'Idle');return e}
const BOTS=23;
// Drop points ring the field: the outer ring is shared with online spawns, the inner one fills the gaps.
const botSpots=(()=>{const list=[];for(let i=1;i<W.spawns.length;i++)list.push(W.spawns[i]);
 for(let i=0;i<8;i++){const a=(i+.5)/8*Math.PI*2;let spot=[Math.sin(a)*70,Math.cos(a)*70];
  for(let r=70;r>26&&W.blocked(spot[0],spot[1],1.4);r-=3)spot=[Math.sin(a)*r,Math.cos(a)*r];list.push(spot)}
 return list})();
function spawnBot(i){const p=botSpots[i%botSpots.length];
  const e=makeSoldier(i+1,p[0],p[1]);
  e.helmet=Math.random()<.45?100:0;e.vest=Math.random()<.6?70:0;e.equipped=Math.random()<.18?'machete':'carbine';
  e.frags=Math.random()<.45?1:0;e.nadeTimer=8+Math.random()*14;
  dressSoldier(e,e);enemies.push(e)}
// Bots lob with the same arc solver the physics uses, so the throw actually lands near the target.
function botThrow(e,tp){const p=e.root.position,dx=tp.x-p.x,dz=tp.z-p.z,d=Math.hypot(dx,dz);
  const power=Math.min(28,Math.max(9,(-.354+Math.sqrt(.125+.152*d))/.076))*(.92+Math.random()*.16);
  launch('frag',p.x,p.z,Math.atan2(dx,dz)+(Math.random()-.5)*.09,-.35,e,power);
  beep(250,.08,.04,'square')}
scene.onAfterAnimationsObservable.add(()=>{if(selfBody&&selfBody.root.isEnabled())poseSoldier(selfBody);for(const e of enemies)poseSoldier(e);for(const e of netPeers.values())if(e.hp>0)poseSoldier(e);if((state==='ready'||state==='lobby')&&lobbySoldier)poseSoldier(lobbySoldier)});
async function loadCharacters(){try{start.disabled=true;start.textContent='캐릭터 불러오는 중…';boot?.stage('캐릭터와 텍스처 다운로드 중…');soldierAssets=await B.SceneLoader.LoadAssetContainerAsync('assets/','soldier.glb',scene);for(const material of soldierAssets.materials){if(material instanceof B.PBRMaterial){material.metallic=0;material.roughness=.85;material.environmentIntensity=.6;material.directIntensity=1;material.albedoColor=new C(.85,.85,.85)}}for(const a of soldierAssets.animationGroups)a.stop();lobbySoldier=makeSoldier(0,2.1,-51);lobbySoldier.root.rotation.y=Math.PI+.12;camera.position.set(-1,1.6,-56);camera.rotation.set(.04,.02,0);charactersReady=true;boot?.stage('3D 화면 준비 중…');scene.executeWhenReady(()=>{start.disabled=false;start.textContent='혼자 플레이 →';boot?.ready();window.GameOnline?.ready()})}catch(error){console.error(error);startupFailure('인체 모델을 불러오지 못했습니다. 연결을 확인하고 새로고침해 주세요.',error);start.disabled=true;start.textContent='캐릭터 로딩 실패'}}
loadCharacters();

function resetRound(){if(!charactersReady)return;followSun(W.spawns[0]?{x:W.spawns[0][0],z:W.spawns[0][1]}:{x:0,z:0});if(lobbySoldier){lobbySoldier.root.setEnabled(false);for(const a of lobbySoldier.animationGroups)a.stop()}for(const c of corpses)disposeSoldier(c.e);corpses.length=0;for(const e of enemies)disposeSoldier(e);enemies.length=0;for(const e of effects)e.mesh.dispose();effects.length=0;dropSelfBody();clearGrenades();outro=null;$('outro').hidden=true;populateLoot(W.spawns[0]);for(let i=0;i<BOTS;i++)spawnBot(i);player=R.newPlayer();time=clock=0;zone=R.zoneAt(0);const drop=W.spawns[0];yaw=Math.atan2(-drop[0],-drop[1]);pitch=0;reloading=healing=shotTimer=recoil=hitTimer=damageFade=throwTimer=shake=0;camera.position.set(drop[0],1.7,drop[1]);camera.rotation.set(0,yaw,0);nearest=null;clearInput();updateGun();state='playing';$('screen').hidden=true;$('hud').hidden=false;$('touch').hidden=!touch;$('killfeed').textContent='';$('damage').style.opacity=0;$('zonewash').style.opacity=0;$('flashwash').style.opacity=0;audioStart();notify('보급품은 매 라운드 무작위로 흩어집니다 · '+(touch?'섬광·폭탄 버튼':controls.keyLabel('flash')+'·'+controls.keyLabel('frag'))+'으로 투척 · '+(touch?'시점 버튼':controls.keyLabel('view'))+' 시점 전환',6);ui();lock()}
function pause(){if(netMode){netMenu();return}if(state!=='playing')return;state='paused';for(const e of enemies)for(const a of e.animationGroups)a.pause();clearInput();if(document.pointerLockElement)document.exitPointerLock();$('screen').hidden=false;$('touch').hidden=true;$('screen-title').textContent='전장 일시정지';$('screen-desc').textContent='이어하기를 누르면 자기장과 전투가 다시 진행됩니다.';start.textContent='전투 이어하기 →'}
function resume(){if(netMode){netResume();return}state='playing';for(const e of enemies)e.animations[e.motion]?.play(true);clearInput();$('screen').hidden=true;$('touch').hidden=!touch;audioStart();lock()}
function end(won,cause=''){if(state!=='playing')return;
  const placing=enemies.length+1;
  for(const e of enemies)for(const a of e.animationGroups)a.pause();
  startOutro(won?'win':'lose',()=>{state=won?'won':'lost';$('screen').hidden=false;$('touch').hidden=true;
    $('screen-title').textContent=won?'#1 최후의 생존자':'#'+placing+' 전투 종료';
    $('screen-desc').textContent=`${player.kills}명 처치 · ${Math.floor(time)}초 생존. ${won?'전장의 마지막 생존자가 되었습니다.':cause+' 다음에는 엄폐물과 안전구역을 활용하세요.'}`;
    start.textContent='새 전장에 투입 →';ui()});}
start.onclick=()=>netMode?(state==='paused'?netResume():window.GameOnline.open()):(state==='paused'?resume():resetRound());$('pause').onclick=pause;
function die(e,killer){const index=enemies.indexOf(e);if(index<0)return;const p=e.root.position.clone();for(const a of e.animationGroups)a.pause();e.bodyHit.isPickable=false;e.headHit.isPickable=false;e.flash.setEnabled(false);corpses.push({e,age:0});enemies.splice(index,1);lootItem('ammo',p.x,p.z,null,30);if(Math.random()<.35)lootItem('med',p.x+.8,p.z);if(e.frags>0)lootItem('frag',p.x-.8,p.z);else if(Math.random()<.22)lootItem('flash',p.x-.8,p.z);if(killer==='player'){player.kills++;feed('YOU → BOT '+String(e.id).padStart(2,'0'));beep(470,.07,.07)}else feed((killer==='zone'?'자기장':killer)+' → BOT '+String(e.id).padStart(2,'0'));if(enemies.length===0&&player.hp>0)end(true);ui()}
function hurt(amount,cause,zoneDamage=false,head=false){if(state!=='playing')return;R.damage(player,amount,zoneDamage,head);if(!zoneDamage){damageFade=.75;healing=0;beep(65,.08,.09,'sawtooth')}if(player.hp<=0)end(false,cause);ui()}
function trace(a,b,color){const m=B.MeshBuilder.CreateLines('tracer',{points:[a,b]},scene);m.color=color;m.isPickable=false;effects.push({mesh:m,life:.12})}
function impact(p){const m=B.MeshBuilder.CreateSphere('impact',{diameter:.09,segments:4},scene);m.position.copyFrom(p);m.material=M.yellow;m.isPickable=false;effects.push({mesh:m,life:.16})}
function searchLoot(){nearest=null;let distance=3.1;for(const l of loot){if(l.taken)continue;const d=Math.hypot(camera.position.x-l.x,camera.position.z-l.z);if(d<distance&&visible(camera.position,new V(l.x,.45,l.z))){distance=d;nearest=l}}$('pickup').hidden=!nearest||(netMode&&(netState?.phase!=='playing'||player.hp<=0));$('loot').classList.toggle('available',!!nearest);if(nearest)$('loot-icon').className='loot-icon '+nearest.type;$('loot').style.opacity=nearest?'1':'.5';if(nearest){$('lootname').textContent=nearest.type==='weapon'?R.weapons[nearest.weapon].name:nearest.type==='ammo'?'탄약 +'+nearest.amount:nearest.type==='med'?'구급팩 +1':nearest.type==='helmet'?'전술 헬멧':'방탄 조끼';$('loottype').textContent=nearest.type==='weapon'?R.weapons[nearest.weapon].label:nearest.type==='med'?(touch?'치료 버튼':controls.keyLabel('heal'))+' · 3초 치료 · 체력 +65':nearest.type==='helmet'?'머리 피해 흡수 · 내구도 100':nearest.type==='vest'?'몸통 피해 흡수 · 내구도 100':'모든 총기에 사용';$('pickup').querySelector('b').textContent=touch?'터치해 획득':controls.keyLabel('collect')+' 획득'}}
function collect(){if(netMode){netAction('collect');return}if(state!=='playing')return;searchLoot();if(!nearest){notify('가까운 보급품이 없습니다',1);return}const old=player.equipped;if(R.collect(player,nearest)){nearest.root.setEnabled(false);notify(nearest.type==='weapon'?R.weapons[nearest.weapon].name+' 확보':'보급품 획득',1.4);if(old!==player.equipped){reloading=healing=0;updateGun()}beep(710,.08,.06);searchLoot();ui()}else notify(nearest.type==='med'?'구급팩을 더 들 수 없습니다':'이미 방탄복이 가득 찼습니다',1.5)}
function cycleFrom(list){const owned=list.filter(id=>R.held(player,id));if(!owned.length){notify('가진 무기가 없습니다',1.2);return}equip(owned[(owned.indexOf(player.equipped)+1)%owned.length])}
function equipMelee(){cycleFrom(['knife','machete'])}
function equipGun(){cycleFrom(['carbine','smg','marksman'])}
function equip(id){if(netMode){netAction('equip',id);return}if(state!=='playing'||!R.held(player,id)||id===player.equipped)return;player.equipped=id;reloading=healing=0;held=false;updateGun();ui()}
function swap(){const owned=Object.keys(R.weapons).filter(id=>R.held(player,id));if(owned.length) equip(owned[(owned.indexOf(player.equipped)+1)%owned.length])}
function reload(){if(netMode){netAction('reload');return}const w=R.weapons[player.equipped],s=player.weapons[player.equipped];if(state!=='playing'||!w||reloading||s.ammo===w.mag)return;if(player.reserve<=0){notify('탄약이 없습니다. 보급품을 찾으세요',1.5);return}reloading=w.reload;healing=0;held=false;beep(280,.1,.04,'square');ui()}
function heal(){if(netMode){netAction('heal');return}if(state!=='playing'||healing)return;if(!player.kits){notify('구급팩이 없습니다',1.5);return}if(player.hp>=100){notify('체력이 가득 찼습니다',1.5);return}healing=3;reloading=0;held=false;notify('치료 중 · 사격하거나 맞으면 취소됩니다',2);ui()}
function shoot(){if(netMode){netShot();return}if(state!=='playing'||shotTimer>0||reloading)return;const w=R.weapons[player.equipped],s=player.weapons[player.equipped];if(!w){shotTimer=.5;return}const melee=w.melee===true;if(!melee){if(!s){shotTimer=.5;notify((touch?'획득 버튼':controls.keyLabel('collect'))+'으로 무기를 먼저 획득하세요',1.5);return}if(s.ammo<=0){reload();shotTimer=.2;return}s.ammo--;muzzle.setEnabled(true);shotSound()}else{swingHands();beep(R.innate(player.equipped)?180:300,.09,.05,'square')}healing=0;shotTimer=w.interval;recoil=melee?0:player.equipped==='marksman'?.075:.045;const ray=camera.getForwardRay(w.range);const pick=scene.pickWithRay(ray,m=>m.isPickable===true);const endPoint=pick?.hit?pick.pickedPoint:ray.origin.add(ray.direction.scale(w.range));if(!melee)trace(camera.position.add(new V(.1,-.1,0)),endPoint,new C(1,.85,.4));if(pick?.hit){const e=pick.pickedMesh.metadata?.enemy;if(e&&e.hp>0){const head=pick.pickedMesh.metadata.head;R.damage(e,w.damage*(head?(melee?1.5:2.5):1));hitTimer=.13;$('hitmarker').style.color=head?'#ffad52':'#fff';if(e.hp<=0)die(e,'player')}if(!melee)impact(pick.pickedPoint)}ui()}
$('loot').onclick=collect;$('pickup').onclick=collect;$('reload').onclick=reload;$('heal').onclick=heal;$('swap').onclick=swap;$('view').onclick=toggleView;$('aim').onclick=()=>{if(state==='playing')ads=!ads};$('flash').onclick=()=>throwItem('flash');$('frag').onclick=()=>throwItem('frag');
function planBot(e,target){e.path=route(e.root.position,target);e.plan=1.5+Math.random()*.4}
function updateBots(dt){for(const e of [...enemies]){if(state!=='playing')break;const p=e.root.position,oldX=p.x,oldZ=p.z;e.attack-=dt;e.plan-=dt;e.rethink-=dt;e.flashTime-=dt;e.nadeTimer-=dt;if(e.blind>0)e.blind=Math.max(0,e.blind-dt);e.flash.setEnabled(e.flashTime>0);if(R.outsideZone(p.x,p.z,zone)){R.damage(e,zone.dps*dt,true);if(e.hp<=0){die(e,'zone');continue}}
const unsafe=Math.hypot(p.x,p.z)>Math.max(1,zone.target-3),eye=new V(p.x,1.45,p.z);
if(e.rethink<=0){e.rethink=.4+Math.random()*.35;e.target=null;
 const candidates=[{id:'player',position:camera.position,actor:player},...enemies.filter(a=>a!==e).map(a=>({id:a.id,position:new V(a.root.position.x,1.45,a.root.position.z),actor:a}))]
  .filter(t=>t.actor.hp>0).map(t=>({...t,d:V.Distance(eye,t.position)})).filter(t=>t.d<52).sort((a,b)=>a.d-b.d).slice(0,6);
 for(const t of candidates)if(visible(eye,t.position)){e.target=t;break}}
let target=e.target;if(target&&target.actor.hp<=0)target=e.target=null;let dest=new V(0,0,0),moving=true;const centerRadius=Math.min(zone.target*.65,25),angle=e.id*2.399;dest.set(Math.sin(angle)*centerRadius,0,Math.cos(angle)*centerRadius);
if(target){const tp=target.id==='player'?camera.position:new V(target.actor.root.position.x,1.45,target.actor.root.position.z),d=V.Distance(eye,tp);e.root.rotation.y=Math.atan2(tp.x-p.x,tp.z-p.z);if(!unsafe&&d>14)dest=new V(tp.x,0,tp.z);else if(!unsafe){dest=new V(p.x+Math.cos(clock+e.id)*3,0,p.z+Math.sin(clock+e.id)*3);moving=false;if(e.plan<=0)planBot(e,dest)}if(e.frags>0&&e.nadeTimer<=0&&e.blind<=0&&d>11&&d<34&&time>12&&visible(eye,tp)){e.frags--;e.nadeTimer=16+Math.random()*12;botThrow(e,tp)}
if(d<48&&e.attack<=0&&time>8&&e.blind<1.4&&visible(eye,tp)){e.attack=.75+Math.random()*.6;e.flashTime=.08;e.fireCount++;const hit=Math.random()<(target.id==='player'?.24:.4)*(d<18?1.4:1)*(e.blind>0?.25:1);const aim=tp.add(new V(hit?0:(Math.random()-.5)*2.4,hit?0:Math.random()*.9,0));trace(eye,aim,new C(1,.59,.23));if(V.Distance(eye,camera.position)<35)shotSound(.045);if(hit){if(target.id==='player')hurt(9,'적의 사격에 쓰러졌습니다.');else{R.damage(target.actor,13);if(target.actor.hp<=0)die(target.actor,'BOT '+e.id)}}}}
else if(e.path.length)e.root.rotation.y=Math.atan2(e.path[0].x-p.x,e.path[0].z-p.z);
if(e.plan<=0)planBot(e,dest);if(e.path.length){const next=e.path[0],dx=next.x-p.x,dz=next.z-p.z,d=Math.hypot(dx,dz);if(d<.65)e.path.shift();else{const speed=(unsafe?3.5:e.speed)*(moving?1:.55)*(e.blind>0?.55:1);advance(p,dx/d*speed*dt,dz/d*speed*dt,.36);e.phase+=dt*speed*4}}const actualSpeed=Math.hypot(p.x-oldX,p.z-oldZ)/Math.max(dt,.001);modelAnimation(e,actualSpeed>2.2?'Run':actualSpeed>.15?'Walk':'Idle')}}
function tick(dt){clock+=dt;if(state==='outro'){outroTick(dt);return}if(netMode){netTick(dt);return}if(state==='ready'){camera.rotation.y=.02+Math.sin(clock*.08)*.015;return}if(state!=='playing')return;time+=dt;const previous=zone;zone=R.zoneAt(time);if(zone.phase!==previous.phase)notify('자기장 '+zone.phase+'단계 · 다음 원으로 이동하세요',3);else if(zone.closing&&!previous.closing){notify('자기장이 좁아집니다!',3);beep(230,.6,.08)}wall.scaling.set(Math.max(.001,zone.radius),1,Math.max(.001,zone.radius));zoneRing.scaling.set(zone.radius,1,zone.radius);nextRing.scaling.set(zone.target,1,zone.target);$('zonewash').style.opacity=R.outsideZone(camera.position.x,camera.position.z,zone)?'.9':'0';if(R.outsideZone(camera.position.x,camera.position.z,zone))hurt(zone.dps*dt,'자기장 밖에서 쓰러졌습니다.',true);if(state!=='playing')return;
shotTimer=Math.max(0,shotTimer-dt);punchTimer=Math.max(0,punchTimer-dt);throwTimer=Math.max(0,throwTimer-dt);recoil=Math.max(0,recoil-dt*.55);damageFade=Math.max(0,damageFade-dt*1.8);hitTimer=Math.max(0,hitTimer-dt);noticeTimer-=dt;feedTimer-=dt;if(noticeTimer<=0)$('notice').textContent='';if(feedTimer<=0)$('killfeed').textContent='';$('damage').style.opacity=damageFade;$('hitmarker').style.opacity=hitTimer>0?1:0;muzzle.setEnabled(recoil>.025);
if(player.blind>0)player.blind=Math.max(0,player.blind-dt);$('flashwash').style.opacity=String(Math.min(1,(player.blind||0)/1.6));
if(reloading>0){reloading-=dt;if(reloading<=0){reloading=0;R.reload(player);beep(420,.06,.04,'square');ui()}}
if(healing>0){healing-=dt;if(healing<=0){healing=0;R.heal(player);beep(650,.15,.06);ui()}}
let mx=(pressed('right')?1:0)-(pressed('left')?1:0)+move.x,mz=(pressed('forward')?1:0)-(pressed('back')?1:0)-move.y,length=Math.hypot(mx,mz);if(length>1){mx/=length;mz/=length}const speed=healing?1.8:ads?2.7:pressed('sprint')?7:4.8;advance(camera.position,(mx*Math.cos(yaw)+mz*Math.sin(yaw))*speed*dt,(-mx*Math.sin(yaw)+mz*Math.cos(yaw))*speed*dt);if(length>.1)step+=dt*10;camera.position.y=1.7+(length>.1?Math.sin(step)*.02:0);followSun(camera.position);camera.rotation.set(pitch-recoil*.2,yaw,0);if(shake>0){camera.rotation.x+=(Math.random()-.5)*shake;camera.rotation.y+=(Math.random()-.5)*shake;camera.rotation.z=(Math.random()-.5)*shake*.7;shake=Math.max(0,shake-dt*1.7);if(!shake)camera.rotation.z=0}camera.fov+=((ads&&!R.melee(player.equipped)?(player.equipped==='marksman'?.45:.7):1.08)-camera.fov)*Math.min(1,dt*12);viewRig.pose({dt,moving:length>.1,step,time,yaw,pitch,ads,recoil,reloading,healing});poseHands(length>.1);placeView(length>.1);
if(held)shoot();updateGrenades(dt);if(state!=='playing')return;updateBots(dt);for(let i=corpses.length-1;i>=0;i--){const c=corpses[i];c.age+=dt;c.e.root.rotation.x=-Math.min(1,c.age/.45)*Math.PI/2;if(c.age>5){disposeSoldier(c.e);corpses.splice(i,1)}}stepEffects(dt);hudTimer-=dt;if(hudTimer<=0){searchLoot();ui();hudTimer=.12}}
const keyActions={collect,reload,heal,swap,view:toggleView,fists:()=>equip('fists'),melee:equipMelee,gun:equipGun,flash:()=>throwItem('flash'),frag:()=>throwItem('frag')};
addEventListener('keydown',e=>{if(controls.modalOpen||controls.editing||window.GameOnline?.modalOpen)return;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();keys.add(e.code);if(e.repeat)return;if(e.code==='Escape'){pause();return}keyActions[controls.actionFor(e.code)]?.()});addEventListener('keyup',e=>keys.delete(e.code));
canvas.addEventListener('pointerdown',e=>{if(state!=='playing'||touch)return;if(e.button===2){ads=true;return}if(e.button!==0)return;held=true;if(netMode)netShot();dragLook={x:e.clientX,y:e.clientY};lock()});addEventListener('pointerup',e=>{if(touch)return;if(e.button===2)ads=false;if(e.button===0){held=false;dragLook=null}});canvas.addEventListener('pointercancel',clearInput);canvas.addEventListener('contextmenu',e=>e.preventDefault());addEventListener('mousemove',e=>{if(state!=='playing'||touch)return;const sensitivity=ads?.0013:.0024;if(document.pointerLockElement===canvas){yaw+=e.movementX*sensitivity;pitch+=e.movementY*sensitivity}else if(dragLook){yaw+=(e.clientX-dragLook.x)*.004;pitch+=(e.clientY-dragLook.y)*.004;dragLook={x:e.clientX,y:e.clientY}}pitch=Math.max(-1.25,Math.min(1.25,pitch))});document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement&&state==='playing'&&!touch)pause()});addEventListener('blur',pause);document.addEventListener('visibilitychange',()=>{if(document.hidden)pause()});
function pad(node,type,down,onMove,up){node.addEventListener('pointerdown',e=>{if(state!=='playing'||pointers[type]!==null)return;e.preventDefault();pointers[type]=e.pointerId;controls.capturePointer(node,e.pointerId);down(e)});addEventListener('pointermove',e=>{if(pointers[type]===e.pointerId)onMove(e)});for(const n of ['pointerup','pointercancel','lostpointercapture'])addEventListener(n,e=>{if(pointers[type]===e.pointerId){pointers[type]=null;up()}})}
let stickOrigin={x:0,y:0},lookOrigin={x:0,y:0};function stickMove(e){let x=e.clientX-stickOrigin.x,y=e.clientY-stickOrigin.y,d=Math.hypot(x,y),s=d>36?36/d:1;x*=s;y*=s;move.x=x/36;move.y=y/36;$('knob').style.transform=`translate(${x}px,${y}px)`}
pad($('stick'),'stick',e=>{const r=$('stick').getBoundingClientRect();stickOrigin={x:r.left+r.width/2,y:r.top+r.height/2};stickMove(e)},stickMove,()=>{move.x=move.y=0;$('knob').style.transform='translate(0,0)'});pad($('look'),'look',e=>{lookOrigin={x:e.clientX,y:e.clientY}},e=>{const s=ads?.0025:.005;yaw+=(e.clientX-lookOrigin.x)*s;pitch=Math.max(-1.25,Math.min(1.25,pitch+(e.clientY-lookOrigin.y)*s));lookOrigin={x:e.clientX,y:e.clientY}},()=>{});pad($('fire'),'fire',()=>{held=true;shoot()},()=>{},()=>{held=false});
// Multiplayer adapter: rendering and prediction only. Combat/inventory stay on the server.
const netPeers=new Map();let netMode=false,netConnected=false,netState=null,netRound=-1,netSequence=0,netSendTime=0,netTarget=null;
function netClearActors(){for(const e of enemies)disposeSoldier(e);enemies.length=0;for(const c of corpses)disposeSoldier(c.e);corpses.length=0;for(const e of netPeers.values())disposeSoldier(e);netPeers.clear();for(const e of effects)e.mesh.dispose(false,!!e.own);effects.length=0;clearGrenades();}
function netMenu(){if(!netMode){pause();return}clearInput();if(netConnected)netSend(true);if(state==='playing'){state='paused';$('screen').hidden=false;$('touch').hidden=true;$('screen-title').textContent='온라인 전투 메뉴';$('screen-desc').textContent='메뉴를 열어도 전투는 계속됩니다. 다시 돌아가 전투를 이어가세요.';start.textContent='전투로 돌아가기 →';if(document.pointerLockElement)document.exitPointerLock()}}
function netResume(){if(!netMode||netState?.phase!=='playing'||!netConnected||player.hp<=0)return;state='playing';clearInput();$('screen').hidden=true;$('hud').hidden=false;$('touch').hidden=!touch;audioStart();lock()}
function netInput(stopped=false){const moving=!stopped&&state==='playing'&&netConnected&&!controls.modalOpen&&!window.GameOnline.modalOpen;return{x:moving?((pressed('right')?1:0)-(pressed('left')?1:0)+move.x):0,z:moving?((pressed('forward')?1:0)-(pressed('back')?1:0)-move.y):0,yaw,pitch,sprint:moving&&pressed('sprint'),aim:moving&&ads,fire:false,seq:++netSequence}}
function netSend(stopped=false){window.GameOnline.input(netInput(stopped))}
function netAction(action,data){if(state==='playing'&&netConnected)window.GameOnline.action(action,data)}
function netThrow(kind){if(state!=='playing'||!netConnected||throwTimer>0)return;if(!(player[kind==='frag'?'frags':'flashes']>0)){notify(R.throwables[kind].name+'이(가) 없습니다',1.3);return}throwTimer=.5;swingHands();beep(250,.09,.05,'square');window.GameOnline.action('throw',{kind,yaw,pitch:pitch-.12})}
function netShot(){if(state!=='playing')return;const weapon=R.weapons[player.equipped],slot=player.weapons[player.equipped];if(shotTimer>0||reloading||!netConnected)return;if(!weapon){shotTimer=.5;return}if(weapon.melee){window.GameOnline.action('shoot',{yaw,pitch});shotTimer=weapon.interval;swingHands();beep(R.innate(player.equipped)?180:300,.09,.05,'square');return}if(!slot){shotTimer=.5;notify((touch?'획득 버튼':controls.keyLabel('collect'))+'으로 무기를 확보하세요',1);return}if(slot.ammo<=0){netAction('reload');shotTimer=.3;return}window.GameOnline.action('shoot',{yaw,pitch});shotTimer=weapon.interval;recoil=player.equipped==='marksman'?.075:.045;shotSound()}
function netSnapshot(s,id,events){
  netState=s;netSequence=Math.max(netSequence,s.me?.seq||0);netConnected=true;$('network-status').textContent='';const me=s.players.find(p=>p.id===id);if(!me||!s.me)return;
  if(s.round!==netRound&&s.phase!=='lobby'&&s.phase!=='countdown'){netClearActors();outro=null;$('outro').hidden=true;$('flashwash').style.opacity=0;netRound=s.round;netSequence=s.me.seq||0;camera.position.set(me.x,1.7,me.z);yaw=me.yaw;pitch=me.pitch;camera.rotation.set(pitch,yaw,0);if(lobbySoldier){lobbySoldier.root.setEnabled(false);for(const a of lobbySoldier.animationGroups)a.stop()}$('hud').hidden=false;$('killfeed').textContent='';clearInput();}
  const oldHP=player.hp,oldWeapon=player.equipped;player={...s.me,weapons:JSON.parse(JSON.stringify(s.me.weapons))};time=s.time;zone=R.zoneAt(time);reloading=s.me.reload;healing=s.me.heal;netTarget={x:me.x,z:me.z};if(oldWeapon!==player.equipped)updateGun();if(player.hp<oldHP&&s.phase==='playing')damageFade=.7;
  if(s.phase==='playing'||s.phase==='finished'){
    const present=new Set();for(const p of s.players){if(p.id===id)continue;present.add(p.id);let e=netPeers.get(p.id);if(!e){e=makeSoldier('peer-'+p.id,p.x,p.z);e.bodyHit.isPickable=e.headHit.isPickable=false;e.netPosition=new V(p.x,0,p.z);e.netYaw=p.yaw;netPeers.set(p.id,e)}e.netPosition.set(p.x,0,p.z);e.netYaw=p.yaw;e.hp=p.hp;dressSoldier(e,p);if(p.hp<=0){for(const a of e.animationGroups)a.pause();e.root.rotation.x=-Math.PI/2;e.flash.setEnabled(false)}}
    for(const[id,e]of netPeers)if(!present.has(id)){disposeSoldier(e);netPeers.delete(id)}
    const remaining=new Map(s.loot.map(l=>[l.id,l]));for(let i=loot.length-1;i>=0;i--){const l=loot[i];if(!remaining.has(l.id)){l.root.dispose();loot.splice(i,1)}else remaining.delete(l.id)}for(const l of remaining.values()){const item=lootItem(l.type,l.x,l.z,l.weapon,l.amount);item.id=l.id}
    const flying=new Set();for(const g of s.grenades||[]){flying.add(g.id);let mesh=netNades.get(g.id);if(!mesh){mesh=grenadeMesh(g.kind);netNades.set(g.id,mesh)}mesh.position.set(g.x,g.y,g.z);mesh.rotation.set(mesh.rotation.x+.22,mesh.rotation.y+.16,mesh.rotation.z+.1)}
    for(const[key,mesh]of netNades)if(!flying.has(key)){mesh.dispose();netNades.delete(key)}
    wall.scaling.set(Math.max(.001,zone.radius),1,Math.max(.001,zone.radius));zoneRing.scaling.set(zone.radius,1,zone.radius);nextRing.scaling.set(zone.target,1,zone.target);
    if(me.hp<=0&&s.phase==='playing'&&state!=='spectating'&&state!=='outro')startOutro('lose',()=>{state='spectating';clearInput();$('screen').hidden=false;$('touch').hidden=true;$('screen-title').textContent='탈락 · 경기는 계속됩니다';$('screen-desc').textContent=player.kills+'명 처치. 방 메뉴에서 다른 참가자의 결과를 확인하세요.';start.textContent='방 메뉴 열기 →'});
    if(s.phase==='finished'&&state!=='finished'&&state!=='outro'){const won=s.winner===id,winner=s.players.find(p=>p.id===s.winner);
      const reveal=()=>{state='finished';clearInput();$('touch').hidden=true;$('screen').hidden=false;$('screen-title').textContent=won?'#1 최후의 생존자':'경기 종료';$('screen-desc').textContent=(winner?winner.name+' 승리':'생존자 없음')+' · '+player.kills+'명 처치';start.textContent='방 메뉴 열기 →';if(document.pointerLockElement)document.exitPointerLock()};
      if(state==='spectating')reveal();else startOutro(won?'win':'lose',reveal)}
    searchLoot();ui();
  }
  for(const event of events){if(event.type==='shot'){if(!event.melee)trace(new V(event.from.x,event.from.y,event.from.z),new V(event.to.x,event.to.y,event.to.z),new C(1,.8,.35));const peer=netPeers.get(event.id);if(peer&&!event.melee){peer.flashTime=.1;peer.fireCount++;if(V.Distance(peer.root.position,camera.position)<35)shotSound(.045)}if(event.id===id&&event.hit){hitTimer=.15;$('hitmarker').style.color=event.head?'#ffad52':'#fff'}}if(event.type==='blast'){blastEffect({kind:event.kind,x:event.x,y:event.y,z:event.z});const near=Math.hypot(camera.position.x-event.x,camera.position.z-event.z);if(near<30)shake=Math.max(shake,.075*(1-near/30))}
  if(event.type==='death')feed(event.killerName+' → '+event.name);if(event.type==='collect'&&event.id===id){notify('보급품 획득',1.3);beep(710,.08,.06)}}
}
function netTick(dt){
  for(const e of netPeers.values()){if(e.hp<=0)continue;const old=e.root.position.clone();e.root.position=V.Lerp(e.root.position,e.netPosition,Math.min(1,dt*12));const angle=Math.atan2(Math.sin(e.netYaw-e.root.rotation.y),Math.cos(e.netYaw-e.root.rotation.y));e.root.rotation.y+=angle*Math.min(1,dt*12);e.phase+=dt*8;modelAnimation(e,V.Distance(old,e.root.position)/Math.max(dt,.001)>.15?'Run':'Idle');e.flashTime=Math.max(0,e.flashTime-dt);e.flash.setEnabled(e.flashTime>0)}
  shotTimer=Math.max(0,shotTimer-dt);punchTimer=Math.max(0,punchTimer-dt);throwTimer=Math.max(0,throwTimer-dt);if(player.blind>0)player.blind=Math.max(0,player.blind-dt);$('flashwash').style.opacity=String(Math.min(1,(player.blind||0)/1.6));recoil=Math.max(0,recoil-dt*.55);damageFade=Math.max(0,damageFade-dt*1.8);hitTimer=Math.max(0,hitTimer-dt);noticeTimer-=dt;feedTimer-=dt;if(noticeTimer<=0)$('notice').textContent='';if(feedTimer<=0)$('killfeed').textContent='';$('damage').style.opacity=damageFade;$('hitmarker').style.opacity=hitTimer>0?1:0;muzzle.setEnabled(recoil>.025);
  if(state==='playing'&&netConnected){let mx=(pressed('right')?1:0)-(pressed('left')?1:0)+move.x,mz=(pressed('forward')?1:0)-(pressed('back')?1:0)-move.y;const len=Math.hypot(mx,mz);if(len>1){mx/=len;mz/=len}netMoving=len>.1;const speed=healing?1.8:ads?2.7:pressed('sprint')?7:4.8;W.move(camera.position,(mx*Math.cos(yaw)+mz*Math.sin(yaw))*speed*dt,(-mx*Math.sin(yaw)+mz*Math.cos(yaw))*speed*dt);if(held)netShot();}
  if(netTarget&&netState?.phase==='playing'){const d=Math.hypot(camera.position.x-netTarget.x,camera.position.z-netTarget.z);const factor=d>2?1:Math.min(1,dt*5);camera.position.x+=(netTarget.x-camera.position.x)*factor;camera.position.z+=(netTarget.z-camera.position.z)*factor;}
  followSun(camera.position);
  if(netState?.phase==='playing'||netState?.phase==='finished'){camera.position.y=1.7;camera.rotation.set(pitch-recoil*.2,yaw,0);camera.fov+=((ads&&!R.melee(player.equipped)?(player.equipped==='marksman'?.45:.7):1.08)-camera.fov)*Math.min(1,dt*12);if(netMoving)step+=dt*10;viewRig.pose({dt,moving:netMoving,step,time,yaw,pitch,ads,recoil,reloading,healing});poseHands(netMoving);placeView(netMoving);$('zonewash').style.opacity=R.outsideZone(camera.position.x,camera.position.z,zone)?'.9':'0';}
  netSendTime-=dt;if(netSendTime<=0){netSendTime=.1;if(netConnected&&netState?.phase==='playing')netSend(state!=='playing')}
  stepEffects(dt);
}
window.GameOnline?.bind({ready:()=>charactersReady,menu:netMenu,resume:netResume,join(){netMode=true;netConnected=true;document.body.classList.add('online-mode');document.querySelector('.eyebrow').textContent='FRIENDS / BATTLE ROYALE';start.textContent='방 메뉴 열기 →';if(state==='ready')state='lobby'},connection(value){netConnected=value;$('network-status').textContent=value?'':'연결 복구 중 · 이동이 잠시 멈춥니다';if(!value)clearInput()},snapshot:netSnapshot,leave(){netClearActors();outro=null;$('outro').hidden=true;$('flashwash').style.opacity=0;document.body.classList.remove('online-mode');document.querySelector('.eyebrow').textContent='SOLO / BATTLE ROYALE';netMode=false;netConnected=false;netState=null;netRound=-1;netTarget=null;state='ready';dropSelfBody();scene.activeCamera=camera;time=0;player=R.newPlayer();zone=R.zoneAt(0);clearInput();populateLoot();updateGun();$('hud').hidden=true;$('touch').hidden=true;$('screen').hidden=false;$('screen-title').textContent='파밍하고. 이동하고. 살아남아라.';$('screen-desc').textContent='친구와 방을 만들거나 혼자 전투를 연습하세요.';start.textContent='혼자 플레이 →';$('damage').style.opacity=$('zonewash').style.opacity=0;$('network-status').textContent=$('network-ping').textContent='';wall.scaling.set(R.START_RADIUS,1,R.START_RADIUS);zoneRing.scaling.set(R.START_RADIUS,1,R.START_RADIUS);nextRing.scaling.set(R.stages[0].radius,1,R.stages[0].radius);camera.position.set(-1,1.6,-56);camera.rotation.set(.04,.02,0);if(lobbySoldier){lobbySoldier.root.setEnabled(true);lobbySoldier.motion=null;modelAnimation(lobbySoldier,'Idle')}}});


wall.scaling.set(R.START_RADIUS,1,R.START_RADIUS);zoneRing.scaling.set(R.START_RADIUS,1,R.START_RADIUS);nextRing.scaling.set(R.stages[0].radius,1,R.stages[0].radius);
let last=performance.now();engine.runRenderLoop(()=>{const now=performance.now(),dt=Math.min((now-last)/1000,.05);last=now;try{tick(dt);scene.render()}catch(e){console.error(e);pause();startupFailure('게임 실행 오류가 발생했습니다. 새로고침해 주세요.',e);engine.stopRenderLoop()}});let resizeTimer;addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>engine.resize(),180);clearInput()});canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();pause();engine.stopRenderLoop();startupFailure('3D 화면이 중단됐습니다. 가벼운 모드로 다시 열어 주세요.')});
controls.connect({pause,changed(){touch=controls.isTouch();clearInput();inputMode();if(state==='playing'&&!controls.editing)$('touch').hidden=!touch;document.querySelector('.desktop-help').textContent=['이동 '+['forward','left','back','right'].map(a=>controls.keyLabel(a)).join(''),'질주 '+controls.keyLabel('sprint'),'획득 '+controls.keyLabel('collect'),'재장전 '+controls.keyLabel('reload'),'구급 '+controls.keyLabel('heal'),'섬광 '+controls.keyLabel('flash'),'폭탄 '+controls.keyLabel('frag'),'시점 '+controls.keyLabel('view')].join(' · ');ui();if(state==='playing')searchLoot()}});
// Read-only game state and the same pause action as the visible button.
const context=navigator.modelContext||document.modelContext;if(context?.registerTool){for(const tool of [{name:'read_battle_status',description:'현재 생존 상태와 자기장을 확인합니다.',annotations:{readOnlyHint:true},execute:()=>({state,hp:player.hp,helmet:player.helmet,vest:player.vest,weapon:player.equipped,reserve:player.reserve,kits:player.kits,kills:player.kills,alive:netMode&&netState?netState.players.filter(p=>p.hp>0).length:enemies.length+1,online:netMode,time,zone})},{name:'pause_battle',description:'전투 메뉴를 엽니다. 혼자 플레이만 일시정지되며 온라인 전투는 계속됩니다.',annotations:{readOnlyHint:false},execute:()=>{pause();return{state}}}])try{Promise.resolve(context.registerTool({...tool,inputSchema:{type:'object',properties:{},additionalProperties:false},execute:input=>{if(input&&Object.keys(input).length)throw Error('입력 항목이 없습니다.');return tool.execute()}})).catch(()=>{})}catch{}}
})();
