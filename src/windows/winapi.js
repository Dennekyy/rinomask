'use strict';

// Controle de janelas do Windows (user32) via koffi — base do Hub de navegadores.
// Acha a janela principal do Camoufox de cada perfil e posiciona/encaixa essas janelas.
// Coordenadas sempre em PIXELS FÍSICOS (o processo do Electron é DPI-aware por monitor).
// HWND é tratado como número (intptr_t) para facilitar comparação e uso em Map.

let api = null;
function load() {
  if (api) return api;
  if (process.platform !== 'win32') throw new Error('Hub de navegadores só funciona no Windows');
  const koffi = require('koffi');
  const u = koffi.load('user32.dll');
  koffi.proto('bool __stdcall RinoEnumProc(intptr_t hwnd, intptr_t lparam)');
  koffi.struct('RinoRECT', { left: 'int32_t', top: 'int32_t', right: 'int32_t', bottom: 'int32_t' });
  const WinEventProc = koffi.proto('void __stdcall RinoWinEventProc(intptr_t hook, uint32_t event, intptr_t hwnd, int32_t idObject, int32_t idChild, uint32_t thread, uint32_t time)');
  const k32 = koffi.load('kernel32.dll');
  api = {
    koffi,
    WinEventProc,
    SetWinEventHook: u.func('intptr_t __stdcall SetWinEventHook(uint32_t min, uint32_t max, intptr_t hmod, RinoWinEventProc *cb, uint32_t pid, uint32_t tid, uint32_t flags)'),
    UnhookWinEvent: u.func('bool __stdcall UnhookWinEvent(intptr_t hook)'),
    OpenProcess: k32.func('intptr_t __stdcall OpenProcess(uint32_t access, bool inherit, uint32_t pid)'),
    QueryFullProcessImageNameW: k32.func('bool __stdcall QueryFullProcessImageNameW(intptr_t proc, uint32_t flags, _Out_ uint8_t *buf, _Inout_ uint32_t *size)'),
    CloseHandle: k32.func('bool __stdcall CloseHandle(intptr_t h)'),
    EnumWindows: u.func('bool __stdcall EnumWindows(RinoEnumProc *cb, intptr_t lparam)'),
    GetWindowThreadProcessId: u.func('uint32_t __stdcall GetWindowThreadProcessId(intptr_t hwnd, _Out_ uint32_t *pid)'),
    IsWindowVisible: u.func('bool __stdcall IsWindowVisible(intptr_t hwnd)'),
    IsWindow: u.func('bool __stdcall IsWindow(intptr_t hwnd)'),
    IsIconic: u.func('bool __stdcall IsIconic(intptr_t hwnd)'),
    IsZoomed: u.func('bool __stdcall IsZoomed(intptr_t hwnd)'),
    GetClassNameW: u.func('int __stdcall GetClassNameW(intptr_t hwnd, _Out_ uint8_t *buf, int max)'),
    GetWindow: u.func('intptr_t __stdcall GetWindow(intptr_t hwnd, uint32_t cmd)'),
    SetParent: u.func('intptr_t __stdcall SetParent(intptr_t child, intptr_t parent)'),
    GetWindowLongPtrW: u.func('intptr_t __stdcall GetWindowLongPtrW(intptr_t hwnd, int index)'),
    SetWindowLongPtrW: u.func('intptr_t __stdcall SetWindowLongPtrW(intptr_t hwnd, int index, intptr_t value)'),
    SetWindowPos: u.func('bool __stdcall SetWindowPos(intptr_t hwnd, intptr_t after, int x, int y, int cx, int cy, uint32_t flags)'),
    ShowWindow: u.func('bool __stdcall ShowWindow(intptr_t hwnd, int cmd)'),
    SetForegroundWindow: u.func('bool __stdcall SetForegroundWindow(intptr_t hwnd)'),
    GetForegroundWindow: u.func('intptr_t __stdcall GetForegroundWindow()'),
    BeginDeferWindowPos: u.func('intptr_t __stdcall BeginDeferWindowPos(int n)'),
    DeferWindowPos: u.func('intptr_t __stdcall DeferWindowPos(intptr_t info, intptr_t hwnd, intptr_t after, int x, int y, int cx, int cy, uint32_t flags)'),
    EndDeferWindowPos: u.func('bool __stdcall EndDeferWindowPos(intptr_t info)'),
    GetWindowRect: u.func('bool __stdcall GetWindowRect(intptr_t hwnd, _Out_ RinoRECT *rect)'),
    GetAsyncKeyState: u.func('int16_t __stdcall GetAsyncKeyState(int vkey)'),
    DwmGetWindowAttribute: koffi.load('dwmapi.dll').func('long __stdcall DwmGetWindowAttribute(intptr_t hwnd, uint32_t attr, _Out_ RinoRECT *rect, uint32_t size)'),
  };
  return api;
}

