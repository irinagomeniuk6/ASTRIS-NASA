(function(root){
  'use strict';
  const S=root.AstrisSensors||(typeof require==='function'?require('./sensor-config.js'):null);
  const DEFAULT={delayMinutes:0,variationMinutes:0,dropEvery:0};
  function prepare(s){
    if(!s.transport)s.transport={version:1,seq:0,config:{},counts:{},queue:[],records:[]};
    return s.transport;
  }
  function config(s,id){return {...DEFAULT,...prepare(s).config[id]};}
  function counts(s,id){const t=prepare(s);return t.counts[id]||(t.counts[id]={sent:0,received:0,dropped:0,reordered:0,stale:0,duplicates:0,latencies:[]});}
  function configure(s,id,draft){
    if(!s.histories[id])throw Error('Невідомий профіль');
    const c={...config(s,id),...draft};
    if(!Number.isFinite(c.delayMinutes)||c.delayMinutes<0||c.delayMinutes>30||!Number.isFinite(c.variationMinutes)||c.variationMinutes<0||c.variationMinutes>10||!Number.isInteger(c.dropEvery)||c.dropEvery<0||c.dropEvery===1||c.dropEvery>20)throw Error('Затримка 0–30 хв, варіація 0–10 хв; втрати: 0 або кожен 2–20 пакет.');
    prepare(s).config[id]=c;return c;
  }
  function send(s,id,packet){
    if(!s.histories[id]||!Number.isFinite(packet?.ts)||Math.abs(packet.ts)>8640000000000000||packet.ts>s.now)throw Error('Потрібні відомий профіль і коректний час вимірювання без майбутніх міток.');
    const t=prepare(s),c=config(s,id),n=counts(s,id);n.sent++;
    const envelope={id:++t.seq,crewId:id,packet:{...packet},measuredAt:packet.ts,sentAt:s.now,dueAt:s.now+(c.delayMinutes+[1,0,.5][(n.sent-1)%3]*c.variationMinutes)*60000};
    if(c.dropEvery&&n.sent%c.dropEvery===0){n.dropped++;t.records.unshift({...envelope,packet:undefined,status:'dropped',receivedAt:null});t.records=t.records.slice(0,240);return null;}
    t.queue.push(envelope);return envelope;
  }
  function flush(s){
    const t=prepare(s),ready=t.queue.filter(e=>e.dueAt<=s.now).sort((a,b)=>a.dueAt-b.dueAt||a.id-b.id),delivered=[];
    t.queue=t.queue.filter(e=>e.dueAt>s.now);
    for(const e of ready){
      const n=counts(s,e.crewId),h=s.histories[e.crewId],last=h.at(-1),reordered=Number.isFinite(last?.ts)&&e.measuredAt<last.ts,duplicate=h.some(p=>p.ts===e.measuredAt);
      const p={...e.packet,ts:e.measuredAt,measuredAt:e.measuredAt,sentAt:e.sentAt,receivedAt:s.now,packetId:e.id};
      const latencyMinutes=(s.now-e.sentAt)/60000,measurementAgeMinutes=(s.now-e.measuredAt)/60000;
      n.received++;n.reordered+=Number(reordered);n.duplicates+=Number(duplicate);n.latencies.push(latencyMinutes);n.latencies=n.latencies.slice(-100);
      const stale=S.KEYS.some(k=>S.inspect(p,k,s.now,S.get(s,k)).quality==='stale');n.stale+=Number(stale);
      if(duplicate){const index=h.findIndex(p=>p.ts===e.measuredAt);h[index]=p;}else h.push(p);
      h.sort((a,b)=>a.ts-b.ts);s.histories[e.crewId]=h.slice(-1440);
      t.records.unshift({id:e.id,crewId:e.crewId,measuredAt:e.measuredAt,sentAt:e.sentAt,dueAt:e.dueAt,receivedAt:s.now,latencyMinutes,measurementAgeMinutes,reordered,duplicate,stale,status:'received'});
      delivered.push({crewId:e.crewId,packet:p,isCurrent:s.histories[e.crewId].at(-1)===p});
    }
    t.records=t.records.slice(0,240);return delivered;
  }
  function summary(s,id){const t=prepare(s),n=counts(s,id),lat=n.latencies;return {...n,config:config(s,id),pending:t.queue.filter(e=>e.crewId===id).length,meanDelay:lat.length?lat.reduce((a,b)=>a+b,0)/lat.length:null,maxDelay:lat.length?Math.max(...lat):null,dropPercent:n.sent?100*n.dropped/n.sent:0,records:t.records.filter(e=>e.crewId===id).slice(0,12),simulation:true};}
  const api={prepare,config,configure,send,flush,summary};root.AstrisTransport=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
