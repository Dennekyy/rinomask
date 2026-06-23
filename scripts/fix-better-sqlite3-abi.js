'use strict';
// better-sqlite3 (dependencia transitiva do camoufox-js, usada no sampler de WebGL) e
// instalado pelo npm contra o ABI do Node que roda o npm — mas o app roda sob o ABI do
// Electron, que e DIFERENTE (ex.: Node 22 portatil = ABI 127, Electron 31 = ABI 125).
// Isso quebra silenciosamente (so aparece como erro tecnico em runtime, ex.: ao abrir um
// perfil). Buscamos o prebuilt certo via prebuild-install, sem precisar compilar (sem
// Python/MSVC instalados nesta maquina).
const path = require('path');
const { execFileSync } = require('child_process');

if (process.platform !== 'win32') { console.log('[fix-better-sqlite3-abi] nao-Windows, ignorando.'); process.exit(0); }

const root = path.join(__dirname, '..');
const electronVersion = require(path.join(root, 'node_modules', 'electron', 'package.json')).version;
const prebuildInstall = path.join(root, 'node_modules', '.bin', 'prebuild-install.cmd');
const moduleDir = path.join(root, 'node_modules', 'better-sqlite3');

try {
  execFileSync(prebuildInstall, ['--runtime=electron', `--target=${electronVersion}`, '--arch=x64', '--platform=win32'], { cwd: moduleDir, stdio: 'inherit' });
  console.log(`[fix-better-sqlite3-abi] better-sqlite3 ajustado para Electron ${electronVersion}.`);
} catch (e) {
  console.warn('[fix-better-sqlite3-abi] nao foi possivel buscar o prebuilt para Electron — fingerprints podem falhar ao abrir perfis.');
  console.warn('[fix-better-sqlite3-abi] ' + (e && e.message));
}
