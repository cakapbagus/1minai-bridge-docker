# 1minAI → 9router → Zed — bridge v2.0

Sekarang model dipilih pada setiap request dari 9router. Config tidak lagi menentukan model untuk request yang memakai ID model asli. Adapter tetap memakai emulasi tool calling, text-only, dan buffered SSE.

## Startup Windows (VBS)

Klik dua kali **bridge-startup.vbs** di folder bridge yang sudah memiliki config.local.json. Script memasang shortcut pada folder Startup akun Windows saat ini dan langsung menjalankan Node secara tersembunyi. Jika health endpoint menunjukkan bridge sudah aktif, script tidak menjalankan instance baru. Tetap hanya satu proses yang bisa mendengarkan port 20129.

Startup berlaku saat **login akun ini**, bukan sebelum login. Tidak memerlukan pemasangan service atau restart Windows. Script tidak memasang startup untuk 9router; 9router perlu dijalankan tersendiri. Proses bridge tidak diawasi/restart otomatis jika crash. Jangan pindahkan folder setelah memasang startup; jika dipindahkan, jalankan pemasang lagi dari lokasi baru.

Untuk menghapus startup, klik **remove-startup.vbs**. Ini hanya menghapus shortcut startup; proses yang sudah berjalan tidak dimatikan. Script tidak menghapus config atau menghentikan proses Node lain.

Untuk melihat status: buka http://127.0.0.1:20129/health atau jalankan node diagnose.mjs. Untuk menjalankan secara tersembunyi tanpa memasang startup, gunakan `wscript.exe .\bridge-startup.vbs /run`.

Jika sebelumnya bridge berjalan pada terminal, pemasangan akan mendeteksi proses tersebut. Hentikan bridge terminal dengan Ctrl+C lalu jalankan bridge-startup.vbs lagi agar proses baru berjalan tersembunyi. Pesan sukses muncul setelah health check berhasil. Jika gagal saat login, pesan ringkas dicatat pada Windows Event Log; jalankan start.cmd untuk diagnosis. Script memerlukan Windows Script Host/VBScript yang tersedia pada komputer.

Script VBS sudah ditinjau, tetapi belum dijalankan pada Windows dalam lingkungan ini.

## Memperbarui instalasi yang sudah berjalan

1. Hentikan bridge dengan Ctrl+C.
2. Ekstrak ZIP ke folder yang sama dan timpa file program. **Pertahankan config.local.json**; ZIP tidak berisi file rahasia tersebut.
3. Jalankan kembali start.cmd. Terminal harus menampilkan **v2.0**.
4. Buka provider **1minAI Local** yang sudah tersambung di 9router.
5. Base URL tetap `http://127.0.0.1:20129/v1`, format OpenAI Chat Completions, dan key tetap nilai `bridgeKey`.
6. Pada bagian model provider, klik **Import from /models**. Pada source 9router yang diperiksa, tombol ini mengimpor seluruh ID yang belum terdaftar. Pastikan ada connection aktif; jika tombol tidak terlihat, versi lokal mungkin memiliki UI berbeda. Adapter menyajikan seluruh katalog melalui `GET /v1/models`.
7. Pilih entry model asli dalam 9router atau masukkan entry itu ke combo. Jangan memakai alias `minai-agent` bila ingin pemilihan model bebas dari config.

**Kompatibilitas lama:** `upstreamModel` boleh tetap ada di config. Nilai tersebut hanya digunakan jika request memilih alias `minai-agent`. Combo lama `1MINAI_AGENT` yang masih berisi alias itu tetap memakai model config lama. Ganti isi combo dengan entry model asli untuk memakai routing baru. Instalasi baru tidak lagi menanyakan model saat setup.

## Sumber dan pembaruan katalog

Sumber persis dropdown **AI Model** pada dokumentasi:

https://api.1min.ai/models?feature=UNIFY_CHAT_WITH_AI

Kode halaman dokumentasi membaca `models`, memakai `modelId` sebagai nilai pilihan dan `name` sebagai label, serta mengecualikan `NOT_APPLICABLE`. Adapter menerapkan pemetaan yang sama. Paket menyertakan snapshot **106 model unik** yang diambil 14 September 2026; jumlah live bisa berubah.

Saat `/v1/models` pertama kali diminta, bridge mencoba mengambil katalog terbaru, tanpa API key. Hasil live disimpan di memori selama satu jam. Jika gagal, daftar sebelumnya/snapshot dipertahankan, dan refresh berikutnya boleh dicoba setelah satu menit. Respons menyertakan header `X-Model-Catalog-Source: live` atau `snapshot`. Jika snapshot juga tidak tersedia, server memberikan error, bukan mengaku menyediakan daftar lengkap.

Perbarui snapshot di disk secara manual:

```powershell
node .\models.mjs --refresh
```

Perintah ini juga memperbarui `model-ids.txt`. Restart bridge setelah refresh manual, lalu muat ulang daftar model di 9router. Melihat daftar snapshot tanpa request jaringan:

```powershell
node .\models.mjs
```

Katalog publik bukan bukti semua model tersedia bagi akun atau mampu menjalankan agent. Validasi izin, kredit, dan kemampuan emulasi dilakukan dengan model pilihan. Pengambilan katalog tidak meminta generasi model.

## Cara routing bekerja

| Request dari 9router | Model pada POST ke 1minAI |
|---|---|
| `model: ID_MODEL_A` | `ID_MODEL_A` |
| `model: ID_MODEL_B` | `ID_MODEL_B` |
| `model: minai-agent` | `config.upstreamModel` (kompatibilitas lama) |

