'use strict';

const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');

const store = require('../src/store');
const launcher = require('../src/browserLauncher');
const proxyMgr = require('../src/proxyManager');
const sync = require('../src/synchronizer');
const cookieRobot = require('../src/cookieRobot');
const trustScore = require('../src/trustScore');
const detect = require('../src/detect');
const errorLog = require('../src/errorLog');
const branding = require('../src/branding');
const updateChecker = require('../src/updateChecker');
const { REGIONS, PLATFORMS, WINDOWS_FONTS, MAC_FONTS, generateFingerprint, tzOffsetMinutes } = require('../src/fingerprint');
const { resolveIntensity } = require('../src/warmContent');

// Captura erros não tratados do processo principal (init do log acontece no whenReady;
// até lá vira no-op seguro).
process.on('uncaughtException', (e) => errorLog.log({ source: 'main:uncaughtException', message: e && e.message, stack: e && e.stack }));
process.on('unhandledRejection', (e) => errorLog.log({ source: 'main:unhandledRejection', message: (e && e.message) || String(e), stack: e && e.stack }));

let mainWindow = null;

function notifyChanged() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('profiles:changed');
  }
}

// Eventos genéricos para o renderer (ex.: progresso do Cookie Robot).
function emit(type, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('rino:event', { type, ...(payload || {}) });
  }
}

