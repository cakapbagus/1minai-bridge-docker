import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Two real upstream requests. Simulates only a read_file tool result; executes no tools.
export async function probe(baseURL, apiKey, model, fetchImpl=fetch) {
  const tool = {type:'function',function:{name:'read_file',description:'Read one text file.',parameters:{type:'object',properties:{path:{type:'string'}},required:['path'],additionalProperties:false}}};
  async function call(body) {
    const res = await fetchImpl(baseURL.replace(/\/$/,'')+'/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${apiKey}`},body:JSON.stringify({model,...body}),signal:AbortSignal.timeout(150000)});
    if (!res.ok) {
      const detail=await res.json().catch(()=>null);
      // Print only bridge-owned diagnostics, never arbitrary router/upstream content.
      if(detail?.error?.type==='bridge_error') throw new Error(`HTTP ${res.status} [${detail.error.stage??'unknown'}]: ${detail.error.message}`);
      throw new Error(`HTTP ${res.status}. Cek terminal bridge, model, key, dan saldo.`);
    }
    const text=await res.text();
    if (!text.includes('data: [DONE]')) throw new Error('Streaming tidak selesai dengan [DONE].');
    const message={role:'assistant',content:'',tool_calls:[]};
    let finish;
    for(const line of text.split('\n')) {
      if(!line.startsWith('data: ') || line==='data: [DONE]') continue;
      const event=JSON.parse(line.slice(6));
      if(event.error) throw new Error('Streaming mengandung error.');
      const choice=event.choices?.[0]; if(!choice) continue;
      finish=choice.finish_reason??finish;
      message.content+=choice.delta?.content??'';
      for(const part of choice.delta?.tool_calls??[]) {
        const t=message.tool_calls[part.index]??={id:'',type:'function',function:{name:'',arguments:''}};
        if(part.id)t.id=part.id;
        t.function.name+=part.function?.name??'';
        t.function.arguments+=part.function?.arguments??'';
      }
    }
    if(!message.tool_calls.length)delete message.tool_calls;
    return {message,finish};
  }
  const messages=[{role:'user',content:'Read bridge-probe.txt using read_file. After receiving the result, repeat the exact file content in the final answer. Do not guess its content.'}];
  const first=await call({messages,tools:[tool],tool_choice:{type:'function',function:{name:'read_file'}},stream:true});
  const t=first.message.tool_calls?.[0];
  if(first.finish!=='tool_calls'||!t?.id||t.function.name!=='read_file'||JSON.parse(t.function.arguments).path!=='bridge-probe.txt')throw new Error('Model/rute belum lulus emulasi tool call.');
  console.log('PASS: streaming tool_calls valid, read_file dipilih.');
  const sentinel=`PROBE-${randomUUID()}`;
  messages.push(first.message,{role:'tool',tool_call_id:t.id,content:sentinel});
  const second=await call({messages,tools:[tool],stream:true});
  if(second.finish!=='stop'||!second.message.content.includes(sentinel))throw new Error('Model/rute belum lulus membaca hasil tool di giliran berikutnya.');
  console.log('PASS: hasil tool diterima pada giliran berikutnya.');
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const config=JSON.parse(await readFile(new URL('./config.local.json',import.meta.url),'utf8'));
    const router=process.argv.includes('--router');
    const modelIndex=process.argv.indexOf('--model');
    const selectedModel=modelIndex>=0?process.argv[modelIndex+1]:router?'1MINAI_AGENT':config.upstreamModel?'minai-agent':null;
    if(!selectedModel || selectedModel.startsWith('--'))throw new Error('Tambahkan --model MODEL_ID (nama rute/combo 9router jika memakai --router).');
    const key=router?process.env.NINE_ROUTER_API_KEY:config.bridgeKey;
    if(!key)throw new Error('Untuk --router, set NINE_ROUTER_API_KEY di terminal ini.');
    console.log('Tes ini memakai 2 permintaan API 1minAI dan mengonsumsi kredit. Tidak mengeksekusi tool atau menulis file.');
    await probe(router?'http://127.0.0.1:20128/v1':'http://127.0.0.1:20129/v1',key,selectedModel);
  }catch(e){console.error('FAIL: '+e.message);process.exitCode=1;}
}
