'use strict';

// Motor Camoufox (Firefox com injeção de fingerprint nativa em C++).
// camoufox-js é ESM → carregado via import() dinâmico (este módulo é CJS).
// Roda sob o ABI do Electron (better-sqlite3 do sampler de WebGL).

let _cf = null, _fp = null, _wg = null, _pk = null;
async function cf() { if (!_cf) _cf = await import('camoufox-js'); return _cf; }
async function fpmod() { if (!_fp) _fp = await import('camoufox-js/dist/fingerprints.js'); return _fp; }
async function wgmod() { if (!_wg) _wg = await import('camoufox-js/dist/webgl/sample.js'); return _wg; }
async function pkmod() { if (!_pk) _pk = await import('camoufox-js/dist/pkgman.js'); return _pk; }

// Verifica se o motor está instalado SEM disparar o fetch interno e silencioso da lib
// (pkgman.camoufoxPath() baixa em background se ausente) — checamos antes de chamar
// qualquer coisa que passe por ali, para nunca depender desse download não supervisionado.
async function isInstalled() {
  try { const pk = await pkmod(); pk.launchPath(); return true; } catch (e) { return false; }
}
async function installDir() { const pk = await pkmod(); return pk.INSTALL_DIR; }

const SHORT_OS = { windows: 'win', macos: 'mac', linux: 'lin' };
const randInt = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

function mapOs(os) {
  const o = String(os || '').toLowerCase();
  if (o.includes('mac')) return 'macos';
  if (o.includes('linux')) return 'linux';
  return 'windows';
}

function toProxy(rp) {
  if (!rp || !rp.host || !rp.port) return null;
  const out = { server: `${rp.type}://${rp.host}:${rp.port}` };
  if (rp.username) { out.username = rp.username; out.password = rp.password || ''; }
  return out;
}

// O Camoufox FIXA a janela por design (proteção de fingerprint de janela), então o
// conteúdo não reflui ao redimensionar. Para uma experiência usável, alinhamos a TELA
// ao monitor real e abrimos a JANELA já ocupando a área útil (cheia) — o conteúdo
// preenche a tela e não é preciso redimensionar. Coerente (janela ≤ tela = monitor real).
// Apenas arredonda as coordenadas da tela gerada (BrowserForge às vezes produz float).
// NÃO altera valores → preserva o "dispositivo virtual" coerente do perfil (modo manual).
function roundScreen(bf) {
  if (!bf || !bf.screen) return bf;
  const s = { ...bf.screen };
  for (const k of Object.keys(s)) if (typeof s[k] === 'number' && k !== 'devicePixelRatio') s[k] = Math.round(s[k]);
  return { ...bf, screen: s };
}

function clampScreen(bf, display) {
  if (!display || !bf || !bf.screen) return roundScreen(bf);
  const W = display.width, H = display.height;
  const workW = display.workW || W, workH = display.workH || H;
  const s = { ...bf.screen };
  // Tela = monitor físico real (sem mismatch janela > tela).
  s.width = W; s.height = H;
  s.availWidth = W; s.availHeight = workH;
  s.availTop = 0; s.availLeft = 0; s.screenX = 0; s.screenY = 0; s.pageXOffset = 0; s.pageYOffset = 0;
  // Janela abre cheia (área útil); conteúdo preenche a tela.
  s.outerWidth = workW; s.outerHeight = workH;
  s.innerWidth = workW; s.innerHeight = Math.max(400, workH - 74);
  s.clientWidth = s.innerWidth; s.clientHeight = s.innerHeight;
  for (const k of Object.keys(s)) { if (typeof s[k] === 'number' && k !== 'devicePixelRatio') s[k] = Math.round(s[k]); }
  return { ...bf, screen: s };
}

// Chaves que TRAVAM o tamanho/posição da janela do conteúdo. Removê-las do CAMOU_CONFIG faz
// o Camoufox usar a janela REAL do SO → o conteúdo reflui ao redimensionar/maximizar (modo manual).
// Mantemos screen.* (monitor virtual) intacto = fingerprint de tela estável.
const WINDOW_SIZE_KEYS = ['window.outerWidth', 'window.outerHeight', 'window.innerWidth', 'window.innerHeight', 'window.screenX', 'window.screenY'];
function releaseWindowSize(out) {
  try {
    if (!out || !out.env) return;
    let str = '', i = 1;
    while (out.env['CAMOU_CONFIG_' + i] != null) { str += out.env['CAMOU_CONFIG_' + i]; delete out.env['CAMOU_CONFIG_' + i]; i++; }
    if (!str) return;
    const config = JSON.parse(str);
    for (const k of WINDOW_SIZE_KEYS) delete config[k];
    // Re-serializa e re-chunka idêntico ao getEnvVars do camoufox-js (chunk de 2047 no Windows).
    const json = JSON.stringify(config);
    const chunkSize = process.platform === 'win32' ? 2047 : 32767;
    for (let j = 0, n = 1; j < json.length; j += chunkSize, n++) out.env['CAMOU_CONFIG_' + n] = json.slice(j, j + chunkSize);
  } catch (e) { /* em caso de falha, mantém o config original (janela fixa) — pior caso = comportamento antigo */ }
}

