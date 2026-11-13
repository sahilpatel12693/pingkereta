'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const file=p=>fs.readFileSync(path.join(root,p),'utf8');
function harness(){
 const records=new Map(),sent=[];
 const blobs={getStore:()=>({
  get:async k=>records.get(k)||null,
  setJSON:async(k,v)=>{records.set(k,structuredClone(v));},
  delete:async k=>records.delete(k)
 })};
 const fakeHttps={request(options,callback){
  const chunks=[];
  const req={
   on(){return req;},end(data){chunks.push(data||'');
    const response=require('node:events').EventEmitter.prototype;
    const {EventEmitter}=require('node:events');
    const res=new EventEmitter();res.statusCode=201;
    sent.push({options,body:chunks.join('')});
    callback(res);
    process.nextTick(()=>{res.emit('data',JSON.stringify(options.path.includes('VerificationCheck')?{status:'approved'}:{sid:'SM'+'c'.repeat(32),status:'pending'}));res.emit('end');});
   },destroy(){}
  };return req;
 }};
 const context={exports:{},require(name){
  if(name==='@netlify/blobs')return blobs;
  if(name==='qrcode')return {toString:async()=>'<svg xmlns="http://www.w3.org/2000/svg"></svg>'};
  if(name==='node:https')return fakeHttps;
  return require(name);
 },process:{env:{
  PINGKERETA_ENABLE_LIVE:'true',
  PINGKERETA_RELEASE_APPROVED:'true',
  PINGKERETA_PILOT_INVITE_SECRET:'test-only-secret-that-is-long-enough-for-pilot',
  PINGKERETA_DATA_ENCRYPTION_KEY:'a'.repeat(64),
  PINGKERETA_TWILIO_ACCOUNT_SID:'ACtest',
  PINGKERETA_TWILIO_AUTH_TOKEN:'secret',
  PINGKERETA_TWILIO_VERIFY_SERVICE_SID:'VAtest',
  PINGKERETA_TWILIO_FROM:'+15005550006',
  PINGKERETA_TWILIO_WHATSAPP_FROM:'whatsapp:+15005550006',
  PINGKERETA_WHATSAPP_CONTENT_SID:'HX'+'b'.repeat(32),
  PINGKERETA_TWILIO_STATUS_URL:'https://pingkereta.com/api/pingkereta/twilio-status'
 },nextTick:process.nextTick.bind(process)},console,Buffer,URL,URLSearchParams,setTimeout,clearTimeout};
 vm.runInNewContext(file('netlify/functions/pingkereta.js'),context,{filename:'pingkereta.js'});
 async function call(route,{method='GET',body={},cookie='',ip='192.0.2.1',origin='https://pingkereta.com',rawBody=null,signature=null}={}){
  const [pathname,query='']=route.split('?');
  if(pathname==='create'&&body.plate&&!Object.hasOwn(body,'pilotInvite')){const plate=body.plate.trim().toUpperCase();const expires=Date.now()+3600000;body={...body,pilotInvite:expires+'.'+crypto.createHmac('sha256','test-only-secret-that-is-long-enough-for-pilot').update(plate+'|'+expires).digest('hex')};}
  const event={path:'/api/pingkereta/'+pathname,httpMethod:method,body:rawBody===null?JSON.stringify(body):rawBody,queryStringParameters:Object.fromEntries(new URLSearchParams(query)),headers:{host:'pingkereta.com',origin,cookie,'x-nf-client-connection-ip':ip,...(signature?{'x-twilio-signature':signature}:{})}};
  const res=await context.exports.handler(event);
  return {...res,data:JSON.parse(res.body.startsWith('{')?res.body:'{}')};
 }
 return {call,records,sent};
}
test('new owner cannot receive SMS before consent and phone verification',async()=>{
 const h=harness(),r=await h.call('create',{method:'POST',body:{plate:'JXX 1234'}});
 assert.equal(r.statusCode,201);
 const code=r.data.code;
 const alert=await h.call('alert',{method:'POST',body:{code,type:'blocking'}});
 assert.equal(alert.statusCode,200);
 assert.equal(alert.data.delivered,false);
 assert.equal(h.sent.length,0);
 const dashboard=await h.call('owner?code='+code);
 assert.equal(dashboard.statusCode,401);
 const authorized=await h.call('owner?code='+code,{cookie:r.headers['Set-Cookie'].split(';')[0]});
 assert.equal(authorized.statusCode,200);
 assert.equal(authorized.data.smsVerified,false);
});
test('SMS setup requires owner cookie, phone validation and consent',async()=>{
 const h=harness(),r=await h.call('create',{method:'POST',body:{plate:'JXX 1234'}});
 const code=r.data.code,cookie=r.headers['Set-Cookie'].split(';')[0];
 assert.equal((await h.call('sms-start',{method:'POST',body:{code,phone:'+60123456789',consent:true,channel:'sms'}})).statusCode,401);
 assert.equal((await h.call('sms-start',{method:'POST',cookie,body:{code,phone:'+60123456789',consent:false}})).statusCode,400);
 assert.equal((await h.call('sms-start',{method:'POST',cookie,body:{code,phone:'not a phone',consent:true}})).statusCode,400);
 const start=await h.call('sms-start',{method:'POST',cookie,body:{code,phone:'+60123456789',consent:true,channel:'sms'}});
 assert.equal(start.statusCode,200);
 assert.equal(h.sent[0].options.hostname,'verify.twilio.com');
 const confirm=await h.call('sms-confirm',{method:'POST',cookie,body:{code,otp:'123456'}});
 assert.equal(confirm.statusCode,200);
 const owner=await h.call('owner?code='+code,{cookie});
 assert.equal(owner.data.smsVerified,true);
 assert.equal(JSON.stringify([...h.records.values()]).includes('+60123456789'),false,'phone must not be stored in plaintext');
});
test('verified SMS is submitted to provider; scanner never receives owner number',async()=>{
 const h=harness(),r=await h.call('create',{method:'POST',body:{plate:'JXX 1234'}});
 const code=r.data.code,cookie=r.headers['Set-Cookie'].split(';')[0];
 await h.call('sms-start',{method:'POST',cookie,body:{code,phone:'+60123456789',consent:true,channel:'sms'}});
 await h.call('sms-confirm',{method:'POST',cookie,body:{code,otp:'123456'}});
 const pub=await h.call('public?code='+code);
 assert.equal(pub.statusCode,200);
 assert.equal(pub.data.phone,undefined);
 const alert=await h.call('alert',{method:'POST',body:{code,type:'blocking'}});
 assert.equal(alert.statusCode,200);
 assert.equal(alert.data.delivered,false); assert.equal(alert.data.submitted,true);
 assert.match(alert.data.message,/submitted/);
 const last=h.sent.at(-1);
 assert.match(last.options.path,/Messages.json/);
 const fields=new URLSearchParams(last.body);
 assert.match(fields.get('Body')||'',/RM0.00/);
 assert.equal((fields.get('Body')||'').includes('https://'),false,'SMS text must not include URLs');
 assert.equal(fields.get('StatusCallback'),'https://pingkereta.com/api/pingkereta/twilio-status','delivery callback is a separate provider field');
 const disable=await h.call('sms-disable',{method:'POST',cookie,body:{code}});
 assert.equal(disable.statusCode,200);
 const owner=await h.call('owner?code='+code,{cookie});
 assert.equal(owner.data.smsVerified,false);
});
test('invalid alert types and foreign origins are rejected',async()=>{
 const h=harness(),r=await h.call('create',{method:'POST',body:{plate:'JXX 1234'}});
 const code=r.data.code;
 assert.equal((await h.call('alert',{method:'POST',body:{code,type:'arbitrary-message'}})).statusCode,400);
 assert.equal((await h.call('alert',{method:'POST',body:{code,type:'blocking'},origin:'https://attacker.example'})).statusCode,403);
});
test('SMS verification is throttled per vehicle',async()=>{
 const h=harness(),r=await h.call('create',{method:'POST',body:{plate:'JXX 1234'}});
 const code=r.data.code,cookie=r.headers['Set-Cookie'].split(';')[0];
 const statuses=[];
 for(let i=0;i<4;i++)statuses.push((await h.call('sms-start',{method:'POST',cookie,body:{code,phone:'+60123456789',consent:true,channel:'sms'}})).statusCode);
 assert.deepEqual(statuses,[200,200,200,429]);
});

