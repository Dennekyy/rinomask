'use strict';

// Barra do Hub: desenha uma pílula por navegador (mesmo nome/cor da pílula do navegador).
// Clique = priorizar; × = tirar do hub (o navegador continua aberto, solto na tela).
// O estado vem do processo principal (evento hub:state); aqui só renderiza e envia comandos.

const inv = (channel, payload) => window.api.invoke(channel, payload);
const $ = (s) => document.querySelector(s);

// Texto sobre a cor sólida (pílula em destaque): o que der MAIS contraste WCAG — branco ou quase-preto.
// (A regra antiga por brilho aproximado punha branco sobre âmbar/verde: ~2.9:1, ilegível.)
const DARK_TEXT = '#111113';
function luminance(hex) {
  const ch = [1, 3, 5].map((i) => parseInt(hex.substr(i, 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
function textFor(hex) {
  const L = luminance(hex);
  const vsWhite = 1.05 / (L + 0.05), vsDark = (L + 0.05) / (luminance(DARK_TEXT) + 0.05);
  return vsDark > vsWhite ? DARK_TEXT : '#ffffff';
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function icon(d) {
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '2.2');
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', d);
  s.append(p);
  return s;
}
const ICON_X = 'M7 7l10 10M17 7L7 17';

function span(cls, text) {
  const s = document.createElement('span');
  s.className = cls;
  if (text != null) s.textContent = text;
  return s;
}

// Pílula: ponto + nome + fim (atalho Alt+N; no hover vira "tirar do hub"). Delete/Backspace também tira.
function pill(m, index) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'hub-pill' + (m.priority ? ' priority' : '') + (m.hidden ? ' hidden' : '') + (m.loading ? ' loading' : '');
  btn.style.setProperty('--c', m.color);
  btn.style.setProperty('--on-c', textFor(m.color));
  const shortcut = index < 9 ? `Alt+${index + 1}` : null;
  btn.title = m.name + (shortcut ? ` (${shortcut})` : '') + (m.loading ? ' — abrindo navegador…' : m.hidden ? ' — fora de cena, clique para trazer' : m.priority ? ' — em destaque' : ' — clique para destacar');
  btn.setAttribute('aria-pressed', m.priority ? 'true' : 'false');
  const x = span('x');
  x.title = 'Tirar do hub (o navegador continua aberto)';
  x.append(icon(ICON_X));
  x.addEventListener('click', (e) => { e.stopPropagation(); inv('hub.remove', { id: m.id }); });
  const end = span('end');
  end.append(span('key', shortcut ? String(index + 1) : '·'), x);
  btn.append(span('dot'), span('name', m.name), end);
  btn.addEventListener('click', () => inv('hub.priority', { id: m.id }));
  btn.addEventListener('keydown', (e) => { if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); inv('hub.remove', { id: m.id }); } });
  return btn;
}

function render(state) {
  const list = state.members || [];
  $('#hub-pills').replaceChildren(...list.map(pill));
  $('#hub-count').textContent = String(list.length);
  $('#hub-empty').hidden = list.length > 0;
  $('#mode-grid').classList.toggle('on', state.mode === 'grid');
  $('#mode-focus').classList.toggle('on', state.mode !== 'grid');
  renderStrip(state.strip);
  renderSlots(state.slots || []);
}

// Espaços reservados dos navegadores que ainda estão abrindo (posição em DIP vinda do processo principal).
function renderSlots(slots) {
  $('#hub-slots').replaceChildren(...slots.map((s) => {
    const el = document.createElement('div');
    el.className = 'hub-slot';
    el.style.setProperty('--c', s.color);
    Object.assign(el.style, { left: s.left + 'px', top: s.top + 'px', width: s.width + 'px', height: s.height + 'px' });
    const body = span('slot-body');
    const name = span('slot-name');
    name.append(span('', s.name));
    body.append(name, span('slot-note', 'Abrindo navegador…'));
    el.append(body);
    return el;
  }));
}

// Faixa de scroll da lateral: só existe no foco quando nem todas as miniaturas cabem.
function renderStrip(s) {
  const el = $('#hub-strip');
  el.hidden = !s;
  if (!s) return;
  Object.assign(el.style, { left: s.left + 'px', top: s.top + 'px', width: s.width + 'px', height: s.height + 'px' });
  $('#strip-label').textContent = `${s.from}–${s.to} de ${s.total}`;
  $('#strip-up').disabled = s.from <= 1;
  $('#strip-down').disabled = s.to >= s.total;
}
$('#strip-up').addEventListener('click', () => inv('hub.scroll', { delta: -1 }));
$('#strip-down').addEventListener('click', () => inv('hub.scroll', { delta: 1 }));
// Rodinha/touchpad disparam muitos eventos por gesto → no máximo um passo a cada WHEEL_STEP_MS.
const WHEEL_STEP_MS = 150;
let lastWheel = 0;
$('#hub-strip').addEventListener('wheel', (e) => {
  e.preventDefault();
  if (!e.deltaY || Date.now() - lastWheel < WHEEL_STEP_MS) return;
  lastWheel = Date.now();
  inv('hub.scroll', { delta: e.deltaY });
}, { passive: false });

window.api.onEvent((ev) => { if (ev && ev.type === 'hub:state') render(ev.state); });
$('#mode-grid').addEventListener('click', () => inv('hub.mode', { mode: 'grid' }));
$('#mode-focus').addEventListener('click', () => inv('hub.mode', { mode: 'focus' }));
$('#hub-add').addEventListener('click', () => inv('hub.addRunning'));
inv('hub.state').then((s) => { if (s && s.members) render(s); });