ID diteruskan apa adanya, termasuk slash jika merupakan bagian ID asli. Adapter tidak menebak atau membuang prefix. Prefix provider buatan 9router merupakan bagian rute klien; 9router perlu mengirim ID model upstream yang asli kepada adapter. Respons adapter menyertakan model yang diminta klien. Tidak ada penggantian model global sehingga request paralel dapat memakai model berbeda.

ID model valid yang ditambahkan secara manual juga diteruskan meskipun belum ada di cache; API 1minAI menentukan apakah ID itu tersedia. Adapter tidak beralih diam-diam ke model config jika pilihan tidak tersedia.

## Penggunaan Zed

Endpoint dan API key Zed tetap milik 9router. Pilih profil **Write** untuk membaca/mengedit proyek. Profil Minimal tidak menyediakan tool proyek.

- Bila tetap memakai combo `1MINAI_AGENT`, ubah isi combo di 9router ke model asli yang diinginkan. Settings Zed yang sudah bekerja tidak perlu diubah.
- Untuk memilih beberapa model secara terpisah di Zed, tambahkan nama rute model yang ditampilkan 9router ke `available_models` provider `9router`. Ikuti struktur dalam `zed-settings-snippet.json`; file itu masih mencontohkan combo `1MINAI_AGENT` dan tidak menebak prefix provider.
- Pertahankan capabilities: tools true, images false, parallel_tool_calls false, chat_completions true.

Tes model melalui adapter (ganti MODEL_ID dengan ID dari daftar):

```powershell
node .\check.mjs --model "MODEL_ID"
```

Tes via 9router menggunakan API key router pada environment terminal dan nama rute/combo yang dipilih:

```powershell
$bridgeRouterSecret = Read-Host 'API key 9router' -AsSecureString
$env:NINE_ROUTER_API_KEY = [System.Net.NetworkCredential]::new('', $bridgeRouterSecret).Password
node .\check.mjs --router --model "NAMA_RUTE_ATAU_COMBO"
Remove-Item Env:NINE_ROUTER_API_KEY
Remove-Variable bridgeRouterSecret
```

Tes check memakai hingga dua permintaan generasi berbayar: tool call, lalu jawaban berdasarkan hasil tool simulasi. Tidak mengeksekusi tool nyata. Untuk verifikasi akhir di Zed, minta membuat file latihan lalu membacanya ulang dan periksa file sebenarnya.

## Instalasi baru

Node.js 22+ diperlukan, tanpa dependency/npm install. Klik start.cmd, masukkan API key 1minAI; setup membuat key lokal bridge dan config.local.json. Simpan key lokal itu pada custom provider 9router. API key 1minAI hanya berada dalam config lokal. Jangan bagikan config.local.json. Bridge hanya mendengarkan di 127.0.0.1:20129; panduan ini mengasumsikan Zed, 9router, dan bridge pada host yang sama.

## Batas dan diagnosis

- Tool calling adalah emulasi melalui prompt, bukan fitur native yang terdokumentasi pada endpoint 1minAI. Seluruh riwayat/skema tool dikirim sebagai teks; pemisahan peran tidak setara API native.
- Satu tool per giliran. Adapter memeriksa envelope, nama tool dan beberapa aturan arguments tingkat atas; validasi skema lengkap dan eksekusi tetap milik Zed. Izin tool Zed tetap berlaku.
- Upstream memakai POST non-streaming. Setelah jawaban lengkap divalidasi, adapter menghasilkan SSE untuk Zed/9router. Tidak ada token streaming langsung, dukungan gambar/audio, atau Responses API.
- Parameter OpenAI seperti max_tokens, temperature, stop, dan reasoning tidak dipetakan ke upstream. Limit Zed bukan jaminan batas biaya 1minAI. Riwayat dikirim ulang setiap giliran; pantau kredit pada akun 1minAI. Usage token tidak direkayasa.
- Prompt byte budget default 240.000, timeout 120 detik. Tidak ada pemotongan konteks atau retry berbayar otomatis.
- `node diagnose.mjs` menguji DNS/HTTPS tanpa key/generasi. Diagnostik keluar secara normal; process.exit paksa telah dihapus. Assertion terdahulu pada Windows belum direproduksi di lingkungan pengembangan.
- HTTP 401 lokal: periksa bridgeKey di provider. Error upstream 400/404/422: periksa ID model. 401/403: key/izin. 402/429: kredit/limit. 413: kurangi konteks. 504: timeout. Tool emulation failed: model tidak mengikuti protokol; coba model lain.

Validasi v2.0: **16 tes otomatis lulus** dengan upstream tiruan, termasuk dua model paralel, routing tanpa upstreamModel, kompatibilitas alias lama, cache katalog, serta loop tool dua giliran. Snapshot berasal dari endpoint live. Integrasi v1 telah dikonfirmasi pengguna; v2.0 masih perlu dipasang dan diuji pada instalasi 9router pengguna.

Tes lokal tanpa kredit: `node --test bridge.test.mjs`.

Sumber:
- https://docs.1min.ai/docs/api/chat-with-ai-api
- https://api.1min.ai/models?feature=UNIFY_CHAT_WITH_AI
- https://github.com/decolua/9router
- https://github.com/decolua/9router/blob/master/src/app/(dashboard)/dashboard/providers/[id]/CompatibleModelsSection.js
- https://zed.dev/docs/ai/use-api-access#openai-compatible-endpoints
- https://zed.dev/docs/ai/agent-profiles
