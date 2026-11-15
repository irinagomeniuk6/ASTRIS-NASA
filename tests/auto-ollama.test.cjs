'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net'),{spawn}=require('node:child_process');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const freePort=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
test('ASTRIS launches an installed Ollama CLI automatically without an extra terminal',async(t)=>{
 if(process.platform==='win32'){t.skip('Executable shebang mock is POSIX-only; Windows startup uses the installed Ollama CLI');return;}
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'astris-auto-ollama-'));
 const bin=path.join(root,'ollama');
 fs.writeFileSync(bin,`#!/usr/bin/env node
'use strict';
const http=require('node:http');
const addr=process.env.OLLAMA_HOST.split(':');
http.createServer(async(req,res)=>{
res.setHeader('Content-Type','application/json');
if(req.url==='/api/tags'){res.end(JSON.stringify({models:[{name:'qwen3.5:4b'}]}));return;}
if(req.url!=='/api/chat'){res.statusCode=404;res.end();return;}
let b='';for await(const v of req)b+=v;
const payload=JSON.parse(b);if(payload.model!=='qwen3.5:4b')throw Error('wrong model');
res.end(JSON.stringify({model:'qwen3.5:4b',message:{content:'Що змінилося: Дані симуляції оновлюються, а останній запис щоденника дозволяє відстежувати тенденції.\\nЩо спробувати сьогодні: 1. Збережіть регулярний час відпочинку.\\n2. Робіть короткі паузи між завданнями.\\n3. Записуйте сон і втому у щоденник.\\nЩо перевірити завтра: Порівняйте самопочуття та тривалість сну з попереднім днем.'}}));
}).listen(Number(addr[1]),'127.0.0.1');
`);
 fs.chmodSync(bin,0o755);
 const [port,ollamaPort]=await Promise.all([freePort(),freePort()]);
 const child=spawn(process.execPath,['server.cjs'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),ASTRIS_DATA_DIR:path.join(root,'data'),ASTRIS_OLLAMA_BIN:bin,ASTRIS_OLLAMA_PORT:String(ollamaPort),ASTRIS_OLLAMA_AUTO_START:'1'},stdio:['ignore','pipe','pipe']});
 let errors='';child.stderr.on('data',x=>errors+=String(x));
 const call=async(p,method='GET',body=null,cookie='')=>{const r=await fetch(`http://127.0.0.1:${port}`+p,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 try{
   let ready=false;for(let i=0;i<80;i++){try{if((await call('/healthz')).status===200){ready=true;break;}}catch{}await sleep(100);}assert.equal(ready,true,errors);
   let modelReady=false;let login;
   for(let i=0;i<80;i++){
     login=login||await call('/api/auth/login','POST',{username:'astra1',password:'astra1astra1'});
     const stat=await call('/api/crew/ai-status','GET',null,login.cookie);
     if(stat.body.modelReady){modelReady=true;break;}await sleep(100);
   }
   assert.equal(modelReady,true,'auto-started Ollama did not appear');
   const result=await call('/api/crew/analyze','POST',{consent:true},login.cookie);
   assert.equal(result.status,200);assert.equal(result.body.report.method,'ollama-ai');
 }finally{child.kill();await sleep(350);fs.rmSync(root,{recursive:true,force:true});if(errors)console.error(errors);}
});
