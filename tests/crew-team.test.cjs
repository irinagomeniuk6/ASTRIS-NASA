'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const net=require('node:net');
const {spawn}=require('node:child_process');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const freePort=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const n=s.address().port;s.close(()=>resolve(n));});});
const root=path.resolve(__dirname,'..');
const forbidden=['history','checkins','forecast','alerts','report','analyses','username','passwordHash','salt','sessions','diaryEntries','notes','sleep','mood'];

test('Crew team exposes only current readings for five other astronauts and stays live',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'astris-crew-team-'));
 const port=await freePort(),base=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,['server.cjs'],{
   cwd:root,env:{...process.env,PORT:String(port),ASTRIS_DATA_DIR:dir,ASTRIS_OLLAMA_AUTO_START:'0'},stdio:['ignore','pipe','pipe']
 });
 let stderr='';child.stderr.on('data',x=>stderr+=String(x));
 async function req(route,cookie='',method='GET',payload){
   const res=await fetch(base+route,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(payload?{'Content-Type':'application/json'}:{})},body:payload?JSON.stringify(payload):undefined});
   const body=await res.json();return {status:res.status,body,cookie:res.headers.get('set-cookie')?.split(';')[0]};
 }
 try{
   let ready=false;
   for(let i=0;i<100;i++){
     if(child.exitCode!==null)throw Error('Server exited: '+stderr);
     try{if((await req('/healthz')).status===200){ready=true;break;}}catch{}
     await pause(45);
   }
   assert.ok(ready,'server started');
   assert.equal((await req('/api/crew/team')).status,401,'anonymous team access forbidden');
   const op=(await req('/api/auth/login','','POST',{username:'operator',password:'operatoroperator'}));
   assert.equal(op.status,200);
   assert.equal((await req('/api/crew/team',op.cookie)).status,403,'operator role does not use crew API');
   const cookies=[];
   for(let i=1;i<=6;i++){
     const login=await req('/api/auth/login','','POST',{username:'astra'+i,password:`astra${i}astra${i}`});
     assert.equal(login.status,200);
     cookies[i]=login.cookie;
     const team=await req('/api/crew/team',cookies[i]);
     assert.equal(team.status,200);
     assert.equal(team.body.members.length,5);
     assert.equal(new Set(team.body.members.map(c=>c.id)).size,5);
     assert.ok(!team.body.members.some(x=>x.id==='a'+i),'viewer is excluded');
     assert.equal(Object.keys(team.body).sort().join(','),'members,missionTime,receivedAt,running');
     for(const member of team.body.members){
       assert.deepEqual(Object.keys(member).sort(),['ageSeconds','id','name','quality','role','sampleAt','values'].sort());
       assert.deepEqual(Object.keys(member.values).sort(),['hr','sys','dia','spo2','temp','glucose'].sort());
       assert.ok(member.values.hr===null||Number.isFinite(member.values.hr));
       assert.ok(member.values.sys===null||Number.isFinite(member.values.sys));
       for(const field of forbidden)assert.ok(!(field in member),`No ${field} in public crew object`);
     }
     const wire=JSON.stringify(team.body);
     for(const secret of ['demo-astra6-','головний біль','запаморочення','sleepHours','forecast','checkins','history']){
       assert.ok(!wire.includes(secret),'No diary/forecast/history string: '+secret);
     }
   }
   // The astronaut cannot bypass the projection by supplying a different crewId.
   const asA1=(await req('/api/crew/team?crewId=a1',cookies[1])).body;
   assert.equal(asA1.members.length,5);
   assert.ok(!asA1.members.some(x=>x.id==='a1'));
   assert.equal((await req('/api/crew/analysis?crewId=a6&metric=hr&minutes=30&horizon=5',cookies[1])).body.crewId,'a1','forecast remains self-only');
   const ground=await req('/api/operator/state',op.cookie);
   assert.equal(ground.status,200);
   const crewTeam=await req('/api/crew/team',cookies[1]);
   assert.equal(crewTeam.body.missionTime,ground.body.saved.state.now);
   for(const other of crewTeam.body.members){
     const point=ground.body.saved.state.histories[other.id].at(-1);
     if(other.quality==='good')for(const key of Object.keys(other.values))assert.equal(other.values[key],point[key]);
   }
   const start=crewTeam.body.missionTime;
   await pause(2350);
   const after=await req('/api/crew/team',cookies[1]);
   assert.ok(after.body.missionTime>start,'team gets updated mission time with no browser action');
   assert.equal(after.body.members.length,5);
   const ownDiary=await req('/api/crew/me',cookies[6]);
   assert.equal(ownDiary.body.checkins.length,7,'astra6 demo diary preserved');
   const otherDiary=await req('/api/crew/me',cookies[1]);
   assert.equal(otherDiary.body.checkins.length,0,'astra1 cannot access astra6 diary through own profile');
   assert.equal((await req('/api/operator/state',cookies[1])).status,403);
   assert.equal((await req('/api/reports',cookies[1])).status,403);
   assert.equal((await req('/api/crew/team',cookies[1],'POST',{crewId:'a6'})).status,404,'team is read-only');
 }finally{
   child.kill();for(let i=0;i<40&&child.exitCode===null;i++)await pause(50);
   fs.rmSync(dir,{recursive:true,force:true});
   if(stderr)console.error('ASTRIS team test stderr:',stderr);
 }
});
