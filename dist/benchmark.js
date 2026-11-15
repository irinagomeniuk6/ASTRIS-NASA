(function(root){
  'use strict';
  const F=root.AstrisForecast||(typeof require==='function'?require('./forecast.js'):null),S=root.AstrisSensors||(typeof require==='function'?require('./sensor-config.js'):null);
  const VERSION='astris-control-v1',START=Date.UTC(2026,0,1),TRAIN=72,LENGTH=120,HORIZONS=[1,5,10];
  const CATALOG=[['level','Рівень із шумом',91001],['drift','Поступовий дрейф',91002],['cycles','Коливання',91003],['step','Нова зміна режиму',91004],['spikes','Позначені викиди',91005],['gaps','Пропуски',91006]];
  function dataset(id){
    const def=CATALOG.find(c=>c[0]===id);if(!def)throw Error('Невідомий контрольний ряд');let seed=def[2];
    const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
    const rows=Array.from({length:LENGTH},(_,i)=>{const noise=(random()-.5)*1.6,isAnomaly=id==='spikes'&&[83,99,112].includes(i),missing=id==='gaps'&&[82,83,101].includes(i);let y=50+noise;
      if(id==='drift')y=40+i*.18+noise*.4;if(id==='cycles')y=50+5*Math.sin(2*Math.PI*i/14)+noise*.3;if(id==='step')y=45+(i>=84?8:0)+noise*.5;if(id==='gaps')y=48+3*Math.sin(2*Math.PI*i/16)+noise*.3;if(isAnomaly)y+=18;
      return {ts:START+i*60000,y:missing?null:y,isAnomaly,index:i};});
    return {id,name:def[1],seed:def[2],trainPoints:TRAIN,testPoints:LENGTH-TRAIN,unit:'ум. од.',rows};
  }
  function score(samples){const n=samples.length,mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null,errors=samples.map(p=>p.predicted-p.actual),naive=samples.map(p=>p.naive-p.actual),bands=samples.filter(p=>Number.isFinite(p.lower)&&Number.isFinite(p.upper));return {n,mae:mean(errors.map(Math.abs)),rmse:n?Math.sqrt(mean(errors.map(e=>e*e))):null,bias:mean(errors),naiveRmse:n?Math.sqrt(mean(naive.map(e=>e*e))):null,intervalN:bands.length,coverage:bands.length?100*mean(bands.map(p=>Number(p.actual>=p.lower&&p.actual<=p.upper))):null};}
  function anomalyScore(data){
    const base=data.rows.slice(0,30).map(p=>p.y),mean=base.reduce((s,x)=>s+x,0)/base.length,sd=Math.sqrt(base.reduce((s,x)=>s+(x-mean)**2,0)/(base.length-1)),result={tp:0,fp:0,fn:0,tn:0,threshold:3,baselineMean:mean,baselineSD:sd,samples:[]};
    for(const p of data.rows.slice(TRAIN)){if(!Number.isFinite(p.y))continue;const z=sd>0?(p.y-mean)/sd:null,detected=z!==null&&Math.abs(z)>=result.threshold,key=p.isAnomaly?(detected?'tp':'fn'):(detected?'fp':'tn');result[key]++;result.samples.push({ts:p.ts,actual:p.y,label:p.isAnomaly,detected,z});}
    result.precision=result.tp+result.fp?result.tp/(result.tp+result.fp):null;result.recall=result.tp+result.fn?result.tp/(result.tp+result.fn):null;return result;
  }
  function evaluateCase(id){
    const data=dataset(id),byHorizon=HORIZONS.map(horizon=>{const samples=[],skipped=[];
      for(let i=TRAIN-1;i+10<LENGTH;i+=6){const origin=data.rows[i],actual=data.rows[i+horizon];if(!Number.isFinite(origin.y)||!Number.isFinite(actual.y)){skipped.push({originTs:origin.ts,reason:'Пропуск у початку або цілі'});continue;}
        const input=data.rows.slice(0,i+1).map(p=>({ts:p.ts,y:p.y})),forecast=F.adaptiveForecast(input,{...S.defaults('hr'),forecastMinutes:horizon},origin.ts),target=forecast.points.find(p=>p.ts===actual.ts);
        if(!forecast.eligible||!target){skipped.push({originTs:origin.ts,reason:forecast.reason});continue;}
        samples.push({originTs:origin.ts,trainTo:input.at(-1).ts,targetTs:actual.ts,actual:actual.y,predicted:target.y,naive:origin.y,model:forecast.model.id,lower:target.lower,upper:target.upper,intervalMethod:target.intervalMethod,nominalCoverage:target.nominalCoverage});
      }
      return {horizon,...score(samples),samples,skipped};
    });
    return {id:data.id,name:data.name,seed:data.seed,trainPoints:TRAIN,testPoints:LENGTH-TRAIN,unit:data.unit,rows:data.rows,byHorizon,anomalies:id==='spikes'?anomalyScore(data):null};
  }
  async function run(onProgress){const cases=[];for(const [id] of CATALOG){cases.push(evaluateCase(id));if(onProgress)onProgress(cases.length,CATALOG.length);await new Promise(resolve=>setTimeout(resolve,0));}return {version:VERSION,dataType:'independent synthetic control, not clinical',trainPoints:TRAIN,testPoints:LENGTH-TRAIN,horizons:HORIZONS,cases,aggregate:HORIZONS.map(horizon=>({horizon,...score(cases.flatMap(c=>c.byHorizon.find(h=>h.horizon===horizon).samples))})),anomalies:cases.find(c=>c.anomalies).anomalies,method:'Forward-only rolling origins on a separate deterministic series. Fixed parameters. Labels and future targets excluded from forecast input. Not external validation.'};}
  const api={VERSION,CATALOG,TRAIN,LENGTH,HORIZONS,dataset,score,anomalyScore,evaluateCase,run};root.AstrisBenchmark=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
