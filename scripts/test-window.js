'use strict';
// Verifica que a janela do navegador cabe na tela física (não estoura o monitor).
// Rodar: node scripts/_enode.js scripts/test-window.js
const path = require('path');
const os = require('os');
const store = require('../src/store');
const launcher = require('../src/browserLauncher');

let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log(`  ${ok ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); };

(async function main() {
  const tmp = path.join(os.tmpdir(), 'rinomask-win-' + Date.now());
  store.setDataDir(tmp);
  launcher.setPersistFingerprint((id, data) => store.setFingerprintData(id, data));
  // simula um notebook 1366x768 (área útil 1366x728 com a barra de tarefas)
  const WA = { width: 1366, height: 768, workW: 1366, workH: 728 };
  launcher.setDisplay(WA);

  const p = store.createProfile({ name: 'Win', os: 'Windows', startUrl: 'about:blank' });
  await launcher.launchAutomation(store.getProfile(p.id));
  const page = await launcher.getPage(p.id);
  const m = await page.evaluate(() => ({ iw: window.innerWidth, ih: window.innerHeight, ow: window.outerWidth, oh: window.outerHeight, sw: screen.width, sh: screen.height }));
  console.log(`  viewport: ${m.iw}x${m.ih}  |  janela: ${m.ow}x${m.oh}  |  tela spoofada: ${m.sw}x${m.sh}  |  monitor útil: ${WA.workW}x${WA.workH}`);
  check('janela (outer) cabe na área útil (largura)', m.ow <= WA.workW, `${m.ow} <= ${WA.workW}`);
  check('janela (outer) cabe na área útil (altura)', m.oh <= WA.workH, `${m.oh} <= ${WA.workH}`);
  check('janela não excede a tela spoofada', m.ow <= m.sw && m.oh <= m.sh, `${m.ow}x${m.oh} <= ${m.sw}x${m.sh}`);

  await launcher.stop(p.id);
  await require('fs/promises').rm(tmp, { recursive: true, force: true }).catch(() => {});
  console.log(`\n  RESULTADO: ${pass} passou, ${fail} falhou`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('ERRO:', e && e.stack || e); process.exit(2); });
