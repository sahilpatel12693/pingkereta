#!/usr/bin/env node
'use strict';
// Checks GitHub source/deploy configuration. Does NOT test live third-party services.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const pkg=JSON.parse(read('package.json'));
const config=read('netlify.toml');
const home=read('public/index.html');
const script=read('public/app.js');
const api=read('netlify/functions/pingkereta.js');
const health=read('netlify/functions/health.js');
const demo=read('public/test/index.html');
const siteFiles=[home,script,api,demo];
assert.equal(pkg.name,'pingkereta-web');
assert.ok(pkg.dependencies.qrcode&&pkg.dependencies['@netlify/blobs']);
assert.match(config,/publish\s*=\s*"public"/);
assert.match(config,/functions\s*=\s*"netlify\/functions"/);
assert.match(config,/from\s*=\s*"\/api\/pingkereta\/\*"/);
assert.match(config,/from\s*=\s*"\/api\/health"/);
assert.match(home,/https:\/\/pingkereta\.com\//);
assert.match(home,/href="\/test\/"/);
assert.match(home,/src="\/app\.js"/);
assert.match(script,/PREVIEW_ONLY=true/);
assert.match(api,/PINGKERETA_ENABLE_LIVE!=='true'/);
assert.match(api,/PINGKERETA_RELEASE_APPROVED!=='true'/);
assert.match(health,/scope:'route-only'/);
for(const content of siteFiles)assert.doesNotMatch(content,/chaaam\.com|onrender\.com/i,'Unexpected reference to former host');
for(const file of ['.env','.env.production','.env.local'])assert.ok(!fs.existsSync(path.join(root,file)),file+' must not be committed or bundled');
if(process.argv.includes('--production')){
 const required=[
 'PINGKERETA_PILOT_INVITE_SECRET','PINGKERETA_DATA_ENCRYPTION_KEY',
 'PINGKERETA_TWILIO_ACCOUNT_SID','PINGKERETA_TWILIO_AUTH_TOKEN',
 'PINGKERETA_TWILIO_VERIFY_SERVICE_SID','PINGKERETA_TWILIO_WHATSAPP_FROM',
 'PINGKERETA_WHATSAPP_CONTENT_SID','PINGKERETA_TWILIO_STATUS_URL'
 ];
 const missing=required.filter(k=>!process.env[k]);
 if(missing.length)throw Error('Required production settings missing: '+missing.join(', '));
 assert.equal(process.env.PINGKERETA_ENABLE_LIVE,'true','Live feature flag not set');
 assert.equal(process.env.PINGKERETA_RELEASE_APPROVED,'true','Release approval flag not set');
 assert.ok(process.env.PINGKERETA_PILOT_INVITE_SECRET.length>=32,'Invitation secret must be at least 32 characters');
 assert.match(process.env.PINGKERETA_DATA_ENCRYPTION_KEY,/^[a-f0-9]{64}$/i,'AES key must be 64 hex characters');
 assert.match(process.env.PINGKERETA_WHATSAPP_CONTENT_SID,/^HX[a-f0-9]{32}$/i);
 assert.equal(process.env.PINGKERETA_TWILIO_STATUS_URL,'https://pingkereta.com/api/pingkereta/twilio-status');
 console.log('Production configuration shape looks valid. This does NOT approve or enable release.');
}else{
 console.log('PingKereta static deployment preflight passed; live production readiness is NOT certified.');
}
