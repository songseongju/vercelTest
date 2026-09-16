# Character asset attribution

## Soldier / Vanguard

- Asset: `soldier.glb` (approximately 2.1 MB; textured skinned humanoid with Idle, Walk, Run and TPose clips)
- Creator/source: Mixamo (Adobe), distributed in the official three.js examples.
- Pinned upstream file: https://github.com/mrdoob/three.js/blob/r180/examples/models/gltf/Soldier.glb
- Official example credits: https://threejs.org/examples/webgl_animation_multiple.html
- Mixamo usage FAQ: https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html

Adobe's FAQ permits characters and animations to be used royalty-free in personal, commercial and non-profit projects, including video games. The model is bundled as an asset of this playable game. It is not offered as a standalone model/animation asset pack for resale or redistribution.

In-game integration: shared meshes/materials, separately cloned skeletons and animation groups, normalized 1.82 m height, procedural two-handed rifle pose, separate body/head hit volumes. The material appearance is adjusted at runtime; the upstream GLB is unmodified.

## Runtime

`vendor/babylonjs.loaders.min.js` is Babylon.js Loaders 9.26.1 (Apache-2.0), paired with the existing Babylon.js 9.26.1 engine. See `vendor/LICENSE-babylon.txt`.
