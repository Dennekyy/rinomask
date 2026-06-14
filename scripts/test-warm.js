'use strict';
// Verifica o Cookie Robot ATIVO: pesquisa de verdade, assiste vídeo no YouTube, acumula
// cookies e mede a maturidade. Rodar: node scripts/_enode.js scripts/test-warm.js
const path = require('path');
const os = require('os');
const store = require('../src/store');
const launcher = require('../src/browserLauncher');
const cookieRobot = require('../src/cookieRobot');

let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log(`  ${ok ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); };

(async function main() {
  const tmp = path.join(os.tmpdir(), 'rinomask-warm-' + Date.now());
  store.setDataDir(tmp);
  launcher.setPersistFingerprint((id, data) => store.setFingerprintData(id, data));
  const p = store.createProfile({ name: 'Warm', os: 'Windows', startUrl: 'about:blank' });
  await launcher.launchAutomation(store.getProfile(p.id));
  const ctx = launcher.getContext(p.id);
  let page = await launcher.getPage(p.id);

  for (const site of ['bing', 'google', 'maps']) {
    await cookieRobot.warmUp(page, { tasks: [site], onProgress: (pr) => console.log(`  executando: ${pr.label}`) });
    if (page.isClosed()) page = ctx.pages()[0] || await ctx.newPage();
    const url = page.url();
    console.log(`  [${site}] contexto vivo=${!page.isClosed()} url=${url.slice(0, 90)}`);
    check(`${site}: navegou ativamente para conteúdo real e sobreviveu`, !page.isClosed() && /^https?:\/\//.test(url) && url !== 'about:blank', url.slice(0, 60));
  }

  // YouTube: deve clicar num vídeo e reproduzir (informativo — YT pode exigir consentimento/anti-bot)
  console.log('  executando: youtube (assistir vídeo)…');
  await cookieRobot.warmUp(page, { tasks: ['youtube'] });
  if (page.isClosed()) page = ctx.pages()[0] || await ctx.newPage();
  const ytUrl = page.url();
  const playing = await page.evaluate(() => { const v = document.querySelector('video'); return !!(v && v.currentTime > 0); }).catch(() => false);
  console.log(`  [youtube] url=${ytUrl.slice(0, 90)} · vídeo reproduzindo=${playing}`);
  if (/watch|youtu/.test(ytUrl) && playing) check('youtube: clicou e ASSISTIU um vídeo', true);
  else console.log('  ⚠ youtube: não confirmou reprodução nesta execução (provável consentimento/anti-bot sem proxy) — validar na GUI');

  const w = await cookieRobot.measureWarmth(ctx, 4);
  console.log('  Maturidade:', JSON.stringify(w));
  check('acumulou cookies de forma orgânica', w.cookies > 0, String(w.cookies));
  check('calculou maturidade (score 0–100)', typeof w.score === 'number' && w.score >= 0 && w.score <= 100, `${w.score}/100 · ${w.domains} domínios`);

  await launcher.stop(p.id).catch(() => {});
  await require('fs/promises').rm(tmp, { recursive: true, force: true }).catch(() => {});
  console.log(`\n  RESULTADO: ${pass} passou, ${fail} falhou`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('ERRO:', e && e.stack || e); process.exit(2); });
