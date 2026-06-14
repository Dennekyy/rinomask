'use strict';
// Roda um script Node sob o ABI do Electron (necessário para módulos nativos como
// better-sqlite3 do camoufox-js). Uso: node scripts/_enode.js <script.js> [args...]
const { spawnSync } = require('node:child_process');
const electron = require('electron'); // caminho do electron.exe quando sob Node puro
const target = process.argv[2];
if (!target) { console.error('uso: node scripts/_enode.js <script> [args]'); process.exit(2); }
const r = spawnSync(electron, [target, ...process.argv.slice(3)], {
  stdio: 'inherit',
  // RINOMASK_HEADLESS=1: testes rodam sem abrir janelas no monitor do usuário.
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', RINOMASK_HEADLESS: process.env.RINOMASK_HEADLESS || '1' },
});
process.exit(r.status == null ? 1 : r.status);