const GWL_STYLE = -16;
const GWLP_HWNDPARENT = -8;
const GW_OWNER = 4;
const WS = { CHILD: 0x40000000, POPUP: 0x80000000, CAPTION: 0x00C00000, THICKFRAME: 0x00040000, SYSMENU: 0x00080000, MINIMIZEBOX: 0x00020000, MAXIMIZEBOX: 0x00010000 };
const SWP = { NOSIZE: 0x1, NOMOVE: 0x2, NOZORDER: 0x4, NOACTIVATE: 0x10, FRAMECHANGED: 0x20, SHOWWINDOW: 0x40 };
const SW = { RESTORE: 9, SHOWNOACTIVATE: 4, SHOWMINNOACTIVE: 7 };
const FIREFOX_CLASS = 'MozillaWindowClass';

function className(hwnd) {
  const buf = Buffer.alloc(512);
  const n = load().GetClassNameW(hwnd, buf, 256);
  return n > 0 ? buf.toString('utf16le', 0, n * 2) : '';
}

function pidOf(hwnd) {
  const out = [0];
  load().GetWindowThreadProcessId(hwnd, out);
  return out[0];
}

// Janelas principais (top-level, visíveis, sem dono) do Firefox/Camoufox pertencentes aos pids dados.
function findBrowserWindows(pids) {
  const a = load();
  const want = new Set(pids.map(Number));
  const found = [];
  a.EnumWindows((hwnd) => {
    if (a.IsWindowVisible(hwnd) && want.has(pidOf(hwnd)) && !a.GetWindow(hwnd, GW_OWNER) && className(hwnd) === FIREFOX_CLASS) found.push(hwnd);
    return true;
  }, 0);
  return found;
}

function isAlive(hwnd) { return !!load().IsWindow(hwnd); }

// Nome do executável dono da janela (ex.: "camoufox.exe") — sem PowerShell, direto no kernel.
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
function exeOf(hwnd) {
  const a = load();
  const h = a.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pidOf(hwnd));
  if (!h) return '';
  try {
    const buf = Buffer.alloc(1040);
    const size = [520];
    if (!a.QueryFullProcessImageNameW(h, 0, buf, size)) return '';
    return buf.toString('utf16le', 0, size[0] * 2).split('\\').pop().toLowerCase();
  } finally { a.CloseHandle(h); }
}

// Janela PRINCIPAL de um navegador Camoufox (não popup/menu/diálogo, não o Firefox normal do usuário).
function isCamoufoxMainWindow(hwnd) {
  const a = load();
  return !!a.IsWindow(hwnd) && !a.GetWindow(hwnd, GW_OWNER) && className(hwnd) === FIREFOX_CLASS && exeOf(hwnd) === 'camoufox.exe';
}

// Todas as janelas principais visíveis do Camoufox (sem PowerShell).
function listCamoufoxMainWindows() {
  const a = load();
  const found = [];
  a.EnumWindows((hwnd) => { if (a.IsWindowVisible(hwnd) && isCamoufoxMainWindow(hwnd)) found.push(Number(hwnd)); return true; }, 0);
  return found;
}

