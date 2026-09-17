const test=require('node:test');const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../controls.js'),'utf8');
function setup(storage={},blocked=false){const els={},listeners={};const element=id=>els[id]??={style:{setProperty(){}},textContent:'',hidden:id==='hud'||id==='touch',open:false,dataset:{},classList:{add(){},remove(){}},setAttribute(){},focus(){},setPointerCapture(){},showModal(){this.open=true},close(){this.open=false},getBoundingClientRect(){return{left:parseFloat(this.style.left)-30,top:parseFloat(this.style.top)-30,width:60,height:60,bottom:90}},addEventListener(type,fn){(this.events??={})[type]=fn}};const scope={window:{},document:{getElementById:element,documentElement:element('html'),body:element('body'),querySelectorAll:()=>[]},localStorage:{getItem:k=>{if(blocked)throw Error('blocked');return storage[k]??null},setItem:(k,v)=>{if(blocked)throw Error('blocked');storage[k]=v}},innerWidth:844,innerHeight:390,navigator:{maxTouchPoints:5},matchMedia:()=>({matches:false}),addEventListener:(type,fn)=>(listeners[type]??=[]).push(fn)};vm.createContext(scope);vm.runInContext(source,scope);let paused=0;scope.window.GameControls.connect({pause(){paused++},changed(){}});return{scope,els,element,controls:scope.window.GameControls,listeners,paused:()=>paused,storage}}

test('pointer capture tolerates pointer lock, released fingers and removed controls',()=>{
 const t=setup();let count=0;const node={isConnected:true,setPointerCapture(){count++}};
 t.scope.document.pointerLockElement={};assert.equal(t.controls.capturePointer(node,1),false);assert.equal(count,0);
 t.scope.document.pointerLockElement=null;assert.equal(t.controls.capturePointer(node,1),true);assert.equal(count,1);
 for(const name of ['InvalidStateError','NotFoundError']){node.setPointerCapture=()=>{throw Object.assign(Error(name),{name})};assert.equal(t.controls.capturePointer(node,1),false)}
 node.isConnected=false;assert.equal(t.controls.capturePointer(node,1),false);
});
test('touch layout stays on screen at phone sizes and restores saved orientation',()=>{
 const t=setup();for(const[width,height]of [[390,844],[844,390]]){t.scope.innerWidth=width;t.scope.innerHeight=height;for(const fn of t.listeners.resize)fn();
 for(const id of ['stick','fire','reload','heal','loot','aim','swap']){const n=t.els[id],r=parseFloat(n.style.width)/2,x=parseFloat(n.style.left),y=parseFloat(n.style.top);assert.ok(x-r>=0&&x+r<=width,id+' horizontal');assert.ok(y-r>=0&&y+r<=height,id+' vertical')}}
 t.els['edit-layout'].onclick();const original=t.els.loot.style.left;t.els['mirror-layout'].onclick();assert.notEqual(t.els.loot.style.left,original);t.els['cancel-layout'].onclick();assert.equal(t.els.loot.style.left,original);
});
test('layout drag can finish outside the control when capture is unavailable',()=>{
 const t=setup();t.els['edit-layout'].onclick();const node=t.els.loot;node.isConnected=true;node.setPointerCapture=()=>{throw Object.assign(Error('released'),{name:'NotFoundError'})};
 const event={pointerId:4,clientX:400,clientY:240,preventDefault(){},stopImmediatePropagation(){}};
 assert.doesNotThrow(()=>node.events.pointerdown(event));for(const fn of t.listeners.pointermove)fn({...event,clientX:430});for(const fn of t.listeners.pointerup)fn(event);
 const at=node.style.left;for(const fn of t.listeners.pointermove)fn({...event,clientX:500});assert.equal(node.style.left,at);
});