// Gera a fingerprint COMPLETA e ESTÁVEL do perfil (gerada uma vez, persistida e reusada):
//  - bf: fingerprint BrowserForge (navigator, tela, fontes...) — tela ≤ monitor físico
//  - stable: WebGL + offsets/seeds que o Camoufox randomizaria a cada launch.
function parseRes(s) {
  const m = /^(\d{3,5})x(\d{3,5})$/.exec(String(s || '').trim());
  return m ? { w: +m[1], h: +m[2] } : null;
}

async function generateProfileFingerprint(fp, display) {
  const { generateFingerprint } = await fpmod();
  const { sampleWebGL } = await wgmod();
  const os = mapOs(fp && fp.os);
  const cfg = { operatingSystems: [os] };
  const res = parseRes(fp && fp.screenRes);
  if (res) cfg.screen = { minWidth: res.w, maxWidth: res.w, minHeight: res.h, maxHeight: res.h }; // resolução exata escolhida
  else if (display && display.width && display.height) cfg.screen = { maxWidth: display.width, maxHeight: display.height };
  const bf = generateFingerprint(undefined, cfg);
  const webgl = await sampleWebGL(SHORT_OS[os] || 'win');
  const stable = {
    webgl,
    canvasAaOffset: randInt(-50, 50),
    fontsSpacingSeed: randInt(0, 1073741823),
    historyLength: randInt(1, 5),
  };
  return { bf, stable };
}

// Monta as launchOptions do Camoufox (proxy + coerência geo + estabilidade total).
async function buildLaunchOptions(profile, resolvedProxy, fpData, { headless = false, display = null, clamp = false } = {}) {
  const { launchOptions } = await cf();
  const fp = profile.fingerprint || {};
  const { bf, stable } = fpData;
  const { webGl2Enabled, ...webGlConfig } = stable.webgl || {};

  // Pré-popula o config com tudo que o Camoufox randomizaria por launch.
  // launchOptions usa mergeInto/setInto (grava só se ausente) → nossos valores vencem.
  const config = {
    ...webGlConfig,
    'canvas:aaOffset': stable.canvasAaOffset,
    'canvas:aaCapOffset': true,
    'fonts:spacing_seed': stable.fontsSpacingSeed,
    'window.history.length': stable.historyLength,
  };

  // --- Overrides avançados do editor (opcionais; vencem o geoip por serem set-if-absent) ---
  if (fp.cpu && Number(fp.cpu) > 0) config['navigator.hardwareConcurrency'] = Number(fp.cpu);
  if (fp.geolocation && fp.geolocation.mode === 'manual') {
    config['geolocation:latitude'] = Number(fp.geolocation.lat) || 0;
    config['geolocation:longitude'] = Number(fp.geolocation.lon) || 0;
    config['geolocation:accuracy'] = Number(fp.geolocation.accuracy) || 50;
  }
  if (fp.timezoneMode === 'manual' && fp.timezone) config['timezone'] = fp.timezone;

  const opts = {
    os: mapOs(fp.os),
    headless,
    viewport: null,                        // viewport segue a janela → conteúdo responsivo ao redimensionar
    // Manual (clamp=false): tela = dispositivo virtual do perfil (não vaza o monitor real, reflui sozinho).
    // Automação headful (clamp=true): tela alinhada ao monitor p/ janela utilizável.
    fingerprint: clamp ? clampScreen(bf, display) : roundScreen(bf),
    i_know_what_im_doing: true,            // intencional: reusamos a fp p/ estabilidade
    // humanize = cursor "humano" nativo do Camoufox. Só na AUTOMAÇÃO (clamp:true), p/ evadir
    // detecção comportamental. No modo MANUAL (clamp:false) ele interceptaria o clique REAL do
    // usuário (precisaria clicar 2x, atrapalha trocar de aba) → sempre desligado.
    humanize: clamp ? (fp.humanize === false ? false : true) : false,
    block_webrtc: fp.webrtcMode === 'disabled',
    block_images: !!fp.blockImages,
    config,
    firefox_user_prefs: {
      'webgl.enable-webgl2': webGl2Enabled,
      'webgl.force-enabled': true,
      // Bloqueia prompts que travariam a automação/aquecimento (realista: muita gente bloqueia).
      'permissions.default.desktop-notification': 2,
      // 1 = concede a geo (spoofada pelo proxy) sem prompt; 2 = bloqueia ('off'). Nunca 0 (o prompt travaria a automação).
      'permissions.default.geo': fp.geolocation && fp.geolocation.mode === 'off' ? 2 : 1,
      'privacy.donottrackheader.enabled': !!fp.doNotTrack,
    },
  };

  const proxy = toProxy(resolvedProxy);
  if (proxy) {
    opts.proxy = proxy;
    opts.geoip = true;                                              // tz/locale/lat/lon do IP do proxy
    opts.firefox_user_prefs['network.proxy.socks_remote_dns'] = true; // DNS pelo proxy
  } else if (fp.locale) {
    opts.locale = [fp.locale];
  }

  const out = await launchOptions(opts);
  // Modo manual (clamp:false): libera o tamanho da janela → conteúdo acompanha o maximize/resize.
  // Automação (clamp:true): mantém a janela fixa do fingerprint (Playwright controla o tamanho).
  if (!clamp) releaseWindowSize(out);
  return out;
}

module.exports = { buildLaunchOptions, generateProfileFingerprint, mapOs, isInstalled, installDir };
