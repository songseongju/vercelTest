'use strict';
const BEGIN=`
local state=redis.call('GET',KEYS[1]); if not state then return nil end
local owner=redis.call('GET',KEYS[3]); if not owner then redis.call('SET',KEYS[3],ARGV[1],'NX','PX',1500); owner=redis.call('GET',KEYS[3]) end
if owner~=ARGV[1] then return {state,'[]',0} end
redis.call('PEXPIRE',KEYS[3],1500)
return {state,cjson.encode(redis.call('LRANGE',KEYS[2],0,511)),1}`;
const COMMIT=`
if redis.call('GET',KEYS[3])~=ARGV[1] then return 0 end
local old=redis.call('GET',KEYS[1]); if not old or cjson.decode(old).revision~=tonumber(ARGV[2]) then return 0 end
redis.call('SET',KEYS[1],ARGV[3],'EX',900)
redis.call('LTRIM',KEYS[2],tonumber(ARGV[4]),-1); redis.call('EXPIRE',KEYS[2],900)
return 1`;
const APPEND=`if redis.call('EXISTS',KEYS[1])==0 then return 0 end
if redis.call('LLEN',KEYS[2])>=512 then return -1 end
redis.call('RPUSH',KEYS[2],ARGV[1]); redis.call('EXPIRE',KEYS[2],900); return 1`;
const roomKeys=code=>['lf:{'+code+'}:state','lf:{'+code+'}:queue','lf:{'+code+'}:lease'];
class MemoryStore {
  constructor(){this.rooms=new Map();this.kind='local'}
  keys(code){return roomKeys(code)}
  async create(code,state){if(this.rooms.has(code))return false;this.rooms.set(code,{state:JSON.stringify(state),queue:[],owner:'',lease:0,expiry:Date.now()+900000});return true}
  get(code){const room=this.rooms.get(code);if(room&&room.expiry<Date.now()){this.rooms.delete(code);return null}return room}
  async read(code){const r=this.get(code);return r?JSON.parse(r.state):null}
  async append(code,command){const r=this.get(code);if(!r)return 0;if(r.queue.length>=512)return-1;r.queue.push(JSON.stringify(command));return 1}
  async begin(code,owner){const r=this.get(code);if(!r)return null;if(r.lease<Date.now()){r.owner=owner;r.lease=Date.now()+1500}const leader=r.owner===owner;if(leader)r.lease=Date.now()+1500;return{state:JSON.parse(r.state),commands:leader?r.queue.map(x=>JSON.parse(x)):[],leader}}
  async commit(code,owner,revision,state,count){const r=this.get(code);if(!r||r.owner!==owner||r.lease<Date.now()||JSON.parse(r.state).revision!==revision)return false;r.state=JSON.stringify(state);r.queue.splice(0,count);r.expiry=Date.now()+900000;return true}
  async close(){}
}
class RedisStore {
  constructor(url,token){this.url=url.replace(/\/$/,'');this.token=token;this.kind='redis'}
  keys(code){return roomKeys(code)}
  async command(args){const response=await fetch(this.url,{method:'POST',headers:{Authorization:'Bearer '+this.token,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(4000)});if(!response.ok)throw Error('Redis 연결 실패 (HTTP '+response.status+')');const data=await response.json();if(data.error)throw Error('Redis 명령 실패');return data.result}
  async create(code,state){return await this.command(['SET',this.keys(code)[0],JSON.stringify(state),'NX','EX',900])==='OK'}
  async read(code){const raw=await this.command(['GET',this.keys(code)[0]]);return raw?JSON.parse(raw):null}
  async append(code,command){return this.command(['EVAL',APPEND,2,...this.keys(code).slice(0,2),JSON.stringify(command)])}
  async begin(code,owner){const result=await this.command(['EVAL',BEGIN,3,...this.keys(code),owner]);if(!result)return null;const raw=JSON.parse(result[1]);return{state:JSON.parse(result[0]),commands:Array.isArray(raw)?raw.map(x=>JSON.parse(x)):[],leader:result[2]===1}}
  async commit(code,owner,revision,state,count){return await this.command(['EVAL',COMMIT,3,...this.keys(code),owner,String(revision),JSON.stringify(state),String(count)])===1}
  async close(){}
}
// Redis Cloud and any other plain redis:// endpoint: one pooled TCP client per function instance.
class RedisSocketStore {
  constructor(url,{createClient=null,commandTimeout=4000}={}){this.url=url;this.kind='redis';this.commandTimeout=commandTimeout;this.factory=createClient;this.client=null;this.connecting=null;
    const password=(()=>{try{return decodeURIComponent(new URL(url).password)}catch{return''}})();this.secret=password||null}
  keys(code){return roomKeys(code)}
  // The URL embeds the password, so driver errors are redacted before anything logs them.
  redact(message){let text=String(message||'');if(this.secret)text=text.split(this.secret).join('***');return text.split(this.url).join('redis://***')}
  connection(){
    if(this.client&&this.client.isOpen)return Promise.resolve(this.client);
    if(!this.connecting)this.connecting=(async()=>{
      const create=this.factory||require('redis').createClient;
      const client=create({url:this.url,socket:{connectTimeout:4000,reconnectStrategy:tries=>tries>10?false:Math.min(100*2**tries,2000)}});
      // node-redis reconnects on its own, but an unhandled 'error' would take the whole function down.
      client.on('error',error=>console.error('Redis socket:',this.redact(error?.message)));
      await client.connect();return client;
    })().then(client=>{this.client=client;this.connecting=null;return client},error=>{this.connecting=null;throw error});
    return this.connecting;
  }
  async run(action){
    let client;try{client=await this.connection()}catch(error){console.error('Redis connect:',this.redact(error?.message));throw Error('Redis 연결 실패')}
    let timer;try{return await Promise.race([action(client),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('command timed out')),this.commandTimeout);timer.unref?.()})])}
    catch(error){console.error('Redis command:',this.redact(error?.message));throw Error('Redis 명령 실패')}
    finally{clearTimeout(timer)}
  }
  command(args){return this.run(client=>client.sendCommand(args.map(String)))}
  script(source,keys,args){return this.run(client=>client.eval(source,{keys,arguments:args}))}
  async create(code,state){return await this.run(client=>client.set(this.keys(code)[0],JSON.stringify(state),{NX:true,EX:900}))==='OK'}
  async read(code){const raw=await this.run(client=>client.get(this.keys(code)[0]));return raw?JSON.parse(raw):null}
  async append(code,command){return Number(await this.script(APPEND,this.keys(code).slice(0,2),[JSON.stringify(command)]))}
  async begin(code,owner){const result=await this.script(BEGIN,this.keys(code),[owner]);if(!result)return null;const raw=JSON.parse(result[1]);return{state:JSON.parse(result[0]),commands:Array.isArray(raw)?raw.map(x=>JSON.parse(x)):[],leader:Number(result[2])===1}}
  async commit(code,owner,revision,state,count){return Number(await this.script(COMMIT,this.keys(code),[owner,String(revision),JSON.stringify(state),String(count)]))===1}
  async close(){const client=this.client;this.client=null;this.connecting=null;if(client)await client.quit().catch(()=>{})}
}
function redisCredentials(env=process.env){
  for(const [u,t]of [['UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN'],['KV_REST_API_URL','KV_REST_API_TOKEN']])
    if(env[u]&&env[t])return{url:env[u],token:env[t]};
  return null;
}
function redisUrl(env=process.env){
  for(const name of ['REDIS_URL','REDIS_URI','KV_URL'])if(env[name]&&/^rediss?:\/\/.+/.test(env[name].trim()))return env[name].trim();
  return null;
}
function configuredStore(env=process.env){
  const url=redisUrl(env);if(url)return new RedisSocketStore(url);
  const config=redisCredentials(env);if(config)return new RedisStore(config.url,config.token);
  if(env.VERCEL||env.NODE_ENV==='production')return null;return new MemoryStore();
}
module.exports={MemoryStore,RedisStore,RedisSocketStore,configuredStore,redisCredentials,redisUrl,BEGIN,COMMIT,APPEND};
