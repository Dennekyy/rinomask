'use strict';
// Gera MANIFEST.sha256: SHA-256 de cada arquivo de origem + um hash-raiz.
// Impressão digital verificável desta versão do código (prova de integridade/autoria).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const DIRS = ['electron', 'src', 'renderer', 'scripts'];
const FILES = ['package.json', 'README.md', 'LICENSE', 'AUTHORSHIP.md', '.gitignore', 'build/icon.ico'];
const SKIP = /node_modules|[\\/]dist[\\/]|\.map$/;

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (SKIP.test(full)) continue;
    if (e.isDirectory()) walk(full, out);
    else out.push(full);
  }
}

const files = [];
for (const d of DIRS) { const p = path.join(root, d); if (fs.existsSync(p)) walk(p, files); }
for (const f of FILES) { const p = path.join(root, f); if (fs.existsSync(p)) files.push(p); }

const rows = files
  .map((f) => ({ rel: path.relative(root, f).replace(/\\/g, '/'), hash: crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') }))
  .sort((a, b) => a.rel.localeCompare(b.rel));

const rootHash = crypto.createHash('sha256').update(rows.map((r) => r.hash).join('\n')).digest('hex');

const out = [
  '# RinoMask — MANIFEST.sha256 (impressão digital do código-fonte)',
  `# Titular: Dennekyy (https://github.com/Dennekyy)`,
  `# Gerado em: ${new Date().toISOString()}`,
  `# Arquivos: ${rows.length}`,
  `# HASH-RAIZ (SHA-256 de todos): ${rootHash}`,
  '#',
  ...rows.map((r) => `${r.hash}  ${r.rel}`),
  '',
].join('\n');

fs.writeFileSync(path.join(root, 'MANIFEST.sha256'), out);
console.log(`MANIFEST.sha256 gerado — ${rows.length} arquivos.`);
console.log('HASH-RAIZ:', rootHash);
