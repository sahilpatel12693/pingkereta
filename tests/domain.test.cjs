'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const file=p=>fs.readFileSync(path.join(root,p),'utf8');
test('standalone site contains no CHAAAM links and uses canonical pingkereta.com',()=>{
 for(const p of ['public/index.html','public/app.js','public/test/index.html','netlify/functions/pingkereta.js']){
  const content=file(p);
  assert.doesNotMatch(content,/chaaam\.com|CHAAAM|\/pingkereta\/app\.js|\/pingkereta\/test\//i,p);
 }
 const html=file('public/index.html');
 assert.match(html,/href="https:\/\/pingkereta\.com\/"/);
 assert.match(html,/src="\/app\.js"/);
 assert.match(html,/href="\/test\/"/);
 const api=file('netlify/functions/pingkereta.js');
 assert.match(api,/https:\/\/pingkereta\.com\/\?code=/);
 assert.match(api,/PINGKERETA_ENABLE_LIVE!==['"]true['"]/);
});
test('Netlify publishes isolated standalone site with secure API rewrite',()=>{
 const cfg=file('netlify.toml');
 assert.match(cfg,/publish = "public"/);
 assert.match(cfg,/functions = "netlify\/functions"/);
 assert.match(cfg,/from = "\/api\/pingkereta\/\*"/);
 assert.doesNotMatch(cfg,/chaaam/i);
});
