(()=>{
'use strict';
const $=id=>document.getElementById(id);
const api='/api/pingkereta/';
const PREVIEW_ONLY=true;

const state={code:'',ownerCode:sessionStorage.getItem('pingkereta-owner-code')||''};
const request=async(path,method='GET',data)=>{
 const response=await fetch(api+path,{method,credentials:'same-origin',headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined,cache:'no-store'});
 const result=await response.json();
 if(!response.ok)throw Error(result.error||'Request failed');
 return result;
};
function message(id,text){$(id).textContent=text;}
function show(id,visible){$(id).classList.toggle('hidden',!visible);}
async function owner(){
 if(!state.ownerCode)return;
 try{
  const data=await request('owner?code='+encodeURIComponent(state.ownerCode));
  show('ownerPanel',true);
  $('ownerPlate').textContent=data.plate;
  $('telegramStatus').textContent=data.connected?'Optional Telegram connected.':'Telegram not connected (optional).';
  message('smsStatus',data.whatsappVerified?'WhatsApp number verified; delivery status is not confirmed.':'WhatsApp is not yet enabled. Verify your number when the service launches.');
  $('qrCode').replaceChildren();
  const img=document.createElement('img');img.className='qr';img.alt='Printable QR code for '+data.plate;img.src=api+'qr?code='+encodeURIComponent(state.ownerCode);$('qrCode').append(img);
  const link=new URL('/?code='+encodeURIComponent(state.ownerCode),location.origin).href;
  $('scanLink').href=link;$('scanLink').textContent=link;
  const history=$('alertHistory');history.replaceChildren();
  (data.alerts||[]).forEach(alert=>{const li=document.createElement('li');li.textContent=new Date(alert.created).toLocaleString()+' — '+alert.type+(alert.deliveryStatus?' ('+alert.channel+': '+alert.deliveryStatus+')':alert.submitted?' (submitted via '+alert.channel+')':' (inbox only)');history.append(li);});
  if(!(data.alerts||[]).length){const li=document.createElement('li');li.textContent='No alerts yet.';history.append(li);}
 }catch(e){show('ownerPanel',false);sessionStorage.removeItem('pingkereta-owner-code');state.ownerCode='';message('createStatus','Owner session unavailable. Use the browser where you registered this sticker.');}
}
$('createForm').addEventListener('submit',async event=>{
 event.preventDefault();
 const button=event.currentTarget.querySelector('button');button.disabled=true;
 try{
  const result=await request('create','POST',{plate:$('plate').value});
  state.ownerCode=result.code;sessionStorage.setItem('pingkereta-owner-code',result.code);
  if(result.connectUrl){$('telegramLink').href=result.connectUrl;show('telegramLink',true);}else show('telegramLink',false);
  message('createStatus','Sticker created. Verify your WhatsApp number to receive parking alerts. Keep this browser session for owner access.');
  await owner();
 }catch(e){message('createStatus',e.message);}finally{button.disabled=false;}
});
$('scanForm').addEventListener('submit',async event=>{
 event.preventDefault();const code=$('code').value.trim().toLowerCase();
 try{const data=await request('public?code='+encodeURIComponent(code));state.code=code;$('vehicleTitle').textContent='Vehicle: '+data.plate;show('alertPanel',true);message('scanStatus','Select the reason to notify the owner.');}
 catch(e){show('alertPanel',false);message('scanStatus',e.message);}
});
document.querySelectorAll('[data-alert]').forEach(button=>button.addEventListener('click',async()=>{
 if(!state.code)return;
 document.querySelectorAll('[data-alert]').forEach(b=>b.disabled=true);
 try{const result=await request('alert','POST',{code:state.code,type:button.dataset.alert});message('alertStatus',result.message);}
 catch(e){message('alertStatus',e.message);}
 finally{document.querySelectorAll('[data-alert]').forEach(b=>b.disabled=false);}
}));

async function smsAction(path,payload,statusId){
 try{const data=await request(path,'POST',{code:state.ownerCode,...payload});message(statusId,data.message||'Updated.');await owner();return data;}
 catch(e){message(statusId,e.message);return null;}
}
$('startSms').addEventListener('click',async()=>{
 if(!$('smsConsent').checked){message('smsStatus','Consent is required before enabling WhatsApp.');return;}
 const phone=$('smsPhone').value.trim();
 const result=await smsAction('sms-start',{phone,consent:true,channel:'whatsapp'},'smsStatus');
 if(result)show('otpPanel',true);
});
$('confirmSms').addEventListener('click',async()=>{
 const result=await smsAction('sms-confirm',{otp:$('smsOtp').value.trim()},'smsStatus');
 if(result){show('otpPanel',false);message('smsStatus','WhatsApp number verified. Parking alerts are enabled.');}
});
$('disableSms').addEventListener('click',async()=>{
 const result=await smsAction('sms-disable',{},'smsStatus');
 if(result)message('smsStatus','Parking notifications disabled.');
});
$('refreshOwner').addEventListener('click',owner);
$('printQr').addEventListener('click',()=>{if(!$('printQrTarget').querySelector('img')){message('createStatus','Create a QR sticker before printing.');return;}window.print();});
if(PREVIEW_ONLY){
 const create=$('createForm').querySelector('button[type="submit"]');create.disabled=true;create.textContent='Registration coming soon';
 const lookup=$('scanForm').querySelector('button[type="submit"]');lookup.disabled=true;lookup.textContent='Alerts coming soon';
 for(const id of ['startSms','confirmSms','disableSms'])$(id).disabled=true;
 message('createStatus','Preview only — registration is disabled while security and notification testing is completed.');
 message('scanStatus','Preview only — alerts are not available yet.');
}
const urlCode=new URLSearchParams(location.search).get('code');
if(urlCode){$('code').value=urlCode;if(!PREVIEW_ONLY)$('scanForm').requestSubmit();}
if(!PREVIEW_ONLY)owner();
})();