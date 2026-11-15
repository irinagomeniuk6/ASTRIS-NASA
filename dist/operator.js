(function(root){
  'use strict';
  const E=root.AstrisEngine||(typeof require==='function'?require('./engine.js'):null);
  const TYPES=['hr','bp','spo2','temp','glucose'];
  function prepare(state){
    state.consoleRole='ground';state.crewReports=Array.isArray(state.crewReports)?state.crewReports:[];
    if(state.groundConsoleVersion!==1){
      for(const a of state.alerts||[])if(!a.resolvedAt&&['sleep','mood'].includes(a.metric)){a.resolvedAt=state.now;a.resolutionReason='Перехід до наземної консолі: старі поля самооцінки не є телеметрією з підтвердженим джерелом.';}
      state.groundConsoleVersion=1;
    }
    return state;
  }
  function validate(state,report){
    const member=E.CREW.find(c=>c.id===report?.crewId);
    if(!member||report.authorCrewId!==member.id)throw Error('Потрібний узгоджений ідентифікатор автора з екіпажу');
    if(typeof report.reportId!=='string'||!report.reportId.trim()||report.reportId.length>160)throw Error('Потрібний ідентифікатор повідомлення');
    if(!Number.isFinite(report.reportedAt)||!Number.isFinite(report.receivedAt)||Math.abs(report.reportedAt)>8640000000000000||Math.abs(report.receivedAt)>8640000000000000||report.reportedAt>report.receivedAt||report.receivedAt>state.now)throw Error('Перевірте час надсилання й отримання повідомлення');
    if(!['simulator','external-unverified'].includes(report.source))throw Error('Джерело повідомлення має бути позначене');
    const v=report.values||{};
    if(v.sleep!==undefined&&(!Number.isFinite(v.sleep)||v.sleep<0||v.sleep>24))throw Error('Тривалість сну має бути числом від 0 до 24 год');
    if(v.mood!==undefined&&(!Number.isInteger(v.mood)||v.mood<1||v.mood>5))throw Error('Шкала самопочуття — ціле число від 1 до 5');
    if(typeof report.text!=='string'||!report.text.trim()||report.text.length>1200)throw Error('Текст повідомлення обов’язковий, до 1200 символів');
    return {reportId:report.reportId,crewId:member.id,authorCrewId:member.id,authorName:member.name,reportedAt:report.reportedAt,receivedAt:report.receivedAt,source:report.source,values:{...(v.sleep!==undefined?{sleep:v.sleep}:{}),...(v.mood!==undefined?{mood:v.mood}:{})},text:report.text.trim(),identityVerified:false};
  }
  function receive(state,report){
    prepare(state);const valid=validate(state,report),existing=state.crewReports.find(p=>p.reportId===valid.reportId);if(existing)return existing;
    const record={...valid,id:++state.seq};state.crewReports.push(record);state.crewReports.sort((a,b)=>b.receivedAt-a.receivedAt||b.id-a.id);state.crewReports=state.crewReports.slice(0,100);
    E.log(state,'crew-report','Отримано '+(record.source==='simulator'?'демонстраційне ':'')+'повідомлення: '+record.authorName+'.');return record;
  }
  function simulate(state,crewId){
    prepare(state);const member=E.CREW.find(c=>c.id===crewId);if(!member)throw Error('Невідомий член екіпажу');
    return receive(state,{reportId:'demo-report-'+crewId+'-'+state.now+'-'+(state.seq+1),crewId,authorCrewId:crewId,reportedAt:state.now-120000,receivedAt:state.now,source:'simulator',values:{sleep:member.sleep,mood:member.mood},text:'Планове повідомлення екіпажу. Тривалість сну та самопочуття передано зі слів астронавта. Приклад для демонстрації наземної консолі.'});
  }
  function reports(state,crewId){prepare(state);return state.crewReports.filter(p=>p.crewId===crewId);}
  function telemetryMetrics(){return [...TYPES];}
  const api={prepare,validate,receive,simulate,reports,telemetryMetrics};root.AstrisOperator=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
