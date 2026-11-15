(function(root){
  'use strict';
  const R=root.AstrisResearch||(typeof require==='function'?require('./research.js'):null),finite=Number.isFinite;
  const NAMES={naive:'Останнє значення',linear:'Лінійний тренд',holt:'Згасаючий тренд Голта',ar2:'Авторегресія AR(2)'},ORDER=['naive','linear','holt','ar2'],cache=new Map();
  function solve(matrix,vector){
    const a=matrix.map((row,i)=>[...row,vector[i]]),n=a.length;
    for(let k=0;k<n;k++){let pivot=k;for(let i=k+1;i<n;i++)if(Math.abs(a[i][k])>Math.abs(a[pivot][k]))pivot=i;if(Math.abs(a[pivot][k])<1e-12)return null;[a[k],a[pivot]]=[a[pivot],a[k]];const d=a[k][k];for(let j=k;j<=n;j++)a[k][j]/=d;for(let i=0;i<n;i++)if(i!==k){const f=a[i][k];for(let j=k;j<=n;j++)a[i][j]-=f*a[k][j];}}
    const result=a.map(row=>row[n]);return result.every(finite)?result:null;
  }
  function ar2(points,stepMinutes){
    if(points.length<12)return null;const values=points.map(p=>p.y),center=R.mean(values),scale=Math.sqrt(R.mean(values.map(x=>(x-center)**2)));if(!(scale>0)||!finite(scale))return null;
    const u=values.map(x=>(x-center)/scale),xx=Array.from({length:3},()=>[0,0,0]),xy=[0,0,0];
    for(let i=2;i<u.length;i++){const x=[1,u[i-1],u[i-2]];for(let j=0;j<3;j++){xy[j]+=x[j]*u[i];for(let k=0;k<3;k++)xx[j][k]+=x[j]*x[k];}}
    let coef=null,ridge=0,disc=0,radius=Infinity;
    for(const strength of [1e-6,1e-4,1e-2]){const matrix=xx.map(row=>[...row]);ridge=strength*(u.length-2);matrix[1][1]+=ridge;matrix[2][2]+=ridge;const candidate=solve(matrix,xy);if(!candidate)continue;const p1=candidate[1],p2=candidate[2];disc=p1*p1+4*p2;radius=disc<0?Math.sqrt(-p2):Math.max(Math.abs((p1+Math.sqrt(disc))/2),Math.abs((p1-Math.sqrt(disc))/2));if(finite(radius)&&radius<=1+1e-7){coef=candidate;break;}}
    if(!coef)return null;const [a,p1,p2]=coef;
    const omega=disc<0?Math.acos(Math.max(-1,Math.min(1,p1/(2*radius)))):null,periodMinutes=omega>0?2*Math.PI/omega*stepMinutes:null;
    const predict=h=>{const steps=Math.max(0,h/stepMinutes),whole=Math.floor(steps),fraction=steps-whole;if(steps>10000)return NaN;let previous=u.at(-2),last=u.at(-1);for(let i=0;i<whole;i++){const next=a+p1*last+p2*previous;previous=last;last=next;}const next=a+p1*last+p2*previous;return center+scale*(last+fraction*(next-last));};
    const errors=u.slice(2).map((v,i)=>scale*(a+p1*u[i+1]+p2*u[i]-v));
    return {id:'ar2',predict,n:points.length,spanMinutes:(points.at(-1).ts-points[0].ts)/60000,fitRmse:Math.sqrt(R.mean(errors.map(x=>x*x))),params:{center,scale,intercept:a,phi1:p1,phi2:p2,rootRadius:radius,periodMinutes,ridge,stepMinutes},equation:'u(t)=a+φ₁u(t−1)+φ₂u(t−2), u=(x−μ)/s'};
  }
  function dampedHolt(points,stepMinutes){
    if(points.length<6)return null;const alpha=.5,beta=.2,phi=.9;let level=points[0].y,trend=(points[Math.min(3,points.length-1)].y-points[0].y)/Math.min(3,points.length-1);const errors=[];
    for(let i=1;i<points.length;i++){const predicted=level+phi*trend,old=level;errors.push(predicted-points[i].y);level=alpha*points[i].y+(1-alpha)*predicted;trend=beta*(level-old)+(1-beta)*phi*trend;}
    return {id:'holt',n:points.length,spanMinutes:(points.at(-1).ts-points[0].ts)/60000,fitRmse:Math.sqrt(R.mean(errors.map(x=>x*x))),params:{level,trend,alpha,beta,phi,stepMinutes},equation:'ŷ(h)=ℓ+b·φ(1−φ^(h/Δ))/(1−φ)',predict:h=>level+trend*phi*(1-phi**(h/stepMinutes))/(1-phi)};
  }
  function intervalFromErrors(predicted,records,originTs,linearInterval){
    const known=records.filter(p=>p.targetTs<=originTs).slice(-80),errors=known.map(p=>Math.abs(p.error)).filter(finite).sort((a,b)=>a-b),n=errors.length,rank=Math.ceil((n+1)*.95);
    if(n>=19&&rank<=n){const half=errors[rank-1];return {lower:predicted-half,upper:predicted+half,nominalCoverage:.95,method:'empirical-95',n,calibrationTo:known.at(-1)?.targetTs??null,degenerate:half<1e-12};}
    if(n>=5){const half=errors.at(-1);return {lower:predicted-half,upper:predicted+half,nominalCoverage:null,method:'observed-error-envelope',n,calibrationTo:known.at(-1)?.targetTs??null,degenerate:half<1e-12};}
    if(linearInterval)return {lower:linearInterval.lower,upper:linearInterval.upper,nominalCoverage:.95,method:'conditional-student-t',n,calibrationTo:null,degenerate:linearInterval.degenerate};
    return {lower:null,upper:null,nominalCoverage:null,method:'unavailable',n,calibrationTo:null,degenerate:false};
  }
  function describe(points,model){
    const trajectory=[{y:model.predict(0)},...points.filter(p=>!p.anchor)],scale=Math.max(1,...trajectory.map(p=>Math.abs(p.y))),epsilon=Number.EPSILON*scale*64,deltas=trajectory.slice(1).map((p,i)=>p.y-trajectory[i].y).filter(x=>Math.abs(x)>epsilon),signs=deltas.map(Math.sign),turns=signs.slice(1).filter((s,i)=>s!==signs[i]).length;
    let title=!deltas.length?'Стабільний рівень':turns?'Коливання · можливий розворот':model.id==='holt'?(deltas.at(-1)>0?'Зростання зі згасанням':'Зниження зі згасанням'):model.id==='ar2'&&model.params.periodMinutes?(deltas.at(-1)>0?'Фаза коливання: зростання':'Фаза коливання: зниження'):(deltas.at(-1)>0?'Тенденція до зростання':'Тенденція до зниження');
    if(model.id==='naive')title='Немає підтвердженої динаміки';return {title,turns,delta:points.at(-1).y-points[0].y,periodMinutes:model.params?.periodMinutes??null};
  }
  function adaptiveForecast(input,config,now){
    const c={...config,forecastLookbackMinutes:config.forecastLookbackMinutes??60},cacheKey=JSON.stringify([now,c,input.map(p=>[p.ts,p.y])]);if(cache.has(cacheKey))return cache.get(cacheKey);
    const memory=Math.max(c.fitWindowMinutes,c.forecastLookbackMinutes),all=input.filter(p=>finite(p.ts)&&p.ts<=now&&p.ts>=now-memory*60000),rows=[];
    for(let i=all.length-1;i>=0;i--){const p=all[i];if(!finite(p.y)||(rows.length&&rows[0].ts-p.ts>c.maxGapSeconds*1000))break;rows.unshift(p);}
    const stepMinutes=c.expectedIntervalSeconds/60,H=c.forecastMinutes,elapsedMinutes=rows.length?(now-rows.at(-1).ts)/60000:0,evaluationHorizon=H+elapsedMinutes,tol=Math.min(15,c.expectedIntervalSeconds/4)*1000,minTests=5,modelCache=new Map(),selectionCache=new Map();
    function modelsAt(index){
      if(modelCache.has(index))return modelCache.get(index);const end=rows[index].ts,train=rows.slice(0,index+1).filter(p=>p.ts>=end-memory*60000),local=train.filter(p=>p.ts>=end-c.fitWindowMinutes*60000),span=(train.at(-1).ts-train[0].ts)/60000,expected=Math.floor(span/stepMinutes)+1,bins=new Set(train.map(p=>Math.round((p.ts-train[0].ts)/(stepMinutes*60000))));
      const models={};if(train.length<c.minFitPoints||span<c.minFitSpanMinutes||bins.size/expected<c.minCoverage){modelCache.set(index,models);return models;}
      const origin=local[0].ts,linear=R.linearFit(local.map(p=>({t:(p.ts-origin)/60000,y:p.y})),c.minFitPoints,c.minFitSpanMinutes),last=train.at(-1).y;
      models.naive={id:'naive',n:train.length,spanMinutes:span,fitRmse:null,params:{last},equation:'ŷ(h)=x(t)',predict:()=>last};
      if(linear)models.linear={id:'linear',n:linear.n,spanMinutes:linear.spanMinutes,fitRmse:linear.rmse,params:{intercept:linear.intercept,slope:linear.slope,originTs:origin},equation:'ŷ(t)=α+βt',linear,linearOrigin:origin,predict:h=>linear.intercept+linear.slope*((end-origin)/60000+h)};
      const regular=train.slice(1).every((p,i)=>Math.abs((p.ts-train[i].ts)/60000-stepMinutes)<=stepMinutes*.1);
      if(regular){const holt=dampedHolt(train,stepMinutes),auto=ar2(train,stepMinutes);if(holt)models.holt=holt;if(auto)models.ar2=auto;}
      modelCache.set(index,models);return models;
    }
    function targetAt(i,h){const goal=rows[i].ts+h*60000;let j=i+1;while(j<rows.length&&rows[j].ts<goal-tol)j++;return j<rows.length&&Math.abs(rows[j].ts-goal)<=tol?j:-1;}
    function selectionAt(index){
      if(selectionCache.has(index))return selectionCache.get(index);const available=modelsAt(index),ids=ORDER.filter(k=>available[k]);if(!ids.length)return null;
      const folds=[];for(let i=0;i<index;i++){const j=targetAt(i,evaluationHorizon);if(j<0||j>index)continue;const models=modelsAt(i);if(!ids.every(id=>models[id]))continue;const dt=(rows[j].ts-rows[i].ts)/60000,predictions=Object.fromEntries(ids.map(id=>[id,models[id].predict(dt)]));if(Object.values(predictions).every(finite))folds.push({originTs:rows[i].ts,targetTs:rows[j].ts,actual:rows[j].y,predictions});}
      const used=folds.slice(-24),scores=ids.map(id=>{const errors=used.map(p=>p.predictions[id]-p.actual);return {id,name:NAMES[id],n:used.length,rmse:errors.length?Math.sqrt(R.mean(errors.map(x=>x*x))):null,mae:errors.length?R.mean(errors.map(Math.abs)):null};});
      let id=available.linear?'linear':'naive',reason='Недостатньо спільних перевірок: попередня базова модель.',provisional=used.length<8;
      if(!provisional){const ranked=[...scores].sort((a,b)=>a.rmse-b.rmse),best=ranked[0],threshold=best.rmse*1.05+1e-10,simple=scores.find(p=>p.rmse<=threshold),naive=scores.find(p=>p.id==='naive');id=simple.id;if(id!=='naive'&&!(simple.rmse<naive.rmse*.9))id='naive';reason=id==='naive'?'Складніша модель не зменшила RMSE базового прогнозу щонайменше на 10%.':'Обрано за RMSE на однакових минулих цілях; за близької похибки перевага простішій моделі.';}
      const selection={id,model:available[id],n:used.length,provisional,reason,scores,folds:used,checkedThrough:used.at(-1)?.targetTs??null};selectionCache.set(index,selection);return selection;
    }
    const currentIndex=rows.length-1,current=currentIndex>=0?selectionAt(currentIndex):null;
    if(!current)return {eligible:false,reason:'Недостатньо послідовних даних для адаптивного прогнозу',points:[],validation:null,model:null,selection:null,interval:{assumptionsVerified:false,method:'unavailable'}};
    const audits=new Map();
    function audit(h){
      if(audits.has(h))return audits.get(h);const samples=[];for(let i=0;i<currentIndex;i++){const j=targetAt(i,h);if(j<0)continue;const selected=selectionAt(i);if(!selected)continue;const dt=(rows[j].ts-rows[i].ts)/60000,predicted=selected.model.predict(dt),error=predicted-rows[j].y,naiveError=rows[i].y-rows[j].y;if(![predicted,error,naiveError].every(finite))continue;samples.push({originTs:rows[i].ts,targetTs:rows[j].ts,trainTo:rows[i].ts,trainN:selected.model.n,horizonActualMinutes:dt,actual:rows[j].y,predicted,error,naiveError,modelId:selected.id,selectionCheckedThrough:selected.checkedThrough,provisional:selected.provisional,_selected:selected});}
      const used=samples.slice(-80);audits.set(h,used);return used;
    }
    function bounds(predicted,originTs,h,selected,records){const linear=selected.model.linear,analytical=linear?R.predictionInterval(linear,(originTs-selected.model.linearOrigin)/60000+h):null;return intervalFromErrors(predicted,records,originTs,analytical);}
    const mainAudit=audit(evaluationHorizon),reported=mainAudit.map(p=>{const interval=bounds(p.predicted,p.originTs,p.horizonActualMinutes,p._selected,mainAudit);const {_selected,...sample}=p;return {...sample,lower:interval.lower,upper:interval.upper,intervalMethod:interval.method,nominalCoverage:interval.nominalCoverage,calibrationTo:interval.calibrationTo,covered:interval.lower===null?null:p.actual>=interval.lower-1e-10&&p.actual<=interval.upper+1e-10};}),errors=reported.map(p=>p.error),n=reported.length,withInterval=reported.filter(p=>p.covered!==null);
    const validation={n,eligible:n>=minTests,minTests,horizonMinutes:evaluationHorizon,toleranceSeconds:tol/1000,maxOrigins:80,attempted:n,skipped:{training:0,target:0,gap:all.length-rows.length,numeric:0},mae:n?R.mean(errors.map(Math.abs)):null,rmse:n?Math.sqrt(R.mean(errors.map(x=>x*x))):null,bias:n?R.mean(errors):null,naiveRmse:n?Math.sqrt(R.mean(reported.map(p=>p.naiveError*p.naiveError))):null,coverage:withInterval.length?100*R.mean(withInterval.map(p=>p.covered?1:0)):null,intervalTests:withInterval.length,samples:reported,method:'prequential adaptive selection; every model choice uses only past targets'};
    const points=[{ts:rows.at(-1).ts,y:rows.at(-1).y,lower:rows.at(-1).y,upper:rows.at(-1).y,forecast:true,anchor:true,nominalCoverage:null,intervalMethod:'observed-anchor',degenerateInterval:false}];
    for(let h=elapsedMinutes>0?0:1;h<=H;h++){const duration=elapsedMinutes+h,y=current.model.predict(duration),interval=bounds(y,rows.at(-1).ts,duration,current,audit(duration));points.push({ts:now+h*60000,y,lower:interval.lower,upper:interval.upper,forecast:true,anchor:false,nominalCoverage:interval.nominalCoverage,intervalMethod:interval.method,calibrationN:interval.n,calibrationTo:interval.calibrationTo,degenerateInterval:interval.degenerate});}
    const last=points.at(-1),model={id:current.id,name:NAMES[current.id],params:current.model.params,equation:current.model.equation,fitRmse:current.model.fitRmse},selection={n:current.n,provisional:current.provisional,reason:current.reason,scores:current.scores,checkedThrough:current.checkedThrough,folds:current.folds};
    const eligible=points.every(p=>finite(p.y)),result={eligible,reason:eligible?null:'Числове переповнення моделі',points:eligible?points:[],n:current.model.n,spanMinutes:current.model.spanMinutes,horizonMinutes:H,lookbackMinutes:memory,model,selection,trend:describe(points,current.model),rmse:current.model.fitRmse,validation,interval:{method:last.intervalMethod,nominalCoverage:last.nominalCoverage,n:last.calibrationN,assumptionsVerified:false,warning:'Форма й діапазон залежать від історії. Стабільність режиму та покриття майбутніх даних не гарантовані.'}};
    cache.set(cacheKey,result);if(cache.size>72)cache.delete(cache.keys().next().value);return result;
  }
  const api={solve,ar2,dampedHolt,intervalFromErrors,adaptiveForecast,describe,NAMES};root.AstrisForecast=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);

