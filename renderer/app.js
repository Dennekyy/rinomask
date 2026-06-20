'use strict';

/* ============================== Helpers ============================== */
// Obs.: nao declarar `const api` aqui — o preload ja expoe um global `api`
// (nao-configuravel) no window; redeclarar lanca "Identifier 'api' has already
// been declared" e quebra TODO o script. Use window.api diretamente.
const $ = (s) => document.querySelector(s);
const inv = (channel, payload) => window.api.invoke(channel, payload);

function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  for (const k in props) {
    const v = props[k];
    if (v == null) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else e.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return e;
}

/* ---- ícones SVG (sem emoji, conforme guideline UI/UX) ---- */
const ICONS = {
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  pin: '<path d="M12 17v5"/><path d="M7 4h10l-1.5 7 2.5 2.5V15H6v-1.5L8.5 11z"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 13h10l1-13"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.6 2.6 2.6 15.4 0 18"/><path d="M12 3c-2.6 2.6-2.6 15.4 0 18"/>',
  tag: '<path d="M20.5 13.5l-7 7a2 2 0 0 1-2.8 0L4 14V5a1 1 0 0 1 1-1h9z"/><circle cx="9" cy="9" r="1.2" fill="currentColor" stroke="none"/>',
  hash: '<path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  play: '<path d="M7 5l12 7-12 7z" fill="currentColor" stroke="none"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>',
  dots: '<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
  edit: '<path d="M4 20h4L18 10l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v1"/>',
  cookie: '<path d="M12 3a9 9 0 1 0 9 9 4 4 0 0 1-4-4 4 4 0 0 1-4-4"/><circle cx="8.5" cy="11" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="15.5" r="1" fill="currentColor" stroke="none"/><circle cx="15.5" cy="9.5" r="1" fill="currentColor" stroke="none"/>',
  restore: '<path d="M3 8a9 9 0 1 1-1.4 5"/><path d="M3 4v4h4"/>',
  link: '<path d="M9 15l6-6"/><path d="M10.5 6.5l1-1a4 4 0 0 1 5.7 5.7l-1 1"/><path d="M13.5 17.5l-1 1a4 4 0 0 1-5.7-5.7l1-1"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  flame: '<path d="M12 3s5 3.5 5 8a5 5 0 0 1-10 0c0-2 1-3.5 2.5-4.5C9 8 10 6 10 4c1 1 2 1.5 2 3"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  shield: '<path d="M12 3l7 3v5c0 4.2-2.9 7.4-7 8.5C7.9 18.4 5 15.2 5 11V6z"/><path d="M9.2 12l1.9 1.9 3.7-3.8"/>',
  alert: '<path d="M10.3 3.9 2.4 18a1.8 1.8 0 0 0 1.6 2.7h16a1.8 1.8 0 0 0 1.6-2.7L13.7 3.9a1.8 1.8 0 0 0-3.4 0Z"/><path d="M12 9v4.5"/><circle cx="12" cy="17.3" r="0.6" fill="currentColor" stroke="none"/>',
};
const trustColor = (s) => (s >= 85 ? 'var(--green)' : s >= 60 ? 'var(--amber)' : 'var(--red)');

// Logo RinoMask (SVG vetorizado, recolorível) para a tela de bloqueio.
const RHINO_SVG = '<span class="logo-mark"></span>';
function svg(name, size = 16) {
  const NS = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.8'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
  s.innerHTML = ICONS[name] || '';
  return s;
}

// Iniciais do nome (até 2 letras) — usadas como avatar quando o perfil não tem foto.
function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  if (parts.length === 1) return parts[0].slice(0, 2);
  return parts[0][0] + parts[parts.length - 1][0];
}

