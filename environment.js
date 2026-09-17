/* CC0 scanned surfaces, daylight and reusable foliage for the shared arena. */
(function () {
  'use strict';
  window.createFieldEnvironment = function (B, scene, shadow, lightweight) {
    const V=B.Vector3, C=B.Color3, surfaces=[], normalMaps=new Map();
    const root='assets/environment/';
    function texture(file, color=false) {
      const t=new B.Texture(root+file,scene,false,false);
      t.gammaSpace=color;t.anisotropicFilteringLevel=lightweight?2:8;
      return t;
    }
    function surface(name,asset,meters,tint='#ffffff',metallic=0) {
      const m=new B.PBRMaterial(name,scene);
      m.albedoColor=C.FromHexString(tint);m.metallic=metallic;m.roughness=1;
      m.albedoTexture=texture(asset+'-color.jpg',true);
      m.metallicTexture=texture(asset+'-arm.jpg');
      m.useRoughnessFromMetallicTextureAlpha=false;
      m.useRoughnessFromMetallicTextureGreen=true;
      m.useMetallnessFromMetallicTextureBlue=true;
      m.useAmbientOcclusionFromMetallicTextureRed=true;
      m.environmentIntensity=.65;m.metadata={meters,asset};
      surfaces.push(m);return m;
    }
    // UVs are measured in metres on each face, avoiding stretched wall/floor photos.
    function mapBox(mesh) {
      const scale=mesh.material?.metadata?.meters;if(!scale)return;
      const p=mesh.getVerticesData(B.VertexBuffer.PositionKind);
      const n=mesh.getVerticesData(B.VertexBuffer.NormalKind),uv=[];
      for(let i=0;i<p.length;i+=3){const x=p[i]+mesh.position.x,y=p[i+1]+mesh.position.y,z=p[i+2]+mesh.position.z;
        if(Math.abs(n[i+1])>.5)uv.push(x/scale,z/scale);
        else if(Math.abs(n[i])>.5)uv.push(z/scale,y/scale);
        else uv.push(x/scale,y/scale);
      }
      mesh.setVerticesData(B.VertexBuffer.UVKind,uv);
    }
    const materials={
      grass:surface('dry grass and soil','ground',4,'#a3ac92'),
      road:surface('weathered asphalt','asphalt',4,'#92999d'),
      concrete:surface('cast concrete','concrete',3,'#aaa99f'),
      cream:surface('weathered concrete walls','concrete',3,'#d0cbc0'),
      roof:surface('oxidized corrugated steel','metal',3,'#9da8aa',.55),
      bark:surface('tree bark','bark',2,'#ada292')
    };
    const env=new B.HDRCubeTexture(root+'daylight.hdr',scene,lightweight?32:128,false,true,false,true);
    scene.environmentTexture=env;scene.environmentIntensity=.7;
    const skybox=scene.createDefaultSkybox(env,true,300,.08);
    if(skybox){skybox.isPickable=false;skybox.infiniteDistance=true;}

    // Alpha-cut branch cards give trees fine silhouettes without individual leaf meshes.
    const foliageTexture=new B.DynamicTexture('branch silhouettes',{width:512,height:512},scene,true);
    foliageTexture.hasAlpha=true;const ctx=foliageTexture.getContext();ctx.clearRect(0,0,512,512);
    let seed=98765;function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
    ctx.lineCap='round';
    for(let i=0;i<14;i++){
      const y=440-i*27,w=185*(1-i/17);
      for(const side of [-1,1]){
        const tipX=256+side*w,tipY=y-32;
        ctx.strokeStyle='#605a43';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(256,y+20);ctx.lineTo(tipX,tipY);ctx.stroke();
        for(let j=0;j<38;j++){
          const f=j/38,x=256+(tipX-256)*f,yy=y+20+(tipY-y-20)*f;
          const shade=Math.floor(65+random()*52);
          ctx.strokeStyle='rgb('+Math.floor(shade*.7)+','+shade+','+Math.floor(shade*.55)+')';ctx.lineWidth=2+random()*2;
          for(const direction of [-1,1]){ctx.beginPath();ctx.moveTo(x,yy);ctx.lineTo(x+side*(6+random()*17),yy+direction*(8+random()*21));ctx.stroke();}
        }
      }
    }
    foliageTexture.update();
    const foliage=new B.StandardMaterial('pine foliage',scene);
    foliage.diffuseTexture=foliageTexture;foliage.useAlphaFromDiffuseTexture=true;
    foliage.transparencyMode=B.Material.MATERIAL_ALPHATEST;foliage.alphaCutOff=.38;
    foliage.backFaceCulling=false;foliage.twoSidedLighting=true;
    foliage.specularColor=C.Black();foliage.diffuseColor=new C(.82,.88,.74);
    function tree(x,z,scale){
      const cards=[];
      for(let tier=0;tier<7;tier++)for(let side=0;side<3;side++){
        const card=B.MeshBuilder.CreatePlane('pine branch',{width:(4.8-tier*.48)*scale,height:2.7*scale},scene);
        card.position.set(x,(2.8+tier*.6)*scale,z);card.rotation.y=side*Math.PI/3+tier*.83;
        cards.push(card);
      }
      const crown=B.Mesh.MergeMeshes(cards,true,true);crown.name='pine crown';crown.material=foliage;
      crown.isPickable=false;crown.receiveShadows=true;shadow.addShadowCaster(crown);return crown;
    }
    function quality(high){
      for(const m of surfaces){
        if(high&&!normalMaps.has(m.metadata.asset))normalMaps.set(m.metadata.asset,texture(m.metadata.asset+'-normal.jpg'));
        m.bumpTexture=high?normalMaps.get(m.metadata.asset):null;
        if(m.bumpTexture)m.bumpTexture.level=.65;
      }
    }
    return{materials,surface,mapBox,tree,quality};
  };
})();
