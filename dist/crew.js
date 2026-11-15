(()=>{
'use strict';
const $=s=>document.querySelector(s);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const keys=[
 {key:'hr',field:'hr',name:'Пульс',unit:'уд/хв'},
 {key:'bp',field:'sys',name:'Систолічний тиск',unit:'мм рт. ст.'},
 {key:'dia',field:'dia',name:'Діастолічний тиск',unit:'мм рт. ст.'},
 {key:'spo2',field:'spo2',name:'SpO₂',unit:'%'},
 {key:'temp',field:'temp',name:'Температура тіла',unit:'°C'},
 {key:'glucose',field:'glucose',name:'Глюкоза',unit:'мг/дл'}
];
const mainKeys=['hr','bp','spo2','temp','glucose'];
let data=null,page='home',metric='hr',minutes=60,horizon=5,analyticsResult=null,analysisKey='',analysisError='',analysisLoading=false,requestId=0,posting=false,refreshPending=false,aiConsent=false,aiError='',aiHealth=null,aiHealthLoading=false,aiHealthAt=0;
let teamData=null,teamSelectedId=null,teamLoading=false,teamError='';
try{localStorage.removeItem('astris-demo-v1');}catch{}
async function api(url,method='GET',body){
 const r=await fetch(url,{method,credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-Astris-Action':'1'},body:body===undefined?undefined:JSON.stringify(body)});
 if(r.status===401){location.replace('/login.html');throw Error('Сеанс завершено.');}
 const result=await r.json();if(!r.ok)throw Error(result.error||'Помилка запиту');return result;
}
const fmt=(n,d=1)=>Number.isFinite(n)?Number(n).toLocaleString('uk-UA',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const time=ts=>Number.isFinite(ts)?new Date(ts).toLocaleString('uk-UA',{timeZone:'UTC',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})+' UTC':'—';
const age=()=>data?.receivedAt?Date.now()-data.receivedAt:Infinity;
const current=()=>data?.history?.at(-1)||null;
const isFresh=()=>data?.running===true&&age()<12000;
const channel=m=>{
 const p=current(),ok=!!p&&p.quality==='good'&&Number.isFinite(p[m.field])&&Number.isFinite(p.ts)&&p.ts<=data.missionTime&&data.missionTime-p.ts<=180000;
 return {value:ok?p[m.field]:null,quality:!p?'missing':ok?'good':p.quality==='good'?'stale':p.quality||'invalid'};
};
const activeAlerts=()=>data?.alerts?.filter(a=>!a.resolvedAt)||[];
function selectedAlerts(metricKey){return activeAlerts().filter(a=>a.metric===metricKey||(metricKey==='bp'&&a.metric==='dia'));}
function metricValue(m){if(m.key==='bp'){
  const sys=channel(keys[1]),dia=channel(keys[2]);return sys.value===null||dia.value===null?'—':fmt(sys.value,0)+'/'+fmt(dia.value,0);
 }
 const v=channel(m);return v.value===null?'—':fmt(v.value,['spo2','temp'].includes(m.key)?1:0);
}
function metricStatus(m){if(selectedAlerts(m.key).length)return {label:'Є активний сигнал',cls:'warning'};
 const v=channel(m);if(v.value===null)return {label:'Немає актуального вимірювання',cls:'invalid'};
 if(!isFresh())return {label:data?.running?'Очікування оновлення':'Симуляцію зупинено',cls:'muted'};
 return {label:'Симульовані дані · оновлюються',cls:'good'};
}
function indicator(){if(!data?.receivedAt)return ['Очікування телеметрії','warn'];if(!data.running)return ['Симуляція на паузі','warn'];if(age()>12000)return ['Немає нових пакетів','warn'];return ['Спільний потік із сервера','good'];}
function overview(){
 const cards=mainKeys.map(key=>{const m=keys.find(x=>x.key===key),state=metricStatus(m),value=metricValue(m);
 return `<button class="crew-card crew-metric ${state.cls}" data-metric="${m.key}" data-goto="analytics"><span>${escape(m.key==='bp'?'Артеріальний тиск':m.name)}</span><strong>${escape(value)}<small> ${escape(m.unit)}</small></strong><p><i class="crew-dot ${state.cls}"></i>${escape(state.label)}</p></button>`;
 }).join('');
 const alerts=activeAlerts().length;
 return `<div class="crew-heading"><div><h1>Моє здоров'я</h1><p>${escape(data.crew?.name||'Астронавт')} · поточні показники вашого профілю.</p></div><span class="crew-live-label">Місія: ${time(data.missionTime)}</span></div>
 <div class="crew-grid">${cards}</div>
 <section class="crew-panel"><div class="crew-row"><div><h2>Персональна аналітика</h2><p>Графіки та прогнози з розрахункового ядра ASTRIS Ground, тільки для вашого профілю.</p></div><div class="crew-row-actions"><button class="crew-action ghost" data-goto="analytics">Мої графіки</button><button class="crew-action" data-goto="forecast">Прогнозування</button></div></div></section>
 <section class="crew-panel"><div class="crew-row"><div><h2>Сповіщення <span class="crew-count">${alerts}</span></h2><p>${alerts?`Активних сигналів: ${alerts}. Відкрийте деталі.`:'Активних сигналів за налаштованими правилами немає.'}</p></div><button class="crew-action ghost" data-goto="alerts">Переглянути сповіщення</button></div></section>
 <section class="crew-panel"><div class="crew-row"><div><h2>Аналіз моїх даних</h2><p>Запустіть персональний AI-розбір поточного стану, динаміки та прогнозів.</p></div><button class="crew-action ghost" data-goto="guidance">Відправити на аналіз</button></div></section>`;
}

// A fellow astronaut may view ONLY the current measurements of the other five.
// The server removes all personal history, forecasts, alerts and diary records.
function team(){
 const people=teamData?.members||[];
 if(!people.some(c=>c.id===teamSelectedId))teamSelectedId=people[0]?.id||null;
 const selected=people.find(c=>c.id===teamSelectedId);
 const live=teamData?.running===true && teamData?.receivedAt && Date.now()-teamData.receivedAt<12000;
 const roster=people.map(c=>{
   const active=c.id===teamSelectedId;
   const initials=c.name.split(/\s+/u).map(x=>x[0]||'').slice(0,2).join('');
   const status=c.quality==='good'?(live?'На зв’язку':'Потік призупинено'):'Немає актуального сигналу';
   return `<button type="button" class="crew-teammate ${active?'selected':''}" data-team-id="${escape(c.id)}" aria-pressed="${active}"><span class="crew-teammate-avatar">${escape(initials)}</span><span class="crew-teammate-info"><strong>${escape(c.name)}</strong><small>${escape(c.role)}</small></span><span class="crew-teammate-dot ${live&&c.quality==='good'?'active':''}" aria-label="${escape(status)}"></span></button>`;
 }).join('');
 const value=field=>Number.isFinite(selected?.values?.[field])?fmt(selected.values[field],['spo2','temp'].includes(field)?1:0):'—';
 const bp=Number.isFinite(selected?.values?.sys)&&Number.isFinite(selected?.values?.dia)?value('sys')+'/'+value('dia'):'—';
 const tiles=selected?[['Пульс',value('hr'),'уд/хв'],['Артеріальний тиск',bp,'мм рт. ст.'],['SpO₂',value('spo2'),'%'],['Температура тіла',value('temp'),'°C'],['Глюкоза',value('glucose'),'мг/дл']].map(([label,n,unit])=>`<div class="crew-team-metric"><span>${escape(label)}</span><strong>${escape(n)}</strong><small>${escape(unit)}</small></div>`).join(''):'';
 const statusText=!teamData?'Підключаємося до потоку…':!teamData.running?'Симуляцію призупинено':!live?'Очікування оновлення':selected?.quality==='good'?'Показники оновлюються':'Перевірте актуальність вимірювання';
 return `<div class="crew-heading"><div><h1>Екіпаж</h1><p>Поточні показники інших учасників місії в реальному часі.</p></div><span class="crew-live-label">Місія: ${time(teamData?.missionTime??data?.missionTime)}</span></div>
 <div class="crew-team-layout"><section class="crew-panel crew-team-roster"><div class="crew-team-panel-heading"><h2>Учасники екіпажу</h2><span>${people.length||5} осіб</span></div>${roster||'<p class="crew-empty">Завантажуємо екіпаж…</p>'}</section>
 <section class="crew-panel crew-team-detail">${selected?`<div class="crew-team-detail-head"><div><span class="crew-team-eyebrow">МОНІТОРИНГ</span><h2>${escape(selected.name)}</h2><p>${escape(selected.role)}</p></div><span class="crew-team-live-state ${live&&selected.quality==='good'?'live':''}"><i></i>${escape(statusText)}</span></div><div class="crew-team-metrics">${tiles}</div><div class="crew-team-footer">Останнє вимірювання: ${time(selected.sampleAt)} · Дані спільного потоку Ground</div>`:'<p class="crew-empty">Оберіть учасника екіпажу.</p>'}</section></div>
 ${teamError?`<p class="crew-error" role="alert">${escape(teamError)}</p>`:''}`;
}
async function loadTeam(){
 if(teamLoading)return;
 teamLoading=true;
 try{teamData=await api('/api/crew/team');teamError='';}
 catch(e){teamError=e.message;}
 finally{teamLoading=false;if(page==='team'&&data)$('#crew-main').innerHTML=team();}
}
function controls(){return `<div class="crew-controls"><label>Показник<select id="crew-metric">${keys.map(m=>`<option value="${m.key}" ${metric===m.key?'selected':''}>${escape(m.name)}</option>`).join('')}</select></label><label>Історія<select id="crew-minutes">${[30,60,120].map(n=>`<option value="${n}" ${minutes===n?'selected':''}>${n} хв</option>`).join('')}</select></label><label>Прогноз<select id="crew-horizon">${[1,5,10,15].map(n=>`<option value="${n}" ${horizon===n?'selected':''}>+${n} хв</option>`).join('')}</select></label></div>`;}
function chart(q){
 if(!q)return '<p class="crew-empty">Очікування графіка…</p>';
 const series=(q.series||[]).filter(p=>Number.isFinite(p.ts));const facts=series.filter(p=>p.quality==='good'&&Number.isFinite(p.y));
 const fp=q.forecast.eligible?(q.forecast.points||[]).filter(p=>Number.isFinite(p.ts)&&Number.isFinite(p.y)):[];
 if(facts.length<2)return '<p class="crew-empty">Недостатньо валідних вимірювань для графіка.</p>';
 const w=900,h=330,L=62,R=26,T=24,B=42,full=[...facts.map(p=>p.y),...fp.flatMap(p=>[p.y,p.lower,p.upper].filter(Number.isFinite))],yMin=Math.min(...full),yMax=Math.max(...full),pad=Math.max((yMax-yMin)*.12,.25),lo=yMin-pad,hi=yMax+pad;
 const ts=[...facts.map(p=>p.ts),...fp.map(p=>p.ts)],start=Math.min(...ts),end=Math.max(...ts),x=v=>L+(v-start)/Math.max(1,end-start)*(w-L-R),y=v=>h-B-(v-lo)/(hi-lo)*(h-B-T);
 const line=points=>points.length<2?'':`<polyline fill="none" stroke="#bca0e5" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" points="${points.map(p=>x(p.ts).toFixed(2)+','+y(p.y).toFixed(2)).join(' ')}"/>`;
 const segments=[];let segment=[];for(const p of series){if(p.quality!=='good'||!Number.isFinite(p.y)){if(segment.length>1)segments.push(segment);segment=[];continue;}segment.push(p);}if(segment.length>1)segments.push(segment);
 const band=fp.length>1&&fp.every(p=>Number.isFinite(p.lower)&&Number.isFinite(p.upper))?`<polygon points="${fp.map(p=>x(p.ts)+','+y(p.upper)).join(' ')} ${[...fp].reverse().map(p=>x(p.ts)+','+y(p.lower)).join(' ')}" fill="#9b7fc7" opacity=".20"/>`:'';
 const projection=fp.length>1?`<polyline fill="none" stroke="#d9bc88" stroke-width="2.8" stroke-dasharray="8 6" stroke-linecap="round" stroke-linejoin="round" points="${fp.map(p=>x(p.ts).toFixed(2)+','+y(p.y).toFixed(2)).join(' ')}"/>`:'';
 const grid=Array.from({length:5},(_,i)=>{const v=hi-(hi-lo)*i/4,yy=y(v);return `<line x1="${L}" y1="${yy}" x2="${w-R}" y2="${yy}" stroke="#36303f"/><text x="${L-12}" y="${yy+4}" text-anchor="end" fill="#9589a3" font-size="12">${fmt(v,1)}</text>`;}).join('');
 const divider=fp.length?`<line x1="${x(fp[0].ts)}" y1="${T}" x2="${x(fp[0].ts)}" y2="${h-B}" stroke="#80698e" stroke-dasharray="3 5"/>`:'';
 return `<div class="crew-chart-wrap"><svg class="crew-chart" role="img" aria-label="Історія та прогноз: ${escape(keys.find(k=>k.key===q.key)?.name||q.key)}" viewBox="0 0 ${w} ${h}">${grid}${band}${divider}${segments.map(line).join('')}${projection}<text x="${L}" y="${h-14}" fill="#9c8caa" font-size="12">${time(start)}</text><text x="${w-R}" y="${h-14}" text-anchor="end" fill="#9c8caa" font-size="12">${time(end)}</text></svg></div>
 <div class="crew-chart-legend"><span><i class="crew-line"></i> Вимірювання</span><span><i class="crew-line forecast"></i> Прогноз</span><span><i class="crew-band"></i> Розрахунковий діапазон</span></div>`;
}
function quality(q){return q?.quality==='good'?'Актуальний канал':q?.quality==='stale'?'Застарілі дані':q?.quality==='missing'?'Немає даних':'Перевірте якість вимірювань';}
function detail(q){if(!q)return '';
 const name=keys.find(m=>m.key===q.key)?.name||q.key,units=q.unit;
 return `<section class="crew-panel crew-chart-panel"><div class="crew-row"><div><h2>${escape(name)}</h2><p>${escape(quality(q))} · ${q.coverage===null?'—':fmt(q.coverage,1)+'%'} повноти вибірки</p></div><span class="crew-quiet">${q.forecast.eligible?`Модель: ${escape(q.forecast.model)}`:'Прогноз недоступний'}</span></div>${chart(q)}
 <div class="crew-summary-grid"><div><span>Останнє</span><b>${fmt(q.current,2)} <small>${escape(units)}</small></b></div><div><span>Середнє</span><b>${fmt(q.mean,2)}</b></div><div><span>Мін / макс</span><b>${fmt(q.min,2)} / ${fmt(q.max,2)}</b></div><div><span>Швидкість зміни</span><b>${fmt(q.rate?.value,2)} <small>${escape(units)}/хв</small></b></div></div>
 <p class="crew-explain">${q.forecast.eligible?`Обрана модель: ${escape(q.forecast.model)}. Горизонт +${q.horizon} хв. Прогноз і діапазон розраховані за попередніми вимірюваннями, а не за майбутніми фактами.`:`Прогноз не побудовано: ${escape(q.forecast.reason||'недостатньо якісних даних')}.`}</p></section>`;
}
function results(){return analyticsResult?.analyses||[];}
function analytics(){const q=results().find(x=>x.key===metric);
 return `<div class="crew-heading"><h1>Мої графіки</h1><p>Історія та прогноз на основі того самого математичного ядра, що використовується в Ground.</p></div>${controls()}${analysisError?`<p class="crew-error">${escape(analysisError)}</p>`:''}${analysisLoading&&!q?'<section class="crew-panel"><p>Обчислюємо аналітику…</p></section>':detail(q)||'<section class="crew-panel"><p>Оберіть показник для аналізу.</p></section>'}`;
}
function forecast(){const qs=results();
 const cards=keys.map(m=>{const q=qs.find(x=>x.key===m.key),p=q?.forecast?.eligible?q.forecast.points.at(-1):null;
 return `<button class="crew-card crew-forecast-card ${metric===m.key?'selected':''}" data-metric="${m.key}" data-goto="forecast"><span>${escape(m.name)} · +${horizon} хв</span><strong>${p&&Number.isFinite(p.y)?fmt(p.y,2):'—'} <small>${escape(m.unit)}</small></strong><p>${escape(q?.forecast?.model||'Прогноз недоступний')}</p></button>`;
 }).join('');
 return `<div class="crew-heading"><h1>Моє прогнозування</h1><p>Усі шість каналів: прогноз за моделями ASTRIS Ground із вибором горизонту.</p></div>${controls()}${analysisError?`<p class="crew-error">${escape(analysisError)}</p>`:''}${analysisLoading&&!qs.length?'<p class="crew-empty">Обчислюємо прогнози…</p>':''}<div class="crew-grid">${cards}</div>${detail(qs.find(x=>x.key===metric))}<div class="crew-disclaimer">Прогнози дослідницькі та синтетичні. Модель може помилятися; діапазон не гарантує майбутнього покриття. Пороги налаштовує оператор.</div>`;
}
function wellnessResult(text){
 const body=String(text||'').trim();
 const pattern=/(?:^|\n)\s*(?:#{1,4}\s*)?(?:\*\*)?(Що змінилося|Що спробувати сьогодні|Що перевірити завтра)\s*(?:\*\*)?\s*:\s*(?:\*\*)?/giu;
 const matches=[...body.matchAll(pattern)];
 if(matches.length!==3)return `<p class="crew-analysis-summary" style="white-space:pre-wrap">${escape(body)}</p>`;
 const icons=['◉','✦','↗'];
 return `<div class="wellness-sections">${matches.map((m,i)=>{
   const begin=m.index+m[0].length,end=matches[i+1]?.index??body.length;
   return `<section class="wellness-section wellness-step-${i+1}"><div class="wellness-section-title"><span aria-hidden="true">${icons[i]}</span><h3>${escape(m[1])}</h3></div><div class="wellness-section-content">${escape(body.slice(begin,end).trim())}</div></section>`;
 }).join('')}</div>`;
}
function guidance(){const r=data.report;
 const check=aiHealth===null?'<span class="assistant-status pending">Перевіряємо статус помічника…</span>':aiHealth.modelReady?`<span class="assistant-status ready">● ${aiHealth.provider==='groq-cloud'?'Groq налаштовано':'Помічник готовий'}: ${escape(aiHealth.model)}</span>`:`<span class="assistant-status waiting">● ${escape(aiHealth.message||'Помічник недоступний')}</span>`;
 const legacy=['g4f-ai','openrouter-ai'].includes(r?.method);
 return `<div class="crew-heading crew-heading-assistant"><div><h1>AI-помічник</h1><p>Персональні поради для кращого самопочуття на основі показників і щоденника.</p></div></div><section class="crew-analysis-launch assistant-panel"><div class="assistant-toolbar"><div class="assistant-title"><span class="assistant-kicker">ASTRIS Assistant</span><h2>Що допоможе почуватися краще?</h2></div><div class="assistant-actions"><div class="crew-disclaimer assistant-check" role="status">${check}</div><button class="crew-action ghost" id="ai-check" type="button">Оновити статус</button></div></div><button id="analyze-now" class="crew-action crew-analyze-btn" ${posting?'disabled':''}>${posting?'Готуємо ваші поради…':'Отримати персональні поради'}</button><p id="ai-error" class="crew-error" role="alert">${escape(aiError)}</p></section>${!r?'':`<section class="crew-panel"><div class="crew-row"><h2>${r.method==='local-statistical'?'Автоматичні поради ASTRIS':'Ваші персональні рекомендації'}</h2><span class="crew-quiet">${escape(r.createdAt||'')}</span></div>${wellnessResult(r.summary)}${r.fallbackReason?`<p class="crew-hint">${escape(r.fallbackReason)}</p>`:''}${['ollama-ai','groq-ai','g4f-ai','openrouter-ai'].includes(r.method)?`<p class="crew-disclaimer">Модель: ${escape(r.model)} · Вимірювання за 30 с: ${Number(r.telemetryPointsSent)||0} · Записи щоденника: ${Number(r.diaryEntriesSent)||0} · Токени: ${r.usage?.total_tokens??'дані недоступні'}${r.olderSampleSent?' · Додано останній старіший вимір':''}</p>`:r.observations?`<div class="crew-analysis-table"><div class="head"><span>Показник</span><span>Поточне</span><span>Прогноз +5 хв</span><span>Модель</span></div>${r.observations.map(o=>`<div><span>${escape(o.label)}</span><span>${fmt(o.current,2)} ${escape(o.unit||'')}</span><span>${fmt(o.forecast,2)}</span><span>${escape(o.model||'—')}</span></div>`).join('')}</div>`:''}${r.disclaimer?`<p class="crew-disclaimer">${escape(r.disclaimer)}</p>`:''}</section>`}`;
}
async function loadAiHealth(force=false){
 if(aiHealthLoading||(!force&&aiHealth&&Date.now()-aiHealthAt<20000))return;
 aiHealthLoading=true;
 try{aiHealth=await api('/api/crew/ai-status');}catch(e){aiHealth={modelReady:false,message:e.message};}
 finally{aiHealthAt=Date.now();aiHealthLoading=false;if(page==='guidance')render();}
}

function alerts(){const all=data.alerts||[],active=activeAlerts(),resolved=all.filter(a=>a.resolvedAt);
 const item=a=>`<article class="crew-alert ${a.severity==='critical'?'critical':'warning'}"><div class="crew-row"><h3>${escape(a.title||'Сповіщення')}</h3><span class="crew-quiet">${escape(a.origin||'')}</span></div><p>${escape(keys.find(k=>k.key===a.metric)?.name||a.metric||'Кілька каналів')} · ${a.resolvedAt?'Завершено':'Активний сигнал'}${a.acknowledgedAt?' · Взято в роботу оператором':''}</p><small>${time(a.ts)}</small></article>`;
 return `<div class="crew-heading"><h1>Мої сповіщення</h1><p>Сигнали тільки вашого профілю, зі спільного джерела ASTRIS Ground.</p></div><section class="crew-panel"><h2>Активні · ${active.length}</h2>${active.length?active.map(item).join(''):'<p class="crew-empty">Активних сигналів за налаштованими правилами немає. Це не підтвердження здоров’я.</p>'}</section><section class="crew-panel"><h2>Завершені · ${resolved.length}</h2>${resolved.length?resolved.slice(0,30).map(item).join(''):'<p class="crew-empty">Завершених сигналів поки немає.</p>'}</section>`;
}
function journal(){return `<div class="crew-heading"><h1>Мій щоденник</h1><p>Самооцінка зберігається окремо від показників датчиків і доступна лише вашому акаунту та наземному оператору.</p></div><div class="crew-grid two"><section class="crew-panel" style="margin-top:0"><h2>Новий запис</h2><form id="checkin-form"><label class="crew-field">Сон за останню добу, год<input type="number" name="sleep" min="0" max="24" step="0.1" value="7" required></label><label class="crew-field">Самопочуття<select name="mood"><option value="1">1 — Дуже погано</option><option value="2">2 — Погано</option><option value="3">3 — Задовільно</option><option value="4" selected>4 — Добре</option><option value="5">5 — Дуже добре</option></select></label><label class="crew-field">Нотатка<textarea name="notes" maxlength="500" placeholder="Сон, активність, відчуття…"></textarea></label><p id="checkin-error" class="crew-error" role="alert"></p><button type="submit" class="crew-action">Зберегти запис</button></form></section><section class="crew-panel" style="margin-top:0"><h2>Історія</h2>${data.checkins?.length?data.checkins.map(c=>`<div class="crew-entry"><b>${escape(c.at)}</b>Сон: ${fmt(c.sleep,1)} год · Самопочуття: ${c.mood}/5${c.notes?`<p>${escape(c.notes)}</p>`:''}</div>`).join(''):'<p class="crew-empty">Ще немає записів.</p>'}</section></div>`;}
const pages={home:overview,team,analytics,forecast,guidance,alerts,journal};
function render(){if(!data)return;page=pages[location.hash.slice(1)]?location.hash.slice(1):'home';
 $('#crew-person').innerHTML=`<b>${escape(data.crew?.name||'Астронавт')}</b><small>${escape(data.crew?.role||'')} · ${escape(data.user?.username||'')}</small>`;
 $('#welcome').textContent='ASTRIS Crew · '+(data.crew?.name||'особистий кабінет');
 $('#crew-alert-count').textContent=activeAlerts().length;
 const [label,cls]=indicator(),el=$('#feed-status');el.textContent=label;el.className='crew-top-status '+cls;
 document.querySelectorAll('[data-tab]').forEach(a=>{a.classList.toggle('active',a.dataset.tab===page);if(a.dataset.tab===page)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
 if(!(['journal','analytics','forecast'].includes(page)&&$('#crew-main')?.contains(document.activeElement)&&['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)))$('#crew-main').innerHTML=pages[page]();
 if(page==='team'&&!teamData&&!teamLoading)loadTeam();
 if(['analytics','forecast'].includes(page))loadAnalytics();
 if(page==='guidance'&&(!aiHealth||Date.now()-aiHealthAt>20000))loadAiHealth();
}
async function loadAnalytics(force=false){
 if(!data||!['analytics','forecast'].includes(page))return;
 const all=page==='forecast',key=`${data.missionTime}|${page}|${all?'all':metric}|${minutes}|${horizon}`;
 if(!force&&analysisKey===key)return;
 analysisKey=key;analysisLoading=true;analysisError='';const id=++requestId;
 try{const result=await api(`/api/crew/analysis?metric=${all?'all':metric}&minutes=${minutes}&horizon=${horizon}`);if(id===requestId){analyticsResult=result;analysisError='';}}
 catch(e){if(id===requestId){analyticsResult=null;analysisError=e.message;}}
 finally{if(id===requestId){analysisLoading=false;if(['analytics','forecast'].includes(page))$('#crew-main').innerHTML=pages[page]();}}
}
async function refresh(){if(refreshPending)return;refreshPending=true;try{const next=await api('/api/crew/me');const changed=!data||next.missionTime!==data.missionTime||next.receivedAt!==data.receivedAt||JSON.stringify(next.alerts)!==JSON.stringify(data.alerts)||JSON.stringify(next.checkins)!==JSON.stringify(data.checkins)||JSON.stringify(next.report)!==JSON.stringify(data.report);
 data=next;if(changed)render();else{const [label,cls]=indicator(),el=$('#feed-status');el.textContent=label;el.className='crew-top-status '+cls;}}
 catch(e){console.error('ASTRIS Crew',e);if(!data)$('#crew-main').textContent=e.message;}
 finally{refreshPending=false;}}
function toast(message){const el=$('#crew-toast');el.textContent=message;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),3000);}
document.addEventListener('click',async e=>{
 const teamButton=e.target.closest('[data-team-id]');
 if(teamButton){const id=teamButton.dataset.teamId;if(teamData?.members?.some(c=>c.id===id)){teamSelectedId=id;if(page==='team')$('#crew-main').innerHTML=team();}return;}
 const m=e.target.closest('[data-metric]');if(m){metric=m.dataset.metric;analyticsResult=null;analysisKey='';}
 const go=e.target.closest('[data-goto]');if(go){const next=go.dataset.goto;if(location.hash!=='#'+next)location.hash=next;else render();return;}
 if(m){render();return;}
 if(e.target.closest('#ai-check')){aiHealthAt=0;loadAiHealth(true);return;}
 if(e.target.closest('#analyze-now')){if(posting)return;posting=true;aiError='';render();try{const result=await api('/api/crew/analyze','POST',{consent:true});data.report=result.report;toast(result.aiUnavailable?'Показано автоматичні поради ASTRIS.':'Персональні рекомендації готові.');}catch(ex){aiError=ex.message;toast(ex.message);}finally{posting=false;render();}}
});
document.addEventListener('change',e=>{
 if(e.target.id==='ai-consent'){aiConsent=e.target.checked;aiError='';}
 if(e.target.id==='crew-metric'){metric=e.target.value;analysisKey='';analyticsResult=null;render();}
 if(e.target.id==='crew-minutes'){minutes=Number(e.target.value);analysisKey='';analyticsResult=null;render();}
 if(e.target.id==='crew-horizon'){horizon=Number(e.target.value);analysisKey='';analyticsResult=null;render();}
});
document.addEventListener('submit',async e=>{if(e.target.id!=='checkin-form')return;e.preventDefault();const f=e.target,err=$('#checkin-error');err.textContent='';try{await api('/api/crew/checkin','POST',{sleep:Number(f.elements.sleep.value),mood:Number(f.elements.mood.value),notes:f.elements.notes.value});await refresh();toast('Запис збережено.');}catch(ex){err.textContent=ex.message;}});
$('#logout').addEventListener('click',async()=>{await api('/api/auth/logout','POST',{});location.replace('/login.html');});
window.addEventListener('hashchange',()=>{analysisKey='';analyticsResult=null;render();});
refresh();setInterval(()=>{if(!document.hidden){refresh();if(page==='team')loadTeam();}},1200);
})();
