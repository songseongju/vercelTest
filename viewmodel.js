/* Camera-space tactical equipment. All meshes and motion are visual only. */
(function(){
'use strict';
window.createFirstPersonRig=function(B,scene,camera,M,environment){
  const V=B.Vector3,C=B.Color3;
  function material(name,color,metal,rough){const m=new B.PBRMaterial(name,scene);m.albedoColor=C.FromHexString(color).toLinearSpace();m.metallic=metal;m.roughness=rough;m.environmentIntensity=.8;return m}
  const fabric=environment.surface('view woven combat sleeve','gear/kevlar',.4,'#697260',0,.93,2);
  const leather=environment.surface('view glove leather','gear/leather',.15,'#383b36',0,.86,1.7);
  const rubber=material('view matte rubber','#1d2425',0,.85),seam=material('view stitching','#737467',0,.95);
  const alloy=environment.surface('view anodized receiver','gear/plate',.4,'#343e43',.75,.48,2);
  alloy.albedoTexture=null;alloy.albedoColor=C.FromHexString('#343e43').toLinearSpace();
  const edge=material('view exposed machined edges','#7f8b90',.85,.26);
  const tan=material('view ceramic handguard','#827b61',.25,.53),black=material('view recess','#080e12',.05,.78);
  const glass=material('view coated optic lens','#267f86',.65,.12);glass.emissiveColor=new C(.008,.045,.047);
  function node(name,parent){const n=new B.TransformNode(name,scene);if(parent)n.parent=parent;return n}
  function finish(mesh,parent,m){mesh.parent=parent;mesh.material=m;mesh.renderingGroupId=1;mesh.isPickable=false;mesh.receiveShadows=false;return mesh}
  function ellipsoid(parent,name,x,y,z,w,h,d,m){const mesh=B.MeshBuilder.CreateSphere(name,{diameter:1,segments:8},scene);mesh.scaling.set(w,h,d);mesh.position.set(x,y,z);return finish(mesh,parent,m)}
  function tube(parent,name,points,r,m,cap=B.Mesh.CAP_ALL,tessellation=8){return finish(B.MeshBuilder.CreateTube(name,{path:points.map(p=>new V(...p)),radius:r,tessellation,cap},scene),parent,m)}
  // Elliptical rings give sleeves a tapered silhouette and actual fabric folds, not box corners.
  function loft(parent,name,rings,m,sides=24){
    const p=[],uv=[],idx=[],normals=[];
    rings.forEach(([z,rx,ry,cy=0,cx=0],j)=>{for(let i=0;i<=sides;i++){const a=i/sides*Math.PI*2;p.push(cx+Math.cos(a)*rx,cy+Math.sin(a)*ry,z);uv.push(i/sides,j/(rings.length-1));}});
    for(let j=0;j<rings.length-1;j++)for(let i=0;i<sides;i++){const a=j*(sides+1)+i,b=a+sides+1;idx.push(a,b,a+1,a+1,b,b+1)}
    for(const j of [0,rings.length-1]){const r=rings[j],center=p.length/3;p.push(r[4]||0,r[3]||0,r[0]);uv.push(.5,.5);for(let i=0;i<sides;i++){const a=j*(sides+1)+i;j===0?idx.push(center,a,a+1):idx.push(center,a+1,a)}}
    B.VertexData.ComputeNormals(p,idx,normals);const mesh=new B.Mesh(name,scene),data=new B.VertexData();Object.assign(data,{positions:p,indices:idx,normals,uvs:uv});data.applyToMesh(mesh);return finish(mesh,parent,m);
  }
  // Side-profile extrusion with a bevel ring: receiver, stock and magazine catch narrow edge highlights.
  function profile(parent,name,outline,width,m,bevel=.008){
    const cy=outline.reduce((a,p)=>a+p[0],0)/outline.length,cz=outline.reduce((a,p)=>a+p[1],0)/outline.length;
    const positions=[],indices=[],uvs=[],normals=[];
    const ring=(x,inset)=>outline.map(([y,z])=>[x,cy+(y-cy)*(1-inset),cz+(z-cz)*(1-inset)]);
    const rings=[ring(-width/2,.065),ring(-width/2+bevel,0),ring(width/2-bevel,0),ring(width/2,.065)];
    function face(points){const base=positions.length/3;for(const p of points){positions.push(...p);uvs.push(p[2]*4,p[1]*4)}for(let i=1;i<points.length-1;i++)indices.push(base,base+i,base+i+1)}
    face([...rings[0]].reverse());face(rings[3]);for(let r=0;r<3;r++)for(let i=0;i<outline.length;i++){const n=(i+1)%outline.length;face([rings[r][i],rings[r][n],rings[r+1][n],rings[r+1][i]])}
    const area=outline.reduce((sum,p,i)=>{const q=outline[(i+1)%outline.length];return sum+p[0]*q[1]-q[0]*p[1]},0);
    if(area>0)for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];
    B.VertexData.ComputeNormals(positions,indices,normals);const mesh=new B.Mesh(name,scene),data=new B.VertexData();Object.assign(data,{positions,indices,normals,uvs});data.applyToMesh(mesh);return finish(mesh,parent,m);
  }
  function cylinder(parent,name,x,y,z,r,length,m,axis='z'){
    const a=B.MeshBuilder.CreateCylinder(name,{diameter:r*2,height:length,tessellation:24},scene);a.position.set(x,y,z);if(axis==='z')a.rotation.x=Math.PI/2;if(axis==='x')a.rotation.z=Math.PI/2;return finish(a,parent,m);
  }
  function ring(parent,name,x,y,z,diameter,thickness,m){const a=B.MeshBuilder.CreateTorus(name,{diameter,thickness,tessellation:24},scene);a.position.set(x,y,z);a.rotation.x=Math.PI/2;return finish(a,parent,m)}
  // Batch stationary pieces by material within each moving joint. Fingers remain detailed without a draw call per knuckle.
  function batch(parent){const groups=new Map();for(const mesh of parent.getChildMeshes(true)){if(!groups.has(mesh.material))groups.set(mesh.material,[]);groups.get(mesh.material).push(mesh)}for(const[m,meshes]of groups){if(meshes.length<2)continue;const merged=B.Mesh.MergeMeshes(meshes,true,true,undefined,false,false);merged.name=parent.name+' / '+m.name;finish(merged,parent,m)}}
  function arm(parent,side,name){
    const root=node(name,parent);
    loft(root,'tailored sleeve',[[-.49,.083,.072,-.036],[-.4,.075,.069,-.026],[-.29,.067,.059,-.015],[-.23,.071,.059,-.01],[-.2,.063,.054,-.009],[-.17,.068,.057,-.005],[-.14,.058,.05],[-.115,.062,.051],[-.085,.052,.047],[-.06,.052,.044]],fabric);
    loft(root,'leather wrist cuff',[[-.095,.054,.047],[-.082,.055,.048],[-.051,.051,.043],[-.025,.045,.039]],leather);
    loft(root,'wrist strap',[[-.077,.057,.05],[-.061,.057,.05]],rubber);
    ellipsoid(root,'anatomical glove palm',0,0,.026,.11,.082,.139,leather);
    ellipsoid(root,'backhand reinforcement',0,.033,.029,.094,.028,.112,rubber);
    for(let i=0;i<4;i++){
      const x=(i-1.5)*.026,z=.09-Math.abs(i-1.3)*.004;
      ellipsoid(root,'finger first joint',x,.022,z,.026,.044,.055,leather);
      ellipsoid(root,'hard knuckle',x,.044,z-.009,.024,.019,.029,rubber);
      ellipsoid(root,'curled finger',x,-.008,z+.021,.025,.036,.039,leather);
      ellipsoid(root,'finger pad',x,-.026,z+.002,.024,.025,.04,leather);
      tube(root,'finger seam',[[x-.009,.033,z+.016],[x,.038,z+.019],[x+.009,.033,z+.016]],.0009,seam);
    }
    const thumb=ellipsoid(root,'opposed thumb',-side*.052,-.006,.046,.038,.037,.082,leather);thumb.rotation.y=-side*.55;
    const tip=ellipsoid(root,'thumb tip',-side*.03,-.027,.074,.047,.03,.035,leather);tip.rotation.y=side*.4;
    for(const s of [-1,1])tube(root,'backhand stitched seam',[[s*.034,.03,-.044],[s*.041,.041,.014],[s*.035,.045,.056]],.0011,seam);
    tube(root,'sleeve seam',[[side*.057,.025,-.4],[side*.051,.027,-.29],[side*.046,.028,-.18],[side*.04,.026,-.1]],.0013,seam);
    batch(root);return root;
  }
  const gun=node('view weapon'),hands=node('view hands');
  const rightArm=arm(hands,1,'right arm'),leftArm=arm(hands,-1,'left arm');
  const bladeView=node('view blade',rightArm);bladeView.position.set(0,.02,.06);
  const bladeSteel=profile(bladeView,'forged knife body',[[0,.08],[.025,.11],[.025,.37],[.006,.5],[-.026,.39],[-.028,.11]],.014,edge,.003);bladeSteel.rotation.z=Math.PI/2;
  const bladeEdge=profile(bladeView,'honed knife bevel',[[-.027,.11],[-.025,.39],[.006,.5],[-.016,.375],[-.018,.11]],.003,M.blade||edge,.001);bladeEdge.rotation.z=Math.PI/2;
  cylinder(bladeView,'knife handle',0,0,-.007,.025,.16,leather);ring(bladeView,'pommel',0,0,-.085,.045,.009,alloy);
  const cross=ellipsoid(bladeView,'knife guard',0,0,.069,.115,.025,.025,alloy);
  for(let i=0;i<7;i++)ring(bladeView,'handle wrap',0,0,-.065+i*.018,.048,.003,rubber);
  profile(gun,'upper receiver',[[.047,-.15],[.063,-.12],[.063,.22],[.035,.265],[-.018,.25],[-.04,-.12]],.087,alloy);
  profile(gun,'lower receiver',[[-.023,-.12],[-.027,.21],[-.075,.2],[-.099,.1],[-.078,-.06],[-.06,-.12]],.078,alloy);
  profile(gun,'angled pistol grip',[[-.057,-.063],[-.07,-.005],[-.235,-.043],[-.239,-.112],[-.208,-.12]],.065,rubber);
  cylinder(gun,'buffer tube',0,.018,-.25,.026,.28,alloy);
  profile(gun,'sculpted stock',[[.051,-.22],[.047,-.41],[.013,-.443],[-.109,-.443],[-.124,-.406],[-.048,-.25]],.076,tan);
  profile(gun,'stock inset',[[-.024,-.28],[-.018,-.397],[-.075,-.397]],.078,black,.002);
  profile(gun,'rubber butt pad',[[.016,-.443],[.02,-.457],[-.117,-.457],[-.118,-.431]],.087,rubber,.003);
  const mag=node('magazine',gun);
  profile(mag,'curved magazine',[[-.06,.071],[-.06,.17],[-.205,.183],[-.283,.225],[-.314,.143],[-.218,.092]],.064,tan);
  for(const side of [-1,1])for(let i=0;i<3;i++)tube(mag,'pressed magazine rib',[[side*.033,-.103,.09+i*.028],[side*.033,-.21,.112+i*.026],[side*.033,-.278,.16+i*.024]],.003,alloy);
  batch(mag);
  loft(gun,'octagonal handguard',[[.24,.053,.056,.008],[.255,.057,.059,.008],[.49,.05,.052,.008],[.505,.046,.047,.008]],tan,8);
  for(const side of [-1,1])for(let i=0;i<5;i++){
    const slot=profile(gun,'recessed M-LOK slot',[[.026,.279+i*.04],[.03,.286+i*.04],[.03,.309+i*.04],[.023,.315+i*.04],[.006,.31+i*.04],[.006,.284+i*.04]],.002,black,.0003);slot.position.x=side*.053;
  }
  for(let i=0;i<18;i++)profile(gun,'picatinny rail',[[.064,-.124+i*.035],[.077,-.124+i*.035],[.077,-.108+i*.035],[.064,-.108+i*.035]],.064,alloy,.004);
  for(const s of [-1,1])for(const z of [-.09,.07,.21])cylinder(gun,'flush receiver pin',s*.045,.002,z,.005,.003,edge,'x');
  const port=profile(gun,'ejection port',[[.014,-.04],[.043,-.04],[.043,.105],[.014,.105]],.003,black,.0005);port.position.x=.045;
  cylinder(gun,'charging handle',.063,.038,-.123,.008,.052,alloy,'x');
  tube(gun,'trigger guard',[[0,-.072,-.05],[0,-.12,-.042],[0,-.122,.032],[0,-.076,.057]],.007,alloy);
  tube(gun,'curved trigger',[[0,-.064,.004],[0,-.088,.001],[0,-.1,-.012]],.004,edge);
  const barrel=node('barrel',gun);
  cylinder(barrel,'turned barrel',0,.008,.117,.016,.25,alloy);
  for(const z of [.022,.185,.24])ring(barrel,'barrel collar',0,.008,z,.037,.007,edge);
  cylinder(barrel,'ported compensator',0,.008,.272,.024,.073,alloy);
  cylinder(barrel,'dark muzzle bore',0,.008,.309,.015,.001,black);
  ring(barrel,'muzzle crown',0,.008,.31,.042,.005,edge);
  for(const s of [-1,1])for(let i=0;i<3;i++)ellipsoid(barrel,'compensator port',s*.023,.008,.251+i*.017,.004,.015,.008,black);
  batch(barrel);barrel.position.z=.48;
  const scope=node('magnified optic',gun);
  tube(scope,'scope tube',[[0,.122,-.081],[0,.122,.149]],.029,alloy,B.Mesh.NO_CAP,24);tube(scope,'ocular housing',[[0,.122,-.128],[0,.122,-.06]],.038,alloy,B.Mesh.NO_CAP,24);
  tube(scope,'objective housing',[[0,.122,.1375],[0,.122,.2025]],.044,alloy,B.Mesh.NO_CAP,24);const lens=cylinder(scope,'ocular lens',0,.122,-.129,.031,.001,glass);
  ring(scope,'ocular ring',0,.122,-.13,.071,.006,edge);
  cylinder(scope,'elevation turret',0,.162,.04,.021,.025,rubber,'y');cylinder(scope,'windage turret',.037,.122,.04,.018,.026,rubber,'x');
  for(const z of [-.038,.095]){ring(scope,'optic clamp',0,.122,z,.063,.008,tan);profile(scope,'optic mount',[[.07,z-.013],[.099,z-.013],[.099,z+.013],[.07,z+.013]],.067,alloy,.003)}
  const rear=node('rear iron sight',gun);
  tube(rear,'rear aperture frame',[[-.029,.076,-.102],[-.029,.103,-.102],[0,.112,-.102],[.029,.103,-.102],[.029,.076,-.102]],.004,alloy);
  ring(rear,'rear aperture',0,.106,-.102,.018,.004,alloy);batch(rear);
  tube(gun,'front sight wings',[[-.022,.066,.466],[-.019,.113,.466]],.004,alloy);tube(gun,'front sight wings',[[.022,.066,.466],[.019,.113,.466]],.004,alloy);
  cylinder(gun,'front sight post',0,.091,.466,.003,.03,edge,'y');
  batch(gun);
  const gunRight=arm(null,1,'trigger hand');gunRight.parent=gun;gunRight.position.set(.012,-.138,-.056);gunRight.rotation.set(-.8,.1,-.17);
  const gunLeft=arm(null,-1,'support hand');gunLeft.parent=gun;gunLeft.position.set(-.045,-.082,.345);gunLeft.rotation.set(-.28,-.65,.85);
  const muzzle=ellipsoid(gun,'flash',0,.008,.81,.1,.09,.24,M.flash);muzzle.setEnabled(false);
  gun.parent=hands.parent=camera;gun.position.set(.23,-.23,.48);hands.position.set(0,-.27,.58);gun.setEnabled(false);hands.setEnabled(false);bladeView.setEnabled(false);scope.setEnabled(false);
  let previousYaw=null,previousPitch=0,swayX=0,swayY=0,reloadBlend=0;
  function equip(kind){const marksman=kind==='marksman';scope.setEnabled(marksman);rear.setEnabled(!marksman);barrel.scaling.z=marksman?1.5:kind==='smg'?.66:1;mag.scaling.y=marksman?.8:1;muzzle.position.z=.48+.32*barrel.scaling.z;}
  function pose({dt,moving,step,time,yaw,pitch,ads,recoil,reloading,healing}){
    const blend=1-Math.exp(-dt*12);
    if(previousYaw===null){previousYaw=yaw;previousPitch=pitch}
    const delta=Math.atan2(Math.sin(yaw-previousYaw),Math.cos(yaw-previousYaw));
    swayX+=(Math.max(-.035,Math.min(.035,-delta*.35))-swayX)*blend;swayY+=(Math.max(-.025,Math.min(.025,(pitch-previousPitch)*.3))-swayY)*blend;
    previousYaw=yaw;previousPitch=pitch;reloadBlend+=((reloading||healing?1:0)-reloadBlend)*blend;
    lens.setEnabled(!ads);
    const bob=moving?Math.sin(step):0,breathe=Math.sin(time*1.8)*.0015,aim=ads?.16:1;
    // Sight line reaches the centre of the screen; the gameplay camera/shot ray is untouched.
    gun.position.x+=((ads?0:.23)+swayX*aim-gun.position.x)*blend;
    gun.position.y+=((ads?-(scope.isEnabled()?.122:.106):-.23)+bob*.006*aim+breathe+swayY-reloadBlend*.14-gun.position.y)*blend;
    gun.position.z=.48-recoil*.65;gun.rotation.set(-recoil*.45-reloadBlend*.28,swayX*.8,-bob*.008*aim+reloadBlend*.32);
    gunLeft.position.y=-.082-reloadBlend*.14;gunLeft.position.z=.345-reloadBlend*.12;
    mag.position.y=-reloadBlend*.13;
  }
  return{gun,hands,rightArm,leftArm,bladeView,bladeSteel,bladeEdge,barrel,mag,scope,muzzle,equip,pose};
};
})();
