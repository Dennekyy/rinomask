'use strict';
// Valida o modo MANUAL: abre o Camoufox real, é rastreado, e "Parar" fecha o navegador certo.
// Abre uma janela real por ~10s. Rodar: node scripts/_enode.js scripts/test-manual.js
const path = require('path'); const os = require('os');
const { execFile } = require('child_process');
const store = require('../src/store');
const launcher = require('../src/browserLauncher');

let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log(`  ${ok ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function countProcs(id) {
  return new Promise((res) => execFile('powershell', ['-NoProfile', '-Command', `(Get-CimInstance Win32_Process -Filter "Name='camoufox.exe'" | Where-Object { $_.CommandLine -like '*${id}*' } | Measure-Object).Count`], { windowsHide: true }, (e, o) => res(parseInt((o || '0').trim()) || 0)));
}

(async function main() {
  const tmp = path.join(os.tmpdir(), 'rinomask-man-' + Date.now());
  store.setDataDir(tmp);
  launcher.setPersistFingerprint((id, data) => store.setFingerprintData(id, data));
  launcher.setDisplay({ width: 1366, height: 768, workW: 1366, workH: 728 });
  const p = store.createProfile({ name: 'Man', os: 'Windows', startUrl: 'about:blank' });

  const r = await launcher.launchManual(store.getProfile(p.id));
  console.log('  launchManual:', JSON.stringify(r));
  await sleep(7000);
  check('app considera o perfil em execução', launcher.isRunning(p.id) && launcher.kindOf(p.id) === 'manual');
  const opened = await countProcs(p.id);
  check('navegador Camoufox REAL aberto (processo existe)', opened > 0, opened + ' processo(s)');

  await launcher.stop(p.id);
  await sleep(4000);
  const afterStop = await countProcs(p.id);
  check('"Parar" fechou o navegador do perfil', afterStop === 0, afterStop + ' processo(s) restante(s)');
  check('app não considera mais em execução', !launcher.isRunning(p.id));

  await require('fs/promises').rm(tmp, { recursive: true, force: true }).catch(() => {});
  console.log(`\n  RESULTADO: ${pass} passou, ${fail} falhou`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('ERRO:', e && e.stack || e); process.exit(2); });
