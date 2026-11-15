'use strict';
// ASTRIS smoke check: API availability + installed model + real generation.
const url=(process.env.ASTRIS_OLLAMA_URL||'http://127.0.0.1:11434').replace(/\/$/,'');
const model=process.env.ASTRIS_OLLAMA_MODEL||'qwen3.5:4b';
async function main(){
  if(!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url))throw Error('Use a LOCAL Ollama URL only.');
  const tags=await fetch(url+'/api/tags',{signal:AbortSignal.timeout(3000)}).then(r=>{if(!r.ok)throw Error('Ollama HTTP '+r.status);return r.json();});
  const available=(tags.models||[]).map(x=>x.name);
  console.log('Ollama API: ready; installed models:',available.join(', ')||'none');
  if(!available.includes(model))throw Error('Model '+model+' not installed. Run: ollama pull '+model);
  console.log('Running a short local Qwen generation test…');
  const r=await fetch(url+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model,stream:false,think:false,options:{num_predict:200,temperature:0.1},messages:[{role:'user',content:'Відповідай українською однією фразою: локальна модель доступна.'}]}),signal:AbortSignal.timeout(180000)});
  if(!r.ok)throw Error('AI generation HTTP '+r.status);
  const data=await r.json();const output=String(data?.message?.content||'').trim();
  if(!output)throw Error('Ollama returned empty content.');
  console.log('Qwen response:',output.slice(0,600));
  console.log('Model:',data.model,'Prompt tokens:',data.prompt_eval_count??'?','Output tokens:',data.eval_count??'?');
}
main().catch(e=>{console.error('ASTRIS AI check failed:',e.message);process.exitCode=1;});
