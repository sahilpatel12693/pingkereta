const { getStore } = require('@netlify/blobs');
const crypto = require('node:crypto');
const https = require('node:https');
const QRCode = require('qrcode');
const STORE='pingkereta-v1';
const ALLOWED=new Set(['blocking','lights','urgent','issue']);
const LABELS={blocking:'Your car is blocking access / Kereta menghalang laluan',lights:'Your vehicle lights are on / Lampu kereta masih menyala',urgent:'Please attend to your vehicle / Sila datang ke kereta',issue:'There may be an issue with your vehicle / Ada masalah pada kereta'};
const json=(status,data,headers={})=>({statusCode:status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers},body:JSON.stringify(data)});
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const random=n=>crypto.randomBytes(n).toString('hex');
const store=()=>getStore({name:STORE,consistency:'strong'});
const read=async(s,key)=>{try{return await s.get(key,{type:'json'});}catch{return null;}};
const save=(s,key,value)=>s.setJSON(key,value);
const cookieValue=(headers,name)=>{const cookies=headers.cookie||headers.Cookie||'';const m=cookies.match(new RegExp('(?:^|;\\s*)'+name+'=([^;]+)'));return m?decodeURIComponent(m[1]):'';};
const isCode=s=>typeof s==='string'&&/^[a-f0-9]{24}$/.test(s);
// Controlled-pilot enrolment: a short-lived, plate-bound invitation issued by an authorised operator.
// This limits registration but does NOT establish legal vehicle ownership.
function pilotInviteValid(plate,invite){
 const secret=process.env.PINGKERETA_PILOT_INVITE_SECRET;
 if(!secret||secret.length<32||typeof invite!=='string')return false;
 const parts=invite.split('.');
 if(parts.length!==2||!/^[0-9]{10,13}$/.test(parts[0])||!/^[a-f0-9]{64}$/.test(parts[1]))return false;
 const expires=Number(parts[0]);
 if(!Number.isSafeInteger(expires)||expires<Date.now()||expires>Date.now()+7*86400000)return false;
 const expected=crypto.createHmac('sha256',secret).update(plate+'|'+expires).digest('hex');
 return crypto.timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(parts[1],'hex'));
}
const baseHeaders={'Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'};
const sameOrigin=e=>{const origin=e.headers.origin||e.headers.Origin;const host=e.headers.host||e.headers.Host;return !origin||(!!host&&new URL(origin).host===host&&new URL(origin).protocol==='https:');};
const parse=e=>{try{const b=JSON.parse(e.body||'{}');return b&&typeof b==='object'&&!Array.isArray(b)?b:{};}catch{return {};}};
const strip=s=>String(s||'').trim().slice(0,120);
function telegram(chatId,message){
 const token=process.env.PINGKERETA_TELEGRAM_BOT_TOKEN;
 if(!token)return Promise.resolve(false);
 const body=JSON.stringify({chat_id:chatId,text:message,disable_web_page_preview:true});
 return new Promise(resolve=>{
  const req=https.request({hostname:'api.telegram.org',path:'/bot'+token+'/sendMessage',method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},timeout:7000},res=>{
   let response='';res.on('data',chunk=>response+=chunk);res.on('end',()=>{try{resolve(res.statusCode===200&&JSON.parse(response).ok===true);}catch{resolve(false);}});
  });
  req.on('error',()=>resolve(false));req.on('timeout',()=>req.destroy());req.end(body);
 });
}
async function rateLimit(s,key,windowMs,max){
 const now=Date.now(),bucket=await read(s,'rate/'+hash(key));
 const start=bucket&&now-bucket.start<windowMs?bucket.start:now;
 const count=bucket&&start===bucket.start?bucket.count+1:1;
 await save(s,'rate/'+hash(key),{start,count});
 return count<=max;
}

