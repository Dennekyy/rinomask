'use strict';
// Verifica: (a) fingerprint ESTÁVEL ao reabrir o mesmo perfil; (b) perfis diferentes
// têm fingerprints diferentes. Rodar: ELECTRON_RUN_AS_NODE=1 electron scripts/test-stability.js
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const store = require('../src/store');
const launcher = require('../src/browserLauncher');

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 12);
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log(`  ${ok ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); };

async function readFp(id) {
  const page = await launcher.getPage(id);
  await page.goto('about:blank').catch(() => {});
  return page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 200; c.height = 50;
    const ctx = c.getContext('2d'); ctx.textBaseline = 'top'; ctx.font = '16px Arial';
    ctx.fillStyle = '#069'; ctx.fillText('RinoMask-\u{1F98F}', 2, 2);
    let gl = '';
    try { const g = document.createElement('canvas').getContext('webgl'); const e = g.getExtension('WEBGL_debug_renderer_info'); gl = e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : ''; } catch (e) {}
    return { ua: navigator.userAgent, platform: navigator.platform, hc: navigator.hardwareConcurrency, screen: screen.width + 'x' + screen.height, langs: navigator.languages.join(','), canvas: c.toDataURL(), gl };
  });
}

(async function main() {
  const tmp = path.join(os.tmpdir(), 'rinomask-stab-' + Date.now());
  store.setDataDir(tmp);
  launcher.setPersistFingerprint((id, data) => store.setFingerprintData(id, data));

  const A = store.createProfile({ name: 'A', os: 'Windows' });
  const B = store.createProfile({ name: 'B', os: 'macOS' });

  console.log('1ª abertura de A...'); await launcher.launchAutomation(store.getProfile(A.id));
  const a1 = await readFp(A.id); await launcher.stop(A.id);

  console.log('Reabrindo A...'); await launcher.launchAutomation(store.getProfile(A.id));
  const a2 = await readFp(A.id); await launcher.stop(A.id);

  console.log('Abrindo B...'); await launcher.launchAutomation(store.getProfile(B.id));
  const b = await readFp(B.id); await launcher.stop(B.id);

  console.log('\n[Estabilidade do MESMO perfil A]');
  check('UA estável', a1.ua === a2.ua, a1.ua.slice(0, 50));
  check('platform estável', a1.platform === a2.platform, a1.platform);
  check('hardwareConcurrency estável', a1.hc === a2.hc, `${a1.hc}/${a2.hc}`);
  check('resolução estável', a1.screen === a2.screen, `${a1.screen}/${a2.screen}`);
  check('WebGL renderer estável', a1.gl === a2.gl, `${a1.gl} | ${a2.gl}`);
  check('canvas estável', sha(a1.canvas) === sha(a2.canvas), `${sha(a1.canvas)}/${sha(a2.canvas)}`);

  console.log('\n[Perfis DIFERENTES A vs B]');
  check('UA difere (Win vs Mac)', a1.ua !== b.ua, `${a1.platform} vs ${b.platform}`);
  check('platform difere', a1.platform !== b.platform, `${a1.platform} | ${b.platform}`);
  check('WebGL difere', a1.gl !== b.gl, `${a1.gl} | ${b.gl}`);

  console.log(`\n  RESULTADO: ${pass} passou, ${fail} falhou`);
  await launcher.stopAll();
  await require('fs/promises').rm(tmp, { recursive: true, force: true }).catch(() => {});
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('ERRO:', e && e.stack || e); process.exit(2); });
