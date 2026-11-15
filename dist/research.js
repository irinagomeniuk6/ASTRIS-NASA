(function(root){
  'use strict';
  const finite=Number.isFinite;
  const mean=a=>!a.length?null:a.every(x=>x===a[0])?a[0]:a.reduce((s,x)=>s+x/a.length,0);
  function pearson(a,b){
    if(a.length!==b.length||a.length<3||!a.every(finite)||!b.every(finite))return null;
    const ma=mean(a),mb=mean(b),da=a.map(x=>x-ma),db=b.map(x=>x-mb),sa=Math.max(...da.map(Math.abs)),sb=Math.max(...db.map(Math.abs));
    if(!finite(sa)||!finite(sb)||sa<=Number.EPSILON*64*Math.max(...a.map(Math.abs))||sb<=Number.EPSILON*64*Math.max(...b.map(Math.abs)))return null;
    let xy=0,xx=0,yy=0;for(let i=0;i<a.length;i++){const x=da[i]/sa,y=db[i]/sb;xy+=x*y;xx+=x*x;yy+=y*y;}
    const r=xy/Math.sqrt(xx*yy);return finite(r)?Math.max(-1,Math.min(1,r)):null;
  }
  function linearFit(points,minPoints=3,minSpan=0){
    if(points.length<minPoints||!points.every(p=>finite(p.t)&&finite(p.y))||points.at(-1).t-points[0].t<minSpan)return null;
    const mt=mean(points.map(p=>p.t)),my=mean(points.map(p=>p.y));let xx=0,xy=0,total=0;
    for(const p of points){xx+=(p.t-mt)**2;xy+=(p.t-mt)*(p.y-my);total+=(p.y-my)**2;}if(!(xx>0))return null;
    const slope=xy/xx,intercept=my-slope*mt,residuals=points.map(p=>p.y-intercept-slope*p.t),sse=residuals.reduce((s,x)=>s+x*x,0),n=points.length;
    if(![slope,intercept,sse,xx,mt,total].every(finite))return null;
    return {slope,intercept,r2:total>0?Math.max(0,Math.min(1,1-sse/total)):null,rmse:Math.sqrt(sse/n),n,spanMinutes:points.at(-1).t-points[0].t,sse,meanT:mt,sxx:xx,df:n-2,residualSigma:Math.sqrt(sse/(n-2)),residualLag1:pearson(residuals.slice(1),residuals.slice(0,-1))};
  }
  // Lanczos log-gamma, regularized incomplete beta and inversion of Student t.
  function logGamma(z){
    const p=[676.5203681218851,-1259.1392167224028,771.32342877765313,-176.61502916214059,12.507343278686905,-.13857109526572012,9.984369578019572e-6,1.5056327351493116e-7];
    if(z<.5)return Math.log(Math.PI)-Math.log(Math.sin(Math.PI*z))-logGamma(1-z);
    z-=1;let x=.99999999999980993;for(let i=0;i<p.length;i++)x+=p[i]/(z+i+1);const t=z+p.length-.5;return .5*Math.log(2*Math.PI)+(z+.5)*Math.log(t)-t+Math.log(x);
  }
  function betaFraction(a,b,x){
    const tiny=1e-300;let c=1,d=1-(a+b)*x/(a+1);if(Math.abs(d)<tiny)d=tiny;d=1/d;let h=d;
    for(let m=1;m<=200;m++){
      let aa=m*(b-m)*x/((a+2*m-1)*(a+2*m));d=1+aa*d;if(Math.abs(d)<tiny)d=tiny;c=1+aa/c;if(Math.abs(c)<tiny)c=tiny;d=1/d;h*=d*c;
      aa=-(a+m)*(a+b+m)*x/((a+2*m)*(a+2*m+1));d=1+aa*d;if(Math.abs(d)<tiny)d=tiny;c=1+aa/c;if(Math.abs(c)<tiny)c=tiny;d=1/d;const delta=d*c;h*=delta;if(Math.abs(delta-1)<2e-14)break;
    }return h;
  }
  function betaRegularized(x,a,b){if(x<=0)return 0;if(x>=1)return 1;const bt=Math.exp(logGamma(a+b)-logGamma(a)-logGamma(b)+a*Math.log(x)+b*Math.log1p(-x));return x<(a+1)/(a+b+2)?bt*betaFraction(a,b,x)/a:1-bt*betaFraction(b,a,1-x)/b;}
  function studentCDF(t,df){if(!(df>0)||!finite(t))return null;const tail=.5*betaRegularized(df/(df+t*t),df/2,.5);return t>=0?1-tail:tail;}
  const tCache=new Map();
  function studentCritical(df,coverage=.95){
    if(!Number.isInteger(df)||df<1||!finite(coverage)||coverage<=0||coverage>=1)return null;const key=df+':'+coverage;if(tCache.has(key))return tCache.get(key);
    const target=(1+coverage)/2;let lo=0,hi=1;while(studentCDF(hi,df)<target&&hi<1e8)hi*=2;for(let i=0;i<70;i++){const mid=(lo+hi)/2;if(studentCDF(mid,df)<target)lo=mid;else hi=mid;}const result=(lo+hi)/2;tCache.set(key,result);return result;
  }
  function predictionInterval(model,t,coverage=.95){
    if(!model||!finite(t)||!(model.df>0)||!(model.sxx>0))return null;
    const critical=studentCritical(model.df,coverage);if(critical===null)return null;const y=model.intercept+model.slope*t,se=model.residualSigma*Math.sqrt(1+1/model.n+(t-model.meanT)**2/model.sxx),half=critical*se;
    if(![y,se,half,y-half,y+half].every(finite))return null;
    return {y,lower:y-half,upper:y+half,coverage,critical,df:model.df,halfWidth:half,degenerate:model.residualSigma<=Number.EPSILON*Math.max(1,Math.abs(y))};
  }
  function training(rows,end,c){
    const selected=[];let next=null;for(let i=end;i>=0;i--){const p=rows[i];if(!finite(p.y)||p.ts<rows[end].ts-c.fitWindowMinutes*60000||(next!==null&&next-p.ts>c.maxGapSeconds*1000))break;selected.unshift(p);next=p.ts;}
    const span=selected.length?(selected.at(-1).ts-selected[0].ts)/60000:0,expected=selected.length?Math.floor(span*60/c.expectedIntervalSeconds)+1:0,bins=new Set(selected.map(p=>Math.round((p.ts-selected[0].ts)/(c.expectedIntervalSeconds*1000))));
    return selected.length>=c.minFitPoints&&span>=c.minFitSpanMinutes&&bins.size/(expected||1)>=c.minCoverage?selected:[];
  }
  function rollingBacktest(rows,c,{maxOrigins=80,minTests=5}={}){
    const samples=[],toleranceSeconds=Math.min(15,c.expectedIntervalSeconds/4),h=c.forecastMinutes*60000,skipped={training:0,target:0,gap:0,numeric:0};let attempted=0;
    const possible=[];for(let i=0;i<rows.length;i++)if(finite(rows[i].y)&&rows[i].ts+h<=rows.at(-1).ts+toleranceSeconds*1000)possible.push(i);
    for(const i of possible.slice(-maxOrigins)){
      attempted++;const train=training(rows,i,c);if(!train.length){skipped.training++;continue;}
      const targetTime=rows[i].ts+h;let j=i+1;while(j<rows.length&&rows[j].ts<targetTime-toleranceSeconds*1000)j++;
      if(j>=rows.length||Math.abs(rows[j].ts-targetTime)>toleranceSeconds*1000||!finite(rows[j].y)){skipped.target++;continue;}
      let contiguous=true;for(let k=i+1;k<=j;k++)if(!finite(rows[k].y)||rows[k].ts-rows[k-1].ts>c.maxGapSeconds*1000){contiguous=false;break;}if(!contiguous){skipped.gap++;continue;}
      const origin=train[0].ts,model=linearFit(train.map(p=>({t:(p.ts-origin)/60000,y:p.y})),c.minFitPoints,c.minFitSpanMinutes),interval=predictionInterval(model,(rows[j].ts-origin)/60000);
      if(!interval||![interval.y-rows[j].y,rows[i].y-rows[j].y].every(finite)){skipped.numeric++;continue;}
      samples.push({originTs:rows[i].ts,targetTs:rows[j].ts,trainTo:rows[i].ts,trainN:train.length,horizonActualMinutes:(rows[j].ts-rows[i].ts)/60000,actual:rows[j].y,predicted:interval.y,error:interval.y-rows[j].y,naiveError:rows[i].y-rows[j].y,lower:interval.lower,upper:interval.upper,covered:rows[j].y>=interval.lower-1e-10&&rows[j].y<=interval.upper+1e-10});
    }
    const errors=samples.map(p=>p.error),n=errors.length,naive=samples.map(p=>p.naiveError),rmse=n?Math.sqrt(mean(errors.map(x=>x*x))):null,naiveRmse=n?Math.sqrt(mean(naive.map(x=>x*x))):null;
    return {n,eligible:n>=minTests,minTests,attempted,skipped,horizonMinutes:c.forecastMinutes,toleranceSeconds,maxOrigins,mae:n?mean(errors.map(Math.abs)):null,rmse:finite(rmse)?rmse:null,bias:n?mean(errors):null,naiveRmse:finite(naiveRmse)?naiveRmse:null,coverage:n?mean(samples.map(p=>p.covered?1:0))*100:null,samples};
  }
  function segments(rows,maxGapSeconds){let segment=0,previous=null;const valid=[];for(const p of rows){if(!finite(p.ts)||!finite(p.y)){segment++;previous=null;continue;}if(previous!==null&&p.ts-previous>maxGapSeconds*1000)segment++;valid.push({...p,segment});previous=p.ts;}return valid;}
  function align(seriesA,seriesB,toleranceSeconds=0){
    if(!finite(toleranceSeconds)||toleranceSeconds<0)throw Error('Некоректний допуск часу');
    const normalize=rows=>[...new Map(rows.filter(p=>finite(p.ts)&&finite(p.y)).map(p=>[p.ts,p])).values()].sort((a,b)=>a.ts-b.ts),a=normalize(seriesA),b=normalize(seriesB),pairs=[];let j=0;
    for(const p of a){while(j<b.length&&b[j].ts<p.ts-toleranceSeconds*1000)j++;if(j>=b.length)break;let best=j;while(best+1<b.length&&Math.abs(b[best+1].ts-p.ts)<Math.abs(b[best].ts-p.ts))best++;if(Math.abs(b[best].ts-p.ts)<=toleranceSeconds*1000){const q=b[best];pairs.push({ts:Math.max(p.ts,q.ts),a:p.y,b:q.y,tsA:p.ts,tsB:q.ts,zA:p.z??null,zB:q.z??null,segmentA:p.segment,segmentB:q.segment,skewSeconds:Math.abs(p.ts-q.ts)/1000});j=best+1;}}
    return pairs;
  }
  function compare(a,b,{toleranceSeconds=0,minPairs=8,minCoverage=.8}={}){
    if(!Number.isInteger(minPairs)||minPairs<3||!finite(minCoverage)||minCoverage<=0||minCoverage>1)throw Error('Некоректні вимоги до пар та повноти');
    if(a.key===b.key)return {eligible:false,reason:'Оберіть різні канали',pairs:[],levelR:null,changeR:null,n:0};
    if(toleranceSeconds>Math.min(a.config.expectedIntervalSeconds,b.config.expectedIntervalSeconds)/2)throw Error('Допуск перевищує половину меншого інтервалу пакетів');
    const pairs=align(segments(a.series,a.config.maxGapSeconds),segments(b.series,b.config.maxGapSeconds),toleranceSeconds),from=Math.max(a.from,b.from),step=Math.max(a.config.expectedIntervalSeconds,b.config.expectedIntervalSeconds)*1000,expected=Math.floor((Math.min(a.to,b.to)-from)/step)+1,bins=new Set(pairs.filter(p=>p.ts>=from).map(p=>Math.min(expected-1,Math.round((p.ts-from)/step))));
    const coverage=expected>0?Math.min(100,bins.size/expected*100):0,changes=[];
    for(let i=1;i<pairs.length;i++){const p=pairs[i],q=pairs[i-1],dtA=(p.tsA-q.tsA)/60000,dtB=(p.tsB-q.tsB)/60000;if(dtA>0&&dtB>0&&dtA*60<=a.config.maxGapSeconds&&dtB*60<=b.config.maxGapSeconds&&p.segmentA===q.segmentA&&p.segmentB===q.segmentB)changes.push({a:(p.a-q.a)/dtA,b:(p.b-q.b)/dtB});}
    const rawLevelR=pearson(pairs.map(p=>p.a),pairs.map(p=>p.b)),rawChangeR=pearson(changes.map(p=>p.a),changes.map(p=>p.b)),reason=pairs.length<minPairs?'Недостатньо синхронізованих пар':coverage<minCoverage*100?'Недостатня повнота спільного вікна':null,eligible=reason===null;
    return {eligible,reason,keyA:a.key,keyB:b.key,pairs,n:pairs.length,changesN:changes.length,levelR:eligible?rawLevelR:null,changeR:eligible&&changes.length>=Math.max(3,minPairs-1)?rawChangeR:null,rawLevelR,rawChangeR,coverage,matchedSlots:bins.size,expectedSlots:expected,maxSkewSeconds:pairs.length?Math.max(...pairs.map(p=>p.skewSeconds)):null,toleranceSeconds,minPairs,minCoverage};
  }
  function pattern(q,count=3){
    if(q.quality!=='good')return {kind:q.quality,title:q.quality==='stale'?'Застарілий потік':q.quality==='missing'?'Потік недоступний':'Помилка даних',detail:q.qualityReason,evidence:{quality:q.quality,ageSeconds:q.ageSeconds,latestTs:q.latestTs}};
    const rows=segments(q.series,q.config.maxGapSeconds),last=rows.at(-1),tail=rows.slice(-count),anomalous=p=>finite(p?.z)&&Math.abs(p.z)>=q.config.sigmaThreshold;
    if(tail.length===count&&tail.every(p=>p.segment===last.segment&&anomalous(p)&&Math.sign(p.z)===Math.sign(last.z)))return {kind:'sustained',title:'Стійке статистичне відхилення',detail:count+' послідовних валідних пакетів по один бік бази. Причину зміни не встановлено.',evidence:{count,points:tail.map(p=>({ts:p.ts,y:p.y,z:p.z})),threshold:q.config.sigmaThreshold}};
    if(rows.length>=3){const trio=rows.slice(-3);if(trio.every(p=>p.segment===last.segment)&&!anomalous(trio[0])&&anomalous(trio[1])&&!anomalous(trio[2]))return {kind:'isolated',title:'Поодинокий викид із поверненням',detail:'Можливий артефакт або коротка зміна параметра. Без незалежного вимірювання розрізнити їх неможливо.',evidence:{points:trio.map(p=>({ts:p.ts,y:p.y,z:p.z})),threshold:q.config.sigmaThreshold}};}
    return {kind:anomalous(last)?'unconfirmed':'valid',title:anomalous(last)?'Відхилення потребує наступних вимірювань':'Валідні дані',detail:'Коректний формат і час не підтверджують справність фізичного датчика чи фізіологічну причину.',evidence:{quality:q.quality,z:q.z}};
  }
  function coincidence(analyses,{coincidenceSeconds=60,minConcurrent=2}={}){
    const candidates=analyses.filter(q=>q.quality==='good'&&finite(q.z)&&Math.abs(q.z)>=q.config.sigmaThreshold).map(q=>({key:q.key,ts:q.latestTs,value:q.current,unit:q.config.unit,z:q.z,threshold:q.config.sigmaThreshold,baseline:q.baseline})).sort((a,b)=>a.ts-b.ts);let best=[];
    for(let i=0;i<candidates.length;i++){const group=candidates.slice(i).filter(p=>p.ts-candidates[i].ts<=coincidenceSeconds*1000);if(group.length>best.length)best=group;}
    return {active:best.length>=minConcurrent,n:best.length,members:best,spreadSeconds:best.length?(best.at(-1).ts-best[0].ts)/1000:null,coincidenceSeconds,minConcurrent,assessable:analyses.every(q=>q.quality==='good'&&finite(q.z))};
  }
  const api={mean,pearson,linearFit,studentCDF,studentCritical,predictionInterval,rollingBacktest,segments,align,compare,pattern,coincidence};root.AstrisResearch=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
