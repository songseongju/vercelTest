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

const press=(t,code)=>{for(const fn of t.listeners.keydown||[])fn({code,preventDefault(){},stopImmediatePropagation(){}})};
const bind=(t,action,code)=>{t.els['bind-'+action].onclick();press(t,code)};

test('pickup sits on F and the pouch on 4/5/6 out of the box',()=>{
 const t=setup();
 assert.equal(t.controls.code('collect'),'KeyF');
 assert.equal(t.controls.code('heal'),'Digit4');
 assert.equal(t.controls.code('flash'),'Digit5');
 assert.equal(t.controls.code('frag'),'Digit6');
 assert.deepEqual(['fists','melee','gun'].map(a=>t.controls.code(a)),['Digit1','Digit2','Digit3']);
 assert.deepEqual(['forward','left','back','right','sprint'].map(a=>t.controls.code(a)),['KeyW','KeyA','KeyS','KeyD','ShiftLeft']);
 assert.equal(t.controls.keyLabel('heal'),'4');
 assert.equal(t.controls.keyLabel('sprint'),'Shift');
 assert.equal(t.controls.actionFor('KeyF'),'collect');
 assert.equal(t.controls.actionFor('Digit4'),'heal');
 assert.equal(t.controls.actionFor('KeyP'),null);
});

test('every action rebinds, movement included, and a key is never shared',()=>{
 const t=setup();t.els['open-controls'].onclick();
 bind(t,'collect','KeyG');
 assert.equal(t.controls.code('collect'),'KeyG');
 assert.equal(t.controls.actionFor('KeyG'),'collect');
 assert.equal(t.controls.actionFor('KeyF'),null,'the old key is released');
 // Movement is a binding like any other.
 bind(t,'forward','ArrowUp');
 assert.equal(t.controls.code('forward'),'ArrowUp');
 assert.equal(t.controls.keyLabel('forward'),'↑');
 // A key already in use is refused, and the action keeps what it had.
 bind(t,'reload','ArrowUp');
 assert.equal(t.controls.code('reload'),'KeyR');
 assert.match(t.els['control-feedback'].textContent,/이미/);
 // So is a key the game cannot read.
 bind(t,'reload','F5');
 assert.equal(t.controls.code('reload'),'KeyR');
 // Escape backs out without changing anything.
 t.els['bind-reload'].onclick();press(t,'Escape');
 assert.equal(t.controls.code('reload'),'KeyR');
 // Choices survive a reload of the page, and the keys-only reset puts them back.
 assert.equal(setup(t.storage).controls.code('collect'),'KeyG');
 t.els['reset-keys'].onclick();
 assert.equal(t.controls.code('collect'),'KeyF');
 assert.equal(t.controls.code('forward'),'KeyW');
});

test('a tampered or clashing saved binding falls back to the defaults',()=>{
 const clash=JSON.stringify({keys:{collect:'KeyR',reload:'KeyR'}});
 assert.equal(setup({'last-field-controls-v2':clash}).controls.code('collect'),'KeyF');
 const junk=JSON.stringify({keys:{collect:'Escape',heal:42}});
 const t=setup({'last-field-controls-v2':junk});
 assert.equal(t.controls.code('collect'),'KeyF');
 assert.equal(t.controls.code('heal'),'Digit4');
});

test('the throwable buttons join the touch layout and stay on screen',()=>{
 const t=setup();
 for(const[width,height]of [[390,844],[844,390]]){
  t.scope.innerWidth=width;t.scope.innerHeight=height;for(const fn of t.listeners.resize)fn();
  for(const id of ['flash','frag']){const n=t.els[id],r=parseFloat(n.style.width)/2,x=parseFloat(n.style.left),y=parseFloat(n.style.top);
   assert.ok(x-r>=0&&x+r<=width,id+' horizontal');assert.ok(y-r>=0&&y+r<=height,id+' vertical')}
 }
});

test('jump, crouch and prone have keyboard defaults and movable phone buttons',()=>{const t=setup();for(const [action,key]of [['jump','Space'],['crouch','KeyC'],['prone','KeyZ']]){assert.equal(t.controls.code(action),key);assert.ok(t.els[action]);assert.ok(parseFloat(t.els[action].style.width)>=44)}t.els['open-controls'].onclick();bind(t,'jump','KeyJ');assert.equal(t.controls.actionFor('KeyJ'),'jump');assert.equal(t.controls.actionFor('Space'),null);for(const[width,height]of [[390,844],[844,390]]){t.scope.innerWidth=width;t.scope.innerHeight=height;for(const fn of t.listeners.resize)fn();for(const id of ['jump','crouch','prone']){const n=t.els[id],r=parseFloat(n.style.width)/2,x=parseFloat(n.style.left),y=parseFloat(n.style.top);assert.ok(x-r>=0&&x+r<=width);assert.ok(y-r>=0&&y+r<=height)}}});

test('new posture bindings preserve previously saved custom keys',()=>{const t=setup({'last-field-controls-v2':JSON.stringify({keys:{collect:'KeyC',heal:'Space'}})});assert.equal(t.controls.code('collect'),'KeyC');assert.equal(t.controls.code('heal'),'Space');assert.notEqual(t.controls.code('crouch'),'KeyC');assert.notEqual(t.controls.code('jump'),'Space');assert.equal(new Set(Object.values(t.controls.getSettings().keys)).size,t.controls.actions.length)});
