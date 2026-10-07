// >>> RINOMASK PILL v3
// Bloco injetado no camoufox.cfg (autoconfig, contexto privilegiado do navegador) por src/pill.js.
// Mostra o nome do perfil numa pílula no topo da janela (#nav-bar).
//  - botão direito: painel de cores;
//  - clique esquerdo: se o navegador está no Hub do RinoMask (arquivo rinomask-hub.member na pasta do
//    perfil), grava rinomask-hub.signal → o hub destaca este perfil; fora do hub, abre as cores.
// Visual: "etiqueta de identidade" — fundo tingido pela cor do perfil, borda fina, ponto sólido e nome
// claro na mesma cor (mesma linguagem das pílulas do Hub). Estilo numa folha AUTHOR carregada só na
// interface do navegador (estados de hover/foco, tema claro/escuro); os sites não enxergam.
// ATENÇÃO: o código fora de comentários precisa ser ASCII (o autoconfig não lê UTF-8 com segurança).
(function rinomaskPill() {
  'use strict';
  var PREF_NAME = 'rinomask.profile.name';
  var PREF_COLOR = 'rinomask.pill.color';
  var DEFAULT_COLOR = '#2563eb';
  var PALETTE = ['#2563eb', '#16a34a', '#dc2626', '#ea580c', '#ca8a04', '#9333ea', '#db2777', '#0891b2', '#475569'];
  var HEX = /^#[0-9a-f]{6}$/i;
  var XHTML = 'http://www.w3.org/1999/xhtml';
  var EASE = 'cubic-bezier(.16,1,.3,1)';

  var SHEET = [
    '#rinomask-pill{--rm-c:' + DEFAULT_COLOR + ';-moz-window-dragging:no-drag;appearance:none;align-self:center;flex-shrink:0;',
    'display:inline-flex;align-items:center;gap:7px;max-width:240px;height:24px;margin:0 8px 0 6px;padding:0 11px 0 9px;',
    'border:1px solid color-mix(in oklab,var(--rm-c) 55%,transparent);border-radius:999px;',
    'background:color-mix(in oklab,var(--rm-c) 20%,rgb(24 24 27));color:color-mix(in oklab,var(--rm-c) 42%,white);',
    'font:600 12px/1 system-ui,"Segoe UI Variable Text","Segoe UI",sans-serif;letter-spacing:.01em;cursor:pointer;',
    'box-shadow:inset 0 1px 0 rgb(255 255 255/.06),0 1px 2px rgb(0 0 0/.35);',
    'transition:background-color 160ms ' + EASE + ',border-color 160ms ' + EASE + ',transform 120ms ' + EASE + '}',
    '#rinomask-pill::before{content:"";flex-shrink:0;width:8px;height:8px;border-radius:50%;background:var(--rm-c)}',
    '#rinomask-pill .rm-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '#rinomask-pill:hover{background:color-mix(in oklab,var(--rm-c) 30%,rgb(24 24 27));border-color:color-mix(in oklab,var(--rm-c) 85%,transparent)}',
    '#rinomask-pill:active{transform:scale(.97)}',
    '#rinomask-pill:focus-visible{outline:2px solid #f8c31c;outline-offset:2px}',
    '#rinomask-pill[hidden]{display:none}',
    '@media (prefers-color-scheme:light){#rinomask-pill{background:color-mix(in oklab,var(--rm-c) 12%,white);',
    'color:color-mix(in oklab,var(--rm-c) 72%,black);border-color:color-mix(in oklab,var(--rm-c) 45%,transparent);',
    'box-shadow:0 1px 2px rgb(0 0 0/.12)}#rinomask-pill:hover{background:color-mix(in oklab,var(--rm-c) 20%,white)}}',
    '#rinomask-pill-panel .rm-panel{display:flex;flex-direction:column;gap:10px;padding:12px 14px 12px;min-width:186px;',
    'font:12px/1.35 system-ui,"Segoe UI Variable Text","Segoe UI",sans-serif;color:var(--arrowpanel-color,currentColor)}',
    '#rinomask-pill-panel .rm-title{font-weight:600;font-size:12px}',
    '#rinomask-pill-panel .rm-grid{display:grid;grid-template-columns:repeat(5,26px);gap:8px}',
    '#rinomask-pill-panel .rm-sw{appearance:none;width:26px;height:26px;min-width:0;margin:0;padding:0;border:0;border-radius:50%;',
    'cursor:pointer;background:var(--sw);box-shadow:inset 0 0 0 1px rgb(255 255 255/.14);transition:transform 120ms ' + EASE + '}',
    '#rinomask-pill-panel .rm-sw:hover{transform:scale(1.1)}',
    '#rinomask-pill-panel .rm-sw[aria-checked="true"]{box-shadow:0 0 0 2px var(--arrowpanel-background,#2b2a33),0 0 0 4px var(--sw)}',
    '#rinomask-pill-panel .rm-sw:focus-visible{outline:2px solid #f8c31c;outline-offset:3px}',
    '#rinomask-pill-panel .rm-custom{background:conic-gradient(#ef4444,#f59e0b,#eab308,#22c55e,#06b6d4,#3b82f6,#a855f7,#ec4899,#ef4444)}',
    '#rinomask-pill-panel .rm-custom input{position:absolute;width:0;height:0;opacity:0;pointer-events:none}',
    '#rinomask-pill-panel .rm-hint{opacity:.62;font-size:11px}',
    '@media (prefers-reduced-motion:reduce){#rinomask-pill,#rinomask-pill-panel .rm-sw{transition:none}}',
  ].join('');

  var S;
  try { S = (typeof Services !== 'undefined') ? Services : ChromeUtils.importESModule('resource://gre/modules/Services.sys.mjs').Services; } catch (e) { return; }
  function report(e) { try { S.console.logStringMessage('[RinoMask pill] ' + e); } catch (x) { /* sem console: ignora */ } }

  function readPref(name, fallback) { try { return S.prefs.getStringPref(name, fallback); } catch (e) { return fallback; } }
  function currentColor() { var c = readPref(PREF_COLOR, DEFAULT_COLOR); return HEX.test(c) ? c.toLowerCase() : DEFAULT_COLOR; }
  // Texto escuro em fundo claro e vice-versa (só no visual de reserva, sem a folha de estilo).
  function textFor(hex) {
    var r = parseInt(hex.substr(1, 2), 16), g = parseInt(hex.substr(3, 2), 16), b = parseInt(hex.substr(5, 2), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) > 160 ? '#111827' : '#ffffff';
  }
  function saveColor(c) { if (HEX.test(c)) S.prefs.setStringPref(PREF_COLOR, c.toLowerCase()); }
  function css(el, props) { for (var k in props) el.style.setProperty(k, props[k]); }

  // Folha de estilo só da interface desta janela. Falhou → visual de reserva inline (pílula sólida).
  function loadSheet(win) {
    try {
      win.windowUtils.loadSheetUsingURIString('data:text/css;charset=utf-8,' + encodeURIComponent(SHEET), win.windowUtils.AUTHOR_SHEET);
      return true;
    } catch (e) { report(e); return false; }
  }

  function paint(pill, label, styled) {
    var name = readPref(PREF_NAME, '');
    var c = currentColor();
    pill.hidden = !name;
    label.textContent = name;
    pill.title = name + ' \u2014 clique: destacar no hub \u00b7 bot\u00e3o direito: trocar a cor';
    pill.style.setProperty('--rm-c', c);
    if (!styled) {
      css(pill, { 'align-self': 'center', margin: '0 6px', padding: '3px 12px', border: '0', 'border-radius': '999px',
        font: '600 12px/1.4 system-ui, sans-serif', cursor: 'pointer', 'background-color': c, color: textFor(c) });
    }
  }

  function buildPanel(doc) {
    var panel = doc.createXULElement('panel');
    panel.id = 'rinomask-pill-panel';
    panel.setAttribute('type', 'arrow');
    var box = doc.createElementNS(XHTML, 'div');
    box.className = 'rm-panel';
    var title = doc.createElementNS(XHTML, 'div');
    title.className = 'rm-title';
    title.textContent = 'Cor da p\u00edlula';
    var grid = doc.createElementNS(XHTML, 'div');
    grid.className = 'rm-grid';
    grid.setAttribute('role', 'radiogroup');
    grid.setAttribute('aria-label', 'Cor da p\u00edlula');
    var swatches = PALETTE.map(function (c) {
      var sw = doc.createElementNS(XHTML, 'button');
      sw.className = 'rm-sw';
      sw.setAttribute('role', 'radio');
      sw.setAttribute('aria-label', c);
      sw.title = c;
      sw.style.setProperty('--sw', c);
      sw.addEventListener('click', function () { saveColor(c); panel.hidePopup(); });
      grid.appendChild(sw);
      return sw;
    });
    // Cor livre: seletor de cor nativo do sistema, disparado por uma amostra arco-íris.
    var custom = doc.createElementNS(XHTML, 'button');
    custom.className = 'rm-sw rm-custom';
    custom.title = 'Personalizar\u2026';
    custom.setAttribute('aria-label', 'Personalizar\u2026');
    var input = doc.createElementNS(XHTML, 'input');
    input.type = 'color';
    input.tabIndex = -1;
    input.addEventListener('input', function () { saveColor(input.value); });
    custom.appendChild(input);
    custom.addEventListener('click', function (ev) { if (ev.target !== input) input.click(); });
    grid.appendChild(custom);
    var hint = doc.createElementNS(XHTML, 'div');
    hint.className = 'rm-hint';
    hint.textContent = 'No hub, um clique na p\u00edlula destaca este navegador.';
    box.appendChild(title);
    box.appendChild(grid);
    box.appendChild(hint);
    panel.appendChild(box);
    panel.addEventListener('popupshowing', function () {
      var cur = currentColor();
      input.value = cur;
      swatches.forEach(function (sw, i) { sw.setAttribute('aria-checked', PALETTE[i] === cur ? 'true' : 'false'); });
      custom.setAttribute('aria-checked', PALETTE.indexOf(cur) < 0 ? 'true' : 'false');
      custom.style.setProperty('--sw', cur);
    });
    (doc.getElementById('mainPopupSet') || doc.documentElement).appendChild(panel);
    return panel;
  }

  function setup(win) {
    try {
      var doc = win.document;
      if (doc.documentElement.getAttribute('windowtype') !== 'navigator:browser') return;
      var nav = doc.getElementById('nav-bar');
      if (!nav || doc.getElementById('rinomask-pill')) return;
      var styled = loadSheet(win);

      var pill = doc.createElementNS(XHTML, 'button');
      pill.id = 'rinomask-pill';
      var label = doc.createElementNS(XHTML, 'span');
      label.className = 'rm-name';
      pill.appendChild(label);
      var panel = buildPanel(doc);
      function showPanel() { panel.openPopup(pill, 'after_start', 0, 6, false, false); }
      function openPanel(ev) {
        // Sem isso o clique sobe pra #nav-bar e abre o menu de contexto da barra ("Manage Extension"...).
        ev.preventDefault(); ev.stopPropagation();
        showPanel();
      }
      // Clique esquerdo: no hub = pedir destaque (sinal por arquivo); fora do hub = cores.
      function onClick(ev) {
        ev.preventDefault(); ev.stopPropagation();
        var dir;
        try { dir = win.PathUtils.profileDir; } catch (e) { showPanel(); return; }
        win.IOUtils.exists(win.PathUtils.join(dir, 'rinomask-hub.member')).then(function (inHub) {
          if (!inHub) { showPanel(); return null; }
          return win.IOUtils.writeUTF8(win.PathUtils.join(dir, 'rinomask-hub.signal'), String(Date.now()));
        }).catch(report);
      }
      pill.addEventListener('click', onClick);
      pill.addEventListener('contextmenu', openPanel);
      nav.insertBefore(pill, nav.firstChild);
      paint(pill, label, styled);

      // Cor/nome mudaram (nesta ou em outra janela do perfil) → repinta ao vivo.
      var observer = { observe: function () { paint(pill, label, styled); } };
      S.prefs.addObserver(PREF_COLOR, observer);
      S.prefs.addObserver(PREF_NAME, observer);
      win.addEventListener('unload', function () {
        S.prefs.removeObserver(PREF_COLOR, observer);
        S.prefs.removeObserver(PREF_NAME, observer);
      }, { once: true });
    } catch (e) { report(e); }
  }

  try {
    S.obs.addObserver(function (win) { setup(win); }, 'browser-delayed-startup-finished');
  } catch (e) { report(e); }
})();
// <<< RINOMASK PILL
