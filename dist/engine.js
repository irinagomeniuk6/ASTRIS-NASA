(function (root) {
  'use strict';
  const S=root.AstrisSensors||(typeof require==='function'?require('./sensor-config.js'):null),T=root.AstrisTransport||(typeof require==='function'?require('./transport.js'):null);
  const CREW = [
    {id:'a1',name:'Олена Коваль',role:'Командирка місії',initials:'ОК',color:'#ee976d',age:38,hr:68,sleep:7.6,mood:4},
    {id:'a2',name:'Маркус Чен',role:'Бортінженер',initials:'МЧ',color:'#83a5b2',age:35,hr:73,sleep:5.8,mood:3},
    {id:'a3',name:'Амара Окафор',role:'Лікарка екіпажу',initials:'АО',color:'#af9bc2',age:36,hr:65,sleep:7.9,mood:5},
    {id:'a4',name:'Лука Моретті',role:'Пілот',initials:'ЛМ',color:'#89a58b',age:40,hr:71,sleep:7.2,mood:4},
    {id:'a5',name:'Юкі Танака',role:'Біологиня',initials:'ЮТ',color:'#d4b578',age:33,hr:66,sleep:6.9,mood:4},
    {id:'a6',name:'Софія Реєс',role:'Геологиня',initials:'СР',color:'#a4b2c5',age:37,hr:70,sleep:7.8,mood:4}
  ];
  const METRICS = {
    hr:{name:'Пульс',unit:'уд/хв',short:'HR',range:'Допустимі межі задаються користувачем',color:'#e78055'},
    bp:{name:'Артеріальний тиск',unit:'мм рт. ст.',short:'АТ',range:'Допустимі межі задаються користувачем',color:'#b491ca'},
    spo2:{name:'Сатурація',unit:'%',short:'SpO₂',range:'Допустимі межі задаються користувачем',color:'#73a7b1'},
    temp:{name:'Температура тіла',unit:'°C',short:'T°',range:'Допустимі межі задаються користувачем',color:'#cb9e57'},
    glucose:{name:'Глюкоза',unit:'мг/дл',short:'GLU',range:'Допустимі межі задаються користувачем',color:'#98a875'},
    sleep:{name:'Сон',unit:'год',short:'ZZ',range:'Допустимі межі задаються користувачем',color:'#8c99bd'},
    mood:{name:'Самопочуття',unit:'/ 5',short:'MOOD',range:'Допустимі межі задаються користувачем',color:'#a999bc'}
  };
  METRICS.dia={name:'Діастолічний тиск',unit:'мм рт. ст.',short:'ДАТ',range:'Допустимі межі задаються користувачем',color:'#9daee9'};
  const SOURCES = {
    nasa:'https://www.nasa.gov/hrp/risks/',
    bp:'https://www.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings',
    glucose:'https://www.niddk.nih.gov/health-information/diabetes/overview/preventing-problems/low-blood-glucose-hypoglycemia'
  };
  function rng(s){s.seed=(1664525*s.seed+1013904223)>>>0;return s.seed/4294967296;}
  const round=(x,n=0)=>Number(x.toFixed(n));
  const current=(s,id)=>s.histories[id][s.histories[id].length-1];
  function grade(key,v,state){
    const keys=key==='bp'?['bp','dia']:[key],reads=keys.map(k=>S.inspect(v,k,state?.now??v?.ts,S.get(state,k)));
    const bad=reads.find(r=>r.quality!=='good');if(bad)return bad.quality==='future'?'invalid':bad.quality;
    const configs=keys.map(k=>S.get(state,k));
    if(configs.every(c=>c.min===null&&c.max===null))return 'unconfigured';
    return reads.some((r,i)=>(configs[i].min!==null&&r.value<configs[i].min)||(configs[i].max!==null&&r.value>configs[i].max))?'warning':'normal';
  }
  function value(key,v,state){const g=grade(key,v,state);if(['missing','invalid','stale'].includes(g))return '—';return key==='bp'?`${v.sys}/${v.dia}`:String(v[S.TYPES[key].field]);}
  function limitsText(state,key){return key==='bp'?'САТ: '+S.limitsText(state,'bp')+'; ДАТ: '+S.limitsText(state,'dia'):S.limitsText(state,key);}
  function guidance(key,level){
    if(key==='sensor')return {title:'Якість телеметрії потребує перевірки',why:'Відсутність або помилка пакета не означає нормальний стан об’єкта.',steps:['Перевірте джерело даних, живлення, контакт і часову мітку.','Відновіть потік або виконайте незалежне вимірювання.','Не використовуйте історію як підтвердження актуального стану.'],source:SOURCES.nasa};
    const descriptions={hr:'Частота серцевих скорочень. Це фізіологічний канал, а не показник обладнання костюма.',bp:'Артеріальний тиск: систолічна та діастолічна компоненти. Це не тиск газу всередині костюма.',dia:'Діастолічна компонента артеріального тиску.',spo2:'Оцінка сатурації за даними датчика. Контакт і якість сигналу впливають на результат.',temp:'Температура тіла. Канал температури охолоджувального контуру костюма не реалізований.',glucose:'Концентрація глюкози. Інтерпретація потребує контексту їжі, активності й способу вимірювання.',sleep:'Тривалість сну — ручна самооцінка, а не безперервний датчик.',mood:'Самооцінка самопочуття, яка не встановлює діагнозів.'};
    return {title:METRICS[key].name+' — дослідницький показник',why:descriptions[key],steps:['Перевірте актуальність, одиниці й якість вимірювання.','Порівняйте значення з власними налаштуваннями та контекстом активності.','Узгодьте реальні дії з відповідальним фахівцем; прототип не є системою забезпечення безпеки.'],source:key==='glucose'?SOURCES.glucose:key==='bp'||key==='dia'?SOURCES.bp:SOURCES.nasa};
  }

  function log(s,type,message){s.log.unshift({id:++s.seq,ts:s.now,type,message});s.log=s.log.slice(0,150);}
  function assess(s,id,v,only){
    S.prepare(s);const keys=only||['sensor','hr','bp','spo2','temp','glucose'];
    for(const key of keys){
      const raw=key==='sensor'?(['offline','invalid'].includes(v.quality)?'warning':'normal'):grade(key,v,s),k=id+':'+key;
      const active=s.alerts.find(a=>a.crewId===id&&a.metric===key&&!a.resolvedAt&&a.origin==='configured');
      if(['missing','invalid','stale'].includes(raw)){delete s.counters[k];continue;}
      if(raw==='unconfigured'){if(active){active.resolvedAt=s.now;active.resolutionReason='Допустимі межі вимкнено. Це не підтверджує безпечний стан.';}continue;}
      const c=key==='sensor'?null:S.get(s,key==='bp'&&S.get(s,'bp').min===null&&S.get(s,'bp').max===null?'dia':key),counter=s.counters[k]||(s.counters[k]={grade:'normal',count:0,lastTs:null});
      if(!['sensor','sleep','mood'].includes(key)&&counter.lastTs===v.ts)continue;
      if(c&&counter.lastTs!==null&&v.ts-counter.lastTs>c.maxGapSeconds*1000){counter.count=0;counter.grade='normal';}
      counter.lastTs=v.ts;if(raw===counter.grade)counter.count++;else{counter.grade=raw;counter.count=1;}
      const required=['sensor','sleep','mood'].includes(key)?1:c.confirmationSamples;if(counter.count<required)continue;
      if(raw==='normal'){if(active){active.resolvedAt=s.now;active.resolutionReason='Після повторних пакетів умова сигналу більше не спостерігається.';log(s,'recovery',`Завершено сигнал «${active.title}».`);}continue;}
      const components=key==='bp'?['bp','dia']:[key];
      const comparisons=key==='sensor'?[`quality = ${v.quality}`]:components.flatMap(part=>{const conf=S.get(s,part),x=S.value(v,part);return [conf.min!==null&&x<conf.min?`${x} < ${conf.min} ${conf.unit}`:null,conf.max!==null&&x>conf.max?`${x} > ${conf.max} ${conf.unit}`:null].filter(Boolean);});
      const evidence={type:key==='sensor'?'quality':'bounds',equation:comparisons.join('; '),detail:`Підтвердження: ${counter.count} послідовних пакетів, правило ${required}. Межі задає користувач.`,config:c?{...c}:null,ts:s.now};
      if(active){active.lastSeen=s.now;active.lastValue=key==='sensor'?v.quality:value(key,v,s);active.evidence=evidence;}
      else{const title=key==='sensor'?'Телеметрія недоступна':METRICS[key].name+': вихід за задані межі';s.alerts.unshift({id:++s.seq,crewId:id,metric:key,origin:'configured',severity:'warning',title,ts:s.now,lastSeen:s.now,lastValue:key==='sensor'?v.quality:value(key,v,s),acknowledgedAt:null,resolvedAt:null,evidence});log(s,'alert',`${CREW.find(c=>c.id===id).name}: ${title}.`);}
    }s.alerts=s.alerts.slice(0,250);
  }

  function sample(s,c,index){
    const noise=(scale)=>((rng(s)-.5)*scale);
    const wave=Math.sin(index/9+Number(c.id.slice(1)));
    const v={ts:s.now,hr:round(c.hr+wave*3+noise(4)),sys:round(115+wave*4+noise(5)),dia:round(75+noise(5)),spo2:round(98+noise(1),1),temp:round(36.6+noise(.3),1),glucose:round(96+wave*6+noise(7)),sleep:c.sleep,mood:c.mood,quality:'good',source:'simulator'};
    const sc=s.scenarios[c.id]||'nominal';
    const scenarioAge=s.ticks-(s.scenarioStart?.[c.id]||0);
    if(sc==='cycles'){const phase=2*Math.PI*scenarioAge/12;v.hr=round(c.hr+6*Math.sin(phase),2);v.sys=round(115+4*Math.sin(phase+.4),2);v.temp=round(36.6+.08*Math.sin(phase-.2),3);}
    if(sc==='noise'){v.hr=round(c.hr+(scenarioAge%2?10:-10)+noise(1),1);v.sys=round(115+(scenarioAge%2?6:-6)+noise(1),1);}
    if(sc==='spike'&&scenarioAge===1){v.hr=c.hr+60;v.sys=155;}
    if(sc==='gaps'&&scenarioAge%3===0)for(const field of ['hr','sys','dia','spo2','temp','glucose'])v[field]=null;
    if(sc==='hr'){v.hr=round(142+noise(8));v.sys=149;v.dia=94;}
    if(sc==='hypoxia')v.spo2=round(87+noise(1.8),1);
    if(sc==='fever')v.temp=round(38.5+noise(.3),1);
    if(sc==='fatigue'){v.sleep=4.3;v.mood=2;v.hr+=12;}
    if(sc==='glucose')v.glucose=round(60+noise(6));
    if(sc==='offline'){v.quality='offline';for(const k of ['hr','sys','dia','spo2','temp','glucose'])v[k]=null;}
    const age=s.ticks-(s.scenarioStart?.[c.id]||0);
    if(sc==='drift'){v.hr=round(c.hr+age*1.5,1);v.sys=round(115+age*1.2,1);v.temp=round(36.6+age*.03,2);}
    if(sc==='invalid'){v.quality='invalid';for(const k of ['hr','sys','dia','spo2','temp','glucose'])v[k]='invalid';}
    if(sc==='stale'){const previous=[...s.histories[c.id]].reverse().find(p=>p.quality==='good'&&Number.isFinite(p.hr));if(previous)Object.assign(v,previous,{quality:'good',source:'simulator-stale'});}
    const daily=s.daily[c.id];if(daily){v.sleep=daily.sleep;v.mood=daily.mood;}
    return v;
  }
  function create(seed=260114){
    const s={version:1,seed,now:Date.UTC(2026,10,14,8,40),ticks:0,seq:0,scenarios:{},daily:{},histories:{},alerts:[],counters:{},log:[],tasks:{}};
    S.prepare(s);for(const c of CREW)s.histories[c.id]=[];
    s.now-=60*60000;
    for(let i=0;i<=60;i++){
      if(i)s.now+=60000;
      for(const c of CREW){const v=sample(s,c,i);s.histories[c.id].push(v);if(i===60)assess(s,c.id,v);}
    }
    log(s,'system','Демо запущено. Попередні 60 хвилин історії згенеровано симулятором.');
    T.prepare(s);return s;
  }
  function tick(s){s.now+=60000;s.ticks++;for(const c of CREW)T.send(s,c.id,sample(s,c,s.ticks+60));for(const d of T.flush(s))if(d.isCurrent)assess(s,d.crewId,d.packet);return s;}
  function scenario(s,id,key){if(!CREW.some(c=>c.id===id)||!['nominal','hr','hypoxia','fever','fatigue','offline','glucose','drift','stale','invalid','noise','spike','gaps','cycles'].includes(key))throw Error('Невідомий сценарій');s.scenarios[id]=key;s.scenarioStart=s.scenarioStart||{};s.scenarioStart[id]=s.ticks;log(s,'scenario',`${CREW.find(c=>c.id===id).name}: сценарій «${key}».`);}
  function acknowledge(s,alertId){const a=s.alerts.find(a=>a.id===alertId);if(a&&!a.acknowledgedAt){a.acknowledgedAt=s.now;log(s,'action',`Сигнал «${a.title}» взято в роботу. Відхилення лишається активним.`);}}
  function checkin(s,id,sleep,mood){if(!CREW.some(c=>c.id===id)||!Number.isFinite(sleep)||sleep<0||sleep>24||!Number.isInteger(mood)||mood<1||mood>5)throw Error('Некоректні дані');s.daily[id]={sleep,mood,ts:s.now};const v=current(s,id);v.sleep=sleep;v.mood=mood;assess(s,id,v,['sleep','mood']);log(s,'action',`${CREW.find(c=>c.id===id).name}: самооцінка сну та самопочуття (вручну).`);}
  function status(s,id){const a=s.alerts.filter(a=>a.crewId===id&&!a.resolvedAt);return a.some(a=>a.severity==='critical')?'critical':a.length?'warning':'normal';}
  function configure(s,key,draft){const before=S.get(s,key),c=S.update(s,key,draft),changed=before.min!==c.min||before.max!==c.max||before.confirmationSamples!==c.confirmationSamples;if(changed){for(const crew of CREW)delete s.counters[crew.id+':'+(key==='dia'?'bp':key)];for(const a of s.alerts)if(a.origin==='configured'&&!a.resolvedAt&&(a.metric===key||(key==='dia'&&a.metric==='bp'))){a.resolvedAt=s.now;a.resolutionReason='Налаштування меж змінено; потрібна нова оцінка.';}}log(s,'action','Користувач змінив параметри каналу «'+S.TYPES[key].name+'».');return c;}
  const api={configure,limitsText,CREW,METRICS,SOURCES,create,tick,current,grade,value,guidance,scenario,acknowledge,checkin,status,log};
  root.AstrisEngine=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
