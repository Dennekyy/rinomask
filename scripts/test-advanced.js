'use strict';
// Verifica os overrides avançados do editor de fingerprint (sem abrir janela).
// Rodar: node scripts/_enode.js scripts/test-advanced.js
const camoufox = require('../src/engines/camoufox');

let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log(`  ${ok ? '✅' : '❌'} ${n}${d !== undefined ? ' — ' + d : ''}`); };
function readConfig(env) { let s = '', i = 1; while (env['CAMOU_CONFIG_' + i] != null) { s += env['CAMOU_CONFIG_' + i]; i++; } return s ? JSON.parse(s) : {}; }

(async function main() {
  const display = { width: 1920, height: 1080, workW: 1920, workH: 1040 };
  const fp = {
    os: 'Windows', screenRes: '1366x768', cpu: 8,
    geolocation: { mode: 'manual', lat: -23.55, lon: -46.63, accuracy: 30 },
    timezoneMode: 'manual', timezone: 'America/Sao_Paulo',
    humanize: false, blockImages: true, doNotTrack: true, webrtcMode: 'auto',
  };
  const profile = { id: 'adv', fingerprint: fp };

  const fpData = await camoufox.generateProfileFingerprint(fp, display);
  check('resolução escolhida (1366x768) aplicada na geração', fpData.bf.screen.width === 1366 && fpData.bf.screen.height === 768, `${fpData.bf.screen.width}x${fpData.bf.screen.height}`);

  // clamp:false (modo manual) → tela = dispositivo virtual do perfil, NÃO o monitor real
  const optsManual = await camoufox.buildLaunchOptions(profile, null, fpData, { headless: true, clamp: false, display });
  const cfg = readConfig(optsManual.env || {});
  check('tela reportada = perfil (1366), não vaza o monitor (1920)', cfg['screen.width'] === 1366, cfg['screen.width']);
  check('CPU override → navigator.hardwareConcurrency = 8', cfg['navigator.hardwareConcurrency'] === 8, cfg['navigator.hardwareConcurrency']);
  check('fuso manual → timezone = America/Sao_Paulo', cfg['timezone'] === 'America/Sao_Paulo', cfg['timezone']);
  check('geo manual → latitude', cfg['geolocation:latitude'] === -23.55, cfg['geolocation:latitude']);
  check('geo manual → longitude', cfg['geolocation:longitude'] === -46.63, cfg['geolocation:longitude']);
  const prefs = optsManual.firefoxUserPrefs || {};
  check('Do Not Track ligado', prefs['privacy.donottrackheader.enabled'] === true);
  check('geo concedida sem prompt (permissions.default.geo = 1)', prefs['permissions.default.geo'] === 1, prefs['permissions.default.geo']);
  check('bloquear imagens → permissions.default.image = 2', prefs['permissions.default.image'] === 2, prefs['permissions.default.image']);

  // Manual: chaves de TAMANHO de janela removidas (conteúdo acompanha maximize); screen.* mantido
  const winKeys = ['window.outerWidth', 'window.outerHeight', 'window.innerWidth', 'window.innerHeight', 'window.screenX', 'window.screenY'];
  check('modo manual: chaves window.* de tamanho removidas (conteúdo reflui)', winKeys.every((k) => !(k in cfg)), winKeys.filter((k) => k in cfg).join(',') || 'todas removidas');
  check('modo manual: screen.* (monitor virtual) preservado', cfg['screen.width'] === 1366 && cfg['screen.height'] === 768);
  check('modo manual: humanize DESLIGADO (não intercepta cliques reais)', !('humanize' in cfg), 'humanize' in cfg ? 'presente!' : 'ausente');

  // Automação com humanize padrão (perfil sem override) → humanize LIGADO (evasão comportamental)
  const optsBot = await camoufox.buildLaunchOptions({ id: 'bot', fingerprint: { os: 'Windows', webrtcMode: 'auto' } }, null, fpData, { headless: true, clamp: true, display });
  check('automação: humanize LIGADO por padrão', readConfig(optsBot.env || {})['humanize'] === true);

  // clamp:true (automação headful) → tela alinhada ao monitor + janela fixa (window.* presente)
  const optsAuto = await camoufox.buildLaunchOptions(profile, null, fpData, { headless: false, clamp: true, display });
  const cfgA = readConfig(optsAuto.env || {});
  check('clamp:true alinha a tela ao monitor (1920)', cfgA['screen.width'] === 1920, cfgA['screen.width']);
  check('clamp:true: janela fixa preservada (window.innerWidth presente)', 'window.innerWidth' in cfgA);

  // 'off' bloqueia a geo
  const fpOff = { ...fp, geolocation: { mode: 'off' } };
  const optsOff = await camoufox.buildLaunchOptions({ id: 'o', fingerprint: fpOff }, null, fpData, { headless: true });
  check("geo 'off' → permissions.default.geo = 2 (bloqueada)", (optsOff.firefoxUserPrefs || {})['permissions.default.geo'] === 2);

  console.log(`\n  RESULTADO: ${pass} passou, ${fail} falhou`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('ERRO:', e && e.stack || e); process.exit(2); });
