const hints = {
  ENOTFOUND: 'DNS tidak menemukan api.1min.ai.',
  EAI_AGAIN: 'Resolusi DNS gagal sementara.',
  ECONNREFUSED: 'Koneksi ditolak oleh tujuan atau proxy.',
  ECONNRESET: 'Koneksi terputus sebelum respons selesai.',
  ETIMEDOUT: 'Koneksi TCP melewati batas waktu.',
  ENETUNREACH: 'Jalur jaringan tidak tersedia.',
  EHOSTUNREACH: 'Host tidak dapat dijangkau.',
  UND_ERR_CONNECT_TIMEOUT: 'Node.js gagal membuka koneksi dalam batas waktu.',
  UND_ERR_HEADERS_TIMEOUT: 'Menunggu header respons terlalu lama.',
  UND_ERR_SOCKET: 'Socket upstream terputus.',
  CERT_HAS_EXPIRED: 'Sertifikat TLS kedaluwarsa atau waktu komputer salah.',
  CERT_NOT_YET_VALID: 'Sertifikat TLS belum berlaku atau waktu komputer salah.',
  DEPTH_ZERO_SELF_SIGNED_CERT: 'Sertifikat TLS self-signed tidak dipercaya Node.js.',
  SELF_SIGNED_CERT_IN_CHAIN: 'Rantai sertifikat TLS tidak dipercaya Node.js.',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'Node.js tidak dapat memverifikasi rantai sertifikat TLS.',
  UNABLE_TO_GET_ISSUER_CERT_LOCALLY: 'Issuer sertifikat tidak ditemukan pada trust store Node.js.',
  ERR_TLS_CERT_ALTNAME_INVALID: 'Nama host tidak cocok dengan sertifikat TLS.',
  ERR_SSL_WRONG_VERSION_NUMBER: 'Negosiasi TLS gagal; periksa jenis endpoint proxy.',
  ERR_INVALID_CHAR: 'Header mengandung karakter tidak valid; periksa API key lokal.',
  ERR_INVALID_URL: 'URL tidak valid pada transport atau pengaturan proxy.'
};
export function networkDetails(error) {
  const found=new Set(),seen=new Set();
  function walk(e,depth=0){
    if(!e || typeof e!=='object' || seen.has(e) || depth>8)return;
    seen.add(e);
    if(Object.hasOwn(hints,e.code))found.add(e.code);
    walk(e.cause,depth+1);
    if(Array.isArray(e.errors))for(const child of e.errors)walk(child,depth+1);
  }
  walk(error);
  const codes=[...found];
  return {codes:codes.length?codes:['UNKNOWN'],message:codes.length?codes.map(c=>`${c}: ${hints[c]}`).join(' '):'Penyebab belum terklasifikasi. Jalankan node diagnose.mjs; jangan kirim config.local.json.'};
}
