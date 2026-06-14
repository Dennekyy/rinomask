'use strict';
// Reproduz o caminho real de browserLauncher.launch (motor Camoufox) e mostra erros.
// Rodar sob ABI do Electron: ELECTRON_RUN_AS_NODE=1 electron scripts/test-launch.js
const path = require('path');
const os = require('os');
const store = require('../src/store');
const launcher = require('../src/browserLauncher');

(async function main() {
  const tmp = path.join(os.tmpdir(), 'rinomask-launch-' + Date.now());
  store.setDataDir(tmp);
  launcher.setPersistFingerprint((id, data) => store.setFingerprintData(id, data));

  const p = store.createProfile({ name: 'Launch test', os: 'Windows', region: 'America/Sao_Paulo', startUrl: 'about:blank' });
  console.log('Perfil criado:', p.id);

  try {
    console.log('Lançando (Camoufox, headless=false)...');
    const r = await launcher.launchAutomation(store.getProfile(p.id));
    console.log('launch result:', JSON.stringify(r));
    console.log('isRunning:', launcher.isRunning(p.id));
    const page = await launcher.getPage(p.id);
    const ua = await page.evaluate(() => navigator.userAgent);
    console.log('UA:', ua);
    await launcher.stop(p.id);
    console.log('OK — stop concluído');
  } catch (e) {
    console.error('FALHA no launch:', e && e.stack || e);
  }
  await require('fs/promises').rm(tmp, { recursive: true, force: true }).catch(() => {});
  process.exit(0);
})();
