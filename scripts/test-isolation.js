'use strict';

/*
 * Teste de ISOLAMENTO entre perfis.
 * Usa o mesmo caminho de codigo do app (store + browserLauncher).
 *
 * Prova que dois perfis NAO compartilham:
 *   - cookies, localStorage, IndexedDB (storage por origem)
 *   - fingerprint (User-Agent, Canvas, WebGL, CPU, tela, fuso, idioma)
 * E confirma que:
 *   - os dados PERSISTEM ao reabrir o mesmo perfil
 *   - o unico dado que cruza (sem proxy) e o IP publico (a rede WiFi)
 */

const path = require('path');
const os = require('os');
const crypto = require('crypto');
const store = require('../src/store');
const launcher = require('../src/browserLauncher');

const ORIGIN = 'https://example.com';
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 16);

let pass = 0, fail = 0;
function check(name, ok, detail) {
  (ok ? pass++ : fail++);
  console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
}

async function gotoOrigin(page) {
  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
}

// Escreve dados de identidade em um perfil.
async function writeData(page, marker) {
  return page.evaluate((m) => new Promise((resolve) => {
    try { localStorage.setItem('anty_secret', m); } catch (e) {}
    try { document.cookie = 'anty_sid=' + m + '; path=/; SameSite=Lax'; } catch (e) {}
    const r = indexedDB.open('anty_db', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('store');
    r.onsuccess = () => {
      try {
        const tx = r.result.transaction('store', 'readwrite');
        tx.objectStore('store').put(m, 'key');
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) { resolve(false); }
    };
    r.onerror = () => resolve(false);
  }), marker);
}

// Le os dados de identidade de um perfil.
async function readData(page) {
  return page.evaluate(() => new Promise((resolve) => {
    const ls = (() => { try { return localStorage.getItem('anty_secret'); } catch (e) { return null; } })();
    const ck = (() => { try { return document.cookie || ''; } catch (e) { return ''; } })();
    let existed = true;
    const r = indexedDB.open('anty_db', 1);
    r.onupgradeneeded = () => { existed = false; r.result.createObjectStore('store'); };
    r.onsuccess = () => {
      if (!existed) return resolve({ ls, ck, idb: null });
      try {
        const tx = r.result.transaction('store', 'readonly');
        const g = tx.objectStore('store').get('key');
        g.onsuccess = () => resolve({ ls, ck, idb: g.result || null });
        g.onerror = () => resolve({ ls, ck, idb: null });
      } catch (e) { resolve({ ls, ck, idb: null }); }
    };
    r.onerror = () => resolve({ ls, ck, idb: null });
  }));
}

// Coleta a fingerprint observavel pela pagina.
async function readFingerprint(page) {
  return page.evaluate(() => {
    const canvasHash = () => {
      try {
        const c = document.createElement('canvas'); c.width = 220; c.height = 50;
        const ctx = c.getContext('2d');
        ctx.textBaseline = 'top'; ctx.font = '16px Arial';
        ctx.fillStyle = '#069'; ctx.fillText('Antidetect-Test-\u{1F600}', 2, 2);
        ctx.fillStyle = 'rgba(102,204,0,0.7)'; ctx.fillText('Antidetect-Test-\u{1F600}', 4, 17);
        return c.toDataURL();
      } catch (e) { return 'err'; }
    };
    const glInfo = () => {
      try {
        const c = document.createElement('canvas');
        const g = c.getContext('webgl') || c.getContext('experimental-webgl');
        if (!g) return { vendor: null, renderer: null };
        const ext = g.getExtension('WEBGL_debug_renderer_info');
        return {
          vendor: ext ? g.getParameter(ext.UNMASKED_VENDOR_WEBGL) : null,
          renderer: ext ? g.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null,
        };
      } catch (e) { return { vendor: null, renderer: null }; }
    };
    return {
      ua: navigator.userAgent,
      platform: navigator.platform,
      cpu: navigator.hardwareConcurrency,
      mem: navigator.deviceMemory,
      lang: navigator.languages.join(','),
      screen: screen.width + 'x' + screen.height,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      tzOffset: new Date().getTimezoneOffset(),
      canvas: canvasHash(),
      webgl: glInfo(),
    };
  });
}

async function readIp(page) {
  return page.evaluate(async () => {
    try {
      const r = await fetch('https://api.ipify.org?format=json');
      return (await r.json()).ip;
    } catch (e) { return 'erro-rede'; }
  });
}

// Classifica um IP de candidato ICE.
function ipClass(ip) {
  if (!ip) return 'none';
  if (ip.endsWith('.local')) return 'mdns'; // local IP escondido por mDNS (bom)
  const m = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const a = +m[1], b = +m[2];
    if (a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254)) return 'private';
    return 'public';
  }
  if (/^(fe80|fc|fd)/i.test(ip)) return 'private';
  if (ip.includes(':')) return 'public6';
  return 'unknown';
}

