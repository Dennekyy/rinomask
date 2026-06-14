'use strict';

// Log automático de erros (persistente em disco) para correções futuras.
// Formato JSONL (1 evento por linha) em <userData>/errors.log, com rotação por tamanho.
// Regra de ouro: registrar um erro NUNCA pode lançar/derrubar o app.

const fs = require('fs');
const path = require('path');

let logPath = null;
const MAX_BYTES = 1024 * 1024; // 1 MB → corta mantendo os mais recentes
const KEEP = 400;

function init(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    logPath = path.join(dir, 'errors.log');
  } catch (e) { logPath = null; }
}

// Serializa um contexto removendo campos sensíveis (senhas, tokens, cookies).
function redact(obj) {
  if (obj == null) return undefined;
  try {
    const s = JSON.stringify(obj, (k, v) => (/pass|senha|secret|token|cookie|password/i.test(k) ? '«oculto»' : v));
    if (!s) return undefined;
    return s.length > 1200 ? s.slice(0, 1200) + '…' : s;
  } catch (e) { return undefined; }
}

function log(entry) {
  if (!logPath || !entry) return;
  try {
    const rec = {
      ts: new Date().toISOString(),
      source: entry.source || 'app',
      message: String(entry.message || entry.error || 'erro desconhecido').slice(0, 600),
      stack: entry.stack ? String(entry.stack).split('\n').slice(0, 8).join('\n') : undefined,
      context: typeof entry.context === 'string' ? entry.context : redact(entry.context),
    };
    fs.appendFileSync(logPath, JSON.stringify(rec) + '\n');
    trimIfBig();
  } catch (e) { /* logging nunca pode quebrar o app */ }
}

function trimIfBig() {
  try {
    const st = fs.statSync(logPath);
    if (st.size <= MAX_BYTES) return;
    const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
    fs.writeFileSync(logPath, lines.slice(-KEEP).join('\n') + '\n');
  } catch (e) {}
}

function recent(n = 100) {
  if (!logPath || !fs.existsSync(logPath)) return [];
  try {
    const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
    return lines.slice(-n).map((l) => {
      try { return JSON.parse(l); } catch (e) { return { ts: '', source: 'parse', message: l }; }
    }).reverse();
  } catch (e) { return []; }
}

function clear() {
  try { if (logPath) fs.writeFileSync(logPath, ''); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; }
}

function filePath() { return logPath; }

module.exports = { init, log, recent, clear, filePath, redact };
