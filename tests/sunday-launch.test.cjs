'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const file=p=>fs.readFileSync(path.join(root,p),'utf8');
function api(env={}){
 const context={exports:{},process:{env},console,Buffer,URL,URLSearchParams,require(name){
  if(name==='@netlify/blobs')return {getStore:()=>{throw Error('No store expected')}},
  if(name==='qrcode')return {toString:async()=>''};
  return require(name);
 }};
 vm.runInNewContext(file('netlify/functions/pingkereta.js'),context);
 return context.exports.handler;
}
test('public product mode reports preview while messaging is gated',async()=>{
 const handler=api();
 const r=await handler({httpMethod:'GET',path:'/api/pingkereta/status'});
 assert.equal(r.statusCode,200);
 const body=JSON.parse(r.body);
 assert.equal(body.mode,'preview');
 assert.equal(body.notifications,'disabled');
 assert.equal((await handler({httpMethod:'POST',path:'/api/pingkereta/status'})).statusCode,405);
});
test('public mode is still preview with both flags but incomplete provider settings',async()=>{
 const handler=api({PINGKERETA_ENABLE_LIVE:'true',PINGKERETA_RELEASE_APPROVED:'true'});
 const r=await handler({httpMethod:'GET',path:'/api/pingkereta/status'});
 assert.equal(JSON.parse(r.body).mode,'preview');
});
test('pilot HTML includes invitation, consent, deletion and private sticker printing',()=>{
 const home=file('public/index.html');
 const app=file('public/app.js');
 for(const id of ['pilotInvite','smsConsent','deleteOwner','printQrTarget','launchBadge','workspaceNotice'])
  assert.ok(home.includes('id="'+id+'"'),id);
 assert.match(app,/request\('status'\)/);
 assert.match(app,/request\('owner-delete'/);
 assert.match(app,/PREVIEW_ONLY=true/);
 assert.match(app,/printQrTarget/);
 assert.match(home,/href="\/test\/"/);
});
