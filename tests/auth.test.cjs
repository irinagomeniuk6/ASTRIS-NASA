'use strict';
// Integration test: local authentication, restricted roles, crew isolation, check-ins.
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {spawn}=require('node:child_process');
const E=require('../dist/engine.js');const net=require('node:net');
function wait(ms){return new Promise(r=>setTimeout(r,ms));}
test('Local accounts, server role checks and per-astronaut data isolation',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'astris-auth-'));const port=30000+Math.floor(Math.random()*25000),base=`http://127.0.0.1:${port}`;
  const unused=net.createServer();await new Promise(resolve=>unused.listen(0,'127.0.0.1',resolve));const unusedPort=unused.address().port;await new Promise(resolve=>unused.close(resolve));
  const child=spawn(process.execPath,['server.cjs'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,PORT:String(port),ASTRIS_DATA_DIR:dir,ASTRIS_OLLAMA_URL:`http://127.0.0.1:${unusedPort}`},stdio:['ignore','pipe','pipe']});
  const response=async(url,{cookie='',method='GET',data=null,redirect='manual'}={})=>{
    const r=await fetch(base+url,{method,redirect,headers:{...(cookie?{Cookie:cookie}:{}),...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});
    let body=null;try{body=await r.json();}catch{}return {status:r.status,body,cookie:r.headers.get('set-cookie')?.split(';')[0],location:r.headers.get('location')};
  };
  try{
    let started=false;for(let i=0;i<75;i++){if(child.exitCode!==null)throw Error('Server exited');try{const r=await response('/api/status');if(r.status===200){started=true;break;}}catch{}await wait(40);}assert.equal(started,true,'server started');
    assert.equal((await response('/api/status')).body.setupRequired,false);
    assert.equal((await response('/index.html')).location,'/login.html');
    const setup=await response('/api/auth/login',{method:'POST',data:{username:'operator',password:'operatoroperator'}});assert.equal(setup.status,200);const operator=setup.cookie;assert.ok(operator?.startsWith('astris_session='));
    assert.equal((await response('/api/auth/setup',{method:'POST',data:{username:'evil',password:'A-Very-Safe-Password-123'}})).status,403);
    assert.equal((await response('/index.html',{cookie:operator})).status,200);
    const c=await response('/api/accounts',{cookie:operator,method:'POST',data:{crewId:'a2',username:'marcus',password:'Astro-Password-123'}});assert.equal(c.status,403);
    const login=await response('/api/auth/login',{method:'POST',data:{username:'astra2',password:'astra2astra2'}});assert.equal(login.status,200);const astronaut=login.cookie;
    assert.equal((await response('/accounts.html',{cookie:astronaut})).location,'/crew.html');
    assert.equal((await response('/index.html',{cookie:astronaut})).location,'/crew.html');
    assert.equal((await response('/api/accounts',{cookie:astronaut})).status,403);
    assert.equal((await response('/api/operator/state',{cookie:astronaut})).status,403);
    const snap={now:Date.now(),crew:E.CREW.map(c=>({id:c.id,history:[{ts:Date.now(),quality:'good',hr:c.id==='a2'?77:200,sys:115,dia:75,spo2:98,temp:36.6,glucose:99}],alerts:[]}))};
    assert.equal((await response('/api/telemetry',{method:'POST',cookie:astronaut,data:snap})).status,403);
    assert.equal((await response('/api/telemetry',{method:'POST',cookie:operator,data:snap})).status,200);
    const own=await response('/api/crew/me',{cookie:astronaut});assert.equal(own.status,200);assert.equal(own.body.user.crewId,'a2');assert.equal(own.body.history[0].hr,77);assert.equal(own.body.crew.name,E.CREW.find(c=>c.id==='a2').name);assert.equal(JSON.stringify(own.body).includes('"a1"'),false,'no other crew ID');assert.equal(JSON.stringify(own.body).includes('"hr":200'),false,'no other crew telemetry');
    assert.equal((await response('/api/crew/checkin',{cookie:operator,method:'POST',data:{sleep:7,mood:4}})).status,403);
    assert.equal((await response('/api/crew/checkin',{cookie:astronaut,method:'POST',data:{sleep:7.5,mood:4,notes:'Відпочинок'}})).status,201);
    assert.equal((await response('/api/crew/me',{cookie:astronaut})).body.checkins[0].sleep,7.5);
    assert.equal((await response('/api/reports',{cookie:astronaut})).status,403);
    assert.equal((await response('/api/reports',{cookie:operator})).body.reports[0].crewId,'a2');
    const saved={state:{version:1,histories:Object.fromEntries(E.CREW.map(c=>[c.id,[]])),alerts:[],log:[]},selected:'a1'};
    assert.equal((await response('/api/operator/state',{cookie:operator,method:'POST',data:saved})).status,200);
    assert.equal((await response('/api/operator/state',{cookie:operator})).body.saved.selected,'a1');
    // The astronaut receives the SAME mathematical forecast engine as Ground,
    // with data scoped to the astronaut's profile only.
    const full=E.create();
    const fullSaved={state:full,selected:'a2'};
    assert.equal((await response('/api/operator/state',{cookie:operator,method:'POST',data:fullSaved})).status,200);
    const telemetrySnapshot={now:full.now,running:true,speed:2000,crew:E.CREW.map(c=>({id:c.id,history:full.histories[c.id].slice(-80),alerts:[]}))};
    assert.equal((await response('/api/telemetry',{cookie:operator,method:'POST',data:telemetrySnapshot})).status,200);
    const q=await response('/api/crew/analysis?metric=hr&minutes=60&horizon=10',{cookie:astronaut});
    assert.equal(q.status,200,JSON.stringify(q.body));
    assert.equal(q.body.crewId,'a2');
    assert.equal(q.body.analyses.length,1);
    assert.equal(q.body.analyses[0].key,'hr');
    assert.equal(q.body.analyses[0].horizon,10);
    assert.equal(q.body.analyses[0].forecast.eligible,true);
    assert.ok(q.body.analyses[0].forecast.points.length>1);
    assert.equal(JSON.stringify(q.body).includes('Олена Коваль'),false);
    const many=await response('/api/crew/analysis?metric=all&minutes=60&horizon=5',{cookie:astronaut});
    assert.equal(many.status,200);
    assert.equal(many.body.analyses.length,6);
    assert.equal((await response('/api/crew/analysis?metric=hr&horizon=999',{cookie:astronaut})).status,400);
    assert.equal((await response('/api/crew/analysis?metric=hr',{cookie:operator})).status,403);
    assert.equal((await response('/api/crew/analyze',{cookie:operator,method:'POST',data:{consent:true}})).status,403);
    assert.equal((await response('/api/crew/analyze',{cookie:astronaut,method:'POST',data:{}})).status,400,'AI requires consent');
    const offline=await response('/api/crew/analyze',{cookie:astronaut,method:'POST',data:{consent:true}});
    assert.equal(offline.status,200,'Ollama outage must not block the demonstrator');
    assert.equal(offline.body.report.method,'local-statistical');
    assert.equal(offline.body.aiUnavailable,true);
    assert.equal((await response('/api/crew/analysis?metric=hr',{cookie:''})).status,401);
    assert.equal((await response('/api/crew/analyze',{cookie:'',method:'POST',data:{}})).status,401);
    assert.equal((await response('/crew.js',{cookie:astronaut})).status,200);
    assert.equal((await response('/crew.html',{cookie:operator})).location,'/index.html');
    assert.equal((await response('/api/auth/logout',{cookie:astronaut,method:'POST',data:{}})).status,200);
    assert.equal((await response('/api/crew/me',{cookie:astronaut})).status,401);
    assert.ok(fs.existsSync(path.join(dir,'accounts.json')));
    const raw=fs.readFileSync(path.join(dir,'accounts.json'),'utf8');assert.equal(raw.includes('operatoroperator'),false);assert.equal(raw.includes('astra2astra2'),false);assert.equal((await response('/api/accounts',{cookie:operator})).body.accounts.length,7);
  }finally{child.kill();await wait(60);fs.rmSync(dir,{recursive:true,force:true});}
});
