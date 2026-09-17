'use strict';
const cache=new WeakMap();
async function health(store){
  const base={version:'3.1.0',storage:store?.kind||(store?'local':'missing')};
  if(!store)return{...base,ok:false,message:'Redis를 연결해 주세요. REDIS_URL(레디스 클라우드) 또는 Upstash REST URL·토큰을 설정한 뒤 다시 배포해야 합니다.'};
  if(typeof store.command!=='function')return{...base,ok:true};
  const previous=cache.get(store);if(previous&&Date.now()-previous.at<15000)return previous.result;
  // Verify real connectivity instead of reporting success just because two variables exist.
  let result;try{if(await store.command(['PING'])!=='PONG')throw Error('Unexpected Redis reply');result={...base,ok:true,checkedAt:new Date().toISOString()};}
  catch{result={...base,ok:false,message:'Redis에 연결하지 못했습니다. 접속 정보·쓰기 권한·DB 활성 상태를 확인해 주세요.'};}
  cache.set(store,{at:Date.now(),result});return result;
}
module.exports={health};
