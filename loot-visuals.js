/* Textured loot meshes share one atlas, materials and reusable geometry. */
(function(){'use strict';
window.createLootVisuals=function(B,scene,gear={}){
const V=B.Vector3,C=B.Color3,atlas=new B.Texture('assets/loot-atlas.png',scene,false,true,B.Texture.TRILINEAR_SAMPLINGMODE);atlas.anisotropicFilteringLevel=4;
function material(name,x,y){const m=new B.StandardMaterial(name,scene),t=atlas.clone();t.uScale=t.vScale=.49;t.uOffset=x*.5+.005;t.vOffset=y*.5+.005;m.diffuseTexture=t;m.diffuseColor=new C(1.12,1.12,1.12);m.specularColor=new C(.08,.08,.08);m.backFaceCulling=false;return m}
const med=material('medical fabric',0,1),armor=material('plate carrier fabric',1,1),ammo=material('ammo case paint',0,0),cloth=material('tactical canvas',1,0);
function solid(name,color){const m=new B.StandardMaterial(name,scene);m.diffuseColor=C.FromHexString(color);m.specularColor=new C(.18,.18,.18);return m}
const metal=solid('buckles','#84908c'),dark=solid('rubber','#202a2c'),brass=solid('cartridges','#c6a35c'),red=solid('medical pull tab','#b64932');
function part(root,name,x,y,z,w,h,d,mat){const m=B.MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene);m.position.set(x,y,z);m.material=mat;m.parent=root;m.isPickable=false;m.receiveShadows=true;return m}
function tube(root,name,points,r,mat){const m=B.MeshBuilder.CreateTube(name,{path:points.map(p=>new V(...p)),radius:r,tessellation:8,cap:B.Mesh.CAP_ALL},scene);m.parent=root;m.material=mat;m.isPickable=false;return m}
function panel(root,name,outline,depth,frontMat,sideMat,x=0,y=0,z=0){const holder=new B.TransformNode(name,scene);holder.parent=root;holder.position.set(x,y,z);const xs=outline.map(p=>p[0]),ys=outline.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
for(const sign of [-1,1]){const pos=[],uv=[],normal=[],indices=[];for(const [px,py]of outline){pos.push(px,py,sign*depth/2);uv.push((px-minX)/(maxX-minX),(py-minY)/(maxY-minY));normal.push(0,0,sign)}for(let i=1;i<outline.length-1;i++)indices.push(0,sign<0?i+1:i,sign<0?i:i+1);const mesh=new B.Mesh(name+' face',scene),v=new B.VertexData();v.positions=pos;v.indices=indices;v.normals=normal;v.uvs=uv;v.applyToMesh(mesh);mesh.material=sign<0?frontMat:sideMat;mesh.parent=holder;mesh.isPickable=false;mesh.receiveShadows=true}
for(let i=0;i<outline.length;i++){const a=outline[i],b=outline[(i+1)%outline.length],length=Math.hypot(b[0]-a[0],b[1]-a[1]);const edge=part(holder,'bound seam',(a[0]+b[0])/2,(a[1]+b[1])/2,0,length,.018,depth,sideMat);edge.rotation.z=Math.atan2(b[1]-a[1],b[0]-a[0])}return holder}
const round=[[-.28,-.21],[.28,-.21],[.34,-.15],[.34,.15],[.28,.21],[-.28,.21],[-.34,.15],[-.34,-.15]];
function create(type,weapon){const root=new B.TransformNode('detailed '+type,scene);
if(type==='med'){panel(root,'soft medical bag',round,.3,med,cloth,0,.25,0);tube(root,'carry handle',[[-.14,.46,0],[-.14,.57,0],[.14,.57,0],[.14,.46,0]],.024,dark);for(const side of [-1,1]){part(root,'bag side pocket',side*.35,.23,.01,.1,.25,.24,cloth);part(root,'side buckle',side*.35,.33,-.12,.055,.055,.025,metal)}tube(root,'zipper seam',[[-.29,.43,-.153],[.29,.43,-.153]],.008,metal);part(root,'zip pull',.26,.4,-.18,.028,.085,.015,red);
}else if(type==='helmet'){
  const shell=B.MeshBuilder.CreateSphere('helmet shell',{diameter:.62,segments:14,slice:.58},scene);
  shell.parent=root;shell.position.y=.3;shell.scaling.set(1,.92,1.12);shell.material=gear.helmetShell||armor;shell.isPickable=false;shell.receiveShadows=true;
  const brim=B.MeshBuilder.CreateTorus('helmet rim',{diameter:.61,thickness:.045,tessellation:18},scene);
  brim.parent=root;brim.position.y=.135;brim.scaling.z=1.12;brim.material=gear.helmetShell||armor;brim.isPickable=false;
  part(root,'nape guard',0,.18,.22,.4,.16,.07,gear.helmetShell||armor);
  for(const side of [-1,1]){part(root,'rail mount',side*.3,.26,0,.035,.12,.26,dark);part(root,'chin strap anchor',side*.2,.13,-.13,.05,.06,.05,metal)}
  tube(root,'chin strap',[[-.2,.13,-.1],[-.16,.02,-.05],[.16,.02,-.05],[.2,.13,-.1]],.022,cloth);
  part(root,'front pad',0,.2,-.3,.22,.1,.05,cloth);
}else if(type==='vest'){panel(root,'armor vest',[[-.29,-.3],[.29,-.3],[.33,.08],[.2,.28],[-.2,.28],[-.33,.08]],.18,armor,cloth,0,.38,0);for(const side of [-1,1]){tube(root,'shoulder strap',[[side*.2,.61,-.07],[side*.2,.83,-.02],[side*.2,.83,.14],[side*.2,.61,.17]],.055,cloth);part(root,'side fastener',side*.33,.37,.02,.1,.16,.14,dark);part(root,'buckle',side*.205,.59,-.106,.08,.045,.025,metal)}for(const x of [-.19,0,.19]){panel(root,'mag pouch',[[-.07,-.11],[.07,-.11],[.075,.09],[.05,.12],[-.05,.12],[-.075,.09]],.055,cloth,cloth,x,.25,-.135);part(root,'pouch flap',x,.33,-.173,.14,.035,.018,armor)}
}else if(type==='ammo'){panel(root,'ammo tin',[[-.27,-.17],[.27,-.17],[.3,-.14],[.3,.14],[.27,.17],[-.27,.17],[-.3,.14],[-.3,-.14]],.27,ammo,cloth,0,.22,0);part(root,'case lid',0,.405,0,.64,.045,.31,dark);tube(root,'case handle',[[-.11,.43,0],[-.11,.51,0],[.11,.51,0],[.11,.43,0]],.017,metal);for(const x of [-.23,.23])part(root,'case latch',x,.35,-.15,.055,.09,.025,metal);for(let i=0;i<3;i++){const cartridge=B.MeshBuilder.CreateCylinder('brass round',{height:.18,diameter:.028,tessellation:8},scene);cartridge.parent=root;cartridge.material=brass;cartridge.position.set(.37+i*.04,.095,-.06);cartridge.isPickable=false}
}else if(type==='frag'||type==='flash'){
  const flash=type==='flash',shell=solid(flash?'flash body':'frag body',flash?'#9aa1a8':'#4f5a3d');
  const body=flash
    ?B.MeshBuilder.CreateCylinder('stun canister',{height:.3,diameter:.17,tessellation:14},scene)
    :B.MeshBuilder.CreateSphere('frag body',{diameter:.22,segments:12},scene);
  body.parent=root;body.position.y=flash?.17:.14;if(!flash)body.scaling.y=1.22;
  body.material=shell;body.isPickable=false;body.receiveShadows=true;
  if(flash){for(let i=0;i<3;i++){const vent=B.MeshBuilder.CreateTorus('vent band',{diameter:.175,thickness:.016,tessellation:14},scene);vent.parent=root;vent.position.y=.09+i*.08;vent.material=dark;vent.isPickable=false}}
  else{for(const axis of [0,1])for(let i=-1;i<2;i++){const groove=part(root,'frag groove',0,.14+i*.07,0,axis?.235:.02,.018,axis?.02:.235,dark);groove.scaling.set(1,1,1)}
    for(let i=0;i<4;i++){const band=B.MeshBuilder.CreateTorus('frag band',{diameter:.225,thickness:.012,tessellation:14},scene);band.parent=root;band.position.y=.07+i*.05;band.material=dark;band.isPickable=false}}
  part(root,'fuse cap',0,flash?.335:.28,0,.07,.045,.07,metal);
  part(root,'safety spoon',.052,flash?.3:.245,0,.018,.13,.05,metal);
  const ring=B.MeshBuilder.CreateTorus('pull ring',{diameter:.075,thickness:.011,tessellation:12},scene);
  ring.parent=root;ring.position.set(-.062,flash?.325:.27,0);ring.rotation.x=Math.PI/2;ring.material=metal;ring.isPickable=false;
  part(root,'marking band',0,flash?.25:.19,0,flash?.18:.235,.022,flash?.18:.235,flash?red:brass);
}else if(weapon==='knife'||weapon==='machete'){
  const held=new B.TransformNode('field blade',scene);held.parent=root;held.position.set(0,.13,0);held.rotation.set(0,.5,Math.PI/2.3);
  const long=weapon==='machete',blade=B.MeshBuilder.CreateBox('blade',{width:long?.105:.052,height:.012,depth:long?.62:.32},scene);
  blade.parent=held;blade.position.z=long?.34:.2;blade.material=gear.blade||metal;blade.isPickable=false;blade.receiveShadows=true;
  const edge=B.MeshBuilder.CreateBox('cutting edge',{width:long?.03:.018,height:.02,depth:long?.6:.3},scene);
  edge.parent=held;edge.position.set(long?.05:.026,0,long?.34:.2);edge.rotation.z=.5;edge.material=gear.blade||metal;edge.isPickable=false;
  part(held,'cross guard',0,0,.03,long?.13:.1,.03,.035,dark);
  const grip=B.MeshBuilder.CreateCylinder('wrapped grip',{height:.2,diameter:.055,tessellation:10},scene);
  grip.parent=held;grip.rotation.x=Math.PI/2;grip.position.z=-.09;grip.material=gear.grip||dark;grip.isPickable=false;
  part(held,'pommel',0,0,-.2,.05,.05,.035,metal);
}else{const rifle=new B.TransformNode('field rifle',scene);rifle.parent=root;rifle.position.set(0,.1,0);rifle.rotation.set(0,.4,Math.PI/2);const length=weapon==='marksman'?.7:weapon==='smg'?.32:.5;part(rifle,'receiver',0,0,0,.12,.13,.35,dark);part(rifle,'barrel',0,.01,.26+length/2,.034,.034,length,metal);part(rifle,'guard',0,0,.28,.1,.11,.28,cloth);part(rifle,'stock',0,-.015,-.32,.1,.16,.3,cloth);part(rifle,'magazine',0,-.14,.02,.075,.22,.105,dark);part(rifle,'pistol grip',0,-.11,-.12,.075,.18,.075,dark);for(let i=0;i<4;i++)part(rifle,'rail',0,.077,.1+i*.065,.11,.018,.025,metal);if(weapon==='marksman'){const scope=B.MeshBuilder.CreateCylinder('optic',{height:.28,diameter:.085,tessellation:12},scene);scope.parent=rifle;scope.rotation.x=Math.PI/2;scope.position.set(0,.15,.02);scope.material=dark;scope.isPickable=false}}
return root}
return{create,atlas};
};
})();