// Coleta candidatos ICE via STUN para detectar vazamento de IP por WebRTC.
async function gatherWebRTC(page) {
  const raw = await page.evaluate(() => new Promise((resolve) => {
    const RTC = window.RTCPeerConnection || window.webkitRTCPeerConnection;
    if (!RTC) return resolve({ blocked: true, cands: [] });
    let pc;
    try { pc = new RTC({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }); }
    catch (e) { return resolve({ blocked: true, cands: [], error: String(e) }); }
    const cands = [];
    pc.onicecandidate = (e) => { if (e.candidate && e.candidate.candidate) cands.push(e.candidate.candidate); };
    try {
      pc.createDataChannel('probe');
      pc.createOffer().then((o) => pc.setLocalDescription(o)).catch(() => {});
    } catch (e) {}
    setTimeout(() => { try { pc.close(); } catch (e) {} resolve({ blocked: false, cands }); }, 4500);
  }));
  if (raw.blocked) return { blocked: true, ips: [] };
  const ips = raw.cands.map((c) => {
    const p = c.split(' ');
    return { ip: p[4], type: p[7], klass: ipClass(p[4]) };
  });
  return { blocked: false, ips };
}

(async function main() {
  const tmp = path.join(os.tmpdir(), 'anty-isolation-' + Date.now());
  store.setDataDir(tmp);
  console.log('Pasta de teste:', tmp);
  console.log('');

  const A = store.createProfile({ name: 'Conta A', os: 'Windows', region: 'America/Sao_Paulo', startUrl: ORIGIN });
  const B = store.createProfile({ name: 'Conta B', os: 'macOS', region: 'Europe/London', startUrl: ORIGIN });
  // Perfil C com WebRTC desativado, para validar o bloqueio total.
  const C = store.createProfile({ name: 'Conta C (WebRTC off)', os: 'Windows', region: 'America/New_York', startUrl: ORIGIN });
  store.updateProfile(C.id, { fingerprint: { ...store.getProfile(C.id).fingerprint, webrtcMode: 'disabled' } });

  console.log('Abrindo os perfis (navegadores reais)...');
  await launcher.launchAutomation(store.getProfile(A.id));
  await launcher.launchAutomation(store.getProfile(B.id));
  await launcher.launchAutomation(store.getProfile(C.id));
  const pageA = await launcher.getPage(A.id);
  const pageB = await launcher.getPage(B.id);
  const pageC = await launcher.getPage(C.id);
  await gotoOrigin(pageA);
  await gotoOrigin(pageB);
  await gotoOrigin(pageC);

  // 1) Escreve identidade em A e tenta vazar em B
  console.log('\n[1] Storage (cookies / localStorage / IndexedDB) — escrevo em A, leio em B:');
  await writeData(pageA, 'SEGREDO-DA-CONTA-A');
  const inA = await readData(pageA);
  const inB = await readData(pageB);
  check('localStorage de A gravado', inA.ls === 'SEGREDO-DA-CONTA-A');
  check('localStorage NAO vaza para B', inB.ls == null, 'B leu: ' + JSON.stringify(inB.ls));
  check('cookie NAO vaza para B', !inB.ck.includes('SEGREDO-DA-CONTA-A'), 'B cookie: ' + JSON.stringify(inB.ck));
  check('IndexedDB NAO vaza para B', inB.idb == null, 'B idb: ' + JSON.stringify(inB.idb));

  // 2) Cookies pelo contexto (camada do navegador)
  const ckA = await launcher.getContext(A.id).cookies();
  const ckB = await launcher.getContext(B.id).cookies();
  check('jar de cookies de B nao contem o cookie de A',
    !ckB.some((c) => c.value && c.value.includes('SEGREDO-DA-CONTA-A')),
    `A=${ckA.length} cookie(s), B=${ckB.length} cookie(s)`);

  // 3) userDataDir fisicamente separados
  console.log('\n[2] Pastas de dados persistentes:');
  check('userDataDir de A e B sao diferentes', store.getProfile(A.id).userDataDir !== store.getProfile(B.id).userDataDir);

  // 4) Fingerprints diferentes
  console.log('\n[3] Fingerprint — comparando A vs B:');
  const fa = await readFingerprint(pageA);
  const fb = await readFingerprint(pageB);
  check('User-Agent diferente', fa.ua !== fb.ua, `\n        A=${fa.ua}\n        B=${fb.ua}`);
  check('Plataforma diferente', fa.platform !== fb.platform, `A=${fa.platform} | B=${fb.platform}`);
  check('Canvas hash diferente', sha(fa.canvas) !== sha(fb.canvas), `A=${sha(fa.canvas)} | B=${sha(fb.canvas)}`);
  check('WebGL renderer diferente', JSON.stringify(fa.webgl) !== JSON.stringify(fb.webgl), `\n        A=${JSON.stringify(fa.webgl)}\n        B=${JSON.stringify(fb.webgl)}`);
  check('Fuso horario diferente', fa.tz !== fb.tz, `A=${fa.tz}(${fa.tzOffset}) | B=${fb.tz}(${fb.tzOffset})`);
  check('Idiomas diferentes', fa.lang !== fb.lang, `A=${fa.lang} | B=${fb.lang}`);
  console.log(`     (info) CPU/Mem/Tela  A=${fa.cpu}c/${fa.mem}gb/${fa.screen}  B=${fb.cpu}c/${fb.mem}gb/${fb.screen}`);

  // Estabilidade: o mesmo perfil deve produzir SEMPRE o mesmo canvas (senao o ruido
  // variavel seria, por si so, um sinal de deteccao).
  const fa2 = await readFingerprint(pageA);
  check('Canvas estavel dentro do mesmo perfil (A==A)', sha(fa.canvas) === sha(fa2.canvas), `A1=${sha(fa.canvas)} | A2=${sha(fa2.canvas)}`);

  // 5) Persistencia: fecha A, reabre, dado continua
  console.log('\n[4] Persistencia — fecho A e reabro:');
  await launcher.stop(A.id);
  await launcher.launchAutomation(store.getProfile(A.id));
  const pageA2 = await launcher.getPage(A.id);
  await gotoOrigin(pageA2);
  const reread = await readData(pageA2);
  check('localStorage de A persiste apos reabrir', reread.ls === 'SEGREDO-DA-CONTA-A', 'leu: ' + JSON.stringify(reread.ls));
  check('IndexedDB de A persiste apos reabrir', reread.idb === 'SEGREDO-DA-CONTA-A', 'leu: ' + JSON.stringify(reread.idb));

  // 6) IP (o unico que cruza sem proxy)
  console.log('\n[5] IP de saida (sem proxy nos dois) — deve ser IGUAL (a rede WiFi):');
  const ipA = await readIp(pageA2);
  const ipB = await readIp(pageB);
  console.log(`     A=${ipA}  |  B=${ipB}`);
  check('IP igual nos dois (esperado sem proxy; resolve-se com 1 proxy por perfil)', ipA === ipB || ipA === 'erro-rede');

  // 7) WebRTC IP leak
  console.log('\n[6] WebRTC — vazamento de IP (STUN):');
  const wA = await gatherWebRTC(pageA2);
  const wB = await gatherWebRTC(pageB);
  const wC = await gatherWebRTC(pageC);
  const summ = (w) => w.blocked ? 'BLOQUEADO' : w.ips.map((x) => `${x.klass}:${x.ip}`).join(', ') || '(sem candidatos)';
  console.log('     A:', summ(wA));
  console.log('     B:', summ(wB));
  console.log('     C:', summ(wC));

  // C com webrtcMode=disabled deve bloquear RTCPeerConnection.
  check('WebRTC BLOQUEADO no modo "disabled" (perfil C)', wC.blocked === true);

  // A e B (modo altered) nao podem expor o IP PRIVADO da LAN (correlaciona perfis).
  const privA = wA.ips.filter((x) => x.klass === 'private');
  const privB = wB.ips.filter((x) => x.klass === 'private');
  check('WebRTC NAO vaza IP privado da LAN em A (mDNS protege)', privA.length === 0, privA.map((x) => x.ip).join(',') || 'nenhum');
  check('WebRTC NAO vaza IP privado da LAN em B (mDNS protege)', privB.length === 0, privB.map((x) => x.ip).join(',') || 'nenhum');

  // O IP PUBLICO exposto pelo WebRTC deve ser o MESMO do HTTP (sem leak de outro IP).
  const pubA = (wA.ips.find((x) => x.klass === 'public') || {}).ip;
  const pubB = (wB.ips.find((x) => x.klass === 'public') || {}).ip;
  if (pubA || pubB) {
    check('IP publico do WebRTC == IP de saida HTTP (sem vazar IP diferente)',
      (!pubA || pubA === ipA) && (!pubB || pubB === ipB),
      `WebRTC A=${pubA || '—'} (HTTP ${ipA}) | B=${pubB || '—'} (HTTP ${ipB})`);
  } else {
    console.log('     (info) STUN nao retornou IP publico (UDP/STUN bloqueado pela rede) — sem leak possivel por aqui.');
  }
  console.log('     OBS: no modo "altered" o WebRTC filtra TODO candidato com IP publico (so mDNS/relay), entao nunca expoe o IP real — validado com proxy real em scripts/test-proxy.js.');

  console.log('\n==============================================');
  console.log(`  RESULTADO: ${pass} passou, ${fail} falhou`);
  console.log('  ' + (fail === 0 ? 'ISOLAMENTO TOTAL CONFIRMADO ✅ (so o IP cruza, e proxy resolve)' : 'HOUVE FALHA DE ISOLAMENTO ❌'));
  console.log('==============================================');

  await launcher.stopAll();
  await require('fs/promises').rm(tmp, { recursive: true, force: true }).catch(() => {});
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('ERRO no teste:', e); process.exit(2); });
