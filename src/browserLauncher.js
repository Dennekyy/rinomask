'use strict';

const { firefox } = require('playwright');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const camoufox = require('./engines/camoufox');
const { startBridge } = require('./proxyBridge');

// Consulta processos do navegador manual pela linha de comando (o id do perfil aparece
// no caminho -profile). Usado para detectar fechamento e para encerrar o navegador certo.
function ps(command) {
  return new Promise((resolve) => {
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => resolve(stdout || ''));
  });
}
async function manualPids(profileId) {
  const out = await ps(`Get-CimInstance Win32_Process -Filter "Name='camoufox.exe'" | Where-Object { $_.CommandLine -like '*${profileId}*' } | Select-Object -ExpandProperty ProcessId`);
  return out.split(/\r?\n/).map((s) => s.trim()).filter((s) => /^\d+$/.test(s)).map(Number);
}
let sweepTimer = null;
function startSweep() {
  if (sweepTimer) return;
  sweepTimer = setInterval(async () => {
    const manual = [...running.entries()].filter(([, e]) => e.kind === 'manual');
    if (manual.length === 0) { clearInterval(sweepTimer); sweepTimer = null; return; }
    for (const [id, e] of manual) {
      if (Date.now() - e.launchedAt < 12000) continue; // dá tempo do navegador subir
      const pids = await manualPids(id);
      if (pids.length === 0) { // usuário fechou a janela manualmente
        if (e.bridge) e.bridge.close();
        running.delete(id);
        if (onCloseHook) onCloseHook(id);
      }
    }
  }, 6000);
}

// id -> { kind: 'manual'|'pw', proc?, context?, bridge? }
const running = new Map();
let onCloseHook = null;
let persistFp = null;
let displayInfo = null;

function setOnClose(fn) { onCloseHook = fn; }
function setPersistFingerprint(fn) { persistFp = fn; }
function setDisplay(d) { displayInfo = d; }
function isRunning(id) { return running.has(id); }
function runningIds() { return [...running.keys()]; }
function kindOf(id) { return running.get(id)?.kind || null; }
function getContext(id) { const e = running.get(id); return e && e.kind === 'pw' ? e.context : null; }

async function getPage(id) {
  const ctx = getContext(id);
  if (!ctx) return null;
  const pages = ctx.pages();
  return pages.length ? pages[0] : await ctx.newPage();
}

function mainWebsiteUrl(site) {
  return ({ facebook: 'https://www.facebook.com/', google: 'https://www.google.com/', tiktok: 'https://www.tiktok.com/', crypto: 'https://www.binance.com/' })[site] || null;
}

async function ensureFingerprint(profile) {
  const fp = profile.fingerprint || {};
  if (fp.bf && fp.stable) return { bf: fp.bf, stable: fp.stable };
  const data = await camoufox.generateProfileFingerprint(fp, displayInfo);
  if (persistFp) persistFp(profile.id, data);
  return data;
}

