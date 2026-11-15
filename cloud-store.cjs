'use strict';
// Persistent key/value state for ASTRIS demonstration journals and AI reports.
// Uses only Node.js fetch and Supabase PostgREST; no secret reaches the browser.
const configured = Boolean(process.env.SUPABASE_URL || process.env.SUPABASE_SECRET_KEY);
const required = process.env.NODE_ENV === 'production' || process.env.ASTRIS_REQUIRE_CLOUD_STORE === '1';
const enabled = configured || required;
const url = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const key = String(process.env.SUPABASE_SECRET_KEY || '');
if(enabled){
  if(!url || !key)throw Error('Persistent storage requires SUPABASE_URL and SUPABASE_SECRET_KEY. Do not use Render local files.');
  let origin;
  try{origin=new URL(url);}catch{throw Error('SUPABASE_URL must be a valid URL.');}
  const mock=process.env.NODE_ENV==='test' && process.env.ASTRIS_ALLOW_MOCK_STORAGE==='1';
  if((origin.protocol!=='https:' || !origin.hostname.endsWith('.supabase.co') || origin.pathname!=='/' || origin.search || origin.hash) && !mock){
    throw Error('SUPABASE_URL must be a https://...supabase.co project URL.');
  }
  if(!mock && !key.startsWith('sb_secret_') && !key.startsWith('eyJ'))throw Error('Use a Supabase SECRET (server) key; never a publishable key.');
}
const api= url + '/rest/v1/astris_kv';
const headers=()=>({'apikey':key,'Content-Type':'application/json','Accept':'application/json'});
async function query(uri,opts={}){
  let r;try{r=await fetch(uri,{...opts,headers:{...headers(),...(opts.headers||{})},redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw Object.assign(Error('Supabase storage is temporarily unreachable.'),{status:503});}
  if(!r.ok){
    // Avoid logging credentials, response bodies, and URLs with user data.
    throw Object.assign(Error(`Supabase data store returned HTTP ${r.status}. Check table astris_kv, RLS/grants and server key.`),{status:503});
  }
  if (r.status === 204 || opts.method === 'POST') return null;
  return r.json();
}
async function get(name,defaultValue){
  if(!enabled)return defaultValue;
  const rows=await query(api+'?select=payload&name=eq.'+encodeURIComponent(name)+'&limit=1');
  return Array.isArray(rows)&&rows.length ? rows[0].payload : defaultValue;
}
async function put(name,value){
  if(!enabled)return;
  await query(api+'?on_conflict=name',{method:'POST',headers:{'Prefer':'resolution=merge-duplicates,return=minimal'},body:JSON.stringify([{name,payload:value,updated_at:new Date().toISOString()}])});
}
module.exports={enabled,get,put};
