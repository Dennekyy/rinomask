'use strict';
// Testa a injeção da pílula do perfil no camoufox.cfg (idempotência, troca de versão, preservação).
const path = require('path');
const os = require('os');
const fs = require('fs');
const { applyPill, injectBlock } = require('../src/pill');

let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log(`  ${ok ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); };
const count = (s, needle) => s.split(needle).length - 1;

const ORIGINAL = '// cabecalho\ndefaultPref("a", 1);\ndefaultPref("b", 2);\n';
const V1 = '// >>> RINOMASK PILL v1\n(function(){ /* v1 */ })();\n// <<< RINOMASK PILL\n';
const V2 = '// >>> RINOMASK PILL v2\n(function(){ /* v2 */ })();\n// <<< RINOMASK PILL\n';

console.log('[1] injectBlock (puro)');
const once = injectBlock(ORIGINAL, V1);
check('acrescenta o bloco no fim', once.endsWith(V1));
check('preserva o cfg original', once.startsWith(ORIGINAL));
check('2ª aplicação é idêntica (idempotente)', injectBlock(once, V1) === once);
const upgraded = injectBlock(once, V2);
check('versão nova substitui a antiga', upgraded.includes('/* v2 */') && !upgraded.includes('/* v1 */'));
check('só um bloco após troca de versão', count(upgraded, '>>> RINOMASK PILL') === 1);
check('cfg original intacto após troca', upgraded.startsWith(ORIGINAL));

console.log('\n[2] applyPill (arquivo)');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rinomask-pill-'));
const cfg = path.join(tmp, 'camoufox.cfg');
(async () => {
  check('cfg ausente → skipped', (await applyPill(null, { cfgPath: cfg })).skipped === 'camoufox.cfg ausente');
  fs.writeFileSync(cfg, ORIGINAL);
  check('1ª aplicação grava', (await applyPill(null, { cfgPath: cfg })).ok === true);
  const after = fs.readFileSync(cfg, 'utf8');
  check('arquivo contém o bloco real', after.includes('>>> RINOMASK PILL') && after.includes('rinomask.profile.name'));
  const sandboxPref = path.join(tmp, 'defaults', 'pref', 'rinomask-autoconfig.js');
  check('libera o sandbox do autoconfig (defaults/pref)', fs.existsSync(sandboxPref) && /general\.config\.sandbox_enabled", false/.test(fs.readFileSync(sandboxPref, 'utf8')));
  check('2ª aplicação não regrava (already)', (await applyPill(null, { cfgPath: cfg })).already === true);
  fs.unlinkSync(sandboxPref);
  const again = await applyPill(null, { cfgPath: cfg });
  check('pref do sandbox some → reaplica', again.ok === true && !again.already && fs.existsSync(sandboxPref));
  const code = fs.readFileSync(path.join(__dirname, '..', 'src', 'pill', 'pill.cfg.js'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  check('código do bloco é ASCII (autoconfig não lê UTF-8 com segurança)', /^[\x00-\x7f]*$/.test(code));
  fs.rmSync(tmp, { recursive: true, force: true });

  console.log(`\n${pass} ok, ${fail} falha(s)`);
  process.exit(fail ? 1 : 0);
})();
