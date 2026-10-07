'use strict';

// Hub de navegadores: uma janela-moldura com barra de pílulas; as janelas REAIS do Camoufox de
// cada perfil são encaixadas na área abaixo da barra (o hub vira "dono" delas → ficam sempre por
// cima dele e minimizam/restauram junto). Embutir de verdade (SetParent) foi testado e quebra o
// Firefox (teclado/foco/tela cheia) — por isso organizamos as janelas reais.
//  - entram sozinhos: todo navegador manual aberto enquanto o hub existe é encaixado;
//  - grade / foco (priorizado grande) / solo (maximizar = ocupa o hub inteiro);
//  - vigia a cada TICK_MS: recoloca quem saiu do lugar, respeita tela cheia, detecta fechados;
//  - atalhos Alt+1…9 / Alt+0 só enquanto o hub ou um navegador dele está em primeiro plano.

const fs = require('fs');
const path = require('path');
const { BrowserWindow, screen, globalShortcut } = require('electron');
const win32 = require('../windows/winapi');
const { computeLayout } = require('./layout');
const signals = require('./signals');
const { createStaging } = require('./staging');

const BAR = 44;              // altura da barra de pílulas (DIP)
const STRIP = 28;            // faixa de scroll no pé da lateral do foco (DIP)
const TICK_MS = 200;         // vigia (rápida o bastante para pegar um arraste solto entre ticks)
const JOIN_EVERY = 10;       // a cada N ticks (~2s) procura navegadores novos para encaixar
const COLORS_EVERY = 20;     // a cada N ticks (~4s) relê nome/cor das pílulas
const SETTLE_MS = 4000;      // logo após entrar, o Firefox se reposiciona sozinho — não é "arrastar"
const DROP_SIZE_TOL = 12;
const LAUNCH_CONCURRENCY = 3;     // perfis abrindo em paralelo ao 'Abrir no hub'
const PENDING_TIMEOUT_MS = 60000; // reservado mas nunca apareceu → libera o espaço    // arrastar move sem mudar o tamanho; mudou o tamanho = não é soltar em outro lugar
const DEFAULT_COLOR = '#2563eb';
const COLOR_RE = /user_pref\("rinomask\.pill\.color",\s*"(#[0-9a-fA-F]{6})"\)/;

