'use strict';

// Bastidor do Hub: enquanto há perfis carregando, toda janela PRINCIPAL do Camoufox que aparece é
// jogada para fora da tela no mesmo instante (o usuário não a vê "nascer" grande no canto), continua
// carregando ali, e o hub a encaixa direto no espaço reservado assim que descobre de qual perfil é.
// Segurança: só pega camoufox.exe (o Firefox normal do usuário nunca é tocado), só escuta enquanto
// há carregamento, e devolve à posição original qualquer janela não reclamada em STAGE_TIMEOUT_MS.

const STAGE_TIMEOUT_MS = 30000;

function createStaging({ win32, wantsWindows, onStaged, log }) {
  const staged = new Map();   // hwnd -> { since, rect }  (rect = onde a janela apareceu, para devolver)
  let unhook = null;

  function stage(hwnd) {
    staged.set(hwnd, { since: Date.now(), rect: win32.rectOf(hwnd) });
    win32.moveOffscreen(hwnd);
    onStaged(hwnd);
  }

  function onShown(hwnd) {
    if (staged.has(hwnd) || !wantsWindows() || !win32.isCamoufoxMainWindow(hwnd)) return;
    stage(hwnd);
  }

  // Rede de segurança do aviso do Windows: varre as janelas do Camoufox visíveis na tela e manda para
  // o bastidor as que não são conhecidas (membros / já abertas antes). Devolve quantas pegou.
  // (Na prática o aviso às vezes não chega para a 1ª janela de perfis que já guardam posição.)
  function sweep(isKnown) {
    if (!wantsWindows()) return 0;
    let caught = 0;
    for (const hwnd of win32.listCamoufoxMainWindows()) {
      if (staged.has(hwnd) || isKnown(hwnd) || win32.isOffscreen(hwnd)) continue;
      stage(hwnd);
      caught++;
    }
    return caught;
  }

  function start() {
    if (unhook) return;
    try { unhook = win32.onWindowShown(onShown); } catch (e) { log('não foi possível escutar novas janelas: ' + e.message); }
  }

  // Devolve a janela para onde ela apareceu (nada fica perdido fora da tela).
  function release(hwnd) {
    const s = staged.get(hwnd);
    staged.delete(hwnd);
    if (!s || !s.rect || !win32.isAlive(hwnd)) return;
    try { win32.moveTo(hwnd, s.rect); } catch (e) { log('falha ao devolver janela do bastidor: ' + e.message); }
  }

  function stop() {
    if (unhook) { try { unhook(); } catch (e) { /* já desligado */ } unhook = null; }
    for (const hwnd of [...staged.keys()]) release(hwnd);
  }

  // Hub fechando: quem está no bastidor vai ser encerrado → esconde em vez de devolver à tela.
  function hideAll() {
    for (const hwnd of staged.keys()) { try { win32.hide(hwnd); } catch (e) { /* janela já fechou */ } }
    staged.clear();
  }

  // A cada tick: esquece as fechadas, devolve as vencidas e mantém as demais fora da tela
  // (o Firefox às vezes se reposiciona sozinho logo depois de abrir).
  function tick() {
    for (const [hwnd, s] of staged) {
      if (!win32.isAlive(hwnd)) { staged.delete(hwnd); continue; }
      if (Date.now() - s.since > STAGE_TIMEOUT_MS) { log('janela não reclamada pelo hub em 30s — devolvida à tela'); release(hwnd); continue; }
      if (!win32.isOffscreen(hwnd)) win32.moveOffscreen(hwnd);
    }
  }

  return {
    start, stop, tick, release, sweep, hideAll,
    claim: (hwnd) => staged.delete(hwnd),   // o hub encaixou: não é mais responsabilidade do bastidor
    has: (hwnd) => staged.has(hwnd),
    size: () => staged.size,
    listening: () => !!unhook,
  };
}

module.exports = { createStaging, STAGE_TIMEOUT_MS };
