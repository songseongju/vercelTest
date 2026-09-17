const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const B=require('../vendor/babylon.js');
function fixture(t){const engine=new B.NullEngine(),scene=new B.Scene(engine),camera=new B.FreeCamera('eye',new B.Vector3(2,1.7,4),scene);scene.activeCamera=camera;const host={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../viewmodel.js'),'utf8'),{window:host});const surface=name=>new B.PBRMaterial(name,scene);const rig=host.createFirstPersonRig(B,scene,camera,{flash:surface('flash'),blade:surface('blade')},{surface});t.after(()=>{scene.dispose();engine.dispose()});return{scene,camera,rig}}
function localBounds(root,meshes){root.computeWorldMatrix(true);const inverse=root.getWorldMatrix().clone().invert(),points=[];for(const mesh of meshes){mesh.computeWorldMatrix(true);for(const v of mesh.getBoundingInfo().boundingBox.vectorsWorld)points.push(B.Vector3.TransformCoordinates(v,inverse))}return{zmin:Math.min(...points.map(v=>v.z)),zmax:Math.max(...points.map(v=>v.z))}}
test('viewmodel geometry stays attached, finite and outside gameplay ray picking',t=>{
 const{scene,camera,rig}=fixture(t);rig.gun.setEnabled(true);rig.hands.setEnabled(true);
 for(const mesh of scene.meshes){assert.equal(mesh.isPickable,false);assert.equal(mesh.renderingGroupId,1);for(const kind of [B.VertexBuffer.PositionKind,B.VertexBuffer.NormalKind,B.VertexBuffer.UVKind])assert.ok(mesh.getVerticesData(kind).every(Number.isFinite),mesh.name+' has finite vertices');}
 const meshes=rig.barrel.getChildMeshes();rig.equip('carbine');let b=localBounds(rig.gun,meshes);assert.ok(b.zmin>.47&&b.zmin<.52,'barrel begins at the handguard, without doubled parent translation');assert.ok(b.zmax>.78&&b.zmax<.81);
 rig.equip('marksman');b=localBounds(rig.gun,meshes);assert.ok(b.zmax>.92&&b.zmax<.97);assert.ok(Math.abs(rig.muzzle.position.z-b.zmax)<.02,'flash follows the longer barrel');
 rig.equip('smg');b=localBounds(rig.gun,meshes);assert.ok(b.zmax>.68&&b.zmax<.7);
 assert.deepEqual(camera.position.asArray(),[2,1.7,4]);
 assert.ok(scene.meshes.reduce((n,m)=>n+m.getTotalIndices()/3,0)<70000,'all view variants fit within the geometry budget');
});
test('bevelled receiver faces have outward-facing normals',t=>{
 const{scene}=fixture(t),mesh=scene.getMeshByName('view weapon / view anodized receiver'),p=mesh.getVerticesData('position'),n=mesh.getVerticesData('normal');let checked=0;
 for(let i=0;i<p.length;i+=3){if(Math.abs(p[i])>.04&&Math.abs(n[i])>.999&&p[i+2]>-.12&&p[i+2]<.21){assert.ok(p[i]*n[i]>0,'side faces must not be inside out');checked++;}}
 assert.ok(checked>10);
});
test('ADS and reload animate equipment without changing the eye or shot origin',t=>{
 const{camera,rig,scene}=fixture(t);rig.equip('marksman');rig.gun.setEnabled(true);
 const p={dt:1/60,moving:false,step:0,time:0,yaw:0,pitch:0,ads:true,recoil:0,reloading:0,healing:0};
 for(let i=0;i<90;i++)rig.pose(p);
 assert.ok(Math.abs(rig.gun.position.x)<.001);assert.ok(Math.abs(rig.gun.position.y+.122)<.001);assert.equal(scene.getMeshByName('ocular lens').isEnabled(),false,'opaque lens disappears to leave an open sight line');
 const rest=rig.gun.position.clone();for(let i=0;i<30;i++)rig.pose({...p,reloading:1});assert.ok(rig.gun.position.y<rest.y-.1);assert.ok(rig.mag.position.y<-.1);
 for(let i=0;i<90;i++)rig.pose({...p,ads:false});assert.equal(scene.getMeshByName('ocular lens').isEnabled(),true);assert.ok(Math.abs(rig.mag.position.y)<.001);assert.deepEqual(camera.position.asArray(),[2,1.7,4]);
});
