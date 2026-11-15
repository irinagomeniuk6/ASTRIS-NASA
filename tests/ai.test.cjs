'use strict';
// Integration test: real ASTRIS HTTP API + mocked native Ollama API.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const net=require('node:net');
const http=require('node:http');
const {spawn}=require('node:child_process');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const freePort=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const n=s.address().port;s.close(()=>resolve(n));});});
test('ASTRIS uses local Ollama Qwen, keeps profiles isolated, rejects unrelated text and records tokens',async()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'astris-ollama-'));
  const [port,modelPort]=await Promise.all([freePort(),freePort()]);
  const aiCalls=[];
  const model=http.createServer(async(req,res)=>{
    if(req.url==='/api/tags'){
      res.writeHead(200,{'Content-Type':'application/json'});
      res.end(JSON.stringify({models:[{name:'qwen3.5:4b'}]}));return;
    }
    if(req.url!=='/api/chat'){res.writeHead(404);return res.end();}
    const chunks=[];for await(const item of req)chunks.push(item);
    const body=JSON.parse(Buffer.concat(chunks).toString());aiCalls.push(body);
    const content=aiCalls.length===1?'### Copilot moved to a new app\nInstall the new Copilot app. Sign in.':aiCalls.length===2?'Спостереження: Є деякі синтетичні вимірювання.\nОбмеження: Це демонстрація.\nНаступні кроки: Зверніться до медика екіпажу.':'Що змінилося: За щоденником сон скоротився, але одного запису недостатньо для висновків.\nЩо спробувати сьогодні: 1. Заплануйте спокійний період перед відпочинком.\n2. Робіть короткі перерви між довгими завданнями.\n3. Відмічайте самопочуття у щоденнику.\nЩо перевірити завтра: Порівняйте тривалість сну та самопочуття з попередніми днями.';
    res.writeHead(200,{'Content-Type':'application/json'});
    res.end(JSON.stringify({model:'qwen3.5:4b',message:{role:'assistant',content},done:true,prompt_eval_count:220,eval_count:71}));
  });
  await new Promise(resolve=>model.listen(modelPort,'127.0.0.1',resolve));
  const child=spawn(process.execPath,['server.cjs'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,PORT:String(port),ASTRIS_DATA_DIR:tmp,ASTRIS_OLLAMA_URL:`http://127.0.0.1:${modelPort}`,ASTRIS_OLLAMA_MODEL:'qwen3.5:4b'},stdio:['ignore','pipe','pipe']});
  let errors='';child.stderr.on('data',x=>errors+=String(x));
  const req=async(endpoint,method='GET',data=null,cookie='')=>{
    const r=await fetch(`http://127.0.0.1:${port}`+endpoint,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined,redirect:'manual'});
    return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
  };
  try{
    let ready=false;
    for(let i=0;i<100;i++){try{if((await req('/healthz')).status===200){ready=true;break;}}catch{}await pause(50);}
    assert.equal(ready,true,errors);
    const op=await req('/api/auth/login','POST',{username:'operator',password:'operatoroperator'});
    const first=await req('/api/auth/login','POST',{username:'astra1',password:'astra1astra1'});
    const second=await req('/api/auth/login','POST',{username:'astra2',password:'astra2astra2'});
    assert.equal(op.status,200);assert.equal(first.status,200);assert.equal(second.status,200);
    assert.equal((await req('/api/status')).body.aiProvider,'ollama-local');
    assert.equal((await req('/api/crew/ai-status','GET',null,op.cookie)).status,403);
    const health=await req('/api/crew/ai-status','GET',null,first.cookie);
    assert.equal(health.status,200);assert.equal(health.body.modelReady,true);
    await req('/api/crew/checkin','POST',{sleep:7.5,mood:4,notes:'Особистий тестовий запис першого.'},first.cookie);
    await req('/api/crew/checkin','POST',{sleep:4.5,mood:2,notes:'Приватний запис другого.'},second.cookie);
    assert.equal((await req('/api/crew/analyze','POST',{consent:false},first.cookie)).status,400);
    assert.equal((await req('/api/crew/analyze','POST',{consent:true},op.cookie)).status,403);
    const bad=await req('/api/crew/analyze','POST',{consent:true},first.cookie);
    assert.equal(bad.status,200);assert.equal(bad.body.aiUnavailable,true);assert.equal(bad.body.report.method,'local-statistical');
    assert.match(bad.body.report.summary,/Що спробувати сьогодні:/u);
    assert.match(bad.body.report.summary,/відпочинок|відпочинк|плануйте/u);
    assert.doesNotMatch(bad.body.report.summary,/copilot/iu);
    const generic=await req('/api/crew/analyze','POST',{consent:true},first.cookie);
    assert.equal(generic.status,200);
    assert.equal(generic.body.aiUnavailable,true,'Old generic reports should not be accepted as new wellness guidance');
    assert.match(generic.body.report.summary,/Що спробувати сьогодні:/u);
    const good=await req('/api/crew/analyze','POST',{consent:true},first.cookie);
    assert.equal(good.status,200,JSON.stringify(good.body));assert.equal(good.body.report.method,'ollama-ai');
    assert.match(good.body.report.summary,/Що спробувати сьогодні:/u);
    assert.match(good.body.report.summary,/перерви/u);
    assert.equal(good.body.report.model,'qwen3.5:4b');assert.equal(good.body.report.usage.total_tokens,291);
    assert.equal(aiCalls.length,3);assert.equal(aiCalls[2].model,'qwen3.5:4b');assert.equal(aiCalls[2].stream,false);assert.equal(aiCalls[2].think,false);
    assert.equal(aiCalls[2].provider,undefined);assert.equal(aiCalls[2].messages.length,2);
    assert.match(aiCalls[2].messages[0].content,/3–4 ПРАКТИЧНІ/u);
    assert.match(aiCalls[2].messages[0].content,/не обмежуйся переказом цифр/iu);
    assert.match(aiCalls[2].messages[0].content,/НЕ вигадуй числові оцінки втоми чи болю/iu);
    assert.doesNotMatch(aiCalls[2].messages[0].content,/наступні кроки — лише перевірка/iu);
    const prompt=aiCalls[2].messages[1].content;
    assert.match(prompt,/Особистий тестовий запис першого/);assert.doesNotMatch(prompt,/Приватний запис другого/);
    assert.doesNotMatch(prompt,/astra1/);assert.doesNotMatch(prompt,/operatoroperator/);
    const input=JSON.parse(prompt.slice(prompt.indexOf('{')));
    assert.equal(input.sampleWindowSeconds,30);assert.equal(input.diaryWindowDays,30);
    assert.equal(input.predictions.length,6);assert.ok(input.trendHistoryLast30MissionMinutes.length>=2);
    assert.equal((await req('/api/crew/analyze','POST',{consent:true},first.cookie)).status,429);
    assert.equal((await req('/api/crew/me','GET',null,second.cookie)).body.report,null);
    assert.equal((await req('/api/crew/me','GET',null,first.cookie)).body.report.method,'ollama-ai');
    const stored=fs.readFileSync(path.join(tmp,'crew-analyses.json'),'utf8');
    assert.equal(stored.includes('Особистий тестовий запис першого'),false);
    assert.equal(stored.includes('astra1astra1'),false);
  }finally{child.kill();await pause(120);model.close();fs.rmSync(tmp,{recursive:true,force:true});if(errors)console.error(errors);}
});
