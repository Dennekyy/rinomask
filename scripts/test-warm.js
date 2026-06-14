'use strict';
// Verifica o aquecimento por JORNADA: SEMPRE termina dentro do teto (budget), aquece de
// verdade (cookies) e mede a maturidade. Rodar: node scripts/_enode.js scripts/test-warm.js
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
  const p = store.createProfile({ name: 'Warm', os: 'Windows', mainWebsite: 'crypto', startUrl: 'about:blank' });
  await launcher.launchAutomation(store.getProfile(p.id));
  const ctx = launcher.getContext(p.id);
  const page = await launcher.getPage(p.id);

  // Jornada com nicho 'crypto' e TETO curto (50s) → tem que terminar rápido, não pendurar.
  const budget = 50000;
  console.log(`  rodando jornada (nicho crypto, teto ${budget / 1000}s)…`);
  const t0 = Date.now();
  const r = await cookieRobot.warmUp(page, { niche: 'crypto', budgetMs: budget, onProgress: (s) => console.log('   →', s.label) });
  const elapsed = Date.now() - t0;

  check('a jornada TERMINOU (não pendurou)', true, `${(elapsed / 1000).toFixed(0)}s, ${r.visited}/${r.total} etapas`);
  check('terminou dentro do teto (+ margem de 1 etapa)', elapsed <= budget + 100000, `${(elapsed / 1000).toFixed(0)}s`);
  check('percorreu ao menos 1 etapa', r.visited >= 1);
  check('contexto/página continuam vivos', !page.isClosed());

  const w = await cookieRobot.measureWarmth(ctx, r.visited);
  console.log('  Maturidade:', JSON.stringify(w));
  check('acumulou cookies de forma orgânica', w.cookies > 0, String(w.cookies));
  check('calculou maturidade (0–100)', typeof w.score === 'number' && w.score >= 0 && w.score <= 100, `${w.score}/100`);

  await launcher.stop(p.id).catch(() => {});
  await require('fs/promises').rm(tmp, { recursive: true, force: true }).catch(() => {});
  console.log(`\n  RESULTADO: ${pass} passou, ${fail} falhou`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('ERRO:', e && e.stack || e); process.exit(2); });
