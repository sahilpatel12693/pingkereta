#!/usr/bin/env node
'use strict';
// Restricted operator-only utility. Never expose this script through public website routes.
// The HMAC invitation prevents unapproved registration, but is not single-use or legal proof of vehicle ownership.
const crypto=require('node:crypto');
const raw=process.argv[2]||'';
const minutes=Number(process.argv[3]||60);
const plate=raw.trim().toUpperCase().replace(/[^A-Z0-9 -]/g,'').slice(0,18);
const secret=process.env.PINGKERETA_PILOT_INVITE_SECRET||'';
if(plate.length<2||!Number.isSafeInteger(minutes)||minutes<1||minutes>10080||secret.length<32){
 console.error('Usage: PINGKERETA_PILOT_INVITE_SECRET=<private-secret> node scripts/issue-pilot-invite.cjs "JXX 1234" [valid-minutes: 1..10080]');
 console.error('The authorised operator must check vehicle ownership before issuing an invitation.');
 process.exit(2);
}
const expiry=Date.now()+minutes*60*1000;
const signature=crypto.createHmac('sha256',secret).update(plate+'|'+expiry).digest('hex');
console.log('Vehicle: '+plate);
console.log('Expires: '+new Date(expiry).toISOString());
console.log('Invitation: '+expiry+'.'+signature);
console.log('Operator reminder: Do not reuse or publish this invitation. A separate ownership check is required.');
