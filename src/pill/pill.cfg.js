// >>> RINOMASK PILL v1
// Bloco injetado no camoufox.cfg (autoconfig, contexto privilegiado do navegador) por src/pill.js.
// Mostra o nome do perfil numa pílula no topo da janela (#nav-bar) e deixa trocar a cor clicando nela.
// Vive só na INTERFACE do navegador (chrome) — nada é injetado nas páginas, os sites não enxergam.
//  - nome: pref rinomask.profile.name (o RinoMask grava no user.js a cada abertura)
//  - cor:  pref rinomask.pill.color (salva pelo próprio navegador no prefs.js do perfil; persiste)
(function rinomaskPill() {
  'use strict';
  var PREF_NAME = 'rinomask.profile.name';
  var PREF_COLOR = 'rinomask.pill.color';
  var DEFAULT_COLOR = '#2563eb';
  var PALETTE = ['#2563eb', '#16a34a', '#dc2626', '#ea580c', '#ca8a04', '#9333ea', '#db2777', '#0891b2', '#475569'];
  var HEX = /^#[0-9a-f]{6}$/i;
  var XHTML = 'http://www.w3.org/1999/xhtml';

  var S;
  try { S = (typeof Services !== 'undefined') ? Services : ChromeUtils.importESModule('resource://gre/modules/Services.sys.mjs').Services; } catch (e) { return; }
  function report(e) { try { S.console.logStringMessage('[RinoMask pill] ' + e); } catch (x) { /* sem console: ignora */ } }

  function readPref(name, fallback) { try { return S.prefs.getStringPref(name, fallback); } catch (e) { return fallback; } }
  function currentColor() { var c = readPref(PREF_COLOR, DEFAULT_COLOR); return HEX.test(c) ? c : DEFAULT_COLOR; }
  // Texto escuro em fundo claro e vice-versa (luminância simples).
  function textFor(hex) {
    var r = parseInt(hex.substr(1, 2), 16), g = parseInt(hex.substr(3, 2), 16), b = parseInt(hex.substr(5, 2), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) > 160 ? '#111827' : '#ffffff';
  }
  function saveColor(c) { if (HEX.test(c)) S.prefs.setStringPref(PREF_COLOR, c.toLowerCase()); }

  function css(el, props) { for (var k in props) el.style.setProperty(k, props[k]); }

  function paint(pill) {
    var name = readPref(PREF_NAME, '');
    pill.hidden = !name;
    pill.textContent = name;
    pill.title = name + ' \u2014 clique para trocar a cor';
    var c = currentColor();
    css(pill, { 'background-color': c, color: textFor(c) });
  }

  function buildPanel(doc) {
    var panel = doc.createXULElement('panel');
    panel.id = 'rinomask-pill-panel';
    panel.setAttribute('type', 'arrow');
    var box = doc.createElementNS(XHTML, 'div');
    css(box, { display: 'grid', 'grid-template-columns': 'repeat(5, 24px)', gap: '8px', padding: '10px' });
    PALETTE.forEach(function (c) {
      var sw = doc.createElementNS(XHTML, 'button');
      sw.title = c;
      css(sw, { width: '24px', height: '24px', 'border-radius': '50%', border: '2px solid rgba(255,255,255,.35)', 'background-color': c, cursor: 'pointer', padding: '0', 'min-width': '0', margin: '0' });
      sw.addEventListener('click', function () { saveColor(c); panel.hidePopup(); });
      box.appendChild(sw);
    });
    // Cor livre: seletor de cor nativo do sistema.
    var custom = doc.createElementNS(XHTML, 'input');
    custom.type = 'color';
    custom.title = 'Personalizar\u2026';
    css(custom, { width: '24px', height: '24px', padding: '0', border: '0', 'border-radius': '50%', cursor: 'pointer', margin: '0' });
    custom.addEventListener('input', function () { saveColor(custom.value); });
    box.appendChild(custom);
    panel.appendChild(box);
    panel.addEventListener('popupshowing', function () { custom.value = currentColor(); });
    (doc.getElementById('mainPopupSet') || doc.documentElement).appendChild(panel);
    return panel;
  }

  function setup(win) {
    try {
      var doc = win.document;
      if (doc.documentElement.getAttribute('windowtype') !== 'navigator:browser') return;
      var nav = doc.getElementById('nav-bar');
      if (!nav || doc.getElementById('rinomask-pill')) return;

      var pill = doc.createElementNS(XHTML, 'button');
      pill.id = 'rinomask-pill';
      css(pill, {
        'align-self': 'center', 'flex-shrink': '0', 'max-width': '220px', overflow: 'hidden', 'text-overflow': 'ellipsis',
        'white-space': 'nowrap', margin: '0 6px', padding: '3px 12px', border: '0', 'border-radius': '999px',
        font: '600 12px/1.4 system-ui, sans-serif', cursor: 'pointer', 'box-shadow': '0 1px 2px rgba(0,0,0,.35)',
        '-moz-window-dragging': 'no-drag',
      });
      var panel = buildPanel(doc);
      function openPanel(ev) {
        // Sem isso o clique sobe pra #nav-bar e abre o menu de contexto da barra ("Manage Extension"...).
        ev.preventDefault(); ev.stopPropagation();
        panel.openPopup(pill, 'after_start', 0, 4, false, false);
      }
      pill.addEventListener('click', openPanel);
      pill.addEventListener('contextmenu', openPanel);
      nav.insertBefore(pill, nav.firstChild);
      paint(pill);

      // Cor/nome mudaram (nesta ou em outra janela do perfil) → repinta ao vivo.
      var observer = { observe: function () { paint(pill); } };
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
