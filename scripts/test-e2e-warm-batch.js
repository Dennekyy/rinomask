'use strict';
// Reproduz o fluxo pedido pelo usuario, usando os MESMOS modulos que o app real usa
// (store + browserLauncher + cookieRobot + src/warmer, igual ao electron/main.js), mas com
// uma pasta de dados ISOLADA (os.tmpdir()) para nao tocar nos perfis reais do usuario em
// %APPDATA%\RinoMask. Rodar sob o ABI do Electron: node scripts/_enode.js scripts/test-e2e-warm-batch.js
const path = require('path');
const os = require('os');
const fsp = require('fs/promises');
const store = require('../src/store');
const launcher = require('../src/browserLauncher');
const cookieRobot = require('../src/cookieRobot');
const errorLog = require('../src/errorLog');
const { createWarmer } = require('../src/warmer');

let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log(`  ${ok ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); };
const events = [];
const emit = (type, payload) => { events.push({ type, ...(payload || {}) }); console.log(`   event: ${type}`, JSON.stringify(payload || {}).slice(0, 160)); };
const notifyChanged = () => {};

(async function main() {
  const tmp = path.join(os.tmpdir(), 'rinomask-e2e-' + Date.now());
  store.setDataDir(tmp);
  errorLog.init(tmp);
  launcher.setPersistFingerprint((id, data) => store.setFingerprintData(id, data));
  const warmer = createWarmer({ store, launcher, cookieRobot, errorLog, emit, notifyChanged });

  console.log('\n== 1) Criar 1 perfil e abrir (launchAutomation, igual profiles.launch headless) ==');
  const p1 = store.createProfile({ name: 'Perfil teste', os: 'Windows', mainWebsite: 'google', startUrl: 'about:blank' });
  check('perfil criado', !!p1 && !!p1.id);
  let openErr = null;
  try { await launcher.launchAutomation(store.getProfile(p1.id), { headless: true }); } catch (e) { openErr = e; }
  check('abriu sem erro', !openErr, openErr && openErr.message);
  check('isRunning true após abrir', launcher.isRunning(p1.id));
  await launcher.stop(p1.id).catch(() => {});

  console.log('\n== 2) Aquecer esse 1 perfil (intensidade leve, igual cookieRobot.run) ==');
  events.length = 0;
  await warmer.warmProfile(p1.id, { intensity: 'leve', show: false });
  const done1 = events.find((e) => e.type === 'warm:done' && e.id === p1.id);
  check('emitiu warm:start', events.some((e) => e.type === 'warm:start' && e.id === p1.id));
  check('emitiu warm:done', !!done1);
  check('warm:done sem erro', !!done1 && !done1.error, done1 && done1.error);
  check('perfil voltou a nao estar rodando (navegador fechado)', !launcher.isRunning(p1.id));

  console.log('\n== 3) Apagar todos os perfis (lixeira + exclusão definitiva, igual profiles.trash + deleteForever) ==');
  const allBefore = store.listProfiles({ includeTrash: false });
  store.trashProfiles(allBefore.map((p) => p.id));
  await store.deleteProfilesForever(allBefore.map((p) => p.id));
  const allAfter = store.listProfiles({ includeTrash: true });
  check('nenhum perfil restante (inclusive lixeira)', allAfter.length === 0, `restaram ${allAfter.length}`);

  console.log('\n== 4) Criar 10 perfis ==');
  const ids = [];
  for (let i = 1; i <= 10; i++) {
    const p = store.createProfile({ name: `Perfil ${i}`, os: 'Windows', mainWebsite: 'google', startUrl: 'about:blank' });
    ids.push(p.id);
  }
  check('10 perfis criados', ids.length === 10);
  check('listProfiles confirma 10', store.listProfiles({ includeTrash: false }).length === 10);

  console.log('\n== 5) Selecionar os 10 e Aquecer em segundo plano (igual ao diálogo "Aquecer" com show=false) ==');
  events.length = 0;
  await warmer.runManyWarm({ ids, intensity: 'leve', show: false, concurrency: 2 });
  const startedIds = new Set(events.filter((e) => e.type === 'warm:start').map((e) => e.id));
  const doneEvents = events.filter((e) => e.type === 'warm:done');
  const doneIds = new Set(doneEvents.map((e) => e.id));
  const errored = doneEvents.filter((e) => e.error);
  check('warm:start disparou para todos os 10', startedIds.size === 10, `${startedIds.size}/10`);
  check('warm:done disparou para todos os 10', doneIds.size === 10, `${doneIds.size}/10`);
  check('nenhum perfil terminou com erro', errored.length === 0, errored.map((e) => `${e.id}: ${e.error}`).join(' | '));
  check('nenhum navegador ficou aberto ao final', ids.every((id) => !launcher.isRunning(id)));

  await launcher.stopAll().catch(() => {});
  await fsp.rm(tmp, { recursive: true, force: true }).catch(() => {});
  console.log(`\n  RESULTADO: ${pass} passou, ${fail} falhou\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('ERRO FATAL:', e && e.stack || e); process.exit(2); });
