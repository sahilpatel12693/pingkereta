(()=>{
'use strict';
const $=id=>document.getElementById(id);
const api='/api/pingkereta/';
let PREVIEW_ONLY=true; // Fail closed. Only explicit server-approved pilot configuration may unlock forms.
const state={code:'',ownerCode:sessionStorage.getItem('pingkereta-owner-code')||'',ownerPlate:''};
function message(id,value){const el=$(id);if(el)el.textContent=value;}
function show(id,visible){const el=$(id);if(el)el.classList.toggle('hidden',!visible);}
function setBusy(button,busy){if(button)button.disabled=busy;}
async function request(route,method='GET',payload){
 const response=await fetch(api+route,{
  method,credentials:'same-origin',cache:'no-store',
  headers:payload?{'Content-Type':'application/json'}:{},
  body:payload?JSON.stringify(payload):undefined
 });
 let body={};
 try{body=await response.json();}catch{throw Error('Service response unavailable. Try again later.');}
 if(!response.ok){const err=new Error(body.error||'Request failed.');err.status=response.status;throw err;}
 return body;
}
function setMode(pilot){
 PREVIEW_ONLY=!pilot;
 const create=$('createForm').querySelector('button[type="submit"]');
 const find=$('scanForm').querySelector('button[type="submit"]');
 create.disabled=!pilot;find.disabled=!pilot;
 create.textContent=pilot?'Activate my sticker':'Registration coming soon';
 find.textContent=pilot?'Find vehicle':'Alerts coming soon';
 for(const id of ['startSms','confirmSms','disableSms'])$(id).disabled=!pilot;
 const badge=$('launchBadge');
 badge.textContent=pilot?'Restricted pilot · Invitations required':'Public preview · Live alerts disabled';
 message('workspaceNotice',pilot?
  'Authorised pilot mode is available by invitation. Alerts are submitted only to owners who verify and opt in. Delivery is not guaranteed.':
  'Live functions are restricted during preview. Try the demo above to experience the flow safely.');
 message('createStatus',pilot?
  'Enter the invitation issued by your participating parking operator. Vehicle ownership must be checked by that operator.':
  'Preview only — no real registrations are being accepted.');
 message('scanStatus',pilot?
  'Enter a valid 24-character sticker code to select an alert reason.':
  'Preview only — alerts are not available yet.');
}
async function owner(){
 if(!state.ownerCode||PREVIEW_ONLY)return;
 try{
  const result=await request('owner?code='+encodeURIComponent(state.ownerCode));
  state.ownerPlate=result.plate||'';
  show('ownerPanel',true);
  message('ownerPlate',result.plate);
  message('telegramStatus',result.connected?'Optional Telegram connected.':'Telegram not connected (optional).');
  message('smsStatus',result.whatsappVerified?
    'Your WhatsApp number is verified for parking alerts. Provider acceptance is not proof of delivery.':
    'WhatsApp has not been verified. Enable it only if you consent to receive parking alerts.');
  const image=document.createElement('img');
  image.className='qr';image.alt='QR sticker for '+result.plate;
  image.src=api+'qr?code='+encodeURIComponent(state.ownerCode);
  $('qrCode').replaceChildren(image);
  const printImg=image.cloneNode();
  printImg.removeAttribute('class');
  $('printQrTarget').replaceChildren(printImg);
  const link=new URL('/?code='+encodeURIComponent(state.ownerCode),location.origin).href;
  $('scanLink').href=link;$('scanLink').textContent=link;
  const history=$('alertHistory');history.replaceChildren();
  for(const alert of result.alerts||[]){
   const li=document.createElement('li');
   const when=new Date(alert.created).toLocaleString();
   const delivery=alert.deliveryStatus||'not_sent';
   li.textContent=when+' · '+alert.type+' · '+alert.channel+' ('+delivery+')';
   history.append(li);
  }
  if(!(result.alerts||[]).length){const li=document.createElement('li');li.textContent='No alerts yet.';history.append(li);}
 }catch(error){
  if(error.status===401||error.status===404){
   show('ownerPanel',false);
   state.ownerCode='';state.ownerPlate='';
   sessionStorage.removeItem('pingkereta-owner-code');
   message('createStatus','Owner access unavailable in this browser. Contact the pilot operator for assistance.');
  }else message('createStatus','Unable to refresh owner status: '+error.message);
 }
}
$('createForm').addEventListener('submit',async event=>{
 event.preventDefault();if(PREVIEW_ONLY)return;
 const button=event.currentTarget.querySelector('button[type="submit"]');setBusy(button,true);
 try{
  const result=await request('create','POST',{
   plate:$('plate').value.trim(),
   pilotInvite:$('pilotInvite').value.trim()
  });
  state.ownerCode=result.code;
  sessionStorage.setItem('pingkereta-owner-code',result.code);
  show('telegramLink',!!result.connectUrl);
  if(result.connectUrl)$('telegramLink').href=result.connectUrl;
  await owner();
  message('createStatus','Sticker activated. Next, verify your WhatsApp number and explicitly consent to alerts.');
 }catch(error){message('createStatus',error.message);}
 finally{setBusy(button,PREVIEW_ONLY);}
});
$('scanForm').addEventListener('submit',async event=>{
 event.preventDefault();if(PREVIEW_ONLY)return;
 const code=$('code').value.trim().toLowerCase();
 try{
  const data=await request('public?code='+encodeURIComponent(code));
  state.code=code;
  message('vehicleTitle','Vehicle: '+data.plate);
  message('scanStatus','Choose one reason for contacting the owner.');
  show('alertPanel',true);
 }catch(error){show('alertPanel',false);message('scanStatus',error.message);}
});
document.querySelectorAll('[data-alert]').forEach(button=>button.addEventListener('click',async()=>{
 if(!state.code||PREVIEW_ONLY)return;
 const buttons=[...document.querySelectorAll('[data-alert]')];
 buttons.forEach(b=>setBusy(b,true));
 try{
  const result=await request('alert','POST',{code:state.code,type:button.dataset.alert});
  message('alertStatus',result.message||'Alert recorded.');
 }catch(error){message('alertStatus',error.message);}
 finally{buttons.forEach(b=>setBusy(b,false));}
}));
$('startSms').addEventListener('click',async()=>{
 if(PREVIEW_ONLY||!state.ownerCode)return;
 if(!$('smsConsent').checked){message('smsStatus','Consent is required to receive parking alerts via WhatsApp.');return;}
 const button=$('startSms');setBusy(button,true);
 try{
  const result=await request('sms-start','POST',{
   code:state.ownerCode,phone:$('smsPhone').value.trim(),consent:true,channel:'whatsapp'
  });
  show('otpPanel',true);
  message('smsStatus',result.message||'Verification requested. Check your WhatsApp messages.');
 }catch(error){message('smsStatus',error.message);}
 finally{setBusy(button,false);}
});
$('confirmSms').addEventListener('click',async()=>{
 if(PREVIEW_ONLY||!state.ownerCode)return;
 const button=$('confirmSms');setBusy(button,true);
 try{
  await request('sms-confirm','POST',{code:state.ownerCode,otp:$('smsOtp').value.trim()});
  show('otpPanel',false);
  await owner();
  message('smsStatus','WhatsApp number verified. Parking alerts are enabled for this restricted pilot.');
 }catch(error){message('smsStatus',error.message);}
 finally{setBusy(button,false);}
});
$('disableSms').addEventListener('click',async()=>{
 if(PREVIEW_ONLY||!state.ownerCode)return;
 const button=$('disableSms');setBusy(button,true);
 try{
  await request('sms-disable','POST',{code:state.ownerCode});
  await owner();message('smsStatus','All phone-based parking notifications have been disabled.');
 }catch(error){message('smsStatus',error.message);}
 finally{setBusy(button,false);}
});
$('refreshOwner').addEventListener('click',owner);
$('printQr').addEventListener('click',()=>{
 if(!$('printQrTarget').querySelector('img')){message('createStatus','Activate a sticker before printing.');return;}
 window.print();
});
$('deleteOwner').addEventListener('click',async()=>{
 if(PREVIEW_ONLY||!state.ownerCode)return;
 const confirmed=window.prompt('To permanently delete this vehicle and deactivate its QR sticker, type the vehicle registration exactly: '+state.ownerPlate);
 if(confirmed===null)return;
 const button=$('deleteOwner');setBusy(button,true);
 try{
  await request('owner-delete','POST',{code:state.ownerCode,confirmPlate:confirmed});
  sessionStorage.removeItem('pingkereta-owner-code');
  state.ownerCode='';state.ownerPlate='';
  $('printQrTarget').replaceChildren();
  show('ownerPanel',false);
  message('createStatus','Vehicle deleted and the QR sticker deactivated.');
 }catch(error){message('createStatus',error.message);}
 finally{setBusy(button,false);}
});
async function init(){
 setMode(false);
 const scanCode=new URLSearchParams(location.search).get('code');
 if(scanCode&&/^[a-f0-9]{24}$/i.test(scanCode))$('code').value=scanCode;
 try{
  const status=await request('status');
  if(status.mode==='controlled-pilot'){
   setMode(true);
   if(scanCode)$('scanForm').requestSubmit();
   if(state.ownerCode)await owner();
  }
 }catch{
  // Stay in safe preview mode when backend or environment is unavailable.
  setMode(false);
 }
}
init();
})();
