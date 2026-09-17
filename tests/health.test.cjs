const test=require('node:test'),assert=require('node:assert/strict');
const{redisCredentials,RedisStore}=require('../server/store.cjs');const{health}=require('../server/health.cjs');
test('Vercel KV names work without mixing credentials from different databases',()=>{
  assert.deepEqual(redisCredentials({KV_REST_API_URL:'https://example.test',KV_REST_API_TOKEN:'kv'}),{url:'https://example.test',token:'kv'});
  assert.equal(redisCredentials({UPSTASH_REDIS_REST_URL:'https://other.test',KV_REST_API_TOKEN:'kv'}),null);
  assert.deepEqual(redisCredentials({UPSTASH_REDIS_REST_URL:'https://a.test',UPSTASH_REDIS_REST_TOKEN:'a',KV_REST_API_URL:'https://b.test',KV_REST_API_TOKEN:'b'}),{url:'https://a.test',token:'a'});
});
test('health checks actual Redis connectivity and caches probes briefly',async()=>{
  const store=new RedisStore('https://example.test','secret');let calls=0;
  store.command=async args=>{assert.deepEqual(args,['PING']);calls++;return'PONG'};
  assert.equal((await health(store)).ok,true);assert.equal((await health(store)).storage,'redis');assert.equal(calls,1);
  const broken=new RedisStore('https://example.test','secret');broken.command=async()=>{throw Error('do not expose secret')};
  const result=await health(broken);assert.equal(result.ok,false);assert.ok(!JSON.stringify(result).includes('secret'));
  assert.equal((await health(null)).ok,false);
});
