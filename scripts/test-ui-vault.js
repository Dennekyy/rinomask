'use strict';
// Testa a tela de bloqueio na UI real: definir senha → fechar → reabrir trancado → desbloquear.
const { _electron: electron } = require('playwright');
const path = require('path');
const os = require('os');

const root = path.join(__dirname, '..');
const userData = path.join(os.tmpdir(), 'rinomask-uivault-' + Date.now());
const env = { ...process.env, ANTY_USER_DATA: userData, RINOMASK_HEADLESS: '1' };

let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log(`  ${ok ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); };

(async function main() {
  // --- 1ª sessão: cria perfil + define senha-mestra ---
  let app = await electron.launch({ args: [root], cwd: root, env });
  let win = await app.firstWindow();
  await win.waitForSelector('#nav .nav-item');
  await win.waitForTimeout(700);
  await win.click('#btn-quick');
  await win.waitForTimeout(500);
  const created = await win.locator('#rows tr').count();
  check('perfil criado na 1ª sessão', created >= 1, created + ' linha(s)');

  await win.locator('#nav .nav-item', { hasText: 'Segurança' }).click();
  await win.waitForTimeout(300);
  const pwInputs = win.locator('.modal input[type=password]');
  await pwInputs.nth(0).fill('senha123');
  await pwInputs.nth(1).fill('senha123');
  await win.locator('.modal-foot button', { hasText: 'Ativar' }).click();
  await win.waitForTimeout(600);
  check('senha-mestra definida (modal fechou)', !(await win.locator('.modal').isVisible().catch(() => false)));
  await app.close();

  // --- 2ª sessão: deve abrir TRANCADO ---
  app = await electron.launch({ args: [root], cwd: root, env });
  win = await app.firstWindow();
  await win.waitForTimeout(1200);
  check('tela de bloqueio aparece ao reabrir', await win.locator('#lock').isVisible());
  check('tabela não acessível enquanto trancado', (await win.locator('#rows tr').count()) === 0);

  // senha errada
  await win.locator('#lock input').fill('errada');
  await win.locator('#lock button', { hasText: 'Desbloquear' }).click();
  await win.waitForTimeout(600);
  check('senha errada mantém bloqueado', await win.locator('#lock').isVisible());

  // senha certa
  await win.locator('#lock input').fill('senha123');
  await win.locator('#lock button', { hasText: 'Desbloquear' }).click();
  await win.waitForTimeout(900);
  check('senha certa desbloqueia', !(await win.locator('#lock').isVisible()));
  check('perfil reaparece após desbloquear', (await win.locator('#rows tr').count()) >= 1);

  await app.close();
  await require('fs/promises').rm(userData, { recursive: true, force: true }).catch(() => {});
  console.log(`\n  RESULTADO: ${pass} passou, ${fail} falhou`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('ERRO:', e && e.stack || e); process.exit(2); });
