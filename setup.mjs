import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { randomBytes } from 'node:crypto';
import { writeFile, access } from 'node:fs/promises';
const target = new URL('./config.local.json',import.meta.url);
let exists=false;
try { await access(target); exists=true; console.log('Config sudah ada. Pilih model di 9router; edit config.local.json hanya jika perlu mengganti key.'); } catch {}
if(!exists){
let muted = false;
const output = new Writable({write(chunk,encoding,callback){ if(!muted) process.stdout.write(chunk,encoding); callback(); }});
const rl = createInterface({input:process.stdin,output,terminal:!!process.stdin.isTTY});
try {
  console.log('Setup lokal. API key disimpan dalam config.local.json; jangan dibagikan.');
  process.stdout.write('API key 1minAI (input disembunyikan): ');
  muted = true;
  const apiKey = (await rl.question('')).trim();
  muted = false; process.stdout.write('\n');
  if (!apiKey) throw new Error('API key wajib diisi.');
  const bridgeKey = randomBytes(24).toString('hex');
  await writeFile(target,JSON.stringify({apiKey,bridgeKey,timeoutMs:120000,maxPromptBytes:240000},null,2)+'\n',{flag:'wx',mode:0o600});
  console.log('\nMasukkan ke CUSTOM OPENAI-COMPATIBLE provider di 9router:');
  console.log('Nama: 1minAI Local\nBase URL: http://127.0.0.1:20129/v1\nFetch/refresh models di 9router; pilih model ID dari daftar.');
  console.log('API key lokal bridge: '+bridgeKey);
  console.log('\nKemudian jalankan node bridge.mjs atau klik start.cmd.');
} catch(e) { console.error(e.message); process.exitCode=1; }
finally { rl.close(); }
}
