(function(root){
  'use strict';
  const S=root.AstrisSensors||(typeof require==='function'?require('./sensor-config.js'):null),A=root.AstrisAnalytics||(typeof require==='function'?require('./analytics.js'):null);
  function prepare(s){return s.leadtime||(s.leadtime={version:1,seq:0,channels:{},warnings:[],events:[]});}
  function inside(x,c){return (c.min===null||x>=c.min)&&(c.max===null||x<=c.max);}
  function observe(s){
    const l=prepare(s);
    for(const id of Object.keys(s.histories))for(const key of S.KEYS){
      const c=S.get(s,key),token=id+':'+key,{revision,...parameters}=c,signature=JSON.stringify(parameters);
      let channel=l.channels[token];
      if(!channel||channel.signature!==signature){
        for(const w of l.warnings)if(w.token===token&&w.status==='pending'){w.status='cancelled';w.reason='Параметри змінено';}
        channel=l.channels[token]={signature,last:null};
      }
      if(c.min===null&&c.max===null)continue;
      const q=A.analyze(s,id,key,Math.max(60,c.fitWindowMinutes)),p=s.histories[id].at(-1),read=S.inspect(p,key,s.now,c),previous=channel.last;
      const pending=l.warnings.filter(w=>w.token===token&&w.status==='pending');
      if(read.quality!=='good'){for(const w of pending)w.coverageBroken=true;channel.last=null;continue;}
      if(!previous||p.ts>previous.ts){
        const contiguous=previous&&p.ts-previous.ts<=c.maxGapSeconds*1000;
        for(const w of pending)if(!contiguous)w.coverageBroken=true;
        const direction=read.value<c.min&&c.min!==null?'lower':read.value>c.max&&c.max!==null?'upper':null;
        if(contiguous&&inside(previous.value,c)&&direction){
          const matching=pending.find(w=>w.direction===direction&&p.ts>w.measuredUntil&&p.ts<=w.expiresAt),event={id:++l.seq,crewId:id,key,ts:p.ts,detectedAt:s.now,value:read.value,direction,bound:direction==='upper'?c.max:c.min,warningId:matching?.id??null};
          if(matching){matching.status='confirmed';matching.actualTs=p.ts;matching.detectedAt=s.now;matching.actualValue=read.value;matching.leadMinutes=(p.ts-matching.issuedAt)/60000;matching.crossingErrorMinutes=(p.ts-matching.predictedCrossAt)/60000;}
          event.timelyWarning=!!matching&&matching.leadMinutes>0;l.events.unshift(event);
        }
        for(const w of pending)if(w.status==='pending'&&p.ts>=w.expiresAt){w.status=w.coverageBroken?'unverified':'not-confirmed';w.reason=w.coverageBroken?'У вікні були пропуски або застарілі дані':'Перетину в прогнозному вікні не спостерігалось';}
        channel.last={ts:p.ts,value:read.value};
      }
      const open=l.warnings.some(w=>w.token===token&&w.status==='pending');
      if(!open&&inside(read.value,c)&&q.forecast.eligible){
        const cross=q.forecast.points.find(p=>p.ts>s.now&&!inside(p.y,c));
        if(cross){const direction=c.max!==null&&cross.y>c.max?'upper':'lower';l.warnings.unshift({id:++l.seq,token,crewId:id,key,direction,bound:direction==='upper'?c.max:c.min,issuedAt:s.now,measuredUntil:p.ts,predictedCrossAt:cross.ts,predictedValue:cross.y,expiresAt:q.forecast.points.at(-1).ts,model:q.forecast.model.name,status:'pending',coverageBroken:false,leadMinutes:null});}
      }
    }
    l.warnings=l.warnings.slice(0,240);l.events=l.events.slice(0,240);return l;
  }
  function summary(s,id,key){const l=prepare(s),select=r=>(!id||r.crewId===id)&&(!key||r.key===key),warnings=l.warnings.filter(select),events=l.events.filter(select),confirmed=warnings.filter(w=>w.status==='confirmed'),leads=confirmed.map(w=>w.leadMinutes);return {warnings,events,confirmed:confirmed.length,pending:warnings.filter(w=>w.status==='pending').length,notConfirmed:warnings.filter(w=>w.status==='not-confirmed').length,unverified:warnings.filter(w=>w.status==='unverified').length,meanLead:leads.length?leads.reduce((a,b)=>a+b,0)/leads.length:null,timely:events.filter(e=>e.timelyWarning).length,withoutTimelyWarning:events.filter(e=>!e.timelyWarning).length};}
  const api={prepare,observe,summary};root.AstrisLeadtime=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
