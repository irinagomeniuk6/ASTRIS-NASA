'use strict';
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
const root=path.resolve(__dirname,'..');
test('astra6 gets seven recent fictional symptoms; Ollama sees ONLY their diary and manual records survive restarts',async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'astris-demo-week-'));
 const modelPort=await freePort();
 const aiRequests=[];
 const mock=http.createServer(async(req,res)=>{
   res.setHeader('Content-Type','application/json');
   if(req.url==='/api/tags')return res.end(JSON.stringify({models:[{name:'qwen3.5:4b'}]}));
   if(req.url==='/api/chat'){
     const chunks=[];for await(const ch of req)chunks.push(ch);
     aiRequests.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
     return res.end(JSON.stringify({model:'qwen3.5:4b',message:{role:'assistant',content:'Що змінилося: Протягом семи днів сон скоротився з 7,7 до 6,2 год, а в нотатках згадуються втома й головний біль; останній день має часткове покращення.\nЩо спробувати сьогодні: 1. Узгодьте стабільний час сну з графіком місії.\n2. Робіть короткі паузи між завданнями.\n3. Спробуйте спокійний період перед сном.\nЩо перевірити завтра: Порівняйте тривалість сну, втому та концентрацію з учорашніми записами.'},prompt_eval_count:210,eval_count:70}));
   }
   res.statusCode=404;res.end('{}');
 });
 await new Promise(resolve=>mock.listen(modelPort,'127.0.0.1',resolve));
 let child=null;
 let api=null;
 async function boot(){
   const port=await freePort();
   const base=`http://127.0.0.1:${port}`;
   child=spawn(process.execPath,['server.cjs'],{cwd:root,env:{...process.env,PORT:String(port),ASTRIS_DATA_DIR:tmp,ASTRIS_OLLAMA_URL:`http://127.0.0.1:${modelPort}`},stdio:['ignore','pipe','pipe']});
   let err='';child.stderr.on('data',x=>err+=String(x));
   api=async(url,method='GET',data=null,cookie='')=>{
     const res=await fetch(base+url,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});
     return {status:res.status,body:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};
   };
   for(let i=0;i<100;i++){
     if(child.exitCode!==null)throw Error('ASTRIS stopped: '+err);
     try{if((await api('/healthz')).status===200)return;}catch{}
     await pause(50);
   }
   throw Error('ASTRIS did not start: '+err);
 }
 async function stop(){if(child){child.kill();for(let i=0;i<50&&child.exitCode===null;i++)await pause(40);child=null;}}
 try{
   await boot();
   const login6=await api('/api/auth/login','POST',{username:'astra6',password:'astra6astra6'});
   const login5=await api('/api/auth/login','POST',{username:'astra5',password:'astra5astra5'});
   assert.equal(login6.status,200);assert.equal(login5.status,200);
   const mine=(await api('/api/crew/me','GET',null,login6.cookie)).body;
   const other=(await api('/api/crew/me','GET',null,login5.cookie)).body;
   assert.equal(mine.user.crewId,'a6');
   assert.equal(mine.crew.name,'Софія Реєс');
   assert.equal(mine.checkins.length,7);
   assert.equal(other.checkins.length,0,'no demo symptoms are shared with astra5');
   assert.ok(mine.checkins.every(x=>x.source==='demo-seed'&&x.crewId==='a6'));
   assert.ok(mine.checkins.some(x=>x.notes.includes('запаморочення')));
   const dates=mine.checkins.map(x=>x.at.slice(0,10));
   assert.equal(new Set(dates).size,7);
   assert.ok(mine.checkins.every(x=>Date.now()-Date.parse(x.at)<7*86400000));
   const report=await api('/api/crew/analyze','POST',{consent:true},login6.cookie);
   assert.equal(report.status,200,JSON.stringify(report.body));
   assert.equal(report.body.report.method,'ollama-ai');
   assert.match(report.body.report.summary,/Що спробувати сьогодні:/u);
   assert.match(report.body.report.summary,/спокійний період перед сном/u);
   assert.equal(report.body.report.diaryEntriesSent,7);
   assert.equal(aiRequests.length,1);
   const prompt=aiRequests[0].messages[1].content;
   const input=JSON.parse(prompt.slice(prompt.indexOf('{')));
   assert.equal(input.diaryWindowDays,30);
   assert.equal(input.diaryEntries.length,7);
   assert.equal(input.diaryEntries[0].sleepHours,7.7);
   assert.equal(input.diaryEntries[6].sleepHours,6.2);
   assert.match(prompt,/головний біль/iu);
   assert.match(prompt,/запаморочення/iu);
   assert.doesNotMatch(prompt,/astra5|astra5astra5/iu);
   const add=await api('/api/crew/checkin','POST',{sleep:7,mood:5,notes:'Мій ручний запис, його не можна перезаписати.'},login6.cookie);
   assert.equal(add.status,201);
   await stop();
   await boot();
   const again=await api('/api/auth/login','POST',{username:'astra6',password:'astra6astra6'});
   const repeated=(await api('/api/crew/me','GET',null,again.cookie)).body;
   assert.equal(repeated.checkins.filter(x=>x.source==='demo-seed').length,7,'no duplicated demo rows after restart');
   assert.equal(repeated.checkins.filter(x=>x.source==='crew-self-report').length,1,'manual checkin survives');
   assert.ok(repeated.checkins.some(x=>x.notes.includes('Мій ручний запис')));
 }finally{await stop();await new Promise(resolve=>mock.close(resolve));fs.rmSync(tmp,{recursive:true,force:true});}
});
