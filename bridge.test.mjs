import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createBridge, prepare, decode } from './bridge.mjs';
import { probe } from './check.mjs';
import { networkDetails } from './network-errors.mjs';
import {normalizeModels,createCatalog,MODEL_SOURCE} from './models.mjs';

test('nested network causes expose only allowlisted codes, not secrets',()=>{
  const error=new TypeError('secret-api-key',{cause:new AggregateError([Object.assign(new Error('secret proxy URL'),{code:'ECONNRESET'}),Object.assign(new Error('private'),{code:'ETIMEDOUT'})])});
  const info=networkDetails(error);assert.deepEqual(info.codes,['ECONNRESET','ETIMEDOUT']);assert.ok(!JSON.stringify(info).includes('secret'));
});
test('transport failure reports correct stage and actionable TLS error',async()=>{
  await withServer(async()=>{throw new TypeError('private',{cause:Object.assign(new Error('private cert'),{code:'UNABLE_TO_VERIFY_LEAF_SIGNATURE'})});},async base=>{
    const r=await post(base,body);assert.equal(r.status,502);const out=await r.json();
    assert.equal(out.error.stage,'upstream-connect');assert.deepEqual(out.error.codes,['UNABLE_TO_VERIFY_LEAF_SIGNATURE']);assert.ok(!JSON.stringify(out).includes('private'));
  });
});

const key='test-local-key-01234567890123456789';
const config={apiKey:'test-upstream-key',upstreamModel:'mock-model',bridgeKey:key};
const tool={type:'function',function:{name:'read_file',parameters:{type:'object',properties:{path:{type:'string'}},required:['path'],additionalProperties:false}}};
const body={model:'minai-agent',messages:[{role:'user',content:'Read hello.txt'}],tools:[tool]};
function envelope(ctx,data){return JSON.stringify({protocol:ctx.token,...data});}
function success(text){return Response.json({aiRecord:{status:'SUCCESS',aiRecordDetail:{resultObject:[text]}}});}
async function withServer(fetchImpl,fn,extra={},options={}){
  const server=createBridge({...config,...extra},{fetchImpl,...options});server.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}/v1`;
  try{await fn(base);}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
}
function post(base,data,auth=key){return fetch(base+'/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${auth}`,'Content-Type':'application/json'},body:JSON.stringify(data)});}

test('model tool request is decoded and rejects unknown/malformed/missing arguments',()=>{
  const c=prepare(body);
  const result=decode(envelope(c,{kind:'tool_calls',calls:[{name:'read_file',arguments:{path:'hello.txt'}}]}),c);
  assert.equal(result.tool_calls[0].function.name,'read_file');assert.match(result.tool_calls[0].id,/^call_/);
  for(const value of ['not-json',envelope(c,{kind:'tool_calls',calls:[{name:'delete_file',arguments:{}}]}),envelope(c,{kind:'tool_calls',calls:[{name:'read_file',arguments:{}}]})])assert.throws(()=>decode(value,c));
});
test('required, forced and none tool choices are enforced',()=>{
  for(const choice of ['required',{type:'function',function:{name:'read_file'}}]){
    const c=prepare({...body,tool_choice:choice});assert.throws(()=>decode(envelope(c,{kind:'final',content:'pretend done'}),c));
  }
  assert.equal(prepare({...body,tool_choice:'none'}).envelope,false);
  assert.throws(()=>prepare({...body,tool_choice:{type:'function',function:{name:'unknown'}}}));
});
test('text blocks, Unicode and prior tool results are preserved; images rejected',()=>{
  const b={...body,messages:[{role:'system',content:'Utamakan instruksi ini.'},{role:'user',content:[{type:'text',text:'ق — halo 👋'}]},{role:'assistant',content:null,tool_calls:[{id:'abc',type:'function',function:{name:'read_file',arguments:'{"path":"a"}'}}]},{role:'tool',tool_call_id:'abc',content:'line1\nline2'}]};
  const p=prepare(b).prompt;assert.ok(p.includes('ق — halo 👋'));assert.ok(p.includes('"tool_call_id":"abc"'));assert.ok(p.includes('line1\\nline2'));
  assert.throws(()=>prepare({...body,messages:[{role:'user',content:[{type:'image_url',image_url:{url:'x'}}]}]}));
});
test('HTTP contract and two-turn buffered SSE agent loop against mock 1minAI',async()=>{
  let calls=0;
  await withServer(async(url,options)=>{
    calls++;assert.equal(url,'https://api.1min.ai/api/chat-with-ai');assert.equal(options.headers['API-KEY'],'test-upstream-key');
    const p=JSON.parse(options.body);assert.equal(p.type,'UNIFY_CHAT_WITH_AI');assert.equal(p.model,'mock-model');
    const prompt=p.promptObject.prompt;
    const token=prompt.match(/"protocol":"([^"]+)"/)[1];
    const messages=JSON.parse(prompt.split('CONVERSATION_JSON:\n')[1].split('\nEND_CONVERSATION')[0]);
    if(calls===1)return success(JSON.stringify({protocol:token,kind:'tool_calls',calls:[{name:'read_file',arguments:{path:'bridge-probe.txt'}}]}));
    assert.equal(messages.at(-1).role,'tool');assert.ok(messages.at(-2).tool_calls[0].id===messages.at(-1).tool_call_id);
    return success(JSON.stringify({protocol:token,kind:'final',content:messages.at(-1).content}));
  },async base=>{await probe(base,key,'minai-agent');});
  assert.equal(calls,2);
});
test('auth and local prompt budget reject before upstream; models exposed',async()=>{
  let calls=0;
  await withServer(async()=>{calls++;return success('hello');},async base=>{
    assert.equal((await post(base,body,'wrong')).status,401);
    assert.equal((await post(base,body)).status,413);
    const r=await fetch(base+'/models',{headers:{Authorization:`Bearer ${key}`}});assert.equal((await r.json()).data[0].id,'minai-agent');
  },{maxPromptBytes:10});assert.equal(calls,0);
});
test('upstream rate limits preserved and secret response body is not exposed',async()=>{
  await withServer(async()=>new Response('sensitive-upstream-content',{status:429,headers:{'Retry-After':'5'}}),async base=>{
    const r=await post(base,body);assert.equal(r.status,429);assert.equal(r.headers.get('retry-after'),'5');assert.ok(!(await r.text()).includes('sensitive-upstream-content'));
  });
});
test('malformed upstream record and emulated JSON fail as HTTP 502 before SSE',async()=>{
  for(const upstream of [()=>Response.json({unexpected:true}),()=>success('I edited your files.')]){
    await withServer(async()=>upstream(),async base=>{const r=await post(base,{...body,stream:true});assert.equal(r.status,502);assert.match(r.headers.get('content-type'),/application\/json/);});
  }
});
test('plain chat returns OpenAI message without fabricated token usage',async()=>{
  await withServer(async()=>success('Halo 👋'),async base=>{
    const r=await post(base,{model:'minai-agent',messages:[{role:'user',content:'Halo'}]});const data=await r.json();
    assert.equal(data.choices[0].message.content,'Halo 👋');assert.equal(data.choices[0].finish_reason,'stop');assert.equal(data.usage,undefined);
  });
});
test('timeout aborts upstream and returns 504',async()=>{
  await withServer(async(_url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true})),async base=>{
    assert.equal((await post(base,body)).status,504);
  },{timeoutMs:20});
});

