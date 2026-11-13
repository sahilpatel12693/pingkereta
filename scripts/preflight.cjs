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
assert.ok(pkg.dependencies.qrcode&&pkg.dependencies['@netlify/blobs']&&pkg.dependencies['web-push']);
assert.match(config,/publish\s*=\s*"public"/);
assert.match(config,/functions\s*=\s*"netlify\/functions"/);
assert.match(config,/from\s*=\s*"\/api\/pingkereta\/\*"/);
assert.match(config,/from\s*=\s*"\/api\/health"/);
assert.match(home,/https:\/\/pingkereta\.com\//);
assert.match(home,/href="\/test\/"/);
assert.match(home,/src="\/app\.js"/);
assert.match(script,/PREVIEW_ONLY=true/);
assert.match(config,/from\\s*=\\s*"\\/api\\/pingkereta\\/\\*"/);
assert.match(read('public/manifest.webmanifest'),/"display"\\s*:\\s*"standalone"/);
assert.match(read('public/sw.js'),/showNotification/);
assert.match(home,/rel="manifest" href="\/manifest.webmanifest"/);
assert.match(home,/id="enablePush"/);
assert.match(home,/id="disablePush"/);
assert.match(script,/request\('status'\)/);
assert.match(home,/id="pilotInvite"/);
assert.match(home,/id="deleteOwner"/);
assert.match(api,/requestPath==='status'/);
assert.match(api,/PINGKERETA_ENABLE_LIVE!=='true'/);
assert.match(api,/PINGKERETA_RELEASE_APPROVED!=='true'/);
assert.match(health,/scope:'route-only'/);
for(const content of siteFiles)assert.doesNotMatch(content,/chaaam\.com|onrender\.com/i,'Unexpected reference to former host');
for(const file of ['.env','.env.production','.env.local'])assert.ok(!fs.existsSync(path.join(root,file)),file+' must not be committed or bundled');
if(process.argv.includes('--production')){
 const required=[
 'PINGKERETA_PILOT_INVITE_SECRET','PINGKERETA_DATA_ENCRYPTION_KEY',
 'PINGKERETA_VAPID_PUBLIC_KEY','PINGKERETA_VAPID_PRIVATE_KEY','PINGKERETA_VAPID_SUBJECT'
 ];
 const missing=required.filter(k=>!process.env[k]);
 if(missing.length)throw Error('Required production settings missing: '+missing.join(', '));
 assert.equal(process.env.PINGKERETA_ENABLE_LIVE,'true','Live feature flag not set');
 assert.equal(process.env.PINGKERETA_RELEASE_APPROVED,'true','Release approval flag not set');
 assert.ok(process.env.PINGKERETA_PILOT_INVITE_SECRET.length>=32,'Invitation secret must be at least 32 characters');
 assert.match(process.env.PINGKERETA_DATA_ENCRYPTION_KEY,/^[a-f0-9]{64}$/i,'AES key must be 64 hex characters');
 assert.match(process.env.PINGKERETA_VAPID_PUBLIC_KEY,/^[A-Za-z0-9_-]{60,180}$/);
 assert.match(process.env.PINGKERETA_VAPID_PRIVATE_KEY,/^[A-Za-z0-9_-]{30,100}$/);
 console.log('Production configuration shape looks valid. This does NOT approve or enable release.');
}else{
 console.log('PingKereta static deployment preflight passed; live production readiness is NOT certified.');
}