// Avisa (no thread principal, via fila de mensagens) quando QUALQUER janela de outro processo fica
// visível. É o que permite ao hub esconder um navegador recém-aberto antes de ele aparecer na tela.
// Devolve a função que desliga a escuta.
const EVENT_OBJECT_SHOW = 0x8002;
const WINEVENT_SKIPOWNPROCESS = 0x2;
function onWindowShown(cb) {
  const a = load();
  const handler = a.koffi.register((hook, event, hwnd, idObject, idChild) => {
    if (idObject !== 0 || idChild !== 0 || !hwnd) return; // 0 = OBJID_WINDOW / CHILDID_SELF
    try { cb(Number(hwnd)); } catch (e) { /* nunca deixa exceção atravessar o callback nativo */ }
  }, a.koffi.pointer(a.WinEventProc));
  const hook = a.SetWinEventHook(EVENT_OBJECT_SHOW, EVENT_OBJECT_SHOW, 0, handler, 0, 0, WINEVENT_SKIPOWNPROCESS);
  return () => { try { a.UnhookWinEvent(hook); } finally { a.koffi.unregister(handler); } };
}

// Bastidor: fora de qualquer monitor, ainda renderizando (a página continua carregando).
const OFFSCREEN = -32000;
function moveOffscreen(hwnd) { load().SetWindowPos(hwnd, 0, OFFSCREEN, OFFSCREEN, 0, 0, SWP.NOSIZE | SWP.NOZORDER | SWP.NOACTIVATE); }
function isOffscreen(hwnd) { const r = rectOf(hwnd); return !!r && r.x <= OFFSCREEN / 2; }
function moveTo(hwnd, r) { load().SetWindowPos(hwnd, 0, r.x, r.y, r.width, r.height, SWP.NOZORDER | SWP.NOACTIVATE); }
function isZoomed(hwnd) { return !!load().IsZoomed(hwnd); }
function isIconic(hwnd) { return !!load().IsIconic(hwnd); }
function minimize(hwnd) { if (!load().IsIconic(hwnd)) load().ShowWindow(hwnd, SW.SHOWMINNOACTIVE); }
function foreground() { return Number(load().GetForegroundWindow()); }
// Botão esquerdo pressionado agora (o usuário está arrastando/redimensionando algo).
function leftButtonDown() { return (load().GetAsyncKeyState(0x01) & 0x8000) !== 0; }

// Borda INVISÍVEL que o Windows 10/11 põe em volta da janela (área de redimensionar): GetWindowRect
// a inclui, o que se vê não. Sem compensar, sobra uma faixa vazia de ~16px entre janelas vizinhas.
// Devolve null se não der para medir (minimizada etc.) — aí usamos sem compensar.
const DWMWA_EXTENDED_FRAME_BOUNDS = 9;
function frameInsets(hwnd) {
  const a = load();
  const outer = {}, visible = {};
  if (!a.GetWindowRect(hwnd, outer) || a.IsIconic(hwnd)) return null;
  if (a.DwmGetWindowAttribute(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS, visible, 16) !== 0) return null;
  const ins = { left: visible.left - outer.left, top: visible.top - outer.top, right: outer.right - visible.right, bottom: outer.bottom - visible.bottom };
  return Object.values(ins).every((v) => v >= 0 && v <= 24) ? ins : null;
}
// Retângulo VISÍVEL desejado → retângulo da janela (com a borda invisível) para o SetWindowPos.
function withInsets(rect, ins) {
  if (!ins) return rect;
  return { ...rect, x: rect.x - ins.left, y: rect.y - ins.top, width: rect.width + ins.left + ins.right, height: rect.height + ins.top + ins.bottom };
}

// Modo "organizar": a janela continua independente, mas passa a ter o hub como DONO
// → fica sempre acima dele e minimiza/restaura junto. Volta ao normal com owner = 0.
function setOwner(hwnd, ownerHwnd) { load().SetWindowLongPtrW(hwnd, GWLP_HWNDPARENT, ownerHwnd || 0); }

