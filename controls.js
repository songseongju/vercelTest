(function(){'use strict';
const $=id=>document.getElementById(id),storageKey='last-field-controls-v2';
// Every action is rebindable, movement included. Quick slots double as the item bar: 4/5/6 are consumables.
const defaults={mode:'auto',scale:1,opacity:.85,layouts:{},keys:{
  collect:'KeyF',reload:'KeyR',heal:'Digit4',flash:'Digit5',frag:'Digit6',swap:'KeyQ',view:'KeyV',
  fists:'Digit1',melee:'Digit2',gun:'Digit3',
  forward:'KeyW',back:'KeyS',left:'KeyA',right:'KeyD',sprint:'ShiftLeft',jump:'Space',crouch:'KeyC',prone:'KeyZ'}};
const names={collect:'획득',reload:'재장전',heal:'구급팩 사용',flash:'섬광탄 투척',frag:'폭탄 투척',swap:'무기 교체',view:'시점 전환',fists:'맨손',melee:'근접 무기',gun:'총기',forward:'전진',back:'후진',left:'왼쪽',right:'오른쪽',sprint:'질주',jump:'점프',crouch:'앉기 / 서기',prone:'엎드리기 / 서기'};
const actions=Object.keys(defaults.keys);
const ids=['stick','fire','reload','heal','loot','aim','swap','view','flash','frag','jump','crouch','prone'];
const dimensions={stick:108,fire:78,reload:52,heal:52,loot:66,aim:52,swap:52,view:52,flash:50,frag:50,jump:52,crouch:48,prone:48};
const layouts={
  landscape:{stick:[.12,.68],fire:[.91,.69],reload:[.81,.8],heal:[.93,.52],loot:[.7,.71],aim:[.82,.54],swap:[.7,.52],view:[.82,.37],flash:[.93,.37],frag:[.93,.22],jump:[.6,.73],crouch:[.48,.78],prone:[.37,.78]},
  portrait:{stick:[.2,.75],fire:[.85,.74],reload:[.69,.84],heal:[.86,.61],loot:[.5,.73],aim:[.66,.62],swap:[.5,.84],view:[.66,.5],flash:[.86,.49],frag:[.86,.37],jump:[.36,.59],crouch:[.18,.5],prone:[.18,.4]}};
// Anything a browser reports as a physical key, minus the ones that would trap the player.
const allowed=/^(Key[A-Z]|Digit[0-9]|Numpad[0-9]|Shift(Left|Right)|Control(Left|Right)|Alt(Left|Right)|Space|Arrow(Up|Down|Left|Right))$/;
const clone=x=>JSON.parse(JSON.stringify(x)),bound=(v,min,max)=>Math.min(max,Math.max(min,Number(v)||min));
function label(code){
  if(!code)return '—';
  if(code.startsWith('Key'))return code.slice(3);
  if(code.startsWith('Digit'))return code.slice(5);
  if(code.startsWith('Numpad'))return '넘'+code.slice(6);
  return{ShiftLeft:'Shift',ShiftRight:'R Shift',ControlLeft:'Ctrl',ControlRight:'R Ctrl',AltLeft:'Alt',AltRight:'R Alt',Space:'Space',ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→'}[code]||code;
}
function sanitize(input){const out=clone(defaults);if(!input||typeof input!=='object')return out;
  if(['auto','touch','mouse'].includes(input.mode))out.mode=input.mode;
  out.scale=bound(input.scale??1,.8,1.35);out.opacity=bound(input.opacity??.85,.4,1);
  for(const action of actions){const value=input.keys?.[action];if(typeof value==='string'&&allowed.test(value))out.keys[action]=value}
  // Keep earlier custom bindings when a newly introduced action wants the same key.
  for(const action of ['jump','crouch','prone'])if(!input.keys?.[action]&&actions.some(a=>a!==action&&out.keys[a]===out.keys[action])){const free=['Space','KeyC','KeyZ','ControlLeft','KeyX','KeyB','AltLeft'].find(code=>!Object.values(out.keys).includes(code));if(free)out.keys[action]=free}
  if(new Set(Object.values(out.keys)).size!==actions.length)out.keys=clone(defaults.keys);
  for(const orientation of ['landscape','portrait']){const l=input.layouts?.[orientation];if(l&&typeof l==='object'){out.layouts[orientation]={};for(const id of ids)if(Array.isArray(l[id])&&l[id].length===2&&l[id].every(Number.isFinite))out.layouts[orientation][id]=l[id].map(n=>bound(n,0,1))}}
  return out}
let prefs=clone(defaults);try{prefs=sanitize(JSON.parse(localStorage.getItem(storageKey)))}catch{}
let hooks={},capturing=null,editing=false,editBackup=null,visibility=null,drag=null;
// Pointer lock and pointer capture are mutually exclusive in Chromium.
function capturePointer(node,id){if(document.pointerLockElement||!node.isConnected||typeof node.setPointerCapture!=='function')return false;try{node.setPointerCapture(id);return true}catch(error){if(error.name==='InvalidStateError'||error.name==='NotFoundError')return false;throw error}}
function orientation(){return innerWidth>innerHeight?'landscape':'portrait'}
function isTouch(){return prefs.mode==='touch'||(prefs.mode==='auto'&&(matchMedia('(pointer:coarse)').matches||(navigator.maxTouchPoints||0)>0))}
function keyLabel(action){return label(prefs.keys[action])}
function save(){try{localStorage.setItem(storageKey,JSON.stringify(prefs));$('control-feedback').textContent='이 기기에 저장됐습니다.'}catch{$('control-feedback').textContent='이번 실행에 적용됐습니다. 이 웹뷰에서는 설정 저장을 사용할 수 없습니다.'}}
function position(id){const o=orientation();return prefs.layouts[o]?.[id]||layouts[o][id]}
function apply(){document.documentElement.style.setProperty('--control-opacity',prefs.opacity);for(const id of ids){const node=$(id);if(!node)continue;const size=Math.min(dimensions[id]*prefs.scale,innerHeight*.3),[x,y]=position(id),margin=8;node.style.width=node.style.height=size+'px';node.style.left=bound(x*innerWidth,size/2+margin,innerWidth-size/2-margin)+'px';node.style.top=bound(y*innerHeight,size/2+(editing?$('layout-toolbar').getBoundingClientRect().bottom+10:8),innerHeight-size/2-8)+'px';node.style.right=node.style.bottom='auto';node.style.transform='translate(-50%,-50%)'}if(hooks.changed)hooks.changed();renderKeyButtons()}
function renderKeyButtons(){for(const action of actions){const node=$('bind-'+action);if(!node)continue;node.textContent=capturing===action?'키를 누르세요…':keyLabel(action);node.setAttribute('aria-label',names[action]+' 키 '+keyLabel(action))}for(const node of document.querySelectorAll('[data-keyhint]'))node.textContent=keyLabel(node.dataset.keyhint)}
function syncForm(){$('control-mode').value=prefs.mode;$('button-size').value=prefs.scale;$('button-opacity').value=prefs.opacity;$('size-value').textContent=Math.round(prefs.scale*100)+'%';$('opacity-value').textContent=Math.round(prefs.opacity*100)+'%';renderKeyButtons()}
function open(){hooks.pause?.();capturing=null;syncForm();$('control-feedback').textContent='';$('controls-dialog').showModal()}
function close(){capturing=null;$('controls-dialog').close();renderKeyButtons();$('open-controls').focus()}
for(const action of actions){const node=$('bind-'+action);if(node)node.onclick=()=>{capturing=action;$('control-feedback').textContent=names[action]+'에 사용할 키를 누르세요. Esc는 취소입니다.';renderKeyButtons()}}
addEventListener('keydown',e=>{if(!$('controls-dialog').open)return;if(!capturing)return;e.preventDefault();e.stopImmediatePropagation();
  if(e.code==='Escape'){capturing=null;renderKeyButtons();return}
  if(!allowed.test(e.code)){$('control-feedback').textContent='이 키는 사용할 수 없습니다. 영문·숫자·방향키·Shift·Ctrl·Alt·Space 중에서 고르세요.';return}
  const clash=actions.find(a=>a!==capturing&&prefs.keys[a]===e.code);
  if(clash){$('control-feedback').textContent='이미 "'+names[clash]+'"에 쓰는 키입니다. 먼저 그 키를 바꿔 주세요.';return}
  prefs.keys[capturing]=e.code;capturing=null;save();apply()},{capture:true});
$('open-controls').onclick=open;$('hud-controls').onclick=open;$('close-controls').onclick=close;
$('controls-dialog').addEventListener('cancel',()=>{capturing=null});
$('control-mode').onchange=e=>{prefs.mode=e.target.value;save();apply()};
for(const [id,key,text]of [['button-size','scale','size-value'],['button-opacity','opacity','opacity-value']])$(id).oninput=e=>{prefs[key]=Number(e.target.value);$(text).textContent=Math.round(prefs[key]*100)+'%';save();apply()};
$('reset-controls').onclick=()=>{prefs=clone(defaults);save();apply();syncForm()};
$('reset-keys').onclick=()=>{prefs.keys=clone(defaults.keys);capturing=null;save();apply();$('control-feedback').textContent='키 설정을 기본값으로 되돌렸습니다.'};
function beginEdit(){capturing=null;editBackup=clone(prefs);visibility={screen:$('screen').hidden,hud:$('hud').hidden,touch:$('touch').hidden};$('controls-dialog').close();editing=true;document.body.classList.add('layout-edit');$('screen').hidden=true;$('hud').hidden=true;$('touch').hidden=false;$('layout-toolbar').hidden=false;apply();$('finish-layout').focus()}
function endEdit(commit){if(!editing)return;if(!commit)prefs=editBackup;editing=false;drag=null;document.body.classList.remove('layout-edit');$('layout-toolbar').hidden=true;$('screen').hidden=visibility.screen;$('hud').hidden=visibility.hud;$('touch').hidden=visibility.touch;apply();if(commit)save();syncForm();$('controls-dialog').showModal()}
$('edit-layout').onclick=beginEdit;$('finish-layout').onclick=()=>endEdit(true);$('cancel-layout').onclick=()=>endEdit(false);
$('mirror-layout').onclick=()=>{const o=orientation(),current={};for(const id of ids){const p=position(id);current[id]=[1-p[0],p[1]]}prefs.layouts[o]=current;apply()};
$('reset-layout').onclick=()=>{delete prefs.layouts[orientation()];apply()};
for(const id of ids){const node=$(id);if(!node)continue;node.addEventListener('pointerdown',e=>{if(!editing)return;e.preventDefault();e.stopImmediatePropagation();const rect=node.getBoundingClientRect();drag={id,pointer:e.pointerId,dx:e.clientX-(rect.left+rect.width/2),dy:e.clientY-(rect.top+rect.height/2)};capturePointer(node,e.pointerId)},{capture:true});addEventListener('pointermove',e=>{if(!editing||drag?.pointer!==e.pointerId||drag.id!==id)return;e.preventDefault();e.stopImmediatePropagation();const o=orientation();prefs.layouts[o]??={};prefs.layouts[o][id]=[(e.clientX-drag.dx)/innerWidth,(e.clientY-drag.dy)/innerHeight];prefs.layouts[o][id]=prefs.layouts[o][id].map(n=>bound(n,0,1));apply()},{capture:true});for(const name of ['pointerup','pointercancel','lostpointercapture'])addEventListener(name,e=>{if(!editing)return;e.stopImmediatePropagation();if(drag?.pointer===e.pointerId)drag=null},{capture:true});node.addEventListener('click',e=>{if(editing){e.preventDefault();e.stopImmediatePropagation()}},{capture:true})}
addEventListener('resize',()=>{drag=null;apply()});
const lookup=()=>{const map={};for(const action of actions)map[prefs.keys[action]]=action;return map};
window.GameControls={capturePointer,connect(value){hooks=value;apply();syncForm()},isTouch,keyLabel,keyName:label,actions,
  code:action=>prefs.keys[action],codes:lookup,actionFor(code){return lookup()[code]||null},
  toggleMode(){prefs.mode=isTouch()?'mouse':'touch';save();apply()},
  get editing(){return editing},get modalOpen(){return $('controls-dialog').open},getSettings:()=>clone(prefs)};
})();
