'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const apiSource=fs.readFileSync(path.join(root,'netlify/functions/pingkereta.js'),'utf8');
const healthSource=fs.readFileSync(path.join(root,'netlify/functions/health.js'),'utf8');
function load(source,env){
 const sandbox={
  exports:{},
  process:{env},
  require:name=>{
   if(name==='@netlify/blobs')return {getStore:()=>{throw Error('Storage must not be opened during disabled mode');}};
   if(name==='qrcode')return {toString:()=>{throw Error('QR generation must not run during disabled mode');}};
   return require(name);
  },
  Buffer,URL,URLSearchParams,console,
 };
 vm.runInNewContext(source,sandbox);
 return sandbox.exports.handler;
}
test('PingKereta backend is fail-closed without BOTH release flags',async()=>{
 const variants=[{}, {PINGKERETA_ENABLE_LIVE:'true'}, {PINGKERETA_RELEASE_APPROVED:'true'},
  {PINGKERETA_ENABLE_LIVE:'true',PINGKERETA_RELEASE_APPROVED:'false'}];
 for(const env of variants){
  const response=await load(apiSource,env)({httpMethod:'POST',path:'/api/pingkereta/create',headers:{},body:'{}'});
  assert.equal(response.statusCode,503);
  assert.match(JSON.parse(response.body).error,/disabled/);
 }
});
test('Backend refuses both flags without full required private pilot configuration',async()=>{
 const response=await load(apiSource,{
  PINGKERETA_ENABLE_LIVE:'true',
  PINGKERETA_RELEASE_APPROVED:'true'
 })({httpMethod:'POST',path:'/api/pingkereta/create',headers:{},body:'{}'});
 assert.equal(response.statusCode,503);
 assert.match(JSON.parse(response.body).error,/not configured/);
});
test('Public health check verifies routing only and discloses no secrets',async()=>{
 const handler=load(healthSource,{PINGKERETA_TWILIO_AUTH_TOKEN:'never-expose-this'});
 const response=await handler({httpMethod:'GET'});
 assert.equal(response.statusCode,200);
 const data=JSON.parse(response.body);
 assert.equal(data.service,'PingKereta');
 assert.equal(data.scope,'route-only');
 assert.equal(data.liveFlagsEnabled,false);
 assert.ok(!response.body.includes('never-expose-this'));
 assert.equal((await handler({httpMethod:'POST'})).statusCode,405);
});
