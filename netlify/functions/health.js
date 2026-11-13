'use strict';
// Safe public route check: does not inspect credentials, connect to storage, or send messages.
exports.handler=async event=>{
 const headers={
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store',
  'Referrer-Policy':'no-referrer',
  'X-Content-Type-Options':'nosniff',
  'X-Robots-Tag':'noindex, nofollow'
 };
 if((event.httpMethod||'GET')!=='GET')return {statusCode:405,headers,body:JSON.stringify({error:'Method not allowed'})};
 const flagsEnabled=process.env.PINGKERETA_ENABLE_LIVE==='true'&&process.env.PINGKERETA_RELEASE_APPROVED==='true';
 return {statusCode:200,headers,body:JSON.stringify({
  service:'PingKereta',
  status:'ok',
  scope:'route-only',
  notifications:'not-tested',
  liveFlagsEnabled:flagsEnabled
 })};
};
