'use strict';
// Testa o trust score num perfil Camoufox. Rodar: node scripts/_enode.js scripts/test-trust.js
const path = require('path');
const os = require('os');
const store = require('../src/store');
const launcher = require('../src/browserLauncher');
const trustScore = require('../src/trustScore');

(async function main() {
  const tmp = path.join(os.tmpdir(), 'rinomask-trust-' + Date.now());
  store.setDataDir(tmp);
  launcher.setPersistFingerprint((id, data) => store.setFingerprintData(id, data));
  const p = store.createProfile({ name: 'Trust', os: 'Windows', startUrl: 'about:blank' });

  await launcher.launchAutomation(store.getProfile(p.id));
  const page = await launcher.getPage(p.id);
  const r = await trustScore.evaluate(page);

  console.log(`\nTrust score: ${r.score}/100\n`);
  r.checks.forEach((c) => console.log(`  ${c.ok ? '✅' : '❌'} [${c.weight}] ${c.name}${c.detail ? ' — ' + c.detail : ''}`));

  await launcher.stop(p.id);
  await require('fs/promises').rm(tmp, { recursive: true, force: true }).catch(() => {});
  const ok = r.score >= 80;
  console.log(`\n  ${ok ? '✅' : '❌'} score >= 80 (esperado para o motor nativo) — ${r.score}`);
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('ERRO:', e && e.stack || e); process.exit(2); });