// capToVirtualScreen: limitar a janela à tela virtual do perfil (evita janela > tela no fingerprint).
// Desligado por decisão do usuário (2026-10-07): com o limite, perfis de resolução menor que o espaço
// do hub ficavam "um retângulo dentro do outro" (bateria: 58–80% de preenchimento).
function createHub({ launcher, store, errorLog, notifyChanged, capToVirtualScreen = false }) {
  let win = null;
  let hubHwnd = 0;
  let timer = null;
  let tick = 0;
  let finding = false;
  let shortcutsOn = false;
  let mode = 'grid';
  let prevMode = 'grid';
  let priorityId = null;
  let order = [];                 // ordem de exibição (entrada no hub)
  let sideOffset = 0;             // scroll da lateral no foco
  let strip = null;               // faixa de scroll em DIP relativos à página do hub (ou null)
  const members = new Map();      // id -> { hwnd, name, color, maxSize, dir, insets, joinedAt, lastSignal }
  const pending = new Map();      // id -> { name, color, since }  carregando: espaço já reservado no layout
  let slots = [];                 // espaços reservados dos pendentes, em DIP relativos à página do hub
  let joinQueued = false;
  const parked = new Set();       // minimizados pelo usuário → saem do layout até clicar na pílula
  const excluded = new Set();     // removidos do hub pelo usuário → não reentram sozinhos
  let placed = [];                // último layout aplicado [{ id, hwnd, cell, x, y, width, height }] (x..height = janela c/ borda invisível)
  let hidden = [];                // ids fora de cena (excedentes / solo)

  const log = (message, context) => { try { errorLog.log({ source: 'hub', message, context }); } catch (e) { /* log é best-effort */ } };
  const alive = () => !!win && !win.isDestroyed();
  const staging = createStaging({ win32, wantsWindows: () => pending.size > 0, onStaged: () => joinSoon(), log });
  function joinSoon() { setTimeout(() => joinRunning(), 0); }

  function readColor(prof) {
    try {
      const m = COLOR_RE.exec(fs.readFileSync(path.join(prof.userDataDir, 'prefs.js'), 'utf8'));
      return m ? m[1].toLowerCase() : DEFAULT_COLOR;
    } catch (e) { return DEFAULT_COLOR; }
  }
  // Tela virtual do perfil: a janela nunca passa disso (janela > tela denunciaria o fingerprint).
  function screenOf(prof) {
    const s = prof && prof.fingerprint && prof.fingerprint.bf && prof.fingerprint.bf.screen;
    return s && s.width && s.height ? { width: Math.round(s.width), height: Math.round(s.height) } : null;
  }

  // Área útil abaixo da barra, em pixels físicos de tela.
  function area() {
    const b = win.getContentBounds();
    const tl = screen.dipToScreenPoint({ x: b.x, y: b.y + BAR });
    const br = screen.dipToScreenPoint({ x: b.x + b.width, y: b.y + b.height });
    return { x: tl.x, y: tl.y, width: br.x - tl.x, height: br.y - tl.y };
  }

  function getState() {
    return {
      mode,
      priorityId,
      strip,
      slots,
      members: order.filter((id) => members.has(id) || pending.has(id)).map((id) => {
        const m = members.get(id) || pending.get(id);
        return { id, name: m.name, color: m.color, priority: id === priorityId, hidden: hidden.includes(id) || parked.has(id), loading: !members.has(id) };
      }),
    };
  }
  function pushState() { if (alive()) win.webContents.send('rino:event', { type: 'hub:state', state: getState() }); }

  function relayout() {
    if (!alive() || win.isMinimized()) { pushState(); return; }
    const ids = order.filter((id) => (members.has(id) || pending.has(id)) && !parked.has(id));
    const maxSize = {};
    if (capToVirtualScreen) for (const id of ids) if (members.has(id)) maxSize[id] = members.get(id).maxSize;
    const a = area();
    const sf = screen.getDisplayMatching(win.getBounds()).scaleFactor || 1;
    const res = computeLayout(a, ids, { mode, priorityId, maxSize, sideOffset, stripH: Math.round(STRIP * sf) });
    if (typeof res.sideOffset === 'number') sideOffset = res.sideOffset;
    // cell = retângulo VISÍVEL reservado; a janela recebe a cell + borda invisível do Windows (sem faixa vazia).
    const toDip = (r) => ({ left: (r.x - a.x) / sf, top: BAR + (r.y - a.y) / sf, width: r.width / sf, height: r.height / sf });
    slots = res.rects.filter((r) => pending.has(r.id)).map((r) => ({ id: r.id, name: pending.get(r.id).name, color: pending.get(r.id).color, ...toDip(r) }));
    placed = res.rects.filter((r) => members.has(r.id)).map((r) => {
      const m = members.get(r.id);
      if (!m.insets) m.insets = win32.frameInsets(m.hwnd);
      const cell = { x: r.x, y: r.y, width: r.width, height: r.height };
      return { id: r.id, hwnd: m.hwnd, cell, ...win32.withInsets(cell, m.insets) };
    });
    hidden = res.overflow;
    const s = res.strip;
    strip = s ? { ...toDip(s), from: s.from, to: s.to, total: s.total } : null;
    const overflow = res.overflow.filter((id) => members.has(id));
    try {
      win32.placeAll(placed);
      for (const id of overflow) win32.minimize(members.get(id).hwnd);
    } catch (e) { log('falha ao posicionar janelas: ' + e.message); }
    pushState();
  }

  function dropMember(id) {
    const m = members.get(id);
    if (m) signals.unmarkMember(m.dir);
    members.delete(id);
    order = order.filter((x) => x !== id);
    parked.delete(id);
    if (priorityId === id) priorityId = null;
  }

  // Encaixa navegadores manuais em execução que ainda não estão no hub (inclui recém-abertos,
  // cuja janela pode levar alguns segundos para existir — tentamos de novo nos próximos ticks).
  async function joinRunning() {
    if (!alive()) return;
    if (finding) { joinQueued = true; return; }
    finding = true;
    let added = 0;
    try {
      const ids = launcher.runningIds().filter((id) => launcher.kindOf(id) === 'manual' && !members.has(id) && !excluded.has(id));
      for (const id of ids) {
        const [hwnd] = win32.findBrowserWindows(await launcher.manualPids(id));
        if (!hwnd || !alive()) continue;
        const prof = store.getProfile(id) || {};
        staging.claim(hwnd);
        pending.delete(id);
        win32.setOwner(hwnd, hubHwnd);
        const dir = prof.userDataDir;
        signals.markMember(dir);
        members.set(id, { hwnd, name: prof.name || id, color: readColor(prof), maxSize: screenOf(prof), dir, insets: null, joinedAt: Date.now(), lastSignal: signals.signalTime(dir) });
        if (!order.includes(id)) order.push(id);
        added++;
      }
    } catch (e) { log('falha ao procurar navegadores: ' + e.message); }
    finally { finding = false; }
    if (added) relayout();
    if (joinQueued) { joinQueued = false; joinSoon(); }
  }

  function refreshColors() {
    let changed = false;
    for (const [id, m] of members) {
      const prof = store.getProfile(id);
      if (!prof) continue;
      const color = readColor(prof);
      const name = prof.name || m.name;
      if (color !== m.color || name !== m.name) { m.color = color; m.name = name; changed = true; }
    }
    if (changed) pushState();
  }

  // Tela cheia (vídeo, F11): o navegador cobre o monitor inteiro → o hub não briga com ele.
  function coversMonitor(hwnd) {
    const r = win32.rectOf(hwnd);
    if (!r) return false;
    const d = screen.dipToScreenRect(null, screen.getDisplayMatching(win.getBounds()).bounds);
    return r.x <= d.x && r.y <= d.y && r.width >= d.width && r.height >= d.height;
  }

  // Maximizar um navegador = expandir dentro do hub; maximizar de novo volta ao layout anterior.
  function toggleSolo(id) {
    if (mode === 'solo' && priorityId === id) mode = prevMode;
    else { if (mode !== 'solo') prevMode = mode; mode = 'solo'; priorityId = id; }
  }

  // Janela arrastada e solta em cima de outra célula → devolve { from, to }; senão null.
  // Só conta como arraste se o tamanho não mudou (redimensionar/auto-reposicionar do Firefox mudam).
  function dropTarget(r) {
    const m = members.get(r.id);
    if (!m || Date.now() - m.joinedAt < SETTLE_MS) return null;
    const cur = win32.rectOf(r.hwnd);
    if (!cur || Math.abs(cur.width - r.width) > DROP_SIZE_TOL || Math.abs(cur.height - r.height) > DROP_SIZE_TOL) return null;
    const cx = cur.x + cur.width / 2, cy = cur.y + cur.height / 2;
    const hit = placed.find((p) => p.id !== r.id && cx >= p.cell.x && cx < p.cell.x + p.cell.width && cy >= p.cell.y && cy < p.cell.y + p.cell.height);
    return hit ? { from: r.id, to: hit.id } : null;
  }

  // Troca dois de lugar. No foco, envolver o grande = o outro vira o grande.
  function swap(a, b) {
    if (mode === 'focus' && (a === priorityId || b === priorityId)) { setPriority(a === priorityId ? b : a); return; }
    const i = order.indexOf(a), j = order.indexOf(b);
    if (i < 0 || j < 0) return;
    const next = [...order];
    next[i] = b; next[j] = a;
    order = next;
    relayout();
  }

  // Clique na pílula de dentro do navegador (arquivo de sinal mudou) → destaca esse perfil.
  function checkSignals() {
    for (const [id, m] of members) {
      const t = signals.signalTime(m.dir);
      if (t > m.lastSignal) { m.lastSignal = t; setPriority(id); return true; }
    }
    return false;
  }

  function onTick() {
    if (!alive()) return;
    tick++;
    let changed = false;
    for (const [id, m] of members) if (!win32.isAlive(m.hwnd)) { dropMember(id); changed = true; }
    if (!changed && checkSignals()) return;
    staging.tick();
    for (const [id, p] of pending) {
      if (Date.now() - p.since > PENDING_TIMEOUT_MS) { pending.delete(id); order = order.filter((x) => x !== id); changed = true; log('perfil não apareceu no hub em 60s', { id }); }
    }
    if (pending.size === 0 && staging.size() === 0 && staging.listening()) staging.stop();
    if (pending.size > 0 && tick % 5 === 0) joinRunning(); // pendentes: procura mais rápido que o normal
    if (!win.isMinimized()) {
      const zoomed = placed.find((r) => members.has(r.id) && win32.isZoomed(r.hwnd));
      if (zoomed) { toggleSolo(zoomed.id); changed = true; }
      for (const r of placed) if (members.has(r.id) && win32.isIconic(r.hwnd)) { parked.add(r.id); changed = true; }
      // Botão do mouse pressionado = usuário arrastando/redimensionando: não briga, espera soltar.
      if (!changed && !win32.leftButtonDown()) {
        const off = win32.drifted(placed.filter((r) => members.has(r.id) && !coversMonitor(r.hwnd)));
        const drop = off.map(dropTarget).find(Boolean);
        if (drop) swap(drop.from, drop.to);
        else if (off.length) win32.placeAll(off);
      }
    }
    if (changed) relayout();
    syncShortcuts();
    if (tick % JOIN_EVERY === 0) joinRunning();
    if (tick % COLORS_EVERY === 0) refreshColors();
  }

  function unregisterShortcuts() {
    for (let i = 0; i <= 9; i++) globalShortcut.unregister('Alt+' + i);
    shortcutsOn = false;
  }
  function syncShortcuts() {
    const fg = win32.foreground();
    const ours = fg === hubHwnd || [...members.values()].some((m) => m.hwnd === fg);
    if (ours === shortcutsOn) return;
    if (!ours) { unregisterShortcuts(); return; }
    shortcutsOn = true;
    for (let i = 1; i <= 9; i++) globalShortcut.register('Alt+' + i, () => { const id = order[i - 1]; if (id) setPriority(id); });
    globalShortcut.register('Alt+0', () => setMode(mode === 'grid' ? 'focus' : 'grid'));
  }

  function release() {
    clearInterval(timer);
    timer = null;
    unregisterShortcuts();
    for (const m of members.values()) {
      signals.unmarkMember(m.dir);
      try { win32.setOwner(m.hwnd, 0); } catch (e) { /* janela já fechada */ }
    }
    members.clear(); parked.clear(); excluded.clear();
    staging.stop();
    pending.clear();
    order = []; placed = []; hidden = []; sideOffset = 0; strip = null; slots = [];
    mode = 'grid'; priorityId = null; win = null; hubHwnd = 0;
  }

  function createWindow() {
    win = new BrowserWindow({
      width: 1500, height: 900, minWidth: 720, minHeight: 480,
      title: 'RinoMask Hub',
      backgroundColor: '#0f0f0f',
      icon: path.join(__dirname, '..', '..', 'build', 'icon.ico'),
      autoHideMenuBar: true,
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: '#0f0f0f', symbolColor: '#cccccc', height: BAR },
      webPreferences: { preload: path.join(__dirname, '..', '..', 'electron', 'preload.js'), contextIsolation: true, nodeIntegration: false },
    });
    win.loadFile(path.join(__dirname, '..', '..', 'renderer', 'hub.html'));
    hubHwnd = win32.hwndOf(win);
    for (const ev of ['resize', 'move', 'restore', 'maximize', 'unmaximize']) win.on(ev, relayout);
    win.webContents.on('did-finish-load', pushState);
    // Fechar o hub fecha junto os navegadores que estão DENTRO dele (os tirados pelo × seguem abertos).
    // Captura antes de soltar: release() esvazia a lista. O dono é solto já no 'close' para o Windows
    // não destruir as janelas de outro processo junto com a do hub.
    let closingIds = [];
    win.on('close', () => {
      closingIds = [...members.keys(), ...[...pending.keys()].filter((id) => launcher.isRunning(id))];
      for (const m of members.values()) { try { win32.setOwner(m.hwnd, 0); } catch (e) { /* janela já fechada */ } }
    });
    win.on('closed', () => {
      release();
      Promise.all(closingIds.map((id) => launcher.stop(id).catch((e) => log('falha ao fechar navegador do hub: ' + e.message, { id }))))
        .then(() => notifyChanged());
    });
    timer = setInterval(onTick, TICK_MS);
  }

  // --- API (canais hub.* no main.js) ---

  // Abre o hub. Com ids: abre os perfis que estiverem fechados; todos os abertos entram no hub.
  async function open({ ids } = {}) {
    if (!alive()) createWindow();
    else { if (win.isMinimized()) win.restore(); win.focus(); }
    const failed = [];
    const toLaunch = [];
    for (const id of ids || []) {
      excluded.delete(id);
      if (launcher.isRunning(id) || members.has(id)) continue;
      const prof = store.getProfile(id);
      if (!prof) continue;
      pending.set(id, { name: prof.name || id, color: readColor(prof), since: Date.now() });
      if (!order.includes(id)) order.push(id);
      toLaunch.push(prof);
    }
    if (toLaunch.length) { staging.start(); relayout(); }   // espaços reservados aparecem na hora
    joinRunning();                                           // quem já estava aberto entra agora
    // Abre em paralelo (LAUNCH_CONCURRENCY por vez); cada janela nasce no bastidor e vai para o seu espaço.
    const queue = [...toLaunch];
    async function worker() {
      for (let prof = queue.shift(); prof; prof = queue.shift()) {
        try { await launcher.launchManual(prof); store.markLaunched(prof.id); notifyChanged(); }
        catch (e) {
          failed.push({ id: prof.id, error: e.message });
          pending.delete(prof.id);
          order = order.filter((x) => x !== prof.id);
          relayout();
          log('falha ao abrir perfil no hub: ' + e.message, { id: prof.id });
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(LAUNCH_CONCURRENCY, queue.length) }, worker));
    joinSoon();
    return { ok: true, failed };
  }

  function setPriority(id) {
    if (!members.has(id) && !pending.has(id)) return { ok: false, error: 'perfil não está no hub' };
    parked.delete(id);
    priorityId = id;
    if (mode === 'grid') mode = 'focus';
    relayout();
    if (members.has(id)) { try { win32.focus(members.get(id).hwnd); } catch (e) { /* janela pode ter fechado no meio */ } }
    return { ok: true };
  }

  function setMode(next) {
    if (!['grid', 'focus'].includes(next)) return { ok: false, error: 'modo inválido' };
    mode = next;
    if (next === 'focus' && !priorityId) priorityId = order[0] || null;
    relayout();
    return { ok: true };
  }

  function remove(id) {
    const m = members.get(id);
    if (!m) return { ok: false, error: 'perfil não está no hub' };
    try { win32.setOwner(m.hwnd, 0); } catch (e) { /* janela já fechada */ }
    dropMember(id);
    excluded.add(id);
    relayout();
    return { ok: true };
  }

  function addRunning() { excluded.clear(); joinRunning(); return { ok: true }; }

  // Rola a lateral do foco uma miniatura por vez (delta > 0 desce, < 0 sobe).
  function scroll(delta) {
    sideOffset = Math.max(0, sideOffset + Math.sign(Number(delta) || 0));
    relayout();
    return { ok: true };
  }

  // Só leitura, para testes: área útil e retângulos aplicados no último layout.
  function snapshot() {
    return { area: alive() && !win.isMinimized() ? area() : null, mode, priorityId, sideOffset, strip, placed: placed.map((r) => ({ ...r, cell: { ...r.cell } })), hidden: [...hidden] };
  }

  function close() { if (alive()) win.close(); return { ok: true }; }

  return { open, close, setPriority, setMode, remove, addRunning, scroll, state: getState, isOpen: alive, snapshot };
}

module.exports = { createHub, BAR };
