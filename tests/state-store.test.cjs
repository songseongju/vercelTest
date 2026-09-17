const test=require('node:test'),assert=require('node:assert/strict');
const {MemoryStore,RedisSocketStore,configuredStore,redisUrl}=require('../server/store.cjs');const{makeState,evolve,hash,authorize}=require('../server/room-state.cjs');const {Battle}=require('../server/simulation.cjs');
test('only one function leads; stale revisions cannot overwrite a match',async()=>{const store=new MemoryStore(),state=makeState('a','A','a'.repeat(48),'socket-a',1000);await store.create('ABC234',state);await store.append('ABC234',{op:'heartbeat',id:'a',owner:'socket-a',at:1000});const first=await store.begin('ABC234','function-a'),second=await store.begin('ABC234','function-b');assert.equal(first.leader,true);assert.equal(second.leader,false);const update=evolve(first.state,first.commands,1100);assert.equal(await store.commit('ABC234','function-b',0,update,1),false);assert.equal(await store.commit('ABC234','function-a',0,update,1),true);assert.equal(await store.commit('ABC234','function-a',0,update,0),false);assert.equal((await store.begin('ABC234','function-a')).commands.length,0);store.rooms.get('ABC234').lease=0;assert.equal((await store.begin('ABC234','function-b')).leader,true);assert.equal(await store.commit('ABC234','function-a',1,update,0),false);});
test('reconnect tokens are checked and a replaced connection loses input authority',()=>{let s=makeState('a','A','a'.repeat(48),'old',1000);assert.equal(authorize(s,'a','x'.repeat(48)),false);assert.equal(authorize(s,'a','a'.repeat(48)),true);s=evolve(s,[{op:'reconnect',id:'a',hash:hash('a'.repeat(48)),owner:'new',request:'rejoin',at:1100},{op:'action',id:'a',owner:'old',type:'ready',data:true,at:1100}],1100);assert.equal(Battle.restore(s.game).players.get('a').ready,false);assert.equal(s.sessions.a.owner,'new');});
test('disconnect expiry removes abandoned players and joins never exceed eight',()=>{let s=makeState('a','A','a'.repeat(48),'a',1000);const commands=Array.from({length:9},(_,i)=>({op:'join',id:'p'+i,name:'P',hash:'hash',owner:'o'+i,request:'r'+i,at:1100}));s=evolve(s,commands,1100);assert.equal(Battle.restore(s.game).players.size,8);assert.equal(s.receipts.r7.ok,false);s=evolve(s,[],22000);assert.equal(Battle.restore(s.game).players.size,0);});
test('production never silently falls back to isolated in-memory rooms',()=>{assert.equal(configuredStore({VERCEL:'1'}),null);assert.equal(configuredStore({NODE_ENV:'production'}),null);assert.equal(configuredStore({}).constructor.name,'MemoryStore');});

test('a delayed function cannot revive an expired session',()=>{let s=makeState('a','A','a'.repeat(48),'old',1000);s=evolve(s,[{op:'reconnect',id:'a',hash:hash('a'.repeat(48)),owner:'new',request:'late',at:22000}],22000);assert.equal(s.receipts.late.ok,false);assert.equal(s.sessions.a,undefined);assert.equal(Battle.restore(s.game).players.has('a'),false);});

test('a redis:// endpoint wins over REST credentials and never falls back silently',()=>{
  const rest={UPSTASH_REDIS_REST_URL:'https://rest.test',UPSTASH_REDIS_REST_TOKEN:'t'};
  assert.equal(redisUrl({REDIS_URL:' redis://default:pw@host:6379 '}),'redis://default:pw@host:6379');
  assert.equal(redisUrl({REDIS_URL:'https://rest.test'}),null);
  assert.equal(redisUrl({KV_URL:'rediss://default:pw@host:6380'}),'rediss://default:pw@host:6380');
  assert.equal(configuredStore({...rest,REDIS_URL:'redis://default:pw@host:6379'}).constructor.name,'RedisSocketStore');
  assert.equal(configuredStore({...rest}).constructor.name,'RedisStore');
});

test('the socket store speaks the same protocol as the REST store and hides the password',async()=>{
  const log=[],replies=new Map();
  const fake={isOpen:true,on(){},async connect(){},
    async set(key,value,opts){log.push(['set',key,opts]);return replies.get('set')},
    async get(key){log.push(['get',key]);return replies.get('get')},
    async eval(source,{keys,arguments:args}){log.push(['eval',source.trim().slice(0,5),keys,args]);return replies.get('eval')},
    async sendCommand(args){log.push(['cmd',args]);if(replies.has('throw'))throw Error('AUTH failed for s3cr3t at host:6379');return replies.get('cmd')}};
  const store=new RedisSocketStore('redis://default:s3cr3t@host:6379',{createClient:()=>fake});
  replies.set('set','OK');assert.equal(await store.create('ABC234',{revision:0}),true);
  replies.set('set',null);assert.equal(await store.create('ABC234',{revision:0}),false);
  assert.deepEqual(log[0],['set','lf:{ABC234}:state',{NX:true,EX:900}]);
  replies.set('get',JSON.stringify({revision:7}));assert.deepEqual(await store.read('ABC234'),{revision:7});
  replies.set('eval',1);assert.equal(await store.append('ABC234',{op:'input'}),1);
  assert.deepEqual(log.at(-1)[2],['lf:{ABC234}:state','lf:{ABC234}:queue']);
  replies.set('eval',null);assert.equal(await store.begin('ABC234','fn'),null);
  replies.set('eval',[JSON.stringify({revision:2}),'{}',1]);
  const batch=await store.begin('ABC234','fn');
  assert.deepEqual(batch,{state:{revision:2},commands:[],leader:true});
  replies.set('eval',[JSON.stringify({revision:2}),JSON.stringify([JSON.stringify({op:'input'})]),0]);
  assert.deepEqual((await store.begin('ABC234','fn')).commands,[{op:'input'}]);
  replies.set('eval',1);assert.equal(await store.commit('ABC234','fn',2,{revision:3},1),true);
  replies.set('eval',0);assert.equal(await store.commit('ABC234','fn',2,{revision:3},1),false);
  replies.set('cmd','PONG');assert.equal(await store.command(['PING']),'PONG');
  replies.set('throw',true);
  const failure=await store.command(['PING']).then(()=>null,error=>error);
  assert.ok(!/s3cr3t/.test(failure.message),'password must not reach the caller');
  assert.equal(store.redact('AUTH failed for s3cr3t at host:6379').includes('s3cr3t'),false);
});
