'use strict';
// E2E do Hub: abre 3 perfis de teste (dados temporários), abre o hub e verifica encaixe, foco,
// maximizar = expandir no hub, fechar um navegador e tirar do hub. Sem clique de mouse.
// Rodar: npx electron scripts/test-hub.js   (abre janelas reais por ~1 min)
const path = require('path');
const os = require('os');
const fs = require('fs');
const { app, screen } = require('electron');
const store = require('../src/store');
const launcher = require('../src/browserLauncher');
const win32 = require('../src/windows/winapi');
const { createHub } = require('../src/hub/hub');

let pass = 0, fail = 0;
const out = [];
const say = (s) => { out.push(s); console.log(s); };
const check = (n, ok, d) => { (ok ? pass++ : fail++); say(`  ${ok ? '✅' : '❌'} ${n}${d && !ok ? ' — ' + d : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const inside = (r, a) => r.x >= a.x - 1 && r.y >= a.y - 1 && r.x + r.width <= a.x + a.width + 1 && r.y + r.height <= a.y + a.height + 1;
const overlap = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
// Parte VISÍVEL da janela (GetWindowRect inclui a borda invisível do Windows, que o hub sobrepõe de propósito).
const visible = (h) => { const r = win32.rectOf(h); const i = win32.frameInsets(h) || { left: 0, top: 0, right: 0, bottom: 0 }; return { x: r.x + i.left, y: r.y + i.top, width: r.width - i.left - i.right, height: r.height - i.top - i.bottom }; };
async function until(fn, ms = 20000) { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await sleep(300); } return false; }

const koffi = require('koffi');
const ShowWindow = koffi.load('user32.dll').func('bool __stdcall ShowWindow(intptr_t hwnd, int cmd)');
const SW_MAXIMIZE = 3;

// No app real a janela principal segue aberta; aqui o hub é a única → não deixa o Electron sair ao fechá-lo.
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  const tmp = path.join(os.tmpdir(), 'rinomask-hub-test-' + Date.now());
  store.setDataDir(tmp);
  const d = screen.getPrimaryDisplay();
  const sf = d.scaleFactor || 1;
  launcher.setPersistFingerprint((id, data) => store.setFingerprintData(id, data));
  launcher.setDisplay({ width: Math.round(d.size.width * sf), height: Math.round(d.size.height * sf), workW: Math.round(d.workAreaSize.width * sf), workH: Math.round(d.workAreaSize.height * sf) });
  const hub = createHub({ launcher, store, errorLog: { log: (e) => say('  [log] ' + e.message) }, notifyChanged: () => {} });
  const ids = ['Hub E2E 1', 'Hub E2E 2', 'Hub E2E 3'].map((name) => store.createProfile({ name, os: 'Windows', startUrl: 'about:blank' }).id);

  try {
    say('[1] abrir no hub (bastidor: ninguém aparece fora do hub)');
    const before = new Set(win32.listCamoufoxMainWindows());   // navegadores reais do usuário: ignorados
    const opening = hub.open({ ids });
    await sleep(150);
    const st0 = hub.state();
    check('espaços reservados aparecem na hora', st0.slots.length === 3 && st0.members.every((m) => m.loading), JSON.stringify(st0.slots.map((x) => x.name)));
    // Amostra a cada 50ms: alguma janela nova de teste ficou VISÍVEL na tela fora da área do hub?
    const flashes = [];
    let sampling = true;
    (async () => {
      while (sampling) {
        const a = hub.snapshot().area;
        for (const h of win32.listCamoufoxMainWindows()) {
          if (before.has(h)) continue;
          const vr = visible(h);
          if (vr.x <= -10000) continue;                       // no bastidor
          const inHub = a && vr.x >= a.x - 12 && vr.y >= a.y - 12 && vr.x + vr.width <= a.x + a.width + 12 && vr.y + vr.height <= a.y + a.height + 12;
          if (!inHub) flashes.push({ h, vr });
        }
        await sleep(50);
      }
    })();
    const r = await opening;
    check('hub.open sem falhas', r.ok && r.failed.length === 0, JSON.stringify(r.failed));
    check('3 navegadores entram no hub', await until(() => hub.state().members.length === 3 && hub.state().members.every((m) => !m.loading), 40000), JSON.stringify(hub.state().members.map((m) => [m.name, m.loading])));
    await sleep(1000);
    sampling = false;
    check('nenhum navegador apareceu fora do hub durante a abertura', flashes.length === 0, `${flashes.length} amostra(s): ` + JSON.stringify(flashes.slice(0, 3)));
    check('espaços reservados somem quando os navegadores chegam', hub.state().slots.length === 0);
    await sleep(1500);
    let s = hub.snapshot();
    check('nomes iguais aos perfis', hub.state().members.map((m) => m.name).sort().join('|') === 'Hub E2E 1|Hub E2E 2|Hub E2E 3');
    const real = s.placed.map((p) => visible(p.hwnd));
    check('janelas reais dentro da área do hub', real.every((rr) => rr && inside(rr, s.area)), JSON.stringify({ area: s.area, real }));
    check('sem sobreposição', real.every((a, i) => real.every((b, j) => i === j || !overlap(a, b))), JSON.stringify(real));

    say('\n[2] priorizar (foco)');
    hub.setPriority(ids[2]);
    await sleep(800);
    s = hub.snapshot();
    const big = win32.rectOf(s.placed.find((p) => p.id === ids[2]).hwnd);
    const others = s.placed.filter((p) => p.id !== ids[2]).map((p) => win32.rectOf(p.hwnd));
    check('modo foco ligado', s.mode === 'focus');
    check('priorizado é o maior', others.every((o) => o.width * o.height < big.width * big.height), JSON.stringify({ big, others }));

    say('\n[3] maximizar = expandir no hub');
    const firstHwnd = s.placed.find((p) => p.id === ids[0]).hwnd;
    ShowWindow(firstHwnd, SW_MAXIMIZE);
    check('vira solo com o maximizado', await until(() => hub.snapshot().mode === 'solo' && hub.snapshot().priorityId === ids[0], 5000), hub.snapshot().mode);
    await sleep(800);
    s = hub.snapshot();
    const solo = visible(firstHwnd);
    // Sem limite pela tela virtual (padrão): o expandido ocupa a área inteira do hub.
    check('expandido ocupa a área inteira do hub', Math.abs(solo.width - s.area.width) <= 12 && Math.abs(solo.height - s.area.height) <= 12, JSON.stringify({ solo, area: s.area }));
    check('expandido dentro da área do hub', inside(solo, s.area), JSON.stringify({ solo, area: s.area }));
    check('demais saem de cena', s.hidden.length === 2, JSON.stringify(s.hidden));
    ShowWindow(firstHwnd, SW_MAXIMIZE);
    check('maximizar de novo volta ao foco', await until(() => hub.snapshot().mode === 'focus', 5000), hub.snapshot().mode);
    await sleep(800);
    check('todos de volta em cena', hub.snapshot().placed.length === 3, JSON.stringify(hub.snapshot().hidden));

    say('\n[3b] janelas coladas (sem a faixa da borda invisível)');
    s = hub.snapshot();
    const vis = s.placed.map((p) => { const r = win32.rectOf(p.hwnd); const i = win32.frameInsets(p.hwnd) || { left: 0, top: 0, right: 0, bottom: 0 }; return { x: r.x + i.left, y: r.y + i.top, width: r.width - i.left - i.right, height: r.height - i.top - i.bottom }; });
    const mainVis = vis[0], sideVis = vis[1];
    const gapPx = sideVis.x - (mainVis.x + mainVis.width);
    check('vão visível entre a grande e a lateral ≤ 4px', gapPx >= -2 && gapPx <= 4, `vão=${gapPx}px`);
    check('parte visível ocupa a célula', vis.every((v, i) => Math.abs(v.width - s.placed[i].cell.width) <= 4 && Math.abs(v.height - s.placed[i].cell.height) <= 4), JSON.stringify({ vis, cells: s.placed.map((p) => p.cell) }));

    say('\n[3c] clique na pílula de dentro do navegador (arquivo de sinal)');
    const signalsMod = require('../src/hub/signals');
    const dir2 = store.getProfile(ids[1]).userDataDir;
    check('perfil no hub está marcado (pílula sabe que está no hub)', fs.existsSync(path.join(dir2, signalsMod.MEMBER_FILE)));
    await sleep(50);
    fs.writeFileSync(path.join(dir2, signalsMod.SIGNAL_FILE), String(Date.now()));
    check('sinal da pílula → vira o grande', await until(() => hub.snapshot().priorityId === ids[1] && hub.snapshot().mode === 'focus', 2000), hub.snapshot().priorityId);

    say('\n[3d] arrastar uma miniatura até a grande');
    await sleep(4500); // passa do SETTLE_MS (o Firefox se reposiciona sozinho logo ao abrir)
    s = hub.snapshot();
    const side = s.placed.find((p) => p.id !== s.priorityId);
    const main = s.placed.find((p) => p.id === s.priorityId);
    const SetWindowPos = koffi.load('user32.dll').func('bool __stdcall SetWindowPos(intptr_t h, intptr_t a, int x, int y, int cx, int cy, uint32_t f)');
    // simula o arraste: mesma largura/altura, movida para o meio da célula grande (botão já solto)
    SetWindowPos(side.hwnd, 0, main.cell.x + main.cell.width / 2 - side.width / 2, main.cell.y + main.cell.height / 2 - side.height / 2, side.width, side.height, 0x4 | 0x10);
    check('soltar sobre a grande → troca de lugar', await until(() => hub.snapshot().priorityId === side.id, 2000), `priority=${hub.snapshot().priorityId} esperado=${side.id}`);
    s = hub.snapshot();
    const back = win32.rectOf(s.placed.find((p) => p.id === main.id).hwnd);
    check('a antiga grande foi para a lateral', back.width < win32.rectOf(s.placed[0].hwnd).width);
    const lone = s.placed[1];
    SetWindowPos(lone.hwnd, 0, lone.x + 30, lone.y + 15, lone.width, lone.height, 0x4 | 0x10);
    await sleep(700);
    const snapBack = win32.rectOf(lone.hwnd);
    check('solto em lugar nenhum → volta pro lugar', Math.abs(snapBack.x - lone.x) <= 10 && Math.abs(snapBack.y - lone.y) <= 10 && hub.snapshot().priorityId === side.id);

    say('\n[4] fechar um navegador');
    await launcher.stop(ids[1]);
    check('sai do hub sozinho', await until(() => hub.state().members.length === 2, 8000), hub.state().members.length + ' membro(s)');

    say('\n[5] tirar do hub');
    hub.remove(ids[0]);
    check('removido sai na hora', hub.state().members.length === 1);
    check('removido perde a marca (pílula volta a abrir cores)', !fs.existsSync(path.join(store.getProfile(ids[0]).userDataDir, require('../src/hub/signals').MEMBER_FILE)));
    check('removido não volta sozinho', !(await until(() => hub.state().members.length === 2, 4000)));
    hub.addRunning();
    check('"+ Abertos" traz de volta', await until(() => hub.state().members.length === 2, 8000));

    say('\n[6] fechar o hub fecha quem está dentro');
    const inside2 = hub.state().members.map((m) => m.id);
    hub.remove(inside2[1]);                       // este sai do hub → deve SOBREVIVER ao fechar
    hub.close();
    check('navegador dentro do hub fecha junto', await until(() => !launcher.isRunning(inside2[0]), 10000), 'ainda aberto');
    check('navegador tirado do hub continua aberto', launcher.isRunning(inside2[1]));
    check('hub fechado', !hub.isOpen());
  } catch (e) {
    check('sem exceção', false, e && e.stack);
  } finally {
    for (const id of ids) await launcher.stop(id).catch(() => {});
    // Rede de segurança: qualquer Camoufox ainda preso à pasta temporária deste teste é encerrado.
    await new Promise((res) => require('child_process').execFile('powershell', ['-NoProfile', '-Command',
      `Get-CimInstance Win32_Process -Filter "Name='camoufox.exe'" | Where-Object { $_.CommandLine -like '*${path.basename(tmp)}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`],
      { windowsHide: true }, () => res()));
    await sleep(1500);
    fs.rmSync(tmp, { recursive: true, force: true });
    say(`\n${pass} ok, ${fail} falha(s)`);
    fs.writeFileSync(path.join(os.tmpdir(), 'rinomask-test-hub.log'), out.join(os.EOL));
    app.exit(fail ? 1 : 0);
  }
});
