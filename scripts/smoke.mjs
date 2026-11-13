#!/usr/bin/env node
'use strict';
// Safe read-only checks. Never signs up vehicles, generates OTPs or sends alerts.
const assert=require('node:assert/strict');
const base=process.argv[2];
if(!base){console.error('Usage: node scripts/smoke.mjs https://your-pingkereta-site.netlify.app');process.exit(2);}
const root=new URL(base);
if(root.protocol!=='https:')throw Error('HTTPS URL required');
if(root.username||root.password||root.search||root.hash)throw Error('Use an origin only, with no credentials or query');
const checks=[
 {path:'/',type:'text/html',expect:200,text:'PingKereta'},
 {path:'/test/',type:'text/html',expect:200,text:'SIMULATION ONLY'},
 {path:'/app.js',type:'javascript',expect:200,text:'PREVIEW_ONLY=true'},
 {path:'/api/health',type:'application/json',expect:200,text:'"scope":"route-only"'},
 {path:'/api/pingkereta/status',type:'application/json',expect:200,text:'"mode":"preview"'},
 {path:'/api/pingkereta/public?code=000000000000000000000000',type:'application/json',expect:503,text:'disabled'}
];
for(const check of checks){
 const url=new URL(check.path,root);
 const response=await fetch(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(10000)});
 const body=await response.text();
 assert.equal(response.status,check.expect,'Unexpected status at '+url.pathname);
 assert.ok((response.headers.get('content-type')||'').includes(check.type),'Unexpected content type at '+url.pathname);
 assert.ok(body.includes(check.text),'Unexpected response text at '+url.pathname);
 if(check.type==='text/html')assert.ok(!body.includes('chaaam.com'),'Legacy domain detected in '+url.pathname);
 console.log('OK '+check.path+' ('+response.status+')');
}
console.log('Read-only preview smoke checks passed. No live alerts were sent.');
