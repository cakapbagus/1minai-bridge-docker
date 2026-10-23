import { readFile, writeFile, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkDetails } from './network-errors.mjs';

// Source used by the docs AI Model dropdown (feature UNIFY_CHAT_WITH_AI).
export const MODEL_SOURCE='https://api.1min.ai/models?feature=UNIFY_CHAT_WITH_AI';
const cacheURL=new URL('./models-cache.json',import.meta.url);
export const validModelId=id=>typeof id==='string' && /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,199}$/.test(id);
export function normalizeModels(payload) {
  if(!Array.isArray(payload?.models))throw new Error('Invalid model catalog schema.');
  const unique=new Map();
  for(const row of payload.models){
    if(row?.modelId==='NOT_APPLICABLE')continue;
    if(!validModelId(row?.modelId))throw new Error('Invalid model ID in catalog.');
    unique.set(row.modelId,{id:row.modelId,object:'model',created:0,
      owned_by:typeof row.provider==='string'?row.provider:'1minai',
      name:typeof row.name==='string'?row.name:row.modelId});
  }
  if(!unique.size)throw new Error('Empty model catalog; keeping previous list.');
  return [...unique.values()];
}
export async function fetchModels(fetchImpl=fetch) {
  // Public metadata only; no API key, no billable chat request.
  const res=await fetchImpl(MODEL_SOURCE,{signal:AbortSignal.timeout(10000),redirect:'error'});
  if(!res.ok){await res.body?.cancel();throw new Error(`Model catalog HTTP ${res.status}`);}
  return normalizeModels(await res.json());
}
export async function readSnapshot() {
  try {
    const data=JSON.parse(await readFile(cacheURL,'utf8'));
    if(!Array.isArray(data.models)||!data.models.length||!data.models.every(m=>validModelId(m.id)))return [];
    return data.models;
  }catch{return [];}
}
export async function saveSnapshot(models) {
  const temporary=new URL(`./models-cache.${randomUUID()}.tmp`,import.meta.url);
  await writeFile(temporary,JSON.stringify({source:MODEL_SOURCE,updatedAt:new Date().toISOString(),models},null,2)+'\n');
  await rename(temporary,cacheURL);
  await writeFile(new URL('./model-ids.txt',import.meta.url),models.map(m=>m.id).join('\n')+'\n');
}
export function createCatalog({initial=[],fetchImpl=fetch,now=Date.now,ttlMs=3600000,retryMs=60000}={}) {
  let models=initial,expires=0,pending=null,source='snapshot',lastError=null;
  return {
    async get(){
      if(now()<expires)return {models,source,lastError};
      if(pending)return pending;
      pending=(async()=>{
        try{models=await fetchModels(fetchImpl);source='live';lastError=null;expires=now()+ttlMs;}
        catch(e){lastError=networkDetails(e).codes.join(',');expires=now()+retryMs;source='snapshot';if(!models.length)throw new Error('Catalog unavailable; run node models.mjs --refresh or add an exact model ID manually.');}
        return {models,source,lastError};
      })();
      try{return await pending;}finally{pending=null;}
    }
  };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    let models;
    if(process.argv.includes('--refresh')){models=await fetchModels();await saveSnapshot(models);console.log(`Saved ${models.length} models. Restart bridge if it is already running.`);}
    else{models=await readSnapshot();if(!models.length)throw new Error('Run node models.mjs --refresh.');}
    for(const m of models)console.log(m.id+'\t'+m.name);
  }catch(e){console.error('Model catalog failed: '+(e.message.startsWith('Model catalog')||e.message.startsWith('Run node')?e.message:networkDetails(e).message));process.exitCode=1;}
}
