'use strict';
// QA de detecção: abre um perfil REAL e roda a bateria local + os oráculos externos
// (CreepJS, BrowserScan, Iphey). Abre uma janela por ~2-3 min. Também serve de gate de
// regressão (sai != 0 se a nota geral cair abaixo do limiar).
// Rodar: node scripts/_enode.js scripts/test-detect.js
const path = require('path'); const os = require('os');
const store = require('../src/store');
const launcher = require('../src/browserLauncher');
const detect = require('../src/detect');

const THRESHOLD = Number(process.env.DETECT_MIN || 70);
const ORACLES = (process.env.DETECT_ORACLES || 'leaks,iphey,browserscan,creepjs').split(',').map((s) => s.trim()).filter(Boolean);

(async function main() {
  const tmp = path.join(os.tmpdir(), 'rinomask-detect-' + Date.now());
  store.setDataDir(tmp);
  launcher.setPersistFingerprint((id, data) => store.setFingerprintData(id, data));
  const p = store.createProfile({ name: 'Detect', os: 'Windows', startUrl: 'about:blank' });

  const headed = process.env.DETECT_HEADED === '1';
  console.log(`  abrindo perfil (${headed ? 'headed/real' : 'headless'})…`);
  await launcher.launchAutomation(store.getProfile(p.id), { headless: !headed });
  const page = await launcher.getPage(p.id);

  const rep = await detect.audit(page, { oracles: ORACLES, onProgress: (s) => console.log('   …', s.oracle || s.stage) });

  console.log('\n  ===== BATERIA LOCAL (coerência) =====');
  console.log(`  nota local: ${rep.coherence.score}/100 · mentiras: ${rep.coherence.lies.length ? rep.coherence.lies.join(', ') : 'nenhuma'}`);
  rep.coherence.checks.filter((c) => !c.ok).forEach((c) => console.log(`   ✗ ${c.name}${c.detail ? ' — ' + c.detail : ''}`));

  console.log('\n  ===== ORÁCULOS EXTERNOS =====');
  rep.oracles.forEach((o) => {
    const tag = o.ok ? (o.score != null ? `${o.score}/100` : 'ok') : 'indisponível';
    console.log(`   ${o.name}: ${tag}${o.verdict ? ' · ' + o.verdict : ''}${o.error ? ' (' + o.error + ')' : ''}`);
    if (o.raw) console.log(`       cru: ${o.raw}`);
  });

  console.log(`\n  ===== NOTA GERAL (pior fonte): ${rep.overall}/100 =====`);

  await launcher.stop(p.id).catch(() => {});
  await require('fs/promises').rm(tmp, { recursive: true, force: true }).catch(() => {});
  const pass = rep.overall >= THRESHOLD;
  console.log(`  ${pass ? '✅ PASSOU' : '❌ FALHOU'} (limiar ${THRESHOLD})`);
  process.exit(pass ? 0 : 1);
})().catch((e) => { console.error('ERRO:', e && e.stack || e); process.exit(2); });
