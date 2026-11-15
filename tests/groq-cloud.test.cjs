'use strict';
// End-to-end test of public-mode Cloud Groq + persistent journal via a fake
// Supabase PostgREST server (no real credentials / Internet required).
const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const net=require('node:net');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const freePort=()=>new Promise(resolve=>{const srv=net.createServer();srv.listen(0,'127.0.0.1',()=>{const port=srv.address().port;srv.close(()=>resolve(port));});});
const readBody=async req=>{const out=[];for await(const part of req)out.push(part);return JSON.parse(Buffer.concat(out).toString()||'{}');};
test('Groq public demo: isolated AI, protected operator and persisted diaries across restarts',async()=>{
 const [sitePort,groqPort,storePort]=await Promise.all([freePort(),freePort(),freePort()]);
 const db=new Map(),calls=[];
 const groq=http.createServer(async(req,res)=>{
   assert.equal(req.method,'POST');assert.equal(req.url,'/openai/v1/chat/completions');
   assert.equal(req.headers.authorization,'Bearer mock-key-no-secret');
   const body=await readBody(req);calls.push(body);
   res.writeHead(200,{'Content-Type':'application/json'});
   res.end(JSON.stringify({model:'qwen/qwen3.8-27b',choices:[{message:{role:'assistant',content:'Що змінилося: Сон став коротшим у кількох записах щоденника, а втома посилилася. За показниками не можна визначити причину.\n\nЩо спробувати сьогодні: 1. Плануйте відпочинок.\n2. Додавайте короткі паузи.\n3. Перевірте комфорт перед сном.\n\nЩо перевірити завтра: Відзначте сон і самопочуття, щоб порівняти зміни.'}}],usage:{prompt_tokens:1200,completion_tokens:160,total_tokens:1360}}));
 });
 const store=http.createServer(async(req,res)=>{
   const u=new URL(req.url,`http://127.0.0.1:${storePort}`);
   assert.equal(u.pathname,'/rest/v1/astris_kv');
   assert.equal(req.headers.apikey,'sb_secret_mock-for-testing');
   res.setHeader('Content-Type','application/json');
   if(req.method==='GET'){
     const key=(u.searchParams.get('name')||'').replace(/^eq\./,'');
     return res.end(JSON.stringify(db.has(key)?[{payload:db.get(key)}]:[]));
   }
   if(req.method==='POST'){
     const rows=await readBody(req);
     for(const row of rows)db.set(row.name,row.payload);
     res.writeHead(204);return res.end();
   }
   res.writeHead(405);res.end();
 });
 const dirs=[fs.mkdtempSync(path.join(os.tmpdir(),'astris-groq-test-')),fs.mkdtempSync(path.join(os.tmpdir(),'astris-groq-reboot-'))];
 await new Promise(resolve=>groq.listen(groqPort,'127.0.0.1',resolve));
 await new Promise(resolve=>store.listen(storePort,'127.0.0.1',resolve));
 const env={...process.env,NODE_ENV:'test',ASTRIS_ALLOW_MOCK_STORAGE:'1',ASTRIS_ALLOW_GROQ_MOCK:'1',SUPABASE_URL:`http://127.0.0.1:${storePort}`,SUPABASE_SECRET_KEY:'sb_secret_mock-for-testing',GROQ_API_KEY:'mock-key-no-secret',ASTRIS_AI_PROVIDER:'groq',ASTRIS_GROQ_MODEL:'qwen/qwen3.8-27b',ASTRIS_GROQ_API_URL:`http://127.0.0.1:${groqPort}/openai/v1/chat/completions`,ASTRIS_OPERATOR_PASSWORD:'separate-private-operator-pass-123',ASTRIS_OLLAMA_AUTO_START:'0',PORT:String(sitePort),HOST:'127.0.0.1'};
 let child=null;
 let errors='';
 const api=async(endpoint,method='GET',body,cookie='')=>{
   const r=await fetch(`http://127.0.0.1:${sitePort}`+endpoint,{method,redirect:'manual',headers:{...(cookie?{Cookie:cookie}:{}),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
   let value;try{value=await r.json();}catch{value=null;}
   return {status:r.status,body:value,cookie:r.headers.get('set-cookie')?.split(';')[0]};
 };
 const start=async index=>{
   child=spawn(process.execPath,['server.cjs'],{cwd:path.join(__dirname,'..'),env:{...env,ASTRIS_DATA_DIR:dirs[index]},stdio:['ignore','pipe','pipe']});
   child.stderr.on('data',x=>errors+=String(x));
   for(let i=0;i<120;i++){try{const r=await api('/healthz');if(r.status===200)return;}catch{}if(child.exitCode!==null)break;await wait(50);}
   throw Error('Cloud test server did not start: '+errors.slice(-1400));
 };
 const stop=async()=>{if(child){child.kill();await wait(180);child=null;}};
 try{
   await start(0);
   assert.equal((await api('/api/status')).body.aiProvider,'groq-cloud');
   assert.equal((await api('/api/status')).body.persistentStore,true);
   assert.equal((await api('/api/auth/login','POST',{username:'operator',password:'operatoroperator'})).status,401);
   const op=await api('/api/auth/login','POST',{username:'operator',password:env.ASTRIS_OPERATOR_PASSWORD});
   assert.equal(op.status,200);
   const a6=await api('/api/auth/login','POST',{username:'astra6',password:'astra6astra6'});
   const a1=await api('/api/auth/login','POST',{username:'astra1',password:'astra1astra1'});
   assert.equal(a6.status,200);assert.equal(a1.status,200);
   assert.equal((await api('/api/crew/me','GET',undefined,a6.cookie)).body.checkins.length,7);
   assert.equal((await api('/api/crew/me','GET',undefined,a1.cookie)).body.checkins.length,0);
   assert.equal((await api('/api/operator/state','GET',undefined,a6.cookie)).status,403);
   assert.equal((await api('/api/crew/ai-status','GET',undefined,a6.cookie)).body.provider,'groq-cloud');
   const entry=await api('/api/crew/checkin','POST',{sleep:4.7,mood:2,notes:'Приватна нотатка тільки шостого профілю.'},a6.cookie);
   assert.equal(entry.status,201,JSON.stringify(entry.body));
   const result=await api('/api/crew/analyze','POST',{consent:true},a6.cookie);
   assert.equal(result.status,200,JSON.stringify(result.body));
   assert.equal(result.body.report.method,'groq-ai');
   assert.equal(result.body.report.usage.total_tokens,1360);
   assert.equal(result.body.report.diaryEntriesSent,8);
   assert.equal(calls.length,1);
   assert.equal(calls[0].model,'qwen/qwen3.8-27b');
   assert.equal(calls[0].messages.length,2);
   assert.match(calls[0].messages[1].content,/Приватна нотатка тільки шостого профілю/u);
   assert.doesNotMatch(calls[0].messages[1].content,/operatoroperator|astra1astra1/u);
   assert.equal((await api('/api/crew/analyze','POST',{consent:true},a6.cookie)).status,429);
   assert.equal((await api('/api/crew/me','GET',undefined,a1.cookie)).body.report,null);
   assert.equal((await api('/api/reports','GET',undefined,a6.cookie)).status,403);
   assert.ok(db.has('checkins'));
   assert.ok(db.has('analyses'));
   await stop();
   await start(1); // Brand-new filesystem: DB must be the only source of diaries/reports.
   const a6Again=await api('/api/auth/login','POST',{username:'astra6',password:'astra6astra6'});
   const revived=await api('/api/crew/me','GET',undefined,a6Again.cookie);
   assert.equal(revived.status,200);
   assert.equal(revived.body.checkins.length,8);
   assert.ok(revived.body.checkins.some(e=>e.notes.includes('Приватна нотатка')));
   assert.equal(revived.body.report.method,'groq-ai');
   assert.equal((await api('/api/reports','GET',undefined,(await api('/api/auth/login','POST',{username:'operator',password:env.ASTRIS_OPERATOR_PASSWORD})).cookie)).body.reports.length,8);
 }finally{
   await stop();
   await new Promise(resolve=>groq.close(resolve));
   await new Promise(resolve=>store.close(resolve));
   for(const dir of dirs)fs.rmSync(dir,{recursive:true,force:true});
 }
});
