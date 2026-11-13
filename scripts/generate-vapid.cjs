'use strict';
const webpush=require('web-push');
const pair=webpush.generateVAPIDKeys();
console.log('Store these securely in the independent Netlify site's environment settings. Never commit your private key.');
console.log('PINGKERETA_VAPID_PUBLIC_KEY='+pair.publicKey);
console.log('PINGKERETA_VAPID_PRIVATE_KEY='+pair.privateKey);
console.log('PINGKERETA_VAPID_SUBJECT=mailto:YOUR-REAL-CONTACT-EMAIL');
console.log('Keep both live release flags FALSE until security and live-device checks pass.');
