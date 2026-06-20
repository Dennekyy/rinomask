'use strict';
// E2E real da ADIÇÃO/EXPORTAÇÃO de cookies — agora com o perfil FECHADO (injeção via contexto
// transitório), exatamente o fluxo do app: navegador fechado/novo → modal → adiciona → o
// navegador passa a usar. Também cobre o perfil aberto em automação. Mesmas funções do IPC.
// Rodar: node scripts/_enode.js scripts/test-cookies.js
const path = require('path'); const os = require('os');
const store = require('../src/store');
const launcher = require('../src/browserLauncher');

let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log(`  ${ok ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); };
const prof = (id) => store.getProfile(id);

(async function main() {
  const tmp = path.join(os.tmpdir(), 'rinomask-cookies-' + Date.now());
  store.setDataDir(tmp);
  launcher.setPersistFingerprint((id, data) => store.setFingerprintData(id, data));
  const p = store.createProfile({ name: 'Cookies', os: 'Windows', startUrl: 'about:blank' });

  const exp1d = Math.floor(Date.now() / 1000) + 86400;
  const cookies = [
    { name: 'sid', value: 'abc123', domain: 'example.com', path: '/', httpOnly: false, secure: true, sameSite: 'Lax', expires: exp1d },
    { name: 'theme', value: 'dark', domain: 'example.com', path: '/', secure: false, expires: exp1d },
    { name: 'gauth', value: 'tok987', domain: '.example.org', path: '/', secure: true, sameSite: 'None', expires: exp1d },
  ];

  // 1) PERFIL FECHADO/NOVO: injeta cookies (contexto transitório) — o caso do usuário.
  console.log('  [perfil FECHADO] injetando cookies…');
  const imp = await launcher.importCookies(prof(p.id), cookies);
  check('importCookies com perfil FECHADO retorna ok', imp.ok, imp.error || `count=${imp.count}`);
  check('reporta a contagem injetada', imp.count === 3, String(imp.count));
  check('perfil continua fechado após a injeção', !launcher.isRunning(p.id));

  // 2) PERFIL FECHADO: exporta (lê do disco via contexto transitório).
  const exp = await launcher.exportCookies(prof(p.id));
  check('exportCookies com perfil FECHADO retorna ok', exp.ok, exp.error || '');
  const byName = Object.fromEntries((exp.cookies || []).map((c) => [c.name, c]));
  check('cookie injetado "sid" está no perfil', !!byName.sid && byName.sid.value === 'abc123', byName.sid ? byName.sid.value : 'ausente');
  check('cookie injetado "gauth" (.example.org)', !!byName.gauth, byName.gauth ? byName.gauth.domain : 'ausente');

  // 3) O NAVEGADOR USA: abre e confere document.cookie em example.com.
  console.log('  [abrindo] verificando que o navegador usa os cookies injetados…');
  await launcher.launchAutomation(prof(p.id), { headless: true });
  const page = await launcher.getPage(p.id);
  let docCookie = '';
  try { await page.goto('https://example.com/', { waitUntil: 'domcontentloaded', timeout: 30000 }); docCookie = await page.evaluate(() => document.cookie); } catch (e) {}
  check('document.cookie traz sid+theme (injetados com o perfil fechado)', /sid=abc123/.test(docCookie) && /theme=dark/.test(docCookie), docCookie || '(vazio)');

  // 4) PERFIL ABERTO (automação): import via contexto vivo + aceita string JSON (como a UI).
  const impLive = await launcher.importCookies(prof(p.id), JSON.stringify([{ name: 'live', value: 'L1', domain: 'example.com', path: '/', expires: exp1d }]));
  check('importCookies com perfil ABERTO (string JSON) ok', impLive.ok, impLive.error || '');

  // 5) PERSISTÊNCIA: fecha, injeta MAIS com o perfil fechado, reabre e confere coexistência.
  await launcher.stop(p.id).catch(() => {});
  const imp2 = await launcher.importCookies(prof(p.id), [{ name: 'closed2', value: 'C2', domain: 'example.com', path: '/', expires: exp1d }]);
  check('segunda injeção com perfil fechado ok', imp2.ok, imp2.error || '');
  const exp2 = await launcher.exportCookies(prof(p.id));
  const names = new Set((exp2.cookies || []).map((c) => c.name));
  check('todos coexistem (sid, live, closed2)', names.has('sid') && names.has('live') && names.has('closed2'), [...names].join(','));

  // 6) Erros tratados (sem crash).
  const bad = await launcher.importCookies(prof(p.id), '{nao json');
  check('JSON inválido → erro tratado', bad.ok === false && /inv/i.test(bad.error || ''), bad.error || '');
  const empty = await launcher.importCookies(prof(p.id), []);
  check('lista vazia → erro tratado', empty.ok === false, empty.error || '');

  await require('fs/promises').rm(tmp, { recursive: true, force: true }).catch(() => {});
  console.log(`\n  RESULTADO: ${pass} passou, ${fail} falhou`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('ERRO:', e && e.stack || e); process.exit(2); });