test('WhatsApp-first flow verifies opt-in and sends an approved template, not arbitrary text',async()=>{
 const h=harness(),r=await h.call('create',{method:'POST',body:{plate:'JXX 1234'}});
 const code=r.data.code,cookie=r.headers['Set-Cookie'].split(';')[0];
 const start=await h.call('sms-start',{method:'POST',cookie,body:{code,phone:'+60123456789',consent:true,channel:'whatsapp'}});
 assert.equal(start.statusCode,200);
 assert.match(h.sent[0].body,/Channel=whatsapp/);
 const confirmed=await h.call('sms-confirm',{method:'POST',cookie,body:{code,otp:'123456'}});
 assert.equal(confirmed.statusCode,200);
 const owner=await h.call('owner?code='+code,{cookie});
 assert.equal(owner.data.whatsappVerified,true);
 assert.equal(owner.data.smsVerified,false);
 const alert=await h.call('alert',{method:'POST',body:{code,type:'blocking'}});
 assert.equal(alert.statusCode,200);
 assert.match(h.sent.at(-1).body,/ContentSid=HX/);
 assert.match(h.sent.at(-1).body,/To=whatsapp%3A%2B60123456789/);
 assert.equal(h.sent.at(-1).body.includes('Body='),false,'template sends approved variables only');
});

