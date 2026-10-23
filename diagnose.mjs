import { lookup } from 'node:dns/promises';
import { networkDetails } from './network-errors.mjs';

console.log('=== 1minAI bridge diagnostic 2.0 ===');
console.log('Node:',process.version,'OS:',process.platform,process.arch);
console.log('Tidak membaca config/API key. Tidak meminta generasi model.');
for(const name of ['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','NO_PROXY','NODE_EXTRA_CA_CERTS']) {
  console.log(name+': '+(process.env[name]?'SET (nilai disembunyikan)':'not set'));
}
console.log('Env proxy enabled:',process.env.NODE_USE_ENV_PROXY==='1'||process.execArgv.includes('--use-env-proxy'));
console.log('Runtime supports --use-env-proxy:',process.allowedNodeEnvironmentFlags.has('--use-env-proxy'));
console.log('Runtime supports --use-system-ca:',process.allowedNodeEnvironmentFlags.has('--use-system-ca'));
if(process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0') console.log('TLS VERIFICATION DISABLED: hasil diagnostik tidak memvalidasi sertifikat. Pulihkan verifikasi TLS.');

// DNS observation has an independent deadline. Do not print resolved addresses.
await Promise.allSettled([
  (async()=>{
    let timer;
    try {
      const addresses=await Promise.race([lookup('api.1min.ai',{all:true}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(new Error(),{code:'ETIMEDOUT'})),10000);})]);
      console.log('DNS: OK. Address families:',[...new Set(addresses.map(x=>x.family))].join(','));
    }catch(e){console.log('DNS: FAIL.',networkDetails(e).message);}finally{clearTimeout(timer);}
  })(),
  (async()=>{
    const start=Date.now();
    try {
      const res=await fetch('https://api.1min.ai/api/chat-with-ai',{method:'GET',redirect:'manual',signal:AbortSignal.timeout(15000)});
      console.log(`HTTPS GET: HTTP ${res.status}, ${Date.now()-start} ms. Transport terhubung; status ini tidak menguji API key/model atau keberhasilan POST.`);
      await res.body?.cancel();
    }catch(e){console.log('HTTPS GET: FAIL.',e.name==='TimeoutError'?'TIMEOUT setelah 15 detik.':networkDetails(e).message);}
  })(),
  (async()=>{
    try{
      const r=await fetch('http://127.0.0.1:20129/health',{signal:AbortSignal.timeout(3000)});
      const b=await r.json();
      console.log('Local bridge:',r.status===200&&b.status==='ok'?'OK':'unexpected response','version:',['1.1','2.0'].includes(b.version)?b.version:'old/unknown');
    }catch{console.log('Local bridge: tidak terhubung. Jalankan start.cmd untuk tes API berikutnya.');}
  })()
]);
console.log('=== Selesai. Output di atas boleh dibagikan; tidak memuat key/config. ===');
// Allow pending network handles and stdout writes to close naturally on Windows.
