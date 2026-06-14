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
async function isEngineInstalled() {
  try { const pk = await import('camoufox-js/dist/pkgman.js'); pk.launchPath(); return true; } catch (e) { return false; }
}
function engineCliPath() { return require.resolve('camoufox-js/dist/__main__.js'); }
function downloadEngine() {
  return new Promise((resolve) => {
    const { spawn } = require('child_process');
    const child = spawn(process.execPath, [engineCliPath(), 'fetch'], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
    const onData = (d) => emit('engine:progress', { line: String(d).replace(/\s+/g, ' ').trim().slice(0, 140) });
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', async (code) => { if (code === 0) await branding.applyBranding((e) => errorLog.log(e)).catch(() => {}); emit('engine:done', { ok: code === 0 }); resolve(code === 0); });
    child.on('error', () => { emit('engine:done', { ok: false }); resolve(false); });
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

// Aquece um perfil: abre o navegador VISÍVEL, executa o Cookie Robot, mede a maturidade
// (cookies/domínios/sites) e FECHA o navegador ao terminar. Headless só em testes.
async function warmProfile(id) {
  const prof = store.getProfile(id);
  if (!prof) { emit('warm:done', { id, error: 'perfil não encontrado' }); return; }
  const wasRunning = launcher.isRunning(id);
  if (wasRunning && launcher.kindOf(id) !== 'pw') { emit('warm:done', { id, error: 'feche o navegador (modo manual) antes de aquecer' }); return; }
  let launchedByRobot = false;
  try {
    if (!wasRunning) {
      await launcher.launchAutomation(prof, { headless: process.env.RINOMASK_HEADLESS === '1' });
      launchedByRobot = true;
      store.markLaunched(id);
      notifyChanged();
    }
    const page = launcher.getPage(id);
    if (!page) { emit('warm:done', { id, error: 'sem página disponível' }); return; }
    emit('warm:start', { id });
    const r = await cookieRobot.warmUp(page, { onProgress: (pr) => emit('warm:progress', { id, ...pr }) });
    const w = await cookieRobot.measureWarmth(page.context(), r.visited);
    store.setWarmth(id, { ...w, at: new Date().toISOString() });
    emit('warm:done', { id, visited: r.visited, warmth: w.score });
  } catch (e) {
    errorLog.log({ source: 'cookieRobot', message: e && e.message, stack: e && e.stack, context: { id } });
    emit('warm:done', { id, error: e && e.message });
  } finally {
    if (launchedByRobot) await launcher.stop(id).catch(() => {}); // fecha a janela ao concluir
    notifyChanged();
  }
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
    const page = launcher.getPage(id);
    if (!page) { emit('detect:done', { id, error: 'sem página disponível' }); return; }
    emit('detect:start', { id });
    const report = await detect.audit(page, { oracles: oracles || ['browserscan', 'iphey', 'creepjs'], onProgress: (s) => emit('detect:progress', { id, ...s }) });
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
    for (const id of p.ids) {
      const prof = store.getProfile(id);
      if (prof && !launcher.isRunning(id)) {
        if (process.env.RINOMASK_HEADLESS === '1') await launcher.launchAutomation(prof, { headless: true }).catch(() => {});
        else await launcher.launchManual(prof).catch(() => {});
        store.markLaunched(id);
      }
    }
    notifyChanged();
    return { ok: true };
  },
  'profiles.stopMany': async (p) => {
    for (const id of p.ids) if (launcher.isRunning(id)) await launcher.stop(id);
    notifyChanged();
    return { ok: true };
  },

  // --- cookies ---
  'profiles.exportCookies': (p) => launcher.exportCookies(p.id),
  'profiles.importCookies': (p) => launcher.importCookies(p.id, p.cookies),

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
  'cookieRobot.run': (p) => { warmProfile(p.id); return { started: true }; },
  'cookieRobot.runMany': (p) => { (async () => { for (const id of p.ids) await warmProfile(id); })(); return { started: true }; },

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