// Abre um recortador circular: o usuário arrasta para posicionar e dá zoom (roda do
// mouse ou barra). Resolve com um data URL quadrado leve (256px, JPEG) já enquadrado,
// ou null se cancelar. CSP permite `img-src 'self' data:`, então data URLs funcionam.
function openAvatarCropper(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => { toast('Falha ao ler a imagem'); resolve(null); };
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => { toast('Imagem inválida'); resolve(null); };
      img.onload = () => mountAvatarCropper(img, resolve);
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Camada própria (não usa modal(), para não fechar o editor por baixo).
function mountAvatarCropper(img, resolve) {
  const V = 288;   // viewport de exibição (px CSS)
  const OUT = 256; // resolução de saída
  const canvas = el('canvas', { class: 'cropper-canvas' });
  canvas.width = V; canvas.height = V;
  const ctx = canvas.getContext('2d');

  const coverScale = Math.max(V / img.width, V / img.height); // mínimo: cobre o círculo
  const maxScale = coverScale * 5;
  let scale = coverScale;
  let ox = (V - img.width * scale) / 2;
  let oy = (V - img.height * scale) / 2;

  const clampOffset = () => {
    const w = img.width * scale, h = img.height * scale;
    ox = Math.min(0, Math.max(V - w, ox));
    oy = Math.min(0, Math.max(V - h, oy));
  };

  const draw = () => {
    clampOffset();
    ctx.clearRect(0, 0, V, V);
    ctx.drawImage(img, ox, oy, img.width * scale, img.height * scale);
    // escurece tudo fora do círculo (rect menos círculo, via evenodd)
    ctx.fillStyle = 'rgba(15,15,15,0.6)';
    ctx.beginPath();
    ctx.rect(0, 0, V, V);
    ctx.arc(V / 2, V / 2, V / 2 - 1, 0, Math.PI * 2);
    ctx.fill('evenodd');
    // anel-guia
    ctx.beginPath();
    ctx.arc(V / 2, V / 2, V / 2 - 1, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.stroke();
  };

  const zoom = el('input', { type: 'range', min: '1', max: '5', step: '0.01', value: '1', class: 'cropper-zoom' });
  // Zoom mantendo fixo o ponto (px,py) da viewport sob o cursor/centro.
  const zoomAt = (px, py, factor) => {
    const ns = Math.max(coverScale, Math.min(maxScale, scale * factor));
    if (ns === scale) return;
    const ix = (px - ox) / scale, iy = (py - oy) / scale;
    scale = ns;
    ox = px - ix * scale; oy = py - iy * scale;
    zoom.value = (scale / coverScale).toFixed(2);
    draw();
  };
  zoom.addEventListener('input', () => zoomAt(V / 2, V / 2, (coverScale * parseFloat(zoom.value)) / scale));

  // Arrastar com Pointer Events + capture: funciona ao sair do canvas, sem listeners no window.
  let dragging = false, lx = 0, ly = 0;
  canvas.addEventListener('pointerdown', (e) => { dragging = true; lx = e.clientX; ly = e.clientY; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { if (!dragging) return; ox += e.clientX - lx; oy += e.clientY - ly; lx = e.clientX; ly = e.clientY; draw(); });
  const endDrag = () => { dragging = false; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.12 : 1 / 1.12);
  }, { passive: false });

  // Renderiza a área visível (quadrado da viewport) na resolução de saída.
  const crop = () => {
    const out = document.createElement('canvas');
    out.width = OUT; out.height = OUT;
    const k = OUT / V;
    out.getContext('2d').drawImage(img, ox * k, oy * k, img.width * scale * k, img.height * scale * k);
    return out.toDataURL('image/jpeg', 0.9);
  };

  let done = false;
  const overlay = el('div', { class: 'modal-root cropper-root show' });
  const finish = (val) => { if (done) return; done = true; overlay.remove(); resolve(val); };
  overlay.append(
    el('div', { class: 'scrim', onClick: () => finish(null) }),
    el('div', { class: 'modal cropper-modal' },
      el('div', { class: 'modal-head' },
        el('h3', {}, 'Ajustar foto'),
        el('button', { class: 'icon', type: 'button', onClick: () => finish(null) }, svg('close'))),
      el('div', { class: 'modal-body cropper-body' },
        el('div', { class: 'cropper-stage' }, canvas),
        el('div', { class: 'cropper-controls' }, el('span', { class: 'cropper-z' }, '–'), zoom, el('span', { class: 'cropper-z' }, '+')),
        el('p', { class: 'hint', style: 'text-align:center' }, 'Arraste para posicionar · use a roda do mouse ou a barra para dar zoom.')),
      el('div', { class: 'modal-foot' },
        el('button', { class: 'ghost', type: 'button', onClick: () => finish(null) }, 'Cancelar'),
        el('button', { class: 'primary', type: 'button', onClick: () => finish(crop()) }, 'Usar foto'))));
  document.body.append(overlay);
  draw();
}

// Avatar do perfil para a lista: foto (se houver) ou iniciais, com o status como badge.
function profileAvatar(p, st) {
  const wrap = el('div', { class: 'pavatar-wrap' });
  if (p.avatar) wrap.append(el('img', { class: 'pavatar', src: p.avatar, alt: '' }));
  else wrap.append(el('span', { class: 'pavatar ph' }, initials(p.name) || '?'));
  wrap.append(el('span', { class: 'statusdot badge', style: `background:${st.color}`, title: st.name }));
  return wrap;
}

function toast(msg) {
  const t = $('#toast');
  if (!t) return; // defensivo: nunca lançar a partir do handler global de erros
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}

function closeModal() {
  const r = $('#modal-root');
  r.classList.remove('show');
  r.innerHTML = '';
}
function modal({ title, body, foot, wide }) {
  const root = $('#modal-root');
  root.innerHTML = '';
  const scrim = el('div', { class: 'scrim', onClick: closeModal });
  const m = el('div', { class: 'modal' + (wide ? ' wide' : '') },
    el('div', { class: 'modal-head' },
      el('h3', {}, title),
      el('button', { class: 'icon', onClick: closeModal }, svg('close'))),
    el('div', { class: 'modal-body' }, ...(Array.isArray(body) ? body : [body])),
    foot && el('div', { class: 'modal-foot' }, ...foot));
  root.append(scrim, m);
  root.classList.add('show');
  return m;
}

const SCREENS = [
  { w: 1920, h: 1080 }, { w: 1536, h: 864 }, { w: 1366, h: 768 },
  { w: 1440, h: 900 }, { w: 2560, h: 1440 },
];
const SITES = [
  { v: '', t: 'Nenhum' }, { v: 'facebook', t: 'Facebook' }, { v: 'google', t: 'Google' },
  { v: 'tiktok', t: 'TikTok' }, { v: 'crypto', t: 'Cripto' },
];

/* ============================== State ============================== */
const state = {
  meta: { statuses: [], tags: [], folders: [], proxies: [], osList: [], regions: [] },
  nonTrash: [],
  trash: [],
  view: 'all',
  search: '',
  filterStatus: '',
  filterTag: '',
  selected: new Set(),
  sync: { active: false, masterId: null, slaveIds: [] },
};

const statusById = (id) => state.meta.statuses.find((s) => s.id === id) || { name: '—', color: '#5d6878' };
const tagById = (id) => state.meta.tags.find((t) => t.id === id);
const folderById = (id) => state.meta.folders.find((f) => f.id === id);

/* ============================== Load / refresh ============================== */
async function loadMeta() {
  state.meta = await inv('meta.options');
}
async function refresh() {
  const [nonTrash, trash] = await Promise.all([
    inv('profiles.list', { includeTrash: false }),
    inv('profiles.list', { includeTrash: true }),
  ]);
  state.nonTrash = nonTrash;
  state.trash = trash;
  // limpa selecoes de itens que sumiram
  const ids = new Set([...nonTrash, ...trash].map((p) => p.id));
  for (const id of [...state.selected]) if (!ids.has(id)) state.selected.delete(id);
  render();
}

/* ============================== Filtering ============================== */
function visibleProfiles() {
  if (state.view === 'trash') return state.trash;
  let list = state.nonTrash;
  if (state.view === 'pinned') list = list.filter((p) => p.pinned);
  else if (state.view !== 'all') list = list.filter((p) => p.folderId === state.view);
  const q = state.search.trim().toLowerCase();
  if (q) list = list.filter((p) => p.name.toLowerCase().includes(q) || (p.notes || '').toLowerCase().includes(q));
  if (state.filterStatus) list = list.filter((p) => p.status === state.filterStatus);
  if (state.filterTag) list = list.filter((p) => (p.tags || []).includes(state.filterTag));
  return list.slice().sort((a, b) => (b.pinned - a.pinned) || ((a.order ?? 0) - (b.order ?? 0)) || a.name.localeCompare(b.name));
}

// Arraste para reordenar (só visual): clica-segura a alça ≡ e move a linha ↑/↓. Ao soltar,
// persiste a nova sequência (profiles.reorder) — o re-render reaplica a ordem salva.
function startRowDrag(e, tr) {
  e.preventDefault(); e.stopPropagation();
  const tbody = tr.parentElement; if (!tbody) return;
  tr.classList.add('dragging');
  const onMove = (ev) => {
    const rows = [...tbody.querySelectorAll('tr')].filter((r) => r !== tr);
    const after = rows.find((r) => ev.clientY < r.getBoundingClientRect().top + r.offsetHeight / 2);
    if (after) tbody.insertBefore(tr, after); else tbody.appendChild(tr);
  };
  const onUp = async () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    tr.classList.remove('dragging');
    const orderedIds = [...tbody.querySelectorAll('tr')].map((r) => r.dataset.id).filter(Boolean);
    await inv('profiles.reorder', { orderedIds });
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

/* ============================== Render ============================== */
function render() {
  renderSidebar();
  renderTable();
  renderBulkBar();
  renderSyncBar();
  syncFilterSelects();
}

function renderSidebar() {
  const nav = $('#nav');
  nav.innerHTML = '';
  const item = (opts) => {
    const e = el('div', { class: 'nav-item' + (state.view === opts.view ? ' active' : ''), onClick: () => { state.view = opts.view; state.selected.clear(); render(); } },
      opts.color ? el('span', { class: 'dot-color', style: `background:${opts.color}` }) : el('span', { class: 'ic' }, svg(opts.icon)),
      el('span', { class: 'lbl' }, opts.label),
      opts.count != null ? el('span', { class: 'count' }, opts.count) : null);
    return e;
  };
  nav.append(el('div', { class: 'nav-label' }, 'Perfis'));
  nav.append(item({ view: 'all', icon: 'folder', label: 'Todos os perfis', count: state.nonTrash.length }));
  nav.append(item({ view: 'pinned', icon: 'pin', label: 'Fixados', count: state.nonTrash.filter((p) => p.pinned).length }));

  const fl = el('div', { class: 'nav-label' }, 'Pastas');
  nav.append(fl);
  for (const f of state.meta.folders) {
    nav.append(item({ view: f.id, color: f.color, label: f.name, count: state.nonTrash.filter((p) => p.folderId === f.id).length }));
  }
  nav.append(el('div', { class: 'nav-item folder-add', onClick: addFolderPrompt }, el('span', { class: 'ic' }, svg('plus')), el('span', { class: 'lbl' }, 'Nova pasta')));

  nav.append(el('div', { class: 'sb-divider' }));
  nav.append(item({ view: 'trash', icon: 'trash', label: 'Lixeira', count: state.trash.length }));
  nav.append(el('div', { class: 'sb-spacer' }));
  nav.append(el('div', { class: 'sb-divider' }));
  nav.append(el('div', { class: 'nav-item', onClick: openProxiesModal }, el('span', { class: 'ic' }, svg('globe')), el('span', { class: 'lbl' }, 'Proxies'), el('span', { class: 'count' }, state.meta.proxies.length)));
  nav.append(el('div', { class: 'nav-item', onClick: openStatusModal }, el('span', { class: 'ic' }, svg('tag')), el('span', { class: 'lbl' }, 'Status')));
  nav.append(el('div', { class: 'nav-item', onClick: openTagsModal }, el('span', { class: 'ic' }, svg('hash')), el('span', { class: 'lbl' }, 'Tags')));
  nav.append(el('div', { class: 'nav-item', onClick: openSecurityModal }, el('span', { class: 'ic' }, svg('lock')), el('span', { class: 'lbl' }, 'Segurança')));
  nav.append(el('div', { class: 'nav-item', onClick: openErrorLog }, el('span', { class: 'ic' }, svg('alert')), el('span', { class: 'lbl' }, 'Diagnóstico')));
}

function syncFilterSelects() {
  const fs = $('#filter-status');
  if (fs.dataset.n != state.meta.statuses.length) {
    fs.dataset.n = state.meta.statuses.length;
    fs.innerHTML = '<option value="">Todos os status</option>';
    state.meta.statuses.forEach((s) => fs.append(el('option', { value: s.id }, s.name)));
  }
  fs.value = state.filterStatus;
  const ft = $('#filter-tag');
  if (ft.dataset.n != state.meta.tags.length) {
    ft.dataset.n = state.meta.tags.length;
    ft.innerHTML = '<option value="">Todas as tags</option>';
    state.meta.tags.forEach((t) => ft.append(el('option', { value: t.id }, t.name)));
  }
  ft.value = state.filterTag;
}

function proxyLabel(p) {
  const px = p.resolvedProxy;
  if (!px) return el('span', { class: 'none' }, '— sem proxy —');
  return el('span', { class: 'mono' }, `${px.type}://${px.host}:${px.port}`);
}

function renderTable() {
  const rows = $('#rows');
  rows.innerHTML = '';
  const list = visibleProfiles();
  $('#empty').style.display = list.length ? 'none' : 'block';
  const isTrash = state.view === 'trash';

  for (const p of list) {
    const st = statusById(p.status);
    const checked = state.selected.has(p.id);
    const tr = el('tr', { class: checked ? 'sel' : '' });
    tr.dataset.id = p.id;

    tr.append(el('td', {}, el('input', { type: 'checkbox', checked: checked ? '' : null, onChange: (e) => { e.target.checked ? state.selected.add(p.id) : state.selected.delete(p.id); render(); } })));
    tr.append(el('td', {}, el('span', { class: 'run-led' + (p.running ? ' on' : ''), title: p.running ? 'aberto' : 'parado' })));

    tr.append(el('td', {},
      el('div', { class: 'pname' },
        state.view === 'trash' ? null : el('span', { class: 'grip', title: 'Arraste para reordenar', onMousedown: (e) => startRowDrag(e, tr) }, '⠿'),
        profileAvatar(p, st),
        p.pinned ? el('span', { class: 'pin', title: 'fixado' }, svg('pin', 13)) : null,
        el('div', {},
          el('div', { class: 'nm' }, p.name,
            p.trustScore ? el('span', { class: 'trust', style: `color:${trustColor(p.trustScore.score)}`, title: 'Trust score — indetectabilidade da fingerprint' }, ` 🛡${p.trustScore.score}`) : null,
            p.warmth ? el('span', { class: 'trust', style: `color:${trustColor(p.warmth.score)}${p.warmReport ? ';cursor:pointer' : ''}`, title: warmTooltip(p.warmth, !!p.warmReport), onClick: p.warmReport ? (e) => { e.stopPropagation(); openWarmReport(p.warmReport); } : null }, ` 🍪${p.warmth.score}`) : null),
          el('div', { class: 'sub' }, `${st.name}${p.notes ? ' · ' + p.notes.slice(0, 40) : ''}`)))));

    tr.append(el('td', {}, ...(p.tags || []).map((tid) => {
      const t = tagById(tid); if (!t) return document.createTextNode('');
      return el('span', { class: 'tagchip', style: `background:${t.color}22;color:${t.color};border:1px solid ${t.color}55` }, t.name);
    })));

    tr.append(el('td', {}, el('span', { class: 'chip' }, p.fingerprint.os)));
    tr.append(el('td', { class: 'proxy-cell' }, proxyLabel(p)));
    tr.append(el('td', { class: 'sub', style: 'font-size:12px;color:var(--muted2)' }, p.lastLaunchedAt ? new Date(p.lastLaunchedAt).toLocaleString() : '—'));

    const actions = el('td', {}, el('div', { class: 'row-actions' }));
    const box = actions.firstChild;
    if (isTrash) {
      box.append(el('button', { class: 'sm', onClick: async () => { await inv('profiles.restore', { ids: [p.id] }); toast('Restaurado'); } }, svg('restore', 14), 'Restaurar'));
      box.append(el('button', { class: 'sm danger', title: 'Excluir definitivamente', onClick: () => confirmDeleteForever([p.id]) }, svg('trash', 14)));
    } else {
      if (p.running) box.append(el('button', { class: 'sm', onClick: async () => { await inv('profiles.stop', { id: p.id }); } }, svg('stop', 13), 'Parar'));
      else box.append(el('button', { class: 'sm open', onClick: async () => { toast('Abrindo…'); try { await inv('profiles.launch', { id: p.id }); } catch (e) { toast('Erro: ' + e.message); } } }, svg('play', 13), 'Abrir'));
      box.append(el('button', { class: 'icon', title: 'Mais ações', onClick: (e) => openRowMenu(e, p) }, svg('dots')));
    }
    tr.append(actions);
    rows.append(tr);
  }
  const all = list.length > 0 && list.every((p) => state.selected.has(p.id));
  $('#check-all').checked = all;
}

/* ============================== Bulk bar ============================== */
function ddButton(iconName, label, items) {
  const menu = el('div', { class: 'dd-menu' }, ...items.map((it) =>
    el('div', { class: 'it', onClick: () => { closeAllDD(); it.onClick(); } }, it.label)));
  const wrap = el('div', { class: 'dd' },
    el('button', { class: 'sm', onClick: (e) => { e.stopPropagation(); const open = wrap.classList.contains('open'); closeAllDD(); if (!open) wrap.classList.add('open'); } }, svg(iconName, 14), `${label} ▾`),
    menu);
  return wrap;
}
function closeAllDD() { document.querySelectorAll('.dd.open').forEach((d) => d.classList.remove('open')); }
document.addEventListener('click', closeAllDD);

function renderBulkBar() {
  const bar = $('#bulkbar');
  const ids = [...state.selected];
  if (ids.length === 0 || state.view === 'trash') { bar.style.display = 'none'; if (state.view === 'trash') renderTrashBulk(); return; }
  bar.style.display = 'flex';
  bar.innerHTML = '';
  bar.append(el('span', { class: 'count' }, `${ids.length} selecionado(s)`));
  bar.append(el('button', { class: 'sm primary', onClick: async () => { toast('Abrindo perfis…'); await inv('profiles.launchMany', { ids }); } }, svg('play', 13), 'Abrir'));
  bar.append(el('button', { class: 'sm', onClick: async () => { await inv('profiles.stopMany', { ids }); } }, svg('stop', 13), 'Parar'));

  bar.append(ddButton('tag', 'Status', state.meta.statuses.map((s) => ({ label: s.name, onClick: async () => { await inv('profiles.setStatus', { ids, status: s.id }); toast('Status alterado'); } }))));
  bar.append(ddButton('hash', 'Tag', state.meta.tags.length ? state.meta.tags.map((t) => ({ label: t.name, onClick: async () => { await inv('profiles.addTag', { ids, tagId: t.id }); toast('Tag aplicada'); } })) : [{ label: 'Crie tags primeiro…', onClick: openTagsModal }]));
  bar.append(ddButton('folder', 'Pasta', [{ label: '— Sem pasta —', onClick: async () => { await inv('profiles.setFolder', { ids, folderId: null }); } }, ...state.meta.folders.map((f) => ({ label: f.name, onClick: async () => { await inv('profiles.setFolder', { ids, folderId: f.id }); } }))]));
  bar.append(ddButton('globe', 'Proxy', [{ label: '— Remover proxy —', onClick: async () => { await inv('profiles.setProxy', { ids, proxyRef: { proxyId: null, proxy: null } }); } }, ...state.meta.proxies.map((px) => ({ label: `${px.name}`, onClick: async () => { await inv('profiles.setProxy', { ids, proxyRef: { proxyId: px.id } }); toast('Proxy atribuído'); } }))]));

  bar.append(el('button', { class: 'sm', onClick: () => openWarmDialog({ ids }) }, svg('flame', 14), 'Aquecer'));
  bar.append(el('div', { class: 'spacer', style: 'flex:1' }));
  bar.append(el('button', { class: 'sm', onClick: () => startSync(ids) }, svg('link', 14), 'Sincronizar'));
  bar.append(el('button', { class: 'sm danger', onClick: async () => { await inv('profiles.trash', { ids }); state.selected.clear(); toast('Movido(s) para a lixeira'); } }, svg('trash', 14), 'Excluir'));
}

function renderTrashBulk() {
  const bar = $('#bulkbar');
  const ids = [...state.selected];
  if (ids.length === 0) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  bar.innerHTML = '';
  bar.append(el('span', { class: 'count' }, `${ids.length} na lixeira`));
  bar.append(el('button', { class: 'sm', onClick: async () => { await inv('profiles.restore', { ids }); state.selected.clear(); toast('Restaurado(s)'); } }, svg('restore', 14), 'Restaurar'));
  bar.append(el('button', { class: 'sm danger', onClick: () => confirmDeleteForever(ids) }, svg('trash', 14), 'Excluir definitivamente'));
}

/* ============================== Sync bar ============================== */
async function startSync(ids) {
  const r = await inv('sync.start', { ids });
  if (!r.ok) return toast(r.error);
  state.sync = await inv('sync.status');
  state.sync.active = true;
  toast(`Sincronizando: 1 mestre + ${r.slaves} espelho(s)`);
  renderSyncBar();
}
function renderSyncBar() {
  const bar = $('#syncbar');
  if (!state.sync.active) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  bar.innerHTML = '';
  const master = state.nonTrash.find((p) => p.id === state.sync.masterId);
  bar.append(el('span', { class: 'pulse' }));
  bar.append(el('b', {}, 'Sincronizador ativo'));
  bar.append(el('span', { class: 'hint' }, `mestre: ${master ? master.name : '—'} · ${state.sync.slaveIds.length} espelho(s). Aja na janela mestre.`));
  const url = el('input', { type: 'text', placeholder: 'Enviar todos para a URL…', onKeydown: (e) => { if (e.key === 'Enter') sendSyncUrl(url.value); } });
  bar.append(url);
  bar.append(el('button', { class: 'sm', onClick: () => sendSyncUrl(url.value) }, 'Ir'));
  bar.append(el('button', { class: 'sm danger', onClick: async () => { await inv('sync.stop'); state.sync.active = false; renderSyncBar(); } }, 'Parar'));
}
async function sendSyncUrl(u) {
  if (!u) return;
  if (!/^https?:\/\//.test(u)) u = 'https://' + u;
  await inv('sync.navigate', { url: u });
}

/* ============================== Row context menu ============================== */
function openRowMenu(e, p) {
  e.stopPropagation();
  const ctx = $('#ctx');
  ctx.innerHTML = '';
  const it = (icon, label, fn, cls) => el('div', { class: 'it' + (cls ? ' ' + cls : ''), onClick: () => { hideCtx(); fn(); } }, svg(icon), el('span', {}, label));
  ctx.append(it('edit', 'Editar', () => openEditor(p)));
  ctx.append(it('copy', 'Clonar…', () => openCloneModal(p)));
  ctx.append(it('cookie', 'Cookies…', () => openCookiesModal(p)));
  ctx.append(it('flame', 'Aquecer (Cookie Robot)', () => openWarmDialog({ id: p.id })));
  if (p.warmReport) ctx.append(it('flame', 'Relatório de aquecimento', () => openWarmReport(p.warmReport)));
  ctx.append(it('shield', 'Testar fingerprint (trust score)', () => runTrust(p)));
  ctx.append(it('alert', 'Auditoria de detecção (oráculos)', () => { inv('detect.run', { id: p.id }); toast('🔎 Auditoria iniciada (abre o navegador, ~1-3 min)…'); }));
  ctx.append(it('pin', p.pinned ? 'Desafixar' : 'Fixar no topo', async () => { await inv('profiles.pin', { id: p.id, pinned: !p.pinned }); }));
  ctx.append(el('div', { class: 'sep' }));
  ctx.append(it('trash', 'Excluir', async () => { await inv('profiles.trash', { ids: [p.id] }); toast('Movido para a lixeira'); }, 'danger'));
  ctx.style.left = Math.min(e.clientX, window.innerWidth - 200) + 'px';
  ctx.style.top = Math.min(e.clientY, window.innerHeight - 240) + 'px';
  ctx.classList.add('show');
}
function hideCtx() { $('#ctx').classList.remove('show'); }
document.addEventListener('click', hideCtx);

/* ============================== Confirm delete forever ============================== */
function confirmDeleteForever(ids) {
  modal({
    title: 'Excluir definitivamente',
    body: el('div', {}, el('p', {}, `Isto apaga ${ids.length} perfil(is) e TODA a memória persistente (cookies, login, sessão). Não há como desfazer.`)),
    foot: [
      el('button', { class: 'ghost', onClick: closeModal }, 'Cancelar'),
      el('button', { class: 'danger', onClick: async () => { closeModal(); await inv('profiles.deleteForever', { ids }); state.selected.clear(); toast('Excluído definitivamente'); } }, 'Excluir tudo'),
    ],
  });
}

/* ============================== Folder / Status / Tag prompts ============================== */
function addFolderPrompt() {
  const name = el('input', { type: 'text', placeholder: 'Nome da pasta' });
  const color = el('input', { type: 'color', value: '#5b8cff', style: 'width:48px;height:38px;padding:2px' });
  modal({
    title: 'Nova pasta', body: el('div', { class: 'row2' }, el('label', { class: 'fld' }, 'Nome', name), el('label', { class: 'fld', style: 'flex:0 0 auto' }, 'Cor', color)),
    foot: [el('button', { class: 'ghost', onClick: closeModal }, 'Cancelar'), el('button', { class: 'primary', onClick: async () => { if (!name.value.trim()) return; await inv('folders.create', { name: name.value.trim(), color: color.value }); await loadMeta(); closeModal(); render(); } }, 'Criar')],
  });
}

function openStatusModal() {
  const listWrap = el('div', { style: 'display:flex;flex-direction:column;gap:8px' });
  const draw = () => {
    listWrap.innerHTML = '';
    state.meta.statuses.forEach((s) => listWrap.append(el('div', { class: 'list-row' },
      el('span', { class: 'statusdot', style: `background:${s.color}` }), el('span', { class: 'grow' }, s.name),
      s.builtin ? el('span', { class: 'hint' }, 'padrão') : el('button', { class: 'sm danger', onClick: async () => { await inv('statuses.delete', { id: s.id }); await loadMeta(); draw(); render(); } }, 'Excluir'))));
  };
  draw();
  const name = el('input', { type: 'text', placeholder: 'Novo status' });
  const color = el('input', { type: 'color', value: '#2ecc71', style: 'width:48px;height:38px;padding:2px' });
  modal({
    title: 'Status', body: [listWrap, el('div', { class: 'row2' }, el('label', { class: 'fld' }, 'Nome', name), el('label', { class: 'fld', style: 'flex:0 0 auto' }, 'Cor', color), el('button', { class: 'primary', style: 'align-self:flex-end', onClick: async () => { if (!name.value.trim()) return; await inv('statuses.create', { name: name.value.trim(), color: color.value }); name.value = ''; await loadMeta(); draw(); render(); } }, 'Adicionar'))],
    foot: [el('button', { class: 'ghost', onClick: closeModal }, 'Fechar')],
  });
}

function openTagsModal() {
  const listWrap = el('div', { style: 'display:flex;flex-direction:column;gap:8px' });
  const draw = () => {
    listWrap.innerHTML = '';
    if (!state.meta.tags.length) listWrap.append(el('div', { class: 'hint' }, 'Nenhuma tag ainda.'));
    state.meta.tags.forEach((t) => listWrap.append(el('div', { class: 'list-row' },
      el('span', { class: 'tagchip', style: `background:${t.color}22;color:${t.color};border:1px solid ${t.color}55` }, t.name), el('span', { class: 'grow' }),
      el('button', { class: 'sm danger', onClick: async () => { await inv('tags.delete', { id: t.id }); await loadMeta(); draw(); render(); } }, 'Excluir'))));
  };
  draw();
  const name = el('input', { type: 'text', placeholder: 'Nova tag' });
  const color = el('input', { type: 'color', value: '#5b8cff', style: 'width:48px;height:38px;padding:2px' });
  modal({
    title: 'Tags', body: [listWrap, el('div', { class: 'row2' }, el('label', { class: 'fld' }, 'Nome', name), el('label', { class: 'fld', style: 'flex:0 0 auto' }, 'Cor', color), el('button', { class: 'primary', style: 'align-self:flex-end', onClick: async () => { if (!name.value.trim()) return; await inv('tags.create', { name: name.value.trim(), color: color.value }); name.value = ''; await loadMeta(); draw(); render(); } }, 'Adicionar'))],
    foot: [el('button', { class: 'ghost', onClick: closeModal }, 'Fechar')],
  });
}

/* ============================== Proxies modal ============================== */
function openProxiesModal() {
  const listWrap = el('div', { style: 'display:flex;flex-direction:column;gap:8px;max-height:260px;overflow:auto' });
  const draw = () => {
    listWrap.innerHTML = '';
    if (!state.meta.proxies.length) listWrap.append(el('div', { class: 'hint' }, 'Nenhum proxy salvo.'));
    state.meta.proxies.forEach((px) => {
      const res = el('span', { class: 'hint' }, px.lastIp ? `IP: ${px.lastIp}` : (px.lastStatus === 'fail' ? 'falhou' : ''));
      listWrap.append(el('div', { class: 'list-row' },
        el('div', { class: 'grow' }, el('div', {}, px.name), el('div', { class: 'mono hint' }, `${px.type}://${px.host}:${px.port}`)),
        res,
        el('button', { class: 'sm', onClick: async () => { res.textContent = 'testando…'; const r = await inv('proxies.test', { id: px.id, type: px.type, host: px.host, port: px.port, username: px.username, password: px.password }); res.textContent = r.ok ? `IP: ${r.ip} (${r.latencyMs}ms)` : 'falhou: ' + r.error; res.className = r.ok ? 'result-ok' : 'result-fail'; await loadMeta(); render(); } }, 'Testar'),
        el('button', { class: 'sm danger', onClick: async () => { await inv('proxies.delete', { id: px.id }); await loadMeta(); draw(); render(); } }, '✕')));
    });
  };
  draw();

  const type = el('select', {}, ...['http', 'https', 'socks5', 'socks4'].map((t) => el('option', { value: t }, t.toUpperCase())));
  const name = el('input', { placeholder: 'Apelido (opcional)' });
  const host = el('input', { placeholder: 'host' });
  const port = el('input', { type: 'number', placeholder: 'porta', style: 'max-width:90px' });
  const user = el('input', { placeholder: 'usuário (opcional)' });
  const pass = el('input', { type: 'password', placeholder: 'senha (opcional)' });
  const addForm = el('fieldset', {}, el('legend', {}, 'Adicionar proxy'),
    el('div', { class: 'row2' }, el('label', { class: 'fld', style: 'flex:0 0 110px' }, 'Tipo', type), el('label', { class: 'fld' }, 'Host', host), el('label', { class: 'fld', style: 'flex:0 0 90px' }, 'Porta', port)),
    el('div', { class: 'row2' }, el('label', { class: 'fld' }, 'Usuário', user), el('label', { class: 'fld' }, 'Senha', pass)),
    el('div', { class: 'row2' }, el('label', { class: 'fld' }, 'Apelido', name),
      el('button', { class: 'primary', style: 'align-self:flex-end', onClick: async () => { if (!host.value || !port.value) return toast('host e porta'); await inv('proxies.create', { type: type.value, host: host.value, port: port.value, username: user.value, password: pass.value, name: name.value }); host.value = port.value = user.value = pass.value = name.value = ''; await loadMeta(); draw(); render(); } }, 'Adicionar')));

  const bulk = el('textarea', { rows: '4', placeholder: 'Importar em massa (1 por linha):\ntype://user:pass@host:port\nhost:port:user:pass\nhost:port' });
  const bulkBox = el('fieldset', {}, el('legend', {}, 'Importar em massa'), bulk,
    el('button', { class: 'sm', style: 'margin-top:8px', onClick: async () => { const r = await inv('proxies.importBulk', { text: bulk.value }); bulk.value = ''; await loadMeta(); draw(); render(); toast(`${r.length} proxy(s) importado(s)`); } }, 'Importar'));

  modal({ title: 'Biblioteca de proxies', wide: true, body: [listWrap, addForm, bulkBox], foot: [el('button', { class: 'ghost', onClick: closeModal }, 'Fechar')] });
}

/* ============================== Clone modal ============================== */
function openCloneModal(p) {
  const count = el('input', { type: 'number', value: '1', min: '1', max: '50', style: 'max-width:90px' });
  const rnd = el('input', { type: 'checkbox', checked: '' });
  modal({
    title: `Clonar “${p.name}”`,
    body: el('div', {},
      el('div', { class: 'row2' }, el('label', { class: 'fld' }, 'Quantidade de cópias', count)),
      el('label', { style: 'display:flex;gap:8px;align-items:center;margin-top:10px;color:var(--muted)' }, rnd, 'Randomizar fingerprint em cada cópia (recomendado)')),
    foot: [el('button', { class: 'ghost', onClick: closeModal }, 'Cancelar'),
      el('button', { class: 'primary', onClick: async () => { const n = Math.max(1, Math.min(50, parseInt(count.value) || 1)); await inv('profiles.clone', { id: p.id, count: n, randomize: rnd.checked }); closeModal(); toast(`${n} cópia(s) criada(s)`); } }, 'Clonar')],
  });
}

/* ============================== Cookies modal ============================== */
function openCookiesModal(p) {
  const area = el('textarea', { rows: '10', class: 'mono', placeholder: 'Cookies JSON…' });
  modal({
    title: `Cookies — ${p.name}`,
    body: el('div', {},
      el('p', { class: 'hint' }, 'Funciona com o perfil FECHADO — os cookies são injetados direto no navegador (cookies.sqlite) e valem na próxima abertura. Se estiver aberto em modo manual, feche antes. Formato: cookies do Playwright/Chrome.'),
      area),
    foot: [
      el('button', { class: 'ghost', onClick: async () => { toast('Lendo cookies…'); const r = await inv('profiles.exportCookies', { id: p.id }); if (!r.ok) return toast('Erro: ' + r.error); area.value = JSON.stringify(r.cookies, null, 2); toast(`${r.cookies.length} cookie(s) exportado(s)`); } }, '⬇ Exportar'),
      el('button', { class: 'primary', onClick: async () => { let parsed; try { parsed = JSON.parse(area.value); } catch (e) { return toast('JSON inválido'); } toast('Injetando cookies…'); const r = await inv('profiles.importCookies', { id: p.id, cookies: parsed }); toast(r.ok ? `✓ ${r.count} cookie(s) adicionados` : 'Erro: ' + r.error); } }, '⬆ Importar'),
    ],
  });
}

/* ============================== Trust score ============================== */
async function runTrust(p) {
  toast('🛡 Testando fingerprint…');
  try {
    const r = await inv('trust.run', { id: p.id });
    if (!r.ok) return toast('Erro: ' + (r.error || 'falhou'));
    const rows = r.checks.map((c) => el('div', { class: 'list-row' },
      el('span', { style: 'font-size:15px' }, c.ok ? '✅' : '❌'),
      el('span', { class: 'grow' }, c.name),
      c.detail ? el('span', { class: 'hint mono', style: 'max-width:230px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, c.detail) : null));
    modal({
      title: `Trust score — ${p.name}`,
      body: [
        el('div', { style: `font-size:34px;font-weight:800;text-align:center;color:${trustColor(r.score)}` }, `${r.score}/100`),
        el('p', { class: 'hint', style: 'text-align:center;margin-top:0' }, r.score >= 85 ? 'Excelente — sem sinais técnicos de automação.' : r.score >= 60 ? 'Bom, mas há pontos a melhorar.' : 'Atenção: sinais detectáveis encontrados.'),
        ...rows,
      ],
      foot: [el('button', { class: 'ghost', onClick: closeModal }, 'Fechar')],
    });
  } catch (e) { toast('Erro: ' + e.message); }
}

// Relatório da auditoria de detecção (bateria local + oráculos externos).
function openDetectReport(rep) {
  const coh = rep.coherence || { score: 0, checks: [], lies: [] };
  const oracleRows = (rep.oracles || []).map((o) => el('div', { class: 'list-row' },
    el('span', { style: 'font-size:15px' }, o.ok ? '🌐' : '⚪'),
    el('span', { class: 'grow' }, o.name + (o.verdict ? ' — ' + o.verdict : (o.ok ? '' : ' (indisponível)'))),
    typeof o.score === 'number' ? el('span', { style: `font-weight:700;color:${trustColor(o.score)}` }, o.score + '/100') : null));
  const failing = coh.checks.filter((c) => !c.ok);
  const cohRows = (failing.length ? failing : coh.checks.slice(0, 0)).map((c) => el('div', { class: 'list-row' },
    el('span', {}, c.lie ? '❌' : '⚠️'),
    el('span', { class: 'grow' }, c.name),
    c.detail ? el('span', { class: 'hint mono', style: 'max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, c.detail) : null));
  modal({
    title: 'Auditoria de detecção', wide: true,
    body: [
      el('div', { style: `font-size:34px;font-weight:800;text-align:center;color:${trustColor(rep.overall)}` }, `${rep.overall}/100`),
      el('p', { class: 'hint', style: 'text-align:center;margin-top:0' }, 'Nota geral = a PIOR entre a bateria local e os detectores externos.'),
      el('fieldset', {}, el('legend', {}, `Bateria local (coerência) — ${coh.score}/100 · ${coh.lies.length ? coh.lies.length + ' mentira(s)' : 'sem mentiras'}`),
        ...(failing.length ? cohRows : [el('p', { class: 'hint' }, 'Nenhuma contradição encontrada nos vetores locais. ✅')])),
      el('fieldset', {}, el('legend', {}, 'Detectores externos (oráculos)'),
        ...(oracleRows.length ? oracleRows : [el('p', { class: 'hint' }, 'Nenhum oráculo retornou.')]),
        el('p', { class: 'hint' }, 'Os detectores podem degradar em modo automático; rode com o perfil visível para o resultado mais fiel.')),
    ],
    foot: [el('button', { class: 'ghost', onClick: closeModal }, 'Fechar')],
  });
}

// Tooltip do selo 🍪 com o breakdown da maturidade (v2: 1st/3rd-party, persistente, TLDs).
function warmTooltip(w, hasReport) {
  const parts = [`Maturidade ${w.score}/100`, `${w.cookies} cookies`, `${w.domains} domínios`];
  if (typeof w.thirdParty === 'number') parts.push(`${w.thirdParty} cross-site`);
  if (typeof w.persistent === 'number') parts.push(`${w.persistent} persistentes`);
  if (typeof w.tlds === 'number') parts.push(`${w.tlds} TLDs`);
  parts.push(`${w.visited} etapas`);
  if (hasReport) parts.push('clique para o relatório');
  return parts.join(' · ');
}

// Relatório de aquecimento (maturidade v2 + jornada + consentimentos + domínios visitados).
function openWarmReport(rep) {
  if (!rep) return toast('Sem relatório de aquecimento ainda — aqueça o perfil primeiro.');
  const w = rep.warmth || {};
  const num = (v) => (typeof v === 'number' ? v : 0);
  const fmtSec = (ms) => (ms ? (ms / 1000).toFixed(0) + 's' : '—');
  const matRow = (label, val) => el('div', { class: 'list-row' }, el('span', { class: 'grow' }, label), el('span', { style: 'font-weight:700' }, String(val)));
  const steps = rep.steps || [];
  const stepRows = steps.map((s) => el('div', { class: 'list-row' },
    el('span', { style: 'font-size:15px' }, s.ok ? '✅' : '⚠️'),
    el('span', { class: 'grow' }, s.label),
    el('span', { class: 'hint mono' }, fmtSec(s.ms))));
  const doms = rep.visitedDomains || [];
  modal({
    title: 'Relatório de aquecimento', wide: true,
    body: [
      el('div', { style: `font-size:34px;font-weight:800;text-align:center;color:${trustColor(num(w.score))}` }, `${num(w.score)}/100`),
      el('p', { class: 'hint', style: 'text-align:center;margin-top:0' }, `${rep.locale || '—'} · nicho ${rep.niche || 'default'}${rep.durationMs ? ' · ' + fmtSec(rep.durationMs) : ''}`),
      el('fieldset', {}, el('legend', {}, 'Maturidade (v2)'),
        matRow('Cookies', num(w.cookies)),
        matRow('Domínios distintos', num(w.domains)),
        matRow('Cookies cross-site (3rd-party)', num(w.thirdParty)),
        matRow('Cookies persistentes', num(w.persistent)),
        matRow('Variedade de TLDs', num(w.tlds)),
        matRow('Storage local (localStorage / IndexedDB)', `${num(w.localStorage)} / ${num(w.indexedDB)}`)),
      el('fieldset', {}, el('legend', {}, `Jornada — ${steps.filter((s) => s.ok).length}/${steps.length} etapas · ${num(rep.consents)} consentimento(s)`),
        ...(stepRows.length ? stepRows : [el('p', { class: 'hint' }, 'Sem etapas registradas.')])),
      el('fieldset', {}, el('legend', {}, `Domínios visitados (${doms.length})`),
        el('p', { class: 'hint mono', style: 'word-break:break-all' }, doms.length ? doms.join(' · ') : 'nenhum')),
    ],
    foot: [el('button', { class: 'ghost', onClick: closeModal }, 'Fechar')],
  });
}

// Diálogo de aquecimento (Fase 3): escolhe intensidade (presets de tempo), meta de maturidade
// opcional e, em lote, quantos navegadores em paralelo (Fase 5). Dispara run/runMany.
function openWarmDialog(target) {
  const ids = target.ids || (target.id ? [target.id] : []);
  if (!ids.length) return;
  const many = ids.length > 1;
  let intensity = 'medio';
  const presets = [['leve', 'Leve · ~2 min'], ['medio', 'Médio · ~4 min'], ['profundo', 'Profundo · ~9 min']];
  const btns = {};
  const segRow = el('div', { style: 'display:flex;gap:6px;margin-top:4px' });
  presets.forEach(([k, lbl]) => {
    const b = el('button', { class: 'sm' + (k === intensity ? ' primary' : ''), onClick: () => { intensity = k; Object.keys(btns).forEach((kk) => { btns[kk].className = 'sm' + (kk === k ? ' primary' : ''); }); } }, lbl);
    btns[k] = b; segRow.append(b);
  });
  const useTarget = el('input', { type: 'checkbox' });
  const targetNum = el('input', { type: 'number', value: '70', min: '10', max: '100', style: 'width:74px' });
  const concNum = el('input', { type: 'number', value: '1', min: '1', max: '3', style: 'width:74px' });
  modal({
    title: many ? `Aquecer ${ids.length} perfis` : 'Aquecer perfil',
    body: [
      el('label', { class: 'hint' }, 'Intensidade'),
      segRow,
      el('label', { style: 'display:flex;gap:8px;align-items:center;margin-top:12px' }, useTarget, el('span', {}, 'Aquecer até a maturidade atingir'), targetNum, el('span', { class: 'hint' }, '/100 (ou o teto de tempo)')),
      many ? el('label', { style: 'display:flex;gap:8px;align-items:center;margin-top:12px' }, el('span', {}, 'Navegadores em paralelo (1–3):'), concNum) : null,
      el('p', { class: 'hint', style: 'margin-top:12px' }, 'O aquecimento sempre termina dentro do teto de tempo e fecha o navegador ao concluir.'),
    ],
    foot: [
      el('button', { class: 'ghost', onClick: closeModal }, 'Cancelar'),
      el('button', { class: 'primary', onClick: () => {
        const targetScore = useTarget.checked ? Math.max(10, Math.min(100, Number(targetNum.value) || 70)) : null;
        if (many) inv('cookieRobot.runMany', { ids, intensity, targetScore, concurrency: Math.max(1, Math.min(3, Number(concNum.value) || 1)) });
        else inv('cookieRobot.run', { id: ids[0], intensity, targetScore });
        closeModal();
        toast('🍪 Aquecimento iniciado…');
      } }, 'Aquecer'),
    ],
  });
}

/* ============================== Motor (1ª execução) ============================== */
function renderEngineDownload() {
  let ov = $('#engine');
  if (!ov) { ov = el('div', { id: 'engine', class: 'lock' }); document.body.appendChild(ov); }
  ov.innerHTML = '';
  const status = el('div', { class: 'hint mono', style: 'min-height:18px;margin-top:10px;word-break:break-all' });
  const btn = el('button', { class: 'primary', style: 'width:100%;margin-top:12px;justify-content:center', onClick: () => { btn.disabled = true; btn.textContent = 'Baixando…'; status.textContent = 'iniciando…'; inv('engine.download'); } }, 'Baixar navegador (≈530 MB)');
  ov.append(el('div', { class: 'lock-card' },
    el('div', { class: 'lock-logo', html: RHINO_SVG }),
    el('h2', { style: 'margin:6px 0 2px' }, 'RinoMask'),
    el('p', { class: 'hint', style: 'margin:0 0 4px' }, 'Primeira execução: baixar o motor de navegação (Camoufox). Só uma vez.'),
    btn, status));
  ov.style.display = 'flex';
  ov._status = status; ov._btn = btn;
}

/* ============================== Vault / Segurança ============================== */
function renderLock() {
  let lock = $('#lock');
  if (!lock) { lock = el('div', { id: 'lock', class: 'lock' }); document.body.appendChild(lock); }
  lock.innerHTML = '';
  const pw = el('input', { type: 'password', placeholder: 'Senha-mestra', onKeydown: (e) => { if (e.key === 'Enter') tryUnlock(); } });
  const err = el('div', { class: 'result-fail', style: 'min-height:16px' });
  const logo = el('div', { class: 'lock-logo', html: RHINO_SVG });
  lock.append(el('div', { class: 'lock-card' },
    logo,
    el('h2', { style: 'margin:6px 0 2px' }, 'RinoMask'),
    el('p', { class: 'hint', style: 'margin:0 0 14px' }, 'Digite a senha-mestra para desbloquear seus perfis.'),
    pw,
    el('button', { class: 'primary', style: 'width:100%;margin-top:10px;justify-content:center', onClick: tryUnlock }, 'Desbloquear'),
    err));
  lock.style.display = 'flex';
  setTimeout(() => pw.focus(), 60);
  async function tryUnlock() {
    err.textContent = '';
    const r = await inv('vault.unlock', { password: pw.value });
    if (r.ok) { lock.style.display = 'none'; await loadMeta(); await refresh(); }
    else { err.textContent = r.error || 'Senha incorreta'; pw.select(); }
  }
}

async function openSecurityModal() {
  const vs = await inv('vault.status');
  if (!vs.hasVault) {
    const p1 = el('input', { type: 'password', placeholder: 'Nova senha-mestra (mín. 4)' });
    const p2 = el('input', { type: 'password', placeholder: 'Confirmar senha' });
    modal({
      title: 'Segurança — senha-mestra',
      body: [
        el('p', { class: 'hint' }, 'Define uma senha-mestra e criptografa (AES-256-GCM) cookies, proxies e fingerprints em repouso. Será pedida a cada abertura. Sem ela, ninguém com acesso ao disco lê seus dados.'),
        el('label', { class: 'fld' }, 'Nova senha', p1),
        el('label', { class: 'fld' }, 'Confirmar', p2),
      ],
      foot: [
        el('button', { class: 'ghost', onClick: closeModal }, 'Cancelar'),
        el('button', { class: 'primary', onClick: async () => { if (p1.value !== p2.value) return toast('As senhas não conferem'); const r = await inv('vault.setPassword', { password: p1.value }); if (r.ok) { closeModal(); toast('🔒 Criptografia ativada'); } else toast(r.error); } }, 'Ativar criptografia'),
      ],
    });
  } else {
    const oldp = el('input', { type: 'password', placeholder: 'Senha atual' });
    const newp = el('input', { type: 'password', placeholder: 'Nova senha' });
    modal({
      title: 'Segurança',
      body: [
        el('p', { class: 'hint' }, '🔒 Criptografia ATIVA. Troque a senha, remova a criptografia ou trave agora.'),
        el('div', { class: 'row2' }, el('label', { class: 'fld' }, 'Senha atual', oldp), el('label', { class: 'fld' }, 'Nova senha', newp)),
      ],
      foot: [
        el('button', { class: 'danger', onClick: async () => { const r = await inv('vault.removePassword', { password: oldp.value }); if (r.ok) { closeModal(); toast('Criptografia removida'); } else toast(r.error); } }, 'Remover'),
        el('button', { class: 'ghost', onClick: async () => { await inv('vault.lock'); closeModal(); renderLock(); } }, '🔒 Travar agora'),
        el('button', { class: 'primary', onClick: async () => { const r = await inv('vault.changePassword', { oldPassword: oldp.value, newPassword: newp.value }); if (r.ok) { closeModal(); toast('Senha alterada'); } else toast(r.error); } }, 'Trocar senha'),
      ],
    });
  }
}

/* ============================== Profile editor ============================== */
async function openEditor(profile) {
  const isNew = !profile;
  let fp = profile ? JSON.parse(JSON.stringify(profile.fingerprint)) : await inv('meta.fingerprintPreview', {});
  if (!fp.geolocation) fp.geolocation = { mode: 'auto', lat: 0, lon: 0, accuracy: 50 };
  // defaults dos controles avançados
  if (typeof fp.humanize !== 'boolean') fp.humanize = true;
  if (!fp.screenRes) fp.screenRes = '';
  if (!fp.cpu) fp.cpu = 0;
  if (!fp.timezoneMode) fp.timezoneMode = 'auto';
  fp.blockImages = !!fp.blockImages;
  fp.doNotTrack = !!fp.doNotTrack;
  const prevScreenRes = fp.screenRes || '';
  const selTags = new Set(profile ? profile.tags : []);

  // --- Geral ---
  const fName = el('input', { value: profile ? profile.name : '' });
  const fStatus = el('select', {}, ...state.meta.statuses.map((s) => el('option', { value: s.id }, s.name)));
  fStatus.value = profile ? profile.status : 'new';
  const fFolder = el('select', {}, el('option', { value: '' }, '— Sem pasta —'), ...state.meta.folders.map((f) => el('option', { value: f.id }, f.name)));
  fFolder.value = profile && profile.folderId ? profile.folderId : '';
  const fSite = el('select', {}, ...SITES.map((s) => el('option', { value: s.v }, s.t)));
  fSite.value = profile && profile.mainWebsite ? profile.mainWebsite : '';
  const fUrl = el('input', { value: profile ? profile.startUrl || '' : '', placeholder: 'https://… (opcional)' });
  const fNotes = el('textarea', { rows: '2', placeholder: 'Observações' }, profile ? profile.notes || '' : '');
  const tagsWrap = el('div', { class: 'taglist' });
  const drawTags = () => {
    tagsWrap.innerHTML = '';
    state.meta.tags.forEach((t) => tagsWrap.append(el('span', { class: 'pick' + (selTags.has(t.id) ? ' on' : ''), style: selTags.has(t.id) ? `border-color:${t.color}` : '', onClick: () => { selTags.has(t.id) ? selTags.delete(t.id) : selTags.add(t.id); drawTags(); } }, t.name)));
    if (!state.meta.tags.length) tagsWrap.append(el('span', { class: 'hint' }, 'Crie tags na barra lateral.'));
  };
  drawTags();

  // --- Foto do perfil (avatar) ---
  let avatarData = profile ? (profile.avatar || '') : '';
  const avPreview = el('div', { class: 'avatar-edit-img' });
  const drawAvatar = () => {
    avPreview.innerHTML = '';
    if (avatarData) avPreview.append(el('img', { src: avatarData, alt: '' }));
    else avPreview.append(el('span', {}, initials(fName.value) || '?'));
  };
  const avFile = el('input', { type: 'file', accept: 'image/*', style: 'display:none' });
  avFile.addEventListener('change', async () => {
    const f = avFile.files && avFile.files[0];
    avFile.value = '';
    if (!f) return;
    const data = await openAvatarCropper(f); // abre o recortador (zoom/posição)
    if (data) { avatarData = data; drawAvatar(); }
  });
  const avPick = el('button', { class: 'sm', type: 'button', onClick: () => avFile.click() }, svg('plus', 14), 'Escolher foto');
  const avClear = el('button', { class: 'sm', type: 'button', onClick: () => { avatarData = ''; drawAvatar(); } }, 'Remover');
  fName.addEventListener('input', () => { if (!avatarData) drawAvatar(); });
  drawAvatar();
  const avatarRow = el('div', { class: 'avatar-edit' }, avPreview,
    el('div', { class: 'avatar-edit-actions' }, el('div', { class: 'row2', style: 'gap:8px' }, avPick, avClear),
      el('div', { class: 'hint' }, 'PNG ou JPG — aparece na lista de perfis. Redimensionada automaticamente.')),
    avFile);

  const paneGeral = el('div', { class: 'tabpane active' },
    avatarRow,
    el('label', { class: 'fld' }, 'Nome do perfil', fName),
    el('div', { class: 'row2' }, el('label', { class: 'fld' }, 'Status', fStatus), el('label', { class: 'fld' }, 'Pasta', fFolder)),
    el('div', { class: 'row2' }, el('label', { class: 'fld' }, 'Site principal', fSite), el('label', { class: 'fld' }, 'URL inicial', fUrl)),
    el('label', { class: 'fld' }, 'Tags', tagsWrap),
    el('label', { class: 'fld' }, 'Notas', fNotes));

  // --- Fingerprint ---
  const fOs = el('select', {}, ...state.meta.osList.map((o) => el('option', { value: o }, o)));
  fOs.value = fp.os;
  const fRegion = el('select', {}, ...state.meta.regions.map((r) => el('option', { value: r.timezone }, `${r.locale} · ${r.timezone}`)));
  fRegion.value = fp.timezone;
  // --- Fingerprint (modelo Camoufox/Firefox — vetores gerados nativamente pelo BrowserForge) ---
  if (fp.webrtcMode !== 'disabled') fp.webrtcMode = 'auto';
  const tWebrtc = seg(['auto', 'disabled'], fp.webrtcMode, (v) => { fp.webrtcMode = v; });

  // Trocar a região define idioma/fuso (usados quando não há proxy).
  fRegion.addEventListener('change', () => {
    const r = state.meta.regions.find((x) => x.timezone === fRegion.value);
    if (!r) return;
    fp.locale = r.locale;
    if (r.languages) fp.languages = r.languages.slice();
    fp.timezone = r.timezone;
    if (typeof r.offset === 'number') fp.timezoneOffset = r.offset;
  });

  // Resumo somente-leitura da identidade gerada (BrowserForge, nativa).
  const idBox = el('div', { class: 'idbox mono' });
  const drawId = () => {
    idBox.innerHTML = '';
    const bf = fp.bf;
    const lines = bf ? [
      `UA: ${(bf.navigator && bf.navigator.userAgent) || fp.userAgent || '—'}`,
      `Plataforma: ${(bf.navigator && bf.navigator.platform) || fp.platform || '—'}  ·  CPU: ${(bf.navigator && bf.navigator.hardwareConcurrency) || '—'} núcleos`,
      `Tela: ${(bf.screen && bf.screen.width) || '—'} × ${(bf.screen && bf.screen.height) || '—'}`,
      `GPU: ${(bf.videoCard && bf.videoCard.renderer) || (fp.stable ? 'gerada' : '—')}`,
    ] : ['Será gerada automaticamente (BrowserForge) na 1ª abertura — coerente e estável.'];
    lines.forEach((l) => idBox.append(el('div', {}, l)));
  };
  drawId();
  let regenerate = false;
  const regen = el('button', { class: 'sm', onClick: () => { regenerate = true; idBox.innerHTML = ''; idBox.append(el('div', {}, '🎲 Nova identidade será gerada ao salvar.')); toast('Identidade será regenerada'); } }, svg('restore', 14), 'Regenerar identidade');

  // --- Avançado: ajuste fino de cada vetor (opcional; sobrescreve a geração automática) ---
  const RES = ['', '1920x1080', '1366x768', '1536x864', '1440x900', '1600x900', '1280x720', '2560x1440', '3840x2160'];
  const fRes = el('select', {}, ...RES.map((r) => el('option', { value: r }, r || 'Automática (recomendado)')));
  fRes.value = fp.screenRes || '';
  fRes.addEventListener('change', () => { fp.screenRes = fRes.value; drawId(); });

  const CPUS = [0, 2, 4, 6, 8, 12, 16];
  const fCpu = el('select', {}, ...CPUS.map((c) => el('option', { value: String(c) }, c ? c + ' núcleos' : 'Automático (recomendado)')));
  fCpu.value = String(fp.cpu || 0);
  fCpu.addEventListener('change', () => { fp.cpu = Number(fCpu.value); });

  const gLat = el('input', { type: 'number', step: 'any', value: fp.geolocation.lat || '', placeholder: 'latitude' });
  const gLon = el('input', { type: 'number', step: 'any', value: fp.geolocation.lon || '', placeholder: 'longitude' });
  const gAcc = el('input', { type: 'number', value: fp.geolocation.accuracy || 50, placeholder: 'm', style: 'max-width:110px' });
  gLat.addEventListener('input', () => { fp.geolocation.lat = parseFloat(gLat.value) || 0; });
  gLon.addEventListener('input', () => { fp.geolocation.lon = parseFloat(gLon.value) || 0; });
  gAcc.addEventListener('input', () => { fp.geolocation.accuracy = parseInt(gAcc.value, 10) || 50; });
  const geoBox = el('div', { class: 'row2', style: fp.geolocation.mode === 'manual' ? '' : 'display:none' },
    el('label', { class: 'fld' }, 'Latitude', gLat),
    el('label', { class: 'fld' }, 'Longitude', gLon),
    el('label', { class: 'fld', style: 'flex:0 0 110px' }, 'Precisão (m)', gAcc));
  const fGeo = seg(['auto', 'manual', 'off'], fp.geolocation.mode || 'auto', (v) => { fp.geolocation.mode = v; geoBox.style.display = v === 'manual' ? '' : 'none'; });

  const chk = (label, checked, onChange) => {
    const c = el('input', { type: 'checkbox' }); c.checked = !!checked;
    c.addEventListener('change', () => onChange(c.checked));
    return el('label', { style: 'display:flex;gap:8px;align-items:center;margin:7px 0;color:var(--muted)' }, c, label);
  };
  const adv = el('details', { class: 'adv', style: 'margin-top:6px' },
    el('summary', { style: 'cursor:pointer;color:var(--text);font-weight:600;margin-bottom:8px' }, '⚙ Configuração avançada (opcional)'),
    el('p', { class: 'hint' }, 'Estes valores sobrescrevem a geração automática (BrowserForge). Use só quando precisar de controle fino — a identidade gerada já é coerente e estável.'),
    el('div', { class: 'row2' },
      el('label', { class: 'fld' }, 'Resolução de tela', fRes),
      el('label', { class: 'fld' }, 'CPU (núcleos)', fCpu)),
    el('label', { class: 'fld' }, 'Geolocalização  (auto = do proxy · manual = coordenadas · off = bloqueada)', fGeo),
    geoBox,
    chk('Forçar fuso/idioma da região acima mesmo com proxy (pode reduzir a coerência geo)', fp.timezoneMode === 'manual', (v) => { fp.timezoneMode = v ? 'manual' : 'auto'; }),
    chk('Cursor e digitação humanizados nas automações', fp.humanize !== false, (v) => { fp.humanize = v; }),
    chk('Bloquear imagens (carrega mais rápido, gasta menos dados)', fp.blockImages, (v) => { fp.blockImages = v; }),
    chk('Enviar cabeçalho "Do Not Track"', fp.doNotTrack, (v) => { fp.doNotTrack = v; }));

  const paneFp = el('div', { class: 'tabpane' },
    el('div', { class: 'row2' },
      el('label', { class: 'fld' }, 'Sistema', fOs),
      el('label', { class: 'fld' }, 'Idioma / Região', fRegion)),
    el('p', { class: 'hint' }, 'Com um proxy atribuído, o fuso, idioma, geolocalização e WebRTC são derivados automaticamente do IP do proxy. Sem proxy, usa o idioma/região acima.'),
    el('label', { class: 'fld' }, 'WebRTC  (auto = mascara pelo proxy · disabled = bloqueia)', tWebrtc),
    adv,
    el('fieldset', {}, el('legend', {}, 'Identidade gerada — nativa (Camoufox), estável por perfil'),
      idBox,
      el('div', { style: 'margin-top:10px' }, regen)));

  // --- Proxy ---
  const pMode = seg(['library', 'manual', 'none'], profile && profile.proxyId ? 'library' : (profile && profile.proxy ? 'manual' : 'none'), (v) => updateProxyPane(v));
  const pLib = el('select', {}, el('option', { value: '' }, '— escolher —'), ...state.meta.proxies.map((px) => el('option', { value: px.id }, `${px.name} (${px.type})`)));
  if (profile && profile.proxyId) pLib.value = profile.proxyId;
  const pType = el('select', {}, ...['http', 'https', 'socks5', 'socks4'].map((t) => el('option', { value: t }, t.toUpperCase())));
  const pHost = el('input', { placeholder: 'host' });
  const pPort = el('input', { type: 'number', placeholder: 'porta', style: 'max-width:90px' });
  const pUser = el('input', { placeholder: 'usuário' });
  const pPass = el('input', { type: 'password', placeholder: 'senha' });
  if (profile && profile.proxy) { pType.value = profile.proxy.type; pHost.value = profile.proxy.host; pPort.value = profile.proxy.port; pUser.value = profile.proxy.username || ''; pPass.value = profile.proxy.password || ''; }
  const pResult = el('span', { class: 'hint' });
  const libBox = el('label', { class: 'fld' }, 'Proxy da biblioteca', pLib);
  const manBox = el('div', {},
    el('div', { class: 'row2' }, el('label', { class: 'fld', style: 'flex:0 0 110px' }, 'Tipo', pType), el('label', { class: 'fld' }, 'Host', pHost), el('label', { class: 'fld', style: 'flex:0 0 90px' }, 'Porta', pPort)),
    el('div', { class: 'row2' }, el('label', { class: 'fld' }, 'Usuário', pUser), el('label', { class: 'fld' }, 'Senha', pPass)),
    el('div', { class: 'row2' }, el('button', { class: 'sm', onClick: async () => { pResult.textContent = 'testando…'; const r = await inv('proxies.test', { type: pType.value, host: pHost.value, port: pPort.value, username: pUser.value, password: pPass.value }); pResult.textContent = r.ok ? `✓ IP ${r.ip} (${r.latencyMs}ms)` : '✗ ' + r.error; pResult.className = r.ok ? 'result-ok' : 'result-fail'; } }, 'Testar'), pResult));
  const paneProxy = el('div', { class: 'tabpane' }, el('label', { class: 'fld' }, 'Origem do proxy', pMode), libBox, manBox);
  function updateProxyPane(v) {
    libBox.style.display = v === 'library' ? '' : 'none';
    manBox.style.display = v === 'manual' ? '' : 'none';
  }
  paneProxy._mode = () => [...pMode.querySelectorAll('button')].find((b) => b.classList.contains('on'))?.dataset.v;

  // --- Tabs shell ---
  const panes = [paneGeral, paneFp, paneProxy];
  const tabs = ['Geral', 'Fingerprint', 'Proxy'].map((t, i) => el('div', { class: 'tab' + (i === 0 ? ' active' : ''), onClick: () => { tabsEls.forEach((x) => x.classList.remove('active')); tabsEls[i].classList.add('active'); panes.forEach((p) => p.classList.remove('active')); panes[i].classList.add('active'); } }, t));
  const tabsEls = tabs;
  updateProxyPane(paneProxy._mode());

  modal({
    title: isNew ? 'Novo perfil' : `Editar — ${profile.name}`, wide: true,
    body: [el('div', { class: 'tabs' }, ...tabs), ...panes],
    foot: [el('button', { class: 'ghost', onClick: closeModal }, 'Cancelar'),
      el('button', { class: 'primary', onClick: save }, isNew ? 'Criar perfil' : 'Salvar')],
  });

  async function save() {
    if (!fName.value.trim()) return toast('Informe um nome');
    const prevOs = fp.os;
    fp.os = fOs.value;
    // aplica a região selecionada (locale/fuso) — usada quando não há proxy.
    const reg = state.meta.regions.find((x) => x.timezone === fRegion.value);
    if (reg) {
      fp.locale = reg.locale;
      fp.timezone = reg.timezone;
      if (typeof reg.offset === 'number') fp.timezoneOffset = reg.offset;
      if (reg.languages) fp.languages = reg.languages.slice();
    }
    // Mudar o SO, a resolução ou pedir regenerar descarta a identidade nativa → gera nova na próxima abertura.
    if (regenerate || fp.os !== prevOs || (fp.screenRes || '') !== prevScreenRes) { delete fp.bf; delete fp.stable; }

    const mode = paneProxy._mode();
    let proxyRef = { proxyId: null, proxy: null };
    if (mode === 'library' && pLib.value) proxyRef = { proxyId: pLib.value };
    else if (mode === 'manual' && pHost.value) proxyRef = { proxy: { type: pType.value, host: pHost.value, port: pPort.value, username: pUser.value, password: pPass.value } };

    const common = {
      name: fName.value.trim(), notes: fNotes.value, avatar: avatarData || null,
      status: fStatus.value,
      folderId: fFolder.value || null, mainWebsite: fSite.value || null,
      startUrl: fUrl.value.trim(), tags: [...selTags], fingerprint: fp,
    };

    if (isNew) {
      await inv('profiles.create', { ...common, ...proxyRef, os: fp.os, region: fRegion.value });
    } else {
      await inv('profiles.update', { id: profile.id, patch: { ...common, ...proxyRef } });
    }
    closeModal();
    toast('Salvo');
  }
}

// segmented control helper
function seg(values, current, onPick) {
  const wrap = el('div', { class: 'seg' });
  values.forEach((v) => {
    const b = el('button', { class: current === v ? 'on' : '', dataset: { v }, onClick: (e) => { e.preventDefault(); wrap.querySelectorAll('button').forEach((x) => x.classList.remove('on')); b.classList.add('on'); onPick(v); } }, v);
    wrap.append(b);
  });
  return wrap;
}

/* ============================== Wire up ============================== */
// Perfil rápido: cria na hora um perfil com fingerprint 100% aleatória e coerente
// (OS, GPU, fuso/idioma, CPU/RAM combinam entre si — nada contraditório).
async function quickCreate() {
  state.view = 'all';
  state.filterStatus = '';
  state.filterTag = '';
  $('#search').value = '';
  state.search = '';
  try {
    const p = await inv('profiles.create', {});
    toast(`⚡ Perfil criado: ${p.name} — ${p.fingerprint.os} · ${p.fingerprint.locale} · ${p.fingerprint.screen.width}×${p.fingerprint.screen.height}`);
  } catch (e) {
    toast('Erro ao criar: ' + e.message);
  }
}

$('#btn-quick').addEventListener('click', quickCreate);
$('#btn-new').addEventListener('click', () => openEditor(null));
$('#btn-sync').addEventListener('click', () => { const ids = [...state.selected]; if (ids.length < 2) return toast('Selecione 2+ perfis para sincronizar'); startSync(ids); });
$('#search').addEventListener('input', (e) => { state.search = e.target.value; renderTable(); });
$('#filter-status').addEventListener('change', (e) => { state.filterStatus = e.target.value; renderTable(); });
$('#filter-tag').addEventListener('change', (e) => { state.filterTag = e.target.value; renderTable(); });
$('#check-all').addEventListener('change', (e) => { const list = visibleProfiles(); if (e.target.checked) list.forEach((p) => state.selected.add(p.id)); else list.forEach((p) => state.selected.delete(p.id)); render(); });

window.api.onChanged(async () => { await loadMeta(); await refresh(); });
window.api.onEvent((e) => {
  if (!e) return;
  if (e.type === 'warm:start') toast('🍪 Aquecendo perfil…');
  else if (e.type === 'warm:progress') toast(`Aquecendo (${(e.index || 0) + 1}/${e.total})…`);
  else if (e.type === 'warm:done') { toast(e.error ? ('Aquecimento: ' + e.error) : `✓ Aquecimento concluído${e.visited ? ' — ' + e.visited + ' etapas' : ''}${typeof e.warmth === 'number' ? ' · maturidade ' + e.warmth + '/100' : ''}`); if (!e.error && e.report) openWarmReport(e.report); }
  else if (e.type === 'detect:start') toast('🔎 Auditando detecção…');
  else if (e.type === 'detect:progress') toast(e.oracle ? `Consultando ${e.oracle}…` : 'Analisando coerência local…');
  else if (e.type === 'detect:done') { if (e.error) toast('Auditoria: ' + e.error); else { toast(`✓ Auditoria concluída — nota geral ${e.overall}/100`); if (e.report) openDetectReport(e.report); } }
  else if (e.type === 'engine:progress') { const ov = $('#engine'); if (ov && ov._status) ov._status.textContent = e.line || 'baixando…'; }
  else if (e.type === 'engine:done') {
    const ov = $('#engine');
    if (e.ok) { if (ov) ov.style.display = 'none'; boot(); }
    else if (ov && ov._btn) { ov._btn.disabled = false; ov._btn.textContent = 'Tentar novamente'; if (ov._status) ov._status.textContent = 'Falha no download — verifique a internet.'; }
  }
});

/* ============================== Log de erros (diagnóstico) ============================== */
// Erros do renderer são registrados no log persistente (main) para correção futura.
function reportError(where, message, stack, context) {
  try { window.api.invoke('errors.report', { where, message: String(message || 'erro'), stack: stack ? String(stack) : undefined, context }); } catch (e) {}
}
window.addEventListener('error', (ev) => {
  reportError('window.onerror', ev.message, ev.error && ev.error.stack, { src: ev.filename, line: ev.lineno, col: ev.colno });
  toast('⚠ Ocorreu um erro — registrado no Diagnóstico');
});
window.addEventListener('unhandledrejection', (ev) => {
  const r = ev && ev.reason;
  reportError('unhandledrejection', (r && r.message) || String(r), r && r.stack);
});

async function openErrorLog() {
  const list = await inv('errors.recent', { n: 200 });
  const body = el('div', {});
  if (!Array.isArray(list) || !list.length) {
    body.append(el('p', { class: 'hint' }, 'Nenhum erro registrado até agora. 🎉'));
  } else {
    body.append(el('p', { class: 'hint' }, `${list.length} evento(s) — mais recentes no topo. Salvo automaticamente em disco (errors.log) para correções futuras.`));
    const box = el('div', { class: 'idbox mono', style: 'max-height:52vh;overflow:auto' });
    list.forEach((e) => {
      const when = String(e.ts || '').replace('T', ' ').slice(0, 19);
      box.append(el('div', { style: 'padding:7px 0;border-bottom:1px solid var(--border)' },
        el('div', { style: 'color:var(--amber,#f59e0b)' }, `[${when}] ${e.source || 'app'}`),
        el('div', {}, e.message || ''),
        e.context ? el('div', { style: 'color:var(--muted);font-size:11px' }, 'ctx: ' + e.context) : null,
        e.stack ? el('pre', { style: 'white-space:pre-wrap;color:var(--muted);font-size:11px;margin:4px 0 0' }, e.stack) : null));
    });
    body.append(box);
  }
  modal({
    title: 'Diagnóstico — log de erros', wide: true,
    body: [body],
    foot: [
      el('button', { class: 'ghost', onClick: async () => { await inv('errors.openFolder'); } }, 'Abrir pasta do log'),
      el('button', { class: 'ghost', onClick: async () => { await inv('errors.clear'); openErrorLog(); toast('Log limpo'); } }, 'Limpar'),
      el('button', { class: 'primary', onClick: closeModal }, 'Fechar'),
    ],
  });
}

// Aviso de atualização (compara a versão local com a publicada no GitHub).
async function checkForUpdates() {
  try {
    const r = await inv('update.check');
    if (r && r.updateAvailable) showUpdateBar(r.latest, r.current);
  } catch (e) { /* silencioso: sem internet, etc. */ }
}
function showUpdateBar(latest, current) {
  if ($('#updatebar')) return;
  const bar = el('div', { id: 'updatebar', class: 'updatebar' },
    svg('alert', 16),
    el('span', {}, `Atualização disponível: versão ${latest}` + (current ? ` (você está na ${current})` : '') + '.'),
    el('button', { class: 'sm primary', onClick: () => inv('update.open') }, 'Baixar'),
    el('button', { class: 'sm ghost', onClick: () => bar.remove() }, 'Depois'));
  document.body.appendChild(bar);
}

async function boot() {
  const eng = await inv('engine.status');
  if (eng && !eng.installed) { renderEngineDownload(); return; }
  const vs = await inv('vault.status');
  if (vs && vs.locked) { renderLock(); return; }
  await loadMeta();
  await refresh();
  checkForUpdates();
}
boot();
