const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const file=p=>fs.readFileSync(path.join(root,p),'utf8');
test('PingKereta page has accessible registration and scanner controls',()=>{
 const html=file('public/index.html');
 for(const id of ['createForm','scanForm','plate','code','ownerPanel','alertPanel','telegramLink','qrCode','alertHistory'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/\/pingkereta\/app\.js/);
});
test('API routes and storage have owner authentication and webhook verification',()=>{
 const src=file('netlify/functions/pingkereta.js');
 for(const token of ['crypto.randomBytes','timingSafeEqual','HttpOnly; Secure; SameSite=Strict','PINGKERETA_WEBHOOK_SECRET','x-telegram-bot-api-secret-token','rateLimit','ALLOWED.has(body.type)','QRCode.toString'])
  assert.ok(src.includes(token),'Missing security feature: '+token);
 assert.ok(!src.includes('add-test-sticker'));
 assert.ok(!src.includes('telegram-sync'));
});
test('Netlify has API rewrite and QR dependency',()=>{
 const config=file('netlify.toml');
 assert.match(config,/from = "\/api\/pingkereta\/\*"/);
 assert.match(config,/to = "\/\.netlify\/functions\/pingkereta\/:splat"/);
 assert.ok(require('../package.json').dependencies.qrcode);
});
test('Frontend does not expose Telegram secrets or send arbitrary text',()=>{
 const src=file('public/app.js');
 assert.ok(!src.includes('TELEGRAM_BOT_TOKEN'));
 assert.ok(!src.includes('chat_id'));
 assert.match(src,/data-alert/);
});
