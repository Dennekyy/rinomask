'use strict';
// Bateria de comportamento do Hub: 4 perfis; mede, para cada janela, a célula que o hub reservou,
// o retângulo REAL da janela e quanto da célula ela preenche — em grade, foco em cada um e
// expandido (maximizar) em cada um. Roda com e sem o limite pela tela virtual do perfil.
// Rodar: npx electron scripts/test-hub-behavior.js [semlimite]
// Relatório: %TEMP%\rinomask-hub-behavior-<comlimite|semlimite>.log
const path = require('path');
const os = require('os');
const fs = require('fs');
const { app, screen } = require('electron');
const store = require('../src/store');
const launcher = require('../src/browserLauncher');
const win32 = require('../src/windows/winapi');
const { createHub } = require('../src/hub/hub');
const { computeLayout } = require('../src/hub/layout');

const CAP = !process.argv.includes('semlimite');
const out = [];
const say = (s) => { out.push(s); console.log(s); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms) { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await sleep(300); } return false; }
const koffi = require('koffi');
const ShowWindow = koffi.load('user32.dll').func('bool __stdcall ShowWindow(intptr_t hwnd, int cmd)');
const names = {};

// Célula "livre" = o que o layout reserva sem nenhum limite; é contra ela que medimos o preenchimento.
function measure(hub) {
  const s = hub.snapshot();
  const order = hub.state().members.map((m) => m.id);
  const free = computeLayout(s.area, order, { mode: s.mode, priorityId: s.priorityId });
  return { s, rows: s.placed.map((p) => {
    const c = free.rects.find((f) => f.id === p.id) || p;
    const r = win32.rectOf(p.hwnd);
    const vs = store.getProfile(p.id).fingerprint.bf.screen;
    return { name: names[p.id], vs: `${Math.round(vs.width)}x${Math.round(vs.height)}`, cell: `${c.width}x${c.height}`, real: `${r.width}x${r.height}`, fill: Math.round((r.width * r.height) / (c.width * c.height) * 100) };
  }) };
}

function report(label, hub) {
  const { s, rows } = measure(hub);
  say(`\n## ${label}  (modo=${s.mode}, área ${s.area.width}x${s.area.height})`);
  say('perfil     | tela virtual | célula     | janela real | preenche');
  for (const r of rows) say(`${r.name.padEnd(10)} | ${r.vs.padEnd(12)} | ${r.cell.padEnd(10)} | ${r.real.padEnd(11)} | ${r.fill}%`);
  if (s.hidden.length) say(`fora de cena: ${s.hidden.map((id) => names[id]).join(', ')}`);
  return Math.min(...rows.map((r) => r.fill));
}

app.whenReady().then(async () => {
  const tmp = path.join(os.tmpdir(), 'rinomask-hub-behavior-' + Date.now());
  store.setDataDir(tmp);
  const d = screen.getPrimaryDisplay();
  const sf = d.scaleFactor || 1;
  launcher.setPersistFingerprint((id, data) => store.setFingerprintData(id, data));
  launcher.setDisplay({ width: Math.round(d.size.width * sf), height: Math.round(d.size.height * sf), workW: Math.round(d.workAreaSize.width * sf), workH: Math.round(d.workAreaSize.height * sf) });
  const hub = createHub({ launcher, store, errorLog: { log: (e) => say('[log] ' + e.message) }, notifyChanged: () => {}, capToVirtualScreen: CAP });
  const count = Number((process.argv.find((a) => /^n=\d+$/.test(a)) || 'n=4').slice(2));
  const ids = Array.from({ length: count }, (_, i) => 'Perfil ' + String.fromCharCode(65 + i)).map((name) => { const id = store.createProfile({ name, os: 'Windows', startUrl: 'about:blank' }).id; names[id] = name; return id; });
  const summary = [];
  try {
    say(`# Bateria do Hub — limite pela tela virtual: ${CAP ? 'LIGADO' : 'DESLIGADO'}`);
    say(`monitor: ${Math.round(d.size.width * sf)}x${Math.round(d.size.height * sf)} físicos (escala ${sf})`);
    await hub.open({ ids });
    await until(() => hub.state().members.length === count, 60000);
    await sleep(2500);
    summary.push(['grade', report('Grade', hub)]);

    for (const id of ids) {
      hub.setPriority(id);
      await sleep(1200);
      summary.push([`foco ${names[id]}`, report(`Foco em ${names[id]}`, hub)]);
    }
    hub.setMode('grid');
    await sleep(1000);
    for (const id of ids) {
      const hwnd = hub.snapshot().placed.find((p) => p.id === id).hwnd;
      ShowWindow(hwnd, 3);
      await until(() => hub.snapshot().mode === 'solo', 4000);
      await sleep(1200);
      summary.push([`expandir ${names[id]}`, report(`Expandido (maximizar) ${names[id]}`, hub)]);
      ShowWindow(hwnd, 3);
      await until(() => hub.snapshot().mode !== 'solo', 4000);
      await sleep(1200);
    }
    say('\n# Resumo — pior preenchimento da célula em cada situação');
    for (const [k, v] of summary) say(`${k.padEnd(20)} ${v}%${v < 95 ? '  <- não preenche' : ''}`);
  } catch (e) {
    say('ERRO: ' + (e && e.stack));
  } finally {
    for (const id of ids) await launcher.stop(id).catch(() => {});
    await sleep(1500);
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.writeFileSync(path.join(os.tmpdir(), `rinomask-hub-behavior-${CAP ? 'comlimite' : 'semlimite'}-n${count}.log`), out.join(os.EOL));
    app.exit(0);
  }
});
