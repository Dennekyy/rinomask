'use strict';

/*
 * Teste end-to-end de proxy com o motor CAMOUFOX.
 * Valida que o navegador sai pelo IP do proxy E que timezone/locale/WebRTC
 * são derivados do GeoIP do proxy (coerência automática — Fase 3).
 *
 * Rodar: node scripts/_enode.js scripts/test-proxy.js "http://user:pass@host:port"
 */

const path = require('path');
const os = require('os');
const https = require('https');
const store = require('../src/store');
const launcher = require('../src/browserLauncher');
const { testProxy, normalizeProxy } = require('../src/proxyManager');

function realIpDirect() {
  return new Promise((resolve) => {
    https.get('https://api.ipify.org?format=json', (r) => { let b = ''; r.on('data', (c) => b += c); r.on('end', () => { try { resolve(JSON.parse(b).ip); } catch (e) { resolve(b.trim()); } }); }).on('error', () => resolve('erro'));
  });
}
function ipClass(ip) {
  if (!ip) return 'none';
  if (ip.endsWith('.local')) return 'mdns';
  const m = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) { const a = +m[1], b = +m[2]; if (a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254)) return 'private'; return 'public'; }
  if (/^(fe80|fc|fd)/i.test(ip)) return 'private';
  if (ip.includes(':')) return 'public6';
  return 'unknown';
}
async function gatherWebRTC(page) {
  const raw = await page.evaluate(() => new Promise((resolve) => {
    const RTC = window.RTCPeerConnection; if (!RTC) return resolve({ blocked: true, cands: [] });
    let pc; try { pc = new RTC({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }); } catch (e) { return resolve({ blocked: true, cands: [] }); }
    const cands = []; pc.onicecandidate = (e) => { if (e.candidate && e.candidate.candidate) cands.push(e.candidate.candidate); };
    try { pc.createDataChannel('p'); pc.createOffer().then((o) => pc.setLocalDescription(o)).catch(() => {}); } catch (e) {}
    setTimeout(() => { try { pc.close(); } catch (e) {} resolve({ blocked: false, cands }); }, 5000);
  }));
  if (raw.blocked) return { blocked: true, ips: [] };
  return { blocked: false, ips: raw.cands.map((c) => { const p = c.split(' '); return { ip: p[4], klass: ipClass(p[4]) }; }) };
}

(async function main() {
  const url = process.argv[2];
  if (!url) { console.error('uso: node scripts/_enode.js scripts/test-proxy.js "<url>"'); process.exit(2); }
  const m = url.match(/^(https?|socks[45]):\/\/(?:([^:@]+):([^@]*)@)?([^:\/]+):(\d+)/i);
  if (!m) { console.error('formato invalido'); process.exit(2); }
  const proxy = normalizeProxy({ type: m[1].toLowerCase(), username: m[2] || '', password: m[3] || '', host: m[4], port: m[5] });
  console.log(`Proxy: ${proxy.type}://${proxy.host}:${proxy.port} (auth: ${proxy.username ? 'sim' : 'nao'})`);

  let pass = 0, fail = 0;
  const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log(`  ${ok ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); };

  console.log('\n[1] Conectividade (camada Node):');
  const realIp = await realIpDirect();
  console.log('     IP real (sem proxy):', realIp);
  const r = await testProxy(proxy);
  if (!r.ok) { check('proxy responde', false, r.error); process.exit(1); }
  check(`proxy responde — IP de saida ${r.ip} (${r.latencyMs}ms)`, true);
  check('IP do proxy != IP real', r.ip !== realIp, `${r.ip} vs ${realIp}`);
  const proxyIp = r.ip;

  console.log('\n[2] Navegador Camoufox atraves do proxy:');
  const tmp = path.join(os.tmpdir(), 'rinomask-proxy-' + Date.now());
  store.setDataDir(tmp);
  launcher.setPersistFingerprint((id, data) => store.setFingerprintData(id, data));
  const P = store.createProfile({ name: 'Proxy', os: 'Windows', startUrl: 'about:blank', proxy });

  let err = null;
  try { await launcher.launchAutomation(store.getProfile(P.id)); } catch (e) { err = e.message; }
  if (err) { check('navegador iniciou com o proxy', false, err); await cleanup(tmp); process.exit(1); }

  const page = await launcher.getPage(P.id);
  const env = await page.evaluate(async () => {
    let ip = 'erro';
    try { ip = (await (await fetch('https://api.ipify.org?format=json', { cache: 'no-store' })).json()).ip; } catch (e) {}
    return { ip, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, lang: navigator.language, langs: navigator.languages.join(',') };
  });
  console.log(`     IP=${env.ip}  tz=${env.tz}  lang=${env.lang} (${env.langs})`);
  if (env.ip !== proxyIp) console.log(`     (info) proxy residencial rotativo: Node viu ${proxyIp}, navegador saiu por ${env.ip} — ambos do proxy`);
  check('IP HTTP do navegador sai pelo proxy (!= IP real)', env.ip !== realIp && env.ip !== 'erro', `${env.ip}`);
  check('timezone coerente com o IP do proxy (auto-geo BR)', /America\/(Sao_Paulo|Bahia|Fortaleza|Recife|Manaus|Belem|Cuiaba|Araguaina|Boa_Vista|Campo_Grande|Maceio|Porto_Velho|Rio_Branco|Santarem|Eirunepe|Noronha)/.test(env.tz), env.tz);
  check('locale coerente com o proxy (pt-BR/pt)', /^pt/.test(env.lang), env.lang);

  console.log('\n[3] WebRTC atraves do proxy:');
  const w = await gatherWebRTC(page);
  const summ = w.blocked ? 'BLOQUEADO' : (w.ips.map((x) => `${x.klass}:${x.ip}`).join(', ') || '(sem candidatos)');
  console.log('     candidatos:', summ);
  check('WebRTC NAO expoe o IP real', !w.ips.some((x) => x.ip === realIp), 'real=' + realIp);
  const pub = w.ips.filter((x) => x.klass === 'public' || x.klass === 'public6').map((x) => x.ip);
  if (pub.length) check('IP publico do WebRTC == IP HTTP do navegador (consistente, do proxy)', pub.every((ip) => ip === env.ip), `webrtc=${pub.join(',')} http=${env.ip}`);
  else console.log('     (WebRTC sem IP público — bloqueado/sem leak)');

  console.log(`\n  RESULTADO: ${pass} passou, ${fail} falhou`);
  await launcher.stop(P.id);
  await cleanup(tmp);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('ERRO:', e && e.stack || e); process.exit(2); });

async function cleanup(tmp) {
  await launcher.stopAll().catch(() => {});
  await require('fs/promises').rm(tmp, { recursive: true, force: true }).catch(() => {});
}
