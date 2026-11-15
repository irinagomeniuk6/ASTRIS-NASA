'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const E=require('../dist/engine.js');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('Server advances the mission while Ground is closed; Crew and Ground see the identical clock',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'astris-live-'));
 const port=30000+Math.floor(Math.random()*25000),base='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,['server.cjs'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,PORT:String(port),ASTRIS_DATA_DIR:dir},stdio:['ignore','pipe','pipe']});
 let stderr='';child.stderr.on('data',x=>stderr+=x.toString());
 const request=async(url, cookie='',method='GET',payload)=>{
   const res=await fetch(base+url,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(payload?{'Content-Type':'application/json'}:{})},body:payload?JSON.stringify(payload):undefined});
   let body;try{body=await res.json();}catch{body=null;}
   return {status:res.status,body,cookie:res.headers.get('set-cookie')?.split(';')[0]};
 };
 try{
   let started=false;for(let i=0;i<75;i++){try{if((await request('/api/status')).status===200){started=true;break;}}catch{}await pause(45);}
   assert.ok(started,'server starts');
   const setup=await request('/api/auth/login','','POST',{username:'operator',password:'operatoroperator'});assert.equal(setup.status,200);
   const operator=setup.cookie;
   const create=await request('/api/accounts',operator,'POST',{crewId:'a1',username:'elena',password:'AnotherPassword2026'});assert.equal(create.status,403);
   const login=await request('/api/auth/login','','POST',{username:'astra1',password:'astra1astra1'});assert.equal(login.status,200);
   const astronaut=login.cookie;
   const state=E.create(),now=state.now;
   const saved=await request('/api/operator/state',operator,'POST',{state,selected:'a1',running:true,speed:500});
   assert.equal(saved.status,200,JSON.stringify(saved.body));
   // No GET to /index.html or browser-generated telemetry is sent after this point.
   await pause(1470);
   const crew=await request('/api/crew/me',astronaut);
   assert.equal(crew.status,200);assert.ok(crew.body.missionTime>=now+60000,'clock advanced without Ground browser');
   assert.ok(Date.now()-crew.body.receivedAt<2500,'Crew heartbeat is up to date');
   const ground=await request('/api/operator/state',operator);
   assert.equal(ground.body.saved.state.now,crew.body.missionTime,'both views use one shared state');
   assert.equal(ground.body.saved.state.histories.a1.at(-1).hr,crew.body.history.at(-1).hr,'same last reading');
   const frozen=await request('/api/operator/state',operator,'POST',{...ground.body.saved,running:false,speed:500});
   assert.equal(frozen.status,200);
   const pausedAt=(await request('/api/crew/me',astronaut)).body.missionTime;
   await pause(1000);
   assert.equal((await request('/api/crew/me',astronaut)).body.missionTime,pausedAt,'pause stops mission time');
   const resumeState=(await request('/api/operator/state',operator)).body.saved;
   assert.equal((await request('/api/operator/state',operator,'POST',{...resumeState,running:true,speed:500})).status,200);
   await pause(800);
   assert.ok((await request('/api/crew/me',astronaut)).body.missionTime>pausedAt,'resume restarts server ticking');
   assert.equal((await request('/api/operator/state',astronaut)).status,403,'crew cannot fetch mission state');
 } finally {child.kill();await pause(80);fs.rmSync(dir,{recursive:true,force:true});if(stderr)console.error('Server output:',stderr);}
});
