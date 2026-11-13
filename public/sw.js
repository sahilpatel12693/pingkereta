'use strict';
self.addEventListener('push',event=>{
 let data={};
 try{data=event.data?event.data.json():{};}catch{}
 const title='PingKereta parking alert';
 const body=typeof data.body==='string'?data.body.slice(0,180):'A new parking issue was reported near your vehicle.';
 const options={
  body,tag:'pingkereta-parking-alert',renotify:true,
  icon:'/favicon.svg',badge:'/favicon.svg',
  data:{url:'/'}
 };
 event.waitUntil(self.registration.showNotification(title,options));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  const clientsList=await clients.matchAll({type:'window',includeUncontrolled:true});
  const existing=clientsList.find(c=>new URL(c.url).origin===self.location.origin);
  if(existing){await existing.focus();return;}
  await clients.openWindow('/');
 })());
});
