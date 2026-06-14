'use strict';

// Sincronizador: abre varios perfis e espelha as acoes do perfil MESTRE
// (clique, rolagem, digitacao) nos demais. Tambem permite enviar todos para uma URL.
const launcher = require('./browserLauncher');

const state = { active: false, masterId: null, slaveIds: [] };

// Captura eventos no perfil mestre e os envia ao processo principal via binding.
function attachSyncCapture() {
  if (window.__antySyncAttached) return;
  window.__antySyncAttached = true;
  const send = (d) => { try { window.__antySync(d); } catch (e) {} };
  document.addEventListener('click', (e) => {
    send({ type: 'click', x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight });
  }, true);
  let st;
  window.addEventListener('scroll', () => {
    clearTimeout(st);
    st = setTimeout(() => send({ type: 'scroll', x: window.scrollX, y: window.scrollY }), 40);
  }, true);
  document.addEventListener('keydown', (e) => {
    send({ type: 'key', key: e.key });
  }, true);
}

const SPECIAL = new Set(['Enter', 'Backspace', 'Tab', 'Delete', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End']);

async function handle(payload) {
  if (!state.active) return;
  for (const sid of state.slaveIds) {
    const page = await launcher.getPage(sid);
    if (!page) continue;
    try {
      if (payload.type === 'click') {
        const d = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
        await page.mouse.click(payload.x * d.w, payload.y * d.h);
      } else if (payload.type === 'scroll') {
        await page.evaluate(({ x, y }) => window.scrollTo(x, y), payload);
      } else if (payload.type === 'key') {
        if (payload.key.length === 1) await page.keyboard.type(payload.key);
        else if (SPECIAL.has(payload.key)) await page.keyboard.press(payload.key);
      }
    } catch (e) {}
  }
}

async function start(ids) {
  const sel = (ids || []).filter((id) => launcher.kindOf(id) === 'pw');
  if (sel.length < 2) return { ok: false, error: 'Abra pelo menos 2 perfis antes de sincronizar.' };
  state.masterId = sel[0];
  state.slaveIds = sel.slice(1);
  state.active = true;
  const ctx = launcher.getContext(state.masterId);
  try { await ctx.exposeBinding('__antySync', (src, payload) => handle(payload)); } catch (e) {}
  await ctx.addInitScript(attachSyncCapture);
  for (const p of ctx.pages()) await p.evaluate(attachSyncCapture).catch(() => {});
  return { ok: true, masterId: state.masterId, slaves: state.slaveIds.length };
}

function stop() {
  state.active = false;
  state.masterId = null;
  state.slaveIds = [];
  return { ok: true };
}

async function navigate(url) {
  if (!url) return { ok: false, error: 'URL vazia' };
  const ids = [state.masterId, ...state.slaveIds].filter(Boolean);
  for (const id of ids) {
    const page = await launcher.getPage(id);
    if (page) page.goto(url).catch(() => {});
  }
  return { ok: true };
}

function status() {
  return { active: state.active, masterId: state.masterId, slaveIds: state.slaveIds };
}

module.exports = { start, stop, navigate, status };
