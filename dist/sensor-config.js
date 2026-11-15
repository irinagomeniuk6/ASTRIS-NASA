(function(root){
  'use strict';
  const TYPES={hr:{name:'Пульс',field:'hr',unit:'уд/хв'},bp:{name:'Систолічний тиск',field:'sys',unit:'мм рт. ст.'},dia:{name:'Діастолічний тиск',field:'dia',unit:'мм рт. ст.'},spo2:{name:'SpO₂',field:'spo2',unit:'%'},temp:{name:'Температура тіла',field:'temp',unit:'°C'},glucose:{name:'Глюкоза',field:'glucose',unit:'мг/дл'},sleep:{name:'Сон · самооцінка',field:'sleep',unit:'год'},mood:{name:'Настрій · самооцінка',field:'mood',unit:'/ 5'}};
  const KEYS=['hr','bp','dia','spo2','temp','glucose'];
  function defaults(key){return {key,unit:TYPES[key].unit,min:null,max:null,maxRate:null,confirmationSamples:3,sigmaThreshold:3,sigmaFloor:0,movingAveragePoints:5,forecastMinutes:5,forecastLookbackMinutes:60,fitWindowMinutes:15,minFitPoints:6,minFitSpanMinutes:5,minCoverage:.8,expectedIntervalSeconds:60,maxAgeSeconds:180,maxGapSeconds:90,revision:0};}
  function prepare(state){
    if(state.sensorSettingsVersion!==2){
      state.sensorSettings=Object.fromEntries(Object.keys(TYPES).map(k=>[k,defaults(k)]));state.sensorSettingsVersion=2;
      for(const a of state.alerts||[])if(!a.resolvedAt){a.resolvedAt=state.now;a.origin='legacy';a.resolutionReason='Архів попередніх демонстраційних правил. Поточні допустимі межі не задані.';}
      state.counters={};
    }
    state.sensorSettings=state.sensorSettings||{};
    for(const k of Object.keys(TYPES)){if(!state.sensorSettings[k])state.sensorSettings[k]=defaults(k);if(state.sensorSettings[k].forecastLookbackMinutes===undefined)state.sensorSettings[k].forecastLookbackMinutes=60;}
    return state;
  }
  function get(state,key){if(!TYPES[key])throw Error('Невідомий канал');if(!state)return defaults(key);prepare(state);return state.sensorSettings[key];}
  function nullable(v){if(v===null||v===undefined||String(v).trim()==='')return null;const n=Number(v);if(!Number.isFinite(n))throw Error('Значення має бути числом');return n;}
  function update(state,key,draft){
    const previous=get(state,key),next={...previous};
    for(const field of ['min','max','maxRate'])if(field in draft)next[field]=nullable(draft[field]);
    for(const field of ['confirmationSamples','sigmaThreshold','sigmaFloor','movingAveragePoints','forecastMinutes','forecastLookbackMinutes','fitWindowMinutes','minFitPoints','minFitSpanMinutes','minCoverage','expectedIntervalSeconds','maxAgeSeconds','maxGapSeconds'])if(field in draft){next[field]=Number(draft[field]);if(!Number.isFinite(next[field]))throw Error('Некоректні параметри обробки');}
    if(next.min!==null&&next.max!==null&&next.min>=next.max)throw Error('Нижня межа має бути меншою за верхню');
    if(next.maxRate!==null&&next.maxRate<=0)throw Error('Ліміт швидкості має бути додатним');
    if(next.sigmaThreshold<=0||next.sigmaFloor<0||!Number.isInteger(next.movingAveragePoints)||next.movingAveragePoints<2||next.movingAveragePoints>60)throw Error('Перевірте z-поріг, шкалу та довжину ковзного середнього');
    if(!Number.isInteger(next.forecastMinutes)||next.forecastMinutes<1||next.forecastMinutes>15||next.forecastLookbackMinutes<15||next.forecastLookbackMinutes>120||next.fitWindowMinutes<5||next.fitWindowMinutes>120||next.minFitPoints<3||next.minFitSpanMinutes<=0||next.minCoverage<=0||next.minCoverage>1)throw Error('Некоректні параметри прогнозу');
    if(next.expectedIntervalSeconds<=0||next.expectedIntervalSeconds>3600||next.maxAgeSeconds<=0||next.maxGapSeconds<next.expectedIntervalSeconds)throw Error('Перевірте інтервал, TTL і допустимий розрив');
    if(!Number.isInteger(next.confirmationSamples)||next.confirmationSamples<1||next.confirmationSamples>20)throw Error('Підтвердження: від 1 до 20 пакетів');
    next.revision=(previous.revision||0)+1;state.sensorSettings[key]=next;return next;
  }
  const value=(packet,key)=>packet?.[TYPES[key]?.field];
  function inspect(packet,key,now,config){
    const c=config||defaults(key),x=value(packet,key),ts=packet?.ts;
    if(!packet)return {quality:'missing',value:null,ts:null,reason:'Пакет відсутній'};
    if(!Number.isFinite(ts)||Math.abs(ts)>8640000000000000)return {quality:'invalid',value:null,ts:null,reason:'Некоректна часова мітка'};
    if(Number.isFinite(now)&&ts>now)return {quality:'future',value:null,ts,reason:'Мітка часу в майбутньому'};
    if((KEYS.includes(key)&&packet.quality==='offline')||x===null||x===undefined)return {quality:'missing',value:null,ts,reason:'Немає значення або зв’язку'};
    if((KEYS.includes(key)&&packet.quality==='invalid')||!Number.isFinite(x))return {quality:'invalid',value:null,ts,reason:'Некоректне числове значення'};
    const unit=packet.units?.[TYPES[key].field]??packet.units?.[key];
    if(unit!==undefined&&unit!==c.unit)return {quality:'invalid',value:null,ts,reason:`Одиниці ${unit} не відповідають ${c.unit}`};
    if(KEYS.includes(key)&&packet.quality&&!['good','manual'].includes(packet.quality))return {quality:'invalid',value:null,ts,reason:'Якість пакета не підтверджена'};
    const ageSeconds=Number.isFinite(now)?Math.max(0,(now-ts)/1000):0;
    if(KEYS.includes(key)&&ageSeconds>c.maxAgeSeconds)return {quality:'stale',value:null,lastValue:x,ts,ageSeconds,reason:`Вік ${ageSeconds.toFixed(0)} с перевищує TTL ${c.maxAgeSeconds} с`};
    return {quality:'good',value:x,ts,ageSeconds,reason:null};
  }
  function limitsText(state,key){const c=get(state,key),bounds=[c.min===null?null:`нижня ${c.min}`,c.max===null?null:`верхня ${c.max}`].filter(Boolean);return bounds.length?bounds.join(' · ')+' '+c.unit:'Допустимі межі не задані';}
  const api={TYPES,KEYS,defaults,prepare,get,update,inspect,value,limitsText};root.AstrisSensors=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