test('model selection is per-request, supports concurrent models, and ignores legacy config',async()=>{
  const seen=[];
  await withServer(async(_url,options)=>{
    const model=JSON.parse(options.body).model;seen.push(model);
    if(model==='model-A')await new Promise(r=>setTimeout(r,15));
    return success('Reply from '+model);
  },async base=>{
    const results=await Promise.all(['model-A','provider/model-B'].map(model=>post(base,{model,messages:[{role:'user',content:'hi'}]}).then(r=>r.json())));
    for(const [i,id] of ['model-A','provider/model-B'].entries()){
      assert.equal(results[i].model,id);assert.equal(results[i].choices[0].message.content,'Reply from '+id);
    }
  });assert.deepEqual(seen.sort(),['model-A','provider/model-B']);
});
test('actual model works without upstreamModel; legacy alias fails clearly without it',async()=>{
  await withServer(async(_url,options)=>{assert.equal(JSON.parse(options.body).model,'actual-model');return success('OK');},async base=>{
    assert.equal((await post(base,{model:'actual-model',messages:[{role:'user',content:'hi'}]})).status,200);
    assert.equal((await post(base,body)).status,400);
  },{upstreamModel:undefined});
});
test('catalog uses dropdown IDs not display labels, excludes placeholder and deduplicates',()=>{
  const rows=normalizeModels({models:[{modelId:'model-a',name:'Model A',provider:'vendor'},{modelId:'NOT_APPLICABLE'},{modelId:'model-a',name:'Model A updated'},{modelId:'vendor/model-b'}]});
  assert.deepEqual(rows.map(m=>m.id),['model-a','vendor/model-b']);
  assert.equal(rows[0].name,'Model A updated');
  assert.throws(()=>normalizeModels({models:[]}));assert.throws(()=>normalizeModels({models:[{name:'no API ID'}]}));
});
test('GET models exposes catalog and optional backward-compatible alias without key leakage',async()=>{
  const catalog={get:async()=>({models:[{id:'model-A',object:'model',created:0,owned_by:'vendor',name:'A'}],source:'live'})};
  await withServer(async()=>{throw new Error('No paid call expected');},async base=>{
    const r=await fetch(base+'/models',{headers:{Authorization:`Bearer ${key}`}});const data=await r.json();
    assert.deepEqual(data.data.map(m=>m.id),['model-A','minai-agent']);assert.equal(r.headers.get('x-model-catalog-source'),'live');
    assert.ok(!JSON.stringify(data).includes(config.apiKey));
  },{},{catalog});
});
test('catalog caches successful fetches and retains last good list on refresh failure',async()=>{
  let clock=0,calls=0;
  const cat=createCatalog({now:()=>clock,ttlMs:100,retryMs:10,fetchImpl:async(url,options)=>{
    assert.equal(url,MODEL_SOURCE);assert.equal(options.headers,undefined);calls++;
    if(calls>1)throw new Error('offline');return Response.json({models:[{modelId:'fresh-model'}]});
  }});
  const [a,b]=await Promise.all([cat.get(),cat.get()]);assert.equal(calls,1);assert.equal(a.models[0].id,'fresh-model');assert.deepEqual(a,b);
  await cat.get();assert.equal(calls,1);clock=101;
  const stale=await cat.get();assert.equal(calls,2);assert.equal(stale.models[0].id,'fresh-model');assert.equal(stale.source,'snapshot');
  await cat.get();assert.equal(calls,2);
});
