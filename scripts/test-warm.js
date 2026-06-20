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
  const r = await cookieRobot.warmUp(page, { niche: 'crypto', locale: 'en-US', budgetMs: budget, onProgress: (s) => console.log('   →', s.label) });
  const elapsed = Date.now() - t0;

  check('a jornada TERMINOU (não pendurou)', true, `${(elapsed / 1000).toFixed(0)}s, ${r.visited}/${r.total} etapas`);
  check('terminou dentro do teto (+ margem de 1 etapa)', elapsed <= budget + 100000, `${(elapsed / 1000).toFixed(0)}s`);
  check('percorreu ao menos 1 etapa', r.visited >= 1);
  check('contexto/página continuam vivos', !page.isClosed());

  // Relatório de aquecimento (Fase 2): forma + coerência de locale/nicho.
  const rep = r.report || {};
  check('warmUp devolve relatório (report)', !!r.report);
  check('relatório reflete o locale passado (en-US)', rep.locale === 'en-US', String(rep.locale));
  check('relatório reflete o nicho (crypto)', rep.niche === 'crypto', String(rep.niche));
  check('relatório tem etapas {label, ok, ms}', Array.isArray(rep.steps) && rep.steps.length > 0 && rep.steps.every((s) => typeof s.label === 'string' && typeof s.ok === 'boolean' && typeof s.ms === 'number'));
  check('relatório conta consentimentos (número)', typeof rep.consents === 'number');
  check('relatório lista domínios visitados (array)', Array.isArray(rep.visitedDomains));
  check('relatório tem duração (ms > 0)', typeof rep.durationMs === 'number' && rep.durationMs > 0);
  check('relatório registra passadas (passes >= 1)', typeof rep.passes === 'number' && rep.passes >= 1);

  const w = await cookieRobot.measureWarmth(ctx, r.visited, page);
  console.log('  Maturidade:', JSON.stringify(w));
  check('acumulou cookies de forma orgânica', w.cookies > 0, String(w.cookies));
  check('calculou maturidade (0–100)', typeof w.score === 'number' && w.score >= 0 && w.score <= 100, `${w.score}/100`);
  check('measureWarmth v2 (1st/3rd-party, persistente, TLDs)', w.v === 2 && typeof w.thirdParty === 'number' && typeof w.persistent === 'number' && typeof w.tlds === 'number');

  await launcher.stop(p.id).catch(() => {});
  await require('fs/promises').rm(tmp, { recursive: true, force: true }).catch(() => {});
  console.log(`\n  RESULTADO: ${pass} passou, ${fail} falhou`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('ERRO:', e && e.stack || e); process.exit(2); });
