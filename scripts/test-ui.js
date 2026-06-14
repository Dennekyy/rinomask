'use strict';

/*
 * Teste funcional da INTERFACE: abre o app Electron com o Playwright e clica
 * em cada botao, verificando o efeito. Captura erros de console/JS do renderer.
 */

const { _electron: electron } = require('playwright');
const path = require('path');
const os = require('os');

const root = path.join(__dirname, '..');

(async function main() {
  const userData = path.join(os.tmpdir(), 'anty-ui-' + Date.now());
  const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, ANTY_USER_DATA: userData, RINOMASK_HEADLESS: '1' } });
  const win = await app.firstWindow();

  const errors = [];
  win.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  win.on('pageerror', (e) => errors.push('pageerror: ' + (e && e.message)));

  let pass = 0, fail = 0;
  const broken = [];
  const check = (n, ok, d) => { (ok ? pass++ : fail++); if (!ok) broken.push(n); console.log(`  ${ok ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); };
  const visible = async (sel) => { try { return await win.locator(sel).first().isVisible(); } catch (e) { return false; } };

  await win.waitForLoadState('domcontentloaded').catch(() => {});
  await win.waitForTimeout(1800); // deixa o init() rodar

  console.log('\n[0] Diagnostico de carregamento:');
  const hasApi = await win.evaluate(() => typeof window.api !== 'undefined').catch(() => false);
  check('preload expos window.api', hasApi);
  const navCount = await win.locator('#nav .nav-item').count().catch(() => 0);
  check('app.js executou (sidebar renderizou)', navCount > 0, navCount + ' itens de nav');

  if (errors.length) { console.log('  ⚠️ erros de console capturados:'); errors.forEach((e) => console.log('     - ' + e)); }

  // Se a UI nem carregou, nao adianta seguir.
  if (navCount === 0) {
    console.log('\n>>> A interface NAO carregou. Encerrando para corrigir a causa raiz.');
    await app.close();
    process.exit(1);
  }

  const step = async (name, fn) => { try { await fn(); } catch (e) { check(name, false, 'EXCEPTION ' + e.message); } };

  console.log('\n[1] Botao "Novo perfil" + editor:');
  await step('abrir editor', async () => {
    await win.click('#btn-new');
    await win.waitForTimeout(300);
    check('"Novo perfil" abre modal', await visible('.modal'));
    check('editor tem 3 abas', (await win.locator('.modal .tab').count()) === 3);
    await win.locator('.modal .tab', { hasText: 'Fingerprint' }).click();
    check('troca para aba Fingerprint', await win.locator('.modal .tabpane').nth(1).isVisible());
    await win.locator('.modal .tab', { hasText: 'Proxy' }).click();
    check('troca para aba Proxy', await win.locator('.modal .tabpane').nth(2).isVisible());
    await win.locator('.modal .tab', { hasText: 'Geral' }).click();
    await win.locator('.modal input').first().fill('UI Teste 1');
    await win.locator('.modal-foot button.primary').click(); // Criar perfil
    await win.waitForTimeout(500);
    check('perfil criado aparece na tabela', (await win.locator('#rows tr').count()) >= 1, (await win.locator('#rows tr').count()) + ' linha(s)');
  });

  console.log('\n[2] Menu de contexto da linha (⋯):');
  await step('menu de contexto', async () => {
    await win.locator('#rows tr').first().locator('button.icon').click();
    await win.waitForTimeout(200);
    check('⋯ abre menu de contexto', await visible('#ctx.show'));
    await win.locator('#ctx .it', { hasText: 'Editar' }).click();
    await win.waitForTimeout(300);
    check('"Editar" abre o editor', await visible('.modal'));
    await win.locator('.modal-foot button.ghost').click(); // Cancelar
  });

  console.log('\n[3] Clonar:');
  await step('clonar', async () => {
    await win.locator('#rows tr').first().locator('button.icon').click();
    await win.locator('#ctx .it', { hasText: 'Clonar' }).click();
    await win.waitForTimeout(300);
    check('"Clonar" abre modal', await visible('.modal'));
    await win.locator('.modal input[type=number]').fill('2');
    await win.locator('.modal-foot button.primary').click();
    await win.waitForTimeout(500);
    check('clones criados (3 linhas no total)', (await win.locator('#rows tr').count()) === 3, (await win.locator('#rows tr').count()) + ' linhas');
  });

  console.log('\n[4] Status / Tags / Pastas / Proxies (sidebar):');
  await step('status', async () => {
    await win.locator('#nav .nav-item', { hasText: 'Status' }).click();
    await win.waitForTimeout(300);
    check('"Status" abre gerenciador', await visible('.modal'));
    await win.locator('.modal input[type=text]').first().fill('Em revisão');
    await win.locator('.modal button.primary', { hasText: 'Adicionar' }).click();
    await win.waitForTimeout(300);
    check('status adicionado', (await win.locator('.modal .list-row').count()) >= 7);
    await win.locator('.modal-foot button').click(); // Fechar
  });
  await step('tags', async () => {
    await win.locator('#nav .nav-item', { hasText: 'Tags' }).click();
    await win.waitForTimeout(300);
    check('"Tags" abre gerenciador', await visible('.modal'));
    await win.locator('.modal input[type=text]').first().fill('cliente-x');
    await win.locator('.modal button.primary', { hasText: 'Adicionar' }).click();
    await win.waitForTimeout(300);
    check('tag adicionada', (await win.locator('.modal .list-row').count()) >= 1);
    await win.locator('.modal-foot button').click();
  });
  await step('nova pasta', async () => {
    await win.locator('#nav .folder-add').click();
    await win.waitForTimeout(300);
    check('"Nova pasta" abre modal', await visible('.modal'));
    await win.locator('.modal input[type=text]').first().fill('Clientes BR');
    await win.locator('.modal-foot button.primary').click();
    await win.waitForTimeout(400);
    check('pasta aparece na sidebar', !!(await win.locator('#nav .nav-item', { hasText: 'Clientes BR' }).count()));
  });
  await step('proxies', async () => {
    await win.locator('#nav .nav-item', { hasText: 'Proxies' }).click();
    await win.waitForTimeout(300);
    check('"Proxies" abre biblioteca', await visible('.modal'));
    await win.locator('.modal input[placeholder="host"]').fill('127.0.0.1');
    await win.locator('.modal input[placeholder="porta"]').fill('8080');
    await win.locator('.modal button.primary', { hasText: 'Adicionar' }).click();
    await win.waitForTimeout(300);
    check('proxy adicionado a biblioteca', (await win.locator('.modal .list-row').count()) >= 1);
    await win.locator('.modal-foot button').click();
  });

  console.log('\n[5] Selecao + barra de acoes em massa:');
  await step('selecao em massa', async () => {
    await win.locator('#rows tr input[type=checkbox]').first().check();
    await win.waitForTimeout(200);
    check('barra de massa aparece ao selecionar', await visible('#bulkbar'));
    check('barra tem botao Abrir', !!(await win.locator('#bulkbar button', { hasText: 'Abrir' }).count()));
    await win.locator('#bulkbar .dd button', { hasText: 'Status' }).first().click();
    await win.waitForTimeout(200);
    check('dropdown de Status abre na barra', await visible('#bulkbar .dd.open .dd-menu'));
  });

  console.log('\n[6] Busca e filtros:');
  await step('busca', async () => {
    await win.locator('#search').fill('NAO_EXISTE_xyz');
    await win.waitForTimeout(300);
    check('busca filtra (0 linhas)', (await win.locator('#rows tr').count()) === 0);
    await win.locator('#search').fill('');
    await win.waitForTimeout(300);
    check('limpar busca restaura linhas', (await win.locator('#rows tr').count()) === 3);
  });

  console.log('\n[7] Lixeira (excluir / restaurar):');
  await step('lixeira', async () => {
    await win.locator('#rows tr').first().locator('button.icon').click();
    await win.locator('#ctx .it', { hasText: 'Excluir' }).click();
    await win.waitForTimeout(400);
    const left = await win.locator('#rows tr').count();
    check('excluir move para lixeira (2 restantes)', left === 2, left + ' linhas');
    await win.locator('#nav .nav-item', { hasText: 'Lixeira' }).click();
    await win.waitForTimeout(300);
    check('lixeira mostra o excluido', (await win.locator('#rows tr').count()) === 1);
    await win.locator('#rows tr').first().locator('button', { hasText: 'Restaurar' }).click();
    await win.waitForTimeout(300);
    check('restaurar funciona (lixeira vazia)', (await win.locator('#rows tr').count()) === 0);
  });

  console.log('\n[8] Abrir navegador (launch real):');
  await step('launch', async () => {
    await win.locator('#nav .nav-item', { hasText: 'Todos os perfis' }).click();
    await win.waitForTimeout(300);
    const list = await win.evaluate(() => window.api.invoke('profiles.list'));
    const id = list[0].id;
    const res = await win.evaluate((pid) => window.api.invoke('profiles.launch', { id: pid }), id);
    check('"Abrir" lança o navegador', res && res.ok, res && res.error ? res.error : '');
    if (res && res.ok) await win.evaluate((pid) => window.api.invoke('profiles.stop', { id: pid }), id);
  });

  console.log('\n[9] Botao "Perfil rápido" (fingerprint aleatória coerente):');
  await step('perfil rapido', async () => {
    await win.locator('#nav .nav-item', { hasText: 'Todos os perfis' }).click();
    await win.waitForTimeout(300);
    const before = await win.locator('#rows tr').count();
    // clica varias vezes para testar a coerencia em amostras diferentes
    for (let i = 0; i < 5; i++) { await win.click('#btn-quick'); await win.waitForTimeout(250); }
    const after = await win.locator('#rows tr').count();
    check('"Perfil rápido" cria perfil na hora, sem abrir editor', after === before + 5 && !(await visible('.modal')), `${before} -> ${after}`);

    const fps = await win.evaluate(async () => (await window.api.invoke('profiles.list', { includeTrash: false })).map((p) => p.fingerprint));
    const contradicao = (f) =>
      f.deviceMemory > 8 ||                                                    // Chrome cap
      (f.os === 'Windows' && (f.platform !== 'Win32' || /Macintosh|Mac OS/.test(f.userAgent) || !/Direct3D/.test(f.webgl.renderer))) ||
      (f.os === 'macOS' && (f.platform !== 'MacIntel' || /Windows/.test(f.userAgent) || !/OpenGL/.test(f.webgl.renderer))) ||
      !Array.isArray(f.languages) || f.languages.length === 0 ||
      f.maxTouchPoints !== 0;                                                  // desktop
    const ruins = fps.filter(contradicao);
    check('todas as fingerprints sao coerentes (nada contraditorio)', ruins.length === 0, ruins.length ? JSON.stringify(ruins[0]) : `${fps.length} perfis verificados`);
  });

  console.log('\n[10] Edição persiste (região/idioma):');
  await step('editar e salvar região', async () => {
    const name = (await win.locator('#rows tr').first().locator('.nm').textContent()).trim();
    await win.locator('#rows tr').first().locator('button.icon').click();
    await win.locator('#ctx .it', { hasText: 'Editar' }).click();
    await win.waitForTimeout(300);
    await win.locator('.modal .tab', { hasText: 'Fingerprint' }).click();
    await win.waitForTimeout(150);
    const regionSel = win.locator('.modal select').filter({ has: win.locator('option[value="America/Sao_Paulo"]') });
    await regionSel.selectOption('America/Sao_Paulo');
    await win.waitForTimeout(150);
    await win.locator('.modal-foot button.primary').click(); // Salvar
    await win.waitForTimeout(400);
    // confere no store que locale/timezone realmente mudaram
    const prof = await win.evaluate(async (nm) => (await window.api.invoke('profiles.list', { includeTrash: false })).find((p) => p.name === nm), name);
    const ok = prof && prof.fingerprint.locale === 'pt-BR' && prof.fingerprint.timezone === 'America/Sao_Paulo';
    check('trocar região salva locale + fuso (pt-BR / Sao_Paulo)', ok, prof ? `${prof.fingerprint.locale} / ${prof.fingerprint.timezone}` : 'perfil não achado');
    // reabrir o editor deve refletir a região salva
    await win.locator('#rows tr').first().locator('button.icon').click();
    await win.locator('#ctx .it', { hasText: 'Editar' }).click();
    await win.waitForTimeout(300);
    await win.locator('.modal .tab', { hasText: 'Fingerprint' }).click();
    const shown = await regionSel.inputValue();
    check('editor reabre com a região salva', shown === 'America/Sao_Paulo', shown);
    await win.locator('.modal-foot button.ghost').click();
  });

  console.log('\n==============================================');
  console.log(`  RESULTADO: ${pass} passou, ${fail} falhou`);
  if (broken.length) console.log('  BOTOES COM PROBLEMA: ' + broken.join(' | '));
  if (errors.length) { console.log('  ERROS DE CONSOLE:'); errors.forEach((e) => console.log('   - ' + e)); }
  console.log('==============================================');

  await app.close();
  await require('fs/promises').rm(userData, { recursive: true, force: true }).catch(() => {});
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('ERRO no teste de UI:', e); process.exit(2); });
