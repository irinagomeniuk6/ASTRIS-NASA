(function(root){
  'use strict';
  const S=root.AstrisSensors||(typeof require==='function'?require('./sensor-config.js'):null),KEYS=S.KEYS,FLOORS=Object.fromEntries(KEYS.map(k=>[k,0]));
  const R=root.AstrisResearch||(typeof require==='function'?require('./research.js'):null);
  const F=root.AstrisForecast||(typeof require==='function'?require('./forecast.js'):null);
  const val=(p,k)=>S.value(p,k),valid=(p,k)=>S.inspect(p,k,p?.ts,S.defaults(k)).quality==='good';
  const mean=v=>{if(!v.length)return null;if(v.every(x=>x===v[0]))return v[0];const m=v.reduce((sum,x)=>sum+x/v.length,0);return Number.isFinite(m)?m:null;};
  function sd(v){if(v.length<2)return null;const m=mean(v);if(m===null)return null;const scale=Math.max(...v.map(x=>Math.abs(x-m)));if(scale===0)return 0;if(!Number.isFinite(scale))return null;const result=scale*Math.sqrt(v.reduce((sum,x)=>sum+((x-m)/scale)**2,0)/(v.length-1));return Number.isFinite(result)?result:null;}
  function fit(points,minPoints=3,minSpan=5){return R.linearFit(points,minPoints,minSpan);}
  function historyPackets(history,key,now,c){
    const map=new Map(),issues={invalidTimestamp:0,future:0,duplicates:0};
    for(const p of history||[]){if(!Number.isFinite(p?.ts)||Math.abs(p.ts)>8640000000000000){issues.invalidTimestamp++;continue;}if(p.ts>now){issues.future++;continue;}if(map.has(p.ts))issues.duplicates++;map.set(p.ts,p);}
    return {packets:[...map.values()].sort((a,b)=>a.ts-b.ts),issues};
  }
  function references(state){
    S.prepare(state);state.references=state.references||{};
    for(const id of Object.keys(state.histories)){
      state.references[id]=state.references[id]||{};
      for(const key of KEYS){const old=state.references[id][key];if(old?.n>=3&&Number.isFinite(old.mean)&&Number.isFinite(old.sd))continue;
        const c=S.get(state,key),packets=historyPackets(state.histories[id],key,state.now,c).packets.filter(p=>S.inspect(p,key,p.ts,c).quality==='good').slice(0,30),v=packets.map(p=>val(p,key));
        state.references[id][key]={n:v.length,mean:mean(v),sd:sd(v),from:packets[0]?.ts??null,to:packets.at(-1)?.ts??null};
      }
    }return state.references;
  }
  function analyze(state,id,key,minutes=60,options={}){
    if(!KEYS.includes(key))key='hr';references(state);const c=S.get(state,key),normalized=historyPackets(state.histories[id],key,state.now,c),all=normalized.packets;
    const from=Math.max(all[0]?.ts??state.now-minutes*60000,state.now-minutes*60000),packets=all.filter(p=>p.ts>=from),step=c.expectedIntervalSeconds*1000,expected=Math.floor((state.now-from)/step)+1;
    const rawBase=state.references[id][key],scale=Number.isFinite(rawBase.sd)?Math.max(rawBase.sd,c.sigmaFloor):null,baseline={...rawBase,scale,floor:c.sigmaFloor};
    const zOf=x=>baseline.n>=3&&scale>0?(x-baseline.mean)/scale:null;
    const series=[],points=[],sma=[],ewma=[],anomalies=[],bins=new Set(),issues={...normalized.issues,invalid:0,missing:0};let previousTs=null,rolling=[],smooth=null;
    for(const packet of packets){
      if(previousTs!==null&&packet.ts-previousTs>c.maxGapSeconds*1000){const gap={ts:previousTs+step,y:null,quality:'gap'};series.push(gap);sma.push({...gap});ewma.push({...gap});rolling=[];smooth=null;}
      const read=S.inspect(packet,key,packet.ts,c);previousTs=packet.ts;
      if(read.quality!=='good'){issues[read.quality==='missing'?'missing':'invalid']++;const p={ts:packet.ts,y:null,quality:read.quality};series.push(p);sma.push({...p});ewma.push({...p});rolling=[];smooth=null;continue;}
      const point={ts:packet.ts,t:(packet.ts-from)/60000,y:read.value,quality:'good',z:zOf(read.value)};points.push(point);series.push(point);bins.add(Math.min(expected-1,Math.round((packet.ts-from)/step)));
      rolling.push(point.y);if(rolling.length>c.movingAveragePoints)rolling.shift();sma.push({ts:point.ts,y:rolling.length===c.movingAveragePoints?mean(rolling):null});smooth=smooth===null?point.y:.2*point.y+.8*smooth;ewma.push({ts:point.ts,y:smooth});
      if(point.z!==null&&Math.abs(point.z)>=c.sigmaThreshold)anomalies.push({...point,reason:`|z| = ${Math.abs(point.z).toFixed(2)} ≥ ${c.sigmaThreshold}; z = (x − μ) / σеф`});
    }
    const last=all.at(-1),received=state.histories[id]?.at(-1),invalidReceivedTime=received&&(!Number.isFinite(received.ts)||Math.abs(received.ts)>8640000000000000||received.ts>state.now),read=S.inspect(invalidReceivedTime?received:last,key,state.now,c),current=read.quality==='good'?read.value:null,z=current===null?null:zOf(current),values=points.map(p=>p.y),lastValid=[...all].reverse().find(p=>S.inspect(p,key,p.ts,c).quality==='good');
    const lastIndex=series.findIndex(p=>p.ts===last?.ts),previous=series[lastIndex-1];let rate=null;
    if(current!==null&&Number.isFinite(previous?.y)&&last.ts>previous.ts&&(last.ts-previous.ts)/1000<=c.maxGapSeconds){const dt=(last.ts-previous.ts)/60000;rate={value:(current-previous.y)/dt,fromValue:previous.y,toValue:current,fromTs:previous.ts,toTs:last.ts,dtSeconds:dt*60};}
    const train=[];for(let i=series.length-1;i>=0;i--){const p=series[i];if(p.y===null||p.ts<state.now-c.fitWindowMinutes*60000)break;train.unshift(p);}
    const regression=fit(train,3,c.minFitSpanMinutes),span=train.length?(train.at(-1).ts-train[0].ts)/60000:0,trainExpected=train.length?Math.floor((train.at(-1).ts-train[0].ts)/step)+1:0,trainBins=new Set(train.map(p=>Math.round((p.ts-(train[0]?.ts||0))/step)));
    const trainCoverage=trainExpected?Math.min(1,trainBins.size/trainExpected):0;
    let reason=null;if(current===null)reason=read.reason;else if(train.length<c.minFitPoints)reason=`Потрібні ${c.minFitPoints} послідовних валідних точок`;else if(span<c.minFitSpanMinutes)reason=`Потрібно ≥${c.minFitSpanMinutes} хв актуальної історії`;else if(trainCoverage<c.minCoverage)reason=`Повнота навчального вікна нижча за ${c.minCoverage*100}%`;else if(!regression)reason='Недостатня варіація часових міток';
    const adaptiveRows=all.filter(p=>p.ts>=state.now-Math.max(c.forecastLookbackMinutes,c.fitWindowMinutes)*60000).map(p=>{const r=S.inspect(p,key,p.ts,c);return {ts:p.ts,y:r.quality==='good'?r.value:null};});
    const forecast=reason===null?{...F.adaptiveForecast(adaptiveRows,c,state.now),coverage:trainCoverage*100}:{eligible:false,reason,n:train.length,spanMinutes:span,coverage:trainCoverage*100,horizonMinutes:c.forecastMinutes,points:[],model:null,selection:null,trend:null,validation:null,interval:{assumptionsVerified:false,method:'unavailable'}};
    const warnings=[],add=(type,title,equation,detail)=>warnings.push({type,title,equation,detail,configRevision:c.revision||0});
    if(current===null)add('quality','Поточний сигнал недоступний','Якість + часова мітка + TTL',read.reason);
    if(current!==null){
      if(c.min!==null&&current<c.min)add('bounds','Нижче налаштованої межі',`${current} < ${c.min} ${c.unit}`,'Межу задано користувачем; це не норматив безпеки.');
      if(c.max!==null&&current>c.max)add('bounds','Вище налаштованої межі',`${current} > ${c.max} ${c.unit}`,'Межу задано користувачем; це не норматив безпеки.');
      if(z!==null&&Math.abs(z)>=c.sigmaThreshold)add('anomaly','Статистична аномалія',`z = (${current} − ${baseline.mean.toFixed(3)}) / ${scale.toFixed(3)} = ${z.toFixed(3)}; |z| ≥ ${c.sigmaThreshold}`,'Порівняння з зафіксованою особистою базою.');
      if(rate&&c.maxRate!==null&&Math.abs(rate.value)>c.maxRate)add('rate','Швидка зміна показника',`v = (${rate.toValue} − ${rate.fromValue}) / ${(rate.dtSeconds/60).toFixed(3)} = ${rate.value.toFixed(3)} ${c.unit}/хв; |v| > ${c.maxRate}`,`Пара часових міток: ${new Date(rate.fromTs).toISOString()} → ${new Date(rate.toTs).toISOString()}.`);
      if(regression&&c.maxRate!==null&&Math.abs(regression.slope)>c.maxRate)add('trend','Стійкий швидкий тренд',`β = ${regression.slope.toFixed(3)} ${c.unit}/хв; |β| > ${c.maxRate}`,`МНК, ${regression.n} точок за ${regression.spanMinutes.toFixed(1)} хв, R² = ${regression.r2===null?'не визначено':regression.r2.toFixed(3)}.`);
      const currentlyInside=(c.min===null||current>=c.min)&&(c.max===null||current<=c.max),cross=currentlyInside?forecast.points.find(p=>p.ts>state.now&&((c.min!==null&&p.y<c.min)||(c.max!==null&&p.y>c.max))):null;
      if(cross)add('forecast','Прогноз виходить за задану межу',`${forecast.model.name}; через ${(cross.ts-state.now)/60000} хв: ŷ = ${cross.y.toFixed(3)} ${c.unit}`,`${forecast.model.equation}. ${forecast.selection.reason} Дослідницький прогноз, не сертифікований сигнал безпеки.`);
    }
    const result={key,config:c,minutes,from,to:state.now,points,packets,series,baseline,current,lastKnownValue:lastValid?val(lastValid,key):null,lastValidTs:lastValid?.ts??null,latestTs:invalidReceivedTime?(Number.isFinite(received.ts)?received.ts:null):last?.ts??null,quality:read.quality,qualityReason:read.reason,ageSeconds:read.ageSeconds??null,n:values.length,expected,validBins:bins.size,coverage:expected?Math.min(100,bins.size/expected*100):0,issues,mean:mean(values),sd:sd(values),min:values.length?Math.min(...values):null,max:values.length?Math.max(...values):null,z,fit:regression,rate,sma,ewma,alpha:.2,anomalies,forecast,warnings};result.pattern=R.pattern(result,researchConfig(state).persistencePoints);return result;
  }
  const researchDefaults={pairToleranceSeconds:0,minPairs:8,minCoverage:.8,coincidenceSeconds:60,minConcurrent:2,persistencePoints:3,revision:0};
  function researchConfig(state){state.researchSettings={...researchDefaults,...state.researchSettings};return state.researchSettings;}
  function configureResearch(state,draft){const c={...researchConfig(state)};for(const k of Object.keys(researchDefaults).filter(k=>k!=='revision'))if(k in draft){c[k]=Number(draft[k]);if(!Number.isFinite(c[k]))throw Error('Параметри мають бути скінченними числами');}
    if(c.pairToleranceSeconds<0||c.pairToleranceSeconds>Math.min(...KEYS.map(k=>S.get(state,k).expectedIntervalSeconds))/2||!Number.isInteger(c.minPairs)||c.minPairs<3||c.minPairs>200||c.minCoverage<=0||c.minCoverage>1||c.coincidenceSeconds<0||c.coincidenceSeconds>600||!Number.isInteger(c.minConcurrent)||c.minConcurrent<2||c.minConcurrent>KEYS.length||!Number.isInteger(c.persistencePoints)||c.persistencePoints<3||c.persistencePoints>10)throw Error('Перевірте допуск часу, повноту та мінімальну кількість точок/каналів');
    c.revision++;state.researchSettings=c;state.log.unshift({id:++state.seq,ts:state.now,type:'action',message:'Користувач змінив дослідницькі правила порівняння та одночасності.'});state.log=state.log.slice(0,150);for(const a of state.alerts)if(a.origin==='joint'&&!a.resolvedAt){a.resolvedAt=state.now;a.resolutionReason='Користувач змінив правило одночасності; потрібна нова оцінка.';}return c;
  }
  function compare(state,id,keyA,keyB,minutes=60){const c=researchConfig(state),a=analyze(state,id,keyA,minutes),b=analyze(state,id,keyB,minutes);let result;try{result=R.compare(a,b,{toleranceSeconds:c.pairToleranceSeconds,minPairs:c.minPairs,minCoverage:c.minCoverage});}catch(error){result={eligible:false,reason:error.message,pairs:[],n:0,levelR:null,changeR:null,coverage:0,changesN:0};}return {...result,a,b,group:R.coincidence(KEYS.map(k=>k===a.key?a:k===b.key?b:analyze(state,id,k,minutes)),c)};}
  function sourceSummary(state,id){const channels=KEYS.map(k=>analyze(state,id,k,60));return {channels,good:channels.filter(q=>q.quality==='good').length,total:KEYS.length,lastValidTs:channels.map(q=>q.lastValidTs).filter(Number.isFinite).sort((a,b)=>b-a)[0]??null,localProcessing:true,technicalChannels:[],hardwareHealth:'not assessed',groundLink:'local delivery simulation only',delivery:root.AstrisTransport?root.AstrisTransport.summary(state,id):null};}
  function syncJoint(state,byCrew){
    const c=researchConfig(state);
    for(const [crewId,qs] of byCrew){const group=R.coincidence(qs,c),active=state.alerts.find(a=>a.origin==='joint'&&a.crewId===crewId&&!a.resolvedAt);
      if(group.active){const members=group.members,equation=members.map(p=>S.TYPES[p.key].name+': |z|='+Math.abs(p.z).toFixed(3)+' ≥ '+p.threshold).join('; ')+'; Δt='+group.spreadSeconds.toFixed(1)+' с ≤ '+c.coincidenceSeconds+' с',evidence={type:'joint',equation,detail:'Одночасні статистичні відхилення у валідних фізіологічних каналах. Причину не встановлено; технічних даних скафандра немає.',members,config:{...c},ts:state.now};
        if(active){active.lastSeen=state.now;active.lastValue='Каналів: '+members.length;active.evidence=evidence;active.evidenceUnavailable=false;}
        else{state.alerts.unshift({id:++state.seq,crewId,metric:'sensor',origin:'joint',severity:'warning',title:'Одночасні відхилення кількох каналів',ts:state.now,lastSeen:state.now,lastValue:members.length+' каналів',acknowledgedAt:null,resolvedAt:null,evidence});state.log.unshift({id:++state.seq,ts:state.now,type:'alert',message:'Спільний дослідницький сигнал: '+members.map(p=>S.TYPES[p.key].name).join(', ')+'.'});}
      }else if(active){const previous=(active.evidence?.members||[]).map(p=>qs.find(q=>q.key===p.key)),timestamps=previous.map(q=>q?.latestTs);if(previous.some(q=>!q||q.quality!=='good'||q.z===null)||Math.max(...timestamps)-Math.min(...timestamps)>c.coincidenceSeconds*1000){active.evidenceUnavailable=true;continue;}active.resolvedAt=state.now;active.resolutionReason='На нових синхронізованих валідних даних одночасність за правилом більше не спостерігається.';state.log.unshift({id:++state.seq,ts:state.now,type:'recovery',message:'Завершено спільний статистичний сигнал.'});}
    }
  }
  function sync(state){
    S.prepare(state);const candidates=new Map(),qualities=new Map(),byCrew=new Map();
    for(const crewId of Object.keys(state.histories))for(const key of KEYS){const q=analyze(state,crewId,key,Math.max(60,S.get(state,key).fitWindowMinutes));if(!byCrew.has(crewId))byCrew.set(crewId,[]);byCrew.get(crewId).push(q);qualities.set(crewId+':'+key,{quality:q.quality,reason:q.qualityReason,anomaly:q.z!==null,rate:!!q.rate,trend:!!q.fit,forecast:q.forecast.eligible,config:q.config});for(const warning of q.warnings){if(warning.type==='bounds')continue;if(warning.type==='quality'&&['offline','invalid'].includes(state.histories[crewId].at(-1)?.quality))continue;const id=crewId+':'+key+':'+warning.type;candidates.set(id,{crewId,key,q,warning});}}
    for(const a of state.alerts.filter(a=>a.origin==='analysis'&&!a.resolvedAt)){
      if(candidates.has(a.ruleId))continue;const availability=qualities.get(a.crewId+':'+a.metric),disabled=availability&&((['rate','trend'].includes(a.analysisType)&&availability.config.maxRate===null)||(a.analysisType==='forecast'&&availability.config.min===null&&availability.config.max===null));if(a.analysisType==='quality'&&availability&&availability.quality!=='good'){a.evidenceUnavailable=true;a.lastSeen=state.now;if(a.evidence)a.evidence.detail=availability.reason;continue;}if(!disabled&&a.analysisType!=='quality'&&(!availability||availability.quality!=='good'||!availability[a.analysisType])){a.evidenceUnavailable=true;continue;}
      a.resolvedAt=state.now;a.resolutionReason=disabled?'Користувач вимкнув відповідне правило.':'За новими валідними даними умова сигналу більше не спостерігається.';state.log.unshift({id:++state.seq,ts:state.now,type:'recovery',message:`Завершено дослідницький сигнал: ${a.title}.`});
    }
    for(const [ruleId,{crewId,key,q,warning}] of candidates){let a=state.alerts.find(a=>a.ruleId===ruleId&&!a.resolvedAt);const evidence={...warning,unit:q.config.unit,ts:state.now,baseline:q.baseline,rate:q.rate,fit:q.fit,forecastModel:q.forecast.model,forecastSelection:q.forecast.selection?{n:q.forecast.selection.n,provisional:q.forecast.selection.provisional,reason:q.forecast.selection.reason,scores:q.forecast.selection.scores}:null,config:{...q.config}};
      if(a){a.lastSeen=state.now;a.lastValue=q.current===null?'—':String(q.current);a.evidenceUnavailable=false;if(a.evidence?.configRevision!==warning.configRevision)a.acknowledgedAt=null;a.evidence=evidence;}
      else{a={id:++state.seq,crewId,metric:key,origin:'analysis',analysisType:warning.type,ruleId,severity:'warning',title:warning.title,ts:state.now,lastSeen:state.now,lastValue:q.current===null?'—':String(q.current),acknowledgedAt:null,resolvedAt:null,evidence};state.alerts.unshift(a);state.log.unshift({id:++state.seq,ts:state.now,type:'alert',message:`Дослідницький сигнал: ${S.TYPES[key].name} — ${warning.title}.`});}
    }
    syncJoint(state,byCrew);
    state.log=state.log.slice(0,150);const active=state.alerts.filter(a=>!a.resolvedAt);state.alerts=[...active,...state.alerts.filter(a=>a.resolvedAt).slice(0,Math.max(0,250-active.length))];
  }
  const api={KEYS,FLOORS,val,valid,mean,sd,fit,references,analyze,sync,researchConfig,configureResearch,compare,sourceSummary};root.AstrisAnalytics=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