/* ===================== MODO MANUAL (navegador real, com abas) ===================== */
function prefsToUserJs(prefs) {
  return Object.entries(prefs)
    .map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${typeof v === 'string' ? JSON.stringify(v) : v});`)
    .join('\n') + '\n';
}

// Define os prefs de proxy do Firefox (via bridge local quando há autenticação).
async function manualProxyPrefs(rp) {
  if (!rp || !rp.host || !rp.port) return { prefs: {}, bridge: null };
  let host = rp.host, port = Number(rp.port), type = String(rp.type), bridge = null;
  if (rp.username) { bridge = await startBridge(rp); host = '127.0.0.1'; port = bridge.port; type = 'http'; }
  const prefs = { 'network.proxy.type': 1, 'network.proxy.socks_remote_dns': true, 'signon.autologin.proxy': true, 'network.proxy.no_proxies_on': '' };
  if (type.startsWith('socks')) {
    prefs['network.proxy.socks'] = host; prefs['network.proxy.socks_port'] = port;
    prefs['network.proxy.socks_version'] = type === 'socks4' ? 4 : 5;
  } else {
    prefs['network.proxy.http'] = host; prefs['network.proxy.http_port'] = port;
    prefs['network.proxy.ssl'] = host; prefs['network.proxy.ssl_port'] = port;
    prefs['network.proxy.share_proxy_settings'] = true;
  }
  return { prefs, bridge };
}

// "Abrir" → Firefox/Camoufox completo (abas, barra, redimensionamento nativo).
async function launchManual(profile) {
  if (running.has(profile.id)) return { alreadyRunning: true };
  const fpData = await ensureFingerprint(profile);
  // Reaproveita o engine para obter executável + env (CAMOU_CONFIG) + prefs do fingerprint.
  // clamp:false → a janela real do Firefox reflui sozinha e a tela reportada é a do dispositivo virtual do perfil (não vaza o monitor real).
  const opts = await camoufox.buildLaunchOptions(profile, profile.resolvedProxy, fpData, { headless: false, display: displayInfo, clamp: false });
  const { prefs: proxyPrefs, bridge } = await manualProxyPrefs(profile.resolvedProxy);

  const allPrefs = {
    ...(opts.firefoxUserPrefs || {}),
    ...proxyPrefs,
    'browser.shell.checkDefaultBrowser': false,
    'datareporting.policy.dataSubmissionEnabled': false,
    'browser.aboutConfig.showWarning': false,
    'browser.startup.homepage_override.mstone': 'ignore',
  };
  fs.mkdirSync(profile.userDataDir, { recursive: true });
  fs.writeFileSync(path.join(profile.userDataDir, 'user.js'), prefsToUserJs(allPrefs));

  const target = profile.startUrl || mainWebsiteUrl(profile.mainWebsite) || 'https://www.google.com/';
  const args = ['-profile', profile.userDataDir, '-no-remote', '-new-instance', target];
  try {
    // detached: o camoufox.exe é um stub que repassa e sai; rastreamos por processo (id do perfil no -profile).
    const proc = spawn(String(opts.executablePath), args, { env: { ...process.env, ...(opts.env || {}) }, detached: true, stdio: 'ignore' });
    proc.unref();
  } catch (e) {
    if (bridge) bridge.close();
    throw e;
  }
  running.set(profile.id, { kind: 'manual', profileId: profile.id, bridge, launchedAt: Date.now() });
  startSweep();
  return { ok: true };
}

/* ===================== MODO AUTOMAÇÃO (Playwright: cookie robot / trust / sync) ===================== */
async function launchAutomation(profile, { headless = true } = {}) {
  if (running.has(profile.id)) {
    return running.get(profile.id).kind === 'pw' ? { alreadyRunning: true } : { ok: false, error: 'perfil aberto manualmente — feche-o primeiro' };
  }
  const fpData = await ensureFingerprint(profile);
  // clamp:true → no modo headful de automação (ex.: sincronizador) a janela fixa do Camoufox fica utilizável.
  const launchOpts = await camoufox.buildLaunchOptions(profile, profile.resolvedProxy, fpData, { headless, display: displayInfo, clamp: true });
  const context = await firefox.launchPersistentContext(profile.userDataDir, launchOpts);
  running.set(profile.id, { kind: 'pw', context });
  context.on('close', () => { running.delete(profile.id); if (onCloseHook) onCloseHook(profile.id); });
  const page = context.pages()[0] || await context.newPage();
  await page.goto('about:blank').catch(() => {});
  return { ok: true };
}

async function killManual(profileId) {
  const pids = await manualPids(profileId);
  for (const pid of pids) { try { await ps(`Stop-Process -Id ${pid} -Force -ErrorAction SilentlyContinue`); } catch (x) {} }
}

async function stop(id) {
  const e = running.get(id);
  if (!e) return { ok: false, error: 'nao esta em execucao' };
  if (e.kind === 'manual') { await killManual(id); if (e.bridge) e.bridge.close(); }
  else {
    // Fecha o contexto SEM deixar travar: se o close() demorar (navegador travado), mata o
    // processo do Camoufox por id (o -profile carrega o id do perfil na linha de comando).
    await Promise.race([e.context.close().catch(() => {}), new Promise((r) => setTimeout(r, 6000))]);
    await killManual(id).catch(() => {});
    if (e.bridge) e.bridge.close();
  }
  running.delete(id);
  return { ok: true };
}

async function stopAll() {
  for (const [id, e] of running) {
    if (e.kind === 'manual') { await killManual(id); if (e.bridge) e.bridge.close(); }
    else { await e.context.close().catch(() => {}); }
    running.delete(id);
  }
}

// --- Cookies ---
// Abre um contexto persistente HEADLESS transitório sobre o userDataDir do perfil, roda `fn`
// (ler/escrever cookies) e fecha — exatamente como uma injeção de cookies em perfil fechado.
// Os cookies vão para o cookies.sqlite do perfil e ficam lá quando o usuário abrir depois.
async function withTransientContext(profile, fn) {
  const fpData = await ensureFingerprint(profile);
  const launchOpts = await camoufox.buildLaunchOptions(profile, profile.resolvedProxy, fpData, { headless: true, display: displayInfo, clamp: true });
  const context = await firefox.launchPersistentContext(profile.userDataDir, launchOpts);
  try { return await fn(context); }
  finally {
    const closed = await Promise.race([context.close().then(() => true).catch(() => false), new Promise((r) => setTimeout(() => r(false), 6000))]);
    if (!closed) await killManual(profile.id).catch(() => {}); // só força se o close travar
  }
}

// Exporta os cookies do perfil. Aberto em automação → contexto vivo; aberto MANUAL → o profile
// está travado pelo Firefox (peça para fechar); FECHADO → contexto transitório.
async function exportCookies(profile) {
  if (!profile || !profile.id) return { ok: false, error: 'perfil não encontrado' };
  if (isRunning(profile.id)) {
    const ctx = getContext(profile.id);
    if (!ctx) return { ok: false, error: 'feche o navegador (aberto em modo manual) para exportar os cookies' };
    return { ok: true, cookies: await ctx.cookies() };
  }
  try { return { ok: true, cookies: await withTransientContext(profile, (ctx) => ctx.cookies()) }; }
  catch (e) { return { ok: false, error: e.message }; }
}

// Adiciona/injeta cookies no perfil. Funciona com o perfil FECHADO (caso comum): grava no
// cookies.sqlite e o navegador passa a usá-los na próxima abertura, como qualquer injeção.
async function importCookies(profile, cookies) {
  if (!profile || !profile.id) return { ok: false, error: 'perfil não encontrado' };
  let parsed;
  try { parsed = Array.isArray(cookies) ? cookies : JSON.parse(cookies); }
  catch (e) { return { ok: false, error: 'JSON de cookies inválido' }; }
  if (!Array.isArray(parsed) || !parsed.length) return { ok: false, error: 'nenhum cookie para importar' };
  if (isRunning(profile.id)) {
    const ctx = getContext(profile.id);
    if (!ctx) return { ok: false, error: 'feche o navegador (aberto em modo manual) para adicionar cookies' };
    try { await ctx.addCookies(parsed); return { ok: true, count: parsed.length }; }
    catch (e) { return { ok: false, error: e.message }; }
  }
  try { await withTransientContext(profile, (ctx) => ctx.addCookies(parsed)); return { ok: true, count: parsed.length }; }
  catch (e) { return { ok: false, error: e.message }; }
}

module.exports = {
  launchManual, launchAutomation, stop, stopAll, isRunning, runningIds, kindOf,
  getContext, getPage, setOnClose, setPersistFingerprint, setDisplay, exportCookies, importCookies,
};