// Modo "embutir": vira janela-filha do hub (some da barra de tarefas, sem borda própria).
// Devolve o estilo original para desfazer depois com unembed().
function embed(hwnd, parentHwnd) {
  const a = load();
  const original = Number(a.GetWindowLongPtrW(hwnd, GWL_STYLE)) >>> 0;
  const strip = WS.POPUP | WS.CAPTION | WS.THICKFRAME | WS.SYSMENU | WS.MINIMIZEBOX | WS.MAXIMIZEBOX;
  const style = ((original & ~strip) | WS.CHILD) >>> 0;
  a.SetWindowLongPtrW(hwnd, GWL_STYLE, style);
  a.SetParent(hwnd, parentHwnd);
  a.SetWindowPos(hwnd, 0, 0, 0, 0, 0, SWP.NOMOVE | SWP.NOSIZE | SWP.NOZORDER | SWP.FRAMECHANGED | SWP.NOACTIVATE);
  return original;
}

function unembed(hwnd, originalStyle) {
  const a = load();
  a.SetParent(hwnd, 0);
  a.SetWindowLongPtrW(hwnd, GWL_STYLE, originalStyle);
  a.SetWindowPos(hwnd, 0, 0, 0, 0, 0, SWP.NOMOVE | SWP.NOSIZE | SWP.NOZORDER | SWP.FRAMECHANGED | SWP.SHOWWINDOW);
}

// Aplica vários retângulos de uma vez (sem "piscar" janela por janela).
// rects: [{ hwnd, x, y, width, height }] — coordenadas de tela (organizar) ou do cliente do pai (embutir).
function placeAll(rects) {
  const a = load();
  const flags = SWP.NOZORDER | SWP.NOACTIVATE | SWP.SHOWWINDOW;
  // Minimizada ou MAXIMIZADA ignora a posição (maximizada volta a ocupar a tela) → restaura sem ativar.
  for (const r of rects) if (a.IsIconic(r.hwnd) || a.IsZoomed(r.hwnd)) a.ShowWindow(r.hwnd, SW.SHOWNOACTIVATE);
  let info = a.BeginDeferWindowPos(rects.length);
  for (const r of rects) if (info) info = a.DeferWindowPos(info, r.hwnd, 0, r.x, r.y, Math.max(1, r.width), Math.max(1, r.height), flags);
  if (info) { a.EndDeferWindowPos(info); return; }
  // DeferWindowPos falhou (ex.: uma janela sumiu no meio) → aplica uma a uma.
  for (const r of rects) a.SetWindowPos(r.hwnd, 0, r.x, r.y, Math.max(1, r.width), Math.max(1, r.height), flags);
}

// Retângulo atual da janela em coordenadas de tela (físicas).
function rectOf(hwnd) {
  const r = {};
  if (!load().GetWindowRect(hwnd, r)) return null;
  return { x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top };
}

// Quais janelas saíram do lugar (o Firefox reposiciona a própria janela ao terminar de abrir,
// e sites podem chamar resizeTo) → só essas são recolocadas. Tolerância cobre a borda do DWM.
function drifted(targets, tolerance = 10) {
  return targets.filter((t) => {
    const cur = rectOf(t.hwnd);
    if (!cur) return false;
    return Math.abs(cur.x - t.x) > tolerance || Math.abs(cur.y - t.y) > tolerance
      || Math.abs(cur.width - t.width) > tolerance || Math.abs(cur.height - t.height) > tolerance;
  });
}

function focus(hwnd) {
  const a = load();
  if (a.IsIconic(hwnd)) a.ShowWindow(hwnd, SW.RESTORE);
  a.SetForegroundWindow(hwnd);
}

// HWND de uma BrowserWindow do Electron (Buffer de 8 bytes) → número.
function hwndOf(browserWindow) { return Number(browserWindow.getNativeWindowHandle().readBigInt64LE(0)); }

module.exports = {
  findBrowserWindows, isAlive, exeOf, isCamoufoxMainWindow, listCamoufoxMainWindows, onWindowShown, moveOffscreen, isOffscreen, moveTo, isZoomed, isIconic, minimize, foreground, leftButtonDown, frameInsets, withInsets,
  setOwner, embed, unembed, placeAll, rectOf, drifted, focus, hwndOf, className,
};