test('registration rejects invalid pilot invitations and public lookup redacts plate',async()=>{
 const h=harness();
 const invalid=await h.call('create',{method:'POST',body:{plate:'JXX 1234',pilotInvite:'bad'}});
 assert.equal(invalid.statusCode,403);
 const created=await h.call('create',{method:'POST',body:{plate:'JXX 1234'}});
 assert.equal(created.statusCode,201);
 const pub=await h.call('public?code='+created.data.code);
 assert.equal(pub.statusCode,200);
 assert.ok(!pub.body.includes('JXX 1234'));
 assert.match(pub.data.plate,/••••/);
});

test('pilot registration refuses duplicate vehicle claims',async()=>{
 const h=harness();
 assert.equal((await h.call('create',{method:'POST',body:{plate:'JXX 1234'}})).statusCode,201);
 assert.equal((await h.call('create',{method:'POST',body:{plate:'JXX 1234'}})).statusCode,409);
});
test('Twilio status webhook rejects unsigned requests',async()=>{
 const h=harness();
 const res=await h.call('twilio-status',{method:'POST',body:{MessageSid:'SM'+'a'.repeat(32),MessageStatus:'delivered'}});
 assert.equal(res.statusCode,403);
});

test('signed Twilio callbacks confirm delivery and do not regress on out-of-order statuses',async()=>{
 const h=harness();const created=await h.call('create',{method:'POST',body:{plate:'TEST 1234'}});
 const code=created.data.code,cookie=created.headers['Set-Cookie'].split(';')[0];
 await h.call('sms-start',{method:'POST',cookie,body:{code,phone:'+60123456789',consent:true,channel:'whatsapp'}});
 await h.call('sms-confirm',{method:'POST',cookie,body:{code,otp:'123456'}});
 const alert=await h.call('alert',{method:'POST',body:{code,type:'blocking'}});
 assert.equal(alert.data.delivered,false); assert.equal(alert.data.submitted,true);
 assert.match(h.sent.at(-1).body,/StatusCallback=/);
 const sid='SM'+'c'.repeat(32);
 async function callback(status,sign=true){
  const raw=new URLSearchParams({MessageSid:sid,MessageStatus:status}).toString();
  const values=[['MessageSid',sid],['MessageStatus',status]].sort((a,b)=>a[0].localeCompare(b[0]));
  const source='https://pingkereta.com/api/pingkereta/twilio-status'+values.map(([k,v])=>k+v).join('');
  const signature=sign?crypto.createHmac('sha1','secret').update(source).digest('base64'):'invalid';
  return h.call('twilio-status',{method:'POST',rawBody:raw,signature});
 }
 assert.equal((await callback('delivered',false)).statusCode,403);
 assert.equal((await callback('delivered')).statusCode,200);
 let owner=await h.call('owner?code='+code,{cookie});
 assert.equal(owner.data.alerts[0].deliveryStatus,'delivered');
 assert.equal(owner.data.alerts[0].delivered,true);
 assert.equal(owner.data.alerts[0].providerSid,undefined);
 await callback('sent');owner=await h.call('owner?code='+code,{cookie});
 assert.equal(owner.data.alerts[0].deliveryStatus,'delivered');
 await callback('read');owner=await h.call('owner?code='+code,{cookie});
 assert.equal(owner.data.alerts[0].deliveryStatus,'read');
});
