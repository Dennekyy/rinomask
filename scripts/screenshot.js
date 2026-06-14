'use strict';
// Captura screenshots do app para conferência visual do redesign.
const { _electron: electron } = require('playwright');
const path = require('path');
const os = require('os');

const root = path.join(__dirname, '..');

(async () => {
  const userData = path.join(os.tmpdir(), 'anty-shot-' + Date.now());
  const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, ANTY_USER_DATA: userData } });
  const win = await app.firstWindow();
  await win.waitForSelector('#nav .nav-item');
  await win.waitForTimeout(800);

  // popular com alguns perfis
  for (let i = 0; i < 6; i++) { await win.click('#btn-quick'); await win.waitForTimeout(220); }

  // criar uma tag para mostrar chips coloridos
  await win.locator('#nav .nav-item', { hasText: 'Tags' }).click();
  await win.waitForTimeout(250);
  await win.locator('.modal input[type=text]').first().fill('Cliente A');
  await win.locator('.modal button.primary', { hasText: 'Adicionar' }).click();
  await win.waitForTimeout(200);
  await win.locator('.modal-foot button').click();
  await win.waitForTimeout(200);

  // selecionar 3 e aplicar status "Ativo" + tag via barra de massa
  const checks = win.locator('#rows tr input[type=checkbox]');
  for (let i = 0; i < 3; i++) await checks.nth(i).check();
  await win.waitForTimeout(200);
  await win.locator('#bulkbar .dd button', { hasText: 'Status' }).click();
  await win.locator('#bulkbar .dd.open .dd-menu .it', { hasText: 'Ativo' }).click();
  await win.waitForTimeout(200);
  await win.locator('#bulkbar .dd button', { hasText: 'Tag' }).click();
  await win.locator('#bulkbar .dd.open .dd-menu .it', { hasText: 'Cliente A' }).click();
  await win.waitForTimeout(200);
  // desmarcar
  for (let i = 0; i < 3; i++) await checks.nth(i).uncheck();
  await win.waitForTimeout(300);

  await win.screenshot({ path: path.join(root, 'preview-main.png') });

  // editor (aba Fingerprint) para mostrar o modal redesenhado
  await win.click('#btn-new');
  await win.waitForTimeout(300);
  await win.locator('.modal .tab', { hasText: 'Fingerprint' }).click();
  await win.waitForTimeout(300);
  await win.screenshot({ path: path.join(root, 'preview-editor.png') });

  console.log('Screenshots salvos: preview-main.png, preview-editor.png');
  await app.close();
  await require('fs/promises').rm(userData, { recursive: true, force: true }).catch(() => {});
})().catch((e) => { console.error('ERRO screenshot:', e); process.exit(1); });
