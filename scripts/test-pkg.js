'use strict';
// Lança o APP EMPACOTADO (dist/win-unpacked/RinoMask.exe) e verifica que funciona:
// UI carrega, motor detectado (Camoufox em cache), cria e abre um perfil real.
const { _electron: electron } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');

const root = path.join(__dirname, '..');
const exe = path.join(root, 'dist', 'win-unpacked', 'RinoMask.exe');

let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log(`  ${ok ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); };

(async function main() {
  if (!fs.existsSync(exe)) { console.error('Build não encontrado:', exe); process.exit(2); }
  const userData = path.join(os.tmpdir(), 'rinomask-pkg-' + Date.now());
  const app = await electron.launch({ executablePath: exe, args: [], env: { ...process.env, ANTY_USER_DATA: userData, RINOMASK_HEADLESS: '1' } });
  const win = await app.firstWindow();

  const errors = [];
  win.on('pageerror', (e) => errors.push(String(e && e.message)));

  await win.waitForTimeout(2500);
  const navCount = await win.locator('#nav .nav-item').count().catch(() => 0);
  check('app empacotado carrega a UI', navCount > 0, navCount + ' itens de nav');
  check('motor Camoufox detectado (sem tela de download)', !(await win.locator('#engine').isVisible().catch(() => false)));
  if (errors.length) console.log('   erros:', errors.join(' | '));

  if (navCount > 0) {
    await win.click('#btn-quick');
    await win.waitForTimeout(600);
    check('cria perfil no app empacotado', (await win.locator('#rows tr').count()) >= 1);

    const list = await win.evaluate(() => window.api.invoke('profiles.list'));
    const id = list[0].id;
    const res = await win.evaluate((pid) => window.api.invoke('profiles.launch', { id: pid }), id);
    console.log('   launch result:', JSON.stringify(res));
    check('"Abrir" lança o Camoufox no app empacotado', res && res.ok, res && res.error ? res.error : '');
    if (res && res.ok) await win.evaluate((pid) => window.api.invoke('profiles.stop', { id: pid }), id);
  }

  await app.close();
  await require('fs/promises').rm(userData, { recursive: true, force: true }).catch(() => {});
  console.log(`\n  RESULTADO: ${pass} passou, ${fail} falhou`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('ERRO:', e && e.stack || e); process.exit(2); });
