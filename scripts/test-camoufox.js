'use strict';

// Valida o motor Camoufox: lança um contexto persistente, confirma que é Firefox,
// que NÃO há tells de injeção JS (getters nativos), e lê alguns vetores.

const path = require('path');
const os = require('os');
const { firefox } = require('playwright');

(async function main() {
  const userDataDir = path.join(os.tmpdir(), 'rinomask-camoufox-' + Date.now());
  const { launchOptions } = await import('camoufox-js');

  let pass = 0, fail = 0;
  const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log(`  ${ok ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); };

  console.log('Gerando launchOptions do Camoufox (os=windows)...');
  const opts = await launchOptions({
    os: 'windows',
    headless: true,           // teste sem janela
    geoip: false,
    humanize: true,
    block_webrtc: false,
  });
  console.log('  executablePath:', opts.executablePath ? 'definido' : 'AUSENTE');

  console.log('Abrindo contexto persistente...');
  const context = await firefox.launchPersistentContext(userDataDir, opts);
  const page = context.pages()[0] || await context.newPage();
  await page.goto('about:blank').catch(() => {});

  const info = await page.evaluate(() => {
    const desc = Object.getOwnPropertyDescriptor(Navigator.prototype, 'hardwareConcurrency');
    return {
      ua: navigator.userAgent,
      platform: navigator.platform,
      hc: navigator.hardwareConcurrency,
      mem: navigator.deviceMemory,
      webdriver: navigator.webdriver,
      langs: navigator.languages.join(','),
      // nativeness: o getter de hardwareConcurrency deve ser código nativo
      hcGetterNative: desc && desc.get ? desc.get.toString().includes('[native code]') : 'n/a',
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  });

  console.log('  UA:', info.ua);
  check('motor é Firefox (Camoufox)', /Firefox\//.test(info.ua), info.ua.slice(0, 60));
  check('navigator.webdriver não denuncia automação', !info.webdriver, 'webdriver=' + info.webdriver);
  check('getter de hardwareConcurrency é NATIVO (sem injeção JS)', info.hcGetterNative === true, 'native=' + info.hcGetterNative);
  console.log(`  (info) platform=${info.platform} hc=${info.hc} mem=${info.mem} tz=${info.tz} langs=${info.langs}`);

  await context.close();
  await require('fs/promises').rm(userDataDir, { recursive: true, force: true }).catch(() => {});

  console.log(`\n  RESULTADO: ${pass} passou, ${fail} falhou`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('ERRO:', e); process.exit(2); });