// --- Motor (Camoufox) — baixado no primeiro uso (instalador enxuto) ---
const camoufox = require('../src/engines/camoufox');
async function isEngineInstalled() { return camoufox.isInstalled(); }
function engineCliPath() { return require.resolve('camoufox-js/dist/__main__.js'); }
function downloadEngine() {
  return new Promise((resolve) => {
    (async () => {
      // Limpa instalação anterior parcial/corrompida (ex.: download interrompido por erro de
      // rede) antes de tentar de novo — evita misturar arquivos de tentativas diferentes.
      try { const dir = await camoufox.installDir(); await require('fs').promises.rm(dir, { recursive: true, force: true }); } catch (e) {}
      const { spawn } = require('child_process');
      const child = spawn(process.execPath, [engineCliPath(), 'fetch'], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
      const onData = (d) => emit('engine:progress', { line: String(d).replace(/\s+/g, ' ').trim().slice(0, 140) });
      child.stdout.on('data', onData);
      child.stderr.on('data', onData);
      child.on('exit', async (code) => {
        // O exit code 0 da CLI não garante que o binário ficou íntegro (ex.: extração truncada
        // por queda de rede no meio) — confirmamos com a mesma checagem usada antes de lançar.
        const ok = code === 0 && (await isEngineInstalled());
        if (ok) await branding.applyBranding((e) => errorLog.log(e)).catch(() => {});
        else if (code === 0) errorLog.log({ source: 'engine:download', message: 'fetch retornou sucesso mas o motor nao passou na verificacao de integridade' });
        emit('engine:done', { ok });
        resolve(ok);
      });
      child.on('error', () => { emit('engine:done', { ok: false }); resolve(false); });
    })();
  });
}

// Garante que o perfil está aberto e retorna a página principal.
async function ensureLaunched(id) {
  if (!launcher.isRunning(id)) {
    const prof = store.getProfile(id);
    if (!prof) return null;
    await launcher.launchAutomation(prof, { headless: true });
    store.markLaunched(id);
    notifyChanged();
  }
  return launcher.getPage(id); // null se o perfil estiver aberto no modo manual
}

// Aquece um perfil EM SEGUNDO PLANO (headless, sem janela) por padrão — o usuário não precisa
// abrir nada. opts.show abre a janela do navegador para acompanhar. Executa o Cookie Robot,
// mede a maturidade (cookies/domínios/sites) e FECHA o navegador ao terminar.
async function warmProfile(id, opts) {
  const prof = store.getProfile(id);
  if (!prof) { emit('warm:done', { id, error: 'perfil não encontrado' }); return; }
  const wasRunning = launcher.isRunning(id);
  if (wasRunning && launcher.kindOf(id) !== 'pw') { emit('warm:done', { id, error: 'feche o navegador (modo manual) antes de aquecer' }); return; }
  let launchedByRobot = false;
  // Intensidade (Fase 3) define o teto base; HARD/killer derivam dele → garantia de término preservada.
  const intensity = resolveIntensity(opts && opts.intensity);
  const targetScore = opts && typeof opts.targetScore === 'number' ? opts.targetScore : null;
  const BUDGET = intensity.budgetMs;
  // Trava de segurança: fecha o navegador no pior caso, mesmo se algo travar além do teto interno.
  let killer = null;
  try {
    if (!wasRunning) {
      // Segundo plano por padrão (sem janela). opts.show → janela visível para acompanhar.
      const headless = !(opts && opts.show);
      await launcher.launchAutomation(prof, { headless });
      launchedByRobot = true;
      store.markLaunched(id);
      notifyChanged();
      killer = setTimeout(() => { launcher.stop(id).catch(() => {}); }, BUDGET + 120000);
    }
    const page = await launcher.getPage(id);
    if (!page) { emit('warm:done', { id, error: 'sem página disponível' }); return; }
    emit('warm:start', { id });
    // Jornada começo→meio→fim direcionada ao nicho. Teto ABSOLUTO via Promise.race: o aquecimento
    // NUNCA passa de HARD, mesmo se algo interno travar (o navegador é fechado no finally).
    const HARD = BUDGET + 60000;
    // locale/region do perfil → conteúdo de aquecimento COERENTE com a identidade (não mais pt-BR fixo).
    const fp = prof.fingerprint || {};
    const avoid = (prof.warmHistory && Array.isArray(prof.warmHistory.domains)) ? prof.warmHistory.domains : [];
    const result = await Promise.race([
      (async () => {
        const r = await cookieRobot.warmUp(page, { niche: prof.mainWebsite, locale: fp.locale, region: fp.timezone, budgetMs: BUDGET, targetScore, avoid, onProgress: (pr) => emit('warm:progress', { id, ...pr }) });
        let w = null; try { w = await cookieRobot.measureWarmth(page.context(), r.visited, page); } catch (e) {}
        return { r, w };
      })(),
      new Promise((res) => setTimeout(() => res('__timeout__'), HARD)),
    ]);
    if (result === '__timeout__') {
      emit('warm:done', { id, error: 'tempo limite atingido — encerrado' });
    } else {
      const at = new Date().toISOString();
      if (result.w) store.setWarmth(id, { ...result.w, at });
      // Relatório completo (padrão do detectReport): maturidade v2 + etapas + consentimentos + domínios.
      const report = { v: 2, at, intensity: intensity.key, ...result.r.report, warmth: result.w || null };
      store.setWarmReport(id, report);
      store.setWarmVisited(id, result.r.report.visitedDomains); // Fase 3: diversifica a próxima execução
      emit('warm:done', { id, visited: result.r.visited, warmth: result.w ? result.w.score : 0, report });
    }
  } catch (e) {
    errorLog.log({ source: 'cookieRobot', message: e && e.message, stack: e && e.stack, context: { id } });
    emit('warm:done', { id, error: e && e.message });
  } finally {
    if (killer) clearTimeout(killer);
    if (launchedByRobot) await launcher.stop(id).catch(() => {}); // fecha a janela ao concluir
    notifyChanged();
  }
}

// Aquece vários perfis (Fase 5): pool de concorrência configurável (default 1, teto 3) para
// equilibrar velocidade × memória — cada perfil abre seu próprio navegador.
async function runManyWarm({ ids, intensity, targetScore, concurrency, show } = {}) {
  const queue = Array.isArray(ids) ? ids.slice() : [];
  const conc = Math.max(1, Math.min(3, Number(concurrency) || 1));
  const opts = { intensity, targetScore, show };
  const worker = async () => { while (queue.length) { const id = queue.shift(); await warmProfile(id, opts); } };
  await Promise.all(Array.from({ length: Math.min(conc, queue.length) }, () => worker()));
}

// Auditoria de detecção: abre o perfil, roda a bateria local + os oráculos externos
// (CreepJS/BrowserScan/Iphey), guarda o relatório e fecha. Visível no app (mais honesto:
// detectores degradam em headless); headless só em testes.
async function auditProfile(id, oracles) {
  const prof = store.getProfile(id);
  if (!prof) { emit('detect:done', { id, error: 'perfil não encontrado' }); return; }
  const wasRunning = launcher.isRunning(id);
  if (wasRunning && launcher.kindOf(id) !== 'pw') { emit('detect:done', { id, error: 'feche o navegador (modo manual) antes de auditar' }); return; }
  let launched = false;
  try {
    if (!wasRunning) {
      await launcher.launchAutomation(prof, { headless: process.env.RINOMASK_HEADLESS === '1' });
      launched = true; store.markLaunched(id); notifyChanged();
    }
    const page = await launcher.getPage(id);
    if (!page) { emit('detect:done', { id, error: 'sem página disponível' }); return; }
    emit('detect:start', { id });
    const report = await detect.audit(page, { oracles: oracles || ['leaks', 'browserscan', 'iphey', 'creepjs'], onProgress: (s) => emit('detect:progress', { id, ...s }) });
    store.setDetectReport(id, report);
    emit('detect:done', { id, overall: report.overall, report });
  } catch (e) {
    errorLog.log({ source: 'detect', message: e && e.message, stack: e && e.stack, context: { id } });
    emit('detect:done', { id, error: e && e.message });
  } finally {
    if (launched) await launcher.stop(id).catch(() => {});
    notifyChanged();
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1340,
    height: 820,
    minWidth: 1000,
    minHeight: 640,
    backgroundColor: '#0f0f0f',
    title: 'RinoMask',
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    autoHideMenuBar: true,
    // Barra de título integrada ao tema: esconde a nativa e recolore os
    // controles (min/maximizar/fechar) via Window Controls Overlay.
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0f0f0f', symbolColor: '#cccccc', height: 38 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

// Mapa de canais IPC -> implementacao.
const handlers = {
  // --- meta ---
  'meta.options': () => ({
    regions: REGIONS.map((r) => ({ timezone: r.timezone, locale: r.locale, languages: r.languages, geo: r.geo, offset: tzOffsetMinutes(r.timezone) })),
    osList: PLATFORMS.map((p) => p.os),
    statuses: store.listStatuses(),
    tags: store.listTags(),
    folders: store.listFolders(),
    proxies: store.listProxies(),
    windowsFonts: WINDOWS_FONTS,
    macFonts: MAC_FONTS,
    settings: store.getSettings(),
  }),
  'meta.fingerprintPreview': (p) => generateFingerprint({ os: p?.os, region: p?.region }),
  'settings.save': (p) => { store.saveSettings(p); return store.getSettings(); },

  // --- profiles ---
  'profiles.list': (p) => store.listProfiles({ includeTrash: !!(p && p.includeTrash) })
    .map((x) => ({ ...x, running: launcher.isRunning(x.id) })),
  'profiles.get': (p) => store.getProfile(p.id),
  'profiles.create': (p) => { const r = store.createProfile(p); notifyChanged(); return r; },
  'profiles.update': (p) => { const r = store.updateProfile(p.id, p.patch); notifyChanged(); return r; },
  'profiles.clone': (p) => { const r = store.cloneProfile(p.id, p.count, p.randomize); notifyChanged(); return r; },
  'profiles.pin': (p) => { const r = store.updateProfile(p.id, { pinned: p.pinned }); notifyChanged(); return r; },
  'profiles.reorder': (p) => { store.reorderProfiles(p.orderedIds); notifyChanged(); return { ok: true }; },

  'profiles.trash': (p) => { store.trashProfiles(p.ids); notifyChanged(); return { ok: true }; },
  'profiles.restore': (p) => { store.restoreProfiles(p.ids); notifyChanged(); return { ok: true }; },
  'profiles.deleteForever': async (p) => {
    for (const id of p.ids) if (launcher.isRunning(id)) await launcher.stop(id);
    await store.deleteProfilesForever(p.ids);
    notifyChanged();
    return { ok: true };
  },

  'profiles.setStatus': (p) => { store.bulkSetStatus(p.ids, p.status); notifyChanged(); return { ok: true }; },
  'profiles.addTag': (p) => { store.bulkAddTag(p.ids, p.tagId); notifyChanged(); return { ok: true }; },
  'profiles.removeTag': (p) => { store.bulkRemoveTag(p.ids, p.tagId); notifyChanged(); return { ok: true }; },
  'profiles.setFolder': (p) => { store.bulkSetFolder(p.ids, p.folderId); notifyChanged(); return { ok: true }; },
  'profiles.setProxy': (p) => { store.bulkSetProxy(p.ids, p.proxyRef); notifyChanged(); return { ok: true }; },

  // --- launch / stop ---
  'profiles.launch': async (p) => {
    const prof = store.getProfile(p.id);
    if (!prof) return { ok: false, error: 'perfil nao encontrado' };
    // App real: navegador manual (Firefox real, redimensionável). Testes: headless (sem janela).
    const r = process.env.RINOMASK_HEADLESS === '1'
      ? await launcher.launchAutomation(prof, { headless: true })
      : await launcher.launchManual(prof);
    store.markLaunched(p.id);
    notifyChanged();
    return r;
  },
  'profiles.stop': async (p) => { const r = await launcher.stop(p.id); notifyChanged(); return r; },
  'profiles.launchMany': async (p) => {
    const failed = [];
    for (const id of p.ids) {
      const prof = store.getProfile(id);
      if (prof && !launcher.isRunning(id)) {
        try {
          if (process.env.RINOMASK_HEADLESS === '1') await launcher.launchAutomation(prof, { headless: true });
          else await launcher.launchManual(prof);
          store.markLaunched(id);
        } catch (e) {
          errorLog.log({ source: 'profiles.launchMany', message: e && e.message, context: { id } });
          failed.push({ id, name: prof.name, error: (e && e.message) || 'falha desconhecida' });
        }
      }
    }
    notifyChanged();
    return { ok: failed.length === 0, failed };
  },
  'profiles.stopMany': async (p) => {
    for (const id of p.ids) if (launcher.isRunning(id)) await launcher.stop(id);
    notifyChanged();
    return { ok: true };
  },

  // --- cookies (funciona com o perfil fechado: injeta no userDataDir via contexto transitório) ---
  'profiles.exportCookies': (p) => launcher.exportCookies(store.getProfile(p.id)),
  'profiles.importCookies': (p) => launcher.importCookies(store.getProfile(p.id), p.cookies),

  // --- proxies ---
  'proxies.list': () => store.listProxies(),
  'proxies.create': (p) => { const r = store.createProxy(p); notifyChanged(); return r; },
  'proxies.delete': (p) => { store.deleteProxy(p.id); notifyChanged(); return { ok: true }; },
  'proxies.importBulk': (p) => { const r = store.importProxiesBulk(p.text); notifyChanged(); return r; },
  'proxies.test': async (p) => {
    const r = await proxyMgr.testProxy(p);
    if (p.id) store.updateProxyMeta(p.id, { lastIp: r.ip || null, lastStatus: r.ok ? 'ok' : 'fail', lastCheckedAt: new Date().toISOString() });
    return r;
  },

  // --- folders / statuses / tags ---
  'folders.create': (p) => { const r = store.createFolder(p.name, p.color); notifyChanged(); return r; },
  'folders.update': (p) => { const r = store.updateFolder(p.id, p.patch); notifyChanged(); return r; },
  'folders.delete': (p) => { store.deleteFolder(p.id); notifyChanged(); return { ok: true }; },
  'statuses.create': (p) => { const r = store.createStatus(p.name, p.color); notifyChanged(); return r; },
  'statuses.delete': (p) => { const ok = store.deleteStatus(p.id); notifyChanged(); return { ok }; },
  'tags.create': (p) => { const r = store.createTag(p.name, p.color); notifyChanged(); return r; },
  'tags.delete': (p) => { store.deleteTag(p.id); notifyChanged(); return { ok: true }; },

  // --- cookie robot (aquecimento) ---
  'cookieRobot.run': (p) => { warmProfile(p.id, { intensity: p && p.intensity, targetScore: p && p.targetScore, show: p && p.show }); return { started: true }; },
  'cookieRobot.runMany': (p) => { runManyWarm(p || {}); return { started: true }; },

  // --- trust score (auto-teste de indetectabilidade) ---
  'trust.run': async (p) => {
    const page = await ensureLaunched(p.id);
    if (!page) return { ok: false, error: 'perfil não encontrado' };
    const r = await trustScore.evaluate(page);
    store.setTrustScore(p.id, { score: r.score, at: new Date().toISOString() });
    notifyChanged();
    return { ok: true, ...r };
  },

  // --- auditoria de detecção (bateria local + oráculos externos) ---
  'detect.run': (p) => { auditProfile(p.id, p && p.oracles); return { started: true }; },

  // --- synchronizer ---
  'sync.start': (p) => sync.start(p.ids),
  'sync.stop': () => sync.stop(),
  'sync.navigate': (p) => sync.navigate(p.url),
  'sync.status': () => sync.status(),

  // --- motor (download na 1ª execução) ---
  'engine.status': async () => ({ installed: await isEngineInstalled() }),
  'engine.download': () => { downloadEngine(); return { started: true }; },

  // --- vault (segurança em repouso) ---
  'vault.status': () => store.vaultStatus(),
  'vault.unlock': (p) => { const r = store.unlock(p.password); if (r.ok) notifyChanged(); return r; },
  'vault.lock': () => { const r = store.lock(); notifyChanged(); return r; },
  'vault.setPassword': (p) => store.setMasterPassword(p.password),
  'vault.changePassword': (p) => store.changeMasterPassword(p.oldPassword, p.newPassword),
  'vault.removePassword': (p) => store.removeMasterPassword(p.password),

  // --- atualização (compara versão local com a publicada no GitHub) ---
  'update.check': async () => {
    try { return await updateChecker.check(app.getVersion()); }
    catch (e) { return { error: e && e.message, current: app.getVersion() }; }
  },
  'update.open': () => { try { require('electron').shell.openExternal(updateChecker.RELEASES_URL); return { ok: true }; } catch (e) { return { ok: false }; } },

  // --- log de erros (diagnóstico para correções futuras) ---
  'errors.report': (p) => { errorLog.log({ source: 'renderer' + (p && p.where ? ':' + p.where : ''), message: p && p.message, stack: p && p.stack, context: p && p.context }); return { ok: true }; },
  'errors.recent': (p) => errorLog.recent((p && p.n) || 150),
  'errors.clear': () => errorLog.clear(),
  'errors.openFolder': () => { try { require('electron').shell.showItemInFolder(errorLog.filePath()); return { ok: true }; } catch (e) { return { ok: false }; } },
};

app.whenReady().then(() => {
  // Identidade própria na barra de tarefas do Windows (ícone/agrupamento = RinoMask, não Electron).
  if (process.platform === 'win32') app.setAppUserModelId('com.rinomask.app');
  // Permite uma pasta de dados alternativa (usado em testes automatizados).
  if (process.env.ANTY_USER_DATA) {
    app.setPath('userData', process.env.ANTY_USER_DATA);
  } else {
    // Migração de dados do nome anterior (antidetect-manager → RinoMask): preserva
    // os perfis já criados ao renomear o app. Copia uma única vez se ainda não houver dados.
    try {
      const fs = require('fs');
      const userData = app.getPath('userData');
      if (!fs.existsSync(path.join(userData, 'store.json'))) {
        const legacy = path.join(app.getPath('appData'), 'antidetect-manager');
        if (fs.existsSync(path.join(legacy, 'store.json'))) {
          fs.cpSync(legacy, userData, { recursive: true });
        }
      }
    } catch (e) { /* segue com pasta nova vazia */ }
  }
  store.setDataDir(app.getPath('userData'));
  errorLog.init(app.getPath('userData')); // log de erros em <userData>/errors.log
  launcher.setOnClose(() => notifyChanged());
  launcher.setPersistFingerprint((id, data) => store.setFingerprintData(id, data));
  // Informa o tamanho da tela física para a janela do navegador não estourar o monitor.
  try {
    const d = screen.getPrimaryDisplay();
    launcher.setDisplay({ width: d.size.width, height: d.size.height, workW: d.workAreaSize.width, workH: d.workAreaSize.height });
  } catch (e) {}
  // Marca o motor como RinoMask (ícone/nome na barra de tarefas) — best-effort, com nada aberto.
  isEngineInstalled().then((ok) => { if (ok) branding.applyBranding((e) => errorLog.log(e)).catch(() => {}); });

  for (const [channel, fn] of Object.entries(handlers)) {
    ipcMain.handle(channel, async (_e, payload) => {
      // Enquanto o vault estiver trancado, bloqueia tudo exceto vault.*, engine.* e errors.*.
      if (store.isLocked() && !channel.startsWith('vault.') && !channel.startsWith('engine.') && !channel.startsWith('errors.')) {
        return channel === 'profiles.list' ? [] : { error: 'locked', locked: true };
      }
      try {
        return await fn(payload);
      } catch (e) {
        // Qualquer exceção de handler é registrada (com payload redigido) e devolvida como erro tratável.
        errorLog.log({ source: 'ipc:' + channel, message: e && e.message, stack: e && e.stack, context: channel.startsWith('vault.') ? undefined : payload });
        return { error: (e && e.message) || 'erro interno' };
      }
    });
  }

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', async () => {
  await launcher.stopAll();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async () => {
  await launcher.stopAll();
});
