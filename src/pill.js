'use strict';

// Injeta no camoufox.cfg (autoconfig do motor) o bloco da pílula com o nome do perfil
// (src/pill/pill.cfg.js). Mesmo molde do branding.js: best-effort e idempotente — se o
// bloco já está na versão atual, não mexe; se mudou (ou o motor foi rebaixado e perdeu
// o bloco), troca/reaplica. Qualquer falha é registrada e ignorada.

const fs = require('fs');
const path = require('path');

const BLOCK_PATH = path.join(__dirname, 'pill', 'pill.cfg.js');
// No Firefox de release o autoconfig roda em sandbox (só pref()/defaultPref(), sem acesso à
// interface) — o bloco da pílula sairia em silêncio. Este pref, lido de defaults/pref/ ANTES do
// cfg, libera o contexto privilegiado (mesma técnica do fx-autoconfig). Não afeta as páginas.
const SANDBOX_PREF_FILE = 'rinomask-autoconfig.js';
const SANDBOX_PREF = '// RinoMask: libera o autoconfig (camoufox.cfg) para rodar o bloco da pilula do perfil.\npref("general.config.sandbox_enabled", false);\n';
const BLOCK_RE = /\n*\/\/ >>> RINOMASK PILL[^\n]*\n[\s\S]*?\/\/ <<< RINOMASK PILL[^\n]*\n?/;

// Puro (testável): devolve o cfg com exatamente um bloco da pílula, no fim.
function injectBlock(cfgText, block) {
  const base = String(cfgText).replace(BLOCK_RE, '\n').replace(/\s*$/, '\n');
  return base + '\n' + block.replace(/\s*$/, '\n');
}

async function enginePath() {
  try { const pk = await import('camoufox-js/dist/pkgman.js'); return pk.launchPath(); } catch (e) { return null; }
}

async function applyPill(log, { cfgPath } = {}) {
  let target = cfgPath;
  if (!target) {
    const exe = await enginePath();
    if (!exe) return { ok: false, skipped: 'motor ausente' };
    target = path.join(path.dirname(exe), 'camoufox.cfg');
  }
  try {
    if (!fs.existsSync(target)) return { ok: false, skipped: 'camoufox.cfg ausente' };
    const prefDir = path.join(path.dirname(target), 'defaults', 'pref');
    const prefFile = path.join(prefDir, SANDBOX_PREF_FILE);
    const prefOk = fs.existsSync(prefFile) && fs.readFileSync(prefFile, 'utf8') === SANDBOX_PREF;
    if (!prefOk) { fs.mkdirSync(prefDir, { recursive: true }); fs.writeFileSync(prefFile, SANDBOX_PREF); }

    const block = fs.readFileSync(BLOCK_PATH, 'utf8');
    const current = fs.readFileSync(target, 'utf8');
    const next = injectBlock(current, block);
    if (next === current && prefOk) return { ok: true, already: true };
    if (next !== current) fs.writeFileSync(target, next);
    return { ok: true };
  } catch (e) {
    if (log) log({ source: 'pill', message: 'não foi possível instalar a pílula do perfil no camoufox.cfg: ' + e.message });
    return { ok: false };
  }
}

module.exports = { applyPill, injectBlock };