function ownerAuthenticated(event,owner,code){
 const parts=cookieValue(event.headers,'pk_owner').split('.');
 if(parts.length!==2||parts[0]!==code||!/^[a-f0-9]{64}$/.test(parts[1]))return false;
 return crypto.timingSafeEqual(Buffer.from(hash(parts[1])),Buffer.from(owner.secretHash));
}
function encryptPhone(phone){
 const key=process.env.PINGKERETA_DATA_ENCRYPTION_KEY;
 if(!key||!/^[a-f0-9]{64}$/i.test(key))throw Error('Encryption key not configured');
 const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);
 const encrypted=Buffer.concat([cipher.update(phone,'utf8'),cipher.final()]);
 return [iv.toString('hex'),cipher.getAuthTag().toString('hex'),encrypted.toString('hex')].join('.');
}
function decryptPhone(data){
 const key=process.env.PINGKERETA_DATA_ENCRYPTION_KEY;
 const [iv,tag,encrypted]=String(data||'').split('.');
 if(!key||!iv||!tag||!encrypted)throw Error('Missing phone encryption');
 const decipher=crypto.createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),Buffer.from(iv,'hex'));
 decipher.setAuthTag(Buffer.from(tag,'hex'));
 return Buffer.concat([decipher.update(Buffer.from(encrypted,'hex')),decipher.final()]).toString('utf8');
}
function twilio(path,fields){
 const sid=process.env.PINGKERETA_TWILIO_ACCOUNT_SID,token=process.env.PINGKERETA_TWILIO_AUTH_TOKEN;
 if(!sid||!token)return Promise.resolve({ok:false,error:'SMS provider not configured'});
 const data=new URLSearchParams(fields).toString();
 return new Promise(resolve=>{
  const req=https.request({hostname:path.startsWith('/v2/Services/')?'verify.twilio.com':'api.twilio.com',path,method:'POST',headers:{Authorization:'Basic '+Buffer.from(sid+':'+token).toString('base64'),'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(data)},timeout:8000},res=>{
   let response='';res.on('data',chunk=>response+=chunk);res.on('end',()=>{
    try{const result=JSON.parse(response);resolve({ok:res.statusCode>=200&&res.statusCode<300,result});}
    catch{resolve({ok:false,error:'SMS provider response unavailable'});}
   });
  });
  req.on('error',()=>resolve({ok:false,error:'SMS provider unavailable'}));req.on('timeout',()=>req.destroy());req.end(data);
 });
}
async function verifySms(phone,code){
 const service=process.env.PINGKERETA_TWILIO_VERIFY_SERVICE_SID;
 if(!service)return {ok:false};
 return twilio('/v2/Services/'+encodeURIComponent(service)+'/VerificationCheck',{To:phone,Code:code});
}
async function startSms(phone,channel='sms'){
 const service=process.env.PINGKERETA_TWILIO_VERIFY_SERVICE_SID;
 if(!service)return {ok:false};
 return twilio('/v2/Services/'+encodeURIComponent(service)+'/Verifications',{To:phone,Channel:channel});
}
async function sendWhatsApp(phone,plate,type){
 const from=process.env.PINGKERETA_TWILIO_WHATSAPP_FROM;
 const contentSid=process.env.PINGKERETA_WHATSAPP_CONTENT_SID;
 if(!from||!contentSid||!/^HX[a-f0-9]{32}$/i.test(contentSid)||!process.env.PINGKERETA_TWILIO_STATUS_URL)return null;
 const response=await twilio('/2010-04-01/Accounts/'+encodeURIComponent(process.env.PINGKERETA_TWILIO_ACCOUNT_SID)+'/Messages.json',{
  To:'whatsapp:'+phone,From:from.startsWith('whatsapp:')?from:'whatsapp:'+from,
  ...(process.env.PINGKERETA_TWILIO_STATUS_URL?{StatusCallback:process.env.PINGKERETA_TWILIO_STATUS_URL}:{}),
  ContentSid:contentSid,ContentVariables:JSON.stringify({'1':plate,'2':LABELS[type]})
 });
 return response.ok&&/^SM[a-f0-9]{32}$/i.test(response.result.sid||'')?{sid:response.result.sid}:null;
}
async function sendSms(phone,plate,type){
 const from=process.env.PINGKERETA_TWILIO_FROM;
 if(!from)return false;
 const body='RM0.00 PingKereta: Parking alert for '+plate+'. '+LABELS[type]+'.';
 const response=await twilio('/2010-04-01/Accounts/'+encodeURIComponent(process.env.PINGKERETA_TWILIO_ACCOUNT_SID)+'/Messages.json',{To:phone,From:from,Body:body,...(process.env.PINGKERETA_TWILIO_STATUS_URL?{StatusCallback:process.env.PINGKERETA_TWILIO_STATUS_URL}:{})});
 return response.ok?{sid:response.result.sid||null}:null;
}

async function handler(event){
 const headers={...baseHeaders};
 const method=event.httpMethod||'GET';
 const path=(event.path||'').replace(/^\/\.netlify\/functions\/pingkereta\/?/,'').replace(/^\/api\/pingkereta\/?/,'').replace(/^\/+|\/+$/g,'');
 const s=store(),body=parse(event);
 const ip=(event.headers['x-nf-client-connection-ip']||event.headers['client-ip']||'unknown').slice(0,100);
 if(method==='OPTIONS')return json(405,{error:'Not allowed'},headers);
 if(method==='POST'&&!sameOrigin(event)&&path!=='telegram-webhook'&&path!=='twilio-status')return json(403,{error:'Origin not allowed'},headers);
 if(path==='telegram-webhook'){
  if(method!=='POST')return json(405,{error:'Method not allowed'},headers);
  const secret=process.env.PINGKERETA_WEBHOOK_SECRET;
  if(!secret||event.headers['x-telegram-bot-api-secret-token']!==secret)return json(403,{error:'Forbidden'},headers);
  const message=body.message||{};
  const chatId=message.chat&&message.chat.id;
  const text=String(message.text||'');
  const match=text.match(/^\/start(?:@\w+)?\s+([a-f0-9]{48})$/);
  if(match&&chatId){
   const link=await read(s,'link/'+hash(match[1]));
   if(link&&link.expires>Date.now()){
    const owner=await read(s,'vehicle/'+link.code);
    if(owner&&owner.linkHash===hash(match[1])){
     owner.chatId=String(chatId);owner.linkHash=null;
     await save(s,'vehicle/'+link.code,owner);
     await s.delete('link/'+hash(match[1]));
     await telegram(chatId,'PingKereta is connected. Vehicle alerts will arrive here.');
    }
   }
  }
  return json(200,{ok:true},headers);
 }
 if(path==='twilio-status'){
  if(method!=='POST')return json(405,{error:'Method not allowed'},headers);
  const token=process.env.PINGKERETA_TWILIO_AUTH_TOKEN;
  const publicUrl=process.env.PINGKERETA_TWILIO_STATUS_URL;
  const signature=event.headers['x-twilio-signature']||event.headers['X-Twilio-Signature'];
  if(!token||!publicUrl||!signature)return json(403,{error:'Forbidden'},headers);
  const form=new URLSearchParams(event.body||'');
  const params=[...form.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
  const data=publicUrl+params.map(([k,v])=>k+v).join('');
  const expected=crypto.createHmac('sha1',token).update(data).digest('base64');
  if(signature.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return json(403,{error:'Forbidden'},headers);
  const sid=form.get('MessageSid')||form.get('SmsSid');
  const status=form.get('MessageStatus')||form.get('SmsStatus');
  if(!/^SM[a-f0-9]{32}$/i.test(sid||'')||!new Set(['queued','accepted','sending','sent','delivered','undelivered','failed','read']).has(status))return json(400,{error:'Invalid status'},headers);
  const lookup=await read(s,'delivery/'+sid);
  if(!lookup)return json(200,{ok:true},headers);
  const target=await read(s,'vehicle/'+lookup.code);
  if(target){const entry=(target.alerts||[]).find(a=>a.id===lookup.id&&a.providerSid===sid);if(entry){
   const terminal=new Set(['delivered','read','undelivered','failed']);
   const old=entry.deliveryStatus;
   // Twilio may retry callbacks or deliver them out of order; never downgrade confirmed delivery.
   if(!(old==='read'||(old==='delivered'&&status!=='read')||(terminal.has(old)&&!terminal.has(status)))){
    entry.deliveryStatus=status;entry.delivered=status==='delivered'||status==='read';entry.deliveryUpdated=Date.now();
    await save(s,'vehicle/'+lookup.code,target);
   }
  }}
  return json(200,{ok:true},headers);
 }
 if(path==='create'){
  if(method!=='POST')return json(405,{error:'Method not allowed'},headers);
  if(!await rateLimit(s,'create:'+ip,3600000,5))return json(429,{error:'Too many registrations. Try later.'},headers);
  const plate=strip(body.plate).toUpperCase().replace(/[^A-Z0-9 -]/g,'').slice(0,18);
  if(plate.length<2)return json(400,{error:'Enter a valid vehicle plate.'},headers);
  if(!pilotInviteValid(plate,body.pilotInvite))return json(403,{error:'Registration is restricted to authorised pilot invitations.'},headers);
  const existing=await read(s,'plate/'+hash(plate));
  if(existing)return json(409,{error:'This vehicle is already registered. Contact the pilot operator for a transfer.'},headers);
  const code=random(12),secret=random(32),linkToken=random(24);
  const owner={code,plate,secretHash:hash(secret),linkHash:hash(linkToken),chatId:null,phoneEncrypted:null,smsVerified:false,smsConsent:false,whatsappConsent:false,whatsappVerified:false,created:Date.now(),alerts:[]};
  await save(s,'vehicle/'+code,owner);
  await save(s,'plate/'+hash(plate),{code,created:Date.now()});
  await save(s,'link/'+hash(linkToken),{code,expires:Date.now()+86400000});
  const bot=process.env.PINGKERETA_BOT_USERNAME||'';
  return json(201,{code,plate,scanUrl:'https://pingkereta.com/?code='+code,connectUrl:bot?'https://t.me/'+encodeURIComponent(bot)+'?start='+linkToken:null,connected:false}, {...headers,'Set-Cookie':'pk_owner='+code+'.'+secret+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=31536000'});
 }
 const code=path==='owner'?String(body.code||event.queryStringParameters?.code||''):String(body.code||event.queryStringParameters?.code||'');
 if(!isCode(code))return json(400,{error:'Invalid sticker code.'},headers);
 const owner=await read(s,'vehicle/'+code);
 if(!owner)return json(404,{error:'Sticker not found.'},headers);
 if(path==='qr'&&method==='GET'){
  const svg=await QRCode.toString('https://pingkereta.com/?code='+code,{type:'svg',margin:2,width:240,errorCorrectionLevel:'M'});
  return {statusCode:200,headers:{'Content-Type':'image/svg+xml; charset=utf-8','Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; sandbox"},body:svg};
 }

 if(path==='owner-delete'&&method==='POST'){
  if(!ownerAuthenticated(event,owner,code))return json(401,{error:'Owner authentication required'},headers);
  const confirmed=strip(body.confirmPlate).toUpperCase().replace(/[^A-Z0-9 -]/g,'').slice(0,18);
  if(confirmed!==owner.plate)return json(400,{error:'Confirm the exact vehicle registration number to delete.'},headers);
  // Delete access and associated records. Blob storage is not transactional; public rollout
  // still requires a transactional backend and a data-retention audit.
  await s.delete('vehicle/'+code);
  await s.delete('plate/'+hash(owner.plate));
  await s.delete('pending-phone/'+code);
  for(const alert of owner.alerts||[]){if(alert.providerSid)await s.delete('delivery/'+alert.providerSid);}
  return json(200,{ok:true,message:'Your vehicle sticker has been deactivated and the owner record deleted.'},{...headers,'Set-Cookie':'pk_owner=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'});
 }
 if(path==='sms-start'&&method==='POST'){
  if(!ownerAuthenticated(event,owner,code))return json(401,{error:'Owner authentication required'},headers);
  if(!await rateLimit(s,'verify:'+code,3600000,3))return json(429,{error:'Too many verification attempts'},headers);
  const phone=String(body.phone||'').trim();
  if(!/^\+60[1-9]\d{7,9}$/.test(phone)||body.consent!==true)return json(400,{error:'Enter a Malaysian phone number and consent to parking SMS alerts'},headers);
  const channel=body.channel==='sms'?'sms':'whatsapp';
  if(channel==='whatsapp'&&(!process.env.PINGKERETA_WHATSAPP_CONTENT_SID||!process.env.PINGKERETA_TWILIO_WHATSAPP_FROM||!process.env.PINGKERETA_TWILIO_STATUS_URL))return json(503,{error:'WhatsApp provider and delivery callbacks are not configured yet'},headers);
  const result=await startSms(phone,channel);
  if(!result.ok)return json(502,{error:'Could not send verification SMS'},headers);
  await save(s,'pending-phone/'+code,{encrypted:encryptPhone(phone),channel,expires:Date.now()+600000});
  return json(200,{ok:true,message:'Verification code requested'},headers);
 }
 if(path==='sms-confirm'&&method==='POST'){
  if(!ownerAuthenticated(event,owner,code))return json(401,{error:'Owner authentication required'},headers);
  if(!await rateLimit(s,'confirm:'+code,3600000,8))return json(429,{error:'Too many verification attempts'},headers);
  const pending=await read(s,'pending-phone/'+code);
  if(!pending||pending.expires<Date.now())return json(400,{error:'Verification expired'},headers);
  const otp=String(body.otp||'').trim();
  if(!/^\d{4,10}$/.test(otp))return json(400,{error:'Invalid verification code'},headers);
  const phone=decryptPhone(pending.encrypted),result=await verifySms(phone,otp);
  if(!result.ok||result.result.status!=='approved')return json(400,{error:'Verification failed'},headers);
  owner.phoneEncrypted=pending.encrypted;owner.smsVerified=pending.channel==='sms';owner.smsConsent=pending.channel==='sms';owner.whatsappVerified=pending.channel==='whatsapp';owner.whatsappConsent=pending.channel==='whatsapp';
  await save(s,'vehicle/'+code,owner);await s.delete('pending-phone/'+code);
  return json(200,{ok:true,verified:true},headers);
 }
 if(path==='sms-disable'&&method==='POST'){
  if(!ownerAuthenticated(event,owner,code))return json(401,{error:'Owner authentication required'},headers);
  owner.phoneEncrypted=null;owner.smsVerified=false;owner.smsConsent=false;owner.whatsappVerified=false;owner.whatsappConsent=false;
  await save(s,'vehicle/'+code,owner);
  return json(200,{ok:true},headers);
 }
 if(path==='public'&&method==='GET')return json(200,{code,plate:owner.plate.slice(0,2)+'••••',active:true},headers);
 if(path==='alert'&&method==='POST'){
  if(!ALLOWED.has(body.type))return json(400,{error:'Select a valid alert type.'},headers);
  if(!await rateLimit(s,'alert-ip:'+ip,600000,8)||!await rateLimit(s,'alert-vehicle:'+code,120000,3))return json(429,{error:'Alert limit reached. Please wait.'},headers);
  const id=random(8),entry={id,type:body.type,created:Date.now(),delivered:false};
  let delivered=false,channel='inbox',providerSid=null;
  if(owner.whatsappVerified&&owner.whatsappConsent&&owner.phoneEncrypted){
   const result=await sendWhatsApp(decryptPhone(owner.phoneEncrypted),owner.plate,body.type);
   delivered=!!result;providerSid=result?.sid||null;
   if(delivered)channel='whatsapp';
  }
  if(!delivered&&owner.smsVerified&&owner.smsConsent&&owner.phoneEncrypted){
   const result=await sendSms(decryptPhone(owner.phoneEncrypted),owner.plate,body.type);
   delivered=!!result;providerSid=result?.sid||null;
   if(delivered)channel='sms';
  }
  if(!delivered&&owner.chatId){delivered=await telegram(owner.chatId,'PingKereta alert for '+owner.plate+'\n'+LABELS[body.type]);if(delivered)channel='telegram';}
  entry.delivered=false;entry.submitted=delivered;entry.channel=channel;entry.deliveryStatus=delivered?'submitted':'not_sent';entry.providerSid=providerSid;
  owner.alerts=[entry,...(owner.alerts||[])].slice(0,40);
  await save(s,'vehicle/'+code,owner);
  if(providerSid)await save(s,'delivery/'+providerSid,{code,id,created:Date.now()});
  return json(200,{ok:true,submitted:delivered,delivered:false,message:delivered?'Alert submitted to notification provider. Delivery is not yet confirmed.':'Alert recorded, but instant delivery is not connected.'},headers);
 }
 if(path==='owner'&&method==='GET'){
  if(!ownerAuthenticated(event,owner,code))return json(401,{error:'Owner authentication required.'},headers);
  return json(200,{code,plate:owner.plate,connected:!!owner.chatId,smsVerified:!!owner.smsVerified,whatsappVerified:!!owner.whatsappVerified,alerts:(owner.alerts||[]).map(({providerSid,...alert})=>alert),created:owner.created},headers);
 }
 return json(404,{error:'Not found'},headers);
}
// Two independent release flags prevent an accidental public activation from a single toggle.
function liveConfigurationComplete(){
 const env=process.env;
 return !!(
  env.PINGKERETA_PILOT_INVITE_SECRET&&env.PINGKERETA_PILOT_INVITE_SECRET.length>=32&&
  /^[a-f0-9]{64}$/i.test(env.PINGKERETA_DATA_ENCRYPTION_KEY||'')&&
  env.PINGKERETA_TWILIO_ACCOUNT_SID&&env.PINGKERETA_TWILIO_AUTH_TOKEN&&
  env.PINGKERETA_TWILIO_VERIFY_SERVICE_SID&&
  env.PINGKERETA_TWILIO_WHATSAPP_FROM&&
  /^HX[a-f0-9]{32}$/i.test(env.PINGKERETA_WHATSAPP_CONTENT_SID||'')&&
  env.PINGKERETA_TWILIO_STATUS_URL==='https://pingkereta.com/api/pingkereta/twilio-status'
 );
}
exports.handler=async e=>{
 // Safe, read-only public configuration endpoint. Storage and messaging remain untouched.
 const requestPath=(e.path||'').replace(/^\/\.netlify\/functions\/pingkereta\/?/,'').replace(/^\/api\/pingkereta\/?/,'').replace(/^\/+|\/+$/g,'');
 if(requestPath==='status'){
  if((e.httpMethod||'GET')!=='GET')return json(405,{error:'Method not allowed'},baseHeaders);
  const enabled=process.env.PINGKERETA_ENABLE_LIVE==='true'&&process.env.PINGKERETA_RELEASE_APPROVED==='true'&&liveConfigurationComplete();
  return json(200,{mode:enabled?'controlled-pilot':'preview',registration:enabled?'invitation-only':'disabled',notifications:enabled?'provider-configured-not-verified':'disabled',product:'PingKereta'},baseHeaders);
 }
 if(process.env.PINGKERETA_ENABLE_LIVE!=='true'||process.env.PINGKERETA_RELEASE_APPROVED!=='true')
  return json(503,{error:'PingKereta preview is available. Registrations and alerts are disabled until security and messaging setup is complete.'},baseHeaders);
 if(!liveConfigurationComplete())
  return json(503,{error:'PingKereta backend is not configured for a controlled pilot.'},baseHeaders);
 try{return await handler(e);}catch(err){console.error('PingKereta error:',err.message);return json(500,{error:'Service temporarily unavailable.'},baseHeaders);}
};
